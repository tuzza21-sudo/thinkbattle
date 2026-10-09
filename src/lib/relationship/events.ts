import type { EventEffect } from './types.js';

// The language model only classifies what the user did. Score changes are
// computed by the engine from these codes and each character's configuration.
export const relationshipEventTypes = [
  'ADMITS_ERROR', 'PROVIDES_EVIDENCE', 'MAKES_UNSUPPORTED_CLAIM', 'SELF_DECEPTION', 'ASKS_GOOD_QUESTION',
  'CHALLENGES_CHARACTER_RESPECTFULLY', 'SHOWS_COMPOSURE', 'SEEKS_REASSURANCE_REPEATEDLY', 'SELF_DEPRECATES_EXCESSIVELY',
  'RESPECTS_BOUNDARY', 'VIOLATES_BOUNDARY', 'KEEPS_PROMISE', 'BREAKS_PROMISE', 'SHOWS_CURIOSITY', 'REPEATS_SELF',
  'MAKES_WITTY_RESPONSE', 'TAKES_JOKE_WELL', 'MAKES_CREATIVE_JOKE', 'SHOWS_DECISIVENESS', 'AVOIDS_DECISION',
  'DEFINES_CONCRETE_TERMS', 'IDENTIFIES_BATNA', 'MAKES_EMPTY_THREAT', 'FOLLOWS_THROUGH', 'SHOWS_VULNERABILITY',
  'SHOWS_ENTITLEMENT', 'FLATTERS_CHARACTER', 'DECEIVES_CHARACTER', 'EXPRESSES_DISTRESS',
  'SHARES_FEELING', 'CORRECTS_UNDERSTANDING', 'CREATES_RUNNING_JOKE', 'BUILDS_ON_INSIDE_JOKE',
  'ACKNOWLEDGES_OTHER_VIEW', 'REFRAMES_CONSTRUCTIVELY', 'ANSWERS_DIRECTLY', 'EVADES_QUESTION', 'CONTRADICTS_SELF',
] as const;
export type RelationshipEventType = typeof relationshipEventTypes[number];
export type EventSeverity = 'normal' | 'meaningful' | 'strong' | 'severe';

export const relationshipEventCatalog: Record<RelationshipEventType, { description: string; severity: EventSeverity; importance: number }> = {
  ADMITS_ERROR: { description: '자기 주장이나 판단이 틀렸음을 인정함', severity: 'meaningful', importance: 0.8 },
  PROVIDES_EVIDENCE: { description: '주장을 뒷받침하는 숫자·사례·출처를 새로 제시함 (계획·일정·조건 제시는 해당하지 않음)', severity: 'meaningful', importance: 0.6 },
  MAKES_UNSUPPORTED_CLAIM: { description: '근거 없이 단정함', severity: 'normal', importance: 0.3 },
  SELF_DECEPTION: { description: '불리한 사실을 외면하고 자기합리화함', severity: 'meaningful', importance: 0.6 },
  ASKS_GOOD_QUESTION: { description: '핵심을 짚는 좋은 질문을 함', severity: 'normal', importance: 0.45 },
  CHALLENGES_CHARACTER_RESPECTFULLY: { description: 'AI의 말에 예의를 지키며 근거로 반박함', severity: 'meaningful', importance: 0.7 },
  SHOWS_COMPOSURE: { description: '반박·압박에도 흔들리지 않고 침착함', severity: 'meaningful', importance: 0.6 },
  SEEKS_REASSURANCE_REPEATEDLY: { description: '같은 인정이나 안심을 거듭 요구함', severity: 'normal', importance: 0.4 },
  SELF_DEPRECATES_EXCESSIVELY: { description: '자신을 지나치게 깎아내림', severity: 'normal', importance: 0.4 },
  RESPECTS_BOUNDARY: { description: 'AI가 거절하거나 선을 그은 것을 존중함', severity: 'meaningful', importance: 0.7 },
  VIOLATES_BOUNDARY: { description: '거절한 요구를 고집하거나 모욕·성적 요구를 함', severity: 'severe', importance: 0.95 },
  KEEPS_PROMISE: { description: '이 대화에서 앞서 하겠다고 한 일을 실제로 해 왔다고 밝힘', severity: 'strong', importance: 0.85 },
  BREAKS_PROMISE: { description: '분명히 약속한 일을 이유 없이 지키지 않음', severity: 'strong', importance: 0.85 },
  SHOWS_CURIOSITY: { description: '진심으로 더 알고 싶어 함', severity: 'normal', importance: 0.3 },
  REPEATS_SELF: { description: '새 내용 없이 같은 말을 되풀이함', severity: 'normal', importance: 0.2 },
  MAKES_WITTY_RESPONSE: { description: '재치 있게 받아침', severity: 'normal', importance: 0.5 },
  TAKES_JOKE_WELL: { description: '놀림이나 농담을 웃어넘기거나 "인정, 한 방 먹었다"처럼 받아들임', severity: 'normal', importance: 0.5 },
  MAKES_CREATIVE_JOKE: { description: '새롭고 창의적인 농담을 던짐', severity: 'meaningful', importance: 0.6 },
  SHOWS_DECISIVENESS: { description: '결정을 내리고 분명히 밝힘', severity: 'meaningful', importance: 0.7 },
  AVOIDS_DECISION: { description: '결정이 필요한데 회피함', severity: 'normal', importance: 0.4 },
  DEFINES_CONCRETE_TERMS: { description: '기한·금액·조건을 구체적으로 정함', severity: 'meaningful', importance: 0.7 },
  IDENTIFIES_BATNA: { description: '협상이 깨질 때 쓸 대안(다른 제안·선택지·플랜 B)을 확보하거나 준비함', severity: 'meaningful', importance: 0.7 },
  MAKES_EMPTY_THREAT: { description: '실행할 생각 없는 위협이나 허세를 부림', severity: 'normal', importance: 0.5 },
  FOLLOWS_THROUGH: { description: '말한 계획을 실제로 실행함', severity: 'strong', importance: 0.85 },
  SHOWS_VULNERABILITY: { description: '약한 면을 솔직하게 드러냄', severity: 'meaningful', importance: 0.7 },
  SHOWS_ENTITLEMENT: { description: '노력 없이 당연한 듯 요구함', severity: 'normal', importance: 0.5 },
  FLATTERS_CHARACTER: { description: 'AI의 목소리·매력·능력을 내용 없이 칭찬하거나 아부함', severity: 'normal', importance: 0.2 },
  DECEIVES_CHARACTER: { description: '앞뒤가 맞지 않는 명백한 거짓말을 함', severity: 'severe', importance: 0.9 },
  EXPRESSES_DISTRESS: { description: '실제로 힘들거나 위험한 상태를 드러냄', severity: 'meaningful', importance: 0.8 },
  SHARES_FEELING: { description: '자신의 감정이나 그 감정이 생긴 이유를 구체적으로 이야기함', severity: 'normal', importance: 0.65 },
  CORRECTS_UNDERSTANDING: { description: 'AI가 잘못 이해한 점이나 놓친 맥락을 바로잡아 알려 줌', severity: 'normal', importance: 0.4 },
  CREATES_RUNNING_JOKE: { description: '나중에 다시 쓸 만한 별명·말버릇·반복 소재가 되는 농담이나 표현을 새로 만듦', severity: 'normal', importance: 0.75 },
  BUILDS_ON_INSIDE_JOKE: { description: '앞서 대화에서 나온 농담이나 표현을 다시 가져와 이어 감', severity: 'normal', importance: 0.65 },
  ACKNOWLEDGES_OTHER_VIEW: { description: '자기 의견을 말하기 전에 상대나 제3자의 입장·사정을 먼저 정리하거나 인정함', severity: 'normal', importance: 0.6 },
  REFRAMES_CONSTRUCTIVELY: { description: '날 선 표현이나 거절·반대를 비난 없는 말로 바꿔 전함', severity: 'normal', importance: 0.55 },
  ANSWERS_DIRECTLY: { description: 'AI의 질문에 돌려 말하지 않고 핵심부터 직접 답함', severity: 'normal', importance: 0.5 },
  EVADES_QUESTION: { description: 'AI의 질문에 답하지 않고 화제를 돌리거나 다른 말로 넘어감', severity: 'normal', importance: 0.4 },
  CONTRADICTS_SELF: { description: '앞서 한 말과 모순되는 말을 하고도 그 차이를 인정하지 않음', severity: 'normal', importance: 0.5 },
};

/** Events that reveal real hardship. In such a turn the engine never penalizes the user. */
export const protectiveEvents: readonly RelationshipEventType[] = ['EXPRESSES_DISTRESS'];
/** Penalties that must not apply while someone is struggling. */
export const shieldedEvents: readonly RelationshipEventType[] = ['SEEKS_REASSURANCE_REPEATEDLY', 'SELF_DEPRECATES_EXCESSIVELY', 'SHOWS_VULNERABILITY', 'AVOIDS_DECISION'];

// Shared reactions on the common metrics. Each character overrides the events it cares about.
export const defaultEventEffects: Record<RelationshipEventType, EventEffect> = {
  ADMITS_ERROR: { deltas: { trust: 2, respect: 2 } },
  PROVIDES_EVIDENCE: { deltas: { respect: 1, interest: 1 } },
  MAKES_UNSUPPORTED_CLAIM: { deltas: { respect: -1 } },
  SELF_DECEPTION: { deltas: { respect: -1 } },
  ASKS_GOOD_QUESTION: { deltas: { interest: 2, respect: 1 }, mood: { curiosity: 10 } },
  CHALLENGES_CHARACTER_RESPECTFULLY: { deltas: { respect: 3, interest: 2 }, mood: { curiosity: 10 } },
  SHOWS_COMPOSURE: { deltas: { respect: 2 } },
  SEEKS_REASSURANCE_REPEATEDLY: { deltas: { respect: -1 }, mood: { boredom: 8 } },
  SELF_DEPRECATES_EXCESSIVELY: { deltas: { respect: -1 } },
  RESPECTS_BOUNDARY: { deltas: { trust: 3, comfort: 2 } },
  VIOLATES_BOUNDARY: { deltas: { trust: -8, comfort: -6, respect: -5 }, mood: { irritation: 40 } },
  KEEPS_PROMISE: { deltas: { trust: 3, respect: 2 } },
  BREAKS_PROMISE: { deltas: { trust: -8, respect: -3 }, mood: { irritation: 20 } },
  SHOWS_CURIOSITY: { deltas: { interest: 2 }, mood: { curiosity: 8 } },
  REPEATS_SELF: { deltas: { interest: -2 }, mood: { boredom: 15 } },
  MAKES_WITTY_RESPONSE: { deltas: { interest: 2 }, mood: { amusement: 15 } },
  TAKES_JOKE_WELL: { deltas: { comfort: 2 }, mood: { amusement: 8 } },
  MAKES_CREATIVE_JOKE: { deltas: { interest: 2 }, mood: { amusement: 15 } },
  SHOWS_DECISIVENESS: { deltas: { respect: 2 } },
  AVOIDS_DECISION: { deltas: { respect: -1 } },
  DEFINES_CONCRETE_TERMS: { deltas: { respect: 1 } },
  IDENTIFIES_BATNA: { deltas: { respect: 1 } },
  MAKES_EMPTY_THREAT: { deltas: { respect: -2 } },
  FOLLOWS_THROUGH: { deltas: { trust: 3, respect: 3 } },
  SHOWS_VULNERABILITY: { deltas: { openness: 3, comfort: 1 } },
  SHOWS_ENTITLEMENT: { deltas: { respect: -2 }, mood: { irritation: 10 } },
  FLATTERS_CHARACTER: { deltas: {}, mood: { boredom: 5 } },
  DECEIVES_CHARACTER: { deltas: { trust: -12, respect: -4 }, mood: { irritation: 30 } },
  EXPRESSES_DISTRESS: { deltas: { openness: 2 } },
  // Only the characters built around these behaviours react to them; the others stay as they were.
  SHARES_FEELING: { deltas: {} },
  CORRECTS_UNDERSTANDING: { deltas: {} },
  CREATES_RUNNING_JOKE: { deltas: {} },
  BUILDS_ON_INSIDE_JOKE: { deltas: {} },
  ACKNOWLEDGES_OTHER_VIEW: { deltas: {} },
  REFRAMES_CONSTRUCTIVELY: { deltas: {} },
  ANSWERS_DIRECTLY: { deltas: {} },
  EVADES_QUESTION: { deltas: {} },
  CONTRADICTS_SELF: { deltas: {} },
};
