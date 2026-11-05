// 홍실당 상담 (2026-11-05, phase 1): the consulting room of 이한결. Code draws the cards and matches the dream symbols, a
// separate interpreter writes the reading, and 한결 only says it, a part per turn, with the buttons decided by code.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const consult = loadTs(fileURLToPath(new URL('../src/lib/loungeConsult.ts', import.meta.url)));
const tarot = loadTs(fileURLToPath(new URL('../src/lib/loungeTarot.ts', import.meta.url)));
const dreams = loadTs(fileURLToPath(new URL('../src/lib/loungeDreams.ts', import.meta.url)));
const { advanceLoungeConsult, withLoungeReading, readLoungeConsultState, readLoungeReading, loungeConsultChoices, loungeConsultChoice, loungeInterpreterRequest, loungeConsultMenu, loungeConsultRules } = consult;

const reading = { headline: '먼저 말하면 풀린다', core: ['서로 기다리는 중이다'], detail: ['오해가 쌓였다'], advice: ['짧게 먼저 연락한다'], homework: '오늘 한 줄만 보내기', tone_hint: '미루는 건 짚고 마음은 다독인다', evidence: ['컵 2 정방향'], safety: [], memory_note: '타로: 친구와 서운함', thread_state: 'none' };
const step = (state, said, opening = false) => advanceLoungeConsult(state, { opening, said });
// A fixed sequence stands in for the cryptographic draw, so the test knows which cards come out.
const sequence = values => { let i = 0; return max => values[i++ % values.length] % max; };

test('the tarot deck has 78 distinct cards with both meanings, and a draw never repeats a card', () => {
  assert.equal(tarot.loungeTarotDeck.length, 78);
  assert.equal(new Set(tarot.loungeTarotDeck.map(card => card.id)).size, 78);
  assert.equal(tarot.loungeTarotDeck.filter(card => card.id.startsWith('major-')).length, 22);
  for (const card of tarot.loungeTarotDeck) assert.ok(card.ko && card.upright && card.reversed, card.id);
  assert.match(tarot.loungeTarotDeck.find(card => card.name === 'Death').upright, /실제 죽음과는 상관없다/);
  const three = tarot.drawLoungeTarot('three', sequence([0, 1, 0, 0, 0, 1]));
  assert.deepEqual(three.map(card => card.position), ['과거', '현재', '미래']);
  assert.equal(new Set(three.map(card => card.id)).size, 3, 'the same card is never drawn twice');
  assert.deepEqual(three.map(card => card.reversed), [true, false, true]);
  assert.equal(three[0].meaning, tarot.loungeTarotDeck[0].reversed);
  // The real draw uses the platform's cryptographic source and stays in range.
  for (let i = 0; i < 200; i++) { const value = consult.loungeSecureRandomInt(78); assert.ok(value >= 0 && value < 78); }
});

test('dream symbols are found in the member\'s own words, and none of them foretells death, illness or a pregnancy', () => {
  assert.deepEqual(dreams.matchLoungeDreamSymbols('어젯밤에 이가 빠지는 꿈을 꿨는데 바다에서 헤엄치고 있었어').map(item => item.symbol), ['이빨', '물']);
  assert.deepEqual(dreams.matchLoungeDreamSymbols('그냥 평범한 하루였어'), []);
  const byName = name => dreams.loungeDreamSymbols.find(item => item.symbol === name);
  assert.match(byName('내가 죽는 꿈').traditional, /실제 죽음과는 상관없다/);
  assert.match(byName('임신').traditional, /실제 임신을 알려 주는 꿈은 아니다/);
  assert.match(byName('사고').traditional, /실제 사고를 알려 주는 꿈은 아니다/);
  for (const item of dreams.loungeDreamSymbols) assert.doesNotMatch(item.traditional + item.psychological, /액운|저주|살이 끼|흉사/, item.symbol);
});

test('a tarot consultation: greeting and menu, two questions, cards drawn by code, then the reading in three parts', () => {
  const opened = step(readLoungeConsultState(null), '', true);
  assert.equal(opened.turn.do, 'greet');
  assert.deepEqual(loungeConsultChoices(opened.state), loungeConsultMenu.map(item => item.label));
  const picked = step(opened.state, '🃏 타로');
  assert.deepEqual([picked.turn.do, picked.turn.module, picked.turn.first], ['ask', 'tarot', true]);
  assert.deepEqual(loungeConsultChoices(picked.state), ['메뉴로'], 'the question is answered in words');
  const asked = step(picked.state, '그 친구랑 다시 잘 지낼 수 있을까?');
  assert.deepEqual(loungeConsultChoices(asked.state), ['한 장 (오늘의 답)', '세 장 (과거·현재·미래)', '메뉴로']);
  const ready = step(asked.state, '세 장 (과거·현재·미래)');
  assert.equal(ready.interpret, true);
  const request = loungeInterpreterRequest(ready.state, sequence([5, 0, 9, 1, 30, 0]));
  const input = JSON.parse(request.input);
  assert.equal(input.cards.length, 3);
  assert.equal(input.answers.question, '그 친구랑 다시 잘 지낼 수 있을까?');
  assert.match(request.instructions, /입력에 없는 카드, 상징, 사실을 만들지 않는다/);
  assert.match(request.instructions, /복권·주식·코인 예측/);
  const first = withLoungeReading(ready.state, reading, request.draw);
  assert.deepEqual([first.turn.do, first.turn.step, first.turn.say.headline, first.turn.cards.length, first.turn.thread_twist_allowed], ['reading', 1, '먼저 말하면 풀린다', 3, true]);
  assert.deepEqual(loungeConsultChoices(first.state), ['더 듣기', '질문할래요', '메뉴로']);
  const second = step(first.state, '더 듣기');
  assert.deepEqual([second.turn.step, second.turn.say.core, second.turn.thread_twist_allowed], [2, ['서로 기다리는 중이다'], false], 'the twist is said in the first part only');
  const third = step(second.state, '더 듣기');
  assert.deepEqual(third.turn.say, { advice: ['짧게 먼저 연락한다'], homework: '오늘 한 줄만 보내기' });
  assert.deepEqual(loungeConsultChoices(third.state), ['다른 것도 볼래요', '이거 더 물어볼래요', '그냥 얘기할래요']);
  // A question about the reading is answered from it, with the same cards.
  const question = step(third.state, '그럼 언제 연락하는 게 좋아?');
  assert.deepEqual([question.turn.do, question.turn.question, question.turn.cards.length], ['followup', '그럼 언제 연락하는 게 좋아?', 3]);
  const again = step(question.state, '다른 것도 볼래요');
  assert.deepEqual([again.turn.do, again.state.phase, again.state.reading], ['menu', 'menu', undefined]);
  // The state survives the room's story_state.
  assert.deepEqual(readLoungeConsultState(JSON.parse(JSON.stringify(third.state))), third.state);
});

test('relationships and dreams ask their own questions; "그냥 들어 줘" listens instead of reading', () => {
  let state = step(readLoungeConsultState(null), '', true).state;
  const walk = answers => answers.reduce((current, said) => step(current.state, said), { state });
  const dream = walk(['🌙 꿈해몽', '돌아가신 할머니가 웃으면서 밥을 차려 주셨어', '좋았다', '처음', '건너뛰기']);
  assert.equal(dream.interpret, true);
  assert.equal(dream.state.answers.context, '', 'a skipped question is left empty');
  assert.deepEqual(JSON.parse(loungeInterpreterRequest(dream.state).input).symbols.map(item => item.symbol), ['돌아가신 분', '음식']);
  const listen = walk(['인간관계', '친구', '연락이 뜸해졌어', '3~10년', '서운하다', '그냥 들어 줘']);
  assert.deepEqual([listen.turn.do, listen.state.phase], ['listen', 'free']);
  assert.deepEqual(loungeConsultChoices(listen.state), ['메뉴로']);
  // Free words at the menu that name a reading start it; others get a nudge.
  assert.equal(step(state, '어제 이상한 꿈 꿨는데요').turn.module, 'dream');
  assert.equal(step(state, '오늘 날씨 좋네').turn.do, 'nudge_menu');
});

test('danger stops the reading at once, a failed reading is asked again with the same cards, and a bad reading is refused', () => {
  const opened = step(readLoungeConsultState(null), '', true).state;
  const care = step(step(opened, '🃏 타로').state, '요즘 그냥 죽고 싶어');
  assert.deepEqual([care.turn.do, care.state.phase], ['care', 'free']);
  assert.deepEqual(loungeConsultChoices(care.state), [], 'no buttons while someone may be in danger');
  assert.match(loungeConsultRules, /자살예방 상담전화 109/);
  assert.match(loungeConsultRules, /1577-0199/);
  const ready = step(step(step(opened, '🃏 타로').state, '이직해도 될까?').state, '한 장 (오늘의 답)');
  const { draw } = loungeInterpreterRequest(ready.state, sequence([3, 0]));
  const failed = withLoungeReading(ready.state, undefined, draw);
  assert.equal(failed.turn.do, 'retry');
  assert.deepEqual(loungeConsultChoices(failed.state), ['다시 보기', '메뉴로']);
  const retried = step(failed.state, '다시 보기');
  assert.equal(retried.interpret, true);
  assert.deepEqual(loungeInterpreterRequest(retried.state, sequence([60, 1])).draw, draw, 'the cards already drawn are kept');
  // A reading flagged as a crisis is not read out.
  assert.equal(withLoungeReading(ready.state, { ...reading, safety: ['crisis'] }).turn.do, 'care');
  assert.equal(readLoungeReading({ ...reading, headline: '' }), undefined);
  assert.deepEqual(readLoungeReading({ ...reading, safety: ['health', 'nonsense'], thread_state: 'weird' }).safety, ['health']);
  assert.equal(readLoungeReading({ ...reading, thread_state: 'weird' }).thread_state, 'none');
});

test('only 이한결\'s 홍실당 card is a consulting room, and the page shows its buttons from story_state', () => {
  const state = step(readLoungeConsultState(null), '', true).state;
  assert.equal(loungeConsultChoice('shaman-first-visit', 'shaman', state), undefined);
  assert.equal(loungeConsultChoice('shaman-hongsil', 'diplomat', state), undefined);
  const choice = loungeConsultChoice('shaman-hongsil', 'shaman', state);
  assert.equal(choice.choices.length, 4);
  assert.notEqual(loungeConsultChoice('shaman-hongsil', 'shaman', step(state, '🃏 타로').state).id, choice.id, 'every turn opens the panel again');
  // A room whose story_state is something else starts at the menu.
  assert.equal(readLoungeConsultState({ episode: 2, done: [] }).phase, 'menu');
});
