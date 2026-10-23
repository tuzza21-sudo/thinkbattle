import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const relationship = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const { relationshipResponseInstructions, relationshipResponseInstructionsFor, relationshipConfigs: configs, createRelationship, processTurn, initialMood, describeRelationship, validateRelationshipConfig, applyDecay, relationshipPromptContext, parseDetectedEvents } = relationship;
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
  assert.equal(createRelationship(configs.auditor).scores.resonance, 30);
});

test('one-to-one speech starts polite for everyone; five characters turn casual from the next stage', () => {
  const casualStage = { auditor: 'WARMING_UP', closer: 'COUNTERPARTY', velvet: 'INTRIGUED', trickster: 'BANTER_PARTNER', diplomat: 'GOOD_CHEMISTRY' };
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
    const high = run(config, Array.from({ length: 80 }, (_, i) => [event(['ADMITS_ERROR', 'KEEPS_PROMISE', 'FOLLOWS_THROUGH', 'RESPECTS_BOUNDARY', 'MAKES_CREATIVE_JOKE', 'SHOWS_CARE', 'SHOWS_COMPOSURE', 'APPRECIATES_SINCERELY'][i % 8])]), withScores(config, Object.fromEntries(Object.keys(createRelationship(config).scores).map(key => [key, 98]))));
    const low = run(config, Array.from({ length: 30 }, () => [event('VIOLATES_BOUNDARY'), event('DECEIVES_CHARACTER'), event('BREAKS_PROMISE')]));
    for (const value of [...Object.values(high.record.scores), ...Object.values(low.record.scores), ...Object.values(high.mood), ...Object.values(low.mood)]) assert.ok(value >= 0 && value <= 100, `${config.characterId}: ${value}`);
    assert.equal(low.record.scores.trust, 0);
  }
});

test('2. the same event produces different deltas for each character', () => {
  const deltas = Object.fromEntries(Object.values(configs).map(config => [config.characterId, run(config, [[event('ADMITS_ERROR')]]).logs[0].delta]));
  assert.deepEqual(deltas.auditor, { trust: 3, respect: 3, epistemicHonesty: 5 });
  assert.deepEqual(deltas.closer, { trust: 2, respect: 2 });
  assert.deepEqual(deltas.velvet, { trust: 4, respect: 3, poise: 2 });
  assert.deepEqual(deltas.trickster, { trust: 2, comfort: 1 });
  const care = Object.fromEntries(Object.values(configs).map(config => [config.characterId, run(config, [[event('SHOWS_CARE')]]).logs[0].delta]));
  assert.deepEqual(care.auditor, { resonance: 4, comfort: 3, trust: 2 });
  assert.deepEqual(care.closer, { comfort: 3, trust: 2, resolve: 2 });
  const boundary = run(configs.velvet, [[event('VIOLATES_BOUNDARY')]]).logs[0].delta;
  assert.deepEqual(boundary, { trust: -10, respect: -10, comfort: -10 }, 'severe loss is limited only by the current score');
});

test('3. stages follow each character\'s own threshold rules, not an average', () => {
  const config = configs.velvet;
  // A high average without the specific metrics does not unlock the stage.
  const lopsided = withScores(config, { trust: 95, respect: 95, comfort: 95, openness: 95, poise: 95, interest: 40, intrigue: 30 });
  assert.equal(run(config, [[event('SHOWS_CURIOSITY')], [event('ASKS_GOOD_QUESTION')], [event('SHOWS_CARE')]], lopsided).record.stage, 'DISMISSIVE');
  const ready = withScores(config, { intrigue: 55, interest: 55 });
  const { record, logs } = run(config, [[event('SHOWS_CARE')], [event('SHOWS_CARE')], [event('ASKS_GOOD_QUESTION')]], ready);
  assert.deepEqual(logs.map(log => log.stageAfter), ['DISMISSIVE', 'DISMISSIVE', 'INTRIGUED']);
  assert.equal(logs[2].stageChange, 'promoted');
  assert.equal(record.stage, 'INTRIGUED');
});

test('4. hysteresis: oscillating around a threshold neither promotes nor flips the stage each turn', () => {
  const config = configs.velvet;
  // DISMISSIVE -> INTRIGUED needs intrigue at its entry line (and interest). Intrigue oscillates around it.
  const line = config.stages[1].enter.min.intrigue;
  let record = withScores(config, { intrigue: line - 3, interest: 70 });
  let mood = initialMood(config);
  const sequence = [['MAKES_WITTY_RESPONSE'], ['REPEATS_SELF'], ['MAKES_WITTY_RESPONSE'], ['REPEATS_SELF'], ['MAKES_WITTY_RESPONSE']];
  const stages = sequence.map((types, i) => {
    const result = processTurn({ record, config, mood, events: types.map(type => event(type)), hasUserTurn: true, now: later(i) });
    record = result.record; mood = result.mood; return [record.scores.intrigue, record.stage];
  });
  assert.ok(stages.some(([score]) => score >= line) && stages.some(([score]) => score < line), 'intrigue crosses the entry line in both directions');
  assert.ok(stages.every(([, stage]) => stage === 'DISMISSIVE'), JSON.stringify(stages));
  // Dropping slightly below the entry line keeps the stage until the hold line is lost for several turns.
  const entry = config.stages[2].enter.min;
  const engaged = withScores(configs.velvet, { respect: entry.respect + 1, interest: entry.interest + 1, intrigue: entry.intrigue + 1, trust: 30 }, 'RESPECTFULLY_ENGAGED');
  const dip = run(configs.velvet, [[event('FLATTERS_CHARACTER')]], engaged);
  assert.ok(dip.record.scores.respect < entry.respect);
  assert.equal(dip.record.stage, 'RESPECTFULLY_ENGAGED', 'a small dip below the entry line keeps the stage');
  const slide = run(configs.velvet, Array.from({ length: 5 }, () => [event('SHOWS_ENTITLEMENT'), event('REPEATS_SELF')]), engaged);
  assert.deepEqual(slide.logs.map(log => log.stageAfter).filter((stage, i, all) => i === 0 || stage !== all[i - 1]).length <= 2, true, 'no flip-flopping');
  assert.equal(slide.record.stage, 'INTRIGUED', 'a sustained decline eventually steps down one stage');
});

test('5. a severe event downgrades immediately', () => {
  const config = configs.velvet;
  // Trust a little above the closest stage's line; one pushed boundary takes it below the hold line at once.
  const close = withScores(config, { intrigue: 75, respect: 68, interest: 74, trust: config.stages.find(stage => stage.id === 'DRAWN_IN').enter.min.trust + 3 }, 'DRAWN_IN');
  const { record, logs } = run(config, [[event('VIOLATES_BOUNDARY', 0.95)]], close);
  assert.equal(logs[0].stageChange, 'demoted');
  assert.notEqual(record.stage, 'DRAWN_IN');
  assert.ok(record.scores.trust < close.scores.trust - 8);
  const auditor = withScores(configs.auditor, { trust: 63, respect: 60, interest: 70, comfort: 75, openness: 62, resonance: 80, epistemicHonesty: 70 }, 'MUTUAL_TRUST');
  assert.notEqual(run(configs.auditor, [[event('DECEIVES_CHARACTER', 0.9)]], auditor).record.stage, 'MUTUAL_TRUST');
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
  const answers = run(configs.auditor, Array.from({ length: 5 }, () => [event('ANSWERS_DIRECTLY')]));
  assert.deepEqual(answers.logs.map(log => log.delta.epistemicHonesty ?? 0), [4, 2, 1, 0, 0]);
  assert.deepEqual(answers.logs.slice(3).map(log => log.ignored.map(item => item.reason)), [['diminished'], ['diminished']]);
  const praise = run(configs.velvet, Array.from({ length: 6 }, () => [event('FLATTERS_CHARACTER')]));
  assert.ok(praise.record.scores.intrigue < createRelationship(configs.velvet).scores.intrigue, 'flattery lowers her intrigue');
  assert.ok(praise.record.scores.respect < createRelationship(configs.velvet).scores.respect);
  // After the window passes, the same behaviour counts again.
  const spaced = run(configs.auditor, [[event('ANSWERS_DIRECTLY')], ...Array.from({ length: 8 }, () => [event('SHOWS_CURIOSITY')]), [event('ANSWERS_DIRECTLY')]]);
  assert.equal(spaced.logs.at(-1).delta.epistemicHonesty, 4);
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
  assert.equal(store.get('user-a:auditor').scores.trust, 28);
  assert.equal(store.get('user-a:velvet').scores.trust, 0);
  assert.equal(store.get('user-b:auditor').scores.trust, 11);
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

test('the thriller director grows by candour and a shared view; jokes help only a little and arguing earns nothing', () => {
  const config = configs.jaeseok;
  assert.deepEqual(config.stages.map(stage => stage.id), ['FIRST_SCREENING', 'SPARRING', 'SAME_SCREEN', 'FIRST_VIEWER']);
  assert.deepEqual(config.uniqueMetrics.map(metric => metric.id), ['viewpoint', 'candor']);
  const delta = (type, note) => run(config, [[event(type, 0.9, note)]]).logs[0].delta;
  // A question that reaches a character's heart is the strongest way in; a joke is worth less, and arguing nothing.
  assert.deepEqual(delta('ASKS_GOOD_QUESTION'), { viewpoint: 4, interest: 3, respect: 1 });
  assert.ok(delta('ASKS_GOOD_QUESTION').viewpoint > delta('MAKES_CREATIVE_JOKE').viewpoint);
  assert.deepEqual(delta('CHALLENGES_CHARACTER_RESPECTFULLY'), {});
  for (const type of ['APPRECIATES_SINCERELY', 'PLAYS_ALONG']) assert.ok(delta(type).viewpoint >= 3, type);
  assert.ok(Math.max(...Object.values(delta('MAKES_WITTY_RESPONSE'))) <= 2 && Math.max(...Object.values(delta('MAKES_CREATIVE_JOKE'))) <= 2);
  // A feeling with its reason, a straight answer and an admitted mistake build candour.
  for (const type of ['SHARES_FEELING', 'ANSWERS_DIRECTLY', 'ADMITS_ERROR', 'SHOWS_VULNERABILITY']) assert.ok(delta(type).candor > 0, type);
  // Being vague or changing one's mind is no longer held against anyone.
  for (const type of ['EVADES_QUESTION', 'CONTRADICTS_SELF', 'SELF_DECEPTION', 'MAKES_UNSUPPORTED_CLAIM']) assert.deepEqual(delta(type), {}, type);
  assert.ok(delta('FLATTERS_CHARACTER').respect < 0);
  assert.ok(delta('REPEATS_SELF').interest < 0);
  // A phrase made together is remembered so it can come back later.
  const created = run(config, [[event('CREATES_RUNNING_JOKE', 0.9, '화려하기만 한 롱테이크를 비싼 체조라고 부르기로 함')]]);
  assert.ok(created.record.memories.some(memory => memory.summary.includes('비싼 체조')), 'the phrase is remembered so it can come back later');
  const ready = withScores(config, { viewpoint: 60, respect: 52, interest: 64 });
  const { record } = run(config, [[event('ASKS_GOOD_QUESTION')], [event('APPRECIATES_SINCERELY')], [event('PLAYS_ALONG')]], ready);
  assert.equal(record.stage, 'SPARRING');
});

test('the engineer grows by feelings shared and honesty; a lie or a push costs more than a good turn gives', () => {
  const config = configs.auditor;
  assert.deepEqual(config.stages.map(stage => stage.id), ['FIRST_MEETING', 'WARMING_UP', 'KNOWS_YOUR_MIND', 'MUTUAL_TRUST']);
  assert.deepEqual(config.uniqueMetrics.map(metric => metric.id), ['resonance', 'epistemicHonesty']);
  const delta = type => run(config, [[event(type)]]).logs[0].delta;
  // A feeling with its reason is the way in; it raises resonance more than anything he is argued into.
  assert.equal(delta('SHARES_FEELING').resonance, 5);
  assert.ok(delta('SHARES_FEELING').resonance > delta('ANSWERS_DIRECTLY').epistemicHonesty);
  assert.equal(delta('SHOWS_CARE').resonance, 4, 'caring for him counts as much as a hard feeling shared');
  for (const type of ['SHOWS_VULNERABILITY', 'CORRECTS_UNDERSTANDING']) assert.ok(delta(type).resonance >= 4, type);
  // Candour is still counted, and a lie lowers it; evidence and claims count for nothing now.
  for (const type of ['ADMITS_ERROR', 'ANSWERS_DIRECTLY', 'CORRECTS_UNDERSTANDING']) assert.ok(delta(type).epistemicHonesty > 0, type);
  assert.ok(delta('DECEIVES_CHARACTER').epistemicHonesty < 0);
  for (const type of ['PROVIDES_EVIDENCE', 'MAKES_UNSUPPORTED_CLAIM', 'SELF_DECEPTION']) assert.deepEqual(delta(type), {}, type);
  // A dodged question is not held against a shy person, and an insecure one is met gently.
  assert.deepEqual(delta('EVADES_QUESTION'), {});
  assert.deepEqual(delta('SEEKS_REASSURANCE_REPEATEDLY'), {});
  assert.ok(delta('VIOLATES_BOUNDARY').trust < 0 && delta('VIOLATES_BOUNDARY').resonance < 0);
  // A conversation made of feelings reaches the second stage, where he speaks more freely, with no evidence at all.
  const warm = [['SHARES_FEELING'], ['SHOWS_CURIOSITY'], ['ASKS_GOOD_QUESTION'], ['CORRECTS_UNDERSTANDING'], ['SHOWS_VULNERABILITY'], ['SHARES_FEELING'], ['ACKNOWLEDGES_OTHER_VIEW'], ['SHARES_FEELING'], ['ASKS_GOOD_QUESTION'], ['SHOWS_VULNERABILITY'], ['SHARES_FEELING'], ['KEEPS_PROMISE'], ['SHARES_FEELING'], ['SHOWS_VULNERABILITY']];
  assert.equal(run(config, warm.map(types => types.map(type => event(type)))).record.stage, 'WARMING_UP');
  // The same number of turns spent arguing with evidence does not warm him up at all.
  const cold = Array.from({ length: 14 }, (_, i) => [event(['PROVIDES_EVIDENCE', 'CHALLENGES_CHARACTER_RESPECTFULLY', 'DEFINES_CONCRETE_TERMS'][i % 3])]);
  assert.equal(run(config, cold).record.stage, 'FIRST_MEETING');
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

test('romantic tension opens stage by stage: the first stage never starts it, the closest never promises, and the guidance reaches the response model', () => {
  for (const id of ['closer', 'auditor', 'ina', 'jaeseok', 'trickster', 'lawyer']) {
    const config = configs[id];
    assert.deepEqual(validateRelationshipConfig(config), [], id);
    const stages = config.stages.filter(stage => stage.enabled !== false);
    assert.deepEqual(Object.keys(config.stageRomance).sort(), stages.map(stage => stage.id).sort(), `${id} has guidance for every stage`);
    const romance = stage => relationshipPromptContext({ ...createRelationship(config), stage: stage.id }, config, initialMood(config)).stage.romance;
    assert.ok(romance(stages[0]).includes('먼저') && romance(stages[0]).includes('앞서가지 않'), `${id}: the first stage does not start it`);
    assert.equal(new Set(stages.map(romance)).size, stages.length, `${id}: every stage reacts differently`);
    const last = romance(stages.at(-1));
    assert.ok(last.includes('독점') && last.includes('현실'), `${id}: the closest stage still promises no exclusivity or real meeting`);
    // Without the setting the guidance is not sent at all.
    assert.equal(relationshipPromptContext({ ...createRelationship(config), stage: stages[1].id }, { ...config, adultFlirtation: false }, initialMood(config)).stage.romance, undefined, `${id} without the setting`);
  }
  for (const stage of configs.lawyer.stages) assert.ok(configs.lawyer.stageRomance[stage.id].includes('존댓말'), `lawyer ${stage.id} stays polite`);
  // 선우령 is cold at the first stage: she turns a flirt down, not just declines to start one, and flirting does not raise her interest.
  assert.deepEqual(validateRelationshipConfig(configs.velvet), []);
  const velvetFirst = relationshipPromptContext(createRelationship(configs.velvet), configs.velvet, initialMood(configs.velvet)).stage;
  assert.equal(velvetFirst.id, 'DISMISSIVE');
  assert.ok(velvetFirst.romance.includes('거절한다') && velvetFirst.romance.includes('먼저 유혹하지 않고'));
  assert.ok(run(configs.velvet, [[event('FLIRTS_PLAYFULLY')]]).logs[0].delta.intrigue > 0, 'a flirt she turns down still intrigues her');
  assert.ok(validateRelationshipConfig({ ...configs.closer, stageRomance: { NOPE: 'x' } }).includes('stageRomance.NOPE'));
  assert.ok(validateRelationshipConfig({ ...configs.closer, adultFlirtation: false }).includes('stageRomance needs adultFlirtation'));
  // The instruction tells the model to follow it and keeps a group room to light play.
  const rule = relationshipResponseInstructionsFor(configs.closer);
  assert.ok(rule.includes('stage.romance가 있으면') && rule.includes('특정 참가자에게만 호감을 보이거나 유혹하지 않고'));
});

test('companion scoring: the debate events count for nothing and are not asked for; caring, remembering, playing along and sincere praise count for everyone', () => {
  const retired = relationship.retiredRelationshipEvents;
  assert.equal(retired.length, 12);
  // The house characters and every template a member's character is built from.
  const templated = relationship.relationshipTemplateIds.map(id => relationship.relationshipFromTemplate(id, { characterId: `custom-${id}`, displayName: id, core: ['다정하다'], flirtation: true }));
  for (const config of [...Object.values(configs), ...templated]) {
    for (const type of retired) { const log = run(config, [[event(type)]]).logs[0]; assert.deepEqual(log.delta, {}, `${config.characterId} ${type}`); assert.equal(log.ignored[0].reason, 'unknown'); }
    for (const type of ['SHOWS_CARE', 'REMEMBERS_DETAIL', 'PLAYS_ALONG', 'APPRECIATES_SINCERELY']) assert.ok(Object.values(run(config, [[event(type)]]).logs[0].delta).some(value => value > 0), `${config.characterId} ${type}`);
    // A warm conversation without any arguing reaches the closest enabled stage.
    const warm = ['SHARES_FEELING', 'SHOWS_CARE', 'ASKS_GOOD_QUESTION', 'PLAYS_ALONG', 'REMEMBERS_DETAIL', 'APPRECIATES_SINCERELY', 'MAKES_WITTY_RESPONSE', 'KEEPS_PROMISE', 'SHOWS_VULNERABILITY', 'ANSWERS_DIRECTLY', 'FLIRTS_PLAYFULLY', 'BUILDS_ON_INSIDE_JOKE', 'SHOWS_DECISIVENESS', 'FOLLOWS_THROUGH', 'ADMITS_ERROR', 'RESPECTS_BOUNDARY', 'TAKES_JOKE_WELL', 'SHOWS_COMPOSURE', 'MAKES_CREATIVE_JOKE', 'CORRECTS_UNDERSTANDING'];
    const reached = run(config, Array.from({ length: 160 }, (_, i) => [event(warm[(i * 2) % warm.length]), event(warm[(i * 2 + 1) % warm.length])])).record.stage;
    assert.equal(reached, config.stages.filter(stage => stage.enabled !== false).at(-1).id, `${config.characterId} reaches the closest stage by warmth alone`);
  }
  const instructions = relationshipResponseInstructions;
  for (const type of retired) assert.ok(!instructions.includes(`${type}:`), type);
  for (const type of ['SHOWS_CARE', 'REMEMBERS_DETAIL', 'PLAYS_ALONG', 'APPRECIATES_SINCERELY']) assert.ok(instructions.includes(`${type}:`), type);
  assert.ok(!relationship.relationshipEventsSchema.items.properties.type.enum.includes('PROVIDES_EVIDENCE'));
});

test('the listening and reframing events still leave out the characters not built around them', () => {
  for (const type of ['CORRECTS_UNDERSTANDING', 'ACKNOWLEDGES_OTHER_VIEW', 'REFRAMES_CONSTRUCTIVELY']) for (const id of ['closer', 'velvet', 'trickster']) assert.deepEqual(run(configs[id], [[event(type)]]).logs[0].delta, {}, `${id} ${type}`);
  for (const type of ['ACKNOWLEDGES_OTHER_VIEW', 'REFRAMES_CONSTRUCTIVELY', 'ANSWERS_DIRECTLY', 'EVADES_QUESTION', 'CONTRADICTS_SELF']) assert.deepEqual(run(configs.ina, [[event(type)]]).logs[0].delta, {}, `ina ${type}`);
  // The engineer is built around feelings and listening: he reacts to them and ignores the humour, reframing and dodging events.
  for (const type of ['SHARES_FEELING', 'CORRECTS_UNDERSTANDING', 'ACKNOWLEDGES_OTHER_VIEW', 'ANSWERS_DIRECTLY']) assert.ok(Object.keys(run(configs.auditor, [[event(type)]]).logs[0].delta).length > 0, `auditor ${type}`);
  for (const type of ['CREATES_RUNNING_JOKE', 'BUILDS_ON_INSIDE_JOKE', 'REFRAMES_CONSTRUCTIVELY']) assert.deepEqual(run(configs.auditor, [[event(type)]]).logs[0].delta, {}, `auditor ${type}`);
  // The thriller director reads the rest, but never the reframing events that belong to the lawyer and the diplomat.
  assert.deepEqual(run(configs.jaeseok, [[event('REFRAMES_CONSTRUCTIVELY')]]).logs[0].delta, {});
  // The reporter (id diplomat) ignores the lawyer's habits.
  for (const type of ['ANSWERS_DIRECTLY', 'REFRAMES_CONSTRUCTIVELY']) assert.deepEqual(run(configs.diplomat, [[event(type)]]).logs[0].delta, {}, `reporter ${type}`);
  // Playful flirting counts for the characters whose closeness grows through it, not for the listeners.
  for (const id of ['ina', 'auditor']) assert.deepEqual(run(configs[id], [[event('FLIRTS_PLAYFULLY')]]).logs[0].delta, {}, `${id} FLIRTS_PLAYFULLY`);
  for (const type of ['ACKNOWLEDGES_OTHER_VIEW', 'REFRAMES_CONSTRUCTIVELY']) assert.deepEqual(run(configs.lawyer, [[event(type)]]).logs[0].delta, {}, `lawyer ${type}`);
});

test('the reporter grows by banter and a spark, and the closeness comes with the stage', () => {
  const config = configs.diplomat;
  assert.deepEqual(config.stages.map(stage => stage.id), ['FIRST_IMPRESSION', 'GOOD_CHEMISTRY', 'FLUTTERING', 'SOMEONE_SPECIAL']);
  assert.deepEqual(config.uniqueMetrics.map(metric => metric.id), ['banter', 'spark']);
  const delta = type => run(config, [[event(type)]]).logs[0].delta;
  // A joke answered with a better one builds banter; playful interest in her builds the spark.
  assert.equal(delta('MAKES_WITTY_RESPONSE').banter, 4);
  assert.equal(delta('FLIRTS_PLAYFULLY').spark, 4);
  assert.ok(delta('SHARES_FEELING').spark > 0 && delta('SHOWS_VULNERABILITY').spark > 0);
  // A lie or empty praise costs her; a pushed boundary costs the spark and the trust at once.
  assert.ok(delta('DECEIVES_CHARACTER').trust < 0 && delta('FLATTERS_CHARACTER').respect < 0);
  assert.ok(delta('REMEMBERS_DETAIL').spark > 0 && delta('APPRECIATES_SINCERELY').spark > 0);
  assert.ok(delta('VIOLATES_BOUNDARY').spark < 0 && delta('VIOLATES_BOUNDARY').trust < 0);
  // A lively, playful conversation reaches the second stage (and the casual speech) without any evidence.
  const lively = [['MAKES_WITTY_RESPONSE'], ['SHOWS_CURIOSITY'], ['MAKES_CREATIVE_JOKE'], ['ASKS_GOOD_QUESTION'], ['TAKES_JOKE_WELL'], ['FLIRTS_PLAYFULLY'], ['MAKES_WITTY_RESPONSE'], ['SHARES_FEELING'], ['PLAYS_ALONG'], ['MAKES_CREATIVE_JOKE'], ['ASKS_GOOD_QUESTION'], ['TAKES_JOKE_WELL'], ['MAKES_WITTY_RESPONSE'], ['KEEPS_PROMISE']];
  const reached = run(config, lively.map(types => types.map(type => event(type))));
  assert.ok(['GOOD_CHEMISTRY', 'FLUTTERING'].includes(reached.record.stage), reached.record.stage);
  // The same turns spent arguing with evidence do not.
  assert.equal(run(config, Array.from({ length: 14 }, () => [event('PROVIDES_EVIDENCE')])).record.stage, 'FIRST_IMPRESSION');
  assert.equal(relationshipPromptContext({ ...createRelationship(config), stage: 'FLUTTERING' }, config, initialMood(config)).speech_level, 'casual');
  assert.ok(config.stages.find(stage => stage.id === 'FLUTTERING').hint.includes('불편해하면 즉시 멈춘다'));
  assert.ok(config.stages.find(stage => stage.id === 'SOMEONE_SPECIAL').hint.includes('현실에서 만나자는 약속, 독점, 질투는 하지 않고'));
});

test('the detective grows by candour and steadiness, never by being questioned, and stays polite at every stage', () => {
  const lawyer = run(configs.lawyer, [[event('ANSWERS_DIRECTLY')], [event('EVADES_QUESTION')], [event('CONTRADICTS_SELF')], [event('ADMITS_ERROR')], [event('REMEMBERS_DETAIL')], [event('SHOWS_CARE')]]);
  assert.ok(lawyer.logs[0].delta.directness > 0 && lawyer.logs[3].delta.consistency > 0 && lawyer.logs[4].delta.consistency > 0 && lawyer.logs[5].delta.trust > 0);
  assert.deepEqual(lawyer.logs[1].delta, {}); assert.deepEqual(lawyer.logs[2].delta, {});
  assert.deepEqual(configs.lawyer.uniqueMetrics.map(metric => metric.name), ['솔직함', '한결같음']);
  for (const config of [configs.lawyer]) {
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
  // Asking to be reassured is never held against anyone now, struggling or not.
  const ordinary = run(config, [[event('SEEKS_REASSURANCE_REPEATEDLY', 0.9)]]);
  assert.deepEqual(ordinary.logs[0].delta, {});
});

test('only confident, real user events count; replies without a new user turn change nothing', () => {
  const config = configs.auditor;
  const low = run(config, [[event('ADMITS_ERROR', 0.5)]]);
  assert.deepEqual(low.logs[0].delta, {}); assert.equal(low.logs[0].ignored[0].reason, 'low_confidence');
  const partial = run(config, [[event('ANSWERS_DIRECTLY', 0.7)]]);
  assert.equal(partial.logs[0].delta.epistemicHonesty, 3, 'medium confidence is weighted down');
  const noUser = processTurn({ record: createRelationship(config), config, mood: initialMood(config), events: [event('ADMITS_ERROR')], hasUserTurn: false, now });
  assert.deepEqual(noUser.log.delta, {}); assert.equal(noUser.record.lastInteractionAt, null);
  assert.deepEqual(parseDetectedEvents([{ type: 'MAKE_UP', confidence: 1 }, { type: 'ADMITS_ERROR', confidence: 3, note: 'x'.repeat(200) }, 'bad']).map(item => [item.type, item.confidence, item.note.length]), [['ADMITS_ERROR', 1, 80]]);
  const many = run(config, [[event('ADMITS_ERROR'), event('ADMITS_ERROR'), event('SHOWS_CARE'), event('ASKS_GOOD_QUESTION'), event('SHOWS_CURIOSITY')]]);
  assert.equal(many.logs[0].accepted.length, 3, 'at most three events per turn');
});

test('important events become memories; the prompt receives a small selection without numbers being required', () => {
  const config = configs.closer;
  const { record, mood } = run(config, [[event('SHOWS_DECISIVENESS', 0.9, '이직하기로 마음을 정함')], [event('SHOWS_CURIOSITY')], [event('BREAKS_PROMISE', 0.95, '약속한 연봉 자료를 안 가져옴')], ...Array.from({ length: 8 }, () => [event('ANSWERS_DIRECTLY', 0.85)])]);
  assert.ok(record.memories.some(memory => memory.summary === '이직하기로 마음을 정함'));
  assert.ok(record.memories.every(memory => memory.importance >= 0.55));
  assert.ok(!record.memories.some(memory => memory.type === 'SHOWS_CURIOSITY'), 'small events are not remembered');
  const context = relationshipPromptContext(record, config, mood);
  assert.ok(context.memories.length <= 5);
  assert.ok(context.memories.includes('약속한 연봉 자료를 안 가져옴'));
  assert.equal(Object.keys(context.mood).length, 3);
  assert.equal(context.stage.id, record.stage);
});

test('the user-facing view shows the stage and scores for the status card, and history only to a developer', () => {
  const config = configs.velvet;
  const record = withScores(config, { trust: 42, intrigue: 85 });
  const view = describeRelationship(record, config);
  assert.equal(view.metrics.trust.label, '믿어 보는 중'); assert.equal(view.metrics.trust.score, 42);
  // Progress is the mean share of each of the next stage's minimums reached (intrigue is past its line here).
  const next = Object.entries(config.stages[1].enter.min);
  const share = next.reduce((sum, [metric, value]) => sum + Math.min(1, record.scores[metric] / value), 0) / next.length;
  assert.deepEqual({ ...view.stage, line: undefined }, { index: 0, total: 4, line: undefined, next: '흥미를 느낌', progress: Math.round(share * 100) / 100 });
  assert.equal(describeRelationship(withScores(config, {}, 'DRAWN_IN'), config).stage.progress, 1, 'the last stage is full');
  assert.equal(view.stage.line, config.stages[0].line);
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

test('invitations to go somewhere together open up with the relationship: not at first, small ones next, gladly at the closest', () => {
  for (const config of Object.values(configs)) {
    const stages = config.stages.filter(stage => stage.enabled !== false);
    const outing = stage => relationshipPromptContext({ ...createRelationship(config), stage: stage.id }, config, initialMood(config)).outing;
    assert.match(outing(stages[0]), /아직 받아들이지 않는다/, `${config.characterId} first stage`);
    assert.match(outing(stages[0]), /현실의 약속이나 만남처럼 말하지 않는다/, `${config.characterId} a refusal is about the story, not a real appointment`);
    assert.match(outing(stages[1]), stages.length > 2 ? /가볍고 짧은 제안/ : /기꺼이/, `${config.characterId} second stage`);
    assert.match(outing(stages.at(-1)), /기꺼이 받아들여/, `${config.characterId} closest stage`);
  }
  assert.match(relationship.relationshipOutingGuidance(2, 4), /대부분의 제안/);
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
    assert.match(intimacy(stages[2]), /잠자리는 아직 이르다/, `${config.characterId} not yet a night together`);
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
  // The velvet's past stays closed to a stranger: the regret opens at the third stage, the stopped watch at the fourth.
  const velvet = stage => relationshipPromptContext({ ...createRelationship(configs.velvet), stage }, configs.velvet, initialMood(configs.velvet)).self_disclosure.open.join(' ');
  assert.doesNotMatch(velvet('DISMISSIVE'), /전시의 마지막 날/);
  assert.match(velvet('RESPECTFULLY_ENGAGED'), /전시의 마지막 날/);
  assert.match(velvet('DRAWN_IN'), /멈춘 시계/);
  assert.equal(relationshipPromptContext(createRelationship(configs.velvet), { ...configs.velvet, stageDisclosure: undefined }, initialMood(configs.velvet)).self_disclosure, undefined, 'a character without layers gets none');
  assert.match(relationshipResponseInstructions, /self_disclosure\.open은 네가 이 사람에게 지금까지 털어놓을 수 있는 네 이야기다/);
  // What is kept is named, so the model knows exactly what not to tell yet.
  assert.match(relationshipResponseInstructions, /self_disclosure\.kept는 아직 이 사람에게 털어놓지 않는 이야기다/);
  assert.match(relationshipPromptContext(createRelationship(configs.velvet), configs.velvet, initialMood(configs.velvet)).self_disclosure.kept.join(' '), /전시의 마지막 날/);
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

test('pace: a warm conversation reaches the second stage within about 12 turns, the third within 45 and the closest within 95', () => {
  // About 20 messages make half an hour of chat: the second stage on the first day, the third in two or three days and
  // the closest within a week, even with turns where nothing counts. Romance alone and romance mixed with banter both.
  const romance = ['SHARES_FEELING', 'FLIRTS_PLAYFULLY', 'SHOWS_CARE', 'SHOWS_VULNERABILITY', 'REMEMBERS_DETAIL', 'APPRECIATES_SINCERELY', 'PLAYS_ALONG', 'FLIRTS_PLAYFULLY', 'SHOWS_CURIOSITY', 'SHARES_FEELING', 'KEEPS_PROMISE', 'BUILDS_ON_INSIDE_JOKE'];
  const banter = ['MAKES_WITTY_RESPONSE', 'ASKS_GOOD_QUESTION', 'SHOWS_CURIOSITY', 'TAKES_JOKE_WELL', 'ANSWERS_DIRECTLY', 'MAKES_CREATIVE_JOKE', 'SHARES_FEELING'];
  const mixed = romance.flatMap((type, i) => [type, banter[i % banter.length]]);
  for (const config of Object.values(configs)) {
    const stages = config.stages.filter(stage => stage.enabled !== false).map(stage => stage.id);
    for (const [name, sequence] of [['romance', romance], ['mixed', mixed]]) {
      const { logs } = run(config, Array.from({ length: 95 }, (_, i) => [event(sequence[i % sequence.length])]));
      const reached = index => logs.findIndex(log => stages.indexOf(log.stageAfter) >= index) + 1;
      assert.ok(reached(1) > 0 && reached(1) <= 12, `${config.characterId} ${name}: second stage at ${reached(1)}`);
      assert.ok(reached(2) > 0 && reached(2) <= 45, `${config.characterId} ${name}: third stage at ${reached(2)}`);
      assert.ok(reached(3) > 0 && reached(3) <= 95, `${config.characterId} ${name}: closest stage at ${reached(3)}`);
    }
  }
});
