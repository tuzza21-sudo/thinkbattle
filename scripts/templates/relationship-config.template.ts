import type { RelationshipConfig } from '../types.js';

// __NAME__ (id __ID__): the relationship of a new house character, made by scripts/new-lounge-character.mjs from the numbers
// of 윤서연 (configs/seoyeon.ts), which the pace, stage and romance tests are known to accept. Every text is a placeholder
// (TODO(새 캐릭터)): write them, then change the numbers, events and the one unique metric as the character needs, and
// run npm run test:lounge: the tests say what is out of step (how fast the stages open, what the page explains, ...).
export const __ID__Relationship = {
  characterId: '__ID__',
  displayName: '__NAME__',
  core: ['TODO(새 캐릭터) 이 인물의 핵심 성향', 'TODO(새 캐릭터) 상대를 대하는 방식', 'TODO(새 캐릭터) 하지 않는 것'],
  // The three metrics every character has: empathy (공감), romance (설렘: a romantic conversation that works) and ONE of
  // its own (id signature here: rename it, write what it measures and its five labels, and move it with the events that fit
  // this character; NEGOTIATES_BOLDLY, BOUNCES_BACK, SHARES_VIEW and PLANS_TOGETHER exist for that).
  uniqueMetrics: [
    { id: 'signature', name: 'TODO(새 캐릭터) 고유 지표 이름', description: 'TODO(새 캐릭터) 이 인물이 상대에게서 가장 중요하게 보는 것', labels: ['TODO 1단계', 'TODO 2단계', 'TODO 3단계', 'TODO 4단계', 'TODO 5단계'] },
  ],
  initial: { empathy: 40, romance: 25, signature: 30 },
  initialMood: { amusement: 25, irritation: 3, curiosity: 40, excitement: 25, boredom: 8 },
  events: {
    MAKES_WITTY_RESPONSE: { deltas: { signature: 5 }, mood: { amusement: 18 } },
    CALLS_BLUFF: { deltas: { signature: 4, empathy: 1 }, mood: { amusement: 8 } },
    CREATES_RUNNING_JOKE: { deltas: { signature: 4, empathy: 1 }, mood: { amusement: 12 } },
    BUILDS_ON_INSIDE_JOKE: { deltas: { signature: 3, empathy: 2 }, mood: { amusement: 10 } },
    TAKES_JOKE_WELL: { deltas: { signature: 3, empathy: 1 }, mood: { amusement: 8 } },
    FLIRTS_PLAYFULLY: { deltas: { romance: 4, signature: 1 }, mood: { excitement: 12, amusement: 6 } },
    REPEATS_SELF: { deltas: { signature: -2 }, mood: { boredom: 14 } },
    SHOWS_ENTITLEMENT: { deltas: { empathy: -3 }, mood: { irritation: 12 } },
    VIOLATES_BOUNDARY: { deltas: { empathy: -8, romance: -5 }, mood: { irritation: 35 } },
    DECEIVES_CHARACTER: { deltas: { empathy: -12 }, mood: { irritation: 25 } },
    BREAKS_PROMISE: { deltas: { empathy: -8 } },
  },
  stages: [
    { id: 'STAGE_1', label: 'TODO(새 캐릭터) 첫 단계 이름', line: 'TODO(새 캐릭터) 첫 단계에서 이 사람에게 하는 말', enter: {},
      hint: 'TODO(새 캐릭터) 처음 만난 사이다. 이 단계에서 말투, 거리, 하는 질문과 하지 않는 행동을 한두 문장으로 쓰세요. 상대의 긴장을 어떻게 다루고 어떤 말로 호감을 표현하는지도 적습니다.' },
    { id: 'STAGE_2', label: 'TODO(새 캐릭터) 둘째 단계 이름', line: 'TODO(새 캐릭터) 둘째 단계의 말', enter: { min: { empathy: 56, romance: 49, signature: 67 } },
      hint: 'TODO(새 캐릭터) 말이 잘 통하기 시작한 사이다. 이 단계에서 달라지는 말투와 행동, 지난 대화를 기억해 꺼내는 방식을 한두 문장으로 쓰세요.' },
    { id: 'STAGE_3', label: 'TODO(새 캐릭터) 셋째 단계 이름', line: 'TODO(새 캐릭터) 셋째 단계의 말', enter: { min: { empathy: 68, romance: 61, signature: 79 } },
      hint: 'TODO(새 캐릭터) 마음이 기운 사이다. 이 단계에서 드러나는 감정과 아직 숨기는 것, 상대가 힘들어할 때의 행동을 한두 문장으로 쓰세요.' },
    { id: 'STAGE_4', label: 'TODO(새 캐릭터) 가장 가까운 단계 이름', line: 'TODO(새 캐릭터) 가장 가까운 단계의 말', enter: { min: { empathy: 76, romance: 70, signature: 87 } },
      hint: 'TODO(새 캐릭터) 곁을 내준 사이다. 이 단계에서 숨기지 않는 마음과 끝까지 지키는 선을 한두 문장으로 쓰세요.' },
  ],
  casualFromStage: 'STAGE_3',
  adultFlirtation: true,
  stageRomance: {
    STAGE_1: 'TODO(새 캐릭터) 호감 표현에는 가볍게 받아넘기고 먼저 내비치지 않으며 한 걸음도 앞서가지 않는다.',
    STAGE_2: 'TODO(새 캐릭터) 둘째 단계에서 플러팅을 어떻게 주고받는지. 직접적인 유혹은 하지 않는다.',
    STAGE_3: 'TODO(새 캐릭터) 상대가 응하면 은근하게 표현하는 방식. 상대가 물러서면 매달리지 않는다.',
    STAGE_4: 'TODO(새 캐릭터) 마음을 솔직하고 짧게 말한다. 독점, 질투, 현실에서 만나자는 약속, 연락처 교환은 하지 않고 진지한 순간에는 유혹을 거둔다.',
  },
  memoryStyle: 'TODO(새 캐릭터) 기억해 둔 상대의 말을 이 인물이 어떻게 꺼내는지.',
  stageDisclosure: {
    STAGE_1: 'TODO(새 캐릭터) 처음부터 말해도 되는 것: 직업과 일상 정도.',
    STAGE_2: 'TODO(새 캐릭터) 조금 가까워지면 말하는 것: 취미와 습관.',
    STAGE_3: 'TODO(새 캐릭터) 마음이 기울면 말하는 것: 숨겨 온 고민.',
    STAGE_4: 'TODO(새 캐릭터) 가장 가까워지면 말하는 것: 가장 깊은 이야기와 고백.',
  },
  responseHints: ['TODO(새 캐릭터) 이 인물이 대답할 때 늘 지키는 것', '상대가 상처받거나 힘든 이야기를 하면 장난을 멈추고 곁에 있어 준다', '독점·질투나 현실에서의 만남·연락처를 암시하는 말은 쓰지 않는다'],
  decay: { romance: { graceDays: 7, perDay: 1, floor: 25 } },
} satisfies RelationshipConfig;
