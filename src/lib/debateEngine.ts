import type { DebatePosition, DebateStep } from '../types';

export const debateSteps: DebateStep[] = [
  {
    id: 'opening-user',
    roundId: 'opening',
    title: '입장 제시',
    actor: 'user',
    instruction: '주장, 이유, 근거를 묶어 첫 입장을 제시하세요.',
    inputPlaceholder: '주장: ...\n이유: ...\n근거: ...\n결론: ...',
  },
  {
    id: 'rebuttal-user',
    roundId: 'rebuttal',
    title: '반박',
    actor: 'user',
    instruction: '상대의 핵심 반론을 짚고, 내 입장의 근거로 맞받아치세요.',
    inputPlaceholder: '상대 주장 요약: ...\n내 반박: ...\n추가 근거: ...',
  },
  {
    id: 'cross-question-user',
    roundId: 'cross-question',
    title: '질문 응답',
    actor: 'user',
    instruction: 'AI의 질문에 답하면서 숨은 전제나 판단 기준을 분명히 하세요.',
    inputPlaceholder: '질문에 대한 답: ...\n내 기준: ...\n상대에게 되묻고 싶은 점: ...',
  },
  {
    id: 'counter-rebuttal-user',
    roundId: 'counter-rebuttal',
    title: '재반박',
    actor: 'user',
    instruction: '지금까지의 반박을 정리하고, 가장 약한 지점을 보완하세요.',
    inputPlaceholder: '상대 반론 요약: ...\n내 재반박: ...\n보완 근거: ...',
  },
  {
    id: 'closing-user',
    roundId: 'closing',
    title: '최종 의견',
    actor: 'user',
    instruction: '새 쟁점을 늘리지 말고, 핵심 논점과 보완된 최종 입장을 제시하세요.',
    inputPlaceholder: '핵심 쟁점: ...\n보완된 최종 입장: ...\n마무리: ...',
  },
];

export const liveDebateStep: DebateStep = {
  id: 'live-debate-user',
  roundId: 'rebuttal',
  title: '실전 공방',
  actor: 'user',
  instruction: '상대의 방금 발언 중 가장 약한 지점을 짚고, 내 주장이나 근거를 한 단계 보강하세요.',
  inputPlaceholder: '상대 발언 요약: ...\n내 반박: ...\n보강할 기준/근거/사례: ...',
};

export const closingDebateStep: DebateStep = {
  id: 'closing-user',
  roundId: 'closing',
  title: '최종 정리',
  actor: 'user',
  instruction: '새 쟁점을 열지 말고, 가장 강한 근거와 보완된 입장을 짧게 정리하세요.',
  inputPlaceholder: '핵심 쟁점: ...\n최종 입장: ...\n가장 강한 근거: ...\n상대 반론에 대한 답: ...',
};

export const getOppositePosition = (position: DebatePosition): DebatePosition =>
  position === 'affirmative' ? 'negative' : 'affirmative';

export const getPositionLabel = (position?: DebatePosition): string => {
  if (position === 'affirmative') return '찬성';
  if (position === 'negative') return '반대';
  return '미정';
};

export const getStepByIndex = (index?: number): DebateStep =>
  debateSteps[index ?? 0] ?? debateSteps[0];

export const getDebateStepByTurn = (
  timeLimit: number,
  timeRemaining: number,
  userTurnCount: number,
): DebateStep => {
  if (timeLimit > 0 && timeRemaining / timeLimit <= 0.15) return closingDebateStep;
  if (userTurnCount <= 0) return debateSteps[0];
  return liveDebateStep;
};

export const getDebateStepByTime = (timeLimit: number, timeRemaining: number): DebateStep => {
  if (timeLimit <= 0) return debateSteps[0];

  const remainingRatio = timeRemaining / timeLimit;

  if (remainingRatio <= 0.18) return debateSteps[4];
  if (remainingRatio <= 0.45) return debateSteps[3];
  if (remainingRatio <= 0.7) return debateSteps[2];
  if (remainingRatio <= 0.9) return debateSteps[1];
  return debateSteps[0];
};

export const buildDebateIntro = (
  topic: string,
  userPosition: DebatePosition,
): string =>
  `제가 먼저 시작하겠습니다. 주제는 "${topic}"이고, 당신은 ${getPositionLabel(userPosition)} 입장, 저는 ${getPositionLabel(getOppositePosition(userPosition))} 입장에서 토론하겠습니다. 먼저 이 쟁점에서 가장 중요하다고 보는 기준과 첫 주장을 제시해 주세요.`;
