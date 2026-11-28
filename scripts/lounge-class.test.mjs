import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
const load = path => loadTs(fileURLToPath(new URL(path, import.meta.url)));
const classes = load('../src/lib/loungeClass.ts');
const content = load('../src/lib/loungeClassContent.ts');
const images = load('../src/lib/loungeClassImages.ts');
const lounge = load('../src/lib/lounge.ts');
const characters = load('../src/lib/loungeCharacters.ts');
const relationship = load('../src/lib/relationship/index.ts');

test('the four classes are characters of their own, with the story character\'s face and voice and no relationship (2026-11-26)', () => {
  for (const [id, base, kind] of [['inaclass', 'ina', 'emotional'], ['diplomatclass', 'diplomat', 'logical'], ['guideclass', 'guide', 'travel'], ['velvetclass', 'velvet', 'art'], ['explorerclass', 'explorer', 'travel']]) {
    assert.ok(classes.isLoungeClass(id)); assert.equal(classes.loungeClassOf(base), id); assert.equal(classes.loungeClassKindOf(id), kind);
    const host = lounge.getLoungeHost(id);
    assert.equal(host.id, id); assert.equal(host.portrait, lounge.getLoungeHost(base).portrait);
    assert.equal(characters.getLoungeCharacter(id).name, characters.getLoungeCharacter(base).name);
    assert.match(characters.getLoungeCharacter(id).bible.invariants.join(' '), /플러팅/);
    assert.equal(relationship.getRelationshipConfig(id), undefined);
    assert.ok(!lounge.loungeHosts.some(entry => entry.id === id));
    assert.ok(classes.loungeClassScenarioIds.includes(`${id}-class`));
  }
  assert.equal(classes.isLoungeClass('ina'), false);
});

test('the catalogue: assignments for each writing class, Florence and Venice sites, modern works; pictures only free ones, with credit', () => {
  assert.equal(classes.loungeClassExercises('emotional').length, 6); assert.equal(classes.loungeClassExercises('logical').length, 7);
  const sites = classes.loungeClassSites;
  assert.ok(sites.filter(site => site.city === '피렌체').length >= 7 && sites.filter(site => site.city === '베네치아').length >= 6);
  for (const site of sites) {
    assert.ok(site.history.length > 60 && site.heritage.length > 40 && site.mustSee.length >= 2, site.id);
    assert.ok(site.image, `${site.id} has a picture`);
  }
  const works = classes.loungeClassWorks;
  assert.ok(works.length >= 18);
  for (const work of works) {
    assert.ok(work.look.length >= 2 && work.meaning && work.question, work.id);
    // A work under copyright (artist died after 1955) has no picture, only its museum's page.
    const died = Number(work.artistLife.split('~')[1]);
    if (died > 1955) { assert.equal(work.image, undefined, `${work.id} is not in the public domain`); assert.ok(work.museum || work.id === 'whanki', work.id); }
  }
  for (const [id, image] of Object.entries(images.loungeClassImages)) {
    assert.match(image.license, /^(Public domain|CC0|CC BY(-SA)? \d\.\d)$/, id);
    assert.ok(image.credit && image.source.startsWith('https://commons.wikimedia.org/'), id);
    assert.ok(existsSync(fileURLToPath(new URL(`../public${image.src}`, import.meta.url))), image.src);
  }
  assert.ok(content.loungeArtWorks.some(work => work.artist === '김환기'), 'a Korean artist too');
});

test('picking starts an item, the first reply starts it and the next ones continue; a critique is kept with its words', () => {
  let state = classes.readLoungeClassState(null, 'travel');
  assert.deepEqual(state, { kind: 'class', class: 'travel', done: [], critiques: [], turns: 0 });
  assert.equal(classes.advanceLoungeClass(state).step, 'pick');
  assert.equal(classes.pickLoungeClassItem(state, 'nope'), undefined);
  state = classes.pickLoungeClassItem(state, 'duomo', new Date('2026-11-26T03:00:00Z'));
  assert.equal(state.fresh, true); assert.deepEqual(state.done, ['duomo']);
  let turn = classes.advanceLoungeClass(classes.readLoungeClassState(JSON.parse(JSON.stringify(state)), 'travel'));
  assert.equal(turn.step, 'start'); assert.equal(turn.state.fresh, undefined);
  turn = classes.advanceLoungeClass(turn.state);
  assert.equal(turn.step, 'continue');
  const prompt = classes.loungeClassForPrompt(turn.state, 'continue');
  assert.equal(prompt.item.name.startsWith('두오모'), true); assert.equal(prompt.item.image, undefined, 'the picture is not the model\'s');
  assert.equal(classes.readLoungeClassState(state, 'art').item, undefined, 'another class\'s state is not taken');
  const work = classes.loungeClassForPrompt(classes.pickLoungeClassItem(classes.readLoungeClassState(null, 'art'), 'guernica'), 'start');
  assert.equal(work.item.has_picture, false); assert.equal(work.item.museum, undefined);
  // Writing: a critique read defensively and kept for the card.
  const said = '창밖에서 빗소리가 들렸다. 커피 냄새가 방 안에 오래 머물렀고, 나는 젖은 우산을 접지도 못한 채 서 있었다.';
  assert.equal(classes.readLoungeWritingCritique({ is_writing: false }, 'emotional', said), undefined);
  const critique = classes.readLoungeWritingCritique({ is_writing: true, strengths: ['빗소리와 커피 냄새로 장면을 열었어요'], edits: [{ before: '오래 머물렀고', after: '오래 남았고', why: '더 담백하게' }, { before: 'x', after: 'x', why: '같음' }],
    rewrite: '젖은 우산을 접지도 못한 채, 나는 그 냄새 속에 서 있었다.', scores: [5, 4, 9, 'a'], next: '감정 단어 없이 마지막 문장을 바꿔 보세요' }, 'emotional', said, 'senses', new Date('2026-11-26T03:00:00Z'));
  assert.equal(critique.edits.length, 1, 'an edit that changes nothing is dropped');
  assert.deepEqual(critique.scores, { '감각과 구체성': 5, '감정의 절제': 4, '문장 리듬': 5, '여운': 3 });
  const kept = classes.advanceLoungeClass(classes.pickLoungeClassItem(classes.readLoungeClassState(null, 'emotional'), 'senses'), critique).state;
  assert.equal(kept.critiques.length, 1);
  assert.equal(classes.loungeClassForPrompt(kept, 'continue', critique).critique.next, '감정 단어 없이 마지막 문장을 바꿔 보세요');
  assert.match(classes.loungeWritingCritiqueInstructions('logical'), /주장의 명확성/);
  for (const kind of ['emotional', 'logical', 'travel', 'art']) assert.match(classes.loungeClassRules(kind), /지어내지 않/);
});

test('a culture-trip site has viewing points with pictures; going to one changes the background and the next reply arrives at it (2026-11-26)', () => {
  const spots = classes.loungeClassSpots('uffizi');
  assert.ok(spots.length >= 4 && spots.every(spot => spot.image.src.startsWith('/lounge/class/spots/')));
  for (const site of classes.loungeClassSites) assert.ok(classes.loungeClassSpots(site.id).length >= 1, `${site.id} has a viewing point`);
  let state = classes.pickLoungeClassItem(classes.readLoungeClassState(null, 'travel'), 'uffizi');
  assert.equal(classes.loungeClassScene('travel', state).src, images.loungeClassImages.uffizi.src, 'the site behind the class');
  state = classes.advanceLoungeClass(state).state;
  assert.equal(classes.pickLoungeClassSpot(state, 'david'), undefined, 'a spot of another site is not taken');
  state = classes.pickLoungeClassSpot(state, 'birth-venus');
  assert.equal(classes.loungeClassScene('travel', JSON.parse(JSON.stringify(state))).src, '/lounge/class/spots/birth-venus.webp');
  const turn = classes.advanceLoungeClass(classes.readLoungeClassState(JSON.parse(JSON.stringify(state)), 'travel'));
  assert.equal(turn.step, 'spot');
  const prompt = classes.loungeClassForPrompt(turn.state, turn.step);
  assert.equal(prompt.spot.name, '보티첼리 "비너스의 탄생"'); assert.equal(prompt.spot.image, undefined);
  assert.ok(prompt.spots.includes('카라바조 "메두사"'));
  assert.equal(classes.advanceLoungeClass(turn.state).step, 'continue');
  assert.equal(classes.pickLoungeClassItem(turn.state, 'duomo').spot, undefined, 'a new site starts at its front');
  assert.equal(classes.loungeClassScene('art', classes.pickLoungeClassItem(classes.readLoungeClassState(null, 'art'), 'kiss')).src, images.loungeClassImages.kiss.src);
  assert.equal(classes.loungeClassScene('art', classes.pickLoungeClassItem(classes.readLoungeClassState(null, 'art'), 'guernica')), undefined, 'no picture for a work under copyright');
  assert.match(classes.loungeClassRules('travel'), /step spot/);
  // The art class stays in the museum while the works change; the trip's background follows where the member stands.
  const art = classes.pickLoungeClassItem(classes.readLoungeClassState(null, 'art'), 'kiss');
  assert.equal(classes.loungeClassBackground('art', art), '/lounge/museum-gallery-v1.webp');
  assert.equal(classes.loungeClassBackground('art', null), '/lounge/museum-gallery-v1.webp');
  assert.equal(classes.loungeClassBackground('travel', state), '/lounge/class/spots/birth-venus.webp');
  assert.equal(classes.loungeClassBackground('emotional', null), undefined);
  assert.ok(existsSync(fileURLToPath(new URL('../public/lounge/museum-gallery-v1.webp', import.meta.url))));
  for (const [id, image] of Object.entries(images.loungeClassImages)) assert.ok(existsSync(fileURLToPath(new URL(`../public${image.src}`, import.meta.url))), id);
});

test("세계 국립공원 탐험 (2026-11-27): 민서하's trip of the travel class, twelve parks in four regions with viewing points, picked only in her room", () => {
  // 2026-11-28, by the owner: twenty-five in six tabs, by mountain range and region (the Alps are left to 한지오's Europe).
  assert.equal(classes.loungeClassTrip('explorerclass'), 'parks');
  assert.equal(classes.loungeClassTrip('guideclass'), 'italy');
  const parks = classes.loungeClassSites.filter(site => site.trip === 'parks');
  assert.equal(parks.length, 25);
  assert.deepEqual(classes.loungeTravelTrips.parks.tabs.map(tab => tab.name), ['미국 서부', '알래스카·하와이', '로키 산맥', '안데스 산맥', '동유럽', '러시아']);
  assert.equal(parks.find(site => site.id === 'glacier').city, '로키 산맥', 'Glacier is in the Rockies tab');
  assert.equal(parks.find(site => site.id === 'yellowstone').city, '로키 산맥', 'Yellowstone too, beside Grand Teton (2026-11-28)');
  assert.deepEqual(parks.filter(site => site.city === '미국 서부').map(site => site.id), ['grandcanyon', 'yosemite', 'zion', 'arches']);
  assert.ok(!parks.some(site => /알프스|돌로미티|몽블랑/.test(site.name + site.local)), 'no Alps in her board');
  for (const site of parks.filter(site => site.city === '러시아')) assert.match(site.tip, /외교부/, `${site.id} sends the member to the travel advisory`);
  assert.deepEqual([...new Set(parks.map(site => site.city))], classes.loungeTravelTrips.parks.tabs.map(tab => tab.name));
  for (const site of parks) {
    assert.ok(site.image, `${site.id} has a picture`);
    assert.ok(classes.loungeClassSpots(site.id).length >= 2, `${site.id} has viewing points with pictures`);
    assert.match(site.tip, /\S/);
  }
  // The Italy board keeps its own sites only.
  assert.ok(classes.loungeClassSites.filter(site => (site.trip ?? 'italy') === 'italy').every(site => ['피렌체', '베네치아'].includes(site.city)));
  const empty = classes.readLoungeClassState(null, 'travel');
  assert.ok(classes.pickLoungeClassItem(empty, 'yellowstone', new Date(), 'parks'));
  assert.equal(classes.pickLoungeClassItem(empty, 'yellowstone', new Date(), 'italy'), undefined, "a park is not picked in 한지오's room");
  assert.equal(classes.pickLoungeClassItem(empty, 'duomo', new Date(), 'parks'), undefined, 'nor a Florence site in hers');
  const picked = classes.pickLoungeClassItem(empty, 'yellowstone', new Date(), 'parks');
  assert.ok(classes.pickLoungeClassSpot(picked, 'old-faithful'));
  assert.equal(classes.loungeClassBackground('travel', classes.pickLoungeClassSpot(picked, 'old-faithful')), images.loungeClassImages['old-faithful'].src);
  // Her rules name her board and keep safety and changing facts straight; her class keeps her own voice.
  const rules = classes.loungeClassRules('travel', 'parks');
  assert.match(rules, /국립공원 지도/); assert.match(rules, /안전 수칙/); assert.match(rules, /공식 안내/); assert.match(rules, /지어내지 않/);
  assert.match(classes.loungeClassRules('travel'), /문화기행 지도/);
  assert.match(characters.getLoungeCharacter('explorerclass').bible.humor, /퀴즈/);
  assert.notEqual(characters.getLoungeCharacter('explorerclass').bible.voice.tone, characters.getLoungeCharacter('inaclass').bible.voice.tone);
});

test('일본 소도시 기행 (2026-11-28): 아사쿠라 미오 walks the trip in her own story room, not a separate class', () => {
  // Her own character is the travel companion: the board, the spots and the pictures of a travel class, in her 1:1 room.
  assert.equal(classes.isLoungeClass('mio'), false, 'no class room of her own');
  assert.equal(classes.isLoungeTravelCompanion('mio'), true);
  assert.equal(classes.loungeClassKindOf('mio'), 'travel');
  assert.equal(classes.loungeClassTrip('mio'), 'japan');
  // 한지오 and 민서하 walk their trips in their own rooms too (2026-11-28), with the parks' safety in 민서하's rules.
  assert.equal(classes.isLoungeTravelCompanion('explorer'), true);
  assert.equal(classes.isLoungeTravelCompanion('guide'), true);
  assert.equal(classes.loungeClassTrip('explorer'), 'parks');
  assert.equal(classes.loungeClassTrip('guide'), 'italy');
  assert.match(classes.loungeTravelCompanionRules('parks'), /야생동물/);
  assert.doesNotMatch(classes.loungeTravelCompanionRules('japan'), /야생동물/);
  const towns = classes.loungeClassSites.filter(site => site.trip === 'japan');
  assert.equal(towns.length, 26);
  assert.deepEqual([...new Set(towns.map(site => site.city))], classes.loungeTravelTrips.japan.tabs.map(tab => tab.name));
  // Every World Heritage town the owner asked for is there.
  for (const id of ['nikko', 'hiraizumi', 'shirakawago', 'himeji', 'koyasan', 'kumanokodo', 'miyajima', 'iwamiginzan', 'yakushima']) assert.ok(towns.some(site => site.id === id), id);
  // The seven towns of the owner's bible.
  for (const id of ['ine', 'takayama', 'narai', 'kinosaki', 'ouchijuku', 'onomichi', 'hagi']) assert.ok(towns.some(site => site.id === id), id);
  for (const site of towns) {
    assert.ok(site.image, `${site.id} has a picture`);
    assert.ok(classes.loungeClassSpots(site.id).length >= 2, `${site.id} has viewing points with pictures`);
    assert.ok(site.food?.length && site.life && site.hook, `${site.id} says what is eaten, who lives there and how 미오 might start`);
    assert.doesNotMatch(`${site.name}${site.local}`, /도쿄|오사카|東京|大阪/, 'no Tokyo or Osaka');
  }
  // Her room picks only Japanese towns, and the reply gets the town's facts, food and life with them.
  const empty = classes.readLoungeClassState(null, 'travel');
  assert.ok(classes.pickLoungeClassItem(empty, 'ine', new Date(), 'japan'));
  assert.equal(classes.pickLoungeClassItem(empty, 'duomo', new Date(), 'japan'), undefined);
  assert.equal(classes.pickLoungeClassItem(empty, 'ine', new Date(), 'parks'), undefined);
  const picked = classes.pickLoungeClassItem(empty, 'ine', new Date(), 'japan');
  const prompt = classes.loungeClassForPrompt(picked, 'start');
  assert.equal(prompt.item.id, 'ine'); assert.ok(prompt.item.food.length && prompt.item.life);
  // Her rules are a companion's, not a lesson's: no "이야기나 연애 장면이 아니다", no ban on actions; facts only from the town.
  const rules = classes.loungeTravelCompanionRules('japan');
  assert.match(rules, /일본 소도시 지도/); assert.match(rules, /수업이 아니라/); assert.match(rules, /지어내지 않/); assert.match(rules, /관계/);
  assert.doesNotMatch(rules, /연애 장면이 아니다|별표\(\*\)와 행동 묘사를 쓰지 않는다/);
  // Picking a town first gives its guide (food, life, what to see first), and the next stop is suggested from the board (2026-11-28).
  assert.match(rules, /첫 안내/); assert.match(rules, /대표 음식과 특산품/); assert.match(rules, /간사이 — 이네, 기노사키 온천/);
  assert.equal(characters.getLoungeCharacter('mio').place, 'inebay');
  // Every town has its place on the Japan map (2026-11-28), inside the map's frame.
  const japan = load('../src/lib/loungeJapanContent.ts');
  for (const site of towns) {
    assert.ok(site.geo, `${site.id} has coordinates`);
    const { left, top } = japan.loungeJapanMapPoint(site.geo);
    assert.ok(left > 2 && left < 98 && top > 2 && top < 98, `${site.id} falls inside the map (${left.toFixed(1)}, ${top.toFixed(1)})`);
  }
  assert.equal(classes.loungeClassForPrompt(picked, 'start').item.geo, undefined, 'the coordinates are not sent to the reply');
});
