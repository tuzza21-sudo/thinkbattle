import type { DebateFocus, DebateLevel, DebatePosition, DebateStep } from '../types';

const reasoningTerms = [
  '주장(Claim): 발언자가 말하고자 하는 논제에 대한 의견 또는 해법',
  '이유(Reason): 주장을 뒷받침하는 진술',
  '근거(Evidence): 외부에서 얻을 수 있는 자료나 사실',
  '전제(warrant): 이유와 주장을 이어주는 원칙이 합리적인지 확인하는 연결고리',
];

const openingReasoningTerms = [
  '이유(Reason): 입장을 뒷받침하는 핵심 진술',
  '근거(Evidence): 이유를 증명하는 구체적 사례나 사실',
];

export const beginnerDebateSteps: DebateStep[] = [
  {
    id: 'beginner-opening-user',
    roundId: 'opening',
    title: '입론',
    actor: 'user',
    purpose: '자신의 입장을 정하고, 그 입장을 뒷받침하는 이유와 근거를 제시한다.',
    instruction: `이유(Reason)와 근거(Evidence)를 구분해 입론하세요.`,
    tasks: [
      ...openingReasoningTerms,
      '입장을 뒷받침하는 이유(Reason)를 제시한다.',
      '각 이유에 대해 왜 그런지 설명한다.',
      '가능하면 간단한 예시를 덧붙인다.',
      'AI는 반대편 입론을 제시한다.',
    ],
    checklist: [
      '이유가 찬성/반대 입장과 잘 연결되어 있는가?',
      '이유에 맞는 구체적인 근거가 제시되었나?',
      '예시가 입장을 명확히 뒷받침하는가?',
      '감정이나 느낌이 아니라 논리적 이유를 바탕으로 말하고 있는가?',
    ],
    sentenceFrames: [
      '가장 핵심적인 이유는 ___이기 때문입니다.',
      '이 이유를 뒷받침하는 확실한 근거는 ___입니다.',
    ],
    recommendedDurationSeconds: 150,
    inputPlaceholder: '내 입장과 그 이유를 자유롭게 써보세요.',
  },
  {
    id: 'beginner-cross-question-user',
    roundId: 'cross-question',
    title: '교차질문',
    actor: 'user',
    purpose: '목표: \n정보를 끌어내고 약점을 확인하는 단계로\n아직 공격하지 않습니다.\n상대에게 답하게 만들어 스스로 약점이나 전제를 드러내게 하는 단계입니다.',
    instruction: '상대 입론에서 이해가 안 되거나 약한 부분을 확인 가능한 질문으로 물어보세요.',
    tasks: [
      '상대방의 주장 중 이해가 안 되는 부분을 질문한다.',
      '상대방 근거가 충분한지 묻는다.',
      '상대방 주장의 예시나 이유를 확인한다.',
      '상대방 주장의 약한 부분을 찾는다.',
    ],
    checklist: [
      '질문이 상대방 주장과 직접 관련되어 있는가?',
      '상대방 근거에 대해 구체적으로 질문했는가?',
      '단순 공격이 아니라 확인 가능한 질문인가?',
      '나중에 반박에 사용할 수 있는 답변을 끌어냈는가?',
    ],
    sentenceFrames: [
      '상대방 주장의 근거는 무엇인가요?',
      '그 근거가 충분하다고 보는 이유는 무엇인가요?',
      '그 주장은 어떤 경우에도 적용되나요?',
    ],
    recommendedDurationSeconds: 90,
    inputPlaceholder: '상대 주장에서 궁금하거나 약해 보이는 부분을 질문해보세요.',
  },
  {
    id: 'beginner-cross-question-answer-user',
    roundId: 'cross-question',
    title: 'AI 교차질문 답변',
    actor: 'user',
    purpose: 'AI가 내 입론에 대해 던진 교차질문에 답하면서 내 주장과 근거를 보강한다.',
    instruction: 'AI가 묻는 핵심 지점을 먼저 확인하고, 내 주장·이유·근거와 연결해 짧고 분명하게 답하세요.',
    tasks: [
      'AI가 무엇을 확인하려는 질문인지 파악한다.',
      '질문에 직접 답한다.',
      '내 입론의 이유나 근거와 연결한다.',
      '부족했던 설명을 한 문장 이상 보강한다.',
      '답변이 이후 반박에서 흔들리지 않도록 정리한다.',
    ],
    checklist: [
      'AI 질문에 직접 답했는가?',
      '내 주장과 이유를 다시 연결했는가?',
      '근거 또는 예시로 답변을 보강했는가?',
      '애매하게 피하지 않고 기준을 분명히 했는가?',
      '이 답변이 내 입장을 더 강하게 만드는가?',
    ],
    sentenceFrames: [
      'AI 질문의 핵심은 ___라고 이해했습니다.',
      '제 답변은 ___입니다.',
      '그 이유는 ___이기 때문입니다.',
      '이 점은 제 주장인 ___와 연결됩니다.',
    ],
    recommendedDurationSeconds: 80,
    inputPlaceholder: 'AI의 질문에 답하고, 내 주장을 보강해보세요.',
  },
  {
    id: 'beginner-opponent-summary-user',
    roundId: 'rebuttal',
    title: '상대 주장 분석',
    actor: 'user',
    purpose: '상대방 주장의 핵심 주장, 이유, 근거를 점검해 이후 반박의 출발점을 만든다.',
    instruction: 'AI가 제시한 주장과 이유를 바탕으로 핵심 주장, 근거의 신뢰성·관련성·충분성, 약한 부분을 점검하세요.',
    tasks: [
      '상대방의 핵심 주장을 찾는다.',
      '상대 근거의 신뢰성, 관련성, 충분성을 검토한다.',
      '상대방 주장 중 약한 부분을 찾는다.',
    ],
    checklist: [
      '상대방의 핵심 논지 이해 - 핵심 논지를 이해하고 있는지?',
      '상대방의 논리 구조 파악 - 상대방의 주장과 이유 근거를 분리해서 파악',
      '상대 주장 요약력 - 상대 주장을 자기말로 다시 정리하는 능력',
    ],
    sentenceFrames: [
      '상대방은 ___라고 주장합니다.',
      '상대 근거는 신뢰성/관련성/충분성 측면에서 ___입니다.',
      '제가 보기에 약한 부분은 ___입니다.',
    ],
    recommendedDurationSeconds: 90,
    inputPlaceholder: '상대 주장의 핵심과 약한 부분을 정리해보세요.',
  },
  {
    id: 'beginner-rebuttal-user',
    roundId: 'rebuttal',
    title: '반박',
    actor: 'user',
    purpose: '상대 논리가 왜 부족한지 결론을 내린다.\n형식: 주장 + 이유 + 근거를 사용한다.\n교차질문/상대 주장 정리 에서 얻은 정보를 바탕으로 논리적으로 공격한다.',
    instruction: '교차질문/상대 주장 분석에서 확인한 이유, 근거, 약점을 바탕으로 상대 논증의 비약이나 모순을 지적하세요.',
    tasks: [
      '상대 주장 분석에서 확인한 약한 부분을 고른다.',
      '결론이 아니라 이유, 근거, 해결책 중 약한 부분을 찾는다.',
      '상대 논증의 비약이나 모순을 설명한다.',
      '상대 해결책보다 현실적이고 부작용이 적은 대안을 제시한다.',
      '그 약점이 왜 상대 결론을 약하게 만드는지 밝힌다.',
    ],
    checklist: [
      '교차 질문에서 질문한 내용과 답변으로 반박을 구성했는가?',
      '상대 주장 분석에서 검증한 핵심 쟁점, 핵심 전제, 근거 타당성을 바탕으로 반박했는가?',
      '상대 논증의 비약이나 모순을 정확히 지적했는가?',
      '대안 제시력: 현실적이고 부작용이 적은 대안을 제시했는가?',
    ],
    sentenceFrames: [
      '상대방은 ___라고 주장했습니다.',
      '하지만 이 결론을 뒷받침하는 이유/근거/해결책 중 ___가 약합니다.',
      '이 부분은 ___라는 점에서 비약/모순이 있습니다.',
      '대안으로는 ___가 더 현실적이고 부작용이 적습니다.',
      '따라서 상대 주장은 ___라는 점에서 약합니다.',
    ],
    recommendedDurationSeconds: 120,
    inputPlaceholder: '상대 주장의 허점을 지적하고 반박해보세요.',
  },
  {
    id: 'beginner-weighing-user',
    roundId: 'closing',
    title: '최종발언',
    actor: 'user',
    purpose: '내 주장의 가장 강한 이유와 근거를 정리하고 최종 입장을 마무리한다.',
    instruction: '새로운 내용을 추가하기보다, 지금까지 말한 주장·이유·근거를 짧게 정리하고 최종 발언으로 마무리하세요.',
    tasks: [
      '내 최종 입장을 한 문장으로 정리한다.',
      '가장 강한 이유를 다시 제시한다.',
      '그 이유를 뒷받침하는 근거 또는 예시를 붙인다.',
      '최종 입장을 한 문장으로 마무리한다.',
    ],
    checklist: [
      '최종 입장이 분명한가?',
      '가장 강한 이유가 제시되었는가?',
      '이유를 뒷받침하는 근거 또는 예시가 있는가?',
    ],
    sentenceFrames: [
      '최종적으로 저는 ___에 찬성/반대합니다.',
      '가장 중요한 이유는 ___입니다.',
      '이를 뒷받침하는 근거/예시는 ___입니다.',
      '따라서 최종적으로 ___ 입장이 더 설득력 있습니다.',
    ],
    recommendedDurationSeconds: 120,
    inputPlaceholder: '최종 입장을 정리하고 마무리 발언을 써보세요.',
  },
];

export const intermediateDebateSteps: DebateStep[] = [
  {
    id: 'intermediate-opening-user',
    roundId: 'opening',
    title: '입론',
    actor: 'user',
    purpose: '1. 토론을 시작하기 전에 핵심 용어와 토론 범위를 확인하세요.\n2. 이유와 근거를 통해 논지를 튼튼히 세우세요.',
    instruction: '핵심 용어의 의미, 논의할 범위, 논제의 본질적인 질문, 상대와 다르게 정의할 수 있는 용어를 확인하세요.\n판단 기준과 연결되는 근거 2개 이상에 이유, 예시, 예상 효과를 붙이세요.',
    tasks: [
      '핵심 용어를 정의한다 (토론에서 중요한 단어의 의미를 명확히 정하기).',
      '논제의 범위를 정한다 (논의할 범위와 제외할 범위를 구분하기).',
      '논제의 핵심 질문은 무엇인지 파악한다 (표면적인 문장이 아니라 토론의 본질적인 질문 찾기).',
      '상대와 정의가 다른 용어는 없는지 점검한다 (같은 단어라도 서로 다른 의미로 사용하면 토론이 엇갈릴 수 있음을 유의).',
      ...openingReasoningTerms,
      '판단 기준을 제시한다.',
      '입장을 뒷받침하는 근거를 2개 이상 제시한다.',
      '각 근거에 대한 이유, 예시, 예상 효과를 설명한다.',
      '예상되는 반론을 간단히 고려한다.',
    ],
    checklist: [
      '핵심 용어를 정의했는가?',
      '논제의 범위를 정했는가?',
      '논제의 핵심 질문은 무엇인가?',
      '상대와 정의가 다른 용어는 없는가?',
      '판단 기준과 입장이 잘 연결되는가?',
      '근거가 2개 이상 구체적으로 제시되었는가?',
      '각 근거에 이유와 설명이 충분히 있는가?',
      '근거가 서로 중복되지 않고 독립적인가?',
      '예상 반론에 대한 기본 대응이 마련되었는가?',
    ],
    sentenceFrames: [
      '여기서 핵심 용어인 ___란 ___을 의미합니다.',
      '논의할 범위는 ___로 정하고, ___는 제외하겠습니다.',
      '이 논제의 핵심 질문은 결국 ___입니다.',
      '상대방과 뜻이 다를 수 있는 용어인 ___는 ___로 정의합니다.',
      '이 논제는 ___ 기준으로 판단해야 합니다.',
      '첫째, ___입니다. 그 이유는 ___입니다.',
      '둘째, ___입니다. 뒷받침하는 사례는 ___입니다.',
      '예상 반론은 ___이지만, ___라고 답할 수 있습니다.',
    ],
    recommendedDurationSeconds: 200,
    inputPlaceholder: '용어 정의와 판단 기준을 세우고, 근거를 들어 입론해보세요.',
  },
  {
    id: 'intermediate-cross-question-user',
    roundId: 'cross-question',
    title: '교차질문',
    actor: 'user',
    purpose: '목표: \n정보를 끌어내고 약점을 확인하는 단계로\n아직 공격하지 않습니다.\n상대에게 답하게 만들어 스스로 약점이나 전제를 드러내게 하는 단계입니다.',
    instruction: '상대 주장의 핵심 전제, 근거 충분성, 적용 범위, 대안 현실성, 우선순위 중 하나 이상을 질문하세요.',
    tasks: [
      '상대방 주장의 핵심 전제를 질문한다.',
      '상대방 근거의 충분성을 확인한다.',
      '상대방 주장이 적용되는 범위를 묻는다.',
      '상대방이 제시한 대안의 현실성을 확인한다.',
      '상대방에게 우선순위 판단을 요구한다.',
    ],
    checklist: [
      '질문이 상대 주장의 핵심을 겨냥하는가?',
      '근거, 전제, 범위, 대안 중 하나를 분명히 묻고 있는가?',
      '상대방이 답하기 어려운 지점을 정확히 찔렀는가?',
      '나중 반박에 사용할 답변을 확보했는가?',
      '질문이 짧고 명확한가?',
    ],
    sentenceFrames: [
      '상대 주장의 핵심 전제는 ___라는 뜻입니까?',
      '그 근거는 충분하다고 볼 수 있습니까?',
      '그 주장은 어떤 범위까지 적용됩니까?',
      'A와 B가 충돌할 때 무엇을 우선해야 합니까?',
    ],
    recommendedDurationSeconds: 70,
    inputPlaceholder: '상대 주장의 전제나 근거에 대해 질문해보세요.',
  },
  {
    id: 'intermediate-cross-question-answer-user',
    roundId: 'cross-question',
    title: 'AI 교차질문 답변',
    actor: 'user',
    purpose: 'AI가 내 입론의 전제, 근거, 범위, 판단 기준을 검증하는 질문에 답한다.',
    instruction: 'AI 질문이 겨냥한 전제·근거·범위·기준을 확인하고, 내 입론의 논리 구조가 유지되도록 답하세요.',
    tasks: [
      'AI 질문이 겨냥한 전제, 근거, 범위, 기준 중 무엇인지 파악한다.',
      '질문에 직접 답한다.',
      '판단 기준과 내 주장을 다시 연결한다.',
      '필요하면 근거의 범위나 한계를 인정하고 보완한다.',
      '이 답변이 이후 반박의 기준이 되도록 정리한다.',
    ],
    checklist: [
      'AI 질문의 쟁점을 정확히 잡았는가?',
      '전제, 근거, 범위, 기준 중 질문 대상에 직접 답했는가?',
      '판단 기준과 내 주장의 연결이 유지되는가?',
      '근거의 한계나 적용 범위를 공정하게 다루었는가?',
      '이후 반박에 활용할 수 있는 답변인가?',
    ],
    sentenceFrames: [
      'AI 질문은 ___를 확인하려는 질문입니다.',
      '이에 대한 제 답변은 ___입니다.',
      '저희 판단 기준인 ___에 따르면 ___입니다.',
      '다만 ___라는 한계는 있지만, ___ 때문에 제 입장은 유지됩니다.',
    ],
    recommendedDurationSeconds: 80,
    inputPlaceholder: 'AI의 질문에 답하고, 내 논리를 보강해보세요.',
  },
  {
    id: 'intermediate-opponent-summary-user',
    roundId: 'rebuttal',
    title: '상대 주장 분석',
    actor: 'user',
    purpose: '상대방 주장의 핵심 쟁점, 전제, 근거, 충돌 지점을 점검해 이후 반박의 출발점을 만든다.',
    instruction: '상대의 주장과 이유를 논리 구조로 확인한 뒤 승패를 가르는 쟁점, 핵심 전제, 근거의 신뢰성·관련성·충분성, 양측 충돌 지점을 점검하세요.',
    tasks: [
      '승패를 가르는 핵심 쟁점을 찾는다.',
      '상대 주장이 의존하는 핵심 전제를 드러낸다.',
      '상대 근거의 신뢰성, 관련성, 충분성을 구체적으로 검토한다.',
      '내 주장과 상대 주장이 충돌하는 지점을 파악한다.',
    ],
    checklist: [
      '상대방의 핵심 논지 이해 - 핵심 논지를 이해하고 있는지?',
      '상대방의 논리 구조 파악 - 상대방의 주장과 이유 근거를 분리해서 파악',
      '상대 주장 요약력 - 상대 주장을 자기말로 다시 정리하는 능력',
    ],
    sentenceFrames: [
      '상대방은 ___라고 주장합니다.',
      '승패를 가르는 핵심 쟁점은 ___입니다.',
      '이 주장의 핵심 전제는 ___입니다.',
      '상대 근거는 신뢰성/관련성/충분성 측면에서 ___입니다.',
      '내 주장과 충돌하는 지점은 ___입니다.',
    ],
    recommendedDurationSeconds: 90,
    inputPlaceholder: '상대 주장의 핵심 쟁점과 약점을 분석해보세요.',
  },
  {
    id: 'intermediate-rebuttal-user',
    roundId: 'rebuttal',
    title: '반박',
    actor: 'user',
    purpose: '상대 논리가 왜 부족한지 결론을 내린다.\n형식: 주장 + 이유 + 근거를 사용한다.\n교차질문/상대 주장 정리 에서 얻은 정보를 바탕으로 논리적으로 공격한다.',
    instruction: '교차질문/상대 주장 분석에서 확인한 핵심 쟁점, 핵심 전제, 근거 타당성을 바탕으로 상대 논증의 비약이나 모순을 정확히 지적하세요.',
    tasks: [
      '상대 주장 분석에서 확인한 핵심 쟁점과 핵심 전제를 선택한다.',
      '전제, 근거 타당성, 해결책, 우선순위 중 가장 약한 부분을 찾는다.',
      '상대 논증의 비약이나 모순을 구체적으로 설명한다.',
      '상대 해결책보다 현실적이고 부작용이 적은 대안을 제시한다.',
      '그 약점이 상대 결론을 약화시키는 이유를 밝힌다.',
      '필요하면 교차질문에서 나온 답변을 활용한다.',
    ],
    checklist: [
      '교차 질문에서 질문한 내용과 답변으로 반박을 구성했는가?',
      '상대 주장 분석에서 검증한 핵심 쟁점, 핵심 전제, 근거 타당성을 바탕으로 반박했는가?',
      '상대 논증의 비약이나 모순을 정확히 지적했는가?',
      '대안 제시력: 현실적이고 부작용이 적은 대안을 제시했는가?',
    ],
    sentenceFrames: [
      '상대 주장 분석에서 확인한 핵심 쟁점은 ___입니다.',
      '상대 결론이 성립하려면 ___가 전제되어야 합니다.',
      '하지만 이 부분에는 ___라는 비약/모순이 있습니다.',
      '대안으로는 ___가 더 현실적이고 부작용이 적습니다.',
      '따라서 상대 주장은 ___라는 점에서 약화됩니다.',
    ],
    recommendedDurationSeconds: 100,
    inputPlaceholder: '상대 논증의 비약이나 모순을 지적하고 반박해보세요.',
  },
  {
    id: 'intermediate-clash-weighing-user',
    roundId: 'counter-rebuttal',
    title: '충돌 지점 확인 및 중요성 비교',
    actor: 'user',
    purpose: '토론에서 실제로 부딪히는 핵심 쟁점을 정리하고, 내 근거가 왜 더 중요한지 설명한다.',
    instruction: '양측 주장이 충돌하는 지점을 2~3개로 정리하고, 피해 심각성/영향 범위/발생 가능성/긴급성/회복 가능성으로 비교하세요.',
    tasks: [
      '양측 주장이 충돌하는 지점을 2~3개로 정리한다.',
      '각 충돌 지점에서 어느 쪽이 더 설득력 있는지 판단한다.',
      '내 주장이 더 중요한 이유를 비교 기준으로 설명한다.',
      '피해의 심각성, 영향 범위, 발생 가능성, 긴급성, 회복 가능성 등을 활용한다.',
    ],
    checklist: [
      '충돌 지점이 명확한가?',
      '단순 쟁점 나열이 아니라 승부처를 잡았는가?',
      '내 근거가 상대 근거보다 왜 중요한지 설명했는가?',
      '비교 기준이 분명한가?',
      '심사위원이나 청중이 판단하기 쉽게 정리되었는가?',
    ],
    sentenceFrames: [
      '핵심 충돌 지점은 ___입니다.',
      '상대방은 ___을 강조합니다.',
      '하지만 우리는 ___이 더 중요하다고 봅니다.',
      '그 이유는 피해 심각성/영향 범위/발생 가능성/긴급성/회복 가능성 측면에서 ___이기 때문입니다.',
    ],
    recommendedDurationSeconds: 100,
    inputPlaceholder: '양측이 부딪히는 핵심 지점과 내 쪽이 더 중요한 이유를 써보세요.',
  },
  {
    id: 'intermediate-closing-user',
    roundId: 'closing',
    title: '최종 입장 확인',
    actor: 'user',
    purpose: '토론 전체를 바탕으로 자신의 최종 입장을 정리하고, 왜 자신의 주장이 더 타당한지 마무리한다.',
    instruction: '새로운 주장을 추가하지 말고, 논제 핵심/충돌 지점/상대 한계/내 우위/최종 입장을 정리하세요.',
    tasks: [
      '논제의 핵심을 다시 정리한다.',
      '주요 충돌 지점을 요약한다.',
      '상대방 주장의 한계를 정리한다.',
      '내 주장의 우위를 정리한다.',
      '최종 입장을 명확히 밝힌다.',
    ],
    checklist: [
      '새로운 주장을 갑자기 추가하지 않았는가?',
      '토론 중 나온 핵심 쟁점을 반영했는가?',
      '상대방 주장에 대한 반박이 요약되었는가?',
      '내 주장이 왜 더 중요한지 정리되었는가?',
      '최종 입장이 분명한가?',
    ],
    sentenceFrames: [
      '이 토론의 핵심은 ___였습니다.',
      '주요 충돌 지점은 ___였습니다.',
      '상대방 주장의 한계는 ___입니다.',
      '우리 주장은 ___ 기준에서 더 우위에 있습니다.',
      '따라서 최종적으로 ___에 찬성/반대합니다.',
    ],
    recommendedDurationSeconds: 70,
    inputPlaceholder: '토론을 정리하고 최종 입장을 밝혀보세요.',
  },
];

export const advancedDebateSteps: DebateStep[] = [
  {
    id: 'advanced-framing-user',
    roundId: 'opening',
    title: '논제 설계',
    actor: 'user',
    purpose: '논제 초점, 핵심 용어, 판단 기준, 승패 기준을 먼저 설계한다.',
    instruction: '논제 초점, 핵심 용어, 판단 기준, 승패 기준을 먼저 설계하세요.',
    tasks: reasoningTerms,
    checklist: ['논제 초점이 명확한가?', '핵심 용어와 판단 기준이 공정한가?', '승패 기준이 판정 가능하게 제시되었는가?'],
    recommendedDurationSeconds: 150,
    inputPlaceholder: '논제 초점: ...\n용어 정의: ...\n판단 기준: ...\n승패 기준: ...',
  },
  {
    id: 'advanced-opening-user',
    roundId: 'opening',
    title: '입론',
    actor: 'user',
    instruction: '주장, 논거 체계, 근거의 한계, 예상 반론까지 포함해 입론하세요.',
    checklist: ['Claim/Reason/Evidence/warrant가 구분되는가?', '근거의 한계와 예상 반론을 고려했는가?', '입론이 판단 기준과 연결되는가?'],
    recommendedDurationSeconds: 210,
    inputPlaceholder: '주장: ...\n논거 1: ...\n논거 2: ...\n근거의 한계: ...\n예상 반론 대응: ...',
  },
  {
    id: 'advanced-issue-weighing-user',
    roundId: 'rebuttal',
    title: '쟁점 및 비교 기준',
    actor: 'user',
    instruction: '양측 입론의 핵심 쟁점을 정리하고 어떤 기준으로 비교할지 제시하세요.',
    checklist: ['핵심 쟁점이 분명한가?', '비교 기준이 명확한가?', '상대 기준과 내 기준의 우선순위를 설명했는가?'],
    recommendedDurationSeconds: 160,
    inputPlaceholder: '핵심 쟁점: ...\n비교 기준: ...\n내 기준이 우선되는 이유: ...',
  },
  {
    id: 'advanced-evidence-test-user',
    roundId: 'cross-question',
    title: '증거 검증',
    actor: 'user',
    instruction: 'AI 근거의 대표성, 인과성, 최신성, 충분성을 검증하세요.',
    checklist: ['검증할 근거가 분명한가?', '대표성/인과성/최신성/충분성 중 하나 이상을 검토했는가?', '대체 해석을 제시했는가?'],
    recommendedDurationSeconds: 170,
    inputPlaceholder: '검증할 AI 근거: ...\n문제점: ...\n대체 근거/해석: ...',
  },
  {
    id: 'advanced-rebuttal-user',
    roundId: 'rebuttal',
    title: '반박',
    actor: 'user',
    purpose: '상대 논리가 왜 부족한지 결론을 내린다.\n형식: 주장 + 이유 + 근거를 사용한다.\n교차질문/상대 주장 정리 에서 얻은 정보를 바탕으로 논리적으로 공격한다.',
    instruction: '교차질문/상대 주장 분석에서 확인한 핵심 쟁점, 핵심 전제, 근거 타당성을 바탕으로 상대 논증의 비약이나 모순을 정확히 지적하세요.',
    checklist: [
      '교차 질문에서 질문한 내용과 답변으로 반박을 구성했는가?',
      '상대 주장 분석에서 검증한 핵심 쟁점, 핵심 전제, 근거 타당성을 바탕으로 반박했는가?',
      '상대 논증의 비약이나 모순을 정확히 지적했는가?',
      '대안 제시력: 현실적이고 부작용이 적은 대안을 제시했는가?',
    ],
    recommendedDurationSeconds: 180,
    inputPlaceholder: '상대 주장 분석에서 찾은 핵심 쟁점: ...\n핵심 전제/근거 타당성: ...\n약한 해결책/우선순위: ...\n논리적 비약/모순: ...\n대안 제시: 현실성/부작용 ...\n내 반박: ...',
  },
  {
    id: 'advanced-counter-rebuttal-user',
    roundId: 'counter-rebuttal',
    title: '재반박',
    actor: 'user',
    instruction: '상대의 최강 반론에 답하고 남는 쟁점의 우선순위를 재정리하세요.',
    checklist: ['상대 최강 반론을 정확히 정리했는가?', '내 답변이 직접적인가?', '남는 쟁점의 우선순위가 분명한가?'],
    recommendedDurationSeconds: 180,
    inputPlaceholder: '상대 최강 반론: ...\n내 답변: ...\n남는 쟁점: ...\n우선순위: ...',
  },
  {
    id: 'advanced-closing-user',
    roundId: 'closing',
    title: '최종 변론',
    actor: 'user',
    instruction: '쟁점별 승패와 전체 비교 우위를 압축해 최종 변론하세요.',
    checklist: ['쟁점별 승패가 정리되었는가?', '전체 비교 우위가 분명한가?', '새로운 주장을 추가하지 않았는가?'],
    recommendedDurationSeconds: 150,
    inputPlaceholder: '쟁점별 판단: ...\n최종 입장: ...\n전체 비교 우위: ...',
  },
];

export const debateSteps = beginnerDebateSteps;

export const liveDebateStep: DebateStep = {
  id: 'live-debate-user',
  roundId: 'rebuttal',
  title: '실전 공방',
  actor: 'user',
  instruction: '상대 발언의 허점, 내 근거, 중요성, 비교 우위 중 하나를 분명히 보강하세요.',
  inputPlaceholder: '상대 발언 요약: ...\n허점/빠진 전제: ...\n내 반박 또는 보완: ...\n근거/중요성/비교 우위: ...',
};

export const closingDebateStep: DebateStep = {
  id: 'closing-user',
  roundId: 'closing',
  title: '최종 정리',
  actor: 'user',
  instruction: '새 쟁점을 열지 말고, 가장 강한 근거와 상대보다 중요한 이유를 짧게 정리하세요.',
  inputPlaceholder: '핵심 쟁점: ...\n최종 입장: ...\n가장 강한 근거: ...\n상대 반론에 대한 답: ...\n비교 우위: ...',
};

export const personaDebateStep: DebateStep = {
  id: 'persona-live-user',
  roundId: 'rebuttal',
  title: '1:1 논증 훈련',
  actor: 'user',
  instruction: '페르소나의 질문에 답하면서 주장 명료성, 근거, 중요성, 비교 우위를 보강하세요.',
  inputPlaceholder: '내 답변: ...\n주장 명료화: ...\n근거/사례: ...\n왜 중요한가: ...\n상대 질문의 허점 또는 비교 우위: ...',
};

export const getOppositePosition = (position: DebatePosition): DebatePosition =>
  position === 'affirmative' ? 'negative' : 'affirmative';

export const getPositionLabel = (position?: DebatePosition): string => {
  if (position === 'affirmative') return '찬성';
  if (position === 'negative') return '반대';
  return '미정';
};

export const getDebateLevelLabel = (level?: DebateLevel): string => {
  if (level === 'intermediate') return '중급';
  return '초급';
};

export const getDebateFocusLabel = (focus?: DebateFocus): string => {
  if (focus === 'policy') return '정책형';
  if (focus === 'value') return '가치판단형';
  return '중요 사실확인형';
};

export const getDebateSteps = (level?: DebateLevel): DebateStep[] => {
  if (level === 'intermediate') return intermediateDebateSteps;
  return beginnerDebateSteps;
};

export const getStepByIndex = (index?: number, level?: DebateLevel): DebateStep => {
  const steps = getDebateSteps(level);
  return steps[index ?? 0] ?? steps[0];
};

export const getDebateStepByTurn = (
  _timeLimit: number,
  _timeRemaining: number,
  userTurnCount: number,
  level?: DebateLevel,
): DebateStep => {
  const steps = getDebateSteps(level);
  return steps[Math.min(userTurnCount, steps.length - 1)] ?? steps[0];
};

export const getDebateStepByTime = (timeLimit: number, timeRemaining: number, level?: DebateLevel): DebateStep => {
  const steps = getDebateSteps(level);
  if (timeLimit <= 0) return steps[0];

  const remainingRatio = timeRemaining / timeLimit;
  const index = Math.min(steps.length - 1, Math.floor((1 - remainingRatio) * steps.length));
  return steps[index] ?? steps[0];
};

export const buildDebateIntro = (
  topic: string,
  userPosition: DebatePosition,
  level?: DebateLevel,
): string =>
  `${getDebateLevelLabel(level)} 토론을 시작합니다. 주제는 "${topic}"이고, 당신은 ${getPositionLabel(userPosition)} 입장, 저는 ${getPositionLabel(getOppositePosition(userPosition))} 입장입니다. 먼저 ${getDebateStepByTurn(0, 0, 0, level).title} 단계에 맞춰 작성해 주세요.`;
