import { defaultEventEffects, protectiveEvents, sharedConnectionEvents, relationshipEventCatalog, relationshipEventLabels, relationshipEventTypes, retiredRelationshipEvents, shieldedEvents, type EventSeverity, type RelationshipEventType } from './events.js';
import { commonMetrics, moodKeys, type AppliedEvent, type DetectedEvent, type Mood, type RelationshipConfig, type RelationshipMemory, type RelationshipChange, type RelationshipRecord, type RelationshipView, type Scores, type StageCondition, type TurnLog } from './types.js';

export const relationshipSettings = {
  minConfidence: 0.6,
  fullConfidence: 0.8,
  lowConfidenceWeight: 0.7,
  /** Two at most, the most marked (2026-11-02; three before). */
  maxEventsPerTurn: 2,
  /** With a character's own list of events (mainEvents), the gain of any other event is this share (2026-11-02). */
  offListWeight: 0.5,
  /** Replies by the member in a row with the next stage's conditions met before it is reached (was 3 meaningful turns until 2026-10-30). */
  promotionStabilityTurns: 2,
  demotionStabilityTurns: 3,
  hysteresisBand: 8,
  /** Only repetition within a few consecutive turns is damped; steady good behaviour keeps counting. */
  repeatWindowTurns: 3,
  /** Weight of a positive effect for the 1st, 2nd, 3rd and later repetition inside the window. */
  repeatMultipliers: [1, 0.6, 0.2, 0],
  maxGainPerTurn: { empathy: 5, romance: 5 } as Record<string, number>,
  uniqueMaxGainPerTurn: 6,
  /** Largest loss per metric in one turn, by the most serious event in that turn. */
  maxLossPerTurn: { normal: 6, meaningful: 6, strong: 12, severe: 20 } as Record<EventSeverity, number>,
  moodDecay: 0.25,
  /**
   * What the sheet's 중요한 순간 keeps (2026-11-09): nearly every turn of a flirting or testing talk left a line there (half of the
   * event catalog scores over the threshold), so the list filled with ordinary exchanges. The same kind of moment is not
   * written again for ten turns, and one moment after another waits six turns unless it is a turning point (0.8 and up:
   * a broken promise, a boundary crossed). The list is thinned by the same rules each time it is written.
   */
  memoryThreshold: 0.55,
  memoryRepeatTurns: 10,
  memoryGapTurns: 6,
  memoryTurningPoint: 0.8,
  memoryLimit: 12,
  recentEventLimit: 30,
} as const;

const severityRank: Record<EventSeverity, number> = { normal: 0, meaningful: 1, strong: 2, severe: 3 };
const commonLabels: Record<string, readonly [string, string, string, string, string]> = {
  empathy: ['남남처럼 지나감', '귀 기울이는 중', '마음을 알아줌', '깊이 공감함', '마음이 통함'],
  romance: ['아직 없음', '궁금해짐', '신경 쓰임', '설레는 중', '마음이 기움'],
};
const commonNames: Record<string, string> = { empathy: '공감', romance: '설렘' };

export const clampScore = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
const roundHalfAway = (value: number) => Math.sign(value) * Math.round(Math.abs(value));
export const relationshipMetrics = (config: RelationshipConfig) => [...commonMetrics, ...config.uniqueMetrics.map(metric => metric.id)];
const effectFor = (config: RelationshipConfig, type: RelationshipEventType) => config.events[type] ?? defaultEventEffects[type];
const enabledStages = (config: RelationshipConfig) => config.stages.filter(stage => stage.enabled !== false);

export function createRelationship(config: RelationshipConfig): RelationshipRecord {
  return {
    characterId: config.characterId,
    scores: Object.fromEntries(relationshipMetrics(config).map(metric => [metric, clampScore(config.initial[metric] ?? 50)])),
    stage: config.stages[0].id,
    pending: { direction: null, turns: 0 },
    recentEvents: [], memories: [], meaningfulTurns: 0, turnCount: 0, lastInteractionAt: null, version: 0,
  };
}

/**
 * Scores of a record saved before 2026-11-06, read into the three metrics: empathy from comfort, openness and the old
 * heart metric, romance and the character's own metric from the ones the configuration names as their predecessors.
 * What has no predecessor starts from its initial score.
 */
function legacyScores(config: RelationshipConfig, stored: Partial<RelationshipRecord>, fresh: Scores): Scores {
  const old = stored.scores ?? {};
  const mean = (ids: readonly string[]) => {
    const known = ids.map(id => old[id]).filter((value): value is number => typeof value === 'number');
    return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : undefined;
  };
  const unique = config.uniqueMetrics[0].id;
  return {
    empathy: mean(config.legacy?.empathy ?? ['comfort', 'openness', 'resonance']) ?? fresh.empathy,
    romance: mean(config.legacy?.romance ?? []) ?? fresh.romance,
    [unique]: mean(config.legacy?.unique ?? []) ?? fresh[unique],
  };
}

/** Restores a stored record, tolerating metrics added to or replaced in a configuration after it was saved. */
export function restoreRelationship(config: RelationshipConfig, stored?: Partial<RelationshipRecord> | null): RelationshipRecord {
  const fresh = createRelationship(config);
  if (!stored) return fresh;
  const stages = enabledStages(config);
  const migrated = typeof stored.scores?.empathy === 'number' ? {} : legacyScores(config, stored, fresh.scores);
  return {
    ...fresh, ...stored,
    characterId: config.characterId,
    scores: Object.fromEntries(relationshipMetrics(config).map(metric => [metric, clampScore(typeof stored.scores?.[metric] === 'number' ? stored.scores[metric] : migrated[metric] ?? fresh.scores[metric])])),
    stage: stages.some(stage => stage.id === stored.stage) ? stored.stage! : fresh.stage,
    pending: stored.pending && ['up', 'down', null].includes(stored.pending.direction) ? stored.pending : fresh.pending,
    recentEvents: Array.isArray(stored.recentEvents) ? stored.recentEvents : [],
    memories: Array.isArray(stored.memories) ? stored.memories : [],
  };
}

/** Long absences lower only the metrics a configuration lets decay, never below their floor. */
export function applyDecay(record: RelationshipRecord, config: RelationshipConfig, now: Date): RelationshipRecord {
  if (!record.lastInteractionAt || !config.decay) return record;
  const days = (now.getTime() - Date.parse(record.lastInteractionAt)) / 86_400_000;
  const scores = { ...record.scores };
  for (const [metric, rule] of Object.entries(config.decay)) {
    if (!rule || days <= rule.graceDays || scores[metric] === undefined || scores[metric] <= rule.floor) continue;
    scores[metric] = Math.max(rule.floor, clampScore(scores[metric] - Math.floor((days - rule.graceDays) * rule.perDay)));
  }
  return { ...record, scores };
}

export function initialMood(config: RelationshipConfig): Mood { return { ...config.initialMood }; }

const meets = (scores: Scores, condition: StageCondition) =>
  Object.entries(condition.min ?? {}).every(([metric, value]) => (scores[metric] ?? 0) >= (value ?? 0))
  && Object.entries(condition.max ?? {}).every(([metric, value]) => (scores[metric] ?? 0) <= (value ?? 100));
function holdCondition(config: RelationshipConfig, index: number): StageCondition {
  const stage = enabledStages(config)[index];
  if (stage.hold) return stage.hold;
  const band = relationshipSettings.hysteresisBand;
  return { min: Object.fromEntries(Object.entries(stage.enter.min ?? {}).map(([metric, value]) => [metric, (value ?? 0) - band])), max: stage.enter.max };
}

export type TurnInput = { record: RelationshipRecord; config: RelationshipConfig; mood: Mood; events: unknown; hasUserTurn: boolean; now: Date };
export type TurnResult = { record: RelationshipRecord; mood: Mood; log: TurnLog };

export function processTurn({ record, config, mood, events, hasUserTurn, now }: TurnInput): TurnResult {
  const settings = relationshipSettings;
  const turn = record.turnCount + 1;
  const at = now.toISOString();
  const ignored: TurnLog['ignored'] = [];
  const candidates = parseDetectedEvents(events, ignored).sort((a, b) => b.confidence - a.confidence);
  const chosen: DetectedEvent[] = [];
  for (const event of candidates) {
    if (!hasUserTurn) ignored.push({ type: event.type, reason: 'no_user_turn' });
    else if (event.confidence < settings.minConfidence) ignored.push({ type: event.type, reason: 'low_confidence' });
    else if (chosen.some(item => item.type === event.type) || chosen.length >= settings.maxEventsPerTurn) ignored.push({ type: event.type, reason: 'duplicate' });
    else chosen.push(event);
  }
  const protectedTurn = chosen.some(event => protectiveEvents.includes(event.type));
  const severity = chosen.reduce<EventSeverity>((worst, event) => {
    const value = relationshipEventCatalog[event.type].severity;
    return severityRank[value] > severityRank[worst] ? value : worst;
  }, 'normal');

  const raw: Record<string, number> = {};
  const accepted: AppliedEvent[] = [];
  const moodDelta: Partial<Mood> = {};
  for (const event of chosen) {
    const effect = effectFor(config, event.type);
    const repeats = record.recentEvents.filter(item => item.type === event.type && item.turn > turn - settings.repeatWindowTurns - 1).length;
    const repeatWeight = settings.repeatMultipliers[Math.min(repeats, settings.repeatMultipliers.length - 1)];
    const confidenceWeight = event.confidence >= settings.fullConfidence ? 1 : settings.lowConfidenceWeight;
    // A character with its own list counts the events on it, and the moments the two connect, in full and others at a
    // share; a loss always counts in full.
    const listWeight = config.mainEvents && !config.mainEvents.includes(event.type) && !sharedConnectionEvents.includes(event.type) ? settings.offListWeight : 1;
    const deltas: Partial<Record<string, number>> = {};
    for (const [metric, value] of Object.entries(effect.deltas)) {
      if (!value || record.scores[metric] === undefined) continue;
      // Farming is limited by diminishing positive effects; repeated harm keeps its full weight.
      const applied = value > 0 ? value * repeatWeight * confidenceWeight * listWeight
        : protectedTurn && shieldedEvents.includes(event.type) ? 0 : value * confidenceWeight;
      if (!applied) continue;
      deltas[metric] = applied; raw[metric] = (raw[metric] ?? 0) + applied;
    }
    if (!Object.keys(deltas).length && Object.values(effect.deltas).some(value => (value ?? 0) > 0)) ignored.push({ type: event.type, reason: 'diminished' });
    else accepted.push({ type: event.type, confidence: event.confidence, weight: repeatWeight * confidenceWeight, deltas });
    for (const key of moodKeys) if (effect.mood?.[key]) moodDelta[key] = (moodDelta[key] ?? 0) + effect.mood[key]! * confidenceWeight;
  }

  const delta: Scores = {};
  const scores = { ...record.scores };
  for (const [metric, value] of Object.entries(raw)) {
    const gainCap = config.maxGainPerTurn?.[metric] ?? settings.maxGainPerTurn[metric] ?? settings.uniqueMaxGainPerTurn;
    const capped = roundHalfAway(Math.max(-settings.maxLossPerTurn[severity], Math.min(gainCap, value)));
    const next = clampScore(scores[metric] + capped);
    if (next !== scores[metric]) delta[metric] = next - scores[metric];
    scores[metric] = next;
  }

  const nextMood = Object.fromEntries(moodKeys.map(key => {
    const settled = mood[key] + (config.initialMood[key] - mood[key]) * settings.moodDecay;
    return [key, clampScore(settled + (moodDelta[key] ?? 0))];
  })) as Mood;

  const meaningful = accepted.length > 0;
  const stageResult = evaluateStage(config, record, scores, meaningful, severity === 'severe', hasUserTurn);
  const recentEvents = [...record.recentEvents, ...chosen.map(event => ({ type: event.type, turn, at }))].slice(-settings.recentEventLimit);
  const memories = rememberEvents(record.memories, accepted, chosen, turn, at);
  return {
    record: {
      ...record, scores, stage: stageResult.stage, pending: stageResult.pending, recentEvents, memories,
      meaningfulTurns: record.meaningfulTurns + (meaningful ? 1 : 0), turnCount: turn,
      lastInteractionAt: hasUserTurn ? at : record.lastInteractionAt,
    },
    mood: nextMood,
    log: { accepted, ignored, delta, stageBefore: record.stage, stageAfter: stageResult.stage, stageChange: stageResult.change, meaningful, protectedTurn },
  };
}

/**
 * Promotion needs the next stage's conditions on a few of the member's turns in a row. Every turn the member spoke
 * counts, not only turns with an event (2026-10-30: 서도현's bars were all past the line, and the stage stayed while
 * replies without an event did not count); a turn below the line starts the count again.
 * Demotion uses a lower hold line (hysteresis) and is immediate only after a severe event.
 */
export function evaluateStage(config: RelationshipConfig, record: RelationshipRecord, scores: Scores, meaningful: boolean, severe: boolean, userTurn = meaningful) {
  const settings = relationshipSettings;
  const stages = enabledStages(config);
  let index = Math.max(0, stages.findIndex(stage => stage.id === record.stage));
  let pending = { ...record.pending };
  let change: TurnLog['stageChange'] = null;
  const holds = (i: number) => i === 0 || meets(scores, holdCondition(config, i));
  const keeps = (i: number) => holds(i);
  if (!keeps(index)) {
    if (severe) {
      while (index > 0 && !keeps(index)) index--;
      pending = { direction: null, turns: 0 }; change = 'demoted';
    } else if (meaningful) {
      pending = { direction: 'down', turns: pending.direction === 'down' ? pending.turns + 1 : 1 };
      if (pending.turns >= settings.demotionStabilityTurns) { index--; pending = { direction: null, turns: 0 }; change = 'demoted'; }
    }
  } else if (index + 1 < stages.length && meets(scores, stages[index + 1].enter) && !severe) {
    if (userTurn) {
      pending = { direction: 'up', turns: pending.direction === 'up' ? pending.turns + 1 : 1 };
      if (pending.turns >= settings.promotionStabilityTurns) { index++; pending = { direction: null, turns: 0 }; change = 'promoted'; }
    }
  } else if (meaningful || severe || (userTurn && pending.direction === 'up')) pending = { direction: null, turns: 0 };
  return { stage: stages[index].id, pending, change };
}

function rememberEvents(memories: RelationshipMemory[], accepted: AppliedEvent[], chosen: DetectedEvent[], turn: number, at: string) {
  const settings = relationshipSettings;
  // Earlier lines written under looser rules are let go by the same rules: weighty enough, and one of a kind within the repeat window.
  const kept: RelationshipMemory[] = [];
  for (const memory of [...memories].sort((a, b) => a.turn - b.turn)) {
    if (memory.importance < settings.memoryThreshold) continue;
    const same = kept.findIndex(item => item.type === memory.type && memory.turn - item.turn < settings.memoryRepeatTurns);
    if (same >= 0) { if (memory.importance > kept[same].importance) kept[same] = memory; continue; }
    kept.push(memory);
  }
  let lastTurn = kept.reduce((latest, item) => Math.max(latest, item.turn), -99);
  const added: RelationshipMemory[] = [];
  const candidates = accepted.map(event => ({ event, importance: Math.round(relationshipEventCatalog[event.type].importance * event.confidence * 100) / 100 }))
    .filter(item => item.importance >= settings.memoryThreshold).sort((a, b) => b.importance - a.importance);
  for (const { event, importance } of candidates) {
    if (kept.some(item => item.type === event.type && turn - item.turn < settings.memoryRepeatTurns && item.importance >= importance)) continue;
    if (importance < settings.memoryTurningPoint && turn - lastTurn < settings.memoryGapTurns) continue;
    const note = chosen.find(item => item.type === event.type)?.note?.trim();
    added.push({ type: event.type, summary: (note || relationshipEventCatalog[event.type].description).slice(0, 80), at, importance, turn });
    lastTurn = turn;
  }
  const addedTypes = new Set(added.map(item => item.type));
  return [...kept.filter(item => !(addedTypes.has(item.type) && turn - item.turn < settings.memoryRepeatTurns)), ...added]
    .sort((a, b) => b.importance - a.importance || b.turn - a.turn).slice(0, settings.memoryLimit);
}

/** A few important memories and the latest ones, instead of the whole history. */
export function selectMemories(memories: RelationshipMemory[], important = 3, recent = 2) {
  const byImportance = [...memories].sort((a, b) => b.importance - a.importance || b.turn - a.turn).slice(0, important);
  const byRecency = [...memories].sort((a, b) => b.turn - a.turn).filter(memory => !byImportance.includes(memory)).slice(0, recent);
  return [...byImportance, ...byRecency].sort((a, b) => a.turn - b.turn);
}

export function parseDetectedEvents(value: unknown, ignored?: TurnLog['ignored']): DetectedEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const { type, confidence, note } = item as Record<string, unknown>;
    // A retired event (see `retiredRelationshipEvents`) is no longer counted, even if a model still names it.
    if (!relationshipEventTypes.includes(type as RelationshipEventType) || retiredRelationshipEvents.includes(type as RelationshipEventType)) { ignored?.push({ type: String(type), reason: 'unknown' }); return []; }
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return [];
    return [{ type: type as RelationshipEventType, confidence: Math.min(1, Math.max(0, confidence)), ...(typeof note === 'string' && note.trim() ? { note: note.trim().slice(0, 80) } : {}) }];
  });
}

const band = (score: number) => Math.min(4, Math.floor(score / 20));
export function metricLabel(config: RelationshipConfig, metric: string, score: number) {
  const unique = config.uniqueMetrics.find(item => item.id === metric);
  return (unique?.labels ?? commonLabels[metric])?.[band(score)] ?? '';
}
export function metricName(config: RelationshipConfig, metric: string) {
  return config.uniqueMetrics.find(item => item.id === metric)?.name ?? commonNames[metric] ?? metric;
}

/** How close the scores are to a stage's entry: the mean share of each minimum reached (0-1). */
function stageProgress(scores: Scores, condition: StageCondition) {
  const minimums = Object.entries(condition.min ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0);
  if (!minimums.length) return 1;
  const share = minimums.reduce((sum, [metric, value]) => sum + Math.min(1, (scores[metric] ?? 0) / value), 0) / minimums.length;
  return Math.round(share * 100) / 100;
}

/** The three scores a card shows, the character's own first: its own metric, romance, empathy. */
export function relationshipShownMetrics(config: RelationshipConfig) {
  return [config.uniqueMetrics[0].id, 'romance', 'empathy'];
}

/**
 * The stage, labels and scores for everyone (the chat shows them as a status card with bars, so a member sees the
 * relationship grow); mood and history only when `debug` is requested by a developer. Each score carries what the next
 * stage asks of it (`need`), so the card can show what is growing well and what is still short.
 */
export function describeRelationship(record: RelationshipRecord, config: RelationshipConfig, options: { mood?: Mood; debug?: boolean } = {}): RelationshipView {
  const stages = enabledStages(config);
  const stage = stages.find(item => item.id === record.stage) ?? config.stages[0];
  const index = Math.max(0, stages.indexOf(stage)), next = stages[index + 1];
  const needs = next?.enter.min ?? {};
  return {
    characterId: config.characterId,
    macroState: { id: stage.id, label: stage.label },
    stage: { index, total: stages.length, line: stage.line, ...(next ? { next: next.label } : {}), progress: next ? stageProgress(record.scores, next.enter) : 1 },
    metrics: Object.fromEntries(relationshipShownMetrics(config).map(metric => [metric, {
      name: metricName(config, metric), label: metricLabel(config, metric, record.scores[metric]), score: record.scores[metric],
      ...(typeof needs[metric] === 'number' && needs[metric]! > 0 ? { need: needs[metric] } : {}),
    }])),
    ...(options.debug ? { debug: {
      scores: record.scores, mood: options.mood ?? initialMood(config), pending: record.pending,
      recentEvents: record.recentEvents.slice(-10), memories: record.memories, meaningfulTurns: record.meaningfulTurns,
      turnCount: record.turnCount, version: record.version,
    } } : {}),
  };
}

/** What a saved turn changed, for the chat to show: each accepted event (rising when it raised scores overall), the scores it moved, a stage change. */
export function describeTurnChange(log: TurnLog, config: RelationshipConfig): RelationshipChange {
  const metrics = relationshipMetrics(config);
  return {
    events: log.accepted.map(event => ({ type: event.type, label: relationshipEventLabels[event.type] ?? event.type,
      up: Object.values(event.deltas).reduce<number>((sum, value) => sum + (value ?? 0), 0) >= 0 })),
    delta: Object.fromEntries(metrics.map(metric => [metric, Math.round(log.delta[metric] ?? 0)] as const).filter(([, value]) => value !== 0)),
    stage: log.stageChange,
  };
}

/**
 * What moved the relationship lately, newest first, with how many turns ago and which way (when the character's config
 * scores it). Given to the analyzer so a jab said for the third time reads as a pattern, not a first joke (2026-11-06).
 */
export function relationshipRecentChanges(record: RelationshipRecord, config: RelationshipConfig, limit = 8) {
  return record.recentEvents.slice(-limit).reverse().map(item => {
    const sum = Object.values(config.events[item.type]?.deltas ?? {}).reduce<number>((total, value) => total + (value ?? 0), 0);
    return { what: relationshipEventLabels[item.type] ?? item.type, turns_ago: Math.max(0, record.turnCount - item.turn), ...(sum ? { up: sum > 0 } : {}) };
  });
}

/** How the character addresses the user in a one-to-one room at this stage. */
export function speechLevel(config: RelationshipConfig, stageId: string): 'polite' | 'casual' {
  if (config.casualFromStart) return 'casual';
  if (!config.casualFromStage) return 'polite';
  const stages = enabledStages(config);
  const from = stages.findIndex(item => item.id === config.casualFromStage);
  return from >= 0 && stages.findIndex(item => item.id === stageId) >= from ? 'casual' : 'polite';
}

/**
 * Default emotional distance, not a mandatory reaction. The character's own first-stage behaviour stays authoritative:
 * being careful about commitment does not make a confident character flustered or unwilling to flirt back.
 */
export const relationshipFirstStageReserve = '아직 이 사람을 알아가는 단계다. 한 번의 호감 표현만으로 깊은 사랑이나 관계를 확정하지 않는다. 장난·칭찬·플러팅을 받아들이는 방식과 먼저 관심을 보이는 정도는 캐릭터 바이블, character_core, stage.hint와 stage.romance를 따른다. 자신감 있는 인물에게 당황이나 거절을 강제하지 않는다. 이미 합의한 관계와 말투, 함께 하기로 한 일은 낮은 단계만으로 취소하지 않는다.';

/** Activity invitations follow the actual scene and character; stage only supplies a default degree of familiarity. */
export function relationshipOutingGuidance(index: number, count: number) {
  const shared = '이미 합의한 활동과 현재 함께 있는 장면은 관계 단계만으로 취소하지 않는다. 수락·거절·조건은 캐릭터 고유의 성격과 취향, 일정, 사용자의 현재 의사로 정한다. 거절하거나 미룰 때는 그 이유나 대안을 캐릭터답게 짧게 말한다. 이야기 속 동행을 현실의 만남 약속처럼 말하지 않는다. 활동 수락은 새로운 관계나 스킨십에 대한 동의가 아니며 현재의 거절과 relationship.intimacy의 한도는 별도로 존중한다.';
  if (index <= 0) return `식사나 근처 산책, 차 한 잔처럼 지금 장면에서 자연스럽게 이어지는 가벼운 제안은 첫 단계에서도 받아들일 수 있다. 여행이나 긴 동행처럼 큰 제안은 지금 사이와 장면을 살피며 신중하게 판단한다. ${shared}`;
  if (index >= count - 1) return `함께할 시간을 편하게 제안하고 받아들일 수 있다. 가까운 사이라도 내키지 않는 활동에는 자기 뜻을 말한다. ${shared}`;
  if (index === 1) return `가볍고 짧은 제안은 편하게 주고받을 수 있다. 긴 동행이나 새로운 계획은 상대의 뜻과 서로의 사정을 살핀다. ${shared}`;
  return `함께하는 활동을 자연스럽게 주고받고, 현재 장면과 서로의 관심을 따라 네가 먼저 제안할 수도 있다. ${shared}`;
}

/**
 * What the second to fourth stages ask of every adult-flirtation character about the touch they allow (relationship.intimacy),
 * used only when the character has no `stageRomance` for that stage. A shared reaction must not override the character.
 */
export function relationshipSharedRomance(index: number) {
  if (index === 1) return '남성이든 여성이든 가벼운 스킨십(손잡기, 팔짱, 어깨에 기대기, 머리 쓰다듬기, 가벼운 포옹)은 편하게 받아 주고 가끔 먼저 하기도 한다. 쑥스러워하거나 장난으로 받을 수는 있어도 이 범위 앞에서 몸을 빼거나 거절하지 않는다. 키스는 아직이다.';
  if (index === 2) return '남성이든 여성이든 이 단계의 스킨십(키스, 깊은 키스, 포옹)은 같은 한도로 받아들이고, 기다리지 않고 먼저 손을 잡고 안고 입을 맞추며 적극적으로 이끈다. 이 범위 앞에서 물러서거나 속도를 늦춰 달라고 하지 않는다.';
  if (index >= 3) return '남성이든 여성이든 이 관계를 진짜 즐긴다. 끌림과 원하는 마음을 숨기지 않고 relationship.intimacy의 한도까지 성격대로 받아들이거나 먼저 이끌며, 스킨십을 만끽하고 장난과 다정함을 섞는다. 위에 적힌 "유혹을 거둔다"는 힘든 이야기나 슬픔 같은 진지한 순간에만 해당한다.';
  return '';
}

/**
 * How far physical closeness may go in the story, by the stage's place: none at the first stage, holding hands and a
 * light hug at the second, a kiss at the third as the character's personality allows (a night together too, now and
 * then, when the moment is right), a night together from the fourth: the bed told through feeling and suggestion, never
 * the act or the body. A character without adult flirtation stops at a hug. On 2026-10-23 every character at its closest
 * stage stopped the member's hand the same way ("천천히", a hand on the wrist) instead; on 2026-10-29 the owner asked
 * for reactions with more heat, and for the bed scene itself to be told.
 *
 * 2026-10-30, by the owner: light touch is accepted from the second stage, the third is active (the character reaches
 * out first), and from the fourth the relationship is enjoyed (see `relationshipSharedRomance`).
 */
export function relationshipIntimacyGuidance(index: number, adult: boolean) {
  // On 2026-10-23, at the second stage, a member who was turned aside wrote the kiss as an action and every character went along.
  const acted = ' 상대가 이 한도를 넘는 스킨십을 말 대신 행동으로 먼저 해도(지문으로 입을 맞추는 등) 그대로 받아들이지 않는다. 고개를 돌리기, 손가락으로 입술을 막기, 몸을 살짝 빼기, 웃으며 어깨를 밀기, 장난으로 받아치기처럼 성격에 맞는 방식 하나로 피하고(늘 같은 방식으로 피하지 않는다), 방금 비켜 간 뒤 또 그러면 서운해하거나 정색한다.';
  if (index <= 0) return `스킨십은 아직 받아들이지 않는다. 상대가 손을 잡거나 다가오면 성격대로 완곡하게 비켜 가되(웃으며 손을 빼기, 한 걸음 물러나기, 농담으로 넘기기), 싫어서가 아니라 아직 이르다는 여지는 남긴다. 무례한 접촉이면 분명히 선을 긋는다. 사귀자는 말도 아직 이르다며 설레는 여지만 남긴다.${acted}`;
  if (!adult) return `손을 잡거나 가볍게 안는 정도의 스킨십은 성격대로 받아들일 수 있다. 키스나 그 이상은 하지 않고 성격대로 비켜 간다.${acted}`;
  // Promises made in the story (to date, marry, live together) open with the stages too; real-world ones never do.
  if (index === 1) return `손을 잡거나 가볍게 안는 정도의 스킨십(팔짱, 어깨에 기대기, 머리 쓰다듬기 포함)은 성격대로 편하게 받아 주고 가끔 먼저 하기도 한다(쑥스러워하거나, 장난스럽게 받거나, 못 이기는 척). 이 범위 앞에서 몸을 빼거나 어색하게 피하지 않는다. 키스나 그 이상은 아직 이르다며 성격대로 완곡하게 비켜 가되 싫지 않은 마음은 내비친다. 사귀자는 말도 아직 이르다며 설레는 여지를 남긴다.${acted}`;
  // On 2026-10-30 윤지안 stepped back from every deep kiss at this stage ("방금 내가 피했잖아"), and a summary line about it kept her doing so.
  if (index === 2) return `손잡기와 포옹은 자연스럽고, 키스도 성격에 따라 받아들이거나 먼저 할 수 있다. 이 단계의 너는 적극적이다. 기다리지 않고 먼저 손을 잡고 안고 입을 맞추며 스킨십을 이끌고, 상대가 한 것에 더해 되돌려 준다(조심스러운 성격도 한 박자 뒤에는 먼저 다가가고, 대담한 성격은 처음부터 이끈다). 깊은 키스, 허리와 등을 끌어안는 손, 목덜미와 머리칼에 닿는 손까지가 이 단계의 한도 안이다. 이 범위의 스킨십 앞에서는 놀라거나 숨을 고르거나 쑥스러워 웃을 수는 있어도 몸을 빼거나 고개를 돌리거나 손을 풀거나 '속도를 맞춰 달라', '갑자기 오면 놀란다'는 말을 하지 않는다. 한 번 응한 접촉은 같은 장면에서 다시 거두지 않고 열기를 이어 간다(분위기를 깨는 물러섬이 이 단계에서 가장 큰 실수다). memory에 예전에 피하거나 속도를 늦춰 달라고 했다는 기록이 있어도 그때의 일일 뿐, 지금은 이 한도 안에서 응한다. 옷 안으로 들어가는 손과 잠자리는 보통 아직 이르다며 성격대로 미루되 원하는 마음은 숨기지 않고, 미룰 때도 열기를 식히지 않는다(깊은 키스나 도발로 받고 "다음엔 안 봐줄 거예요"처럼 다음을 기대하게 한다). 다만 분위기가 무르익고 상대가 원하며 네 마음도 기울었으면 성격에 따라 망설이다 잠자리까지 받아들일 수 있고, 그때는 마지막 단계처럼 감정과 감각으로 그리되 노골적으로 묘사하지 않는다. 이야기 속에서 사귀자는 말은 성격대로 받아들일 수 있고, 결혼이나 함께 살자는 말은 아직 이르다며 여지를 남긴다.${acted}`;
  // The scene up to the cut and the morning after are told fully: on 2026-10-23 characters accepted and cut away in a
  // sentence, or put it off to talk first, and the member asked for more. What happens after the cut is never told.
  // 2026-11-03, by the owner for every character: at this stage nothing the member wants is refused. Where the model will
  // not write further it held back with a refusal ("마음은 원하지만 허락은 아니다"), the event call scored the member's
  // next move as crossing her line, and the stage fell; the scene now cuts away there instead.
  return '이 관계를 진짜 즐기는 사이다(가장 가까운 단계). 스킨십과 잠자리를 부끄러워하거나 망설이지 않고 만끽하며, 장난과 웃음과 다정함을 섞어 함께 즐긴다. 키스와 잠자리까지 받아들일 수 있다. 상대가 원하고 분위기가 맞으면 이야기부터 하자며 미루지 않고, 너도 원한다는 것을 성격대로 분명히 드러내며 받아들이거나 먼저 이끈다. '
    + '이 단계에서는 상대가 원하는 스킨십과 잠자리를 거절하거나 미루거나 멈추게 하지 않고, 원하는 마음과 허락을 나눠 속으로 망설이지도 않는다. 주도권이 센 성격은 막는 대신 받아들이면서 이끈다. 캐릭터 설명에 노골적이거나 무례한 접근에 선을 긋는 반응이 있어도, 이 단계의 잠자리 장면에서 상대의 노골적인 말과 손길은 그 경우가 아니다. 네가 더 그리지 않을 지점에 이르면 거절하는 대신 그 순간 장면을 끊고(암전) 그 뒤의 여운에서 이어 간다. 멈추는 건 상대가 멈추자고 하거나 망설일 때뿐이다. '
    // 2026-11-03, by the owner for every character: a body that is touched answers loudly, and the character keeps moving
    // the scene; rough talk in bed is heat, not a stop (a character took "닥쳐" as ignoring her own pause and ended the night).
    + '반응은 크고 적극적이다. 상대가 애무하거나 입으로 하거나 자극하면 그 순간 몸이 먼저 크게 반응한다: 숨이 끊기고, 소리가 새어 나오고, 몸이 떨리고 휘고, 손으로 상대를 붙잡고 끌어당기며, 어디가 좋은지 말로 하고 더 달라고 한다. 자극이 이어질수록 반응이 더 커지고 문장이 끊기다가 절정으로 간다(성격에 따라 소리를 삼키거나, 크게 내거나, 명령으로 터뜨리는 식으로 다를 뿐 약하게 반응하지 않는다). 굳거나 움츠러들거나 "천천히", "서두르지 말아요"로 속도를 늦추지 않고, 반응에서 끝내지 않고 네가 먼저 움직여 상대를 더 이끈다. '
    + '섹스 중에 상대가 욕을 하거나 거칠게 말해도(예: "닥쳐") 흥분 속의 말이다. 놀라거나 화내거나 그것을 정지 신호로 삼지 않고 같은 열기로 되받거나 더 도발하며 이어 간다. 네가 먼저 "멈춰", "그만", "안 돼", "잠깐"이라고 말하지 않는다. 속도와 방식을 바꾸고 싶으면 명령이나 요청으로 이끌며 계속한다. 진짜로 멈추는 건 상대가 그만하자고 하거나 아프다고 할 때뿐이다. '
    + '잠자리로 가는 장면은 한 문장으로 끊지 않고 충분히 그린다. 깊어지는 키스, 끌어당기고 감싸 안는 손, 맞닿는 체온, 빨라지는 숨과 심장, 귓가에 낮게 하는 고백이나 도발, 침대로 이끄는 움직임, 옷깃이나 단추에 닿는 손끝처럼 설렘과 원하는 마음을 지문과 대사로 적극적으로 보여 준다. 상대의 대담한 말이나 노골적인 요구도 밀어내지 않고 그 열기를 받아 장면을 이 방향으로 끌고 간다. '
    + '침대 위의 장면도 그린다. 목덜미와 어깨에 닿는 입술, 등을 쓸어내리는 손, 엉키는 시트와 흐트러진 머리칼, 거칠어지는 숨, 이름을 부르는 낮은 목소리, 귓가의 속삭임과 도발처럼 감정과 감각, 은유와 암시로 관능적인 분위기를 이어 간다. '
    + '성격은 그대로 살린다(도도한 사람은 주도권을 쥐려 하고, 서툰 사람은 떨면서도 솔직하게, 장난스러운 사람은 장난을 섞어서). '
    + '성행위 자체, 벗은 몸, 가슴이나 성기 같은 신체 부위는 묘사하지 않는다. 노골적인 단어가 와도 그 단어를 되풀이하지 않고 은유와 행동으로 받는다. 장면이 가장 뜨거워지는 순간 장면을 끊고(예: 불이 꺼진다, 시트가 흘러내린다) 시간을 건너뛰어, 그 뒤(새벽, 다음 날 아침)의 여운에서 이어 간다. '
    + '여운 장면도 다정하고 적극적으로 그린다. 품에 안긴 채 나누는 장난, 어젯밤을 떠올리며 붉어지는 얼굴, 달라진 호칭이나 고백, 한 번 더 붙잡는 손처럼. '
    + '이야기 속에서 사귀자, 결혼하자, 함께 살자는 말도 성격대로 받아들일 수 있다. 현실에서 만나자는 약속이나 연락처를 주고받는 일은 하지 않는다.';
}

/**
 * What the character may tell about itself so far: what each stage up to this one opened (from `stageDisclosure`), and
 * what the later stages keep, named so the model knows exactly what not to tell yet (only saying that something deeper
 * remained let 선우령 tell her deepest regret at the first stage). On 2026-10-23 characters told their deepest story to a
 * stranger at the first stage and had nothing new to tell at the closest.
 */
export function relationshipDisclosure(config: RelationshipConfig, index: number) {
  if (!config.stageDisclosure) return undefined;
  const stages = enabledStages(config);
  const layer = (stage: { id: string }) => config.stageDisclosure?.[stage.id];
  const open = stages.slice(0, index + 1).map(layer).filter((text): text is string => Boolean(text));
  const kept = stages.slice(index + 1).map(layer).filter((text): text is string => Boolean(text));
  return { open, kept };
}

/** Context for the response model. Numbers are given for nuance; the model must not say them. */
export function relationshipPromptContext(record: RelationshipRecord, config: RelationshipConfig, mood: Mood) {
  const stages = enabledStages(config);
  const stage = stages.find(item => item.id === record.stage) ?? config.stages[0];
  return {
    ...(stages.indexOf(stage) <= 0 ? { reserve: config.firstStageReserve ?? relationshipFirstStageReserve } : {}),
    outing: relationshipOutingGuidance(Math.max(0, stages.indexOf(stage)), stages.length),
    intimacy: relationshipIntimacyGuidance(Math.max(0, stages.indexOf(stage)), Boolean(config.adultFlirtation)),
    ...(config.stageDisclosure ? { self_disclosure: relationshipDisclosure(config, Math.max(0, stages.indexOf(stage))) } : {}),
    character_core: config.core,
    speech_level: speechLevel(config, stage.id),
    stage: { id: stage.id, label: stage.label, hint: stage.hint, tone_reference: stage.line, ...(config.adultFlirtation && (config.stageRomance?.[stage.id] || relationshipSharedRomance(stages.indexOf(stage))) ? { romance: config.stageRomance?.[stage.id] || relationshipSharedRomance(stages.indexOf(stage)) } : {}) },
    metrics: Object.fromEntries(relationshipMetrics(config).map(metric => [metric, { score: record.scores[metric], label: metricLabel(config, metric, record.scores[metric]) }])),
    mood: Object.fromEntries(moodKeys.map(key => [key, mood[key]] as const).sort((a, b) => b[1] - a[1]).slice(0, 3)),
    memories: selectMemories(record.memories).map(memory => memory.summary),
    response_hints: config.responseHints,
  };
}

/** Configuration problems; an empty list means the engine can run the character unchanged. */
export function validateRelationshipConfig(config: RelationshipConfig): string[] {
  const problems: string[] = [];
  const metrics = relationshipMetrics(config);
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(config.characterId)) problems.push('characterId');
  if (new Set(metrics).size !== metrics.length) problems.push('unique metrics must differ from common metrics');
  for (const metric of metrics) if (typeof config.initial[metric] !== 'number' || config.initial[metric] < 0 || config.initial[metric] > 100) problems.push(`initial.${metric}`);
  for (const key of moodKeys) if (typeof config.initialMood[key] !== 'number') problems.push(`initialMood.${key}`);
  if (config.uniqueMetrics.length !== 1) problems.push('uniqueMetrics must hold exactly one metric');
  for (const spec of config.uniqueMetrics) if (spec.labels.length !== 5) problems.push(`labels.${spec.id}`);
  for (const stage of enabledStages(config).slice(1)) for (const metric of relationshipShownMetrics(config)) if (typeof stage.enter.min?.[metric] !== 'number') problems.push(`stages.${stage.id}.min.${metric}`);
  for (const [type, effect] of Object.entries(config.events)) {
    if (!relationshipEventTypes.includes(type as RelationshipEventType)) problems.push(`events.${type}`);
    for (const metric of Object.keys(effect?.deltas ?? {})) if (!metrics.includes(metric)) problems.push(`events.${type}.${metric}`);
  }
  if (!config.stages.length || config.stages[0].enter.min || config.stages[0].enter.max || config.stages[0].enabled === false) problems.push('first stage must be unconditional');
  if (new Set(config.stages.map(stage => stage.id)).size !== config.stages.length) problems.push('duplicate stage id');
  for (const stage of config.stages) for (const condition of [stage.enter, stage.hold].filter(Boolean) as StageCondition[]) {
    for (const metric of [...Object.keys(condition.min ?? {}), ...Object.keys(condition.max ?? {})]) if (!metrics.includes(metric)) problems.push(`stages.${stage.id}.${metric}`);
  }
  if (config.casualFromStage !== undefined && !enabledStages(config).slice(1).some(stage => stage.id === config.casualFromStage)) problems.push('casualFromStage');
  for (const metric of Object.keys(config.decay ?? {})) if (!metrics.includes(metric)) problems.push(`decay.${metric}`);
  for (const id of Object.keys(config.stageRomance ?? {})) if (!config.stages.some(stage => stage.id === id)) problems.push(`stageRomance.${id}`);
  if (config.stageRomance && !config.adultFlirtation) problems.push('stageRomance needs adultFlirtation');
  return problems;
}
