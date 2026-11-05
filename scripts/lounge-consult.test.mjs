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
const { advanceLoungeConsult, withLoungeReading, readLoungeConsultState, readLoungeReading, loungeInterpreterRequest, loungeConsultRules, loungeTarotPickPrefix, loungeTarotDrawForMe, loungeConsultPickCount, loungeConsultShownCards, loungeTarotFormText, loungeSajuFormText, readLoungeSajuForm, readLoungeTarotForm, loungeConsultSajuInput, loungeCounselFormText, readLoungeCounselForm, loungeConsultShownChart, loungeConsultShownExtras, loungeCompatFormText, readLoungeCompatForm, loungeFortuneFormText, readLoungeFortuneForm, loungeZodiacFormText, readLoungeZodiacForm } = consult;

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
  // The original letters stay, each with its meaning, and all five elements are told (2026-11-05, the owner's call).
  const explained = request.chart.explained;
  assert.match(explained.day_master, /^일간 무토\(戊土\), 양의 흙 — 큰 산 같은 사람/);
  assert.deepEqual(explained.five_elements.map(line => line.split(' — ')[0]), ['목(木) 0개, 없음', '화(火) 1개', '토(土) 5개, 많은 편', '금(金) 2개', '수(水) 0개, 없음']);
  assert.match(explained.pillars[2], /^일주: 나 자신과 배우자 자리 — 무진\(戊辰\): 무\(戊\) 흙·양 위에 진\(辰\) 흙·용$/);
  assert.match(explained.this_year, /^올해 병오\(丙午\) — 불 기운이 아주 센 해, 붉은 말의 해$/);
  assert.ok(explained.ten_gods.every(line => / — /.test(line)), 'every ten god comes with its meaning');
  const instructions = loungeInterpreterRequest(asked.state, undefined, chart).instructions;
  assert.match(instructions, /원래 글자\(간지, 한자, 일간, 목·화·토·금·수, 십성 이름\)는 그대로 쓰되 반드시 바로 옆에 뜻을 붙인다/);
  assert.match(instructions, /목·화·토·금·수 다섯 가지 모두의 개수/);
  assert.match(loungeConsultRules, /사주면 원래 글자를 그대로 말하되 반드시 바로 뜻을 붙인다/);
  // The page draws the chart under the reading: the pillars from 시주 to 년주 and the count of each element.
  assert.deepEqual(chart.display.pillars.map(pillar => `${pillar.label}:${pillar.hanja}`), ['시주:己未', '일주:戊辰', '월주:庚辰', '년주:庚午']);
  assert.deepEqual(chart.display.elements, { 목: 0, 화: 1, 토: 5, 금: 2, 수: 0 });
  const told = withLoungeReading(asked.state, reading, undefined, chart.display);
  assert.deepEqual(loungeConsultShownChart(told.state), chart.display);
  assert.equal(loungeConsultShownChart(step(told.state, '고마워').state), undefined, 'the table goes once the talk moves on');
  assert.deepEqual(readLoungeConsultState(JSON.parse(JSON.stringify(told.state))).chart, chart.display);
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

test('기타 상담: a dream with its question goes to the dream reading, love, money, people and work to a counsel reading', () => {
  const dream = loungeCounselFormText('dream', { dream: '하늘을   날다가 바다에 빠지는 꿈', question: '좋은 꿈이에요?' });
  assert.equal(dream, '📝 기타 상담 · 🌙 꿈해몽\n꿈: 하늘을 날다가 바다에 빠지는 꿈\n궁금한 것: 좋은 꿈이에요?');
  const dreamt = step(opened(), dream);
  assert.equal(dreamt.interpret, true);
  const dreamInput = JSON.parse(loungeInterpreterRequest(dreamt.state).input);
  assert.deepEqual([dreamInput.module, dreamInput.question], ['dream', '좋은 꿈이에요?']);
  assert.deepEqual(dreamInput.symbols.map(item => item.symbol), ['물', '하늘을 나는 꿈']);
  const love = loungeCounselFormText('love', { who: '썸', story: '연락이 뜸해졌어요', question: '그 사람 마음' });
  assert.deepEqual(readLoungeCounselForm(love), { category: 'love', answers: { who: '썸', story: '연락이 뜸해졌어요', question: '그 사람 마음' } });
  const counselled = step(opened(), love);
  assert.equal(counselled.interpret, true);
  const counselRequest = loungeInterpreterRequest(counselled.state);
  assert.deepEqual(JSON.parse(counselRequest.input), { module: 'counsel', category: 'love', answers: { category: 'love', who: '썸', story: '연락이 뜸해졌어요', question: '그 사람 마음' } });
  assert.match(counselRequest.instructions, /카드나 사주가 나온 것처럼 꾸미지 않는다/);
  assert.match(counselRequest.instructions, /종목, 수익, 시점은 말하지 않는다/);
  assert.equal(withLoungeReading(counselled.state, reading).turn.module, 'counsel');
  // A required answer left out is asked again.
  assert.equal(readLoungeCounselForm('📝 기타 상담 · 💰 금전\n고민: 투자 고민'), undefined);
  assert.equal(step(opened(), '📝 기타 상담 · 💰 금전\n고민: 투자 고민').turn.do, 'retry');
  assert.match(loungeConsultRules, /기타 상담\(꿈해몽, 연애, 금전, 인간관계, 진로를 적는다\)/);
});

test('궁합, 운세 and 별자리 from their forms: the births read back, a bad one asked again, and the member\'s birth kept for the next form', () => {
  const me = { date: '1990-05-03', calendar: 'solar', time: '14:30', gender: 'female' };
  const partner = { date: '1988-11-20', calendar: 'lunar', gender: 'male' };
  const compat = loungeCompatFormText({ me, partner, relation: '썸', question: '우리 · 잘 맞아요?' });
  assert.equal(compat, '💞 궁합 · 나: 1990-05-03 양력 14:30 여성 · 상대: 1988-11-20 음력 시간 모름 남성 · 사이: 썸 · 질문: 우리 · 잘 맞아요?');
  assert.deepEqual(readLoungeCompatForm(compat), { me, partner, relation: '썸', question: '우리 · 잘 맞아요?' });
  const asked = step(opened(), compat);
  assert.equal(asked.interpret, true);
  assert.deepEqual([asked.state.module, asked.state.birth], ['compat', me]);
  assert.equal(step(opened(), compat.replace('1988-11-20 음력', '1988-02-30 양력')).turn.do, 'retry', 'a date that does not exist');
  const fortune = loungeFortuneFormText({ me, period: 'today' });
  assert.equal(fortune, '🗓️ 운세 · 오늘 · 나: 1990-05-03 양력 14:30 여성');
  assert.deepEqual(readLoungeFortuneForm(fortune), { me, period: 'today' });
  assert.equal(readLoungeFortuneForm('🗓️ 운세 · 내일 · 나: 1990-05-03 양력 14:30 여성'), undefined);
  const zodiac = loungeZodiacFormText({ me: { ...me, gender: 'none' }, question: '이번 달 연애운' });
  assert.equal(zodiac, '⭐ 별자리 · 나: 1990-05-03 양력 14:30 · 질문: 이번 달 연애운');
  // 별자리 asks no gender: the one already remembered stays for the next 사주 or 궁합.
  const starred = step(asked.state, zodiac);
  assert.deepEqual([starred.state.module, starred.state.birth.gender], ['zodiac', 'female']);
  assert.deepEqual(readLoungeConsultState(JSON.parse(JSON.stringify(starred.state))).birth, me);
  const request = loungeInterpreterRequest(starred.state, undefined, { sign: '♉ 황소자리' });
  assert.deepEqual(JSON.parse(request.input), { module: 'zodiac', chart: { sign: '♉ 황소자리' }, question: '이번 달 연애운' });
  assert.match(request.instructions, /달 별자리, 상승궁, 다른 행성의 배치\(역행 등\)는 지어내지 않는다/);
  assert.match(loungeInterpreterRequest(asked.state, undefined, {}).instructions, /점수, 천생연분·최악 같은 단정/);
  assert.equal(JSON.parse(loungeInterpreterRequest(step(opened(), fortune).state, undefined, {}).input).period, '오늘');
  assert.match(loungeConsultRules, /궁합\(두 사람의 생년월일\), 운세\(오늘·이번 달·올해\), 별자리/);
});

test('궁합, 운세 and 별자리 computed: 합 and 충 between two charts, today\'s 일진, the sign by the solar terms, and what the page shows', () => {
  const now = new Date('2026-11-05T03:00:00Z');
  const born = (date, gender = 'female') => ({ date, calendar: 'solar', time: '12:00', gender });
  // 2024-01-01 is a 갑자(甲子) day, 01-02 을축, 01-06 기사, 01-07 경오.
  const clash = saju.computeLoungeCompat(born('2024-01-01'), born('2024-01-07', 'male'), now);
  assert.equal(clash.reading.between[1], '일간끼리: 쇠가 나무를 누르는 관계 — 상대가 이끄는 쪽이고, 나는 눌릴 수 있다');
  assert.match(clash.reading.between[2], /^상대가 나에게: 편관\(偏官\) — /);
  assert.match(clash.reading.between[3], /^내가 상대에게: 편재\(偏財\) — /);
  assert.match(clash.reading.between[4], /^일지\(배우자 자리\)끼리: 자\(子\)와 오\(午\) — 충\(沖\)/);
  assert.match(saju.computeLoungeCompat(born('2024-01-01'), born('2024-01-06'), now).reading.between[1], /천간합\(天干合\) — 갑기합, .*흙\(토\) 기운/);
  assert.match(saju.computeLoungeCompat(born('2024-01-01'), born('2024-01-02'), now).reading.between[4], /자\(子\)와 축\(丑\) — 육합\(六合\)/);
  assert.deepEqual([clash.display.title, clash.partnerDisplay.title, clash.partnerDisplay.pillars[1].hanja], ['나', '상대', '庚午']);
  // The ten god worked out by hand agrees with the library's.
  const library = { 비견: '比肩', 겁재: '劫财', 식신: '食神', 상관: '伤官', 편재: '偏财', 정재: '正财', 편관: '七杀', 정관: '正官', 편인: '偏印', 정인: '正印' };
  for (let day = 0; day < 60; day += 7) {
    const chart = saju.computeLoungeSaju({ ...born(`2000-0${1 + (day % 9)}-${String(1 + (day % 28)).padStart(2, '0')}`), focus: '전부' }, now);
    const [dayStem, yearStem] = [chart.display.pillars[1].hanja[0], chart.display.pillars[3].hanja[0]];
    assert.equal(saju.loungeTenGod(dayStem, yearStem), library[chart.ten_gods.year], `${dayStem} ${yearStem}`);
  }
  const me = { date: '1990-05-03', calendar: 'solar', time: '14:30', gender: 'female' };
  const today = saju.computeLoungeFortune(me, 'today', now);
  assert.equal(today.reading.explained[0], '오늘의 일진: 계미(癸未) — 계(癸) 물·음 위에 미(未) 흙·양');
  assert.match(today.reading.explained[2], /^이 기운이 나에게: 정재\(正財\) — /);
  assert.deepEqual(today.display.extra, { label: '오늘', hanja: '癸未', hangul: '계미', elements: ['수', '토'] });
  assert.equal(saju.computeLoungeFortune(me, 'year', now).reading.pillar, '병오(丙午)');
  assert.equal(saju.computeLoungeFortune(me, 'month', now).reading.pillar, '무술(戊戌)');
  // The 1990 spring equinox was at 06:19 in Seoul: the sign turns there, not on a fixed date.
  assert.equal(saju.computeLoungeZodiac({ date: '1990-03-21', calendar: 'solar', time: '06:00' }, now).display.sign, '물고기자리');
  assert.equal(saju.computeLoungeZodiac({ date: '1990-03-21', calendar: 'solar', time: '07:00' }, now).display.sign, '양자리');
  const taurus = saju.computeLoungeZodiac({ date: '1990-05-03', calendar: 'solar', time: '14:30' }, now);
  assert.deepEqual([taurus.display.sign, taurus.display.now, taurus.display.house], ['황소자리', '♏ 전갈자리', 7]);
  assert.equal(saju.computeLoungeZodiac({ date: '1990-04-09', calendar: 'lunar' }, now).display.sign, '황소자리', 'a lunar birth is converted first');
  // The page shows both charts of a 궁합 and the 별자리 card, once, under the reading.
  const asked = step(opened(), loungeCompatFormText({ me, partner: born('2024-01-07', 'male'), relation: '연인' }));
  const told = withLoungeReading(asked.state, reading, undefined, clash.display, { partnerChart: clash.partnerDisplay, zodiac: taurus.display });
  assert.deepEqual(loungeConsultShownChart(told.state), clash.display);
  assert.deepEqual(loungeConsultShownExtras(told.state), { partnerChart: clash.partnerDisplay });
  const starred = withLoungeReading(step(told.state, loungeZodiacFormText({ me })).state, reading, undefined, undefined, { zodiac: taurus.display });
  assert.deepEqual([loungeConsultShownChart(starred.state), loungeConsultShownExtras(starred.state)], [undefined, { zodiac: taurus.display }]);
  assert.deepEqual(readLoungeConsultState(JSON.parse(JSON.stringify(starred.state))).zodiac, taurus.display);
  assert.deepEqual(loungeConsultShownExtras(step(starred.state, '고마워').state), {});
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
