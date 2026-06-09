import type { DebateFocus, DebateLevel, DebatePosition, DebateStep } from '../types';

export const beginnerDebateSteps: DebateStep[] = [
  {
    id: 'opening-user',
    roundId: 'opening',
    title: '입론',
    actor: 'user',
    instruction: '내 입장을 주장, 근거, 이유 순서로 분명히 제시하세요.',
    recommendedDurationSeconds: 150,
    inputPlaceholder: '주장: ...\n근거: ...\n이유: ...',
  },
  {
    id: 'rebuttal-user',
    roundId: 'rebuttal',
    title: '상대 주장 확인 후 반론',
    actor: 'user',
    instruction: 'AI의 주장과 근거를 먼저 요약한 뒤, 가장 약한 부분을 반박하세요.',
    recommendedDurationSeconds: 120,
    inputPlaceholder: 'AI 주장 요약: ...\nAI 근거 요약: ...\n내 반론: ...\n반론 이유: ...',
  },
  {
    id: 'counter-response-user',
    roundId: 'counter-rebuttal',
    title: '상대 반론 확인 및 답변',
    actor: 'user',
    instruction: 'AI의 반론을 먼저 확인하고, 그 반론에 직접 답변하세요.',
    recommendedDurationSeconds: 120,
    inputPlaceholder: 'AI 반론 요약: ...\n내 답변: ...\n답변 근거: ...',
  },
  {
    id: 'support-user',
    roundId: 'counter-rebuttal',
    title: '내 주장 보강',
    actor: 'user',
    instruction: '남은 약점을 보완하고 내 주장을 더 강하게 만들 근거와 이유를 보강하세요.',
    recommendedDurationSeconds: 90,
    inputPlaceholder: '보완할 약점: ...\n추가 근거: ...\n왜 더 설득력 있는가: ...',
  },
  {
    id: 'closing-user',
    roundId: 'closing',
    title: '최종 발언',
    actor: 'user',
    instruction: '새 쟁점을 늘리지 말고, 최종 입장과 가장 강한 이유를 정리하세요.',
    recommendedDurationSeconds: 120,
    inputPlaceholder: '최종 입장: ...\n가장 강한 근거: ...\n상대보다 설득력 있는 이유: ...',
  },
];

export const intermediateDebateSteps: DebateStep[] = [
  {
    id: 'definition-user',
    roundId: 'opening',
    title: '용어 정의',
    actor: 'user',
    instruction: '선택한 논제 초점에 맞춰 핵심 용어와 판단 기준을 정의하세요.',
    recommendedDurationSeconds: 80,
    inputPlaceholder: '핵심 용어 정의: ...\n판단 기준: ...\n토론 범위: ...',
  },
  {
    id: 'opening-user',
    roundId: 'opening',
    title: '입론',
    actor: 'user',
    instruction: '주장, 근거, 이유, 중요성을 갖춘 입론을 제시하세요.',
    recommendedDurationSeconds: 120,
    inputPlaceholder: '주장: ...\n근거: ...\n이유: ...\n중요성: ...',
  },
  {
    id: 'issue-extraction-user',
    roundId: 'rebuttal',
    title: '쟁점 추출',
    actor: 'user',
    instruction: 'AI 상대 입론에서 핵심 쟁점과 충돌 지점을 뽑아내세요.',
    recommendedDurationSeconds: 80,
    inputPlaceholder: 'AI 주장 요약: ...\n핵심 쟁점: ...\n충돌하는 기준/근거: ...',
  },
  {
    id: 'rebuttal-user',
    roundId: 'rebuttal',
    title: '반박',
    actor: 'user',
    instruction: 'AI 주장의 전제, 근거, 영향 중 가장 약한 곳을 근거로 반박하세요.',
    recommendedDurationSeconds: 100,
    inputPlaceholder: '반박할 AI 주장: ...\n약한 전제/근거: ...\n내 반박: ...\n반박 근거: ...',
  },
  {
    id: 'cross-question-user',
    roundId: 'cross-question',
    title: '교차질문',
    actor: 'user',
    instruction: 'AI의 질문에 답하고, AI 입장의 기준이나 근거를 검증하는 질문을 던지세요.',
    recommendedDurationSeconds: 70,
    inputPlaceholder: 'AI 질문에 대한 답: ...\nAI에게 묻는 질문: ...\n이 질문이 중요한 이유: ...',
  },
  {
    id: 'counter-rebuttal-user',
    roundId: 'counter-rebuttal',
    title: '재반박',
    actor: 'user',
    instruction: 'AI의 반박에 답하면서 내 기준과 근거를 더 강하게 재구성하세요.',
    recommendedDurationSeconds: 100,
    inputPlaceholder: 'AI 반박 요약: ...\n내 답변: ...\n보강 근거: ...\n비교 우위: ...',
  },
  {
    id: 'closing-user',
    roundId: 'closing',
    title: '결론',
    actor: 'user',
    instruction: '핵심 쟁점, 최종 입장, 비교 우위를 정리하세요.',
    recommendedDurationSeconds: 50,
    inputPlaceholder: '핵심 쟁점: ...\n최종 입장: ...\n가장 강한 근거: ...\n상대보다 중요한 이유: ...',
  },
];

export const advancedDebateSteps: DebateStep[] = [
  {
    id: 'framing-user',
    roundId: 'opening',
    title: '논제 설계',
    actor: 'user',
    instruction: '논제 초점, 핵심 용어, 판단 기준, 승패 기준을 먼저 설계하세요.',
    recommendedDurationSeconds: 150,
    inputPlaceholder: '논제 초점: ...\n용어 정의: ...\n판단 기준: ...\n승패 기준: ...',
  },
  {
    id: 'opening-user',
    roundId: 'opening',
    title: '입론',
    actor: 'user',
    instruction: '주장, 논거 체계, 근거의 한계, 예상 반론까지 포함해 입론하세요.',
    recommendedDurationSeconds: 210,
    inputPlaceholder: '주장: ...\n논거 1: ...\n논거 2: ...\n근거의 한계: ...\n예상 반론 대응: ...',
  },
  {
    id: 'issue-weighing-user',
    roundId: 'rebuttal',
    title: '쟁점 및 비교 기준',
    actor: 'user',
    instruction: '양측 입론의 핵심 쟁점을 정리하고 어떤 기준으로 비교할지 제시하세요.',
    recommendedDurationSeconds: 160,
    inputPlaceholder: '핵심 쟁점: ...\n비교 기준: ...\n내 기준이 우선되는 이유: ...',
  },
  {
    id: 'evidence-test-user',
    roundId: 'cross-question',
    title: '증거 검증',
    actor: 'user',
    instruction: 'AI 근거의 대표성, 인과성, 최신성, 충분성을 검증하세요.',
    recommendedDurationSeconds: 170,
    inputPlaceholder: '검증할 AI 근거: ...\n문제점: ...\n대체 근거/해석: ...',
  },
  {
    id: 'rebuttal-user',
    roundId: 'rebuttal',
    title: '반박',
    actor: 'user',
    instruction: 'AI 입장의 가장 중요한 전제를 무너뜨리고 내 영향이 더 크다는 점을 보이세요.',
    recommendedDurationSeconds: 180,
    inputPlaceholder: 'AI 핵심 전제: ...\n반박: ...\n내 영향/가치가 더 큰 이유: ...',
  },
  {
    id: 'counter-rebuttal-user',
    roundId: 'counter-rebuttal',
    title: '재반박',
    actor: 'user',
    instruction: '상대의 최강 반론에 답하고 남는 쟁점의 우선순위를 재정리하세요.',
    recommendedDurationSeconds: 180,
    inputPlaceholder: '상대 최강 반론: ...\n내 답변: ...\n남는 쟁점: ...\n우선순위: ...',
  },
  {
    id: 'closing-user',
    roundId: 'closing',
    title: '최종 변론',
    actor: 'user',
    instruction: '쟁점별 승패와 전체 비교 우위를 압축해 최종 변론하세요.',
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
  if (level === 'advanced') return '고급';
  if (level === 'intermediate') return '중급';
  return '초급';
};

export const getDebateFocusLabel = (focus?: DebateFocus): string => {
  if (focus === 'policy') return '정책형';
  if (focus === 'value') return '가치판단형';
  return '중요 사실확인형';
};

export const getDebateSteps = (level?: DebateLevel): DebateStep[] => {
  if (level === 'advanced') return advancedDebateSteps;
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

  if (remainingRatio <= 0.18) return steps[Math.min(4, steps.length - 1)];
  if (remainingRatio <= 0.45) return steps[Math.min(3, steps.length - 1)];
  if (remainingRatio <= 0.7) return steps[Math.min(2, steps.length - 1)];
  if (remainingRatio <= 0.9) return steps[Math.min(1, steps.length - 1)];
  return steps[0];
};

export const buildDebateIntro = (
  topic: string,
  userPosition: DebatePosition,
  level?: DebateLevel,
  focus?: DebateFocus,
): string =>
  `${getDebateLevelLabel(level)} 토론을 시작합니다. 주제는 "${topic}"이고, 당신은 ${getPositionLabel(userPosition)} 입장, 저는 ${getPositionLabel(getOppositePosition(userPosition))} 입장입니다. 논제 초점은 ${getDebateFocusLabel(focus)}입니다. 먼저 ${getDebateStepByTurn(0, 0, 0, level).title} 단계에 맞춰 작성해 주세요.`;
