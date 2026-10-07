import { defaultEventEffects, protectiveEvents, relationshipEventCatalog, relationshipEventTypes, shieldedEvents, type EventSeverity, type RelationshipEventType } from './events';
import { commonMetrics, moodKeys, type AppliedEvent, type DetectedEvent, type Mood, type RelationshipConfig, type RelationshipMemory, type RelationshipRecord, type RelationshipView, type Scores, type StageCondition, type TurnLog } from './types';

export const relationshipSettings = {
  minConfidence: 0.6,
  fullConfidence: 0.8,
  lowConfidenceWeight: 0.7,
  maxEventsPerTurn: 3,
  promotionStabilityTurns: 3,
  demotionStabilityTurns: 3,
  hysteresisBand: 8,
  /** Only repetition within a few consecutive turns is damped; steady good behaviour keeps counting. */
  repeatWindowTurns: 3,
  /** Weight of a positive effect for the 1st, 2nd, 3rd and later repetition inside the window. */
  repeatMultipliers: [1, 0.6, 0.2, 0],
  maxGainPerTurn: { trust: 4, respect: 6, interest: 8, comfort: 5, openness: 4 } as Record<string, number>,
  uniqueMaxGainPerTurn: 6,
  /** Largest loss per metric in one turn, by the most serious event in that turn. */
  maxLossPerTurn: { normal: 6, meaningful: 6, strong: 12, severe: 20 } as Record<EventSeverity, number>,
  moodDecay: 0.25,
  memoryThreshold: 0.55,
  memoryLimit: 12,
  recentEventLimit: 30,
} as const;

const severityRank: Record<EventSeverity, number> = { normal: 0, meaningful: 1, strong: 2, severe: 3 };
const commonLabels: Record<string, readonly [string, string, string, string, string]> = {
  trust: ['경계', '조심스러움', '믿어 보는 중', '신뢰', '깊은 신뢰'],
  respect: ['아직 인정 전', '지켜보는 중', '인정하기 시작함', '존중', '깊은 존중'],
  interest: ['무관심', '시큰둥함', '관심 있음', '흥미진진', '푹 빠짐'],
  comfort: ['긴장', '어색함', '편해지는 중', '편안함', '아주 편안함'],
  openness: ['닫혀 있음', '말을 아낌', '조금씩 열림', '솔직함', '속을 터놓음'],
};
const commonNames: Record<string, string> = { trust: '신뢰', respect: '존중', interest: '흥미', comfort: '편안함', openness: '마음 열기' };

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

/** Restores a stored record, tolerating metrics added to a configuration after it was saved. */
export function restoreRelationship(config: RelationshipConfig, stored?: Partial<RelationshipRecord> | null): RelationshipRecord {
  const fresh = createRelationship(config);
  if (!stored) return fresh;
  const stages = enabledStages(config);
  return {
    ...fresh, ...stored,
    characterId: config.characterId,
    scores: Object.fromEntries(relationshipMetrics(config).map(metric => [metric, clampScore(typeof stored.scores?.[metric] === 'number' ? stored.scores[metric] : fresh.scores[metric])])),
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
    const deltas: Partial<Record<string, number>> = {};
    for (const [metric, value] of Object.entries(effect.deltas)) {
      if (!value || record.scores[metric] === undefined) continue;
      // Farming is limited by diminishing positive effects; repeated harm keeps its full weight.
      const applied = value > 0 ? value * repeatWeight * confidenceWeight
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
  const stageResult = evaluateStage(config, record, scores, meaningful, severity === 'severe');
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
 * Promotion needs the next stage's conditions on several consecutive meaningful turns.
 * Demotion uses a lower hold line (hysteresis) and is immediate only after a severe event.
 */
export function evaluateStage(config: RelationshipConfig, record: RelationshipRecord, scores: Scores, meaningful: boolean, severe: boolean) {
  const settings = relationshipSettings;
  const stages = enabledStages(config);
  let index = Math.max(0, stages.findIndex(stage => stage.id === record.stage));
  let pending = { ...record.pending };
  let change: TurnLog['stageChange'] = null;
  const holds = (i: number) => i === 0 || meets(scores, holdCondition(config, i));
  if (!holds(index)) {
    if (severe) {
      while (index > 0 && !holds(index)) index--;
      pending = { direction: null, turns: 0 }; change = 'demoted';
    } else if (meaningful) {
      pending = { direction: 'down', turns: pending.direction === 'down' ? pending.turns + 1 : 1 };
      if (pending.turns >= settings.demotionStabilityTurns) { index--; pending = { direction: null, turns: 0 }; change = 'demoted'; }
    }
  } else if (index + 1 < stages.length && meets(scores, stages[index + 1].enter) && !severe) {
    if (meaningful) {
      pending = { direction: 'up', turns: pending.direction === 'up' ? pending.turns + 1 : 1 };
      if (pending.turns >= settings.promotionStabilityTurns) { index++; pending = { direction: null, turns: 0 }; change = 'promoted'; }
    }
  } else if (meaningful || severe) pending = { direction: null, turns: 0 };
  return { stage: stages[index].id, pending, change };
}

function rememberEvents(memories: RelationshipMemory[], accepted: AppliedEvent[], chosen: DetectedEvent[], turn: number, at: string) {
  const settings = relationshipSettings;
  const added = accepted.flatMap(event => {
    const importance = Math.round(relationshipEventCatalog[event.type].importance * event.confidence * 100) / 100;
    if (importance < settings.memoryThreshold) return [];
    const note = chosen.find(item => item.type === event.type)?.note?.trim();
    return [{ type: event.type, summary: (note || relationshipEventCatalog[event.type].description).slice(0, 80), at, importance, turn }];
  });
  return [...memories, ...added].sort((a, b) => b.importance - a.importance || b.turn - a.turn).slice(0, settings.memoryLimit);
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
    if (!relationshipEventTypes.includes(type as RelationshipEventType)) { ignored?.push({ type: String(type), reason: 'unknown' }); return []; }
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

/** Labels for everyone; raw scores and history only when `debug` is requested by a developer. */
export function describeRelationship(record: RelationshipRecord, config: RelationshipConfig, options: { mood?: Mood; debug?: boolean } = {}): RelationshipView {
  const stage = enabledStages(config).find(item => item.id === record.stage) ?? config.stages[0];
  return {
    characterId: config.characterId,
    macroState: { id: stage.id, label: stage.label },
    metrics: Object.fromEntries(relationshipMetrics(config).map(metric => [metric, {
      name: metricName(config, metric), label: metricLabel(config, metric, record.scores[metric]),
      ...(options.debug ? { score: record.scores[metric] } : {}),
    }])),
    ...(options.debug ? { debug: {
      scores: record.scores, mood: options.mood ?? initialMood(config), pending: record.pending,
      recentEvents: record.recentEvents.slice(-10), memories: record.memories, meaningfulTurns: record.meaningfulTurns,
      turnCount: record.turnCount, version: record.version,
    } } : {}),
  };
}

/** Context for the response model. Numbers are given for nuance; the model must not say them. */
export function relationshipPromptContext(record: RelationshipRecord, config: RelationshipConfig, mood: Mood) {
  const stage = enabledStages(config).find(item => item.id === record.stage) ?? config.stages[0];
  return {
    character_core: config.core,
    stage: { id: stage.id, label: stage.label, hint: stage.hint, tone_reference: stage.line },
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
  for (const spec of config.uniqueMetrics) if (spec.labels.length !== 5) problems.push(`labels.${spec.id}`);
  for (const [type, effect] of Object.entries(config.events)) {
    if (!relationshipEventTypes.includes(type as RelationshipEventType)) problems.push(`events.${type}`);
    for (const metric of Object.keys(effect?.deltas ?? {})) if (!metrics.includes(metric)) problems.push(`events.${type}.${metric}`);
  }
  if (!config.stages.length || config.stages[0].enter.min || config.stages[0].enter.max || config.stages[0].enabled === false) problems.push('first stage must be unconditional');
  if (new Set(config.stages.map(stage => stage.id)).size !== config.stages.length) problems.push('duplicate stage id');
  for (const stage of config.stages) for (const condition of [stage.enter, stage.hold].filter(Boolean) as StageCondition[]) {
    for (const metric of [...Object.keys(condition.min ?? {}), ...Object.keys(condition.max ?? {})]) if (!metrics.includes(metric)) problems.push(`stages.${stage.id}.${metric}`);
  }
  for (const metric of Object.keys(config.decay ?? {})) if (!metrics.includes(metric)) problems.push(`decay.${metric}`);
  return problems;
}
