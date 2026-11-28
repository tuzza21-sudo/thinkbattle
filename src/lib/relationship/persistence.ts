import { createClosestRelationship, restoreRelationship } from './engine.js';
import { moodKeys, type Mood, type RelationshipConfig, type RelationshipRecord } from './types.js';

/** A row of `voice_lounge_relationships`. */
export type RelationshipRow = {
  user_id: string; character_id: string; scores: Record<string, number>; stage: string;
  pending: RelationshipRecord['pending']; recent_events: RelationshipRecord['recentEvents']; memories: RelationshipRecord['memories'];
  meaningful_turns: number; turn_count: number; last_interaction_at: string | null; version: number;
};

/** Accounts that start every character at the closest stage when they have no relationship yet (the adult-mode beta tester), plus LOUNGE_CLOSEST_START_USERS (emails or user ids). */
export const relationshipClosestStartAccounts = ['adult05@saseok.kr', 'adult06@saseok.kr', 'adult07@saseok.kr'];
export function startsAtClosestStage(user: { id?: string; email?: string } | undefined, env: Record<string, string | undefined> = {}) {
  const listed = [...relationshipClosestStartAccounts, ...(env.LOUNGE_CLOSEST_START_USERS || '').split(',')].map(value => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(user && (listed.includes((user.id ?? '').toLowerCase()) || (user.email && listed.includes(user.email.toLowerCase()))));
}

export function relationshipFromRow(config: RelationshipConfig, row?: RelationshipRow | null, options: { closest?: boolean } = {}): RelationshipRecord {
  if (!row) return options.closest ? createClosestRelationship(config) : restoreRelationship(config, null);
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
