import type { RelationshipEventType } from './events.js';

export const commonMetrics = ['trust', 'respect', 'interest', 'comfort', 'openness'] as const;
export type CommonMetric = typeof commonMetrics[number];
export const moodKeys = ['amusement', 'irritation', 'curiosity', 'excitement', 'boredom'] as const;
export type MoodKey = typeof moodKeys[number];
export type Mood = Record<MoodKey, number>;
/** Scores keyed by metric id: the five common metrics plus the character's two unique metrics. */
export type Scores = Record<string, number>;

export type MetricSpec = { id: string; name: string; description: string; labels: readonly [string, string, string, string, string] };
export type EventEffect = {
  /** Score change for a confident, first-time occurrence. */
  deltas: Partial<Record<string, number>>;
  mood?: Partial<Mood>;
};
export type StageCondition = { min?: Partial<Record<string, number>>; max?: Partial<Record<string, number>> };
export type StageRule = {
  id: string;
  label: string;
  /** What the character says about the user at this stage; shown in logs and used as tone reference. */
  line: string;
  /** How the stage changes behaviour. Sent to the response model. */
  hint: string;
  enter: StageCondition;
  /** Lower bound to keep the stage once reached. Defaults to `enter.min` minus the hysteresis band. */
  hold?: StageCondition;
  enabled?: boolean;
};
export type DecayRule = { graceDays: number; perDay: number; floor: number };

export type RelationshipConfig = {
  characterId: string;
  displayName: string;
  core: readonly string[];
  uniqueMetrics: readonly [MetricSpec, MetricSpec];
  initial: Scores;
  initialMood: Mood;
  /** Character-specific reactions. Events not listed fall back to the shared defaults. */
  events: Partial<Record<RelationshipEventType, EventEffect>>;
  /** Ordered from the first stage to the closest. The first stage has no conditions. */
  stages: readonly StageRule[];
  responseHints: readonly string[];
  /** How this character brings up long-term memories, so the same memory sounds different per character. */
  memoryStyle?: string;
  /** One-to-one speech level: polite until this stage id, casual (banmal) from it on. Absent means polite throughout. Group rooms are always polite. */
  casualFromStage?: string;
  decay?: Partial<Record<string, DecayRule>>;
  maxGainPerTurn?: Partial<Record<string, number>>;
};

export type DetectedEvent = { type: RelationshipEventType; confidence: number; note?: string };
export type RecentEvent = { type: RelationshipEventType; turn: number; at: string };
export type RelationshipMemory = { type: RelationshipEventType; summary: string; at: string; importance: number; turn: number };
export type PendingStage = { direction: 'up' | 'down' | null; turns: number };
export type RelationshipRecord = {
  characterId: string;
  scores: Scores;
  stage: string;
  pending: PendingStage;
  recentEvents: RecentEvent[];
  memories: RelationshipMemory[];
  meaningfulTurns: number;
  turnCount: number;
  lastInteractionAt: string | null;
  version: number;
};

export type AppliedEvent = { type: RelationshipEventType; confidence: number; weight: number; deltas: Partial<Record<string, number>> };
export type TurnLog = {
  accepted: AppliedEvent[];
  ignored: Array<{ type: string; reason: 'low_confidence' | 'unknown' | 'duplicate' | 'no_user_turn' | 'diminished' }>;
  delta: Scores;
  stageBefore: string;
  stageAfter: string;
  stageChange: 'promoted' | 'demoted' | null;
  meaningful: boolean;
  protectedTurn: boolean;
};

export type MetricView = { label: string; score?: number };
export type RelationshipView = {
  characterId: string;
  /** What the character remembers about the user, shown to the user. */
  remembered?: Array<{ kind: string; label: string; summary: string; followUp?: string }>;
  macroState: { id: string; label: string };
  metrics: Record<string, MetricView & { name: string }>;
  debug?: {
    scores: Scores;
    mood: Mood;
    pending: PendingStage;
    recentEvents: RecentEvent[];
    memories: RelationshipMemory[];
    meaningfulTurns: number;
    turnCount: number;
    version: number;
  };
};
