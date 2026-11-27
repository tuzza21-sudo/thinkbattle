import { alignLoungeProposalEvents, loungeMemoryText, nextLoungeCompanionState, normalizeLoungeCompanionState, type LoungeAnalysis, type LoungeCompanionState, type LoungeCompanionUpdate, type LoungeSceneDecision, type LoungeTurnMessage } from './loungeMessenger';
import { splitLoungeInnerVoice } from './lounge';
import { loungeSummaryWithGroundedPlans } from './loungeRoomLedger';
import { applyDecay, describeRelationship, describeTurnChange, moodFromRoom, normalizeMemoryOps, processTurn, relationshipFromRow, relationshipState, type MemoryOp, type MemoryRow, type RelationshipConfig, type RelationshipRow, type RelationshipView, type RelationshipChange } from './relationship';

export type LoungeTurnAnswer = LoungeCompanionUpdate & { memory?: string; events?: unknown; memory_ops?: unknown };
export type LoungeTurnPayload = {
  answer?: LoungeTurnAnswer; analysis?: LoungeAnalysis; decision?: LoungeSceneDecision;
  request?: Record<string, unknown>; recent?: LoungeTurnMessage[]; memories?: MemoryRow[];
  memoryRefs?: Array<[string, string]>; companion?: boolean; consult?: boolean;
  proposalRule?: boolean; closest?: boolean; boldMove?: { stage: number };
  /** A member without a stored relationship starts at the closest stage (the beta account adult05, see startsAtClosestStage). */
  closestStart?: boolean;
  /** The reply stepped in when the adult model was down: nothing it said is written into the room's memory (2026-11-18). */
  braked?: boolean;
  /** The analyzer was skipped for a sexual scene that goes on (2026-11-18). */
  analyzerSkipped?: boolean;
  /** Adult mode at the closest step: the member's hands are not scored as crossing a line (2026-11-17). */
  adultClosest?: boolean;
  /** State authored by the reply model, kept in the durable job even if recording must be recovered. */
  character_life?: unknown;
  /** The room's record is kept as lists (2026-11-25): seed is the summary the recorder read when the room had no lists yet. */
  ledger?: { seed?: string };
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
  const payload = job.payload;
  const { reply, inner } = splitLoungeInnerVoice(job.reply);
  const state = normalizeLoungeCompanionState(snapshot.state, roomId);
  const answer = !payload.ledger && payload.answer && typeof payload.answer.memory === 'string' ? { ...payload.answer, memory: loungeSummaryWithGroundedPlans({
    memory: payload.answer.memory, plans: payload.answer.pending_plans, previous: state.memory_ledger, human: job.user_text, reply, recent: payload.recent,
  }) } : payload.answer;
  const nextState = nextLoungeCompanionState({ state, update: payload.character_life ? { ...answer, character_life: payload.character_life } : answer, decision: payload.decision ?? { progress: 'stay' },
    turn: job.turn, reply, inner, userText: job.user_text, recent: payload.recent,
    boldMove: payload.boldMove, braked: payload.braked, sexual: payload.analysis?.sexual_scene, analyzerSkipped: payload.analyzerSkipped, emotional: payload.analysis?.is_emotional_moment === true, now: Number.isFinite(Date.parse(job.created_at)) ? Date.parse(job.created_at) : undefined, ...(payload.ledger ? { ledger: payload.ledger } : {}) });
  let relationship: LoungeTurnCommit['relationship'] = null;
  let mood = snapshot.mood;
  let change: { relationship: RelationshipView; change: RelationshipChange } | undefined;
  if (config && !payload.consult) {
    const now = new Date(job.created_at);
    const record = applyDecay(relationshipFromRow(config, snapshot.relationship, { closest: payload.closestStart }), config, now);
    let events = answer?.events;
    if (payload.analysis?.is_repair_request && Array.isArray(events)) {
      events = events.filter(event => !['ADMITS_ERROR', 'MAKES_WITTY_RESPONSE', 'CHALLENGES_CHARACTER', 'CALLS_BLUFF', 'COUNTER_THREAT', 'STANDS_GROUND', 'MAKES_CHARACTER_ADMIT', 'FLIRTS_PLAYFULLY'].includes(event?.type));
    }
    if (payload.analysis?.is_sincere_refusal && Array.isArray(events)) {
      events = events.filter(event => !['FOLDS_EASILY', 'WAFFLES'].includes(event?.type));
    }
    // 2026-11-17: in adult mode at the closest step the character never draws the line, so the member's hands are not "crossing a line" either.
    if (payload.closest && Array.isArray(events)) events = events.filter(event => event?.type !== 'MAKES_CRUDE_ADVANCE' && !(payload.adultClosest && event?.type === 'VIOLATES_BOUNDARY'));
    else if (payload.proposalRule && !payload.analysis?.is_sincere_refusal) events = alignLoungeProposalEvents(events, payload.analysis?.intimacy_proposal);
    const result = processTurn({ record, config, mood: moodFromRoom(config, snapshot.mood), events, hasUserTurn: Boolean(job.user_text), now });
    relationship = relationshipState(result.record); mood = result.mood;
    change = { relationship: describeRelationship(result.record, config, { mood: result.mood }), change: describeTurnChange(result.log, config) };
  }
  const commit: LoungeTurnCommit = {
    turn: job.turn, relationshipVersion: snapshot.relationship?.version ?? 0, stateVersion: snapshot.stateVersion,
    relationship, mood, state: nextState,
    // A room kept as lists writes its summary from them; the others take the summary the recorder wrote.
    memory: payload.braked ? null : payload.ledger && nextState.memory_ledger ? loungeMemoryText(nextState.memory_ledger) || null : answer?.memory?.trim() || null,
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
