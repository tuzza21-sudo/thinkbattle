import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
const load = path => loadTs(fileURLToPath(new URL(path, import.meta.url)));
const training = load('../src/lib/loungeTraining.ts');
const lesson = load('../src/lib/loungeLesson.ts');
const lounge = load('../src/lib/lounge.ts');
const characters = load('../src/lib/loungeCharacters.ts');
const relationship = load('../src/lib/relationship/index.ts');

const half = () => 0.5;
const ngrade = (extra = {}) => ({ intent: 'negotiate', offer: null, tactics: [], caved: false, asked_interest: false, ...extra });

test('the trainers are characters of their own, with the story character\'s face and voice and no relationship (2026-11-26)', () => {
  for (const [id, base] of [['closercoach', 'closer'], ['trickstercoach', 'trickster']]) {
    assert.ok(training.isLoungeTrainer(id)); assert.equal(training.loungeTrainerOf(base), id);
    const host = lounge.getLoungeHost(id);
    assert.equal(host.id, id); assert.equal(host.portrait, lounge.getLoungeHost(base).portrait);
    assert.equal(characters.getLoungeCharacter(id).name, characters.getLoungeCharacter(base).name);
    assert.match(characters.getLoungeCharacter(id).bible.invariants.join(' '), /플러팅/);
    assert.equal(relationship.getRelationshipConfig(id), undefined);
    assert.equal(lounge.loungeEngineVoice('eleven', id), lounge.loungeEngineVoice('eleven', base));
    assert.ok(!lounge.loungeHosts.some(entry => entry.id === id));
    assert.ok(training.loungeTrainingScenarioIds.includes(`${id}-training`));
  }
  assert.equal(training.loungeTrainingKindOf('closercoach'), 'negotiation');
  assert.equal(training.loungeTrainingKindOf('trickstercoach'), 'interview');
  assert.equal(training.loungeTrainingKindOf('closer'), undefined);
  assert.match(characters.getLoungeCharacter('trickstercoach').bible.invariants.join(' '), /인격/);
});

test('amounts are said the Korean way', () => {
  const won = { unit: '만원' };
  assert.equal(training.formatLoungeAmount(1250, won), '1,250만 원');
  assert.equal(training.formatLoungeAmount(31500, won), '3억 1,500만 원');
  assert.equal(training.formatLoungeAmount(30000, won), '3억 원');
  assert.equal(training.formatLoungeAmount(980, { unit: '만원', per: '평당' }), '평당 980만 원');
  assert.equal(training.formatLoungeAmount(5.5, { unit: '%' }), '5.5%');
});

test('the counterpart moves only by the rules: toward its hidden limit and never past it, more for a trade, once half way, then a deal measured against the limit', () => {
  let state = training.startLoungeNegotiation({ scenario: 'usedcar', level: 'normal', target: '1,250', walkaway: '1350만', batna: '다른 매물' }, half);
  assert.equal(state.hidden.reservation, 1260); assert.equal(state.plan.target, 1250); assert.equal(state.plan.walkaway, 1350);
  assert.equal(training.startLoungeNegotiation({ scenario: 'nope' }), undefined);
  let turn = training.advanceLoungeNegotiation(state, undefined);
  assert.equal(turn.step, 'open'); state = turn.state;
  const plain = training.advanceLoungeNegotiation(state, ngrade({ offer: 1150, tactics: ['anchor'] }));
  const traded = training.advanceLoungeNegotiation(state, ngrade({ offer: 1150, tactics: ['anchor', 'conditional'] }));
  assert.equal(plain.step, 'counter');
  assert.ok(plain.state.theirs.at(-1) < 1450 && plain.state.theirs.at(-1) >= 1260, 'moved, not past its limit');
  assert.ok(traded.state.theirs.at(-1) < plain.state.theirs.at(-1), 'a trade moves it further');
  const caved = training.advanceLoungeNegotiation(state, ngrade({ offer: 1300, caved: true }));
  assert.ok(caved.state.theirs.at(-1) > plain.state.theirs.at(-1), 'caving moves it less');
  // An offer its limit allows: half way once (실전), then taken.
  state = plain.state;
  turn = training.advanceLoungeNegotiation(state, ngrade({ offer: 1280 }));
  assert.equal(turn.step, 'push'); assert.ok(turn.state.theirs.at(-1) > 1280 && turn.state.theirs.at(-1) < state.theirs.at(-1));
  turn = training.advanceLoungeNegotiation(turn.state, ngrade({ offer: 1290 }));
  assert.equal(turn.step, 'accept'); assert.equal(turn.state.phase, 'done');
  const result = turn.state.result;
  assert.equal(result.deal, 1290); assert.equal(result.reservation, 1260);
  assert.equal(Math.round(result.capture * 100), Math.round((1450 - 1290) / (1450 - 1260) * 100));
  assert.equal(result.target_hit, false); assert.equal(result.walkaway_kept, true);
  assert.ok(result.used.includes('anchor')); assert.ok(result.missed.includes('question'));
  assert.equal(training.advanceLoungeNegotiation(turn.state, ngrade()).step, 'review', 'after the end it is the coach');
});

test('questions find the hidden need; accepting, walking and running out of rounds end it', () => {
  const state = training.advanceLoungeNegotiation(training.startLoungeNegotiation({ scenario: 'salary', level: 'normal' }, half), undefined).state;
  let turn = training.advanceLoungeNegotiation(state, ngrade({ intent: 'question', asked_interest: true }));
  assert.equal(turn.step, 'answer'); assert.equal(turn.revealed, undefined, '실전 needs two questions');
  turn = training.advanceLoungeNegotiation(turn.state, ngrade({ intent: 'question', tactics: ['question'] }));
  assert.equal(turn.revealed, state.hidden.interest);
  assert.equal(turn.state.theirs.at(-1), 5200, 'talk alone moves no number');
  const prompt = training.loungeTrainingForPrompt('negotiation', turn.state, turn.step, { revealed: turn.revealed });
  assert.equal(prompt.may_reveal_now, state.hidden.interest);
  assert.equal(prompt.your_offer, '5,200만 원');
  assert.equal(JSON.stringify(prompt).includes(training.formatLoungeAmount(state.hidden.reservation, { unit: '만원' })), false, 'the limit is never in the prompt while it is on');
  const accepted = training.advanceLoungeNegotiation(turn.state, ngrade({ intent: 'accept' }));
  assert.equal(accepted.step, 'deal'); assert.equal(accepted.state.result.deal, 5200); assert.equal(accepted.state.result.capture, 0);
  assert.match(training.loungeTrainingForPrompt('negotiation', accepted.state, 'deal').result.your_limit_was, /만 원/);
  const walked = training.advanceLoungeNegotiation(turn.state, ngrade({ intent: 'walk' }));
  assert.equal(walked.state.result.deal, null); assert.equal(walked.state.result.by, 'walked');
  let hard = training.advanceLoungeNegotiation(training.startLoungeNegotiation({ scenario: 'land', level: 'hard' }, half), undefined).state;
  for (let round = 0; round < 12 && hard.phase === 'talk'; round++) hard = training.advanceLoungeNegotiation(hard, ngrade({ offer: 800 })).state;
  assert.equal(hard.phase, 'done'); assert.equal(hard.result.by, 'timeout'); assert.equal(hard.rounds, 10);
  assert.ok(hard.theirs.every(value => value >= hard.hidden.reservation));
  // Seller side: the counterpart's number rises toward its limit.
  let gig = training.advanceLoungeNegotiation(training.startLoungeNegotiation({ scenario: 'freelance', level: 'easy' }, half), undefined).state;
  gig = training.advanceLoungeNegotiation(gig, ngrade({ offer: 520, tactics: ['anchor', 'justify'] })).state;
  assert.ok(gig.theirs.at(-1) > 300 && gig.theirs.at(-1) <= gig.hidden.reservation);
  const done = training.advanceLoungeNegotiation(gig, ngrade({ offer: 440 }));
  assert.equal(done.step, 'accept', '입문 takes the first number it can live with');
});

const answer = (extra = {}) => ({ intent: 'answer', scores: { structure: 4, specific: 4, relevance: 4, composure: 4 }, gaps: [], contradiction: '', ...extra });
const weak = gaps => answer({ scores: { structure: 2, specific: 2, relevance: 3, composure: 3 }, gaps });

test('an interview presses a gap by its pressure, moves on from a good answer, and is scored at the end', () => {
  assert.equal(training.readLoungeInterviewSetup({ job: ' ' }), undefined);
  const setup = training.readLoungeInterviewSetup({ job: '백엔드 개발자', career: '경력 5년', pressure: 2 });
  const fallback = training.readLoungeInterviewQuestions(undefined, setup);
  assert.equal(fallback[0].kind, 'opening'); assert.equal(fallback.at(-1).kind, 'closing');
  const read = training.readLoungeInterviewQuestions({ questions: [
    { kind: 'job', text: 'Redis 캐시를 도입한 이유가 뭔가요?', intent: '기술 판단' }, { kind: 'opening', text: '자기소개 해 주세요.', intent: '' },
    { kind: 'pressure', text: '이직이 잦은데 이유가 있나요?', intent: '' }, { kind: 'common', text: '지원 동기가 뭔가요?', intent: '' }, { kind: 'weird', text: '짧' },
  ] }, setup);
  assert.equal(read[0].text, '자기소개 해 주세요.'); assert.equal(read.at(-1).kind, 'closing', 'a closing is added');
  assert.equal(read.length, 5);
  let state = training.startLoungeInterview(setup, fallback);
  let turn = training.advanceLoungeInterview(state, undefined, '');
  assert.equal(turn.step, 'open'); state = turn.state;
  turn = training.advanceLoungeInterview(state, weak(['no_numbers', 'vague']), '열심히 했습니다');
  assert.equal(turn.step, 'follow'); assert.equal(turn.state.tactic, 'numbers'); assert.equal(turn.state.index, 0);
  turn = training.advanceLoungeInterview(turn.state, weak(['no_numbers']), '조금 늘었어요');
  assert.equal(turn.step, 'ask', '보통 presses once'); assert.equal(turn.state.index, 1);
  assert.match(turn.state.answers[0].said, /열심히 했습니다 \/ 조금 늘었어요/);
  const soft = training.startLoungeInterview({ ...setup, pressure: 1 }, fallback);
  const softTurn = training.advanceLoungeInterview({ ...soft, opened: true }, answer({ gaps: ['no_numbers'] }), '좋은 답');
  assert.equal(softTurn.step, 'ask', '부드럽게 lets a decent answer with a small gap go');
  const hard = { ...training.startLoungeInterview({ ...setup, pressure: 3 }, fallback), opened: true, index: 1 };
  const challenged = training.advanceLoungeInterview(hard, answer(), '좋은 답');
  assert.equal(challenged.step, 'follow'); assert.equal(challenged.state.tactic, 'challenge', '압박 challenges a good answer now and then');
  const contra = training.advanceLoungeInterview({ ...hard, index: 2 }, weak(['contradiction']), '혼자 했어요');
  assert.equal(contra.state.tactic, 'contradiction');
  // To the end.
  state = turn.state;
  while (state.phase === 'talk') state = training.advanceLoungeInterview(state, state.index === 2 ? weak(['no_role']) : answer(), '답').state;
  assert.equal(state.phase, 'done'); assert.equal(state.result.finished, true);
  assert.equal(state.result.weakest, 0); assert.ok(state.result.score > 0 && state.result.score <= 100);
  const prompt = training.loungeTrainingForPrompt('interview', state, 'wrap');
  assert.ok(prompt.result.weakest.said.includes('열심히'));
  const stopped = training.advanceLoungeInterview({ ...training.startLoungeInterview(setup, fallback), opened: true }, answer({ intent: 'stop' }), '그만');
  assert.equal(stopped.step, 'wrap'); assert.equal(stopped.state.result.finished, false);
  assert.equal(training.loungeTrainingForPrompt('interview', undefined, 'setup').step, 'setup');
  assert.match(training.loungeTrainingRules('interview'), /인격/); assert.match(training.loungeTrainingRules('negotiation'), /한계선/);
});

test('an English expression\'s nuance and similar expressions are said once it is given; why Koreans mix it up only by 문정우', () => {
  const item = { id: 'a', expression: 'come up with', meaning: '생각해 내다', level: 'B2', source: 'mine', stage: 0, days: [], free_used: false, next_review_at: null, attempts: 0,
    nuance: '아이디어를 떠올릴 때 쓰는 가벼운 구어', alternatives: [{ expression: 'think of', note: '더 쉬움' }], confusion: '생각해 내다를 think out으로 직역하기 쉽다' };
  const read = lesson.readLoungeLessonEnrich({ items: [{ id: 'a', importance: 3, difficulty: 'B1', situation: '', nuance: '부드러운 구어', confusion: 'think out으로 직역',
    alternatives: [{ expression: 'think of', note: '더 쉬움' }, { expression: 'Come up with', note: '같음' }, { expression: '생각하다', note: '' }] }] }, [{ ...item, nuance: null, alternatives: null, confusion: null, situation: '' }]);
  assert.deepEqual(read[0].alternatives, [{ expression: 'think of', note: '더 쉬움' }], 'English, and not the same expression');
  assert.equal(read[0].nuance, '부드러운 구어'); assert.equal(read[0].confusion, 'think out으로 직역');
  const asked = lesson.advanceLoungeLesson({ items: [item], plan: ['a'], now: new Date('2026-11-25T03:00:00Z'), said: 'hi', grade: undefined, opening: false });
  const ask = lesson.loungeLessonForPrompt(asked, 'B1', undefined, 'interpretertutor');
  assert.equal(ask.target.nuance, undefined); assert.equal(ask.target.alternatives, undefined, 'nothing of it before it is said');
  const given = { ...asked, step: 'give' };
  assert.equal(lesson.loungeLessonForPrompt(given, 'B1', undefined, 'interpretertutor').target.why_koreans_mix_it_up, item.confusion);
  assert.equal(lesson.loungeLessonForPrompt(given, 'B1', undefined, 'teachertutor').target.why_koreans_mix_it_up, undefined);
  assert.equal(lesson.loungeLessonForPrompt(given, 'B1', undefined, 'teachertutor').target.alternatives[0].expression, 'think of');
  assert.match(lesson.loungeLessonRules, /why_koreans_mix_it_up/);
});

test('a negotiation of the member\'s own: a built-in one edited keeps its room to give, a written one gets a limit on the right side; the debrief has sentences and advice (2026-11-26)', () => {
  const base = training.loungeNegotiationScenario('usedcar');
  const edited = training.editLoungeNegotiationScenario(base, { context: '2019년식 SUV, 판매자가 2,900만 원을 불렀다.', opening: '2,900', counterpart: { name: '김 사장' } });
  assert.equal(edited.opening, 2900); assert.equal(edited.counterpart.name, '김 사장'); assert.equal(edited.counterpart.role, base.counterpart.role);
  const ratio = 2900 / base.opening;
  assert.ok(Math.abs(edited.reservation[0] - base.reservation[0] * ratio) <= edited.step && edited.reservation[1] < 2900);
  let state = training.startLoungeNegotiation({ scenario: 'usedcar', level: 'normal' }, () => 0.5, new Date(), edited);
  assert.equal(state.custom.opening, 2900); assert.equal(state.theirs[0], 2900);
  assert.ok(training.readLoungeTrainingState(JSON.parse(JSON.stringify(state))), 'kept across the room\'s state');
  assert.equal(training.loungeTrainingForPrompt('negotiation', training.advanceLoungeNegotiation(state, undefined).state, 'open').scenario.context, edited.context);
  // A written one: a limit on the wrong side of the first number is set by code.
  const wrote = training.readLoungeNegotiationCustom({ title: '이사 견적', role: 'buyer', member: '이사를 앞둔 사람', counterpart_name: '정 실장', counterpart_role: '이사 업체 영업', counterpart_style: '바쁘다며 서두른다',
    context: '포장이사 220만 원을 불렀다.', unit: '만원', opening: 220, reservation_low: 260, reservation_high: 300, interests: ['그날 일정이 비어 있다'], trades: ['평일 이사', '현금 결제'] }, { situation: '포장이사 견적이 220만 원', side: 'buyer', unit: '만원', opening: '220' });
  assert.equal(wrote.role, 'buyer'); assert.equal(wrote.opening, 220);
  assert.ok(wrote.reservation[0] < 220 && wrote.reservation[1] < 220 && wrote.reservation[0] <= wrote.reservation[1], 'below the first number for a buyer');
  assert.equal(training.readLoungeNegotiationCustom({ context: '' }, { situation: 'x' }), undefined, 'no number, no negotiation');
  assert.equal(training.readLoungeNegotiationCustom({ role: 'seller', opening: 5000, context: '연봉 5,000만 원 제시', reservation_low: 5400, reservation_high: 5800 }, { situation: '연봉 협상' }).role, 'seller');
  // The debrief: missed moves with sentences, advice from what happened.
  state = training.advanceLoungeNegotiation(state, undefined).state;
  state = training.advanceLoungeNegotiation(state, { intent: 'negotiate', offer: null, tactics: [], caved: true, asked_interest: false }).state;
  const done = training.advanceLoungeNegotiation(state, { intent: 'accept', offer: null, tactics: [], caved: false, asked_interest: false }).state;
  const titles = done.result.advice.map(item => item.title);
  assert.ok(titles.includes('압박에는 질문으로 버티기') && titles.includes('목표보다 유리한 첫 숫자'));
  assert.ok(done.result.advice.length <= 4 && done.result.advice.every(item => item.phrases.length));
  const prompt = training.loungeTrainingForPrompt('negotiation', done, 'deal');
  assert.ok(prompt.result.missed[0].say_like_this.length >= 1 && prompt.result.missed[0].avoid);
  assert.ok(prompt.result.advice.length >= 2);
  assert.match(training.loungeTrainingRules('negotiation'), /say_like_this/);
  for (const tactic of Object.values(training.loungeNegotiationTactics)) assert.ok(tactic.phrases.length >= 1 && tactic.avoid, tactic.label);
});
