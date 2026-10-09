import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const relationship = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const { relationshipConfigs: configs, createRelationship, processTurn, initialMood, describeRelationship, validateRelationshipConfig, applyDecay, relationshipPromptContext, parseDetectedEvents } = relationship;
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

test('every shipped character configuration is valid and starts from its configured values', () => {
  assert.deepEqual(Object.keys(configs).sort(), ['auditor', 'closer', 'diplomat', 'ina', 'jaeseok', 'lawyer', 'trickster', 'velvet']);
  for (const config of Object.values(configs)) {
    assert.deepEqual(validateRelationshipConfig(config), [], config.characterId);
    const record = createRelationship(config);
    assert.equal(Object.keys(record.scores).length, 7, 'five common and two unique metrics');
    assert.equal(record.stage, config.stages[0].id);
    for (const [metric, value] of Object.entries(config.initial)) assert.equal(record.scores[metric], value);
  }
  assert.equal(createRelationship(configs.velvet).scores.intrigue, 35);
  assert.equal(createRelationship(configs.auditor).scores.rigor, 40);
});

test('one-to-one speech starts polite for everyone; four characters turn casual from the next stage', () => {
  const casualStage = { auditor: 'UNDER_REVIEW', closer: 'COUNTERPARTY', velvet: 'INTRIGUED', trickster: 'BANTER_PARTNER' };
  for (const config of Object.values(configs)) {
    assert.equal(relationshipPromptContext(createRelationship(config), config, initialMood(config)).speech_level, 'polite', `${config.characterId} starts polite`);
    const stageIds = config.stages.filter(stage => stage.enabled !== false).map(stage => stage.id);
    stageIds.forEach((id, index) => {
      const expected = casualStage[config.characterId] && index >= stageIds.indexOf(casualStage[config.characterId]) ? 'casual' : 'polite';
      assert.equal(relationshipPromptContext({ ...createRelationship(config), stage: id }, config, initialMood(config)).speech_level, expected, `${config.characterId} ${id}`);
    });
  }
  assert.ok(validateRelationshipConfig({ ...configs.closer, casualFromStage: 'PROSPECT' }).includes('casualFromStage'), 'the first stage cannot be the casual one');
  assert.ok(validateRelationshipConfig({ ...configs.closer, casualFromStage: 'NOPE' }).includes('casualFromStage'));
});

test('1. scores stay between 0 and 100 under repeated extreme events', () => {
  for (const config of Object.values(configs)) {
    const high = run(config, Array.from({ length: 80 }, (_, i) => [event(['ADMITS_ERROR', 'KEEPS_PROMISE', 'FOLLOWS_THROUGH', 'RESPECTS_BOUNDARY', 'MAKES_CREATIVE_JOKE', 'IDENTIFIES_BATNA', 'SHOWS_COMPOSURE', 'PROVIDES_EVIDENCE'][i % 8])]), withScores(config, Object.fromEntries(Object.keys(createRelationship(config).scores).map(key => [key, 98]))));
    const low = run(config, Array.from({ length: 30 }, () => [event('VIOLATES_BOUNDARY'), event('DECEIVES_CHARACTER'), event('BREAKS_PROMISE')]));
    for (const value of [...Object.values(high.record.scores), ...Object.values(low.record.scores), ...Object.values(high.mood), ...Object.values(low.mood)]) assert.ok(value >= 0 && value <= 100, `${config.characterId}: ${value}`);
    assert.equal(low.record.scores.trust, 0);
  }
});

test('2. the same event produces different deltas for each character', () => {
  const deltas = Object.fromEntries(Object.values(configs).map(config => [config.characterId, run(config, [[event('ADMITS_ERROR')]]).logs[0].delta]));
  assert.deepEqual(deltas.auditor, { trust: 3, respect: 3, epistemicHonesty: 6 });
  assert.deepEqual(deltas.closer, { trust: 2, respect: 2 });
  assert.deepEqual(deltas.velvet, { trust: 4, respect: 3, poise: 2 });
  assert.deepEqual(deltas.trickster, { trust: 2, comfort: 1 });
  const reassurance = Object.fromEntries(Object.values(configs).map(config => [config.characterId, run(config, [[event('SEEKS_REASSURANCE_REPEATEDLY')]]).logs[0].delta]));
  assert.deepEqual(reassurance.velvet, { poise: -5, interest: -3, respect: -2 });
  assert.deepEqual(reassurance.closer, { resolve: -4, respect: -2 });
  const boundary = run(configs.velvet, [[event('VIOLATES_BOUNDARY')]]).logs[0].delta;
  assert.deepEqual(boundary, { trust: -10, respect: -10, comfort: -10 }, 'severe loss is limited only by the current score');
});

test('3. stages follow each character\'s own threshold rules, not an average', () => {
  const config = configs.velvet;
  // A high average without the specific metrics does not unlock the stage.
  const lopsided = withScores(config, { trust: 95, respect: 95, comfort: 95, openness: 95, poise: 95, interest: 40, intrigue: 30 });
  assert.equal(run(config, [[event('SHOWS_CURIOSITY')], [event('ASKS_GOOD_QUESTION')], [event('PROVIDES_EVIDENCE')]], lopsided).record.stage, 'DISMISSIVE');
  const ready = withScores(config, { intrigue: 55, interest: 55 });
  const { record, logs } = run(config, [[event('PROVIDES_EVIDENCE')], [event('PROVIDES_EVIDENCE')], [event('ASKS_GOOD_QUESTION')]], ready);
  assert.deepEqual(logs.map(log => log.stageAfter), ['DISMISSIVE', 'DISMISSIVE', 'INTRIGUED']);
  assert.equal(logs[2].stageChange, 'promoted');
  assert.equal(record.stage, 'INTRIGUED');
});

test('4. hysteresis: oscillating around a threshold neither promotes nor flips the stage each turn', () => {
  const config = configs.auditor;
  // UNDER_REVIEW -> CREDIBLE needs respect >= 60 among others. Respect oscillates 59/61.
  let record = withScores(config, { trust: 55, respect: 59, epistemicHonesty: 65, rigor: 60 }, 'UNDER_REVIEW');
  let mood = initialMood(config);
  const sequence = [['ASKS_GOOD_QUESTION'], ['MAKES_UNSUPPORTED_CLAIM'], ['ASKS_GOOD_QUESTION'], ['MAKES_UNSUPPORTED_CLAIM'], ['ASKS_GOOD_QUESTION']];
  const stages = sequence.map((types, i) => {
    const result = processTurn({ record, config, mood, events: types.map(type => event(type)), hasUserTurn: true, now: later(i) });
    record = result.record; mood = result.mood; return [record.scores.respect, record.stage];
  });
  assert.ok(stages.every(([, stage]) => stage === 'UNDER_REVIEW'), JSON.stringify(stages));
  // Dropping slightly below the entry line keeps the stage until the hold line is lost for several turns.
  const engaged = withScores(configs.velvet, { respect: 61, interest: 66, intrigue: 56, trust: 30 }, 'RESPECTFULLY_ENGAGED');
  const dip = run(configs.velvet, [[event('SEEKS_REASSURANCE_REPEATEDLY')]], engaged);
  assert.ok(dip.record.scores.respect < 60);
  assert.equal(dip.record.stage, 'RESPECTFULLY_ENGAGED', 'a small dip below the entry line keeps the stage');
  const slide = run(configs.velvet, Array.from({ length: 5 }, () => [event('SHOWS_ENTITLEMENT'), event('REPEATS_SELF')]), engaged);
  assert.deepEqual(slide.logs.map(log => log.stageAfter).filter((stage, i, all) => i === 0 || stage !== all[i - 1]).length <= 2, true, 'no flip-flopping');
  assert.equal(slide.record.stage, 'INTRIGUED', 'a sustained decline eventually steps down one stage');
});

test('5. a severe event downgrades immediately', () => {
  const config = configs.velvet;
  const close = withScores(config, { intrigue: 75, respect: 68, interest: 74, trust: 42 }, 'DRAWN_IN');
  const { record, logs } = run(config, [[event('VIOLATES_BOUNDARY', 0.95)]], close);
  assert.equal(logs[0].stageChange, 'demoted');
  assert.notEqual(record.stage, 'DRAWN_IN');
  assert.ok(record.scores.trust <= 32);
  const auditor = withScores(configs.auditor, { trust: 72, respect: 77, epistemicHonesty: 77, rigor: 72 }, 'TRUSTED_THINKER');
  assert.notEqual(run(configs.auditor, [[event('DECEIVES_CHARACTER', 0.9)]], auditor).record.stage, 'TRUSTED_THINKER');
});

test('6. trust rises slowly and falls fast', () => {
  const config = configs.closer;
  const kept = run(config, [[event('KEEPS_PROMISE'), event('FOLLOWS_THROUGH'), event('RESPECTS_BOUNDARY')]]);
  assert.ok(kept.logs[0].delta.trust <= 4, 'trust gain is capped per turn');
  const betrayal = run(config, [[event('BREAKS_PROMISE')]], withScores(config, { trust: 60 }));
  assert.equal(betrayal.logs[0].delta.trust, -12);
  assert.ok(Math.abs(betrayal.logs[0].delta.trust) >= 3 * kept.logs[0].delta.trust);
  const climb = run(config, [[event('KEEPS_PROMISE')], [event('FOLLOWS_THROUGH')], [event('KEEPS_PROMISE')]], withScores(config, { trust: 40 }));
  assert.ok(climb.record.scores.trust - 40 < 12, 'three good turns recover less than one betrayal costs');
});

test('7. repeated behaviour has diminishing returns and cannot be farmed', () => {
  const evidence = run(configs.auditor, Array.from({ length: 5 }, () => [event('PROVIDES_EVIDENCE')]));
  assert.deepEqual(evidence.logs.map(log => log.delta.rigor ?? 0), [5, 3, 1, 0, 0]);
  assert.deepEqual(evidence.logs.slice(3).map(log => log.ignored.map(item => item.reason)), [['diminished'], ['diminished']]);
  const praise = run(configs.velvet, Array.from({ length: 6 }, () => [event('FLATTERS_CHARACTER')]));
  assert.ok(praise.record.scores.intrigue < createRelationship(configs.velvet).scores.intrigue, 'flattery lowers her intrigue');
  assert.ok(praise.record.scores.respect < createRelationship(configs.velvet).scores.respect);
  // After the window passes, the same behaviour counts again.
  const spaced = run(configs.auditor, [[event('PROVIDES_EVIDENCE')], ...Array.from({ length: 8 }, () => [event('SHOWS_CURIOSITY')]), [event('PROVIDES_EVIDENCE')]]);
  assert.equal(spaced.logs.at(-1).delta.rigor, 5);
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
  assert.equal(store.get('user-a:auditor').scores.trust, 23);
  assert.equal(store.get('user-a:velvet').scores.trust, 0);
  assert.equal(store.get('user-b:auditor').scores.trust, 6);
  assert.equal(store.size, 3);
});

test('10. a new character runs through the unchanged engine from configuration alone', () => {
  const mentor = {
    characterId: 'mentor', displayName: '엄격한 멘토', core: ['기준이 높다'], responseHints: ['짧게 말한다'],
    uniqueMetrics: [
      { id: 'discipline', name: '꾸준함', description: '', labels: ['a', 'b', 'c', 'd', 'e'] },
      { id: 'ownership', name: '주인의식', description: '', labels: ['a', 'b', 'c', 'd', 'e'] },
    ],
    initial: { trust: 30, respect: 30, interest: 30, comfort: 30, openness: 30, discipline: 50, ownership: 50 },
    initialMood: { amusement: 10, irritation: 10, curiosity: 10, excitement: 10, boredom: 10 },
    events: { FOLLOWS_THROUGH: { deltas: { discipline: 6, respect: 4 } } },
    stages: [
      { id: 'NOVICE', label: '초보', line: '', hint: '', enter: {} },
      { id: 'APPRENTICE', label: '견습', line: '', hint: '', enter: { min: { discipline: 55 } } },
    ],
  };
  assert.deepEqual(validateRelationshipConfig(mentor), []);
  const { record, logs } = run(mentor, [[event('FOLLOWS_THROUGH')], [event('KEEPS_PROMISE')], [event('ASKS_GOOD_QUESTION')], [event('RESPECTS_BOUNDARY')]]);
  assert.equal(logs[0].delta.discipline, 6);
  assert.equal(logs[1].delta.trust, 3, 'events without a character override use the shared reaction');
  assert.equal(record.stage, 'APPRENTICE');
  assert.equal(describeRelationship(record, mentor).metrics.discipline.label, 'c');
  assert.ok(validateRelationshipConfig({ ...mentor, events: { FOLLOWS_THROUGH: { deltas: { unknownMetric: 2 } } } }).length > 0);
});

test('the empath grows by understanding: feelings raise attunement and nobody is punished for needing reassurance', () => {
  const config = configs.ina;
  assert.deepEqual(config.stages.map(stage => stage.id), ['POLITE', 'UNDERSTOOD', 'CONFIDANT', 'SAFE_HARBOR']);
  assert.deepEqual(run(config, [[event('SHARES_FEELING')]]).logs[0].delta, { openness: 3, comfort: 2, attunement: 4, emotionalSafety: 2, respect: 1 });
  for (const type of ['SEEKS_REASSURANCE_REPEATEDLY', 'SELF_DEPRECATES_EXCESSIVELY', 'AVOIDS_DECISION', 'REPEATS_SELF']) assert.deepEqual(run(config, [[event(type)]]).logs[0].delta, {}, type);
  // Crossing a boundary costs far more safety than a good turn gives.
  assert.equal(run(config, [[event('VIOLATES_BOUNDARY')]]).logs[0].delta.emotionalSafety, -15);
  const ready = withScores(config, { attunement: 42, comfort: 55, trust: 45, openness: 38 });
  const { record, logs } = run(config, [[event('SHARES_FEELING')], [event('SHOWS_VULNERABILITY')], [event('CORRECTS_UNDERSTANDING')]], ready);
  assert.deepEqual(logs.map(log => log.stageAfter), ['POLITE', 'POLITE', 'UNDERSTOOD']);
  assert.equal(record.stage, 'UNDERSTOOD');
  // A feeling that is shared is remembered so a later turn can connect it.
  assert.ok(run(config, [[event('SHARES_FEELING', 0.9, '괜찮다고 했지만 많이 속상해함')]]).record.memories.some(memory => memory.summary === '괜찮다고 했지만 많이 속상해함'));
});

test('the wit grows by shared jokes: running jokes raise familiarity and are remembered', () => {
  const config = configs.jaeseok;
  assert.deepEqual(config.stages.map(stage => stage.id), ['FRIENDLY', 'IN_SYNC', 'INSIDE_JOKE', 'OLD_FRIEND']);
  const created = run(config, [[event('CREATES_RUNNING_JOKE', 0.9, '“시장조사 좀 더”가 미루기의 암호가 됨')]]);
  assert.deepEqual(created.logs[0].delta, { familiarity: 5, chemistry: 3, interest: 2 });
  assert.ok(created.record.memories.some(memory => memory.summary.includes('시장조사')), 'the joke is remembered so it can come back later');
  assert.equal(run(config, [[event('BUILDS_ON_INSIDE_JOKE')]]).logs[0].delta.familiarity, 6);
  // The same flattery or repetition does not build chemistry; it costs a little.
  assert.ok(run(config, [[event('REPEATS_SELF')]]).logs[0].delta.chemistry < 0);
  const ready = withScores(config, { chemistry: 72, familiarity: 55, comfort: 65, trust: 50, interest: 66 }, 'IN_SYNC');
  const { record } = run(config, [[event('BUILDS_ON_INSIDE_JOKE')], [event('MAKES_WITTY_RESPONSE')], [event('TAKES_JOKE_WELL')]], ready);
  assert.equal(record.stage, 'INSIDE_JOKE');
});

test('the new events change only the characters built around them', () => {
  for (const id of ['auditor', 'closer', 'velvet', 'trickster']) {
    for (const type of ['SHARES_FEELING', 'CORRECTS_UNDERSTANDING', 'CREATES_RUNNING_JOKE', 'BUILDS_ON_INSIDE_JOKE', 'ACKNOWLEDGES_OTHER_VIEW', 'REFRAMES_CONSTRUCTIVELY', 'ANSWERS_DIRECTLY', 'EVADES_QUESTION', 'CONTRADICTS_SELF']) assert.deepEqual(run(configs[id], [[event(type)]]).logs[0].delta, {}, `${id} ${type}`);
  }
  for (const id of ['ina', 'jaeseok']) for (const type of ['ACKNOWLEDGES_OTHER_VIEW', 'REFRAMES_CONSTRUCTIVELY', 'ANSWERS_DIRECTLY', 'EVADES_QUESTION', 'CONTRADICTS_SELF']) assert.deepEqual(run(configs[id], [[event(type)]]).logs[0].delta, {}, `${id} ${type}`);
  // The diplomat ignores the lawyer's events and the lawyer ignores the diplomat's.
  for (const type of ['ANSWERS_DIRECTLY', 'EVADES_QUESTION', 'CONTRADICTS_SELF']) assert.deepEqual(run(configs.diplomat, [[event(type)]]).logs[0].delta, {}, `diplomat ${type}`);
  for (const type of ['ACKNOWLEDGES_OTHER_VIEW', 'REFRAMES_CONSTRUCTIVELY']) assert.deepEqual(run(configs.lawyer, [[event(type)]]).logs[0].delta, {}, `lawyer ${type}`);
});

test('the diplomat and the lawyer grow by their own habits and stay polite at every stage', () => {
  const diplomat = run(configs.diplomat, [[event('ACKNOWLEDGES_OTHER_VIEW')], [event('REFRAMES_CONSTRUCTIVELY')]]);
  assert.equal(diplomat.logs[0].delta.perspective > 0, true);
  assert.equal(diplomat.logs[1].delta.tact > 0, true);
  assert.ok(run(configs.diplomat, [[event('MAKES_EMPTY_THREAT')]]).logs[0].delta.tact < 0, 'an empty ultimatum costs her the most');
  const lawyer = run(configs.lawyer, [[event('ANSWERS_DIRECTLY')], [event('EVADES_QUESTION')], [event('CONTRADICTS_SELF')], [event('ADMITS_ERROR')]]);
  assert.ok(lawyer.logs[0].delta.directness > 0 && lawyer.logs[1].delta.directness < 0 && lawyer.logs[2].delta.consistency < 0 && lawyer.logs[3].delta.consistency > 0);
  for (const config of [configs.diplomat, configs.lawyer]) {
    assert.equal(config.casualFromStage, undefined, `${config.characterId} never turns casual`);
    for (const stage of config.stages) assert.equal(relationshipPromptContext({ ...createRelationship(config), stage: stage.id }, config, initialMood(config)).speech_level, 'polite', `${config.characterId} ${stage.id}`);
  }
});

test('the optional attached stage stays closed while it is disabled', () => {
  const maxed = withScores(configs.velvet, { trust: 95, respect: 95, interest: 95, comfort: 95, openness: 95, intrigue: 95, poise: 95 }, 'DRAWN_IN');
  const { record } = run(configs.velvet, Array.from({ length: 6 }, (_, i) => [event(['SHOWS_COMPOSURE', 'MAKES_WITTY_RESPONSE', 'ASKS_GOOD_QUESTION'][i % 3])]), maxed);
  assert.equal(record.stage, 'DRAWN_IN');
});

test('someone who is struggling is never penalized for asking for reassurance or showing weakness', () => {
  const config = configs.velvet;
  const hurt = run(config, [[event('EXPRESSES_DISTRESS', 0.9), event('SEEKS_REASSURANCE_REPEATEDLY', 0.9), event('SELF_DEPRECATES_EXCESSIVELY', 0.85)]]);
  assert.ok(hurt.logs[0].protectedTurn);
  assert.ok(Object.values(hurt.logs[0].delta).every(value => value >= 0), JSON.stringify(hurt.logs[0].delta));
  const ordinary = run(config, [[event('SEEKS_REASSURANCE_REPEATEDLY', 0.9)]]);
  assert.ok(ordinary.logs[0].delta.poise < 0);
});

test('only confident, real user events count; replies without a new user turn change nothing', () => {
  const config = configs.auditor;
  const low = run(config, [[event('ADMITS_ERROR', 0.5)]]);
  assert.deepEqual(low.logs[0].delta, {}); assert.equal(low.logs[0].ignored[0].reason, 'low_confidence');
  const partial = run(config, [[event('PROVIDES_EVIDENCE', 0.7)]]);
  assert.equal(partial.logs[0].delta.rigor, 4, 'medium confidence is weighted down');
  const noUser = processTurn({ record: createRelationship(config), config, mood: initialMood(config), events: [event('ADMITS_ERROR')], hasUserTurn: false, now });
  assert.deepEqual(noUser.log.delta, {}); assert.equal(noUser.record.lastInteractionAt, null);
  assert.deepEqual(parseDetectedEvents([{ type: 'MAKE_UP', confidence: 1 }, { type: 'ADMITS_ERROR', confidence: 3, note: 'x'.repeat(200) }, 'bad']).map(item => [item.type, item.confidence, item.note.length]), [['ADMITS_ERROR', 1, 80]]);
  const many = run(config, [[event('ADMITS_ERROR'), event('ADMITS_ERROR'), event('PROVIDES_EVIDENCE'), event('ASKS_GOOD_QUESTION'), event('SHOWS_CURIOSITY')]]);
  assert.equal(many.logs[0].accepted.length, 3, 'at most three events per turn');
});

test('important events become memories; the prompt receives a small selection without numbers being required', () => {
  const config = configs.closer;
  const { record, mood } = run(config, [[event('IDENTIFIES_BATNA', 0.9, '이직 제안을 대안으로 확보')], [event('SHOWS_CURIOSITY')], [event('BREAKS_PROMISE', 0.95, '약속한 연봉 자료를 안 가져옴')], ...Array.from({ length: 8 }, () => [event('DEFINES_CONCRETE_TERMS', 0.85)])]);
  assert.ok(record.memories.some(memory => memory.summary === '이직 제안을 대안으로 확보'));
  assert.ok(record.memories.every(memory => memory.importance >= 0.55));
  assert.ok(!record.memories.some(memory => memory.type === 'SHOWS_CURIOSITY'), 'small events are not remembered');
  const context = relationshipPromptContext(record, config, mood);
  assert.ok(context.memories.length <= 5);
  assert.ok(context.memories.includes('약속한 연봉 자료를 안 가져옴'));
  assert.equal(Object.keys(context.mood).length, 3);
  assert.equal(context.stage.id, record.stage);
});

test('the user-facing view hides raw scores unless a developer asks', () => {
  const config = configs.velvet;
  const record = withScores(config, { trust: 42, intrigue: 85 });
  const view = describeRelationship(record, config);
  assert.equal(view.metrics.trust.label, '믿어 보는 중'); assert.equal(view.metrics.trust.score, undefined);
  assert.equal(view.metrics.intrigue.label, '사로잡힘'); assert.equal(view.debug, undefined);
  assert.equal(view.macroState.id, 'DISMISSIVE');
  const debug = describeRelationship(record, config, { debug: true });
  assert.equal(debug.metrics.trust.score, 42); assert.equal(debug.debug.scores.intrigue, 85);
});

test('long absences lower interest a little but never trust or respect', () => {
  const config = configs.velvet;
  const record = { ...withScores(config, { trust: 70, respect: 70, interest: 80, intrigue: 80 }), lastInteractionAt: now.toISOString() };
  assert.deepEqual(applyDecay(record, config, later(60 * 24)).scores, record.scores, 'no decay inside the grace period');
  const away = applyDecay(record, config, later(60 * 24 * 10));
  assert.equal(away.scores.trust, 70); assert.equal(away.scores.respect, 70);
  assert.ok(away.scores.interest < 80 && away.scores.interest >= 40);
  assert.ok(away.scores.intrigue < 80 && away.scores.intrigue >= 35);
  assert.equal(applyDecay(record, config, later(60 * 24 * 400)).scores.interest, 40, 'decay stops at the floor');
});
