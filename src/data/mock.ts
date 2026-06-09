import type { BattleState, FinalReport, Player } from '../types';

export const mockPlayerA: Player = {
  id: 'p1',
  name: '도전자',
  avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
  level: 12,
  rankBadge: '골드 III',
  score: 1250,
  streak: 3,
  isAi: false,
};

export const mockPlayerB: Player = {
  id: 'p2',
  name: 'AI 토론자',
  avatar: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&w=150&q=80',
  level: 15,
  rankBadge: '플래티넘 I',
  score: 1840,
  streak: 7,
  isAi: true,
};

export const initialBattleState: BattleState = {
  id: 'battle-101',
  topic: '인공지능은 사회에 이익보다 해를 더 많이 끼치는가?',
  matchType: '정식 토론',
  gameMode: 'debate',
  userPosition: 'affirmative',
  aiPosition: 'negative',
  debateLevel: 'beginner',
  debateFocus: 'fact',
  timeLimit: 300,
  timeRemaining: 300,
  playerA: mockPlayerA,
  playerB: mockPlayerB,
  arguments: [
    {
      id: 'arg1',
      playerId: 'p1',
      isAi: false,
      roundId: 'opening',
      roundTitle: '입론',
      content: '인공지능은 자동화로 일자리 불안을 확대하고, 편향된 데이터로 사회적 차별을 재생산할 위험이 있습니다.',
      timestamp: '10:02 AM',
    },
  ],
  isFinished: false,
};

export const mockResult: FinalReport = {
  overallFeedback: '핵심 주장은 분명하지만 근거가 더 구체적이어야 합니다. 상대 반론을 먼저 요약한 뒤 반박하면 구조가 좋아집니다.',
  categories: [
    { name: 'Claim 명확성', score: 80, maxScore: 100, feedback: '주장은 분명하지만 더 구체적인 범위 설정이 있으면 좋습니다.' },
    { name: 'Reason 연결성', score: 74, maxScore: 100, feedback: '이유가 주장과 대체로 이어지지만 중간 논리 고리를 더 보여주세요.' },
    { name: 'Evidence 적합성', score: 72, maxScore: 100, feedback: '통계나 사례처럼 검증 가능한 근거가 더 필요합니다.' },
    { name: 'Impact', score: 76, maxScore: 100, feedback: '문제의 중요성을 설명했지만 피해 규모나 파급 효과가 더 선명하면 좋습니다.' },
    { name: 'Weighing', score: 70, maxScore: 100, feedback: '상대 주장보다 왜 더 우선되어야 하는지 비교 기준을 명확히 제시해보세요.' },
  ],
  totalScore: 74,
  xpEarned: 150,
};
