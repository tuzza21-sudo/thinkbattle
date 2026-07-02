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
export type DebateLevel = 'beginner' | 'intermediate' | 'advanced';
export type DebateFocus = 'fact' | 'policy' | 'value';
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
  debateLevel?: DebateLevel;
  debateFocus?: DebateFocus;
};

export type DebateStep = {
  id: string;
  roundId: DebateRoundId;
  title: string;
  actor: 'user' | 'ai' | 'judge';
  purpose?: string;
  instruction: string;
  tasks?: string[];
  checklist?: string[];
  sentenceFrames?: string[];
  recommendedDurationSeconds?: number;
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
  recommendedDurationSeconds?: number;
  elapsedSeconds?: number;
  overtimeSeconds?: number;
  nextTask?: string;
  // AI-specific parsed fields (from the prompt)
  aiQuestion?: string;
  aiLesson?: string;
  turnXp?: number;
  turnFeedback?: string;
};

export type ScoreCategory = {
  name: string; // e.g., "Claim 명확성", "Reason 연결성", "Evidence 적합성"
  score: number;
  maxScore: number;
  feedback: string;
  xpEarned?: number;
};

export type BattleState = {
  id: string;
  topic: string;
  matchType: string;
  gameMode: GameMode;
  personaId?: PersonaId;
  userPosition?: DebatePosition;
  aiPosition?: DebatePosition;
  debateLevel?: DebateLevel;
  debateFocus?: DebateFocus;
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

export type EnglishRephraseFeedback = {
  meaningAccuracy: string;
  naturalExpression: string;
  debateExpression: string;
  nativeVersion: string;
  draftBasedVersion: string;
  practiceTip: string;
  score: number;
};

export type EnglishRephraseEntry = {
  argumentId: string;
  englishDraft: string;
  feedback: EnglishRephraseFeedback;
  updatedAt: string;
};

export type DebateRecord = {
  id: string;
  userId: string;
  topic: string;
  matchType: string;
  gameMode: GameMode;
  userPosition?: DebatePosition;
  aiPosition?: DebatePosition;
  debateLevel?: DebateLevel;
  debateFocus?: DebateFocus;
  durationSeconds: number;
  completedAt: string;
  arguments: Argument[];
  report: FinalReport;
  englishRephrases?: EnglishRephraseEntry[];
};

export type DebateSide = {
  title: string;
  points: string[];
};

export type NewsLink = {
  label: string;
  url: string;
};

export type TopicBriefing = {
  context: string;
  recentCases: string[];
  newsLinks: NewsLink[];
  affirmative: DebateSide;
  negative: DebateSide;
  prepQuestions: string[];
  keywords: string[];
};

export type FeaturedBattle = {
  id: string;
  topic: string;
  mode: string;
  players: number;
  time: number;
  accent: 'cyan' | 'amber' | 'pink';
  config: BattleConfig;
  briefing: TopicBriefing;
  category?: string;
};

export type WeeklyIssue = FeaturedBattle & {
  issueDate: string;
  issueNumber: number;
};
