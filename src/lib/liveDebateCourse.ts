import { getDebateSteps } from './debateEngine';
import type { DebateLevel, DebatePosition, DebateRoundId, DebateStageId, DebateStep, LiveDebateArgument } from '../types';

export type LiveDebatePhase = {
  id: string;
  label: string;
  position: DebatePosition;
  targetPosition?: DebatePosition;
  roundId: DebateRoundId;
  seconds: number;
  purpose?: string;
  instruction: string;
  tasks: string[];
  checklist: string[];
  sentenceFrames: string[];
  inputPlaceholder: string;
};

export type LiveDebateArgumentTiming = {
  recommendedSeconds: number;
  elapsedSeconds: number;
  overtimeSeconds: number;
};

export type LiveDebateProgress = {
  completedPhaseCount: number;
  activePhaseStartedAtMs: number;
  argumentTimingById: Record<string, LiveDebateArgumentTiming>;
};

type PhaseTemplate = {
  id: string;
  position: DebatePosition;
  targetPosition?: DebatePosition;
  stepId: string;
  title: string;
};

export type LiveDebateStageOption = {
  id: DebateStageId;
  label: string;
  description: string;
};

const stageOptions: Record<DebateStageId, LiveDebateStageOption> = {
  opening: { id: 'opening', label: '입론', description: '핵심 주장·이유·근거 제시' },
  question: { id: 'question', label: '질문', description: '상대 논리의 전제와 빈틈 질문' },
  answer: { id: 'answer', label: '질문 답변', description: '상대 질문에 직접 답변' },
  analysis: { id: 'analysis', label: '상대 전제 분석', description: '상대 주장의 핵심 전제 분석' },
  rebuttal: { id: 'rebuttal', label: '반박', description: '상대 주장과 근거를 직접 반박' },
  weighing: { id: 'weighing', label: '중요성 비교', description: '핵심 충돌과 영향의 중요성 비교' },
  closing: { id: 'closing', label: '최종발언', description: '쟁점을 정리하고 최종 입장 제시' },
};

export const getLiveDebateStageOptions = (level: DebateLevel): LiveDebateStageOption[] => {
  const ids: DebateStageId[] = level === 'intermediate'
    ? ['opening', 'question', 'answer', 'analysis', 'rebuttal', 'weighing', 'closing']
    : ['opening', 'question', 'answer', 'rebuttal', 'closing'];
  return ids.map(id => stageOptions[id]);
};

export const getLiveDebateStageId = (phase: Pick<LiveDebatePhase, 'id'>): DebateStageId => {
  const stageId = phase.id.replace(/^(affirmative|negative)-/, '');
  return (stageId === 'opening' || stageId === 'question' || stageId === 'answer'
    || stageId === 'analysis' || stageId === 'rebuttal' || stageId === 'weighing'
    || stageId === 'closing') ? stageId : 'rebuttal';
};

const positionLabel = (position: DebatePosition) => position === 'affirmative' ? '찬성' : '반대';
const humanize = (value = '') => value
  .replaceAll('AI가', '상대측이')
  .replaceAll('AI는', '상대측은')
  .replaceAll('AI의', '상대측의')
  .replaceAll('AI를', '상대측을')
  .replaceAll('AI에게', '상대측에게')
  .replaceAll('AI', '상대측');
const humanizeList = (values?: string[]) => (values ?? []).map(humanize);

const getTemplates = (level: DebateLevel): PhaseTemplate[] => {
  const prefix = level === 'intermediate' ? 'intermediate' : 'beginner';
  const shared: PhaseTemplate[] = [
    { id: 'affirmative-opening', position: 'affirmative', stepId: `${prefix}-opening-user`, title: '입론' },
    { id: 'negative-opening', position: 'negative', stepId: `${prefix}-opening-user`, title: '입론' },
    { id: 'affirmative-question', position: 'affirmative', targetPosition: 'negative', stepId: `${prefix}-cross-question-user`, title: level === 'intermediate' ? '교차질문' : '질문' },
    { id: 'negative-answer', position: 'negative', targetPosition: 'affirmative', stepId: `${prefix}-cross-question-answer-user`, title: level === 'intermediate' ? '교차질문 답변' : '질문 답변' },
    { id: 'negative-question', position: 'negative', targetPosition: 'affirmative', stepId: `${prefix}-cross-question-user`, title: level === 'intermediate' ? '교차질문' : '질문' },
    { id: 'affirmative-answer', position: 'affirmative', targetPosition: 'negative', stepId: `${prefix}-cross-question-answer-user`, title: level === 'intermediate' ? '교차질문 답변' : '질문 답변' },
  ];

  if (level === 'intermediate') {
    shared.push(
      {
        id: 'affirmative-analysis',
        position: 'affirmative',
        stepId: 'intermediate-opponent-summary-user',
        title: '상대 전제 분석',
      },
      {
        id: 'negative-analysis',
        position: 'negative',
        stepId: 'intermediate-opponent-summary-user',
        title: '상대 전제 분석',
      },
    );
  }

  shared.push(
    { id: 'affirmative-rebuttal', position: 'affirmative', stepId: `${prefix}-rebuttal-user`, title: '반박' },
    { id: 'negative-rebuttal', position: 'negative', stepId: `${prefix}-rebuttal-user`, title: '반박' },
  );

  if (level === 'intermediate') {
    shared.push(
      { id: 'affirmative-weighing', position: 'affirmative', stepId: 'intermediate-clash-weighing-user', title: '충돌 지점·중요성 비교' },
      { id: 'negative-weighing', position: 'negative', stepId: 'intermediate-clash-weighing-user', title: '충돌 지점·중요성 비교' },
    );
  }

  shared.push(
    {
      id: 'affirmative-closing',
      position: 'affirmative',
      stepId: level === 'intermediate' ? 'intermediate-closing-user' : 'beginner-weighing-user',
      title: level === 'intermediate' ? '최종 입장 확인' : '최종변론',
    },
    {
      id: 'negative-closing',
      position: 'negative',
      stepId: level === 'intermediate' ? 'intermediate-closing-user' : 'beginner-weighing-user',
      title: level === 'intermediate' ? '최종 입장 확인' : '최종변론',
    },
  );
  return shared;
};

const allocateDurations = (steps: DebateStep[], totalSeconds: number) => {
  const weights = steps.map(step => Math.max(30, step.recommendedDurationSeconds ?? 60));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let allocated = 0;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return Math.max(0, totalSeconds - allocated);
    const seconds = Math.max(20, Math.round((totalSeconds * weight / totalWeight) / 5) * 5);
    allocated += seconds;
    return seconds;
  });
};

export const getLiveDebateCourse = (
  totalSeconds: number,
  level: DebateLevel = 'beginner',
): LiveDebatePhase[] => {
  const normalizedLevel: DebateLevel = level === 'intermediate' ? 'intermediate' : 'beginner';
  const steps = getDebateSteps(normalizedLevel);
  const templates = getTemplates(normalizedLevel);
  const matchedSteps = templates.map(template => (
    steps.find(step => step.id === template.stepId) ?? steps[0]
  ));
  const durations = allocateDurations(matchedSteps, totalSeconds);

  return templates.map((template, index) => {
    const step = matchedSteps[index];
    return {
      id: template.id,
      label: `${positionLabel(template.position)} ${template.title}`,
      position: template.position,
      targetPosition: template.targetPosition,
      roundId: step.roundId,
      seconds: durations[index],
      purpose: humanize(step.purpose),
      instruction: humanize(step.instruction),
      tasks: humanizeList(step.tasks),
      checklist: humanizeList(step.checklist),
      sentenceFrames: humanizeList(step.sentenceFrames),
      inputPlaceholder: humanize(step.inputPlaceholder || `${template.title} 내용을 입력하세요.`),
    };
  });
};

/**
 * A live phase is complete only after the assigned speaker's argument for that
 * phase has been registered. Phase durations are recommendations, not cutoffs.
 */
export const getLiveDebateProgress = (
  phases: LiveDebatePhase[],
  argumentsList: LiveDebateArgument[],
  startedAtMs: number,
): LiveDebateProgress => {
  const orderedArguments = [...argumentsList]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const safeStartedAtMs = Number.isFinite(startedAtMs) ? startedAtMs : 0;
  const argumentTimingById: Record<string, LiveDebateArgumentTiming> = {};
  let argumentCursor = 0;
  let phaseStartedAtMs = safeStartedAtMs;
  let completedPhaseCount = 0;

  for (const phase of phases) {
    const relativeIndex = orderedArguments
      .slice(argumentCursor)
      .findIndex(argument => argument.phaseId === phase.id);
    if (relativeIndex < 0) break;

    const argumentIndex = argumentCursor + relativeIndex;
    const argument = orderedArguments[argumentIndex];
    const parsedCompletedAtMs = Date.parse(argument.createdAt);
    const completedAtMs = Number.isFinite(parsedCompletedAtMs)
      ? Math.max(phaseStartedAtMs, parsedCompletedAtMs)
      : phaseStartedAtMs;
    const elapsedSeconds = Math.max(0, Math.floor((completedAtMs - phaseStartedAtMs) / 1000));
    argumentTimingById[argument.id] = {
      recommendedSeconds: phase.seconds,
      elapsedSeconds,
      overtimeSeconds: Math.max(0, elapsedSeconds - phase.seconds),
    };
    completedPhaseCount += 1;
    phaseStartedAtMs = completedAtMs;
    argumentCursor = argumentIndex + 1;
  }

  return {
    completedPhaseCount,
    activePhaseStartedAtMs: phaseStartedAtMs,
    argumentTimingById,
  };
};
