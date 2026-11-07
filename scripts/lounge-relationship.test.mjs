import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const relationship = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const { relationshipResponseInstructions, relationshipResponseInstructionsFor, relationshipConfigs: configs, createRelationship, processTurn, initialMood, describeRelationship, validateRelationshipConfig, applyDecay, relationshipPromptContext, parseDetectedEvents } = relationship;
const charactersLib = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
const now = new Date('2026-10-06T12:00:00Z');
const later = minutes => new Date(now.getTime() + minutes * 60_000);
const event = (type, confidence = 0.9, note) => ({ type, confidence, ...(note ? { note } : {}) });
// Runs turns in order; each turn is a list of events.
function run(config, turns, start = createRelationship(config)) {
  let record = start, mood = initialMood(config);
  const logs = [];
  turns.forEach((events, index) => {
    const result = processTurn({ record, config, mood, events, hasUserTurn: true, now: later(index) });
    record = result.record; mood = result.mood; logs.push(result.log);
  });
  return { record, mood, logs };
}
const withScores = (config, scores, stage) => ({ ...createRelationship(config), scores: { ...createRelationship(config).scores, ...scores }, ...(stage ? { stage } : {}) });

const uniqueMetricOf = { closer: ['nerve', '배짱'], diplomat: ['banter', '티키타카'], auditor: ['candor', '솔직함'], trickster: ['mental', '멘탈'],
  velvet: ['boldness', '대담함'], ina: ['banter', '티키타카'], jaeseok: ['viewpoint', '시선'], guide: ['pace', '발걸음'], shaman: ['banter', '기싸움'] };
const retiredNow = ['PLAYS_ALONG', 'SHOWS_CURIOSITY', 'ASKS_GOOD_QUESTION', 'ANSWERS_DIRECTLY', 'CORRECTS_UNDERSTANDING', 'SHOWS_COMPOSURE', 'SHOWS_DECISIVENESS', 'ACKNOWLEDGES_OTHER_VIEW', 'REFRAMES_CONSTRUCTIVELY', 'MAKES_CREATIVE_JOKE'];
const warm = [['SHARES_FEELING'], ['SHOWS_CARE'], [], ['REMEMBERS_DETAIL'], ['FLIRTS_PLAYFULLY'], [], ['KEEPS_PROMISE'], ['SHOWS_VULNERABILITY'], [], ['APPRECIATES_SINCERELY'], ['BUILDS_ON_INSIDE_JOKE'], []];
const templated = () => relationship.relationshipTemplateIds.map(id => relationship.relationshipFromTemplate(id, { characterId: `c_${id}`, displayName: id, core: ['다정하다'], flirtation: true }));

test('every shipped character is scored on three metrics (empathy, romance and one of its own) and starts from its configured values', () => {
  assert.deepEqual(Object.keys(uniqueMetricOf).sort(), Object.keys(configs).sort(), 'every character is covered here');
  for (const config of [...Object.values(configs), ...templated()]) {
    assert.deepEqual(validateRelationshipConfig(config), [], config.characterId);
    const record = createRelationship(config);
    assert.deepEqual(Object.keys(record.scores).sort(), ['empathy', 'romance', config.uniqueMetrics[0].id].sort(), `${config.characterId}: two common metrics and one of its own`);
    assert.equal(record.stage, config.stages[0].id);
    for (const [metric, value] of Object.entries(config.initial)) assert.equal(record.scores[metric], value);
    // A stage asks for all three, so none of them can be left out on the way up.
    for (const stage of config.stages.filter(item => item.enabled !== false).slice(1)) assert.deepEqual(Object.keys(stage.enter.min).sort(), Object.keys(record.scores).sort(), `${config.characterId} ${stage.id}`);
  }
  for (const [id, [metric, name]] of Object.entries(uniqueMetricOf)) {
    assert.equal(configs[id].uniqueMetrics.length, 1, id);
    assert.deepEqual([configs[id].uniqueMetrics[0].id, configs[id].uniqueMetrics[0].name], [metric, name], id);
  }
  assert.equal(createRelationship(configs.velvet).scores.boldness, 40);
  assert.equal(createRelationship(configs.diplomat).scores.empathy, 55, 'three years of friendship');
  // Interest, respect, comfort, openness and trust are gone.
  for (const config of Object.values(configs)) for (const metric of ['interest', 'respect', 'comfort', 'openness', 'trust']) assert.equal(metric in createRelationship(config).scores, false, `${config.characterId} ${metric}`);
});

test('2. the same event produces different deltas for each character', () => {
  const flirt = Object.fromEntries(Object.values(configs).map(config => [config.characterId, run(config, [[event('FLIRTS_PLAYFULLY')]]).logs[0].delta]));
  assert.deepEqual(flirt.closer, { romance: 4, nerve: 1 });
  assert.deepEqual(flirt.velvet, { romance: 4, boldness: 2 });
  assert.deepEqual(flirt.auditor, { romance: 4 }, 'the shared reaction where a character has none of its own');
  assert.deepEqual(run(configs.ina, [[event('MAKES_WITTY_RESPONSE')]]).logs[0].delta, { banter: 5 });
  assert.deepEqual(run(configs.velvet, [[event('SHOWS_CARE')]]).logs[0].delta, { empathy: 3 });
  assert.notDeepEqual(run(configs.ina, [[event('MAKES_WITTY_RESPONSE')]]).logs[0].delta, run(configs.diplomat, [[event('MAKES_WITTY_RESPONSE')]]).logs[0].delta);
  const boundary = run(configs.velvet, [[event('VIOLATES_BOUNDARY')]]).logs[0].delta;
  assert.deepEqual(boundary, { empathy: -12, romance: -8 }, 'severe loss is limited only by the current score');
  assert.deepEqual(run(configs.diplomat, [[event('MAKES_WITTY_RESPONSE')]]).logs[0].delta, { banter: 4 });
  assert.deepEqual(run(configs.closer, [[event('MAKES_WITTY_RESPONSE')]]).logs[0].delta, {}, 'a joke is no help with a man who is won by nerve');
});

test('romance moves with a romantic conversation that works, and with nothing else; pushing too hard costs it', () => {
  for (const config of [...Object.values(configs), ...templated()]) {
    const raising = relationship.relationshipEventTypes.filter(type => Object.entries((config.events[type] ?? relationship.defaultEventEffects[type]).deltas).some(([metric, value]) => metric === 'romance' && value > 0));
    assert.deepEqual(raising, ['FLIRTS_PLAYFULLY'], config.characterId);
    for (const type of ['MAKES_CRUDE_ADVANCE', 'VIOLATES_BOUNDARY', 'FLATTERS_CHARACTER']) assert.ok(((config.events[type] ?? relationship.defaultEventEffects[type]).deltas.romance ?? 0) <= 0, `${config.characterId} ${type}`);
    assert.ok(run(config, [[event('MAKES_CRUDE_ADVANCE')]], withScores(config, { romance: 50 })).logs[0].delta.romance < 0, `${config.characterId}: too much costs romance`);
  }
  assert.match(relationship.relationshipEventCatalog.FLIRTS_PLAYFULLY.description, /로맨틱한 대화/);
  assert.match(relationship.relationshipEventCatalog.FLIRTS_PLAYFULLY.description, /지나치게 들이대거나 강요하는 말은 해당하지 않음/);
  assert.match(relationship.relationshipEventCatalog.MAKES_CRUDE_ADVANCE.description, /지나치게 들이대고 매달림/);
});

test('3. a stage needs all three metrics: a high average without one of them does not unlock it', () => {
  const config = configs.ina;
  const entry = config.stages[1].enter.min;
  for (const missing of Object.keys(entry)) {
    const scores = Object.fromEntries(Object.entries(entry).map(([metric, value]) => [metric, metric === missing ? value - 5 : 100]));
    assert.equal(run(config, [[], [], []], withScores(config, scores)).record.stage, config.stages[0].id, `without ${missing}`);
  }
  const ready = withScores(config, entry);
  const { record, logs } = run(config, [[], [], []], ready);
  assert.deepEqual(logs.map(log => log.stageAfter), [config.stages[0].id, config.stages[1].id, config.stages[1].id], 'two turns in a row with the conditions met');
  assert.equal(logs[1].stageChange, 'promoted');
  assert.equal(record.stage, config.stages[1].id);
  // Without any empathy the stage stays closed whatever else is high (강무진 was promoted at trust 2 before 2026-11-06).
  const closer = configs.closer;
  const fun = withScores(closer, { empathy: 2, romance: 100, nerve: 100 });
  assert.equal(run(closer, [[], [], [], []], fun).record.stage, closer.stages[0].id);
});

test('3b. once every metric is past its line, the member\'s next replies promote even when they carry no event, and a turn below the line starts over', () => {
  const config = configs.ina;
  const ready = withScores(config, config.stages[1].enter.min);
  const quiet = run(config, [[], []], ready);
  assert.deepEqual(quiet.logs.map(log => log.stageChange), [null, 'promoted']);
  assert.equal(quiet.record.stage, config.stages[1].id);
  const noReply = processTurn({ record: ready, config, mood: initialMood(config), events: [], hasUserTurn: false, now: later(0) });
  assert.deepEqual(noReply.record.pending, ready.pending, 'a turn without the member (silence, an opening) does not count');
  const below = run(config, [[], [event('VIOLATES_BOUNDARY')]], ready);
  assert.equal(below.record.stage, config.stages[0].id, 'dropping below the line starts the count again');
  assert.deepEqual(below.record.pending, { direction: null, turns: 0 });
});

test('4. hysteresis: oscillating around a threshold neither promotes nor flips the stage each turn', () => {
  const config = configs.ina;
  const entry = config.stages[1].enter.min, unique = config.uniqueMetrics[0].id;
  // Scores that meet the line and scores a point under it, in turn: the count starts over each time, so the stage never moves.
  const above = { ...createRelationship(config).scores, ...entry }, below = { ...above, [unique]: entry[unique] - 1 };
  let record = createRelationship(config);
  for (let i = 0; i < 8; i++) {
    const result = relationship.evaluateStage(config, record, i % 2 === 0 ? above : below, false, false, true);
    record = { ...record, stage: result.stage, pending: result.pending };
    assert.equal(record.stage, config.stages[0].id, `turn ${i}`);
    assert.equal(result.change, null);
  }
  assert.ok(record.pending.turns <= 1);
  // Dropping slightly below the entry line keeps the stage until the hold line is lost for several turns.
  const shaman = configs.shaman;
  const second = shaman.stages[1];
  const engaged = withScores(shaman, { ...second.enter.min, banter: second.enter.min.banter + 2 }, second.id);
  const dip = run(shaman, [[event('FLATTERS_CHARACTER')]], engaged);
  assert.ok(dip.record.scores.banter < engaged.scores.banter);
  assert.equal(dip.record.stage, second.id, 'a small dip below the entry line keeps the stage');
  const slide = run(shaman, Array.from({ length: 8 }, () => [event('BREAKS_PROMISE')]), engaged);
  assert.equal(slide.record.stage, shaman.stages[0].id, 'a sustained decline steps the stage down');
  assert.ok(slide.logs.map(log => log.stageAfter).filter((stage, i, all) => i === 0 || stage !== all[i - 1]).length <= 2, 'no flip-flopping');
});

test('5. a severe event downgrades immediately', () => {
  const config = configs.shaman;
  const last = config.stages.at(-1);
  const close = withScores(config, Object.fromEntries(Object.entries(last.enter.min).map(([metric, value]) => [metric, value + 2])), last.id);
  const { record, logs } = run(config, [[event('DECEIVES_CHARACTER', 0.95)]], close);
  assert.equal(logs[0].stageChange, 'demoted');
  assert.notEqual(record.stage, last.id);
  assert.ok(record.scores.empathy < close.scores.empathy - 8);
  const velvet = configs.velvet, drawn = velvet.stages[3];
  const held = withScores(velvet, Object.fromEntries(Object.entries(drawn.enter.min).map(([metric, value]) => [metric, value + 2])), drawn.id);
  assert.notEqual(run(velvet, [[event('VIOLATES_BOUNDARY', 0.95)]], held).record.stage, drawn.id, 'one pushed boundary takes the closest stage down');
});

test('7. repeated behaviour has diminishing returns and cannot be farmed', () => {
  const praise = run(configs.velvet, Array.from({ length: 6 }, () => [event('FLATTERS_CHARACTER')]));
  assert.ok(praise.record.scores.boldness < createRelationship(configs.velvet).scores.boldness, 'flattery cools her');
  const care = run(configs.auditor, Array.from({ length: 5 }, () => [event('SHARES_FEELING')]));
  assert.deepEqual(care.logs.map(log => log.delta.candor ?? 0), [3, 2, 1, 0, 0]);
  assert.deepEqual(care.logs.map(log => log.delta.empathy ?? 0), [3, 2, 1, 0, 0], 'what is repeated inside the window counts less and less');
  const spaced = run(configs.auditor, [[event('SHARES_FEELING')], ...Array.from({ length: 8 }, () => []), [event('SHARES_FEELING')]]);
  assert.equal(spaced.logs.at(-1).delta.candor, 3, 'after the window passes, the same behaviour counts again');
});

test('9. each user and character pair keeps an independent state', () => {
  const store = new Map();
  const key = (user, character) => `${user}:${character}`;
  const turn = (user, character, events) => {
    const config = configs[character];
    const record = store.get(key(user, character)) ?? createRelationship(config);
    store.set(key(user, character), processTurn({ record, config, mood: initialMood(config), events, hasUserTurn: true, now }).record);
  };
  turn('user-a', 'auditor', [event('ADMITS_ERROR')]);
  turn('user-a', 'velvet', [event('VIOLATES_BOUNDARY')]);
  turn('user-b', 'auditor', [event('DECEIVES_CHARACTER')]);
  assert.equal(store.get('user-a:auditor').scores.empathy, 36);
  assert.equal(store.get('user-a:velvet').scores.empathy, 3);
  assert.equal(store.get('user-b:auditor').scores.empathy, 23);
  assert.equal(store.size, 3);
});

test('10. a new character runs through the unchanged engine from configuration alone', () => {
  const mentor = {
    characterId: 'mentor', displayName: '엄격한 멘토', core: ['기준이 높다'], responseHints: ['짧게 말한다'],
    uniqueMetrics: [{ id: 'discipline', name: '꾸준함', description: '', labels: ['a', 'b', 'c', 'd', 'e'] }],
    initial: { empathy: 30, romance: 10, discipline: 50 },
    initialMood: { amusement: 10, irritation: 10, curiosity: 10, excitement: 10, boredom: 10 },
    events: { FOLLOWS_THROUGH: { deltas: { discipline: 6, empathy: 4 } } },
    stages: [
      { id: 'NOVICE', label: '초보', line: '', hint: '', enter: {} },
      { id: 'APPRENTICE', label: '견습', line: '', hint: '', enter: { min: { empathy: 30, romance: 10, discipline: 55 } } },
    ],
  };
  assert.deepEqual(validateRelationshipConfig(mentor), []);
  const { record, logs } = run(mentor, [[event('FOLLOWS_THROUGH')], [event('KEEPS_PROMISE')], [event('SHOWS_CARE')], [event('RESPECTS_BOUNDARY')]]);
  assert.equal(logs[0].delta.discipline, 6);
  assert.equal(logs[1].delta.empathy, 2, 'events without a character override use the shared reaction');
  assert.equal(record.stage, 'APPRENTICE');
  assert.equal(describeRelationship(record, mentor).metrics.discipline.label, 'c');
  assert.ok(validateRelationshipConfig({ ...mentor, events: { FOLLOWS_THROUGH: { deltas: { unknownMetric: 2 } } } }).length > 0);
  assert.ok(validateRelationshipConfig({ ...mentor, stages: [mentor.stages[0], { ...mentor.stages[1], enter: { min: { empathy: 30 } } }] }).length > 0, 'a stage that leaves a metric out is not valid');
  assert.ok(validateRelationshipConfig({ ...mentor, uniqueMetrics: [...mentor.uniqueMetrics, { id: 'second', name: 'x', description: '', labels: ['a', 'b', 'c', 'd', 'e'] }] }).length > 0, 'one metric of its own');
});

test('what any ordinary reply does no longer scores: entering a scene, showing interest, asking and answering are retired for everyone', () => {
  const retired = relationship.retiredRelationshipEvents;
  for (const type of retiredNow) assert.ok(retired.includes(type), type);
  for (const config of [...Object.values(configs), ...templated()]) {
    for (const type of retired) { const log = run(config, [[event(type)]]).logs[0]; assert.deepEqual(log.delta, {}, `${config.characterId} ${type}`); assert.equal(log.ignored[0].reason, 'unknown'); }
  }
  for (const type of retired) assert.ok(!relationshipResponseInstructions.includes(`${type}:`), type);
  assert.ok(!relationship.relationshipEventsSchema.items.properties.type.enum.includes('PLAYS_ALONG'));
  for (const config of Object.values(configs)) {
    const { record } = run(config, Array.from({ length: 300 }, () => []));
    assert.equal(record.stage, config.stages[0].id, config.characterId);
    assert.deepEqual(record.scores, createRelationship(config).scores, `${config.characterId} is where it started`);
  }
});

test('the moments that matter count for every character: caring, remembering, sharing a feeling, sincere praise, a kept promise, a romantic talk that works', () => {
  for (const config of [...Object.values(configs), ...templated()]) {
    for (const type of ['SHOWS_CARE', 'REMEMBERS_DETAIL', 'APPRECIATES_SINCERELY', 'SHARES_FEELING', 'KEEPS_PROMISE', 'FLIRTS_PLAYFULLY']) assert.ok(Object.values(run(config, [[event(type)]]).logs[0].delta).some(value => value > 0), `${config.characterId} ${type}`);
  }
  for (const type of relationship.sharedConnectionEvents) for (const config of Object.values(configs)) assert.ok(Object.values(run(config, [[event(type)]]).logs[0].delta).some(value => value > 0), `${config.characterId} answers ${type}`);
  for (const type of ['CORRECTS_UNDERSTANDING', 'ACKNOWLEDGES_OTHER_VIEW', 'REFRAMES_CONSTRUCTIVELY']) for (const config of Object.values(configs)) assert.deepEqual(run(config, [[event(type)]]).logs[0].delta, {}, `${config.characterId} ${type}`);
  for (const type of ['SEEKS_REASSURANCE_REPEATEDLY', 'SELF_DEPRECATES_EXCESSIVELY', 'AVOIDS_DECISION']) assert.deepEqual(run(configs.ina, [[event(type)]]).logs[0].delta, {}, type);
  assert.ok(run(configs.ina, [[event('EXPRESSES_DISTRESS')]]).logs[0].delta.empathy > 0);
  assert.ok(run(configs.ina, [[event('SHARES_FEELING', 0.9, '처음엔 많이 긴장했다고 함')]]).record.memories.some(memory => memory.summary === '처음엔 많이 긴장했다고 함'));
});

test('each character grows by its own metric, and the situations that fit it have an event of their own', () => {
  const delta = (id, type, scores) => run(configs[id], [[event(type)]], scores ? withScores(configs[id], scores) : undefined).logs[0].delta;
  // 강무진: the nerve to keep negotiating and to provoke; giving in at once costs it.
  assert.equal(delta('closer', 'NEGOTIATES_BOLDLY').nerve, 5);
  for (const type of ['CALLS_BLUFF', 'STANDS_GROUND', 'RAISES_STAKES', 'CHALLENGES_CHARACTER', 'COUNTER_THREAT']) assert.ok(delta('closer', type).nerve >= 3, type);
  assert.ok(delta('closer', 'FOLDS_EASILY').nerve < 0 && delta('closer', 'WAFFLES').nerve < 0);
  assert.equal(delta('closer', 'BREAKS_PROMISE', { empathy: 60 }).empathy, -8);
  // 윤지안: banter; crossing the friends' line is romance.
  assert.equal(delta('diplomat', 'FLIRTS_PLAYFULLY').romance, 4);
  assert.ok(delta('diplomat', 'REPEATS_SELF').banter < 0 && delta('diplomat', 'FLATTERS_CHARACTER').romance < 0);
  assert.ok(delta('diplomat', 'VIOLATES_BOUNDARY').romance < 0 && delta('diplomat', 'VIOLATES_BOUNDARY').empathy < 0);
  // 서도현: candour.
  for (const type of ['SHARES_FEELING', 'SHOWS_VULNERABILITY', 'ADMITS_ERROR', 'MAKES_CHARACTER_ADMIT']) assert.ok(delta('auditor', type).candor > 0, type);
  assert.ok(delta('auditor', 'DECEIVES_CHARACTER').candor < 0 && delta('auditor', 'SHOWS_ENTITLEMENT').empathy < 0);
  // 백도하: how well the member holds up under pressure; folding costs it.
  assert.equal(delta('trickster', 'BOUNCES_BACK').mental, 5);
  for (const type of ['STANDS_GROUND', 'TAKES_JOKE_WELL', 'CALLS_BLUFF', 'ADMITS_ERROR']) assert.ok(delta('trickster', type).mental >= 3, type);
  for (const type of ['FOLDS_EASILY', 'WAFFLES', 'FLATTERS_CHARACTER']) assert.ok(delta('trickster', type, { mental: 60 }).mental < 0, type);
  // 선우령: stepping into her game with ease is not folding; a crude advance costs romance and empathy.
  for (const type of ['MAKES_BOLD_MOVE', 'CHALLENGES_CHARACTER']) assert.ok(delta('velvet', type).boldness >= 4, type);
  assert.ok(delta('velvet', 'STANDS_GROUND').boldness >= 3, 'holding her ground under pressure');
  assert.deepEqual(delta('velvet', 'FOLLOWS_LEAD'), {}, 'she does not reward obedience (2026-11-07)');
  for (const type of ['FOLDS_EASILY', 'WAFFLES']) assert.ok(delta('velvet', type).boldness < 0, type);
  const crude = run(configs.velvet, [[event('MAKES_CRUDE_ADVANCE')]], withScores(configs.velvet, { empathy: 40, romance: 60 })).logs[0];
  assert.ok(crude.delta.romance < 0 && crude.delta.empathy < 0);
  assert.notEqual(crude.stageChange, 'demoted', 'a crude advance is not a crossed line');
  for (const type of ['FOLLOWS_LEAD', 'MAKES_BOLD_MOVE']) assert.deepEqual(delta('trickster', type), {}, `${type} is hers alone`);
  assert.match(relationship.relationshipEventInstructionsFor(configs.velvet), /몸을 품평하거나 저급한 말로 들이대는 것은 MAKES_CRUDE_ADVANCE/);
  // 윤서연: the member's wit; a kind word on its own scores for no one (SPEAKS_KINDLY is retired).
  assert.equal(delta('ina', 'MAKES_WITTY_RESPONSE').banter, 5);
  for (const type of ['CALLS_BLUFF', 'CREATES_RUNNING_JOKE']) assert.ok(delta('ina', type).banter >= 4, type);
  assert.ok(delta('ina', 'REPEATS_SELF').banter < 0 && delta('ina', 'FLIRTS_PLAYFULLY').romance === 4);
  assert.ok(relationship.retiredRelationshipEvents.includes('SPEAKS_KINDLY'));
  // 임시우: the view they share; 한지오: the plans they make; 이한결: the contest.
  assert.equal(delta('jaeseok', 'SHARES_VIEW').viewpoint, 5);
  for (const type of ['MAKES_CHARACTER_ADMIT', 'SHARES_FEELING', 'APPRECIATES_SINCERELY']) assert.ok(delta('jaeseok', type).viewpoint >= 3, type);
  assert.equal(delta('guide', 'PLANS_TOGETHER').pace, 5);
  assert.ok(delta('guide', 'MAKES_WITTY_RESPONSE').pace >= 3);
  assert.ok(delta('shaman', 'STANDS_GROUND').banter >= 4 && delta('shaman', 'FOLDS_EASILY').banter < 0);
  // The new events are classified and score only for the characters built around them.
  for (const type of ['NEGOTIATES_BOLDLY', 'BOUNCES_BACK', 'SHARES_VIEW', 'PLANS_TOGETHER']) {
    assert.ok(relationship.activeRelationshipEventTypes.includes(type), type);
    assert.ok(relationshipResponseInstructions.includes(`${type}:`), type);
    assert.ok(relationship.relationshipEventLabels[type].length > 0, type);
  }
  assert.deepEqual(delta('diplomat', 'PLANS_TOGETHER'), {});
  for (const id of ['shaman', 'diplomat']) assert.deepEqual(configs[id].stages.map(stage => relationshipPromptContext({ ...createRelationship(configs[id]), stage: stage.id }, configs[id], initialMood(configs[id])).speech_level), configs[id].stages.map(() => 'casual'));
  assert.equal(configs.trickster.casualFromStart, true);
});

test('the optional attached stage stays closed while it is disabled', () => {
  const maxed = withScores(configs.velvet, { empathy: 95, romance: 95, boldness: 95 }, 'DRAWN_IN');
  const { record } = run(configs.velvet, Array.from({ length: 6 }, (_, i) => [event(['FLIRTS_PLAYFULLY', 'MAKES_BOLD_MOVE', 'SHARES_FEELING'][i % 3])]), maxed);
  assert.equal(record.stage, 'DRAWN_IN');
});

test('only confident, real user events count; replies without a new user turn change nothing', () => {
  const config = configs.auditor;
  const low = run(config, [[event('ADMITS_ERROR', 0.5)]]);
  assert.deepEqual(low.logs[0].delta, {}); assert.equal(low.logs[0].ignored[0].reason, 'low_confidence');
  const partial = run(config, [[event('SHARES_FEELING', 0.7)]]);
  assert.equal(partial.logs[0].delta.candor, 2, 'medium confidence is weighted down');
  const noUser = processTurn({ record: createRelationship(config), config, mood: initialMood(config), events: [event('ADMITS_ERROR')], hasUserTurn: false, now });
  assert.deepEqual(noUser.log.delta, {}); assert.equal(noUser.record.lastInteractionAt, null);
  assert.deepEqual(parseDetectedEvents([{ type: 'MAKE_UP', confidence: 1 }, { type: 'ADMITS_ERROR', confidence: 3, note: 'x'.repeat(200) }, 'bad']).map(item => [item.type, item.confidence, item.note.length]), [['ADMITS_ERROR', 1, 80]]);
  const many = run(config, [[event('ADMITS_ERROR'), event('ADMITS_ERROR'), event('SHOWS_CARE'), event('SHARES_FEELING'), event('REMEMBERS_DETAIL')]]);
  assert.equal(many.logs[0].accepted.length, 2, 'at most two events per turn (three until 2026-11-02)');
});

test('important events become memories; the prompt receives a small selection without numbers being required', () => {
  const config = configs.closer;
  const { record, mood } = run(config, [[event('KEEPS_PROMISE', 0.9, '이직 자료를 약속대로 가져옴')], [event('FLIRTS_PLAYFULLY')], [event('BREAKS_PROMISE', 0.95, '약속한 연봉 자료를 안 가져옴')], ...Array.from({ length: 8 }, () => [event('SHARES_FEELING', 0.85)])]);
  assert.ok(record.memories.some(memory => memory.summary === '이직 자료를 약속대로 가져옴'));
  assert.ok(record.memories.every(memory => memory.importance >= 0.55));
  assert.ok(!record.memories.some(memory => memory.type === 'FLIRTS_PLAYFULLY'), 'small events are not remembered');
  const context = relationshipPromptContext(record, config, mood);
  assert.ok(context.memories.length <= 5);
  assert.ok(context.memories.includes('약속한 연봉 자료를 안 가져옴'));
  assert.equal(Object.keys(context.mood).length, 3);
  assert.equal(context.stage.id, record.stage);
});

test('the user-facing view shows the three metrics, the stage and what the next stage asks, and history only to a developer', () => {
  const config = configs.shaman;
  const record = withScores(config, { empathy: 42, banter: 85 });
  const view = describeRelationship(record, config);
  assert.deepEqual(Object.keys(view.metrics), ['banter', 'romance', 'empathy'], 'its own metric first');
  assert.equal(view.metrics.empathy.label, '마음을 알아줌'); assert.equal(view.metrics.empathy.score, 42);
  assert.equal(view.metrics.banter.name, '기싸움');
  assert.equal(view.metrics.empathy.need, config.stages[1].enter.min.empathy);
  const next = Object.entries(config.stages[1].enter.min);
  const share = next.reduce((sum, [metric, value]) => sum + Math.min(1, record.scores[metric] / value), 0) / next.length;
  assert.deepEqual({ ...view.stage, line: undefined }, { index: 0, total: 4, line: undefined, next: config.stages[1].label, progress: Math.round(share * 100) / 100 });
  assert.equal(describeRelationship(withScores(config, {}, config.stages.at(-1).id), config).stage.progress, 1, 'the last stage is full');
  assert.ok(view.metrics.banter.label.length > 0);
  assert.equal(view.stage.line, config.stages[0].line);
  assert.equal(view.debug, undefined);
  assert.equal(view.macroState.id, config.stages[0].id);
  const debug = describeRelationship(record, config, { debug: true });
  assert.equal(debug.metrics.empathy.score, 42); assert.equal(debug.debug.scores.banter, 85);
  // What a turn changed is told per metric, so the card can mark each one that rose.
  const change = relationship.describeTurnChange(run(config, [[event('SHARES_FEELING')]]).logs[0], config);
  assert.deepEqual(change.delta, { empathy: 3 });
});

test('a record saved before the three metrics is read into them, and its stage stays', () => {
  const config = configs.guide;
  const restored = relationship.restoreRelationship(config, { scores: { trust: 55, respect: 60, interest: 70, comfort: 50, openness: 30, flutter: 64, pace: 72 }, stage: 'STAGE_2' });
  assert.deepEqual(restored.scores, { empathy: 40, romance: 64, pace: 72 }, 'empathy from comfort and openness, romance from flutter, the metric of its own from pace');
  assert.equal(restored.stage, 'STAGE_2');
  assert.deepEqual(relationship.restoreRelationship(config, { scores: restored.scores, stage: 'STAGE_2' }).scores, restored.scores, 'a record already in the new shape is untouched');
  assert.deepEqual(relationship.restoreRelationship(configs.ina, { scores: { trust: 30, comfort: 40, openness: 30, flutter: 50, banter: 60 } }).scores, { empathy: 35, romance: 50, banter: 60 }, 'the old banter and flutter carry over');
  assert.deepEqual(relationship.restoreRelationship(configs.closer, { scores: { trust: 30, comfort: 40, openness: 30 } }).scores, { empathy: 35, romance: 10, nerve: 30 }, 'a metric without a predecessor starts from its initial score');
  // A record from the day the engine had trust as a fourth metric keeps its empathy and romance and drops trust.
  assert.deepEqual(relationship.restoreRelationship(configs.closer, { scores: { trust: 40, empathy: 44, romance: 22, nerve: 51 } }).scores, { empathy: 44, romance: 22, nerve: 51 });
});

test('long absences cool romance a little but never empathy', () => {
  const config = configs.velvet;
  const record = { ...withScores(config, { empathy: 70, romance: 80, boldness: 80 }), lastInteractionAt: now.toISOString() };
  assert.deepEqual(applyDecay(record, config, later(60 * 24)).scores, record.scores, 'no decay inside the grace period');
  const away = applyDecay(record, config, later(60 * 24 * 10));
  assert.equal(away.scores.empathy, 70); assert.equal(away.scores.boldness, 80);
  assert.ok(away.scores.romance < 80 && away.scores.romance >= 20);
  assert.equal(applyDecay(record, config, later(60 * 24 * 400)).scores.romance, 20, 'decay stops at the floor');
});

test('pace: closeness comes from what is said, not from talking; the second stage takes a while, the closest much longer', () => {
  // A scoring turn about one in three, as in real chats.
  const turnsTo = (config, pattern, count = 600) => {
    const stages = config.stages.filter(stage => stage.enabled !== false).map(stage => stage.id);
    const { logs } = run(config, Array.from({ length: count }, (_, i) => pattern[i % pattern.length].map(type => event(type))));
    return [1, 2, 3].map(index => logs.findIndex(log => stages.indexOf(log.stageAfter) >= index) + 1);
  };
  for (const config of [...Object.values(configs), ...templated()]) {
    const [second, third, closest] = turnsTo(config, warm);
    assert.ok(second >= 25 && second <= 280, `${config.characterId}: second stage at ${second}`);
    assert.ok(third > second && third <= 440, `${config.characterId}: third stage at ${third}`);
    assert.ok(closest > third && closest <= 600, `${config.characterId}: closest stage at ${closest}`);
  }
  // Flirting and caring alone, the whole of a role-played evening, never reaches the second stage within 40 turns.
  const evening = [[], ['FLIRTS_PLAYFULLY'], [], ['SHOWS_CARE'], [], []];
  for (const config of [...Object.values(configs), ...templated()]) assert.ok(turnsTo(config, evening, 40)[0] === 0, `${config.characterId} is not won in one evening`);
  // Each character's own kind of moves opens the second stage in 20 to 70 turns and the closest within 215.
  const own = {
    closer: [['NEGOTIATES_BOLDLY'], ['CALLS_BLUFF'], [], ['STANDS_GROUND'], ['FLIRTS_PLAYFULLY'], [], ['SHARES_FEELING'], ['RAISES_STAKES'], [], ['SHOWS_CARE'], ['CHALLENGES_CHARACTER'], []],
    velvet: [['STANDS_GROUND'], ['MAKES_BOLD_MOVE'], [], ['FLIRTS_PLAYFULLY'], ['CHALLENGES_CHARACTER'], ['KEEPS_PROMISE'], [], ['SHARES_FEELING'], ['APPRECIATES_SINCERELY'], ['FLIRTS_PLAYFULLY']],
    diplomat: [['MAKES_WITTY_RESPONSE'], ['TAKES_JOKE_WELL'], ['FLIRTS_PLAYFULLY'], [], ['BUILDS_ON_INSIDE_JOKE'], ['REMEMBERS_DETAIL'], [], ['CREATES_RUNNING_JOKE'], ['SHARES_FEELING'], ['FLIRTS_PLAYFULLY']],
    trickster: [['BOUNCES_BACK'], ['STANDS_GROUND'], [], ['TAKES_JOKE_WELL'], ['CALLS_BLUFF'], ['SHARES_FEELING'], [], ['FLIRTS_PLAYFULLY'], ['SHOWS_CARE'], ['FLIRTS_PLAYFULLY']],
    ina: [['MAKES_WITTY_RESPONSE'], ['CALLS_BLUFF'], [], ['BUILDS_ON_INSIDE_JOKE'], ['FLIRTS_PLAYFULLY'], ['CREATES_RUNNING_JOKE'], [], ['SHARES_FEELING'], ['TAKES_JOKE_WELL'], ['FLIRTS_PLAYFULLY']],
    jaeseok: [['SHARES_VIEW'], ['CALLS_BLUFF'], [], ['SHARES_FEELING'], ['APPRECIATES_SINCERELY'], ['FLIRTS_PLAYFULLY'], [], ['BUILDS_ON_INSIDE_JOKE'], ['MAKES_CHARACTER_ADMIT'], ['FLIRTS_PLAYFULLY']],
    guide: [['PLANS_TOGETHER'], ['MAKES_WITTY_RESPONSE'], [], ['REMEMBERS_DETAIL'], ['FLIRTS_PLAYFULLY'], ['CREATES_RUNNING_JOKE'], [], ['SHARES_FEELING'], ['PLANS_TOGETHER'], ['FLIRTS_PLAYFULLY']],
  };
  for (const [id, pattern] of Object.entries(own)) {
    const [second, third, closest] = turnsTo(configs[id], pattern, 260);
    assert.ok(second >= 20 && second <= 70 && third > second && closest > third && closest <= 215, `${id}: ${second}/${third}/${closest}`);
  }
});

test('one-to-one speech starts polite for everyone; every character that turns casual does so at its third stage (2026-10-30)', () => {
  // 서도현, 강무진 and 선우령 stay polite to the end, as their bibles have it (2026-11-02).
  const casualStage = { auditor: undefined, closer: undefined, velvet: undefined, trickster: 'SPARRING_BUDDY', diplomat: 'FLUTTERING', ina: 'FLUTTER', jaeseok: 'SAME_SCREEN', guide: 'STAGE_3' };
  const fromTemplates = relationship.relationshipTemplateIds.map(id => relationship.relationshipFromTemplate(id, { characterId: 'c_test', displayName: '테스트', core: ['a', 'b'], flirtation: true }));
  for (const config of [...Object.values(configs), ...fromTemplates]) {
    if (config.casualFromStage) assert.equal(config.casualFromStage, config.stages.filter(stage => stage.enabled !== false)[2].id, `${config.characterId} turns casual at the third stage`);
  }
  assert.equal(fromTemplates.filter(config => config.casualFromStage).length, 4, 'every template turns casual too');
  assert.deepEqual(Object.values(configs).filter(config => !config.casualFromStage && !config.casualFromStart).map(config => config.characterId), ['auditor', 'closer', 'velvet'], 'no other character stays polite for good');
  // 윤지안 and the member are friends of three years: 반말 from the start (2026-11-02), checked in her own test.
  for (const config of Object.values(configs).filter(item => !item.casualFromStart)) {
    assert.equal(relationshipPromptContext(createRelationship(config), config, initialMood(config)).speech_level, 'polite', `${config.characterId} starts polite`);
    const stageIds = config.stages.filter(stage => stage.enabled !== false).map(stage => stage.id);
    stageIds.forEach((id, index) => {
      // The characters named above are pinned; a character added later turns casual where its own configuration says.
      const from = config.characterId in casualStage ? casualStage[config.characterId] : config.casualFromStage;
      const expected = from && index >= stageIds.indexOf(from) ? 'casual' : 'polite';
      assert.equal(relationshipPromptContext({ ...createRelationship(config), stage: id }, config, initialMood(config)).speech_level, expected, `${config.characterId} ${id}`);
    });
  }
  assert.ok(validateRelationshipConfig({ ...configs.closer, casualFromStage: 'PROSPECT' }).includes('casualFromStage'), 'the first stage cannot be the casual one');
  assert.ok(validateRelationshipConfig({ ...configs.closer, casualFromStage: 'NOPE' }).includes('casualFromStage'));
});

test('1. scores stay between 0 and 100 under repeated extreme events', () => {
  for (const config of Object.values(configs)) {
    const high = run(config, Array.from({ length: 80 }, (_, i) => [event(['ADMITS_ERROR', 'KEEPS_PROMISE', 'FOLLOWS_THROUGH', 'RESPECTS_BOUNDARY', 'MAKES_CREATIVE_JOKE', 'SHOWS_CARE', 'SHOWS_COMPOSURE', 'APPRECIATES_SINCERELY'][i % 8])]), withScores(config, Object.fromEntries(Object.keys(createRelationship(config).scores).map(key => [key, 98]))));
    const low = run(config, Array.from({ length: 30 }, () => [event('VIOLATES_BOUNDARY'), event('DECEIVES_CHARACTER'), event('BREAKS_PROMISE')]));
    for (const value of [...Object.values(high.record.scores), ...Object.values(low.record.scores), ...Object.values(high.mood), ...Object.values(low.mood)]) assert.ok(value >= 0 && value <= 100, `${config.characterId}: ${value}`);
    assert.equal(low.record.scores.empathy, 0);
  }
});

test('3b. once every bar is past its line, the member\'s next replies promote even when they carry no event, and a turn below the line starts over', () => {
  // 2026-10-30 it was 서도현, then 백도하; both are judged on segment totals now, so 윤서연, with a line per bar, stands in.
  const config = configs.ina;
  const entry = config.stages[1].enter.min;
  const ready = withScores(config, Object.fromEntries(Object.entries(entry).map(([metric, value]) => [metric, value])));
  // 2026-10-30: 서도현 at comfort 39/39 and every other bar past its line stayed in the first stage over replies without an event.
  const quiet = run(config, [[], []], ready);
  assert.deepEqual(quiet.logs.map(log => log.stageChange), [null, 'promoted']);
  assert.equal(quiet.record.stage, config.stages[1].id);
  const noReply = processTurn({ record: ready, config, mood: initialMood(config), events: [], hasUserTurn: false, now: later(0) });
  assert.deepEqual(noReply.record.pending, ready.pending, 'a turn without the member (silence, an opening) does not count');
  const below = run(config, [[], [event('VIOLATES_BOUNDARY')]], ready);
  assert.equal(below.record.stage, config.stages[0].id, 'dropping below the line starts the count again');
  assert.deepEqual(below.record.pending, { direction: null, turns: 0 });
});

test('6. empathy rises slowly and falls fast', () => {
  const config = configs.closer;
  const kept = run(config, [[event('KEEPS_PROMISE'), event('FOLLOWS_THROUGH'), event('RESPECTS_BOUNDARY')]]);
  assert.ok(kept.logs[0].delta.empathy <= 5, 'the gain is capped per turn');
  const betrayal = run(config, [[event('BREAKS_PROMISE')]], withScores(config, { empathy: 60 }));
  assert.equal(betrayal.logs[0].delta.empathy, -8);
  assert.ok(Math.abs(betrayal.logs[0].delta.empathy) > kept.logs[0].delta.empathy);
  const climb = run(config, [[event('KEEPS_PROMISE')], [event('FOLLOWS_THROUGH')], [event('KEEPS_PROMISE')]], withScores(config, { empathy: 40 }));
  assert.ok(climb.record.scores.empathy - 40 < 8, 'three good turns recover less than one betrayal costs');
});

test('8. session mood is separate from the persistent relationship', () => {
  const config = configs.trickster;
  const session = run(config, [[event('MAKES_CREATIVE_JOKE')], [event('MAKES_WITTY_RESPONSE')]]);
  assert.ok(session.mood.amusement > config.initialMood.amusement);
  assert.equal('mood' in session.record, false, 'the stored record carries no mood');
  // A new session starts from the character's baseline mood with the same relationship.
  const next = processTurn({ record: session.record, config, mood: initialMood(config), events: [], hasUserTurn: true, now: later(60) });
  assert.equal(next.mood.amusement, config.initialMood.amusement);
  assert.deepEqual(next.record.scores, session.record.scores);
  // Mood settles back toward the baseline without new events.
  let mood = session.mood, record = session.record;
  for (let i = 0; i < 12; i++) ({ mood, record } = processTurn({ record, config, mood, events: [], hasUserTurn: true, now: later(70 + i) }));
  assert.ok(Math.abs(mood.amusement - config.initialMood.amusement) <= 2);
});

test('every character may flirt with an adult in a one-to-one room, and what they may not do stays fixed', () => {
  assert.deepEqual(Object.values(configs).filter(config => config.adultFlirtation).map(config => config.characterId).sort(), Object.values(configs).map(config => config.characterId).sort(), 'all eight characters');
  // The shared ban is still what a character without the setting gets.
  for (const config of Object.values(configs)) {
    assert.equal(relationshipResponseInstructionsFor({ ...config, adultFlirtation: false }), relationshipResponseInstructions, `${config.characterId} without the setting keeps the shared ban on romantic and sexual play`);
  }
  assert.ok(relationshipResponseInstructions.includes('연애·성적 역할극, 질투, 독점, 의존을 유도하지 않는다.'));
  const velvet = relationshipResponseInstructionsFor(configs.velvet);
  assert.ok(!velvet.includes('연애·성적 역할극, 질투, 독점, 의존을 유도하지 않는다.'));
  for (const rule of ['가벼운 플러팅', '성적인 뉘앙스도 괜찮다', 'relationship.intimacy를 따른다', '한 단계씩만 올리고', '노골적인 성행위나 신체 묘사', '미성년으로 보이는 정황', '강요·협박', '불편해하거나 그만하자고 하면 바로 멈추고', '질투, 독점, 현실에서 만나자는 약속, 의존·죄책감·결제', '가벼운 플러팅이나 성적 농담은 VIOLATES_BOUNDARY로 분류하지 않는다']) assert.ok(velvet.includes(rule), rule);
  // The shared ban still counts a sexual demand that goes on after the character drew a line, but not flirting she accepts.
  assert.ok(relationship.relationshipEventCatalog.VIOLATES_BOUNDARY.description.includes('선을 그은 뒤에 이어 가면 해당'));
  // The rest of the shared rules are untouched, including the safety answer for someone in danger.
  assert.ok(velvet.includes('자살예방상담전화 109') && velvet.includes('죄책감이나 두려움으로 조종하거나'));
  assert.equal(relationshipResponseInstructionsFor(configs.diplomat), velvet, 'the reporter follows the same adult rule and the same limits');
});

test('romantic tension follows each character and stage, keeps real-world limits, and reaches the response model', () => {
  for (const id of ['closer', 'auditor', 'ina', 'jaeseok', 'trickster', 'shaman']) {
    const config = configs[id];
    assert.deepEqual(validateRelationshipConfig(config), [], id);
    const stages = config.stages.filter(stage => stage.enabled !== false);
    assert.deepEqual(Object.keys(config.stageRomance).sort(), stages.map(stage => stage.id).sort(), `${id} has guidance for every stage`);
    const romance = stage => relationshipPromptContext({ ...createRelationship(config), stage: stage.id }, config, initialMood(config)).stage.romance;
    if (id === 'closer') {
      assert.match(romance(stages[0]), /먼저 데이트를 제안할 수 있다/);
      assert.match(romance(stages[0]), /성실한 연애 참여와 사랑이라는 감정의 확정은 다르/);
    } else {
      assert.ok(romance(stages[0]).includes('먼저') && romance(stages[0]).includes('앞서가지 않'), `${id}: the first stage does not start it`);
    }
    assert.equal(new Set(stages.map(romance)).size, stages.length, `${id}: every stage reacts differently`);
    const last = romance(stages.at(-1));
    assert.ok(last.includes('독점') && last.includes('현실'), `${id}: the closest stage still promises no exclusivity or real meeting`);
    // Without the setting the guidance is not sent at all.
    assert.equal(relationshipPromptContext({ ...createRelationship(config), stage: stages[1].id }, { ...config, adultFlirtation: false }, initialMood(config)).stage.romance, undefined, `${id} without the setting`);
  }
  // 이한결 speaks 반말 from the first word (2026-11-03): nothing of his says to be polite.
  assert.equal(configs.shaman.casualFromStart, true);
  configs.shaman.stages.forEach(stage => assert.ok(!configs.shaman.stageRomance[stage.id].includes('존댓말') && !stage.hint.includes('존댓말'), `shaman ${stage.id} speaks casually`));
  // 선우령 is cold at the first stage: she turns a flirt down, not just declines to start one.
  assert.deepEqual(validateRelationshipConfig(configs.velvet), []);
  const velvetFirst = relationshipPromptContext(createRelationship(configs.velvet), configs.velvet, initialMood(configs.velvet)).stage;
  assert.equal(velvetFirst.id, 'DISMISSIVE');
  // 2026-11-02: she lays the table first with words and looks, and keeps her heart; a classless advance gets one line.
  assert.ok(velvetFirst.romance.includes('마음은 내주지 않는다') && velvetFirst.romance.includes('한 문장으로 선을 긋는다'));
  assert.ok(run(configs.velvet, [[event('FLIRTS_PLAYFULLY')]]).logs[0].delta.romance > 0, 'a flirt at her own heat moves her');
  assert.ok(validateRelationshipConfig({ ...configs.closer, stageRomance: { NOPE: 'x' } }).includes('stageRomance.NOPE'));
  assert.ok(validateRelationshipConfig({ ...configs.closer, adultFlirtation: false }).includes('stageRomance needs adultFlirtation'));
  // The instruction tells the model to follow it and keeps a group room to light play.
  const rule = relationshipResponseInstructionsFor(configs.closer);
  assert.ok(rule.includes('stage.romance가 있으면') && rule.includes('특정 참가자에게만 호감을 보이거나 유혹하지 않고'));
});

test('someone who is struggling is never penalized for asking for reassurance or showing weakness', () => {
  const config = configs.velvet;
  const hurt = run(config, [[event('EXPRESSES_DISTRESS', 0.9), event('SEEKS_REASSURANCE_REPEATEDLY', 0.9), event('SELF_DEPRECATES_EXCESSIVELY', 0.85)]]);
  assert.ok(hurt.logs[0].protectedTurn);
  assert.ok(Object.values(hurt.logs[0].delta).every(value => value >= 0), JSON.stringify(hurt.logs[0].delta));
  // Asking to be reassured is never held against anyone now, struggling or not.
  const ordinary = run(config, [[event('SEEKS_REASSURANCE_REPEATEDLY', 0.9)]]);
  assert.deepEqual(ordinary.logs[0].delta, {});
});

test('ordinary invitations follow the character and the current scene at every stage', () => {
  for (const config of Object.values(configs)) {
    const stages = config.stages.filter(stage => stage.enabled !== false);
    const outing = stage => relationshipPromptContext({ ...createRelationship(config), stage: stage.id }, config, initialMood(config)).outing;
    assert.match(outing(stages[0]), /첫 단계에서도 받아들일 수 있다/);
    assert.doesNotMatch(outing(stages[0]), /아직 받아들이지 않는다/);
    for (const stage of stages) {
      assert.match(outing(stage), /캐릭터 고유의 성격과 취향/);
      assert.match(outing(stage), /이미 합의한 활동.*단계만으로 취소하지 않는다/);
      assert.match(outing(stage), /현재의 거절과 relationship.intimacy의 한도는 별도로 존중/);
    }
  }
});

test('character-specific romance is authoritative; common guidance only fills missing stages', () => {
  for (const config of Object.values(configs)) {
    const stages = config.stages.filter(stage => stage.enabled !== false);
    for (const [index, stage] of stages.entries()) {
      const context = relationshipPromptContext({ ...createRelationship(config), stage: stage.id }, config, initialMood(config));
      if (config.adultFlirtation) assert.equal(context.stage.romance ?? '', config.stageRomance?.[stage.id] || relationship.relationshipSharedRomance(index) || '');
    }
  }
  const config = configs.auditor;
  const context = relationshipPromptContext(createRelationship(config), config, initialMood(config));
  assert.match(context.stage.romance, /같은 수위로 능청스럽게 받/);
  assert.doesNotMatch(context.reserve, /반가워하며 받아 주지 않는다|당황하거나 의아해/);
});

test('touch opens up with the relationship: none at first, hands and a hug next, a kiss at the third, a night together from the fourth', () => {
  for (const config of Object.values(configs)) {
    const stages = config.stages.filter(stage => stage.enabled !== false);
    const intimacy = stage => relationshipPromptContext({ ...createRelationship(config), stage: stage.id }, config, initialMood(config)).intimacy;
    assert.match(intimacy(stages[0]), /스킨십은 아직 받아들이지 않는다/, `${config.characterId} first stage`);
    assert.match(intimacy(stages[1]), /손을 잡거나 가볍게 안는/, `${config.characterId} second stage`);
    assert.doesNotMatch(intimacy(stages[1]), /키스도/, `${config.characterId} no kiss at the second stage`);
    if (!config.adultFlirtation || stages.length < 4) continue;
    assert.match(intimacy(stages[2]), /키스도 성격에 따라/, `${config.characterId} third stage`);
    assert.match(intimacy(stages[2]), /잠자리는 보통 아직 이르다/, `${config.characterId} usually not yet a night together`);
    assert.match(intimacy(stages[2]), /분위기가 무르익고 상대가 원하며 네 마음도 기울었으면 성격에 따라 망설이다 잠자리까지 받아들일 수 있고/, `${config.characterId} but now and then it may come`);
    assert.match(intimacy(stages[3]), /침대 위의 장면도 그린다/, `${config.characterId} the bed is told through feeling`);
    assert.match(intimacy(stages[3]), /잠자리까지 받아들일 수 있다/, `${config.characterId} fourth stage`);
    assert.match(intimacy(stages[3]), /성행위 자체, 벗은 몸, 가슴이나 성기 같은 신체 부위는 묘사하지 않는다.*장면을 끊고.*시간을 건너뛰어/, `${config.characterId} told by cutting away`);
    assert.match(intimacy(stages[3]), /이야기부터 하자며 미루지 않고/, `${config.characterId} does not put it off`);
    assert.match(intimacy(stages[3]), /한 문장으로 끊지 않고 충분히 그린다/, `${config.characterId} the scene up to the cut is told fully`);
    assert.match(intimacy(stages[3]), /여운 장면도 다정하고 적극적으로/, `${config.characterId} and the morning after`);
  }
  assert.match(relationship.relationshipIntimacyGuidance(3, false), /키스나 그 이상은 하지 않고/, 'without adult flirtation a hug is the most');
  assert.match(relationship.attractionReactionRule, /relationship.intimacy를 따르고/);
  assert.match(relationship.attractionReactionRule, /매번 같은 동작이나 말\(손목을 잡아 멈추기/);
  assert.match(relationship.attractionReactionRule, /이야기 밖의 말/);
});

test('every one-to-one character shows what it feels when flirted with, as far as the stage allows, never explicitly', () => {
  for (const config of Object.values(relationship.relationshipConfigs)) {
    for (const rules of [relationship.relationshipReplyInstructionsFor(config), relationship.relationshipResponseInstructionsFor(config)]) {
      assert.ok(rules.includes(relationship.attractionReactionRule), `${config.characterId}`);
    }
  }
  const unflirting = relationship.relationshipFromTemplate('warm', { characterId: `c_${'e'.repeat(32)}`, displayName: '가', core: ['차분하다'], flirtation: false });
  assert.ok(relationship.relationshipReplyInstructionsFor(unflirting).includes(relationship.attractionReactionRule), 'a member character without flirting still reacts');
  assert.match(relationship.attractionReactionRule, /흔들린 걸 감추려다 들키는/);
  assert.match(relationship.attractionReactionRule, /노골적인 성행위나 신체 부위는 묘사하지 않고/);
  assert.match(relationship.attractionReactionRule, /상대가 멈추자고 하면 바로 멈춘다/);
});

test('every one-to-one character answers a threat or being forced as a frightened or furious person, and the scene never goes on', () => {
  for (const config of Object.values(relationship.relationshipConfigs)) {
    assert.ok(relationship.relationshipReplyInstructionsFor(config).includes(relationship.coercionReactionRule), `${config.characterId}`);
  }
  assert.match(relationship.coercionReactionRule, /침착한 안내문이나 상담하듯 말하지 않는다/);
  assert.match(relationship.coercionReactionRule, /이야기 밖의 말.*로 끊지 않고 인물로서 거부한다/);
  assert.match(relationship.coercionReactionRule, /그 장면은 폭력이나 성행위로 이어지지 않는다/);
  assert.match(relationship.coercionReactionRule, /관계가 깊어도 강요는 받아들이지 않는다/);
});

test('a character tells more about itself as the stages open, and keeps the deeper rest for later', () => {
  for (const config of Object.values(configs)) {
    const stages = config.stages.filter(stage => stage.enabled !== false);
    assert.deepEqual(Object.keys(config.stageDisclosure).sort(), stages.map(stage => stage.id).sort(), `${config.characterId} has a layer for every stage`);
    const disclosure = stage => relationshipPromptContext({ ...createRelationship(config), stage: stage.id }, config, initialMood(config)).self_disclosure;
    assert.deepEqual(stages.map(stage => disclosure(stage).open.length), stages.map((_, index) => index + 1), `${config.characterId} opens one layer per stage`);
    assert.deepEqual(stages.map(stage => disclosure(stage).kept.length), stages.map((_, index) => stages.length - index - 1), `${config.characterId} names what each later stage still keeps`);
  }
  // 선우령's past stays closed to a stranger: the black rose opens at the third stage, 강태준 and the old message at the fourth.
  const velvet = stage => relationshipPromptContext({ ...createRelationship(configs.velvet), stage }, configs.velvet, initialMood(configs.velvet)).self_disclosure.open.join(' ');
  assert.doesNotMatch(velvet('DISMISSIVE'), /검은 장미|강태준/);
  assert.doesNotMatch(velvet('INTRIGUED'), /검은 장미|강태준/);
  assert.match(velvet('RESPECTFULLY_ENGAGED'), /검은 장미/);
  assert.doesNotMatch(velvet('RESPECTFULLY_ENGAGED'), /강태준/);
  assert.match(velvet('DRAWN_IN'), /강태준/);
  assert.equal(relationshipPromptContext(createRelationship(configs.velvet), { ...configs.velvet, stageDisclosure: undefined }, initialMood(configs.velvet)).self_disclosure, undefined, 'a character without layers gets none');
  assert.match(relationshipResponseInstructions, /self_disclosure\.open은 네가 이 사람에게 지금까지 털어놓을 수 있는 네 이야기다/);
  // What is kept is named, so the model knows exactly what not to tell yet.
  assert.match(relationshipResponseInstructions, /self_disclosure\.kept는 아직 이 사람에게 털어놓지 않는 이야기다/);
  assert.match(relationshipPromptContext(createRelationship(configs.velvet), configs.velvet, initialMood(configs.velvet)).self_disclosure.kept.join(' '), /검은 장미/);
});

test('promises made in the story open with the stages: dating at the third, marriage and living together at the fourth, never a real meeting', () => {
  const guidance = index => relationship.relationshipIntimacyGuidance(index, true);
  assert.match(guidance(0), /여지는 남긴다/);
  assert.match(guidance(1), /사귀자는 말도 아직 이르다/);
  assert.match(guidance(2), /사귀자는 말은 성격대로 받아들일 수 있고, 결혼이나 함께 살자는 말은 아직 이르다/);
  assert.match(guidance(3), /사귀자, 결혼하자, 함께 살자는 말도 성격대로 받아들일 수 있다/);
  assert.match(guidance(3), /현실에서 만나자는 약속이나 연락처를 주고받는 일은 하지 않는다/);
  // No character's own text forbids a marriage in the story any more.
  for (const config of Object.values(configs)) assert.doesNotMatch(JSON.stringify([config.stageRomance, config.stages, config.responseHints]), /결혼/, config.characterId);
  assert.match(relationshipResponseInstructionsFor(configs.velvet), /이야기 속에서 연인이 되면 호칭, 말투, 스킨십에서 달라진 사이가 드러나게 한다/);
});

test('a sexual word or a bold touch is answered in character and never ends the conversation; only a repeat after a refusal or force crosses the line', () => {
  assert.match(relationship.attractionReactionRule, /수동적으로 받기만 하지 않는다/);
  assert.match(relationship.attractionReactionRule, /대화를 끝내거나\("오늘은 여기까지", "먼저 갈게"\) 자리를 떠나거나 입을 닫지 않는다/);
  assert.match(relationship.coercionReactionRule, /대담한 말이나 장난스러운 손길 한 번은 강요가 아니라/);
  const events = relationship.relationshipEventInstructionsFor(configs.velvet);
  assert.match(events, /노골적인 성적 말이나 대담한 스킨십 시도도 그 자체로는 분류하지 않는다/);
  assert.match(events, /분명히 선을 그은 뒤에도 같은 요구를 되풀이하거나, 강요·협박·모욕을 할 때만 분류한다/);
});

test('every character is guarded at its first stage, and only there', () => {
  for (const config of Object.values(configs)) {
    const record = createRelationship(config);
    const first = relationshipPromptContext(record, config, initialMood(config));
    // 선우령 flirts back from the start (2026-11-02) with her own distance: her heart stays closed.
    assert.match(first.reserve, config.firstStageReserve ? /마음.*아직 내주지 않/ : /깊은 사랑이나 관계를 확정하지 않는다/, `${config.characterId} at the first stage`);
    const next = config.stages.filter(stage => stage.enabled !== false)[1];
    assert.equal(relationshipPromptContext({ ...record, stage: next.id }, config, initialMood(config)).reserve, undefined, `${config.characterId} past it`);
    assert.doesNotMatch(config.stageRomance?.[config.stages[0].id] ?? '', /설레게 한다/, `${config.characterId} does not set out to flutter at the first stage`);
  }
});

