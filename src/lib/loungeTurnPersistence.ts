import { alignLoungeProposalEvents, nextLoungeCompanionState, normalizeLoungeCompanionState, type LoungeAnalysis, type LoungeCompanionState, type LoungeCompanionUpdate, type LoungeSceneDecision, type LoungeTurnMessage } from './loungeMessenger';
import { splitLoungeInnerVoice } from './lounge';
import { applyDecay, describeRelationship, describeTurnChange, moodFromRoom, normalizeMemoryOps, processTurn, relationshipFromRow, relationshipState, type MemoryOp, type MemoryRow, type RelationshipConfig, type RelationshipRow, type RelationshipView, type RelationshipChange } from './relationship';

export type LoungeTurnAnswer = LoungeCompanionUpdate & { memory?: string; events?: unknown; memory_ops?: unknown };
export type LoungeTurnPayload = {
  answer?: LoungeTurnAnswer; analysis?: LoungeAnalysis; decision?: LoungeSceneDecision;
  request?: Record<string, unknown>; recent?: LoungeTurnMessage[]; memories?: MemoryRow[];
  memoryRefs?: Array<[string, string]>; companion?: boolean; consult?: boolean;
  proposalRule?: boolean; closest?: boolean; boldMove?: { stage: number };
};
export type LoungePendingTurn = {
  room_id: string; turn: number; user_text: string; reply: string;
  status: 'pending' | 'ready' | 'applied'; payload: LoungeTurnPayload; created_at: string; updated_at: string;
};
export type LoungeTurnSnapshot = { relationship: RelationshipRow | null; state: unknown; stateVersion: number; mood: unknown };
export type LoungeTurnCommit = {
  turn: number; relationshipVersion: number; stateVersion: number;
  relationship: ReturnType<typeof relationshipState> | null; mood: unknown;
  state: LoungeCompanionState; memory: string | null; memoryOps: MemoryOp[];
};
export type LoungeTurnStore = {
  pending: () => Promise<LoungePendingTurn[]>;
  snapshot: () => Promise<LoungeTurnSnapshot>;
  commit: (value: LoungeTurnCommit) => Promise<'saved' | 'applied' | 'conflict' | 'blocked' | 'missing'>;
  /** true: prepared, go on. 'failed': tried and failed (counts against the turn). false: not tried now (e.g. one per response). */
  recover?: (turn: LoungePendingTurn) => Promise<boolean | 'failed'>;
  /** Records a failed try. true once the turn has failed too often and was closed unapplied, so the turns after it can go on. */
  fail?: (turn: LoungePendingTurn) => Promise<boolean>;
};

/** Always reduce on the last committed state, never on the snapshot captured before the reply. */
export function reduceLoungeTurn(roomId: string, config: RelationshipConfig | undefined, snapshot: LoungeTurnSnapshot, job: LoungePendingTurn) {
  const payload = job.payload, answer = payload.answer;
  const { reply, inner } = splitLoungeInnerVoice(job.reply);
  const state = normalizeLoungeCompanionState(snapshot.state, roomId);
  const nextState = nextLoungeCompanionState({ state, update: answer, decision: payload.decision ?? { progress: 'stay' },
    turn: job.turn, reply, inner, userText: job.user_text, recent: payload.recent,
    boldMove: payload.boldMove, emotional: payload.analysis?.is_emotional_moment === true });
  let relationship: LoungeTurnCommit['relationship'] = null;
  let mood = snapshot.mood;
  let change: { relationship: RelationshipView; change: RelationshipChange } | undefined;
  if (config && !payload.consult) {
    const now = new Date(job.created_at);
    const record = applyDecay(relationshipFromRow(config, snapshot.relationship), config, now);
    let events = answer?.events;
    if (payload.analysis?.is_sincere_refusal && Array.isArray(events)) {
      events = events.filter(event => !['FOLDS_EASILY', 'WAFFLES'].includes(event?.type));
    }
    if (payload.closest && Array.isArray(events)) events = events.filter(event => event?.type !== 'MAKES_CRUDE_ADVANCE');
    else if (payload.proposalRule && !payload.analysis?.is_sincere_refusal) events = alignLoungeProposalEvents(events, payload.analysis?.intimacy_proposal);
    const result = processTurn({ record, config, mood: moodFromRoom(config, snapshot.mood), events, hasUserTurn: Boolean(job.user_text), now });
    relationship = relationshipState(result.record); mood = result.mood;
    change = { relationship: describeRelationship(result.record, config, { mood: result.mood }), change: describeTurnChange(result.log, config) };
  }
  const commit: LoungeTurnCommit = {
    turn: job.turn, relationshipVersion: snapshot.relationship?.version ?? 0, stateVersion: snapshot.stateVersion,
    relationship, mood, state: nextState, memory: answer?.memory?.trim() || null,
    memoryOps: job.user_text.trim() ? normalizeMemoryOps(answer?.memory_ops, new Map(payload.memoryRefs ?? []), payload.memories ?? []) : [],
  };
  return { commit, change };
}

/**
 * A pending older reply is a barrier. Concurrent drainers use CAS and reload, so no event is applied twice or lost.
 * A turn whose recording or commit keeps failing is closed after a few tries (store.fail) so it cannot hold back every later turn.
 */
export async function drainLoungeTurns(roomId: string, config: RelationshipConfig | undefined, store: LoungeTurnStore, now = Date.now()) {
  let last: { relationship: RelationshipView; change: RelationshipChange } | undefined;
  for (let attempt = 0; attempt < 32; attempt++) {
    const job = (await store.pending()).filter(job => job.status !== 'applied').sort((a, b) => a.turn - b.turn)[0];
    if (!job) break;
    if (job.status === 'pending') {
      if (now - Date.parse(job.updated_at) < 60_000 || !store.recover) break;
      const recovered = await store.recover(job);
      if (recovered === true) continue;
      if (recovered === 'failed' && await store.fail?.(job)) continue;
      break;
    }
    const reduced = reduceLoungeTurn(roomId, config, await store.snapshot(), job);
    let result: Awaited<ReturnType<LoungeTurnStore['commit']>>;
    try { result = await store.commit(reduced.commit); }
    catch (error) { if (await store.fail?.(job)) continue; throw error; }
    if (result === 'conflict' || result === 'applied') continue;
    if (result !== 'saved') break;
    if (reduced.change) last = reduced.change;
  }
  return last;
}
