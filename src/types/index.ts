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
export type DebateRoomAudience = 'public' | 'organization';
export type DebateParticipantRole = 'debater' | 'opening' | 'rebuttal' | 'closing' | 'moderator';
export type DebateStageId = 'opening' | 'question' | 'answer' | 'analysis' | 'rebuttal' | 'weighing' | 'closing';
export type DebateTeamSize = 1 | 2 | 3;
export type DebateLevel = 'beginner' | 'intermediate' | 'advanced';
export type AppLanguage = 'ko' | 'en';
export type DebateFocus = 'fact' | 'policy' | 'value';
export type SimulationCategoryId = 'career' | 'negotiation' | 'workplace' | 'customer';
export type SimulationPersonaId = 'pressure_interviewer' | 'aggressive_negotiator' | 'authoritarian_manager' | 'difficult_customer';
export type SimulationDifficulty = 1 | 2 | 3;
export type DebateRoundId =
  | 'opening'
  | 'rebuttal'
  | 'cross-question'
  | 'counter-rebuttal'
  | 'closing'
  | 'judgment';

export type BattleConfig = {
  topic: string;
  language?: AppLanguage;
  topicDescription?: string;
  topicBriefing?: TopicBriefing;
  timeLimit: number;
  gameMode: GameMode;
  personaId?: PersonaId;
  userPosition?: DebatePosition;
  debateLevel?: DebateLevel;
  debateFocus?: DebateFocus;
  teamSize?: DebateTeamSize;
  allowModerator?: boolean;
  voiceEnabled?: boolean;
  participantRole?: DebateParticipantRole;
  audience?: DebateRoomAudience;
  organizationId?: string;
};

export type LiveDebateRoomSummary = {
  id: string;
  roomId: string;
  hostId: string;
  hostName: string;
  topic: string;
  topicDescription: string;
  topicBriefing?: TopicBriefing;
  language: AppLanguage;
  debateLevel: DebateLevel;
  voiceEnabled: boolean;
  timeLimit: number;
  teamSize: DebateTeamSize;
  allowModerator: boolean;
  audience: DebateRoomAudience;
  organizationId?: string;
  organizationName?: string;
  status: 'open' | 'in_progress' | 'closed';
  participantCount: number;
  createdAt: string;
  startedAt?: string;
};

export type LiveDebateLobbyParticipant = {
  userId: string;
  nickname: string;
  position?: DebatePosition;
  role?: DebateParticipantRole;
  phaseIds: DebateStageId[];
  isAi: boolean;
  isReady: boolean;
  joinedAt: string;
};

export type LiveDebateArgument = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  source: 'text' | 'voice';
  phaseId?: string;
  phaseLabel?: string;
  audioPath?: string;
  audioDeletedAt?: string;
  audioDeleteReason?: 'retention' | 'capacity' | 'cleanup';
};

export type LiveDebateEvaluationParticipant = {
  userId: string;
  nickname: string;
  position: DebatePosition;
  role: DebateParticipantRole;
  report: FinalReport;
};

export type LiveDebateEvaluation = {
  winner: 'affirmative' | 'negative' | 'draw';
  overallVerdict: string;
  affirmativeFeedback: string;
  negativeFeedback: string;
  keyClashes: string[];
  participantReports: LiveDebateEvaluationParticipant[];
  generatedAt: string;
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
  audioPath?: string;
  audioDeletedAt?: string;
  audioDeleteReason?: 'retention' | 'capacity' | 'cleanup';
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
  turnFeedbackDetail?: {
    phaseGoal: string;
    completed: string;
    missing: string;
    nextAction: string;
  };
};

export type OrganizationRole = 'owner' | 'admin' | 'coach';

export type OrganizationSummary = {
  id: string;
  name: string;
  role: OrganizationRole | 'student';
};

export type OrganizationUser = {
  id: string;
  nickname: string;
  email: string;
};

export type OrganizationTopic = {
  id: string;
  organizationId: string;
  organizationName?: string;
  title: string;
  description: string;
  briefing?: TopicBriefing;
  config?: Partial<Pick<BattleConfig, 'timeLimit' | 'debateLevel' | 'debateFocus'>>;
  isActive: boolean;
  createdAt: string;
};

export type PublicDebateTopic = {
  id: string;
  title: string;
  description: string;
  briefing: TopicBriefing;
  config: Partial<Pick<BattleConfig, 'timeLimit' | 'debateLevel' | 'debateFocus'>>;
  createdBy?: string;
  createdAt: string;
  language: AppLanguage;
};

export type OrganizationStudentRecord = {
  id: string;
  topic: string;
  debateLevel: string;
  completedAt: string;
  totalScore: number;
};

export type AdminStudent = {
  id: string;
  nickname: string;
  email: string;
  groups: string[];
  debateCount: number;
  averageScore: number;
  lastActivity: string | null;
  levelCounts: Record<string, number>;
};

export type AdminGroup = {
  id: string;
  name: string;
  studentCount: number;
  debateCount: number;
  averageScore: number;
};

export type AdminDashboard = {
  organization: OrganizationSummary;
  students: AdminStudent[];
  groups: AdminGroup[];
  categoryAverages: Record<string, number>;
};

export type SuperAdminRecord = {
  id: string;
  topic: string;
  userId: string;
  nickname: string;
  email: string;
  debateLevel: DebateLevel;
  completedAt: string;
  totalScore: number;
  report: FinalReport;
  arguments: Argument[];
};

export type SuperAdminOrganizationOwner = {
  userId: string;
  nickname: string;
  email: string;
};

export type SuperAdminOrganization = {
  id: string;
  name: string;
  createdAt: string;
  memberCount: number;
  owners: SuperAdminOrganizationOwner[];
};

export type SuperAdminDashboard = {
  totalUsers: number;
  totalRecords: number;
  activeUsers: number;
  organizations: SuperAdminOrganization[];
  records: SuperAdminRecord[];
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
  topicDescription?: string;
  language?: AppLanguage;
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
  phaseCoaching?: PhaseCoaching[];
  totalScore: number;
  xpEarned: number;
};

export type PhaseCoaching = {
  phase: string;
  observed: string;
  strength: string;
  improvement: string;
  nextAction: string;
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

export type SimulationPersona = {
  id: SimulationPersonaId;
  name: string;
  role: string;
  description: string;
  voiceName: string;
  voiceStyle: string;
  behaviorRules: string[];
  safetyRules: string[];
};

export type SimulationMission = {
  id: string;
  categoryId: SimulationCategoryId;
  title: string;
  summary: string;
  situation: string;
  userRole: string;
  objective: string;
  hiddenCounterpartGoal: string;
  personaId: SimulationPersonaId;
  difficulty: SimulationDifficulty;
  durationMinutes: number;
  openingLine: string;
  successCriteria: string[];
  coachingFocus: string[];
};

export type SimulationTurn = {
  id: string;
  speaker: 'user' | 'ai';
  content: string;
  timestamp: string;
  pressureLevel?: number;
  tactic?: string;
};

export type SimulationMetric = {
  name: string;
  score: number;
  feedback: string;
};

export type SimulationReport = {
  overallScore: number;
  outcome: 'achieved' | 'partial' | 'not_achieved';
  summary: string;
  metrics: SimulationMetric[];
  strengths: string[];
  improvements: string[];
  detectedTactics: string[];
  retryMission: string;
};

export type DebateRecord = {
  id: string;
  shareId?: string;
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

export type CommunityOpinion = {
  id: string;
  topicId: string;
  userId: string;
  nickname: string;
  position: 'affirmative' | 'negative';
  keyReason: string;
  content: string;
  createdAt: string;
  likes: number;
  isBlocked: boolean;
  blockReason?: string;
};

export type TopicOpinionStats = {
  topicId: string;
  totalOpinions: number;
  affirmativeCount: number;
  negativeCount: number;
};

export type PublicArgument = {
  id: string;
  topic: string;
  position: DebatePosition;
  claim: string;
  reason: string;
  evidence: string;
  anonymousName: string;
  createdAt: string;
};
