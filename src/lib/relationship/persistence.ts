import { restoreRelationship } from './engine';
import { moodKeys, type Mood, type RelationshipConfig, type RelationshipRecord } from './types';

/** A row of `voice_lounge_relationships`. */
export type RelationshipRow = {
  user_id: string; character_id: string; scores: Record<string, number>; stage: string;
  pending: RelationshipRecord['pending']; recent_events: RelationshipRecord['recentEvents']; memories: RelationshipRecord['memories'];
  meaningful_turns: number; turn_count: number; last_interaction_at: string | null; version: number;
};

export function relationshipFromRow(config: RelationshipConfig, row?: RelationshipRow | null): RelationshipRecord {
  if (!row) return restoreRelationship(config, null);
  return restoreRelationship(config, {
    scores: row.scores, stage: row.stage, pending: row.pending, recentEvents: row.recent_events, memories: row.memories,
    meaningfulTurns: row.meaningful_turns, turnCount: row.turn_count, lastInteractionAt: row.last_interaction_at, version: row.version,
  });
}

/** The state argument of `save_voice_lounge_relationship`. */
export const relationshipState = (record: RelationshipRecord) => ({
  scores: record.scores, stage: record.stage, pending: record.pending, recentEvents: record.recentEvents, memories: record.memories,
  meaningfulTurns: record.meaningfulTurns, turnCount: record.turnCount, lastInteractionAt: record.lastInteractionAt,
});

/** The stored mood of the current room, or the character's baseline for a new session. */
export function moodFromRoom(config: RelationshipConfig, stored: unknown): Mood {
  const value = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  return Object.fromEntries(moodKeys.map(key => [key, typeof value[key] === 'number' ? Math.min(100, Math.max(0, value[key] as number)) : config.initialMood[key]])) as Mood;
}
