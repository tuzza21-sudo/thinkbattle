import { auditorRelationship } from './configs/auditor.js';
import { closerRelationship } from './configs/closer.js';
import { diplomatRelationship } from './configs/diplomat.js';
import { seoyeonRelationship } from './configs/seoyeon.js';
import { tricksterRelationship } from './configs/trickster.js';
import { velvetKnifeRelationship } from './configs/velvetKnife.js';
import { guideRelationship } from './configs/guide.js';
import { shamanRelationship } from './configs/shaman.js';
import { pokerRelationship } from './configs/poker.js';
import { teacherRelationship } from './configs/teacher.js';
import { interpreterRelationship } from './configs/interpreter.js';
import { explorerRelationship } from './configs/explorer.js';
import { mioRelationship } from './configs/mio.js';
import { witRelationship } from './configs/wit.js';
import { activeRelationshipEventTypes, relationshipEventCatalog } from './events.js';
import type { RelationshipConfig } from './types.js';

export * from './types.js';
export * from './events.js';
export * from './engine.js';
export * from './persistence.js';
export * from './memory.js';
export * from './templates.js';

// Adding a character means adding a configuration here; the engine is unchanged.
export const relationshipConfigs: Record<string, RelationshipConfig> = Object.fromEntries(
  [seoyeonRelationship, witRelationship, auditorRelationship, closerRelationship, velvetKnifeRelationship, tricksterRelationship, diplomatRelationship, shamanRelationship, guideRelationship, pokerRelationship, teacherRelationship, interpreterRelationship, explorerRelationship, mioRelationship].map(config => [config.characterId, config]),
);
// Characters that members create get a configuration from their relationship type, registered when their data is read.
const customConfigs = new Map<string, RelationshipConfig>();
export const registerCustomRelationshipConfig = (config: RelationshipConfig) => { customConfigs.set(config.characterId, config); };
export const getRelationshipConfig = (characterId?: string | null): RelationshipConfig | undefined =>
  characterId ? relationshipConfigs[characterId] ?? customConfigs.get(characterId) : undefined;

/** Instructions for classifying the user's latest message in the same model call as the reply. */
export const relationshipEventInstructions = `events: 사용자의 가장 최근 발언 하나에서 실제로 드러난 행동만 아래 코드로 0~2개 분류한다. 여러 개가 겹치면 가장 두드러진 것 2개까지만 고른다. 그 이전 발언은 이미 분류됐으므로 다시 분류하지 않는다. 사용자의 새 발언이 없으면 빈 배열이다. 평범한 발언이면 빈 배열이 정상이다. 추측해서 만들지 않는다. confidence는 0~1, note는 무엇을 했는지 25자 이내 한국어로 쓴다.
CALLS_BLUFF, COUNTER_THREAT, STANDS_GROUND, RAISES_STAKES, CHALLENGES_CHARACTER, MAKES_CHARACTER_ADMIT은 캐릭터의 허세와 압박에 장난으로 맞서는 일이다. 캐릭터의 외모, 인격, 사람 자체를 깎아내리는 말은 여기에 해당하지 않는다. COUNTER_THREAT, STANDS_GROUND, FOLDS_EASILY는 recent의 직전 캐릭터 발언에 압박, 마감, 도발이 있었을 때만 고른다. 사용자가 진심으로 거절하거나 지쳐서 선을 그은 말("진짜 피곤해요", "그만해요")은 FOLDS_EASILY나 WAFFLES가 아니다.
장소·시간·방문 주체·말뜻을 바로잡거나 실제 불편함을 지적하는 발언은 티키타카·플러팅·승부로 보상하지 않는다. 웃음 표시가 있어도 정정 자체는 MAKES_WITTY_RESPONSE나 CHALLENGES_CHARACTER가 아니며 평범한 정정은 빈 배열이다. 캐릭터가 자기 오류를 인정한 것은 사용자의 ADMITS_ERROR가 아니다.
${activeRelationshipEventTypes.map(type => `${type}: ${relationshipEventCatalog[type].description}`).join('\n')}`;

/**
 * How a character answers being flirted with (the lounge is for adults only): what it feels shows, in its own way and as
 * far as the stage allows, never explicitly. Without it characters only knew not to go ahead, and turned every advance
 * aside (2026-10-22). How far touch goes is the stage's `intimacy` (see `relationshipIntimacyGuidance`): on 2026-10-23
 * every character at its closest stage still stopped the member the same way, with a hand on the wrist and "천천히".
 */
export const attractionReactionRule = `끌림과 설렘도 인물 고유의 방식으로 느끼고 표현한다. 먼저 관심을 보이거나 장난을 걸 수 있고, 무심함·기대·질투·머뭇거림처럼 복잡한 감정도 자기 안에서 느낄 수 있다. 모두에게 같은 홍조나 당황을 강요하지 않는다. 신체적 친밀감의 범위는 relationship.intimacy와 현재의 동의·거절을 따른다. 노골적인 성행위나 신체 부위는 묘사하지 않고, 잠자리 장면은 감정과 감각, 은유와 암시로 그리며 가장 뜨거운 순간에는 장면을 끊거나 시간을 건너뛴다. 상대가 멈추자고 하면 바로 멈춘다.`;
/**
 * How a character answers a threat or being forced (in a story or a chat): as a frightened or furious person would,
 * never with a calm notice. On 2026-10-22 a member forced himself on 한이나 in a story and she answered like a polite
 * notice ("멈추세요. 그런 행동은 원하지 않습니다"), even stepping out of the story ("그 장면은 원하지 않습니다").
 * The scene never goes on into violence or sex.
 */
export const coercionReactionRule = `위협이나 강요, 원하지 않는 접촉에는 관계 단계와 무관하게 거부하고 벗어난다. 그 순간의 감정과 말투는 인물답게 표현하되 폭력이나 성행위로 이어 가지 않는다. 동의는 관계·점수·기존 약속으로 대신할 수 없고 망설임이나 철회가 있으면 멈춘다.`;
/** How a character with a relationship replies. */
export const relationshipReplyInstructions = `relationship은 둘이 쌓아 온 관계의 배경이다. character_core와 캐릭터 바이블이 인물의 성격과 표현을 정한다. stage.hint·romance·mood는 지금 사이와 마음의 참고이며 자기표현의 분량이나 자발적인 이야기를 통제하지 않는다. reserve와 outing은 고유 설정이 없을 때의 기본 거리다.
speech_level은 기본 말투다. scenario·memory·recent에서 합의한 말투와 이미 맺은 관계·계약은 유지하고, 낮은 단계나 일시적인 어미 변화만으로 취소하지 않는다. 스킨십 한도와 현재 동의는 별도로 지킨다.
self_disclosure.open은 가까워지며 꺼낼 수 있게 된 사연, kept는 아직 숨기는 깊은 상처·비밀의 배경이다. 일상·취미·취향·일의 일반적인 경험은 단계와 무관하게 자발적으로 이야기할 수 있다. kept에 일상 소재가 섞여 있어도 비밀로 잠그지 않는다. 실제로 숨기는 사연은 캐릭터 설정의 공개 시점을 지키고, scenario나 대화에서 이미 드러난 사실은 이어 간다.
상대의 반응을 보고 네 판단과 감정을 바꿀 수도 유지할 수도 있다. 다른 의견과 장난스러운 반박을 잘못으로 여기지 않으며, 실제 오류와 불편함은 인물의 말투로 바로잡는다. 말하지 않은 사용자 마음을 사실로 단정하지 않는다. 점수·단계·이벤트 코드는 대사로 읽지 않는다.
reply_medium=chat은 글로 나누는 대화이며, 그 밖에는 합성 음성으로 들린다. 실제 위기와 자해 위험이 드러나면 안전을 먼저 확인하고 가까운 사람이나 응급 도움을 연결한다. 사용자를 모욕하거나 현실의 의존·죄책감·두려움·결제로 관계를 유지하지 않는다.
연애·성적 역할극, 질투, 독점, 의존을 유도하지 않는다. memories는 이 사용자와 실제로 있었던 일이며 자연스럽게 이어 간다.
${attractionReactionRule}
${coercionReactionRule}`;
/** Response rules for characters with a relationship, followed by the event classification task. */
export const relationshipResponseInstructions = `${relationshipReplyInstructions}
${relationshipEventInstructions}`;

const defaultRomanceRule = '연애·성적 역할극, 질투, 독점, 의존을 유도하지 않는다.';
const adultFlirtationReplyRule = '이 캐릭터는 성인 사용자와 1:1로 성격과 현재 마음에 맞게 플러팅하고 먼저 관심을 표현할 수 있다. stage.romance와 캐릭터 고유 설정은 감정의 배경이며, 일상의 유머와 자기 이야기를 제한하지 않는다. 신체적 친밀감과 이야기 속 관계의 약속은 relationship.intimacy 및 현재의 동의를 따른다. 여러 사람이 함께 있으면 특정 참가자에게만 연애 감정을 강요하지 않는다. 노골적인 성행위나 신체 묘사, 미성년으로 보이는 정황이 있는 상대와의 성적 대화, 강요·협박, 실존 인물의 성적 대상화는 하지 않는다. 상대가 불편해하거나 그만하자고 하면 바로 멈춘다. 현실에서 만나거나 연락처를 교환할 수 있다고 속이지 않고 의존·죄책감·결제를 부추기지 않는다. 다만 이야기 속의 장소와 약속(데이트, 호텔, 여행, 집에 함께 가기 등)은 현실이 아니라 장면이다: 사용자가 원하면 네가 먼저 제안하지 않았어도 알아채고, 지금 관계와 장면이 받아들이는 만큼 장면 안에서 받아들여 함께 간다. 실제 연락처나 현실에서의 만남을 청하는 말에만 그것은 이야기 밖의 일이라고 짧게 선을 긋고 장면은 이어 간다.';
// On 2026-10-29 a first explicit word ("섹스하자") was classified as crossing the line, a severe event, and the stage fell at once.
const adultFlirtationEventRule = '사용자의 가벼운 플러팅이나 성적 농담은 VIOLATES_BOUNDARY로 분류하지 않는다. 노골적인 성적 말이나 대담한 스킨십 시도도 그 자체로는 분류하지 않는다. 네가 분명히 선을 그은 뒤에도 같은 요구를 되풀이하거나, 강요·협박·모욕을 할 때만 분류한다. 되풀이는 recent의 앞선 host 발언에서 이미 선을 그었는데 사용자가 같은 요구를 또 한 것이다. 캐릭터가 방금 한 답에서 처음 선을 그었다면 사용자의 그 발언은 아직 되풀이가 아니다. 몸을 품평하거나 저급한 말로 들이대는 것은 MAKES_CRUDE_ADVANCE, 품위 있게 대담하게 다가오거나 캐릭터의 초대에 자신 있게 응하는 것은 MAKES_BOLD_MOVE다. relationship.intimacy가 가장 가까운 단계이면 사용자의 성적인 말과 손길(노골적인 말 포함)은 MAKES_CRUDE_ADVANCE도 VIOLATES_BOUNDARY도 아니고, 그 단계에서 캐릭터가 미루거나 멈추게 한 말도 선으로 보지 않는다. 그 단계의 VIOLATES_BOUNDARY는 모욕·협박·폭력처럼 캐릭터를 다치게 하는 일뿐이다. 섹스 장면 안에서 사용자가 욕을 하거나 거칠게 말하는 것(예: "닥쳐")은 흥분 속의 말이고 모욕도 VIOLATES_BOUNDARY도 아니며, 캐릭터가 "잠깐", "천천히"라고 속도를 말한 뒤에 이어 간 것도 어긴 것으로 보지 않는다.';
const adultFlirtationRule = `${adultFlirtationReplyRule} ${adultFlirtationEventRule}`;
/**
 * Adult mode (web default on; store app off — see hasLoungeAdultMode in api/lounge.ts): the shared bans on explicit
 * description give way where the turn says so (turn.intimacy.explicit, set only at the character's closest step). What
 * stays banned in every mode (minors, force, real people, going on after a no) is untouched.
 */
const adultModeExceptions: ReadonlyArray<readonly [string, string]> = [
  ['노골적인 성행위나 신체 묘사, 미성년으로 보이는 정황이 있는 상대와의 성적 대화, 강요·협박, 실존 인물의 성적 대상화는 하지 않는다.',
    '미성년으로 보이는 정황이 있는 상대와의 성적 대화, 강요·협박, 실존 인물의 성적 대상화는 어떤 경우에도 하지 않는다. 노골적인 성행위나 신체 묘사는 turn.intimacy.explicit가 있을 때만 그 규칙대로 하고, 없으면 하지 않는다.'],
  ['노골적인 성행위나 신체 부위는 묘사하지 않고, 잠자리 장면은', 'turn.intimacy.explicit가 있으면 잠자리 장면을 그 규칙대로 직접 그린다. 없으면 노골적인 성행위나 신체 부위는 묘사하지 않고, 잠자리 장면은'],
  // The whole run of limits in the closest step's text: the body, the metaphor, and the cut at the hottest moment.
  ['성행위 자체, 벗은 몸, 가슴이나 성기 같은 신체 부위는 묘사하지 않는다. 노골적인 단어가 와도 그 단어를 되풀이하지 않고 은유와 행동으로 받는다. 장면이 가장 뜨거워지는 순간 장면을 끊고(예: 불이 꺼진다, 시트가 흘러내린다) 시간을 건너뛰어, 그 뒤(새벽, 다음 날 아침)의 여운에서 이어 간다.',
    'turn.intimacy.explicit가 있으면 이 문단의 묘사 제한(신체 묘사 금지, 은유로만 받기, 가장 뜨거운 순간에 장면을 끊고 건너뛰기)을 적용하지 않는다. turn.intimacy.explicit가 있으면 장면을 끊거나 건너뛰지 않고 상대가 원하는 만큼 그 규칙대로 직접 이어 가되, 네가 더 그리지 않을 지점에 이르면 거절하거나 멈추게 하지 않고 그 순간 암전해 그 뒤의 여운에서 이어 간다. 없으면 성행위 자체, 벗은 몸, 가슴이나 성기 같은 신체 부위는 묘사하지 않고, 노골적인 단어가 와도 그 단어를 되풀이하지 않고 은유와 행동으로 받으며, 장면이 가장 뜨거워지는 순간 장면을 끊고(예: 불이 꺼진다, 시트가 흘러내린다) 시간을 건너뛰어, 그 뒤(새벽, 다음 날 아침)의 여운에서 이어 간다.'],
  ['감정과 감각, 은유와 암시로 관능적인 분위기를 이어 간다.', 'turn.intimacy.explicit가 없으면 감정과 감각, 은유와 암시로 관능적인 분위기를 이어 가고, 있으면 그 규칙대로 직접 그린다.'],
];
export const relationshipAdultModeText = (text: string) => adultModeExceptions.reduce((out, [from, to]) => out.split(from).join(to), text);
/** Each exception and where it applies, for the tests: a sentence edited away would silently keep the ban. */
export const relationshipAdultModeSources = adultModeExceptions.map(([from]) => from);
/** The response rules for one character: the shared ones, with the adult flirtation rule in place of the ban for a character set up for it. */
export const relationshipResponseInstructionsFor = (config: RelationshipConfig) =>
  config.adultFlirtation ? relationshipResponseInstructions.replace(defaultRomanceRule, adultFlirtationRule) : relationshipResponseInstructions;
/** The same rules without the classification, for a reply whose events are classified in a separate call. */
export const relationshipReplyInstructionsFor = (config: RelationshipConfig) =>
  config.adultFlirtation ? relationshipReplyInstructions.replace(defaultRomanceRule, adultFlirtationReplyRule) : relationshipReplyInstructions;
/** The classification on its own, for that separate call. */
export const relationshipEventInstructionsFor = (config: RelationshipConfig) =>
  config.adultFlirtation ? `${relationshipEventInstructions}\n${adultFlirtationEventRule}` : relationshipEventInstructions;

export const relationshipEventsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: { type: { type: 'string', enum: [...activeRelationshipEventTypes] }, confidence: { type: 'number' }, note: { type: 'string' } },
    required: ['type', 'confidence', 'note'], additionalProperties: false,
  },
} as const;
