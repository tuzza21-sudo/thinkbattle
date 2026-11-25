import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
const load = path => loadTs(fileURLToPath(new URL(path, import.meta.url)));
const lesson = load('../src/lib/loungeLesson.ts');
const lounge = load('../src/lib/lounge.ts');
const characters = load('../src/lib/loungeCharacters.ts');
const relationship = load('../src/lib/relationship/index.ts');

const now = new Date('2026-11-25T03:00:00Z'); // 12:00 in Korea
const item = (id, extra = {}) => ({ id, expression: `expression ${id}`, meaning: '뜻', level: 'B2', source: 'mine', stage: 0, days: [], free_used: false, next_review_at: null, attempts: 0, created_at: '2026-11-20T00:00:00Z', ...extra });
const grade = (extra = {}) => ({ target: 'not_used', intent: 'answer', free_used: [], errors: [], better: '', polished: '', keep: '', keep_meaning: '', ...extra });

test('the tutors are characters of their own, with the story character\'s face and voice, no relationship and a bilingual voice (2026-11-25)', () => {
  for (const [id, base] of [['teachertutor', 'teacher'], ['interpretertutor', 'interpreter']]) {
    assert.ok(lesson.isLoungeTutor(id));
    assert.equal(lesson.loungeTutorOf(base), id);
    const host = lounge.getLoungeHost(id);
    assert.equal(host.id, id, 'found, not the first house host');
    assert.equal(host.portrait, lounge.getLoungeHost(base).portrait);
    assert.equal(host.bilingual, true);
    assert.equal(characters.getLoungeCharacter(id).name, characters.getLoungeCharacter(base).name);
    assert.match(characters.getLoungeCharacter(id).bible.invariants.join(' '), /플러팅/);
    assert.equal(relationship.getRelationshipConfig(id), undefined, 'a lesson moves no relationship');
    assert.equal(lounge.loungeEngineVoice('eleven', id), lounge.loungeEngineVoice('eleven', base));
    assert.equal(lounge.loungeGeminiSpeech[id]?.voiceName, lounge.loungeGeminiSpeech[base]?.voiceName);
    assert.ok(!lounge.loungeHosts.some(entry => entry.id === id), 'not in the lists of characters');
    assert.ok(lesson.loungeLessonScenarioIds.includes(`${id}-lesson`));
    assert.equal(lounge.loungeElevenSpeechRequest('Hello. 안녕하세요.', undefined, id).language_code, undefined);
    assert.equal(lounge.loungeElevenSpeechRequest('안녕하세요.', undefined, base).language_code, 'ko');
    assert.match(lounge.loungeGeminiSpeechRequest(id, 'Hi').contents[0].parts[0].text, /English sentences/);
  }
  assert.equal(lesson.isLoungeTutor('teacher'), false);
  assert.equal(lesson.isLoungeTutor('constructor'), false);
});

test('an expression is the member\'s only when it comes out unasked on another day, and slips back when it needs help again', () => {
  const day1 = new Date('2026-11-25T03:00:00Z'), day2 = new Date('2026-11-27T03:00:00Z'), day3 = new Date('2026-12-04T03:00:00Z');
  let state = item('a');
  state = { ...state, ...lesson.applyLoungeLessonVerdict(state, 'hinted', day1) };
  assert.equal(state.stage, 2);
  assert.equal(state.next_review_at, '2026-11-26T03:00:00.000Z');
  state = { ...state, ...lesson.applyLoungeLessonVerdict(state, 'unprompted', day1) };
  assert.equal(state.stage, 3, 'said unprompted');
  state = { ...state, ...lesson.applyLoungeLessonVerdict(state, 'unprompted', day1) };
  assert.equal(state.stage, 3, 'the same day again is not another day');
  assert.equal(state.next_review_at, '2026-11-28T03:00:00.000Z');
  state = { ...state, ...lesson.applyLoungeLessonVerdict(state, 'unprompted', day2) };
  assert.equal(state.stage, 4, 'another day');
  state = { ...state, ...lesson.applyLoungeLessonVerdict(state, 'free', day3) };
  assert.equal(state.stage, 5, 'used unasked in free talk');
  assert.equal(state.next_review_at, '2026-12-25T03:00:00.000Z');
  assert.equal(lesson.applyLoungeLessonVerdict(state, 'hinted', day3).stage, 4);
  assert.equal(lesson.applyLoungeLessonVerdict(state, 'given', day3).stage, 2);
  assert.equal(lesson.applyLoungeLessonVerdict(item('b'), 'given', day1).stage, 1);
  assert.equal(lesson.applyLoungeLessonVerdict(item('b'), 'missed', day1).stage, 0);
  assert.equal(lesson.loungeLessonDay(new Date('2026-11-25T16:00:00Z')), '2026-11-26', 'days are Korean days');
  assert.equal(lesson.loungeLessonStageLabel(5), '내 것');
});

test('a day\'s lesson takes reviews first, then the member\'s own new expressions, then the tutor\'s of the member\'s level', () => {
  const items = [
    item('due-old', { stage: 3, next_review_at: '2026-11-20T00:00:00Z' }), item('due-new', { stage: 2, next_review_at: '2026-11-24T00:00:00Z' }),
    item('later', { stage: 4, next_review_at: '2026-12-01T00:00:00Z' }), item('tutor-new', { source: 'tutor', pack_id: 'b2-it-depends' }),
    item('mine-new', { created_at: '2026-11-24T00:00:00Z' }), item('kept', { source: 'upgrade' }),
  ];
  const plan = lesson.planLoungeLesson(items, now);
  assert.deepEqual(plan.queue, ['due-old', 'due-new', 'mine-new', 'kept', 'tutor-new']);
  assert.equal(plan.pack, 1);
  const pack = lesson.loungeLessonPackFor('B1', items, 3);
  assert.equal(pack.length, 3);
  assert.ok(pack.every(entry => entry.level === 'B2' && entry.id !== 'b2-it-depends'));
  assert.ok(lesson.loungeLessonPackFor('B2', [], 50).every(entry => entry.level === 'C1'));
  assert.ok(lesson.loungeLessonPack.filter(entry => entry.level === 'B2').length >= 30);
  assert.equal(new Set(lesson.loungeLessonPack.map(entry => entry.id)).size, lesson.loungeLessonPack.length);
  for (const entry of lesson.loungeLessonPack) {
    assert.ok(entry.situation.length >= 20, entry.id);
    const words = entry.expression.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(word => word.length > 4);
    assert.ok(!words.some(word => entry.situation.toLowerCase().includes(word)), `${entry.id}: the situation does not give the words away`);
  }
});

test('a lesson turn: asked, the expression said unprompted moves on; a miss gets the meaning, then the first word, then the answer', () => {
  const items = [item('a'), item('b'), item('c')];
  let turn = lesson.advanceLoungeLesson({ items, plan: ['a', 'b', 'c'], now, said: '', opening: true });
  assert.equal(turn.step, 'warmup');
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'I am fine. I go to work.', grade: grade({ better: "I'm good. I went to work." }) });
  assert.equal(turn.step, 'ask'); assert.equal(turn.target.id, 'a');
  const prompt = lesson.loungeLessonForPrompt(turn, 'B1', grade({ better: "I'm good." }));
  assert.equal(prompt.target.expression, undefined, 'asked, the English is not given'); assert.equal(prompt.target.expression_do_not_say, undefined); assert.equal(prompt.target.meaning, '뜻');
  assert.equal(lesson.loungeLessonForPrompt({ ...turn, target: { ...turn.target, meaning: '' } }, 'B1').target.expression_do_not_say, 'expression a', 'with no meaning or situation, it comes marked');
  assert.equal(lesson.loungeLessonForPrompt({ ...turn, step: 'fix' }, 'B1').target.expression, 'expression a');
  assert.equal(prompt.level, 'B1 → B2'); assert.equal(prompt.feedback.better, "I'm good."); assert.deepEqual(prompt.progress, { done: 0, total: 3 });
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'expression a', grade: grade({ target: 'correct' }) });
  assert.equal(turn.step, 'next'); assert.equal(turn.target.id, 'b');
  assert.deepEqual(turn.verdicts.map(entry => [entry.item.id, entry.verdict]), [['a', 'unprompted']]);
  assert.equal(turn.finished.verdict, 'unprompted');
  const steps = [];
  for (let index = 0; index < 3; index++) {
    turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'something else', grade: grade() });
    steps.push([turn.step, turn.state.current.hints]);
  }
  assert.deepEqual(steps, [['hint', 1], ['hint', 2], ['give', 3]]);
  // A hint gives only its level: the meaning, then the first word, then all of it.
  const hinted = state => lesson.loungeLessonForPrompt({ state, step: 'hint', target: item('b', { expression: 'put off' }), verdicts: [] }, 'B1').target;
  assert.deepEqual(hinted({ ...turn.state, current: { id: 'b', hints: 1, tries: 1 } }), { expression_do_not_say: 'put off', meaning: '뜻', hint_level: 1 });
  assert.deepEqual(hinted({ ...turn.state, current: { id: 'b', hints: 2, tries: 2 } }), { first_words: 'put', meaning: '뜻', hint_level: 2 });
  assert.equal(lesson.loungeLessonFirstWords("I see where you're coming from, but …"), 'I see');
  assert.equal(lesson.loungeLessonFirstWords('It depends on …'), 'It depends');
  assert.equal(lesson.loungeLessonFirstWords('come up with (an idea)'), 'come');
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'expression b', grade: grade({ target: 'correct' }) });
  assert.equal(turn.finished.verdict, 'given'); assert.equal(turn.step, 'next'); assert.equal(turn.target.id, 'c');
  // A question waits the task; a hint then the expression: practised once more, then on.
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'What does it mean?', grade: grade({ intent: 'question' }) });
  assert.equal(turn.step, 'answer'); assert.equal(turn.state.current.hints, 0);
  // "I can't remember the word": a hint asked for, so what comes after it is not unprompted.
  const asked = lesson.advanceLoungeLesson({ state: structuredClone(turn.state), items, plan: [], now, said: '단어가 생각 안 나요', grade: grade({ intent: 'meaning' }) });
  assert.equal(asked.step, 'hint'); assert.equal(asked.state.current.hints, 1);
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'wrong', grade: grade({ target: 'wrong_form' }) });
  assert.equal(turn.step, 'fix');
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'expression c', grade: grade({ target: 'correct', free_used: ['a'] }) });
  assert.equal(turn.step, 'retell'); assert.equal(turn.finished.verdict, 'hinted');
  assert.deepEqual(turn.verdicts.map(entry => [entry.item.id, entry.verdict]), [['a', 'free'], ['c', 'hinted']]);
  assert.deepEqual(lesson.loungeLessonForPrompt(turn, 'B1').used_on_their_own, ['expression a']);
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'expression c again', grade: grade({ target: 'correct' }) });
  assert.equal(turn.step, 'free'); assert.equal(turn.verdicts.length, 0, 'the retell is practice, not another verdict');
  assert.equal(turn.state.done.length, 3);
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: "Let's stop here", grade: grade({ intent: 'stop' }) });
  assert.equal(turn.step, 'wrap');
});

test('a lesson goes on where it was the same day, starts again the next, takes the member\'s new words at once, and skips or stops', () => {
  const items = [item('a'), item('b')];
  let turn = lesson.advanceLoungeLesson({ items, plan: ['a', 'b'], now, said: 'hello', grade: grade() });
  assert.equal(turn.step, 'ask');
  const opened = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: '', opening: true });
  assert.equal(opened.step, 'ask'); assert.equal(opened.target.id, 'a', 'a call opened the same day asks the same expression');
  const tomorrow = lesson.advanceLoungeLesson({ state: turn.state, items, plan: ['b'], now: new Date('2026-11-26T03:00:00Z'), said: '', opening: true });
  assert.equal(tomorrow.step, 'warmup'); assert.deepEqual(tomorrow.state.queue, ['b', 'a'], 'the day\'s plan, and the member\'s own new expression not tried yet');
  const added = [...items, item('new')];
  turn = lesson.advanceLoungeLesson({ state: turn.state, items: added, plan: [], now, said: 'pass', grade: grade({ intent: 'skip' }) });
  assert.equal(turn.finished.verdict, 'missed'); assert.equal(turn.target.id, 'b');
  assert.deepEqual(turn.state.queue, ['new'], 'the word added in the 단어장 joins today');
  turn = lesson.advanceLoungeLesson({ state: turn.state, items: added, plan: [], now, said: '그만할래요', grade: grade({ intent: 'stop' }) });
  assert.equal(turn.step, 'wrap'); assert.equal(turn.state.phase, 'free');
  assert.deepEqual(turn.state.queue, ['b', 'new'], 'what was asked waits for the next time');
  assert.deepEqual(lesson.readLoungeLessonState(JSON.parse(JSON.stringify(turn.state))), turn.state);
  assert.equal(lesson.readLoungeLessonState({ phase: 'tarot' }), undefined);
  const failed = lesson.advanceLoungeLesson({ state: turn.state, items: added, plan: [], now, said: 'hi' });
  assert.equal(failed.step, 'ask', 'no grade (the grader failed): the task is asked again');
});

test('the grader\'s answer is read defensively, a kept correction is new and three a day, and pasted words are split', () => {
  const read = lesson.readLoungeLessonGrade({ target: 'maybe', intent: 'dance', free_used: ['a', 3], errors: [{ wrong: 'very agree', right: 'completely agree', why: 'very는 동사를 꾸미지 못해요' }, { wrong: '', right: 'x', why: '' }], better: ' I  completely agree. ', polished: '', keep: 'agree', keep_meaning: '동의' });
  assert.equal(read.target, 'not_used'); assert.equal(read.intent, 'answer'); assert.deepEqual(read.free_used, ['a']);
  assert.equal(read.errors.length, 1); assert.equal(read.better, 'I completely agree.'); assert.equal(read.keep, '', 'one word is not kept');
  assert.equal(lesson.readLoungeLessonGrade(null), undefined);
  assert.equal(lesson.loungeLessonCleanGrade(grade({ better: 'I see what you mean, but I still think so.', polished: 'x', keep: 'y z' }), 'I see what you mean but I still think so').better, '', 'a correction that only repeats is none');
  assert.equal(lesson.loungeLessonCleanGrade(grade({ better: 'I went home.' }), 'I go home').better, 'I went home.');
  const state = { kind: 'lesson', day: '2026-11-25', phase: 'drill', queue: [], done: [], kept: 0, turns: 1 };
  assert.deepEqual(lesson.loungeLessonKeep(state, grade({ keep: "I'm not entirely sure", keep_meaning: '확실하진 않지만' }), []), { expression: "I'm not entirely sure", meaning: '확실하진 않지만' });
  assert.equal(lesson.loungeLessonKeep(state, grade({ keep: "I'm  not entirely SURE" }), [item('x', { expression: "i'm not entirely sure" })]), undefined);
  assert.equal(lesson.loungeLessonKeep({ ...state, kept: 3 }, grade({ keep: 'come up with' }), []), undefined);
  assert.deepEqual(lesson.parseLoungeLessonWords('come up with - 생각해 내다\nfigure out: 알아내다\n\nput off\t미루다\n생각해 내다\ncome up with'), [
    { expression: 'come up with', meaning: '생각해 내다' }, { expression: 'figure out', meaning: '알아내다' }, { expression: 'put off', meaning: '미루다' }]);
  const input = lesson.loungeLessonGradeInput({ level: 'B1', target: item('a'), others: [item('a'), item('b')], asked: '상황', said: 'I very agree' });
  assert.deepEqual(input.level, { from: 'B1', target: 'B2' }); assert.deepEqual(input.others.map(other => other.id), ['b']);
  assert.equal(lesson.loungeLessonCore("I see where you're coming from, but …"), "i see where you're");
  assert.equal(lesson.loungeLessonCore('come up with (an idea)'), 'come up with');
  // While the expression is still to be recalled, a correction that says it is not passed to the tutor.
  const asking = { state: { kind: 'lesson', day: '2026-11-25', phase: 'drill', queue: [], done: [], current: { id: 'a', hints: 1, tries: 1 }, kept: 0, turns: 2 }, step: 'hint', target: item('a', { expression: "I see where you're coming from, but …" }), verdicts: [] };
  const giveaway = grade({ better: "I see where you’re coming from, but we need time.", polished: 'I take your point.', errors: [{ wrong: 'I understand', right: "I see where you're coming from", why: '' }, { wrong: 'more time', right: 'a bit more time', why: '' }] });
  assert.deepEqual(lesson.loungeLessonForPrompt(asking, 'B1', giveaway).feedback, { errors: [{ wrong: 'more time', right: 'a bit more time', why: '' }], better: '' });
  assert.equal(lesson.loungeLessonForPrompt({ ...asking, step: 'give' }, 'B1', giveaway).feedback.better, giveaway.better, 'given, it may be said');
  assert.match(lesson.loungeLessonRules, /플러팅/); assert.match(lesson.loungeLessonRules, /별표/); assert.match(lesson.loungeLessonRules, /give에서 처음으로 전부 말한다/);
});
