import { defaultEventEffects, protectiveEvents, relationshipEventCatalog, relationshipEventLabels, relationshipEventTypes, retiredRelationshipEvents, shieldedEvents, type EventSeverity, type RelationshipEventType } from './events.js';
import { commonMetrics, moodKeys, type AppliedEvent, type DetectedEvent, type Mood, type RelationshipConfig, type RelationshipMemory, type RelationshipChange, type RelationshipRecord, type RelationshipView, type Scores, type StageCondition, type TurnLog } from './types.js';

export const relationshipSettings = {
  minConfidence: 0.6,
  fullConfidence: 0.8,
  lowConfidenceWeight: 0.7,
  maxEventsPerTurn: 3,
  /** Replies by the member in a row with the next stage's conditions met before it is reached (was 3 meaningful turns until 2026-10-30). */
  promotionStabilityTurns: 2,
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
  if (!holds(index)) {
    if (severe) {
      while (index > 0 && !holds(index)) index--;
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

/**
 * The scores that matter for this character: its own metrics, and the shared ones its stages ask for. On 2026-10-29
 * every character's card showed the same five shared bars (흥미, 존중, 편안함…), some of which none of its stages used.
 */
export function relationshipShownMetrics(config: RelationshipConfig) {
  const asked = new Set(enabledStages(config).flatMap(stage => Object.keys(stage.enter.min ?? {})));
  const unique = new Set(config.uniqueMetrics.map(metric => metric.id));
  const shown = relationshipMetrics(config).filter(metric => unique.has(metric) || asked.has(metric));
  return shown.length ? shown : relationshipMetrics(config);
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

/** How the character addresses the user in a one-to-one room at this stage. */
export function speechLevel(config: RelationshipConfig, stageId: string): 'polite' | 'casual' {
  if (!config.casualFromStage) return 'polite';
  const stages = enabledStages(config);
  const from = stages.findIndex(item => item.id === config.casualFromStage);
  return from >= 0 && stages.findIndex(item => item.id === stageId) >= from ? 'casual' : 'polite';
}

/**
 * Whether the character goes along when the user invites them somewhere or to do something together in the story
 * (a walk, a trip, a film), by how far the relationship has come: not yet at the first stage, only small things next,
 * most things later, gladly at the closest. Written here, from the stage's place, so the model does not have to guess.
 */
/**
 * Every character at its first stage: still sizing the member up, guarded in its own way. On 2026-10-30 the owner found
 * characters showing interest and flirting from the first stage; the stages' own words (설레게 한다) and the rule to
 * show feelings boldly had pushed them ahead of the relationship.
 */
export const relationshipFirstStageReserve = '아직 서로를 잘 모르는 첫 단계다. 상대가 어떤 사람인지 살피며 마음의 거리를 둔다. 호감이나 설렘을 먼저 드러내지 않고, 상대의 외모나 분위기에 끌린다는 말, 칭찬 공세, 플러팅, 다음 만남을 기대하는 말을 먼저 하지 않는다. 경계의 모양은 성격대로다. 다정한 사람은 예의 바르고 친절하지만 선을 지키고, 도도하거나 건조한 사람은 짧고 쌀쌀하게 거리를 두고, 장난스러운 사람은 농담 뒤에 속마음을 숨기고, 신중한 사람은 말을 아끼며 지켜본다. 상대가 먼저 호감을 보이거나 플러팅해도 반가워하며 받아 주지 않는다. 성격대로 넘기거나 당황하거나 의아해하며 거리를 유지하고, 흔들림은 아주 살짝만 비친다. 이 거리감은 stage.hint, stage.romance보다 먼저다. 이야기가 정한 사건(약속을 제안하기, 고백 한마디 등)은 그대로 하되 말투와 마음의 온도는 조심스럽게 지킨다.';

export function relationshipOutingGuidance(index: number, count: number) {
  if (index <= 0) return '함께 어디를 가거나 무엇을 같이 하자는 상황극 제안은 아직 받아들이지 않는다. 아직 그럴 사이가 아니라는 것을 성격대로 드러내며 거절하거나 미루고(도도하거나 까다로우면 짧게 선을 긋고, 다정하면 아쉬워하며 다음으로 미룬다), 지금 있는 자리에서 대화를 이어 간다. 거절은 이 이야기 속 두 사람의 거리에 대한 것이다. 현실의 약속이나 만남처럼 말하지 않는다(“그런 약속은 받아들이기 어렵다”, “따로 만나는 건 곤란하다” 같은 말은 쓰지 않는다).';
  if (index >= count - 1) return '함께하는 장면을 기꺼이 받아들여 이어 가고, 분위기가 맞으면 네가 먼저 어디를 가자거나 무엇을 같이 하자고 제안할 수도 있다.';
  if (index === 1) return '가볍고 짧은 제안(근처를 잠깐 걷기, 차나 술 한 잔, 짧은 영상 하나)은 망설이거나 조건을 걸며 받아들일 수 있다. 여행, 하룻밤, 둘만의 긴 시간처럼 큰 제안은 아직 이르다며 성격대로 거절하거나 미룬다.';
  return '대부분의 제안을 성격대로 받아들여 장면으로 이어 간다. 그날의 기분이나 성격에 맞지 않는 제안은 거절하거나 다른 것을 제안할 수 있다.';
}

/**
 * How far physical closeness may go in the story, by the stage's place: none at the first stage, holding hands and a
 * light hug at the second, a kiss at the third as the character's personality allows (a night together too, now and
 * then, when the moment is right), a night together from the fourth: the bed told through feeling and suggestion, never
 * the act or the body. A character without adult flirtation stops at a hug. On 2026-10-23 every character at its closest
 * stage stopped the member's hand the same way ("천천히", a hand on the wrist) instead; on 2026-10-29 the owner asked
 * for reactions with more heat, and for the bed scene itself to be told.
 */
export function relationshipIntimacyGuidance(index: number, adult: boolean) {
  // On 2026-10-23, at the second stage, a member who was turned aside wrote the kiss as an action and every character went along.
  const acted = ' 상대가 이 한도를 넘는 스킨십을 말 대신 행동으로 먼저 해도(지문으로 입을 맞추는 등) 그대로 받아들이지 않는다. 고개를 돌리기, 손가락으로 입술을 막기, 몸을 살짝 빼기, 웃으며 어깨를 밀기, 장난으로 받아치기처럼 성격에 맞는 방식 하나로 피하고(늘 같은 방식으로 피하지 않는다), 방금 비켜 간 뒤 또 그러면 서운해하거나 정색한다.';
  if (index <= 0) return `스킨십은 아직 받아들이지 않는다. 상대가 손을 잡거나 다가오면 성격대로 완곡하게 비켜 가되(웃으며 손을 빼기, 한 걸음 물러나기, 농담으로 넘기기), 싫어서가 아니라 아직 이르다는 여지는 남긴다. 무례한 접촉이면 분명히 선을 긋는다. 사귀자는 말도 아직 이르다며 설레는 여지만 남긴다.${acted}`;
  if (!adult) return `손을 잡거나 가볍게 안는 정도의 스킨십은 성격대로 받아들일 수 있다. 키스나 그 이상은 하지 않고 성격대로 비켜 간다.${acted}`;
  // Promises made in the story (to date, marry, live together) open with the stages too; real-world ones never do.
  if (index === 1) return `손을 잡거나 가볍게 안는 정도의 스킨십은 성격대로 받아들이거나 먼저 할 수 있다(쑥스러워하거나, 장난스럽게 받거나, 못 이기는 척). 키스나 그 이상은 아직 이르다며 성격대로 완곡하게 비켜 가되 싫지 않은 마음은 내비친다. 사귀자는 말도 아직 이르다며 설레는 여지를 남긴다.${acted}`;
  if (index === 2) return `손잡기와 포옹은 자연스럽고, 키스도 성격에 따라 받아들이거나 먼저 할 수 있다(조심스러운 성격은 망설이다 응하고, 대담한 성격은 먼저 다가온다). 잠자리는 보통 아직 이르다며 성격대로 미루되 원하는 마음은 숨기지 않고, 미룰 때도 열기를 식히지 않는다(깊은 키스나 도발로 받고 "다음엔 안 봐줄 거예요"처럼 다음을 기대하게 한다). 다만 분위기가 무르익고 상대가 원하며 네 마음도 기울었으면 성격에 따라 망설이다 잠자리까지 받아들일 수 있고, 그때는 마지막 단계처럼 감정과 감각으로 그리되 노골적으로 묘사하지 않는다. 이야기 속에서 사귀자는 말은 성격대로 받아들일 수 있고, 결혼이나 함께 살자는 말은 아직 이르다며 여지를 남긴다.${acted}`;
  // The scene up to the cut and the morning after are told fully: on 2026-10-23 characters accepted and cut away in a
  // sentence, or put it off to talk first, and the member asked for more. What happens after the cut is never told.
  return '키스와 잠자리까지 받아들일 수 있다. 상대가 원하고 분위기가 맞으면 이야기부터 하자며 미루지 않고, 너도 원한다는 것을 성격대로 분명히 드러내며 받아들이거나 먼저 이끈다. '
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
    ...(stages.indexOf(stage) <= 0 ? { reserve: relationshipFirstStageReserve } : {}),
    outing: relationshipOutingGuidance(Math.max(0, stages.indexOf(stage)), stages.length),
    intimacy: relationshipIntimacyGuidance(Math.max(0, stages.indexOf(stage)), Boolean(config.adultFlirtation)),
    ...(config.stageDisclosure ? { self_disclosure: relationshipDisclosure(config, Math.max(0, stages.indexOf(stage))) } : {}),
    character_core: config.core,
    speech_level: speechLevel(config, stage.id),
    stage: { id: stage.id, label: stage.label, hint: stage.hint, tone_reference: stage.line, ...(config.adultFlirtation && config.stageRomance?.[stage.id] ? { romance: config.stageRomance[stage.id] } : {}) },
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
  if (config.casualFromStage !== undefined && !enabledStages(config).slice(1).some(stage => stage.id === config.casualFromStage)) problems.push('casualFromStage');
  for (const metric of Object.keys(config.decay ?? {})) if (!metrics.includes(metric)) problems.push(`decay.${metric}`);
  for (const id of Object.keys(config.stageRomance ?? {})) if (!config.stages.some(stage => stage.id === id)) problems.push(`stageRomance.${id}`);
  if (config.stageRomance && !config.adultFlirtation) problems.push('stageRomance needs adultFlirtation');
  return problems;
}
