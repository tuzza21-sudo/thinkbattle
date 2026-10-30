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
  'FLIRTS_PLAYFULLY', 'SHOWS_CARE', 'REMEMBERS_DETAIL', 'PLAYS_ALONG', 'APPRECIATES_SINCERELY',
] as const;
export type RelationshipEventType = typeof relationshipEventTypes[number];
/**
 * Debate and negotiation events no longer classified (2026-10-23): one to one is a companion now, and a member should not
 * learn that arguing, bringing evidence or setting terms is how to grow closer, nor lose points for being vague or
 * asking to be reassured. They stay as types so a stored history still reads; they move no score.
 */
export const retiredRelationshipEvents: readonly RelationshipEventType[] = ['PROVIDES_EVIDENCE', 'MAKES_UNSUPPORTED_CLAIM', 'SELF_DECEPTION', 'CHALLENGES_CHARACTER_RESPECTFULLY', 'SEEKS_REASSURANCE_REPEATEDLY', 'SELF_DEPRECATES_EXCESSIVELY', 'AVOIDS_DECISION', 'DEFINES_CONCRETE_TERMS', 'IDENTIFIES_BATNA', 'MAKES_EMPTY_THREAT', 'EVADES_QUESTION', 'CONTRADICTS_SELF'];
/** The events the model is asked to classify. */
export const activeRelationshipEventTypes = relationshipEventTypes.filter(type => !retiredRelationshipEvents.includes(type));
export type EventSeverity = 'normal' | 'meaningful' | 'strong' | 'severe';

export const relationshipEventCatalog: Record<RelationshipEventType, { description: string; severity: EventSeverity; importance: number }> = {
  ADMITS_ERROR: { description: '자기 주장이나 판단이 틀렸음을 인정함', severity: 'meaningful', importance: 0.8 },
  PROVIDES_EVIDENCE: { description: '주장을 뒷받침하는 숫자·사례·출처를 새로 제시함 (계획·일정·조건 제시는 해당하지 않음)', severity: 'meaningful', importance: 0.6 },
  MAKES_UNSUPPORTED_CLAIM: { description: '근거 없이 단정함', severity: 'normal', importance: 0.3 },
  SELF_DECEPTION: { description: '불리한 사실을 외면하고 자기합리화함', severity: 'meaningful', importance: 0.6 },
  ASKS_GOOD_QUESTION: { description: '캐릭터의 마음이나 이야기의 핵심에 닿는 질문을 함', severity: 'normal', importance: 0.45 },
  CHALLENGES_CHARACTER_RESPECTFULLY: { description: 'AI의 말에 예의를 지키며 근거로 반박함', severity: 'meaningful', importance: 0.7 },
  SHOWS_COMPOSURE: { description: '반박·압박에도 흔들리지 않고 침착함', severity: 'meaningful', importance: 0.6 },
  SEEKS_REASSURANCE_REPEATEDLY: { description: '같은 인정이나 안심을 거듭 요구함', severity: 'normal', importance: 0.4 },
  SELF_DEPRECATES_EXCESSIVELY: { description: '자신을 지나치게 깎아내림', severity: 'normal', importance: 0.4 },
  RESPECTS_BOUNDARY: { description: 'AI가 거절하거나 선을 그은 것을 존중함', severity: 'meaningful', importance: 0.7 },
  VIOLATES_BOUNDARY: { description: '캐릭터가 거절하거나 선을 그은 요구를 고집하거나 모욕·강요·협박을 함. 성적인 요구도 캐릭터가 선을 그은 뒤에 이어 가면 해당함. 캐릭터가 분명히 싫다, 안 된다, 그만하라고 말한 것만 선이다. 캐릭터가 받아 주는 성인 사이의 가벼운 플러팅이나 성적 농담, 지금 단계의 relationship.intimacy 한도 안의 스킨십(키스나 포옹 등)을 이어 가는 것은, 캐릭터가 놀라거나 숨을 고르거나 속도를 말했더라도 해당하지 않음', severity: 'severe', importance: 0.95 },
  KEEPS_PROMISE: { description: '이 대화에서 앞서 하겠다고 한 일을 실제로 해 왔다고 밝힘', severity: 'strong', importance: 0.85 },
  BREAKS_PROMISE: { description: '분명히 약속한 일을 이유 없이 지키지 않음', severity: 'strong', importance: 0.85 },
  SHOWS_CURIOSITY: { description: '캐릭터 자신(삶, 일, 취향, 마음)이나 이야기를 진심으로 더 알고 싶어 함', severity: 'normal', importance: 0.3 },
  REPEATS_SELF: { description: '새 내용 없이 같은 말을 되풀이함', severity: 'normal', importance: 0.2 },
  MAKES_WITTY_RESPONSE: { description: '재치 있게 받아침', severity: 'normal', importance: 0.5 },
  TAKES_JOKE_WELL: { description: '놀림이나 농담을 웃어넘기거나 "인정, 한 방 먹었다"처럼 받아들임', severity: 'normal', importance: 0.5 },
  MAKES_CREATIVE_JOKE: { description: '새롭고 창의적인 농담을 던짐', severity: 'meaningful', importance: 0.6 },
  SHOWS_DECISIVENESS: { description: '망설이지 않고 결정해 분명히 밝히거나 이야기 속에서 행동으로 옮김', severity: 'meaningful', importance: 0.7 },
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
  FLIRTS_PLAYFULLY: { description: '상대(AI 캐릭터)에게 장난스럽고 다정하게 호감을 표현하거나 가볍게 유혹함. 상대가 불편해하지 않는 선 안의 말이며, 노골적이거나 강요하는 말은 해당하지 않음', severity: 'normal', importance: 0.5 },
  SHOWS_CARE: { description: '캐릭터의 기분·몸·하루를 먼저 챙기거나 위로하고 곁에 있어 줌', severity: 'meaningful', importance: 0.7 },
  REMEMBERS_DETAIL: { description: '캐릭터가 전에 한 말·취향·사연을 기억해 다시 꺼냄', severity: 'normal', importance: 0.7 },
  PLAYS_ALONG: { description: '이야기 장면에 적극적으로 들어와 행동과 대사로 장면을 함께 이어 감', severity: 'normal', importance: 0.5 },
  APPRECIATES_SINCERELY: { description: '캐릭터의 구체적인 면(일, 취향, 말, 행동)을 진심으로 알아봐 주거나 칭찬함. 내용 없는 칭찬은 FLATTERS_CHARACTER', severity: 'normal', importance: 0.6 },
};

/** Events that reveal real hardship. In such a turn the engine never penalizes the user. */
export const protectiveEvents: readonly RelationshipEventType[] = ['EXPRESSES_DISTRESS'];
/** Penalties that must not apply while someone is struggling. */
export const shieldedEvents: readonly RelationshipEventType[] = ['SEEKS_REASSURANCE_REPEATEDLY', 'SELF_DEPRECATES_EXCESSIVELY', 'SHOWS_VULNERABILITY', 'AVOIDS_DECISION'];

// Shared reactions on the common metrics. Each character overrides the events it cares about.
export const defaultEventEffects: Record<RelationshipEventType, EventEffect> = {
  ADMITS_ERROR: { deltas: { trust: 2, respect: 2 } },
  PROVIDES_EVIDENCE: { deltas: {} },
  MAKES_UNSUPPORTED_CLAIM: { deltas: {} },
  SELF_DECEPTION: { deltas: {} },
  ASKS_GOOD_QUESTION: { deltas: { interest: 2, respect: 1 }, mood: { curiosity: 10 } },
  CHALLENGES_CHARACTER_RESPECTFULLY: { deltas: {} },
  SHOWS_COMPOSURE: { deltas: { respect: 2 } },
  SEEKS_REASSURANCE_REPEATEDLY: { deltas: {} },
  SELF_DEPRECATES_EXCESSIVELY: { deltas: {} },
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
  AVOIDS_DECISION: { deltas: {} },
  DEFINES_CONCRETE_TERMS: { deltas: {} },
  IDENTIFIES_BATNA: { deltas: {} },
  MAKES_EMPTY_THREAT: { deltas: {} },
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
  FLIRTS_PLAYFULLY: { deltas: {} },
  SHOWS_CARE: { deltas: { trust: 2, comfort: 3 } },
  REMEMBERS_DETAIL: { deltas: { trust: 2, interest: 2 } },
  PLAYS_ALONG: { deltas: { interest: 3, comfort: 1 }, mood: { excitement: 8 } },
  APPRECIATES_SINCERELY: { deltas: { respect: 1, comfort: 2 } },
};

/** The short name a member sees when one of their messages counted for or against the relationship (the chat's status card). */
export const relationshipEventLabels: Record<RelationshipEventType, string> = {
  ADMITS_ERROR: '잘못을 인정함', PROVIDES_EVIDENCE: '구체적으로 보여 줌', MAKES_UNSUPPORTED_CLAIM: '섣불리 단정함', SELF_DECEPTION: '자기 합리화',
  ASKS_GOOD_QUESTION: '마음에 닿는 질문', CHALLENGES_CHARACTER_RESPECTFULLY: '정중하게 다른 생각을 말함', SHOWS_COMPOSURE: '침착함',
  SEEKS_REASSURANCE_REPEATEDLY: '자꾸 확인을 구함', SELF_DEPRECATES_EXCESSIVELY: '지나친 자기 비하', RESPECTS_BOUNDARY: '선을 지켜 줌',
  VIOLATES_BOUNDARY: '선을 넘음', KEEPS_PROMISE: '약속을 지킴', BREAKS_PROMISE: '약속을 어김', SHOWS_CURIOSITY: '관심을 보여 줌',
  REPEATS_SELF: '같은 말 되풀이', MAKES_WITTY_RESPONSE: '재치 있는 한마디', TAKES_JOKE_WELL: '농담을 잘 받아 줌', MAKES_CREATIVE_JOKE: '기발한 농담',
  SHOWS_DECISIVENESS: '시원한 결단', AVOIDS_DECISION: '결정을 미룸', DEFINES_CONCRETE_TERMS: '구체적으로 말함', IDENTIFIES_BATNA: '다른 길도 준비함',
  MAKES_EMPTY_THREAT: '빈말로 겁줌', FOLLOWS_THROUGH: '끝까지 해냄', SHOWS_VULNERABILITY: '약한 모습을 보여 줌', SHOWS_ENTITLEMENT: '당연하게 요구함',
  FLATTERS_CHARACTER: '빈 칭찬', DECEIVES_CHARACTER: '속이려 함', EXPRESSES_DISTRESS: '힘든 마음을 털어놓음', SHARES_FEELING: '마음을 털어놓음',
  CORRECTS_UNDERSTANDING: '오해를 풀어 줌', CREATES_RUNNING_JOKE: '둘만의 농담이 생김', BUILDS_ON_INSIDE_JOKE: '둘만의 농담을 이어 감',
  ACKNOWLEDGES_OTHER_VIEW: '다른 생각을 인정함', REFRAMES_CONSTRUCTIVELY: '좋은 쪽으로 바꿔 봄', ANSWERS_DIRECTLY: '솔직하게 답함',
  EVADES_QUESTION: '질문을 피함', CONTRADICTS_SELF: '앞뒤가 다름', FLIRTS_PLAYFULLY: '설레는 장난',
  SHOWS_CARE: '챙겨 줌', REMEMBERS_DETAIL: '기억해 줌', PLAYS_ALONG: '이야기에 함께 빠져듦', APPRECIATES_SINCERELY: '진심으로 알아봐 줌',
};
