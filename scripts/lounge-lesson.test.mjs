import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { loadTs } from './lounge-ts-loader.mjs';
const load = path => loadTs(fileURLToPath(new URL(path, import.meta.url)));
const lesson = load('../src/lib/loungeLesson.ts');
const file = load('../src/lib/loungeLessonFile.ts');
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
  assert.equal(state.stage, 5, 'said unasked on another day: 내 것 (2026-11-27)');
  assert.equal(state.next_review_at, '2026-12-18T03:00:00.000Z');
  state = { ...state, ...lesson.applyLoungeLessonVerdict(state, 'free', day3) };
  assert.equal(state.stage, 5, 'used unasked in free talk');
  assert.equal(state.next_review_at, '2026-12-25T03:00:00.000Z');
  assert.equal(lesson.applyLoungeLessonVerdict(state, 'hinted', day3).stage, 4);
  assert.equal(lesson.applyLoungeLessonVerdict(state, 'given', day3).stage, 2);
  assert.equal(lesson.applyLoungeLessonVerdict(item('b'), 'given', day1).stage, 1);
  assert.equal(lesson.applyLoungeLessonVerdict(item('b'), 'missed', day1).stage, 1, 'skipped or missed: practised all the same, 학습함');
  assert.equal(lesson.loungeLessonDay(new Date('2026-11-25T16:00:00Z')), '2026-11-26', 'days are Korean days');
  assert.equal(lesson.loungeLessonStageLabel(5), '내 것');
  // The board shows three steps (2026-11-27, by the owner): 새 표현 → 학습함 → 내 것.
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(lesson.loungeLessonStageLabel), ['새 표현', '학습함', '학습함', '학습함', '학습함', '내 것']);
  assert.equal(lesson.loungeLessonStatus(item('n')).label, '새 표현');
  assert.equal(lesson.loungeLessonStatus(item('s', { attempts: 2 })).label, '학습함', 'skipped before the fix: stage 0 but practised');
  assert.equal(lesson.loungeLessonStatus(item('m', { stage: 5, attempts: 3 })).label, '내 것');
});

test('a day\'s lesson takes the member\'s new expressions by priority, the tutor\'s after them, then one or two reviews; never one already theirs (2026-11-27)', () => {
  const items = [
    item('due-old', { stage: 3, attempts: 2, next_review_at: '2026-11-20T00:00:00Z' }), item('due-new', { stage: 2, attempts: 1, next_review_at: '2026-11-24T00:00:00Z' }),
    item('later', { stage: 4, attempts: 3, next_review_at: '2026-12-01T00:00:00Z' }), item('tutor-new', { source: 'tutor', pack_id: 'b2-it-depends', importance: 3 }),
    item('mine-new', { created_at: '2026-11-24T00:00:00Z' }), item('kept', { source: 'upgrade' }), item('mine-key', { importance: 3, difficulty: 'C1' }),
    item('skipped', { stage: 0, attempts: 1, next_review_at: '2026-11-26T00:00:00Z' }), item('theirs', { stage: 5, attempts: 4 }),
  ];
  const plan = lesson.planLoungeLesson(items, now);
  assert.deepEqual(plan.queue, ['mine-key', 'mine-new', 'kept', 'tutor-new', 'due-old', 'due-new'], 'the member\'s first even when the tutor\'s is rated higher');
  assert.deepEqual(plan.reviews, ['due-old', 'due-new'], 'two reviews, the one due longest first');
  assert.ok(!plan.queue.includes('theirs') && !plan.queue.includes('skipped'), 'nothing already theirs; a third review waits');
  assert.equal(plan.pack, 0);
  assert.equal(lesson.planLoungeLesson([item('only-new')], now).pack, 5);
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
  assert.match(prompt.level, /^B1 → B2 \(목표 B2 중급/); assert.equal(prompt.feedback.better, "I'm good."); assert.deepEqual(prompt.progress, { done: 0, total: 3 });
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

test('a lesson goes on where it was the same day, starts again the next, keeps the size it started with, and skips or stops', () => {
  const items = [item('a'), item('b')];
  let turn = lesson.advanceLoungeLesson({ items, plan: ['a', 'b'], now, said: 'hello', grade: grade() });
  assert.equal(turn.step, 'ask');
  const opened = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: '', opening: true });
  assert.equal(opened.step, 'ask'); assert.equal(opened.target.id, 'a', 'a call opened the same day asks the same expression');
  const tomorrow = lesson.advanceLoungeLesson({ state: turn.state, items, plan: ['b'], now: new Date('2026-11-26T03:00:00Z'), said: '', opening: true });
  assert.equal(tomorrow.step, 'warmup'); assert.deepEqual(tomorrow.state.queue, ['b'], 'the day\'s plan only (2026-11-26: the day grew from 16 to 21)');
  const added = [...items, item('new')];
  turn = lesson.advanceLoungeLesson({ state: turn.state, items: added, plan: [], now, said: 'pass', grade: grade({ intent: 'skip' }) });
  assert.equal(turn.finished.verdict, 'missed'); assert.equal(turn.target.id, 'b');
  assert.deepEqual(turn.state.queue, [], 'a word added during the day waits for a later day');
  turn = lesson.advanceLoungeLesson({ state: turn.state, items: added, plan: [], now, said: '그만할래요', grade: grade({ intent: 'stop' }) });
  assert.equal(turn.step, 'wrap'); assert.equal(turn.state.phase, 'free');
  assert.deepEqual(turn.state.queue, ['b'], 'what was asked waits for the next time');
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
  assert.equal(lesson.loungeLessonCleanGrade(grade({ intent: 'situation', better: 'I have a call next week.' }), '다음 주에 통화가 있어요').better, '');
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

// A small .xlsx built here (a zip of XML files) the way Excel writes one: shared strings, an inline string, a number.
const crc32 = bytes => { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; };
function zip(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8'), data = deflateRawSync(raw), nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc32(raw), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data); centrals.push(central, nameBytes); offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, directory, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

test('a member\'s word file: an Excel sheet, a CSV in either encoding, or a text file becomes expressions with meaning and situation (2026-11-25)', async () => {
  const shared = '<sst><si><t>영어 표현</t></si><si><t>뜻</t></si><si><t>come up with</t></si><si><r><t>생각해 </t></r><r><t>내다</t></r></si><si><t>Tom &amp; Jerry fight</t></si><si><t>회의에서 아이디어 낼 때</t></si></sst>';
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c><c r="C2" t="s"><v>5</v></c></row>'
    + '<row r="3"><c r="B3" t="inlineStr"><is><t>put off</t></is></c><c r="C3" t="inlineStr"><is><t>미루다</t></is></c></row>'
    + '<row r="4"><c r="A4" t="s"><v>4</v></c><c r="B4"><v>42</v></c></row><row r="5"/></sheetData></worksheet>';
  const rows = await file.readLoungeXlsxRows(zip({ '[Content_Types].xml': '<Types/>', 'xl/sharedStrings.xml': shared, 'xl/worksheets/sheet1.xml': sheet }));
  assert.deepEqual(rows[1], ['come up with', '생각해 내다', '회의에서 아이디어 낼 때']);
  assert.deepEqual(rows[2], ['', 'put off', '미루다'], 'cells keep their column');
  assert.deepEqual(lesson.parseLoungeLessonRows(rows), [
    { expression: 'come up with', meaning: '생각해 내다', situation: '회의에서 아이디어 낼 때' },
    { expression: 'put off', meaning: '미루다', situation: '' },
    { expression: 'Tom & Jerry fight', meaning: '42', situation: '' },
  ]);
  assert.deepEqual(lesson.parseLoungeLessonRows([['뜻', 'Expression'], ['알아내다', 'figure out'], ['1. take into account', '고려하다'], ['figure out', '중복']]), [
    { expression: 'figure out', meaning: '알아내다', situation: '' }, { expression: 'take into account', meaning: '고려하다', situation: '' }], 'the English column wins, numbering goes, once each');
  assert.deepEqual(lesson.parseLoungeLessonCsv('expression,meaning\r\n"I see, but …",무슨 말인지는 알지만\r\n"say ""no""",거절\n'), [['expression', 'meaning'], ['I see, but …', '무슨 말인지는 알지만'], ['say "no"', '거절']]);
  assert.deepEqual(lesson.parseLoungeLessonText('﻿come up with - 생각해 내다\nput off: 미루다\n그냥 한국어\n'), [
    { expression: 'come up with', meaning: '생각해 내다', situation: '' }, { expression: 'put off', meaning: '미루다', situation: '' }]);
  assert.deepEqual(lesson.parseLoungeLessonText('figure out\t알아내다\t문제 원인 찾을 때'), [{ expression: 'figure out', meaning: '알아내다', situation: '문제 원인 찾을 때' }]);
  await assert.rejects(file.readLoungeLessonFile({ name: 'old.xls', size: 10, arrayBuffer: async () => new ArrayBuffer(10) }), /\.xls/);
  await assert.rejects(file.readLoungeLessonFile({ name: 'big.xlsx', size: 3 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(1) }), /2MB/);
  const read = await file.readLoungeLessonFile({ name: 'words.csv', size: 40, arrayBuffer: async () => new TextEncoder().encode('look into,알아보다\n').buffer });
  assert.deepEqual(read, [{ expression: 'look into', meaning: '알아보다', situation: '' }]);
});

test('the member\'s own situation: its expressions are read defensively and taken first, with the situation and example for the tutor', () => {
  const have = [item('h', { expression: 'push back the deadline' })];
  const made = lesson.readLoungeLessonSituation({ title: '납기 연기 요청', expressions: [
    { expression: "I was wondering if we could …", meaning: '…할 수 있을까 해서요', situation: '회의 시작하고 본론을 꺼낼 때', example: 'I was wondering if we could move the delivery date.' },
    { expression: 'Push back the deadline', meaning: '마감을 미루다', situation: '', example: '' },
    { expression: '납기', meaning: '', situation: '', example: '' },
    { expression: 'I appreciate your flexibility', meaning: '유연하게 해 주셔서 감사해요', situation: '마무리할 때', example: 'I really appreciate your flexibility.' },
  ] }, have);
  assert.equal(made.title, '납기 연기 요청');
  assert.deepEqual(made.expressions.map(entry => entry.expression), ["I was wondering if we could …", 'I appreciate your flexibility'], 'none the member has, English only');
  const items = [item('a'), item('b'), item('s1', { source: 'situation', situation: '회의 시작하고 본론을 꺼낼 때', example: 'I was wondering if we could move the delivery date.', created_at: '2026-11-25T03:00:05Z' })];
  let turn = lesson.advanceLoungeLesson({ items: items.slice(0, 2), plan: ['a', 'b'], now, said: 'hi', grade: grade() });
  assert.equal(turn.target.id, 'a');
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: '다음 주 거래처 회의에서 납기를 미뤄 달라고 해야 해요', grade: grade({ intent: 'situation' }) });
  assert.equal(turn.step, 'ask'); assert.equal(turn.target.id, 's1', 'the member\'s situation first');
  assert.deepEqual(turn.state.queue, ['a', 'b'], 'what was asked waits after it');
  const prompt = lesson.loungeLessonForPrompt(turn, 'B1');
  assert.equal(prompt.target.yours, true); assert.equal(prompt.target.situation, '회의 시작하고 본론을 꺼낼 때');
  assert.equal(prompt.target.example, undefined, 'the example says the expression: only when it is given');
  assert.equal(lesson.loungeLessonForPrompt({ ...turn, step: 'give' }, 'B1').target.example, 'I was wondering if we could move the delivery date.');
  const none = lesson.advanceLoungeLesson({ state: lesson.advanceLoungeLesson({ items: items.slice(0, 2), plan: ['a', 'b'], now, said: 'hi', grade: grade() }).state, items: items.slice(0, 2), plan: [], now, said: '내 상황', grade: grade({ intent: 'situation' }) });
  assert.equal(none.step, 'answer', 'no expressions were made: the situation is answered and the task waits');
  assert.equal(lesson.planLoungeLesson([item('m'), item('s', { source: 'situation' }), item('t', { source: 'tutor' })], now).queue[0], 's');
  assert.match(lesson.loungeLessonSituationInstructions, /known/); assert.match(lesson.loungeLessonRules, /target\.yours/);
});

test('the learning board: marked expressions are taken first, the more important first, and join the day when marked during it (2026-11-26)', () => {
  const items = [
    item('a', { importance: 1 }), item('b', { importance: 3 }), item('c', { focus: true, importance: 2 }),
    item('d', { focus: true, importance: 3, stage: 2, next_review_at: '2026-12-10T00:00:00Z', source: 'tutor' }), item('e', { focus: true, stage: 5 }),
  ];
  const plan = lesson.planLoungeLesson(items, now);
  assert.deepEqual(plan.queue.slice(0, 2), ['d', 'c'], 'marked first, the more important first, whatever their stage');
  assert.ok(!plan.queue.includes('e'), 'one already theirs is not asked for a mark');
  assert.deepEqual(plan.queue.slice(2), ['b', 'a'], 'then new ones, the more important first');
  // Marked during the day: it comes next, after the one being asked.
  let turn = lesson.advanceLoungeLesson({ items: [item('x'), item('y'), item('z')], plan: ['x', 'y', 'z'], now, said: 'hi', grade: grade() });
  assert.equal(turn.target.id, 'x');
  turn = lesson.advanceLoungeLesson({ state: turn.state, items: [item('x'), item('y'), item('z', { focus: true })], plan: [], now, said: 'hmm', grade: grade({ intent: 'question' }) });
  assert.equal(turn.state.current.id, 'x', 'the one being asked stays');
  assert.deepEqual(turn.state.queue, ['z', 'y']);
});

test('the task card shows only what the tutor may say, and the feedback hides a correction that gives the expression away', () => {
  const items = [item('a', { expression: 'figure out', meaning: '알아내다', situation: '문제 원인을 찾을 때', importance: 3, difficulty: 'B2', focus: true }), item('b')];
  let turn = lesson.advanceLoungeLesson({ items, plan: ['a', 'b'], now, said: 'hi', grade: grade() });
  let task = lesson.loungeLessonTask(turn.state, items, now);
  assert.equal(task.phase, 'drill'); assert.deepEqual(task.progress, { done: 0, total: 2 });
  assert.equal(task.item.situation, '문제 원인을 찾을 때'); assert.equal(task.item.importance, 3); assert.equal(task.item.difficulty, 'B2'); assert.equal(task.item.focus, true);
  assert.equal(task.item.expression, undefined); assert.equal(task.item.first, undefined, 'nothing of the English before a hint');
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'I tried to find', grade: grade() });
  turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'I search it', grade: grade() });
  task = lesson.loungeLessonTask(turn.state, items, now);
  assert.equal(task.item.first, 'figure', 'the second hint: the first word');
  assert.equal(lesson.loungeLessonTask(turn.state, items, new Date('2026-11-26T03:00:00Z')), undefined, 'another day has no card until the lesson starts it');
  const shown = lesson.loungeLessonFeedback({ step: 'hint', target: items[0] }, grade({ better: 'I need to figure out why.', polished: 'I need to work out why.', errors: [{ wrong: 'search it', right: 'figure it out', why: '알아내다' }, { wrong: 'I tried', right: 'I was trying', why: '진행' }] }));
  assert.equal(shown.better, ''); assert.deepEqual(shown.errors.map(error => error.right), ['I was trying'], 'nothing that says the expression while it is asked');
  assert.equal(lesson.loungeLessonFeedback({ step: 'next', target: items[1] }, grade({ better: 'I need to figure out why.', polished: 'I need to pin down why.' })).polished, 'I need to pin down why.');
  assert.deepEqual(lesson.loungeLessonFeedbackLabels('B1'), { better: 'B2 표현', polished: 'C1 · 더 세련되게' });
  assert.equal(lesson.loungeLessonFeedbackLabels('B2').better, 'C1 표현');
});

test('importance, difficulty and a situation are read defensively: only the items asked, no situation that says the expression', () => {
  const items = [item('a', { expression: 'put off', situation: '' }), item('b', { expression: 'come up with', situation: '회의에서' }), item('c', { expression: 'look into', level: 'C1' })];
  const read = lesson.readLoungeLessonEnrich({ items: [
    { id: 'a', importance: 3, difficulty: 'B1', situation: '귀찮은 일을 자꾸 미룰 때' },
    { id: 'b', importance: 2, difficulty: 'B2', situation: '새 상황' },
    { id: 'c', importance: 9, difficulty: 'Z9', situation: 'when you look into it' },
    { id: 'nope', importance: 1, difficulty: 'A2', situation: 'x' }, { id: 'a', importance: 1, difficulty: 'A2', situation: 'twice' },
  ] }, items);
  assert.deepEqual(read, [
    { id: 'a', importance: 3, difficulty: 'B1', situation: '귀찮은 일을 자꾸 미룰 때' },
    { id: 'b', importance: 2, difficulty: 'B2' },
    { id: 'c', importance: 2, difficulty: 'C1' },
  ]);
  assert.equal(lesson.loungeLessonEnrichInput('B1', items).level.target, 'B2');
  assert.equal(lesson.loungeLessonEnrichInput('B1', items).items[1].has_situation, true);
});

test('the day keeps its size: marked first, then the more important and the easier; an old day that grew is cut back; hint and question words are not corrected (2026-11-26)', () => {
  const items = [
    item('easy', { importance: 2, difficulty: 'B1' }), item('hard', { importance: 2, difficulty: 'C1' }), item('key', { importance: 3, difficulty: 'C1' }),
    item('mark', { focus: true, importance: 1, difficulty: 'C1' }), ...Array.from({ length: 12 }, (_, at) => item(`w${at}`, { importance: 1 })),
  ];
  const plan = lesson.planLoungeLesson(items, now);
  assert.deepEqual(plan.queue.slice(0, 4), ['mark', 'key', 'easy', 'hard'], 'marked, then importance, then the easier level');
  assert.equal(plan.queue.length, 6);
  let turn = lesson.advanceLoungeLesson({ items, plan: plan.queue, now, said: 'hi', grade: grade() });
  const total = turn.state.queue.length + 1;
  for (let at = 0; at < 3; at++) turn = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'x', grade: grade({ intent: 'skip' }) });
  assert.equal(turn.state.done.length + turn.state.queue.length + (turn.state.current ? 1 : 0), total, 'nothing joins: the total stays');
  // A day planned before the fix had taken in every new expression: it is cut back to six, the marked one kept.
  const old = { kind: 'lesson', day: lesson.loungeLessonDay(now), phase: 'drill', queue: items.slice(1).map(entry => entry.id), done: [{ id: 'easy', verdict: 'missed' }], current: { id: 'w0', hints: 0, tries: 0 }, kept: 0, turns: 5 };
  const cut = lesson.advanceLoungeLesson({ state: old, items, plan: [], now, said: 'hmm', grade: grade({ intent: 'question' }) });
  assert.equal(cut.state.queue[0], 'mark'); assert.ok(cut.state.queue.length <= 5, String(cut.state.queue.length)); assert.ok(cut.state.since);
  const hint = lesson.loungeLessonCleanGrade(grade({ intent: 'meaning', better: 'Could you give me a hint?', polished: 'Would you mind giving me a hint?', keep: 'give me a hint' }), '힌트 주세요');
  assert.equal(hint.better, ''); assert.equal(hint.polished, ''); assert.equal(hint.keep, '');
  assert.equal(lesson.loungeLessonCleanGrade(grade({ intent: 'question', better: 'What does it mean?' }), '이게 무슨 뜻이에요?').better, '');
  assert.equal(lesson.loungeLessonCleanGrade(grade({ intent: 'answer', better: 'I put it off.' }), 'I put off it.').better, 'I put it off.');
  assert.match(lesson.loungeLessonRules, /질문 문장 자체는 고치거나/);
  assert.equal(lesson.loungeLessonHintText, '힌트 주세요');
});

test('the learning list by day: the Korean day it was put in, practised or not, priority from importance and the level in words (2026-11-26)', () => {
  assert.equal(lesson.loungeLessonDayOf('2026-11-25T16:30:00Z'), '2026-11-26', 'after midnight in Korea');
  assert.equal(lesson.loungeLessonDayOf(null), '');
  assert.equal(lesson.loungeLessonStudied(item('a')), false);
  assert.equal(lesson.loungeLessonStudied(item('b', { attempts: 1 })), true);
  assert.deepEqual([3, 2, 1, null].map(value => lesson.loungeLessonPriority(value).label), ['1순위', '2순위', '3순위', '2순위']);
  assert.equal(lesson.loungeLessonLevelLabel('B1'), 'B1 · 쉬움'); assert.equal(lesson.loungeLessonLevelLabel('C1'), 'C1 · 어려움'); assert.equal(lesson.loungeLessonLevelLabel(null), '');
  const sorted = [item('low', { importance: 1, difficulty: 'B1' }), item('hard', { importance: 3, difficulty: 'C1' }), item('easy', { importance: 3, difficulty: 'B1' }), item('mark', { focus: true, importance: 1 }), item('mine', { stage: 5, importance: 3 })]
    .sort(lesson.loungeLessonListOrder).map(entry => entry.id);
  assert.deepEqual(sorted, ['mark', 'easy', 'hard', 'low', 'mine']);
});

test('the session goal: three levels, the member purpose and topics, and each tutor own way when none is chosen (2026-11-26)', () => {
  assert.deepEqual(lesson.loungeLessonLevels.map(level => [level.id, level.label, level.target]), [['A2', 'B1 초급', 'B1'], ['B1', 'B2 중급', 'B2'], ['B2', 'C1 상급', 'C1']]);
  assert.equal(lesson.readLoungeLessonLevel('A2'), 'A2'); assert.equal(lesson.readLoungeLessonLevel('x'), 'B1');
  assert.deepEqual(lesson.loungeLessonFeedbackLabels('A2'), { better: 'B1 표현', polished: 'B2 · 더 자연스럽게' });
  assert.ok(lesson.loungeLessonPackFor('A2', [], 3).every(entry => entry.level === 'B2'), 'a B1 goal takes the B2 list');
  assert.deepEqual(lesson.readLoungeLessonProfile({ level: 'A2', purpose: '  업무·회의 ', topics: ['여행', '여행', ' K-pop ', 3] }), { level: 'A2', purpose: '업무·회의', topics: ['여행', 'K-pop'] });
  assert.deepEqual(lesson.readLoungeLessonProfile(undefined), { level: 'B1', purpose: '', topics: [] });
  const turn = lesson.advanceLoungeLesson({ items: [item('a')], plan: ['a'], now, said: 'hi', grade: grade() });
  const formal = lesson.loungeLessonForPrompt(turn, 'B2', undefined, 'interpretertutor');
  assert.match(formal.session.tutor_style, /회의, 협상, 발표/); assert.equal(formal.session.topics, undefined);
  const daily = lesson.loungeLessonForPrompt(turn, 'A2', undefined, 'teachertutor', { purpose: '여행', topics: ['여행', '음식'] });
  assert.match(daily.session.tutor_style, /생각과 느낌/); assert.deepEqual(daily.session.topics, ['여행', '음식']); assert.equal(daily.session.purpose, '여행');
  assert.match(daily.level, /^A2 → B1 \(목표 B1 초급/);
  assert.match(lesson.loungeLessonRules, /session\.purpose와 topics/);
  assert.equal(characters.getLoungeCharacter('interpretertutor').job, '국제회의 동시통역사');
  assert.match(lounge.getLoungeHost('interpretertutor').companion, /동시통역사/);
});

test("a day planned the older way (reviews first) is planned again for what is left of it, without what was done (2026-11-27)", () => {
  const items = [item('done1'), item('rev', { stage: 2, attempts: 1, next_review_at: '2026-11-20T00:00:00Z' }), item('key', { importance: 3 }), item('low', { importance: 1 }), item('cur')];
  const old = { kind: 'lesson', day: lesson.loungeLessonDay(now), phase: 'drill', queue: ['rev', 'low'], done: [{ id: 'done1', verdict: 'missed' }], current: { id: 'cur', hints: 0, tries: 0 }, kept: 0, turns: 4, since: now.toISOString() };
  const plan = lesson.planLoungeLesson(items, now);
  const turn = lesson.advanceLoungeLesson({ state: old, items, plan: plan.queue, now, said: 'hmm', grade: grade({ intent: 'question' }) });
  assert.equal(turn.state.order, lesson.loungeLessonPlanOrder);
  assert.deepEqual(turn.state.queue, ['key', 'low', 'rev'], 'the new ones by priority, the review last; neither the done one nor the one being asked');
  assert.equal(turn.state.current.id, 'cur');
  const again = lesson.advanceLoungeLesson({ state: turn.state, items, plan: [], now, said: 'ok', grade: grade({ intent: 'question' }) });
  assert.deepEqual(again.state.queue, turn.state.queue, 'planned once');
  assert.equal(lesson.readLoungeLessonState(turn.state).order, lesson.loungeLessonPlanOrder);
});
