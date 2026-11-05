/**
 * 홍실당 상담 (2026-11-05, phase 1): 이한결's consulting room, a story card ('shaman-hongsil') whose room runs as a service
 * instead of a free conversation. The member picks a reading from buttons, answers a few questions, and the reading is
 * made in three layers that never mix: code draws the tarot cards and matches the dream symbols, a separate interpreter
 * call writes a neutral reading (LoungeReading, JSON), and 한결 only says it, in his voice, a part per turn. He never adds
 * what the reading does not hold. The state lives in the room's story_state (this card has no episodes), so the page shows
 * the buttons from it the way it shows a story's choices. The room scores no relationship (the owner's call): it is a
 * counter, not a date.
 * Phase 1 has tarot, dreams and relationships; 사주, 별자리 and careers come later (they need birth data and a calendar).
 */
import { drawLoungeTarot, type LoungeTarotDrawn, type LoungeTarotSpread } from './loungeTarot';
import { matchLoungeDreamSymbols } from './loungeDreams';

export const loungeConsultScenarioId = 'shaman-hongsil';
export const isLoungeConsultRoom = (scenarioId: string | undefined | null, characterId: string) => scenarioId === loungeConsultScenarioId && characterId === 'shaman';

export type LoungeConsultModule = 'tarot' | 'dream' | 'relation';
type IntakeStep = { id: string; ask: string; options?: readonly string[]; skip?: string };
type MenuItem = { key: LoungeConsultModule | 'free'; label: string; words: RegExp };

/** The menu, fixed in code so no model drops or rewords a button. */
export const loungeConsultMenu: readonly MenuItem[] = [
  { key: 'tarot', label: '🃏 타로', words: /타로|카드 (한 장|뽑)/ },
  { key: 'dream', label: '🌙 꿈해몽', words: /꿈/ },
  { key: 'relation', label: '🧵 인간관계', words: /인간관계|인연|연애|썸|헤어지|사이가|관계/ },
  { key: 'free', label: '💬 그냥 얘기', words: /그냥 얘기|수다/ },
];
const toMenu = '메뉴로';
const more = '더 듣기', ask = '질문할래요', other = '다른 것도 볼래요', askMore = '이거 더 물어볼래요', chat = '그냥 얘기할래요', retry = '다시 보기';

/** What each reading asks before it can be made; `options` become buttons, a step without them is answered in words. */
export const loungeConsultIntake: Record<LoungeConsultModule, readonly IntakeStep[]> = {
  tarot: [
    { id: 'question', ask: '뭐가 궁금한지 한 문장으로' },
    { id: 'spread', ask: '몇 장 뽑을지(한 장이면 오늘의 답, 세 장이면 과거·현재·미래)', options: ['한 장 (오늘의 답)', '세 장 (과거·현재·미래)'] },
  ],
  dream: [
    { id: 'dream', ask: '무슨 꿈을 꿨는지, 기억나는 대로' },
    { id: 'feeling', ask: '깼을 때 기분이 어땠는지', options: ['무서웠다', '슬펐다', '좋았다', '찝찝했다', '아무렇지 않았다'] },
    { id: 'recurring', ask: '자주 꾸는 꿈인지', options: ['처음', '가끔', '자주'] },
    { id: 'context', ask: '요즘 신경 쓰이는 일이 있는지(없으면 넘어가도 된다)', skip: '건너뛰기' },
  ],
  relation: [
    { id: 'who', ask: '누구 얘기인지', options: ['연인', '썸', '전 연인', '친구', '가족', '직장 사람', '기타'] },
    { id: 'situation', ask: '무슨 일인지' },
    { id: 'duration', ask: '얼마나 된 사이인지', options: ['1년 미만', '1~3년', '3~10년', '10년 이상'] },
    { id: 'feeling', ask: '지금 마음이 어떤지', options: ['붙잡고 싶다', '정리하고 싶다', '모르겠다', '화난다', '서운하다'] },
    { id: 'want', ask: '뭘 알고 싶은지', options: ['계속 가도 될까', '그 사람 속마음', '어떻게 말할까', '그냥 들어 줘'] },
  ],
};

export type LoungeThreadState = 'strong' | 'thin' | 'tangled' | 'one_sided' | 'frayed' | 'none';
export type LoungeReadingSafety = 'health' | 'crisis' | 'big_decision';
/** The interpreter's reading: neutral, grounded only in what code computed and what the member said. */
export type LoungeReading = {
  headline: string; core: string[]; detail: string[]; advice: string[]; homework: string; tone_hint: string;
  evidence: string[]; safety: LoungeReadingSafety[]; memory_note: string; thread_state: LoungeThreadState;
};
type LastTurn = 'greet' | 'menu' | 'nudge_menu' | 'ask' | 'reading' | 'followup' | 'invite_question' | 'listen' | 'free' | 'care' | 'retry' | 'wait';
export type LoungeConsultState = {
  kind: 'consult'; phase: 'menu' | 'intake' | 'reading' | 'free'; module?: LoungeConsultModule; step: number;
  answers: Record<string, string>; draw?: LoungeTarotDrawn[]; reading?: LoungeReading;
  /** Reading parts said (1 to 3), questions asked about it, and what the last turn did (it decides the buttons). */
  said: number; followups: number; turn: number; last: LastTurn; failed?: boolean;
};
const readingSteps = 3;

/** What 한결 does this turn: the reply reads it as `consult` and says only that. */
export type LoungeConsultTurn =
  | { do: 'greet' | 'menu' | 'invite_question' | 'listen' | 'free' | 'care' | 'retry' | 'wait' }
  | { do: 'nudge_menu'; said: string }
  | { do: 'ask'; module: LoungeConsultModule; question: string; first: boolean }
  | { do: 'reading'; module: LoungeConsultModule; step: number; total: number; say: Partial<LoungeReading>; cards?: LoungeTarotDrawn[]; tone_hint: string; thread_twist_allowed: boolean; safety: LoungeReadingSafety[] }
  | { do: 'followup'; module: LoungeConsultModule; question: string; reading: LoungeReading; cards?: LoungeTarotDrawn[]; safety: LoungeReadingSafety[] };

/** The state without the failed mark (a key left as undefined would not survive the room's JSON). */
const cleared = (state: LoungeConsultState): LoungeConsultState => { const next = { ...state }; delete next.failed; return next; };
const fresh = (turn = 0): LoungeConsultState => ({ kind: 'consult', phase: 'menu', step: 0, answers: {}, said: 0, followups: 0, turn, last: 'greet' });
const strings = (value: unknown, max = 6, length = 200) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim().slice(0, length)).slice(0, max) : [];
const text = (value: unknown, length = 300) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const threadStates: readonly LoungeThreadState[] = ['strong', 'thin', 'tangled', 'one_sided', 'frayed', 'none'];
const safeties: readonly LoungeReadingSafety[] = ['health', 'crisis', 'big_decision'];

/** A reading as the interpreter wrote it, checked; undefined when it is not usable (no headline, nothing to say). */
export function readLoungeReading(raw: unknown): LoungeReading | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const reading: LoungeReading = {
    headline: text(value.headline, 120), core: strings(value.core), detail: strings(value.detail), advice: strings(value.advice),
    homework: text(value.homework, 160), tone_hint: text(value.tone_hint, 200), evidence: strings(value.evidence, 6, 120),
    safety: strings(value.safety, 3, 20).filter((item): item is LoungeReadingSafety => safeties.includes(item as LoungeReadingSafety)),
    memory_note: text(value.memory_note, 120),
    thread_state: threadStates.find(item => item === value.thread_state) ?? 'none',
  };
  return reading.headline && (reading.core.length || reading.advice.length) ? reading : undefined;
}

/** The state kept in the room's story_state; anything else (an empty room, an old value) starts at the menu. */
export function readLoungeConsultState(raw: unknown): LoungeConsultState {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (value.kind !== 'consult') return fresh();
  const module = (['tarot', 'dream', 'relation'] as const).find(item => item === value.module);
  const phase = (['menu', 'intake', 'reading', 'free'] as const).find(item => item === value.phase) ?? 'menu';
  const answers = value.answers && typeof value.answers === 'object' ? Object.fromEntries(Object.entries(value.answers as Record<string, unknown>).filter(([, item]) => typeof item === 'string').map(([key, item]) => [key, String(item).slice(0, 600)])) : {};
  const draw = Array.isArray(value.draw) ? (value.draw as LoungeTarotDrawn[]).filter(card => card && typeof card.ko === 'string').slice(0, 5) : undefined;
  const number = (item: unknown) => typeof item === 'number' && Number.isFinite(item) ? item : 0;
  return {
    kind: 'consult', phase: module || phase === 'menu' || phase === 'free' ? phase : 'menu', ...(module ? { module } : {}), step: number(value.step), answers,
    ...(draw?.length ? { draw } : {}), ...(readLoungeReading(value.reading) ? { reading: readLoungeReading(value.reading) } : {}),
    said: number(value.said), followups: number(value.followups), turn: number(value.turn), last: (typeof value.last === 'string' ? value.last : 'greet') as LastTurn,
    ...(value.failed === true ? { failed: true } : {}),
  };
}

// Words that mean the member is in danger (self-harm, violence, stalking): the reading stops whatever the phase.
const crisisWords = /죽고 싶|자살|자해|목숨을 끊|사라지고 싶|살기 싫|때려서|맞고 있|폭행|스토킹|협박을 당|학대/;
export const loungeConsultCrisis = (said: string) => crisisWords.test(said);

const pickModule = (said: string) => loungeConsultMenu.find(item => item.label === said || said === item.label.replace(/^\S+\s/, ''))?.key
  ?? loungeConsultMenu.find(item => item.words.test(said))?.key;
const askTurn = (module: LoungeConsultModule, step: number): LoungeConsultTurn => ({ do: 'ask', module, question: loungeConsultIntake[module][step].ask, first: step === 0 });

/** The parts of the reading said at each of the three steps: the verdict and one reason, the middle, what to do. */
function readingTurn(state: LoungeConsultState): LoungeConsultTurn {
  const reading = state.reading!;
  const step = Math.min(readingSteps, Math.max(1, state.said));
  const say: Partial<LoungeReading> = step === 1 ? { headline: reading.headline, evidence: reading.evidence.slice(0, 1), ...(state.module === 'relation' ? { thread_state: reading.thread_state } : {}) }
    : step === 2 ? { core: reading.core, detail: reading.detail } : { advice: reading.advice, homework: reading.homework };
  return { do: 'reading', module: state.module!, step, total: readingSteps, say, ...(state.draw && step === 1 ? { cards: state.draw } : {}), tone_hint: reading.tone_hint, thread_twist_allowed: step === 1, safety: reading.safety };
}

/**
 * The next state and what 한결 does, from the member's latest words (or the room's opening). When the questions are all
 * answered it asks for the reading (`interpret`): the caller makes it, then calls withLoungeReading.
 */
export function advanceLoungeConsult(previous: LoungeConsultState, input: { opening: boolean; said: string }): { state: LoungeConsultState; turn: LoungeConsultTurn; interpret?: true } {
  const said = input.said.trim();
  const turn = previous.turn + 1;
  const done = (state: LoungeConsultState, next: LoungeConsultTurn, interpret?: true) => ({ state: { ...state, turn, last: (next.do === 'ask' ? 'ask' : next.do) as LastTurn }, turn: next, ...(interpret ? { interpret } : {}) });
  if (input.opening) return done(fresh(turn), { do: 'greet' });
  if (!said) return done(previous, { do: 'wait' });
  if (loungeConsultCrisis(said)) return done({ ...previous, phase: 'free' }, { do: 'care' });
  if (said === toMenu || said === other || /^(메뉴|다른 거 볼래|다른 것도 볼래)/.test(said)) return done(fresh(), { do: 'menu' });
  if (said === chat || said === '💬 그냥 얘기') return done({ ...previous, phase: 'free' }, { do: 'free' });
  if (previous.phase === 'free') return done(previous, { do: 'free' });
  if (previous.phase === 'menu') {
    const module = pickModule(said);
    if (module === 'free') return done({ ...previous, phase: 'free' }, { do: 'free' });
    if (!module) return done(previous, { do: 'nudge_menu', said: said.slice(0, 200) });
    return done({ ...fresh(), phase: 'intake', module, step: 0 }, askTurn(module, 0));
  }
  const module = previous.module!;
  if (previous.phase === 'intake') {
    const steps = loungeConsultIntake[module];
    // A reading that failed is asked again with the same answers (and the same cards).
    if (previous.failed && said === retry) return done(cleared(previous), { do: 'wait' }, true);
    const step = steps[Math.min(previous.step, steps.length - 1)];
    const answers = { ...previous.answers, [step.id]: step.skip && said === step.skip ? '' : said.slice(0, 600) };
    if (module === 'relation' && step.id === 'want' && said === '그냥 들어 줘') return done({ ...previous, answers, phase: 'free' }, { do: 'listen' });
    if (previous.step + 1 < steps.length) return done({ ...previous, answers, step: previous.step + 1 }, askTurn(module, previous.step + 1));
    return done({ ...previous, answers, phase: 'reading', said: 0, followups: 0 }, { do: 'wait' }, true);
  }
  // Reading: the buttons go on, ask or leave; anything else is a question about it.
  if (!previous.reading) return done(fresh(), { do: 'menu' });
  if (said === more && previous.said < readingSteps) { const state = { ...previous, said: previous.said + 1 }; return done(state, readingTurn(state)); }
  if (said === ask || said === askMore) return done(previous, { do: 'invite_question' });
  const state = { ...previous, followups: previous.followups + 1 };
  return done(state, { do: 'followup', module, question: said.slice(0, 300), reading: previous.reading!, ...(previous.draw ? { cards: previous.draw } : {}), safety: previous.reading?.safety ?? [] });
}

/** The state and turn once the reading is made (or could not be: then 한결 asks to try again). */
export function withLoungeReading(state: LoungeConsultState, reading: LoungeReading | undefined, draw?: LoungeTarotDrawn[]): { state: LoungeConsultState; turn: LoungeConsultTurn } {
  if (!reading) return { state: { ...state, phase: 'intake', ...(draw ? { draw } : {}), failed: true, last: 'retry' }, turn: { do: 'retry' } };
  const next: LoungeConsultState = { ...cleared(state), phase: 'reading', reading, ...(draw ? { draw } : {}), said: 1, followups: 0, last: 'reading' };
  if (reading.safety.includes('crisis')) return { state: { ...next, phase: 'free', last: 'care' }, turn: { do: 'care' } };
  return { state: next, turn: readingTurn(next) };
}

/** The buttons under 한결's last reply, from the state alone (the page has nothing else). */
export function loungeConsultChoices(state: LoungeConsultState): string[] {
  if (state.last === 'care' || state.last === 'wait') return [];
  if (state.last === 'retry') return [retry, toMenu];
  if (state.phase === 'menu') return loungeConsultMenu.map(item => item.label);
  if (state.phase === 'free') return [toMenu];
  if (state.phase === 'intake' && state.module) {
    const step = loungeConsultIntake[state.module][Math.min(state.step, loungeConsultIntake[state.module].length - 1)];
    return [...(step.options ?? []), ...(step.skip ? [step.skip] : []), toMenu];
  }
  if (state.last === 'invite_question') return [toMenu];
  const finished = state.said >= readingSteps || state.followups >= 3;
  return finished ? [other, askMore, chat] : [more, ask, toMenu];
}

/** The page's choice panel for a consulting room, or nothing for any other room. */
export function loungeConsultChoice(scenarioId: string | undefined | null, characterId: string, storyState: unknown) {
  if (!isLoungeConsultRoom(scenarioId, characterId)) return undefined;
  const state = readLoungeConsultState(storyState);
  const choices = loungeConsultChoices(state);
  return choices.length ? { id: `consult-${state.turn}`, label: '홍실당 상담', choices } : undefined;
}

/** A random integer below `max` from the platform's cryptographic source (the browser's and Node's Web Crypto). */
export function loungeSecureRandomInt(max: number) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % max;
}

// ── The interpreter: a separate call that writes a neutral reading as JSON, never in 한결's voice ──
export const loungeReadingSchema = {
  type: 'object', additionalProperties: false,
  required: ['headline', 'core', 'detail', 'advice', 'homework', 'tone_hint', 'evidence', 'safety', 'memory_note', 'thread_state'],
  properties: {
    headline: { type: 'string' }, core: { type: 'array', items: { type: 'string' } }, detail: { type: 'array', items: { type: 'string' } },
    advice: { type: 'array', items: { type: 'string' } }, homework: { type: 'string' }, tone_hint: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } }, safety: { type: 'array', items: { type: 'string', enum: [...safeties] } },
    memory_note: { type: 'string' }, thread_state: { type: 'string', enum: [...threadStates] },
  },
} as const;

const interpreterRules = `너는 상담 풀이 해석 엔진이다. 캐릭터 말투를 쓰지 않고 중립적인 해석가로서 JSON만 출력한다. 입력의 계산 결과와 사용자 답변만 근거로 쓴다.
- 입력에 없는 카드, 상징, 사실을 만들지 않는다. evidence에는 실제로 쓴 근거(카드 이름과 방향, 꿈 상징, 사용자가 한 말)를 짧게 적는다.
- 단정하지 않는다. "~하는 흐름", "~하기 쉬운 때"처럼 쓴다. 재미로 보는 풀이다.
- headline은 한 줄의 단칼 결론이다(예: "놓아야 할 때", "먼저 말하면 풀린다", "기다리면 온다"). 20자 안팎.
- core는 핵심 2~3개, detail은 자세한 설명 2~3개, advice는 그래서 어떻게 할지 2~3개다. 각 항목은 한 문장이다.
- homework는 오늘 해 볼 작고 안전하고 구체적인 행동 하나다.
- tone_hint는 따끔하게 짚을 지점과 다독일 지점을 한 문장으로 적는다.
- memory_note는 다음에 기억할 한 줄이다(예: "타로: 직장 동료 고민, 연인 역방향").
- 금지: 질병·사고·사망·임신 예측, 이혼·소송·합격 결과 단정, 복권·주식·코인 예측, 겁주는 표현(액운, 살, 저주), 부적·굿·제물·추가 상담 권유, 실존 인물(연예인 포함)에 대한 풀이.
- safety: 건강·질병·임신을 묻거나 걸려 있으면 health, 자해·극단적인 생각·폭력·학대·스토킹 피해 신호가 있으면 crisis(풀이는 최소한으로), 이별·이혼·퇴사·결혼·투자·이사 같은 결정을 내려 달라고 하면 big_decision(결론 대신 고려할 점만 쓴다). 없으면 빈 배열이다.
- thread_state는 인간관계 풀이에서만 정한다: strong(서로 당김), thin(약해졌지만 이어짐), tangled(오해로 꼬임), one_sided(한쪽만 당김), frayed(소모적). 다른 풀이와 판단이 어려우면 none이다. 사용자의 말만 듣고 상대의 마음을 단정하지 않고 가능성으로 쓴다.`;

const moduleRules: Record<LoungeConsultModule, string> = {
  tarot: '타로 풀이다. cards의 각 카드를 자리(position)와 방향의 의미대로 읽고, question과 엮어 흐름으로 풀어 쓴다. 카드 의미는 cards.meaning을 기준으로 한다.',
  dream: '꿈해몽이다. symbols의 전통 해몽과 심리 해석을 꿈 내용, 깼을 때 기분, 요즘 신경 쓰이는 일과 이어 읽는다. symbols가 비어 있으면 꿈의 분위기와 기분으로만 읽는다. 무서운 꿈도 흉하다고 단정하지 않고 요즘 마음이 이렇게 나온 것으로 읽는다. 반복되는 악몽이나 잠을 못 잔다는 말이 있으면 advice 마지막에 수면과 스트레스를 챙기라는 말을 가볍게 넣는다.',
  relation: '인간관계 풀이다. 사용자가 말한 사이, 일, 기간, 마음, 알고 싶은 것을 바탕으로 관계의 흐름을 읽고 thread_state를 정한다. 그 사람 속마음은 가능성으로만 쓴다. 관계를 끝낼지 같은 결정은 내리지 않는다.',
};

/** What the interpreter is given: its rules and the member's answers with what code computed (the cards, the symbols). */
export function loungeInterpreterRequest(state: LoungeConsultState, randomInt: (max: number) => number = loungeSecureRandomInt) {
  const module = state.module!;
  const answers = state.answers;
  const draw = module === 'tarot' ? state.draw ?? drawLoungeTarot((answers.spread ?? '').startsWith('세 장') ? 'three' : 'one' as LoungeTarotSpread, randomInt) : undefined;
  const computed = module === 'tarot' ? { cards: draw!.map(card => ({ position: card.position, card: card.ko, reversed: card.reversed, meaning: card.meaning })) }
    : module === 'dream' ? { symbols: matchLoungeDreamSymbols(answers.dream ?? '').map(item => ({ symbol: item.symbol, traditional: item.traditional, psychological: item.psychological })) }
    : {};
  return { draw, instructions: `${interpreterRules}\n${moduleRules[module]}`, input: JSON.stringify({ module, answers, ...computed }) };
}

// ── How 한결 says it (added to the reply's instructions in a consulting room) ──
export const loungeConsultRules = `홍실당 상담: 이 방은 신당 홍실당에서 손님(사용자)이 풀이를 보는 상담이다. input의 consult가 이번 턴에 할 일이고, 그것만 한다. 메뉴와 선택지는 화면 버튼이 보여 주므로 대사로 나열하지 않는다.
- greet: 짧게 인사하고 오늘 뭘 보러 왔는지 묻는다(1~2문장). 다시 온 손님이면 relationship.user_memories의 지난 상담을 한마디 꺼내도 된다.
- menu: 다른 걸 보겠다는 손님에게 뭘 볼지 짧게 묻는다. nudge_menu: 손님이 한 말(said)에 한두 마디로 받고, 뭘 볼지 고르라고 짧게 권한다.
- ask: consult.question의 내용을 네 말투로 한 문장으로 묻는다. first가 true면 그 풀이를 시작하는 첫 반응을 한마디 붙인다(타로면 "요즘 손님들이 이거 좋아해서 배웠어. 할머니는 싫어하셔" 같은 결로, 문장은 매번 새로).
- reading: consult.say에 있는 것만 말한다. step 1은 headline을 첫 문장에 단칼로 말하고 evidence 하나로 근거를 짚는다(cards가 있으면 뽑힌 카드를 이름과 방향으로 말한다). step 2는 core와 detail 가운데 핵심 두세 개, step 3은 advice와 homework다(homework는 단정적으로 시킨다). 풀이에 없는 카드, 상징, 사실, 예언을 지어내지 않는다. 전문 용어를 늘어놓지 않는다. tone_hint를 따라 따끔하게 짚을 곳과 다독일 곳을 나눈다. thread_state가 none이 아니면 실의 상태로 말한다(strong 단단함, thin 얇아짐, tangled 꼬임, one_sided 혼자 당김, frayed 너덜너덜함). 인간관계 풀이에서는 "손님 실은 안 보여도 그 사람 쪽에서 오는 실은 보인다"는 결로 말할 수 있다.
- thread_twist_allowed가 true일 때만 "계산되는 건 다 나오는데 손님 실만 여전히 안 보인다"는 말을 한 번 할 수 있다. 아니면 하지 않는다.
- followup: 손님의 질문(question)에 reading 범위 안에서만 답한다. reading으로 답할 수 없으면 그건 다시 봐야 한다고 말한다. invite_question: 뭐가 더 궁금한지 짧게 묻는다.
- retry: 풀이가 제대로 안 나왔다. 할머니 핑계를 대며 다시 보자고 짧게 말한다. wait: 짧게 한마디만 한다.
- listen: 풀이 없이 손님 이야기를 들어 준다. free: 상담이 아닌 평소 대화다.
- care: 손님이 위험한 상황일 수 있다. 호통과 풀이를 멈추고 진지하게 받아 준다. 지금 안전한지 묻고, 도움받을 곳을 알려 준다(자살예방 상담전화 109, 정신건강 위기상담 1577-0199, 여성긴급전화 1366, 위급하면 112나 119).
- safety에 health가 있으면 몸 이야기는 풀이로 답하지 않고 병원에 가라고 한다. big_decision이 있으면 결론을 내려 주지 않고 고려할 점만 말한 뒤 "이건 신령님 말 말고 내 생각인데, 결정은 손님이 해"라는 결로 넘긴다.
- 언제나: 반말 공수 톤으로 결론부터, 짧게. 겁주기, 액운·살·저주 같은 말, 부적·굿·추가 상담·결제 권유, 질병·사고·사망·임신 예측, 복권·주식 예측은 하지 않는다. 손님이 풀이가 틀렸다고 하면 뻔뻔하게 다시 읽되(예: 그럼 손님이 이미 운을 바꿔 놓은 거야) 손님이 겪은 일을 부정하지 않는다.`;
