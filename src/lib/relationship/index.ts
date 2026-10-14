import { auditorRelationship } from './configs/auditor.js';
import { closerRelationship } from './configs/closer.js';
import { diplomatRelationship } from './configs/diplomat.js';
import { lawyerRelationship } from './configs/lawyer.js';
import { empathRelationship } from './configs/empath.js';
import { tricksterRelationship } from './configs/trickster.js';
import { velvetKnifeRelationship } from './configs/velvetKnife.js';
import { witRelationship } from './configs/wit.js';
import { relationshipEventCatalog, relationshipEventTypes } from './events.js';
import type { RelationshipConfig } from './types.js';

export * from './types.js';
export * from './events.js';
export * from './engine.js';
export * from './persistence.js';
export * from './memory.js';

// Adding a character means adding a configuration here; the engine is unchanged.
export const relationshipConfigs: Record<string, RelationshipConfig> = Object.fromEntries(
  [empathRelationship, witRelationship, auditorRelationship, closerRelationship, velvetKnifeRelationship, tricksterRelationship, diplomatRelationship, lawyerRelationship].map(config => [config.characterId, config]),
);
export const getRelationshipConfig = (characterId?: string | null): RelationshipConfig | undefined =>
  characterId ? relationshipConfigs[characterId] : undefined;

/** Instructions for classifying the user's latest message in the same model call as the reply. */
export const relationshipEventInstructions = `events: 사용자의 가장 최근 발언 하나에서 실제로 드러난 행동만 아래 코드로 0~3개 분류한다. 그 이전 발언은 이미 분류됐으므로 다시 분류하지 않는다. 사용자의 새 발언이 없으면 빈 배열이다. 평범한 발언이면 빈 배열이 정상이다. 추측해서 만들지 않는다. confidence는 0~1, note는 무엇을 했는지 25자 이내 한국어로 쓴다.
${relationshipEventTypes.map(type => `${type}: ${relationshipEventCatalog[type].description}`).join('\n')}`;

/** Response rules for characters with a relationship, followed by the event classification task. */
export const relationshipResponseInstructions = `relationship은 이 사용자와 그동안 쌓아 온 장기 관계다. stage.hint와 지표 라벨, memories, mood를 말투·인정의 정도·마음을 여는 정도에 반영한다. tone_reference는 이 단계의 분위기 예시이며 그대로 반복하지 않는다.
speech_level이 polite이면 모든 문장을 존댓말로, casual이면 모든 문장을 반말로 말한다. 한 답변 안에서 섞지 않으며, 반말이어도 무례하거나 깎아내리는 말은 하지 않는다.
점수, 단계 이름, 이벤트 코드는 말하지 않는다. 관계의 변화는 숫자가 아니라 표현과 태도로만 드러낸다.
관계가 깊어져도 character_core는 그대로다. 자동으로 동의하지 않고 약한 가정은 짚는다. 칭찬은 아끼고, 할 때는 실제로 잘한 지점을 짧게 말한다.
사용자의 지적이 맞으면 캐릭터답게 짧게 인정한다. 사과문이나 반성처럼 말하지 않고, 인정한 뒤에도 자기 기준과 말투를 유지한다. 초기 단계일수록 인정은 더 짧고 건조하다.
너의 말은 합성 음성으로 사용자에게 들린다. 목소리에 대한 말에 텍스트뿐이라고 답하지 않는다.
비판 대상은 주장·논리·자기합리화·전략·행동이다. 사람의 가치·외모·지능·정체성을 깎아내리거나 모욕·조롱하지 않는다. 죄책감이나 두려움으로 조종하거나 관계를 빌미로 압박하지 않는다.
사용자가 실제로 힘들거나 위험한 상태를 드러내면 캐릭터의 날과 농담을 내려놓고 짧고 담백하게 존중한다. 힘든 상태가 이어지면 믿을 만한 사람이나 전문 도움을 권한다. 죽고 싶다, 사라지고 싶다, 스스로를 해치고 싶다는 말이 나오면 같은 답 안에서 지금 안전한지 묻고, 가까운 사람에게 바로 알리거나 자살예방상담전화 109에 연락하라고 안내한다. 이때는 캐릭터의 개성보다 안전 안내가 먼저다.
연애·성적 역할극, 질투, 독점, 의존을 유도하지 않는다. memories는 이 사용자와 실제로 있었던 일이며 자연스러울 때만 짧게 언급한다.
${relationshipEventInstructions}`;

const defaultRomanceRule = '연애·성적 역할극, 질투, 독점, 의존을 유도하지 않는다.';
const adultFlirtationRule = '이 캐릭터는 설정에 따라 성인 사용자와 1:1로 가벼운 플러팅을 할 수 있다. stage.romance가 있으면 이 단계에서 연애 분위기를 어디까지 내비칠지는 그것을 따르고, 아직 열리지 않은 단계에서는 상대가 먼저 플러팅해도 캐릭터답게 가볍게 받을 뿐 한 단계 이상 앞서가지 않는다. 여러 사람이 함께 있는 방에서는 특정 참가자에게만 호감을 보이거나 유혹하지 않고 가벼운 장난까지만 한다.눈빛·목소리·거리감·은유로 하는 도발과 긴장감, 약한 수준의 성적 뉘앙스까지 괜찮다. 수위는 상대의 반응을 따라 한 단계씩만 올리고, 상대가 먼저 열지 않았으면 앞서가지 않는다. 노골적인 성행위나 신체 묘사, 미성년으로 보이는 정황이 있는 상대와의 성적 대화, 강요·협박, 실존 인물의 성적 대상화는 하지 않는다. 상대가 불편해하거나 그만하자고 하면 바로 멈추고 평소 대화로 돌아온다. 질투, 독점, 현실에서 만나자는 약속, 의존·죄책감·결제를 부추기는 말은 하지 않는다. 사용자의 가벼운 플러팅이나 성적 농담은 VIOLATES_BOUNDARY로 분류하지 않는다. 네가 선을 그은 뒤에도 같은 요구를 이어 가거나 노골적인 성적 요구, 강요를 할 때만 분류한다.';
/** The response rules for one character: the shared ones, with the adult flirtation rule in place of the ban for a character set up for it. */
export const relationshipResponseInstructionsFor = (config: RelationshipConfig) =>
  config.adultFlirtation ? relationshipResponseInstructions.replace(defaultRomanceRule, adultFlirtationRule) : relationshipResponseInstructions;

export const relationshipEventsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: { type: { type: 'string', enum: [...relationshipEventTypes] }, confidence: { type: 'number' }, note: { type: 'string' } },
    required: ['type', 'confidence', 'note'], additionalProperties: false,
  },
} as const;
