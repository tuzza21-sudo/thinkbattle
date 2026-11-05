/**
 * 홍실당 상담: 이한결's consulting room, a story card ('shaman-hongsil'). Since 2026-11-05 (second version, the owner's
 * call) the room is a conversation first: the member says what is on their mind in their own words and 한결 answers as
 * the shaman he is. What needs a form starts from the 홍실당 button under the conversation, which blinks red when it is
 * the moment to use it: tarot (the question and how many cards, then the member picks them from a shuffled deck) and
 * 사주 (the birth date, time and what to look at). A dream told in the conversation is read without any button.
 *
 * A reading is made in three layers that never mix: code shuffles and deals the cards, computes the 사주 chart
 * (loungeSaju.ts, server only) and matches the dream symbols; a separate interpreter call writes a neutral reading
 * (LoungeReading, JSON); and 한결 only says it, in his voice. He never adds what the reading does not hold. The state lives
 * in the room's story_state (this card has no episodes). The room scores no relationship: it is a counter, not a date.
 */
import { drawLoungeTarot, loungeTarotFromPicks, loungeTarotPositions, shuffleLoungeTarot, type LoungeTarotDrawn, type LoungeTarotSpread } from './loungeTarot';
import { matchLoungeDreamSymbols } from './loungeDreams';

export const loungeConsultScenarioId = 'shaman-hongsil';
export const isLoungeConsultRoom = (scenarioId: string | undefined | null, characterId: string) => scenarioId === loungeConsultScenarioId && characterId === 'shaman';

export type LoungeConsultModule = 'tarot' | 'dream' | 'saju';
/** What the page sends once the member has picked cards; the numbers are places in the face-down deck. */
export const loungeTarotPickPrefix = '🃏 고른 카드: ';
export const loungeTarotDrawForMe = '그냥 뽑아 줘';
/** The tarot form, sent as the member's message: "🃏 타로 · 세 장 · <question>". */
export const loungeTarotFormPrefix = '🃏 타로 · ';
export const loungeTarotSpreadLabels: Record<LoungeTarotSpread, string> = { one: '한 장', three: '세 장' };
/** The 사주 form, sent as the member's message: "🔮 사주 · 1990-05-03 양력 · 14:30 · 여성 · 올해 흐름 · 질문: ...". */
export const loungeSajuFormPrefix = '🔮 사주 · ';
export const loungeSajuCalendars = { solar: '양력', lunar: '음력', lunar_leap: '음력 윤달' } as const;
export const loungeSajuGenders = { female: '여성', male: '남성', none: '밝히지 않음' } as const;
export const loungeSajuFocuses = ['타고난 성격', '연애', '일과 돈', '올해 흐름', '전부'] as const;
export type LoungeSajuInput = { date: string; calendar: keyof typeof loungeSajuCalendars; time?: string; gender: keyof typeof loungeSajuGenders; focus: string; question?: string };

/** The tarot form as a message. */
export const loungeTarotFormText = (spread: LoungeTarotSpread, question: string) => `${loungeTarotFormPrefix}${loungeTarotSpreadLabels[spread]} · ${question.replace(/\s+/g, ' ').trim().slice(0, 300)}`;
/** The 사주 form as a message (the member sees exactly what they sent). */
export const loungeSajuFormText = (input: LoungeSajuInput) => [
  `${loungeSajuFormPrefix}${input.date} ${loungeSajuCalendars[input.calendar]}`, input.time ?? '시간 모름', loungeSajuGenders[input.gender], input.focus,
  ...(input.question?.trim() ? [`질문: ${input.question.replace(/\s+/g, ' ').trim().slice(0, 200)}`] : []),
].join(' · ');

/** The tarot form read back from the message, or undefined. */
export function readLoungeTarotForm(said: string): { spread: LoungeTarotSpread; question: string } | undefined {
  if (!said.startsWith(loungeTarotFormPrefix)) return undefined;
  const [count, ...rest] = said.slice(loungeTarotFormPrefix.length).split(' · ');
  const spread = (Object.keys(loungeTarotSpreadLabels) as LoungeTarotSpread[]).find(key => loungeTarotSpreadLabels[key] === count.trim());
  const question = rest.join(' · ').trim();
  return spread && question ? { spread, question: question.slice(0, 300) } : undefined;
}

/** The 사주 form read back from the message, or undefined when the date is not a real one between 1900 and 2049. */
export function readLoungeSajuForm(said: string): LoungeSajuInput | undefined {
  if (!said.startsWith(loungeSajuFormPrefix)) return undefined;
  const parts = said.slice(loungeSajuFormPrefix.length).split(' · ').map(part => part.trim());
  const [dateAndCalendar, time, gender, focus, ...rest] = parts;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (.+)$/.exec(dateAndCalendar ?? '');
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const calendar = (Object.keys(loungeSajuCalendars) as Array<keyof typeof loungeSajuCalendars>).find(key => loungeSajuCalendars[key] === match[4]);
  const genderKey = (Object.keys(loungeSajuGenders) as Array<keyof typeof loungeSajuGenders>).find(key => loungeSajuGenders[key] === gender);
  const real = new Date(Date.UTC(year, month - 1, day));
  const lunarDay = calendar !== 'solar' && month >= 1 && month <= 12 && day >= 1 && day <= 30;
  if (!calendar || !genderKey || year < 1900 || year > 2049 || !(lunarDay || (real.getUTCMonth() === month - 1 && real.getUTCDate() === day))) return undefined;
  const clock = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time ?? '');
  const question = rest.join(' · ').replace(/^질문:\s*/, '').trim();
  return { date: match[1] + '-' + match[2] + '-' + match[3], calendar, ...(clock ? { time: clock[0] } : {}), gender: genderKey, focus: loungeSajuFocuses.find(item => item === focus) ?? '전부', ...(question ? { question: question.slice(0, 200) } : {}) };
}

export type LoungeReadingSafety = 'health' | 'crisis' | 'big_decision';
/** The interpreter's reading: neutral, grounded only in what code computed and what the member said. */
export type LoungeReading = {
  headline: string; core: string[]; detail: string[]; advice: string[]; homework: string; tone_hint: string;
  evidence: string[]; safety: LoungeReadingSafety[]; memory_note: string;
};
type LastTurn = 'greet' | 'chat' | 'ask_pick' | 'reading' | 'care' | 'retry' | 'wait';
export type LoungeConsultState = {
  kind: 'consult';
  /** chat is the conversation; tarot_pick waits for the cards the member picks. */
  phase: 'chat' | 'tarot_pick';
  module?: LoungeConsultModule; answers: Record<string, string>;
  /** The deck laid face down for this reading (card ids in a shuffled order), the cards drawn, and their reading. */
  deck?: string[]; draw?: LoungeTarotDrawn[]; reading?: LoungeReading;
  /** Turns since the last reading: for a while, what the member says next is answered from it. */
  since: number; turn: number; last: LastTurn;
  /** The 홍실당 button blinks: the member is new, or just asked about tarot or 사주. */
  hint?: true;
};
/** How many turns after a reading the conversation still answers from it. */
const readingLasts = 6;

/** What 한결 does this turn: the reply reads it as `consult` and keeps to it. */
export type LoungeConsultTurn =
  | { do: 'greet' | 'care' | 'wait' }
  | { do: 'ask_pick'; question: string; count: number }
  | { do: 'retry'; module: LoungeConsultModule }
  | { do: 'chat'; reading?: LoungeReading; cards?: LoungeTarotDrawn[]; suggest?: true }
  | { do: 'reading'; module: LoungeConsultModule; reading: LoungeReading; cards?: LoungeTarotDrawn[] };

const fresh = (turn = 0): LoungeConsultState => ({ kind: 'consult', phase: 'chat', answers: {}, since: readingLasts, turn, last: 'greet' });
const strings = (value: unknown, max = 6, length = 400) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim().slice(0, length)).slice(0, max) : [];
const text = (value: unknown, length = 300) => typeof value === 'string' ? value.trim().slice(0, length) : '';
const safeties: readonly LoungeReadingSafety[] = ['health', 'crisis', 'big_decision'];

/** A reading as the interpreter wrote it, checked; undefined when it is not usable (no headline, nothing to say). */
export function readLoungeReading(raw: unknown): LoungeReading | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const reading: LoungeReading = {
    headline: text(value.headline, 120), core: strings(value.core), detail: strings(value.detail), advice: strings(value.advice),
    homework: text(value.homework, 160), tone_hint: text(value.tone_hint, 200), evidence: strings(value.evidence, 8, 120),
    safety: strings(value.safety, 3, 20).filter((item): item is LoungeReadingSafety => safeties.includes(item as LoungeReadingSafety)),
    memory_note: text(value.memory_note, 120),
  };
  return reading.headline && (reading.core.length || reading.advice.length) ? reading : undefined;
}

/** The state kept in the room's story_state; anything else (an empty room, an old value) starts a conversation. */
export function readLoungeConsultState(raw: unknown): LoungeConsultState {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  if (value.kind !== 'consult') return fresh();
  const module = (['tarot', 'dream', 'saju'] as const).find(item => item === value.module);
  const answers = value.answers && typeof value.answers === 'object' ? Object.fromEntries(Object.entries(value.answers as Record<string, unknown>).filter(([, item]) => typeof item === 'string').map(([key, item]) => [key, String(item).slice(0, 600)])) : {};
  const draw = Array.isArray(value.draw) ? (value.draw as LoungeTarotDrawn[]).filter(card => card && typeof card.ko === 'string' && typeof card.id === 'string').slice(0, 5) : undefined;
  const deck = Array.isArray(value.deck) ? value.deck.filter((id): id is string => typeof id === 'string').slice(0, 78) : [];
  const number = (item: unknown, otherwise = 0) => typeof item === 'number' && Number.isFinite(item) ? item : otherwise;
  const reading = readLoungeReading(value.reading);
  const lasts: readonly LastTurn[] = ['greet', 'chat', 'ask_pick', 'reading', 'care', 'retry', 'wait'];
  return {
    kind: 'consult', phase: value.phase === 'tarot_pick' && module === 'tarot' && deck.length === 78 ? 'tarot_pick' : 'chat', ...(module ? { module } : {}), answers,
    ...(deck.length === 78 ? { deck } : {}), ...(draw?.length ? { draw } : {}), ...(reading ? { reading } : {}),
    since: number(value.since, readingLasts), turn: number(value.turn), last: lasts.find(item => item === value.last) ?? 'chat',
    ...(value.hint === true ? { hint: true } : {}),
  };
}

// Words that mean the member is in danger (self-harm, violence, stalking): readings stop whatever the phase.
const crisisWords = /죽고 싶|자살|자해|목숨을 끊|사라지고 싶|살기 싫|때려서|맞고 있|폭행|스토킹|협박을 당|학대/;
export const loungeConsultCrisis = (said: string) => crisisWords.test(said);
// A dream told in the conversation (not a question about dreams in general).
const dreamWords = /꿈(을|에|에서|속|이|은|에선)\s|꿨|꾸었|꿈꿨|악몽|해몽/;
export const loungeConsultDream = (said: string) => said.length >= 12 && dreamWords.test(said);
// Words that ask for tarot or 사주 in the conversation: the 홍실당 button blinks.
const askingWords = /타로|카드 (좀|한 장|뽑)|사주|팔자|운세|궁합|점 (좀 )?(봐|보)/;

/** The places in the face-down deck the member picked, from the message the page sent (1-based there, 0-based here). */
export const loungeTarotPicks = (said: string) => said.startsWith(loungeTarotPickPrefix) ? (said.slice(loungeTarotPickPrefix.length).match(/\d+/g) ?? []).map(Number).map(n => n - 1) : [];
const spreadOf = (answers: Record<string, string>): LoungeTarotSpread => answers.spread === 'one' ? 'one' : 'three';

/**
 * The next state and what 한결 does, from the member's latest words (or the room's opening). When a reading can be made
 * it asks for it (`interpret`): the caller makes it, then calls withLoungeReading.
 */
export function advanceLoungeConsult(previous: LoungeConsultState, input: { opening: boolean; said: string }, randomInt: (max: number) => number = loungeSecureRandomInt): { state: LoungeConsultState; turn: LoungeConsultTurn; interpret?: true } {
  const said = input.said.trim();
  const turn = previous.turn + 1;
  const done = (state: LoungeConsultState, next: LoungeConsultTurn, interpret?: true) => {
    const rest: LoungeConsultState = { ...state };
    delete rest.hint;
    const hint = next.do === 'greet' || (next.do === 'chat' && next.suggest);
    return { state: { ...rest, turn, last: next.do as LastTurn, ...(hint ? { hint: true as const } : {}) }, turn: next, ...(interpret ? { interpret } : {}) };
  };
  if (input.opening) return done(fresh(turn), { do: 'greet' });
  if (!said) return done(previous, { do: 'wait' });
  if (loungeConsultCrisis(said)) return done({ ...previous, phase: 'chat' }, { do: 'care' });
  // The tarot form: the question and the spread are in; the deck is shuffled now and laid out face down.
  const tarot = readLoungeTarotForm(said);
  if (tarot) {
    return done({ ...previous, phase: 'tarot_pick', module: 'tarot', answers: { question: tarot.question, spread: tarot.spread }, deck: shuffleLoungeTarot(randomInt) },
      { do: 'ask_pick', question: tarot.question, count: loungeTarotPositions[tarot.spread].length });
  }
  // The 사주 form: everything the chart needs is in, so the reading is made now (a form that does not read is asked again).
  if (said.startsWith(loungeSajuFormPrefix)) {
    const saju = readLoungeSajuForm(said);
    if (!saju) return done({ ...previous, phase: 'chat', module: 'saju' }, { do: 'retry', module: 'saju' });
    return done({ ...previous, phase: 'chat', module: 'saju', answers: { saju: JSON.stringify(saju) } }, { do: 'wait' }, true);
  }
  if (previous.phase === 'tarot_pick' && (said.startsWith(loungeTarotPickPrefix) || said === loungeTarotDrawForMe)) {
    return done({ ...previous, answers: { ...previous.answers, pick: said } }, { do: 'wait' }, true);
  }
  // A dream told in the conversation is read at once.
  if (loungeConsultDream(said)) return done({ ...previous, phase: 'chat', module: 'dream', answers: { dream: said.slice(0, 600) } }, { do: 'wait' }, true);
  // Anything else is the conversation (which also leaves a tarot reading the member walked away from).
  const since = previous.since + 1;
  const recent = previous.reading && since <= readingLasts;
  return done({ ...previous, phase: 'chat', since }, {
    do: 'chat', ...(recent ? { reading: previous.reading, ...(previous.module === 'tarot' && previous.draw ? { cards: previous.draw } : {}) } : {}),
    ...(askingWords.test(said) ? { suggest: true as const } : {}),
  });
}

/** The state and turn once the reading is made (or could not be: then 한결 asks to try again). */
export function withLoungeReading(state: LoungeConsultState, reading: LoungeReading | undefined, draw?: LoungeTarotDrawn[]): { state: LoungeConsultState; turn: LoungeConsultTurn } {
  const base: LoungeConsultState = { ...state, ...(draw ? { draw } : {}) };
  const module = state.module ?? 'tarot';
  // A tarot reading that failed lays the same deck out again; a dream or a chart is simply asked for again.
  if (!reading) return { state: { ...base, phase: module === 'tarot' && state.deck ? 'tarot_pick' : 'chat', last: 'retry' }, turn: { do: 'retry', module } };
  if (reading.safety.includes('crisis')) return { state: { ...base, phase: 'chat', reading, since: 0, last: 'care' }, turn: { do: 'care' } };
  const next: LoungeConsultState = { ...base, phase: 'chat', reading, since: 0, last: 'reading' };
  return { state: next, turn: { do: 'reading', module, reading, ...(module === 'tarot' && next.draw ? { cards: next.draw } : {}) } };
}

/** How many cards the member picks now (the page lays the deck out), or 0 when no cards are being picked. */
export const loungeConsultPickCount = (state: LoungeConsultState) => state.phase === 'tarot_pick' && state.deck && (state.last === 'ask_pick' || state.last === 'retry') ? loungeTarotPositions[spreadOf(state.answers)].length : 0;
/** The cards just read, for the page to turn face up under the reading. */
export const loungeConsultShownCards = (state: LoungeConsultState) => state.last === 'reading' && state.module === 'tarot' ? state.draw ?? [] : [];
/** The 사주 form as the member sent it (for the interpreter request on the server). */
export const loungeConsultSajuInput = (state: LoungeConsultState): LoungeSajuInput | undefined => {
  try { return state.answers.saju ? JSON.parse(state.answers.saju) as LoungeSajuInput : undefined; } catch { return undefined; }
};

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
  required: ['headline', 'core', 'detail', 'advice', 'homework', 'tone_hint', 'evidence', 'safety', 'memory_note'],
  properties: {
    headline: { type: 'string' }, core: { type: 'array', items: { type: 'string' } }, detail: { type: 'array', items: { type: 'string' } },
    advice: { type: 'array', items: { type: 'string' } }, homework: { type: 'string' }, tone_hint: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } }, safety: { type: 'array', items: { type: 'string', enum: [...safeties] } },
    memory_note: { type: 'string' },
  },
} as const;

const interpreterRules = `너는 상담 풀이 해석 엔진이다. 캐릭터 말투를 쓰지 않고 중립적인 해석가로서 JSON만 출력한다. 입력의 계산 결과와 사용자의 말만 근거로 쓴다.
- 입력에 없는 카드, 글자, 상징, 사실을 만들지 않는다. evidence에는 실제로 쓴 근거(카드 이름과 방향, 사주의 글자와 오행, 꿈 상징, 사용자가 한 말)를 짧게 적는다.
- 단정하지 않는다. "~하는 흐름", "~하기 쉬운 기질"처럼 쓴다. 재미로 보는 풀이다.
- headline은 한 줄의 단칼 결론이다(예: "놓아야 할 때", "먼저 말하면 풀린다", "불 같은 추진력, 물이 필요하다"). 20자 안팎.
- core는 핵심 3~4개, detail은 자세한 설명 3~4개, advice는 그래서 어떻게 할지 2~3개다. 각 항목은 1~3문장으로 구체적으로 쓴다. 뭉뚱그린 말("좋은 흐름", "긍정적인 변화")로 때우지 말고 무엇이 어떻게 그런지 쓴다.
- homework는 오늘 해 볼 작고 안전하고 구체적인 행동 하나다.
- tone_hint는 따끔하게 짚을 지점과 다독일 지점을 한 문장으로 적는다.
- memory_note는 다음에 기억할 한 줄이다(예: "타로: 직장 동료 고민, 연인 역방향", "사주: 무토 일간, 화 많고 수 없음").
- 금지: 질병·사고·사망·임신 예측, 이혼·소송·합격 결과 단정, 복권·주식·코인 예측, 겁주는 표현(액운, 살, 저주), 부적·굿·제물·추가 상담 권유, 실존 인물(연예인 포함)에 대한 풀이.
- safety: 건강·질병·임신을 묻거나 걸려 있으면 health, 자해·극단적인 생각·폭력·학대·스토킹 피해 신호가 있으면 crisis(풀이는 최소한으로), 이별·이혼·퇴사·결혼·투자·이사 같은 결정을 내려 달라고 하면 big_decision(결론 대신 고려할 점만 쓴다). 없으면 빈 배열이다.`;

const moduleRules: Record<LoungeConsultModule, string> = {
  tarot: '타로 풀이다. 라이더-웨이트 덱의 전통적인 해석으로 읽는다. cards.meaning을 중심으로, 그 카드 그림에 담긴 상징(인물, 자세, 소품, 색, 숫자와 원소의 뜻)과 정·역방향의 차이를 풀어 쓴다. detail에는 카드마다 하나씩 "자리 · 카드 이름(정/역): 그림의 상징과 이 질문에서의 뜻"을 2~3문장으로 쓴다. core는 카드들이 이어지며 보여 주는 흐름(과거에서 현재로, 현재에서 미래로)과 question에 대한 답이다. evidence에는 뽑힌 카드를 "카드 이름(정/역)"으로 모두 적는다. 뽑히지 않은 카드는 말하지 않는다.',
  dream: '꿈해몽이다. 사용자가 대화에서 들려준 꿈(dream)을 symbols의 전통 해몽과 심리 해석으로 읽는다. 꿈의 분위기와, 사용자가 한 말에서 드러나는 기분과 요즘 일을 함께 읽는다. symbols가 비어 있으면 꿈의 분위기와 장면으로만 읽는다. 무서운 꿈도 흉하다고 단정하지 않고 요즘 마음이 이렇게 나온 것으로 읽는다. 반복되는 악몽이나 잠을 못 잔다는 말이 있으면 advice 마지막에 수면과 스트레스를 챙기라는 말을 가볍게 넣는다.',
  saju: '사주 풀이다. chart의 네 기둥(시주가 null이면 세 기둥), 일간(day_master), 오행 분포(five_elements, strong, missing), 십성(ten_gods), 대운(daewoon)과 올해·이달(this_year, this_month)만 근거로 읽는다. 일간과 오행 분포로 타고난 기질을, 십성으로 사람·일·돈을 대하는 방식을, 대운과 올해 기둥으로 지금 흐름을 읽는다. focus(타고난 성격, 연애, 일과 돈, 올해 흐름, 전부)와 question에 맞춰 무게를 둔다. 신강·신약, 용신, 격국처럼 학파마다 판단이 갈리는 것은 단정하지 않는다. detail에는 근거가 되는 글자와 오행을 짚으며 쓴다(예: "일간 무토에 화가 둘이라..."). chart.notes에 있는 한계(시간 모름, 음력 변환, 대운 생략)는 core 마지막에 한 문장으로 알린다. 사주가 정해 둔 운명처럼 쓰지 않고 기질과 흐름의 힌트로 쓴다.',
};

/**
 * What the interpreter is given: its rules and the member's words with what code computed — the cards, the symbols, or
 * the 사주 chart (computed on the server by loungeSaju.ts and passed in, since this module also runs in the browser).
 */
export function loungeInterpreterRequest(state: LoungeConsultState, randomInt: (max: number) => number = loungeSecureRandomInt, chart?: unknown) {
  const module = state.module ?? 'tarot';
  const answers = state.answers;
  const picks = loungeTarotPicks(answers.pick ?? '');
  // The member's picks from the laid-out deck; "그냥 뽑아 줘" (or a deck lost) takes the top of it.
  const draw = module !== 'tarot' ? undefined : state.deck ? loungeTarotFromPicks(spreadOf(answers), state.deck, picks, randomInt) : drawLoungeTarot(spreadOf(answers), randomInt);
  const saju = module === 'saju' ? loungeConsultSajuInput(state) : undefined;
  const computed = module === 'tarot' ? { question: answers.question ?? '', cards: draw!.map(card => ({ position: card.position, card: `${card.ko} (${card.name})`, reversed: card.reversed, meaning: card.meaning })) }
    : module === 'saju' ? { chart, focus: saju?.focus ?? '전부', question: saju?.question ?? '' }
    : { dream: answers.dream ?? '', symbols: matchLoungeDreamSymbols(answers.dream ?? '').map(item => ({ symbol: item.symbol, traditional: item.traditional, psychological: item.psychological })) };
  return { draw, instructions: `${interpreterRules}\n${moduleRules[module]}`, input: JSON.stringify({ module, ...computed }) };
}

// ── How 한결 says it (added to the reply's instructions in a consulting room) ──
export const loungeConsultRules = `홍실당 상담: 이 방은 신당 홍실당에서 손님(사용자)과 마주 앉은 상담이다. 기본은 대화다. 손님이 고민을 말하면 무당답게 듣고 반말 공수 톤으로 결론부터 짚는다. 대화창 아래에 홍실당 버튼이 있고, 거기서 타로(궁금한 것과 장수를 적고 카드를 직접 고른다)와 사주(생년월일과 시간을 적는다)를 볼 수 있다. input의 consult가 이번 턴에 할 일이다.
- greet: 짧게 맞이하고 오늘 무슨 일로 왔는지 묻는다(1~2문장). 타로나 사주를 보고 싶으면 아래 빨간 홍실당 버튼을 누르라고 한 번 알려 준다. 다시 온 손님이면 relationship.user_memories의 지난 상담을 한마디 꺼내도 된다.
- chat: 평소처럼 상담 대화를 한다. consult.reading이 있으면 방금 본 풀이(cards 포함)를 근거로 이어서 답하고, 풀이에 없는 예언은 지어내지 않는다. suggest가 true면 손님이 타로나 사주를 꺼낸 것이니 아래 홍실당 버튼을 누르라고 짧게 안내한다. 고민이 카드로 볼 만한데 손님이 모르는 것 같으면 가끔 "카드 한번 뽑아 볼래? 아래 버튼"이라고 권할 수 있다(매번 하지 않는다).
- ask_pick: 손님이 적은 질문(question)을 한마디로 받고, 카드를 섞어 펼쳐 놨으니 화면에서 끌리는 카드를 count장 직접 고르라고 한다. 카드는 손님이 고르므로 네가 대신 고르지 않는다.
- reading: consult.reading을 한 번에 풍부하게 풀어 준다. 첫 문장은 headline을 단칼로 말한다. 타로면 cards를 자리마다 이름과 방향으로 짚고 detail로 그림의 상징과 뜻을 풀고, core로 흐름을 잇는다. 사주면 일간과 오행으로 기질을 짚고 detail의 글자 근거를 쉬운 말로 풀어 주고(전문 용어는 한두 개만, 뜻을 붙여서), 올해 흐름과 손님이 고른 것에 맞춰 말한다. 꿈이면 꿈의 상징을 하나씩 짚는다. 마지막에 advice와 homework를 단정적으로 시킨다(homework는 오늘 할 일로). 이 턴은 캐릭터 설명의 분량보다 길게 8~12문장까지 쓴다. 풀이에 없는 카드, 글자, 상징, 사실, 예언을 지어내지 않는다. tone_hint를 따라 따끔하게 짚을 곳과 다독일 곳을 나눈다. "계산되는 건 다 나오는데 손님 실만 여전히 안 보인다"는 말은 이 턴에 많아야 한 번 할 수 있다.
- retry: 풀이가 제대로 안 나왔다. 할머니 핑계를 대며 다시 해 보자고 짧게 말한다(타로면 카드를 다시 고르라고, 사주면 생년월일을 다시 적어 달라고).
- wait: 짧게 한마디만 한다.
- care: 손님이 위험한 상황일 수 있다. 호통과 풀이를 멈추고 진지하게 받아 준다. 지금 안전한지 묻고, 도움받을 곳을 알려 준다(자살예방 상담전화 109, 정신건강 위기상담 1577-0199, 여성긴급전화 1366, 위급하면 112나 119).
- reading.safety에 health가 있으면 몸 이야기는 풀이로 답하지 않고 병원에 가라고 한다. big_decision이 있으면 결론을 내려 주지 않고 고려할 점만 말한 뒤 "이건 신령님 말 말고 내 생각인데, 결정은 손님이 해"라는 결로 넘긴다.
- 언제나: 반말 공수 톤으로 결론부터. 겁주기, 액운·살·저주 같은 말, 부적·굿·추가 상담·결제 권유, 질병·사고·사망·임신 예측, 복권·주식 예측은 하지 않는다. 사주를 정해진 운명처럼 말하지 않는다. 손님이 풀이가 틀렸다고 하면 뻔뻔하게 다시 읽되(예: 그럼 손님이 이미 운을 바꿔 놓은 거야) 손님이 겪은 일을 부정하지 않는다.`;
