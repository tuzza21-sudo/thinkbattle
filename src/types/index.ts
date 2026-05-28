export type Player = {
  id: string;
  name: string;
  avatar: string;
  level: number;
  rankBadge: string;
  score: number;
  streak: number;
  isAi: boolean;
  league?: '초급' | '중급' | '고급';
};

export type AppUser = {
  id: string;
  email: string;
  nickname: string;
  provider: 'email' | 'kakao' | 'google';
  createdAt: string;
};

export type PersonaId = 'socrates' | 'jeong_yakyong' | 'kant' | 'nietzsche';
export type GameMode = 'persona' | 'roundtable' | 'debate' | 'pvp';
export type DebatePosition = 'affirmative' | 'negative';
export type DebateRoundId =
  | 'opening'
  | 'rebuttal'
  | 'cross-question'
  | 'counter-rebuttal'
  | 'closing'
  | 'judgment';

export type BattleConfig = {
  topic: string;
  timeLimit: number;
  gameMode: GameMode;
  personaId?: PersonaId;
  userPosition?: DebatePosition;
};

export type DebateStep = {
  id: string;
  roundId: DebateRoundId;
  title: string;
  actor: 'user' | 'ai' | 'judge';
  instruction: string;
  inputPlaceholder?: string;
};

export type Argument = {
  id: string;
  playerId: string;
  isAi: boolean;
  content: string;
  timestamp: string;
  roundId?: DebateRoundId;
  roundTitle?: string;
  nextTask?: string;
  // AI-specific parsed fields (from the prompt)
  aiQuestion?: string;
  aiLesson?: string;
};

export type ScoreCategory = {
  name: string; // e.g., "Claim 명확성", "Reason 연결성", "Evidence 적합성"
  score: number;
  maxScore: number;
  feedback: string;
};

export type BattleState = {
  id: string;
  topic: string;
  matchType: string;
  gameMode: GameMode;
  personaId?: PersonaId;
  userPosition?: DebatePosition;
  aiPosition?: DebatePosition;
  timeLimit: number; // in seconds (e.g., 180, 300, 600)
  timeRemaining: number; // in seconds
  playerA: Player;
  playerB: Player;
  arguments: Argument[];
  isFinished: boolean;
};

export type FinalReport = {
  overallFeedback: string;
  categories: ScoreCategory[];
  totalScore: number;
  xpEarned: number;
};

export type DebateRecord = {
  id: string;
  userId: string;
  topic: string;
  matchType: string;
  gameMode: GameMode;
  userPosition?: DebatePosition;
  aiPosition?: DebatePosition;
  durationSeconds: number;
  completedAt: string;
  arguments: Argument[];
  report: FinalReport;
};
