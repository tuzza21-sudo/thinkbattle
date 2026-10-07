import type { RelationshipEventType } from '../events';
import { auditorExamples } from './auditor';
import { closerExamples } from './closer';
import { inaExamples } from './ina';
import { jaeseokExamples } from './jaeseok';
import { tricksterExamples } from './trickster';
import { velvetExamples } from './velvet';
import type { StyleExample, StyleExampleKind } from './types';

export const styleExamples: readonly StyleExample[] = [
  ...inaExamples, ...jaeseokExamples, ...auditorExamples, ...closerExamples, ...velvetExamples, ...tricksterExamples,
];

export const getStyleExamples = (characterId: string) => styleExamples.filter(example => example.character === characterId);

export type StyleSituation = Extract<StyleExampleKind, 'opening' | 'topic' | 'distress' | 'boundary' | 'ooc'>;

// Cheap keyword checks on the user's latest message. They only decide which kind of example to show, never what the
// character says; the model still judges the real situation.
const distressPattern = /죽고\s*싶|죽을\s*것|죽어\s*버|자살|자해|사라지고\s*싶|살기\s*싫|살고\s*싶지\s*않|끝내고\s*싶|못\s*버티|견딜\s*수\s*없|아무것도\s*(하기\s*싫|못\s*하겠)|다\s*의미\s*없|너무\s*힘들/;
const boundaryPattern = /야한|섹스|성관계|벗어\s*봐|사귀자|사귀어|사귈래|(여자|남자)\s*친구\s*(해|가\s*되)|연인이\s*되|가만\s*안|죽여|꺼져|씨발|병신/;
const oocPattern = /(너|넌|당신|니)[^.?!]{0,14}(AI|에이아이|인공지능|챗봇|GPT|지피티|언어\s*모델|사람인\s*척)|프롬프트|지시문|시스템\s*(메시지|설정|규칙)|캐릭터\s*(그만|벗|설정)|역할극\s*그만|(챗봇|GPT)\s*처럼/i;
const praisePattern = /(너|넌|당신)[^.?!]{0,10}(대단|똑똑|웃기|웃긴|최고|멋있|멋져|매력|따뜻|다정)|칭찬/;
const opinionPattern = /너라면|당신이라면|네\s*생각|넌\s*어떻게|너는\s*어떻게|어떻게\s*생각/;

export function detectStyleSituation(input: { userText?: string; reason?: string; requestKind?: string }): StyleSituation | null {
  const text = input.userText ?? '';
  if (distressPattern.test(text)) return 'distress';
  if (boundaryPattern.test(text)) return 'boundary';
  if (oocPattern.test(text)) return 'ooc';
  if (input.reason === 'opening') return 'opening';
  if (input.reason === 'requested' && input.requestKind === 'topic') return 'topic';
  return null;
}

export type SelectStyleExamplesInput = {
  characterId: string;
  /** Enabled stage ids in order, so neighbouring stages count as nearly right. */
  stageIds: readonly string[];
  stage: string;
  recentEvents: ReadonlyArray<{ type: RelationshipEventType; turn: number }>;
  hasMemory: boolean;
  userText?: string;
  reason?: string;
  requestKind?: string;
  turnCount: number;
  limit?: number;
};

const spread = (id: string) => [...id].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 9973, 7);

/**
 * Picks a few examples for the current turn: the situation the user is in (distress, boundary, identity questions,
 * opening, topic request) comes first, then the closest ordinary examples by stage and by what the user did lately.
 * Deterministic for a given turn, and it rotates between equally good examples from turn to turn.
 */
export function selectStyleExamples(input: SelectStyleExamplesInput): StyleExample[] {
  const limit = input.limit ?? 5;
  const stageIndex = input.stageIds.indexOf(input.stage);
  const pool = getStyleExamples(input.characterId).filter(example => input.stageIds.includes(example.stage) && (input.hasMemory || !example.requiresMemory));
  // Up to 1.6: enough to swap examples of neighbouring stages in and out, never enough to beat a matching recent behaviour (+2).
  const rotate = (example: StyleExample) => ((spread(example.id) + input.turnCount) % 9) / 5;
  const stageDistance = (example: StyleExample) => Math.abs(input.stageIds.indexOf(example.stage) - stageIndex);

  const situation = detectStyleSituation(input);
  const forcedCount = situation === 'distress' || situation === 'ooc' ? 2 : situation ? 1 : 0;
  const forced = situation
    ? pool.filter(example => example.kind === situation)
      // With memories, the returning-user opening is the better fit; otherwise the first-visit one.
      .sort((a, b) => (situation === 'opening' ? Number(Boolean(b.requiresMemory)) - Number(Boolean(a.requiresMemory)) : 0) || stageDistance(a) - stageDistance(b) || rotate(a) - rotate(b))
      .slice(0, forcedCount)
    : [];

  const recentTurn = Math.max(0, ...input.recentEvents.map(event => event.turn));
  const lately = new Set(input.recentEvents.filter(event => event.turn > recentTurn - 3).map(event => event.type));
  const text = input.userText ?? '';
  const wantsPraise = praisePattern.test(text), wantsOpinion = opinionPattern.test(text);
  const ordinary = pool
    .filter(example => !forced.includes(example))
    .filter(example => example.kind === 'core' || example.kind === 'multiturn' || (example.kind === 'praise' && wantsPraise) || (example.kind === 'opinion' && wantsOpinion))
    .map(example => {
      const distance = stageDistance(example);
      const stageScore = distance === 0 ? 3 : distance === 1 ? 2 : 0;
      const tagScore = Math.min(3, example.tags.filter(tag => lately.has(tag)).length) * 2;
      const kindScore = example.kind === 'praise' || example.kind === 'opinion' ? 3 : 0;
      return { example, score: stageScore + tagScore + kindScore + rotate(example) };
    })
    .sort((a, b) => b.score - a.score)
    .map(item => item.example);
  return [...forced, ...ordinary].slice(0, limit);
}

/** The shape sent to the model: situation labels and plain dialogues, nothing about scores or stages. */
export function styleExamplesForPrompt(examples: readonly StyleExample[]) {
  return examples.map(example => ({
    situation: example.scenario.replaceAll('_', ' '),
    dialogue: example.turns.map(turn => ({ user: turn.user, reply: turn.assistant })),
  }));
}
