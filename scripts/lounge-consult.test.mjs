// 홍실당 상담: 이한결's consulting room. A conversation first (2026-11-05): tarot and 사주 start from forms under the 홍실당
// button; the member picks the cards from a deck code shuffled; a 사주 chart is computed by code; a dream told in the
// conversation is read at once. Code computes, a separate interpreter writes the reading, and 한결 only says it.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const consult = loadTs(fileURLToPath(new URL('../src/lib/loungeConsult.ts', import.meta.url)));
const tarot = loadTs(fileURLToPath(new URL('../src/lib/loungeTarot.ts', import.meta.url)));
const dreams = loadTs(fileURLToPath(new URL('../src/lib/loungeDreams.ts', import.meta.url)));
const saju = loadTs(fileURLToPath(new URL('../src/lib/loungeSaju.ts', import.meta.url)));
const { advanceLoungeConsult, withLoungeReading, readLoungeConsultState, readLoungeReading, loungeInterpreterRequest, loungeConsultRules, loungeTarotPickPrefix, loungeTarotDrawForMe, loungeConsultPickCount, loungeConsultShownCards, loungeTarotFormText, loungeSajuFormText, readLoungeSajuForm, readLoungeTarotForm, loungeConsultSajuInput } = consult;

const reading = { headline: '먼저 말하면 풀린다', core: ['서로 기다리는 중이다'], detail: ['오해가 쌓였다'], advice: ['짧게 먼저 연락한다'], homework: '오늘 한 줄만 보내기', tone_hint: '미루는 건 짚고 마음은 다독인다', evidence: ['컵 2 정방향'], safety: [], memory_note: '타로: 친구와 서운함' };
const step = (state, said, opening = false, randomInt) => advanceLoungeConsult(state, { opening, said }, randomInt);
// A fixed sequence stands in for the cryptographic source, so the test knows which cards come out.
const sequence = values => { let i = 0; return max => values[i++ % values.length] % max; };
const opened = () => step(readLoungeConsultState(null), '', true).state;

test('the tarot deck has 78 distinct cards with both meanings and the 1909 art for each, and a shuffle keeps every card once', () => {
  assert.equal(tarot.loungeTarotDeck.length, 78);
  assert.equal(new Set(tarot.loungeTarotDeck.map(card => card.id)).size, 78);
  assert.equal(tarot.loungeTarotDeck.filter(card => card.id.startsWith('major-')).length, 22);
  for (const card of tarot.loungeTarotDeck) {
    assert.ok(card.ko && card.upright && card.reversed, card.id);
    assert.ok(existsSync(fileURLToPath(new URL(`../public/lounge/tarot/${card.id}.webp`, import.meta.url))), `${card.id}: its picture`);
  }
  assert.match(tarot.loungeTarotDeck.find(card => card.name === 'Death').upright, /실제 죽음과는 상관없다/);
  const order = tarot.shuffleLoungeTarot(consult.loungeSecureRandomInt);
  assert.deepEqual([...order].sort(), tarot.loungeTarotDeck.map(card => card.id).sort());
  // Picks out of range or twice fall to the next free place, so a spread is always complete.
  const drawn = tarot.loungeTarotFromPicks('three', order, [4, 4, 200], sequence([0]));
  assert.deepEqual(drawn.map(card => card.id), [order[4], order[0], order[1]]);
  assert.deepEqual(drawn.map(card => card.position), ['과거', '현재', '미래']);
  for (let i = 0; i < 200; i++) { const value = consult.loungeSecureRandomInt(78); assert.ok(value >= 0 && value < 78); }
});

test('dream symbols are found in the member\'s own words, and none of them foretells death, illness or a pregnancy', () => {
  assert.deepEqual(dreams.matchLoungeDreamSymbols('어젯밤에 이가 빠지는 꿈을 꿨는데 바다에서 헤엄치고 있었어').map(item => item.symbol), ['이빨', '물']);
  assert.deepEqual(dreams.matchLoungeDreamSymbols('그냥 평범한 하루였어'), []);
  const byName = name => dreams.loungeDreamSymbols.find(item => item.symbol === name);
  assert.match(byName('내가 죽는 꿈').traditional, /실제 죽음과는 상관없다/);
  assert.match(byName('임신').traditional, /실제 임신을 알려 주는 꿈은 아니다/);
  for (const item of dreams.loungeDreamSymbols) assert.doesNotMatch(item.traditional + item.psychological, /액운|저주|살이 끼|흉사/, item.symbol);
});

test('the room is a conversation: the 홍실당 button blinks for a new guest and when tarot or 사주 comes up', () => {
  const greeted = step(readLoungeConsultState(null), '', true);
  assert.deepEqual([greeted.turn.do, greeted.state.phase, greeted.state.hint], ['greet', 'chat', true]);
  const talked = step(greeted.state, '요즘 회사 사람 때문에 너무 스트레스야');
  assert.deepEqual([talked.turn.do, talked.state.hint], ['chat', undefined], 'plain talk stops the blinking');
  const asked = step(talked.state, '사주 같은 것도 봐 줘?');
  assert.deepEqual([asked.turn.do, asked.turn.suggest, asked.state.hint], ['chat', true, true]);
  assert.match(loungeConsultRules, /아래 빨간 홍실당 버튼/);
});

test('tarot from the form: the question and the spread in one message, a deck shuffled by code, the member\'s picks, the whole reading', () => {
  const form = loungeTarotFormText('three', '  그 친구랑   다시 잘 지낼 수 있을까? ');
  assert.equal(form, '🃏 타로 · 세 장 · 그 친구랑 다시 잘 지낼 수 있을까?');
  assert.deepEqual(readLoungeTarotForm(form), { spread: 'three', question: '그 친구랑 다시 잘 지낼 수 있을까?' });
  const laid = step(opened(), form);
  assert.deepEqual([laid.turn.do, laid.turn.question, laid.turn.count, laid.state.phase], ['ask_pick', '그 친구랑 다시 잘 지낼 수 있을까?', 3, 'tarot_pick']);
  assert.equal(new Set(laid.state.deck).size, 78);
  assert.equal(loungeConsultPickCount(laid.state), 3, 'the page lays the deck out for three picks');
  assert.equal(loungeConsultPickCount(step(opened(), loungeTarotFormText('one', '오늘 어때?')).state), 1);
  const ready = step(laid.state, `${loungeTarotPickPrefix}1, 5, 9`);
  assert.equal(ready.interpret, true);
  assert.equal(loungeConsultPickCount(ready.state), 0);
  const request = loungeInterpreterRequest(ready.state, sequence([1, 0, 1]));
  const input = JSON.parse(request.input);
  assert.deepEqual(request.draw.map(card => card.id), [laid.state.deck[0], laid.state.deck[4], laid.state.deck[8]], 'the cards at the places picked');
  assert.equal(input.question, '그 친구랑 다시 잘 지낼 수 있을까?');
  assert.match(input.cards[0].card, /\(.+\)$/, 'the English name goes along');
  assert.match(request.instructions, /라이더-웨이트 덱의 전통적인 해석/);
  const told = withLoungeReading(ready.state, reading, request.draw);
  assert.deepEqual([told.turn.do, told.turn.reading.headline, told.turn.cards.length, told.state.phase], ['reading', '먼저 말하면 풀린다', 3, 'chat']);
  assert.equal(loungeConsultShownCards(told.state).length, 3, 'the cards are turned face up under the reading');
  // What the member says next is answered from the reading, for a while, and the cards go once the talk moves on.
  const after = step(told.state, '그럼 언제 연락하는 게 좋아?');
  assert.deepEqual([after.turn.do, after.turn.reading.headline, after.turn.cards.length, loungeConsultShownCards(after.state).length], ['chat', '먼저 말하면 풀린다', 3, 0]);
  let later = after.state;
  for (let i = 0; i < 6; i++) later = step(later, '그렇구나').state;
  assert.equal(step(later, '고마워').turn.reading, undefined);
  assert.equal(step(laid.state, loungeTarotDrawForMe).interpret, true, 'the member may let the cards be drawn for them');
  assert.deepEqual(readLoungeConsultState(JSON.parse(JSON.stringify(told.state))), told.state);
});

test('사주 from the form: the birth read back, refused when it is not a real date, and the chart handed to the interpreter', () => {
  const input = { date: '1990-05-03', calendar: 'solar', time: '14:30', gender: 'female', focus: '올해 흐름', question: '이직해도 될까?' };
  const form = loungeSajuFormText(input);
  assert.equal(form, '🔮 사주 · 1990-05-03 양력 · 14:30 · 여성 · 올해 흐름 · 질문: 이직해도 될까?');
  assert.deepEqual(readLoungeSajuForm(form), input);
  assert.deepEqual(readLoungeSajuForm(loungeSajuFormText({ date: '1987-02-30', calendar: 'lunar', gender: 'none', focus: '전부' })), { date: '1987-02-30', calendar: 'lunar', gender: 'none', focus: '전부' }, 'a lunar month has a 30th; the time may be unknown');
  assert.equal(readLoungeSajuForm('🔮 사주 · 1990-02-30 양력 · 시간 모름 · 여성 · 전부'), undefined, 'no February 30th in the solar calendar');
  assert.equal(readLoungeSajuForm('🔮 사주 · 1850-01-01 양력 · 시간 모름 · 여성 · 전부'), undefined);
  const asked = step(opened(), form);
  assert.equal(asked.interpret, true);
  assert.deepEqual(loungeConsultSajuInput(asked.state), input);
  const chart = saju.computeLoungeSaju(input, new Date('2026-11-05T03:00:00Z'));
  const request = JSON.parse(loungeInterpreterRequest(asked.state, undefined, chart).input);
  assert.deepEqual([request.module, request.focus, request.question, request.chart.pillars.day], ['saju', '올해 흐름', '이직해도 될까?', '무진']);
  assert.match(loungeInterpreterRequest(asked.state, undefined, chart).instructions, /학파마다 판단이 갈리는 것은 단정하지 않는다/);
  assert.equal(step(opened(), '🔮 사주 · 아무거나').turn.do, 'retry', 'a form that does not read is asked again');
});

test('the 사주 chart: pillars from the solar terms and the sun at Seoul, the zone history, and what is left out', () => {
  const now = new Date('2026-11-05T03:00:00Z');
  const chart = saju.computeLoungeSaju({ date: '1990-05-03', calendar: 'solar', time: '14:30', gender: 'female', focus: '전부' }, now);
  assert.deepEqual(chart.pillars, { year: '경오', month: '경진', day: '무진', hour: '기미' });
  assert.equal(chart.day_master, '무토(양)');
  assert.equal(Object.values(chart.five_elements).reduce((a, b) => a + b), 8);
  assert.equal(chart.this_year, '병오');
  assert.ok(chart.daewoon?.list.length && chart.daewoon.current, 'luck pillars with a gender');
  // The Korean clock through its history: summer time in 1988 and UTC+8:30 in 1958.
  assert.equal(new Date(saju.seoulCivilToUtc(1988, 7, 1, 12, 0)).toISOString(), '1988-07-01T02:00:00.000Z');
  assert.equal(new Date(saju.seoulCivilToUtc(1958, 1, 1, 13, 10)).toISOString(), '1958-01-01T04:40:00.000Z');
  assert.equal(new Date(saju.seoulCivilToUtc(2024, 2, 4, 17, 20)).toISOString(), '2024-02-04T08:20:00.000Z');
  // 입춘 2024 fell at 17:27 Seoul time: the year turns there, not at midnight or New Year.
  assert.equal(saju.computeLoungeSaju({ date: '2024-02-04', calendar: 'solar', time: '17:20', gender: 'none', focus: '전부' }, now).pillars.year, '계묘');
  assert.equal(saju.computeLoungeSaju({ date: '2024-02-04', calendar: 'solar', time: '17:35', gender: 'none', focus: '전부' }, now).pillars.year, '갑진');
  // Summer time moves the hour: 12:00 on 1988-07-01 was 10:28 by the sun at Seoul, the hour of 사(巳).
  assert.match(saju.computeLoungeSaju({ date: '1988-07-01', calendar: 'solar', time: '12:00', gender: 'none', focus: '전부' }, now).pillars.hour, /사$/);
  // Unknown time, lunar date, no gender: three pillars, a converted date, no luck pillars, each said in the notes.
  const vague = saju.computeLoungeSaju({ date: '1990-04-09', calendar: 'lunar', gender: 'none', focus: '전부' }, now);
  assert.deepEqual([vague.pillars.hour, vague.solar_date, vague.daewoon], [null, '1990-05-03', undefined]);
  assert.equal(vague.notes.length, 3);
  assert.equal(Object.values(vague.five_elements).reduce((a, b) => a + b), 6);
});

test('a dream told in the conversation is read at once, with the symbols code found', () => {
  const told = step(opened(), '어젯밤에 돌아가신 할머니가 웃으면서 밥을 차려 주는 꿈을 꿨어');
  assert.equal(told.interpret, true);
  const input = JSON.parse(loungeInterpreterRequest(told.state).input);
  assert.deepEqual(input.symbols.map(item => item.symbol), ['돌아가신 분', '음식']);
  assert.equal(withLoungeReading(told.state, reading).turn.module, 'dream');
  assert.equal(step(opened(), '꿈이 뭐야').turn.do, 'chat', 'a question about dreams is not a dream');
});

test('danger stops everything, a failed reading lays the same deck out again, and a bad reading is refused', () => {
  const care = step(step(opened(), loungeTarotFormText('three', '괜찮을까?')).state, '요즘 그냥 죽고 싶어');
  assert.deepEqual([care.turn.do, care.state.phase], ['care', 'chat']);
  assert.match(loungeConsultRules, /자살예방 상담전화 109/);
  assert.match(loungeConsultRules, /1577-0199/);
  const laid = step(opened(), loungeTarotFormText('three', '이직해도 될까?')).state;
  const failed = withLoungeReading(step(laid, loungeTarotDrawForMe).state, undefined);
  assert.deepEqual([failed.turn.do, failed.state.phase, loungeConsultPickCount(failed.state)], ['retry', 'tarot_pick', 3]);
  assert.deepEqual(failed.state.deck, laid.deck, 'the same cards stay laid out');
  assert.equal(withLoungeReading(laid, { ...reading, safety: ['crisis'] }).turn.do, 'care');
  assert.equal(readLoungeReading({ ...reading, headline: '' }), undefined);
  assert.deepEqual(readLoungeReading({ ...reading, safety: ['health', 'nonsense'] }).safety, ['health']);
  assert.equal(readLoungeConsultState({ episode: 2, done: [] }).phase, 'chat');
});
