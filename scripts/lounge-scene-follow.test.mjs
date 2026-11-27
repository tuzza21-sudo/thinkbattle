import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const follow = loadTs(fileURLToPath(new URL('../src/lib/loungeSceneFollow.ts', import.meta.url)));
const messenger = loadTs(fileURLToPath(new URL('../src/lib/loungeMessenger.ts', import.meta.url)));
const { loungeThemes, loungePlaceBackgroundIds } = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));

const minute = 60_000, now = Date.parse('2026-11-10T03:00:00Z');
const scene = (location, scene_type, extra = {}) => ({ location, scene_type, activity: '이야기하는 중', time_of_day: '밤', ...extra });
const decide = (input) => follow.decideSceneFollow({ sceneTurns: 5, now, ...input });

test('a place is stated by the engine unless it only says where each is', () => {
  assert.equal(follow.stateScenePlace(scene('호텔 라운지 바', '바')), '호텔 라운지 바');
  assert.equal(follow.stateScenePlace(scene('각자 있는 곳에서 전화 통화', '기타')), undefined);
  assert.equal(follow.stateScenePlace(scene('전화 통화', '기타')), undefined);
  assert.equal(follow.stateScenePlace(undefined), undefined);
});

test('a summary line states a place once its time of day and a call line are taken away', () => {
  assert.equal(follow.placeFromSceneLine('저녁 일곱 시, 도심 호텔 라운지. 맞선 자리에서 와인을 앞에 두고'), '도심 호텔 라운지');
  assert.equal(follow.placeFromSceneLine('밤, 무진의 사무실 주차장에서 차에 오르며 내일을 기약하고 헤어진다.')?.startsWith('무진의 사무실 주차장'), true);
  assert.equal(follow.placeFromSceneLine('통화 중 — 시우는 시사회가 끝난 극장 로비에서'), undefined);
  assert.equal(follow.placeFromSceneLine('밤'), undefined);
  assert.equal(follow.placeFromSceneLine(undefined), undefined);
});

test('at the start the stated place is applied, from the engine or, without one, from the summary line', () => {
  const fromEngine = decide({ scene: scene('집 거실', '집') });
  assert.equal(fromEngine.action, 'apply'); assert.equal(fromEngine.reason, 'first'); assert.equal(fromEngine.place, '집 거실');
  const fromLine = decide({ memoryLine: '저녁, 노포 식당 안. 국밥을 시켜 놓고' });
  assert.equal(fromLine.action, 'apply'); assert.equal(fromLine.reason, 'first');
  assert.equal(decide({ scene: scene('각자 있는 곳에서 전화 통화', '기타') }).action, 'keep', 'no stated place: nothing to follow');
});

test('a background the member chose before its pick was stamped is never touched', () => {
  assert.deepEqual(decide({ manual: true, scene: scene('집 거실', '집') }), { action: 'keep', reason: 'manual' });
  assert.deepEqual(decide({ manual: true, scene: scene('가까운 공원', '기타'), change: { turn: 3, at: now, explicit: true } }), { action: 'keep', reason: 'manual' });
});

test('a background the member picked holds for its place, and follows an explicit move made after the pick (2026-11-20, 공원)', () => {
  const picked = now - 20 * minute;
  const park = scene('가까운 공원', '기타');
  // the talk is still where it was, or drifts: the pick stays, however long and however many turns
  assert.deepEqual(decide({ manual: true, pickedAt: picked, scene: scene('와인바', '바'), sceneTurns: 40, now: now + 600 * minute }), { action: 'keep', reason: 'manual' });
  assert.deepEqual(decide({ manual: true, pickedAt: picked, scene: park, sceneTurns: 40, now: now + 600 * minute, change: { turn: 6, at: now - 30 * minute, explicit: false } }), { action: 'keep', reason: 'manual' }, 'a drift is not a move');
  // an explicit move made before the pick was the pick's own place
  assert.deepEqual(decide({ manual: true, pickedAt: picked, scene: park, change: { turn: 6, at: picked - minute, explicit: true } }), { action: 'keep', reason: 'manual' });
  // an explicit move after it goes, at once
  const moved = decide({ manual: true, pickedAt: picked, scene: park, change: { turn: 11, at: picked + minute, explicit: true } });
  assert.equal(moved.action, 'apply'); assert.equal(moved.reason, 'explicit'); assert.equal(moved.place, '가까운 공원');
  // but not while on the way, or when the engine does not know the place
  assert.deepEqual(decide({ manual: true, pickedAt: picked, scene: scene('엘리베이터', '기타'), change: { turn: 11, at: picked + minute, explicit: true } }), { action: 'keep', reason: 'on_the_way' });
  assert.deepEqual(decide({ manual: true, pickedAt: picked, scene: scene('각자 있는 곳', '기타'), change: { turn: 11, at: picked + minute, explicit: true } }), { action: 'keep', reason: 'manual' });
});

test('the same place changes nothing, however many replies ask', () => {
  const s = scene('집 거실', '집');
  const key = follow.sceneFollowKey(s, '집 거실');
  assert.equal(decide({ scene: s, follow: { key, at: now - 60 * minute, place: '집 거실' } }).reason, 'same');
});

test('learning a scene type after the prologue does not turn the same physical place into a move', () => {
  const place = '성북동 본가 식탁';
  const first = follow.sceneFollowKey(undefined, place);
  assert.equal(decide({ scene: scene(place, '집'), follow: { key: first, at: now - 1000, place } }).reason, 'same');
  assert.equal(decide({ scene: scene(place, '집'), follow: { key: `식당|${first}`, at: now - 1000, place } }).reason, 'same', 'old stored keys remain compatible');
});

test('an explicit move after the last decision changes the background at once, however recent', () => {
  const was = { key: follow.sceneFollowKey(scene('식당', '식당'), '식당'), at: now - 2 * minute, place: '식당' };
  const moved = decide({ scene: scene('집 거실', '집'), sceneTurns: 0, change: { turn: 12, at: now - 1 * minute, explicit: true }, follow: was });
  assert.equal(moved.action, 'apply'); assert.equal(moved.reason, 'explicit');
  // an explicit move that was already acted on (older than the last decision) is not again
  const old = decide({ scene: scene('집 거실', '집'), sceneTurns: 0, change: { turn: 12, at: now - 10 * minute, explicit: true }, follow: was });
  assert.equal(old.action, 'keep');
});

test('without an explicit move the background changes only after the scene has settled and a while has passed', () => {
  const was = (agoMinutes) => ({ key: follow.sceneFollowKey(scene('식당', '식당'), '식당'), at: now - agoMinutes * minute, place: '식당' });
  const next = scene('한강 변', '외출');
  assert.equal(decide({ scene: next, sceneTurns: 1, follow: was(60) }).reason, 'too_soon', 'only just arrived');
  assert.equal(decide({ scene: next, sceneTurns: 5, follow: was(5) }).reason, 'too_soon', 'changed lately');
  const settled = decide({ scene: next, sceneTurns: 5, follow: was(45) }); // 2026-11-18: 40 minutes and five turns (it was 20 and three)
  assert.equal(decide({ scene: next, sceneTurns: 4, follow: was(45) }).reason, 'too_soon', 'four turns are not five');
  assert.equal(decide({ scene: next, sceneTurns: 5, follow: was(30) }).reason, 'too_soon', '30 minutes are not 40');
  assert.equal(settled.action, 'apply'); assert.equal(settled.reason, 'moved');
  assert.equal(decide({ scene: next, sceneTurns: 5, change: { turn: 3, at: now - 3 * minute, explicit: false }, follow: was(5) }).action, 'keep');
});

test('a chat that began from a story keeps its first background unless the talk moves the two (2026-11-19)', () => {
  const first = { key: follow.sceneFollowKey(undefined, '금요일 밤 11시 40분, 당신의 집 앞 지안의 낡은 흰색 SUV 안'), at: now - 90 * minute, place: '지안의 SUV 안' };
  // the engine words the same place its own way, and it has held for many turns and a long while: still not a move
  const reworded = decide({ story: true, scene: scene('집 앞에 세운 지안의 SUV 안', '차'), sceneTurns: 30, change: { turn: 1, at: now - 80 * minute, explicit: false }, follow: first });
  assert.deepEqual([reworded.action, reworded.reason], ['keep', 'story_stays']);
  // the same wording of a chat that is not a story still follows, as before
  assert.equal(decide({ scene: scene('집 앞에 세운 지안의 SUV 안', '차'), sceneTurns: 30, follow: first }).reason, 'moved');
  // an explicit move in a story is followed at once, and the start is still set from the prologue's place
  assert.equal(decide({ story: true, scene: scene('집 거실', '집'), sceneTurns: 0, change: { turn: 12, at: now - 1 * minute, explicit: true }, follow: first }).reason, 'explicit');
  assert.equal(decide({ story: true, memoryLine: '금요일 밤, 한남동 작은 프렌치 레스토랑의 창가 테이블' }).reason, 'first');
});

test('a place on the way is never shown, and arriving from it is followed at once, other places still wait', () => {
  const pool = { key: follow.sceneFollowKey(scene('호텔 수영장', '수영장'), '호텔 수영장'), at: now - 2 * minute, place: '호텔 수영장' };
  const room = scene('호텔 객실', '집');
  assert.equal(follow.isTransitPlace('호텔 복도'), true); assert.equal(follow.isTransitPlace('엘리베이터 안'), true); assert.equal(follow.isTransitPlace('호텔 객실'), false);
  assert.equal(follow.isTransitPlace('자동차 안'), false, 'a car is a place of its own');
  // the corridor is never shown, even when the member asked to go and the last change was long ago
  const corridor = scene('호텔 복도', '이동');
  assert.deepEqual({ ...decide({ scene: corridor, sceneTurns: 0, change: { turn: 5, at: now - 1000, explicit: true }, follow: { ...pool, at: now - 60 * minute } }) }, { action: 'keep', reason: 'on_the_way' });
  assert.equal(decide({ scene: corridor, sceneTurns: 9, follow: undefined }).action, 'keep');
  // ...and arriving in the room from it is a move that is followed at once
  const arrived = decide({ scene: room, sceneTurns: 0, change: { turn: 6, at: now - 1000, explicit: true }, follow: pool });
  assert.equal(arrived.action, 'apply'); assert.equal(arrived.reason, 'explicit'); assert.equal(arrived.place, '호텔 객실');
  const messengerState = (location) => ({ ...messenger.normalizeLoungeCompanionState({}, 'r'), scene: { ...scene(location, '이동'), season: '', objects: [] }, scene_turns: 1 });
  const stepped = messenger.nextLoungeCompanionState({ state: messengerState('호텔 복도'), update: { scene: { ...scene('호텔 객실', '집'), season: '', objects: [] } }, decision: { progress: 'stay' }, turn: 8, reply: '들어와요', inner: '', now: 8000 });
  assert.deepEqual({ ...stepped.scene_change }, { turn: 8, at: 8000, explicit: true }, 'leaving a corridor is an arrival');
  const resting = { key: follow.sceneFollowKey(scene('식당', '식당'), '식당'), at: now - 2 * minute, place: '식당' };
  assert.equal(decide({ scene: room, sceneTurns: 1, follow: resting }).reason, 'too_soon', 'a real place is kept for a while');
});

test('the engine notes a change of scene, and whether the member asked for it, even when the move comes a turn later', () => {
  const base = messenger.normalizeLoungeCompanionState({}, 'room-1');
  const scene1 = { location: '식당', scene_type: '식당', activity: '저녁', time_of_day: '저녁', season: '', objects: [] };
  const update = location => ({ scene: { ...scene1, location, scene_type: location === '집 거실' ? '집' : '식당' } });
  const first = messenger.nextLoungeCompanionState({ state: base, update: update('식당'), decision: { progress: 'stay' }, turn: 1, reply: '네', inner: '', now: 1000 });
  assert.equal(first.scene_change.explicit, false);
  const asked = messenger.nextLoungeCompanionState({ state: first, update: update('식당'), decision: { progress: 'transition', target: '집으로 가자' }, turn: 2, reply: '좋아요', inner: '', now: 2000 });
  assert.equal(asked.scene_change.turn, 1, 'no move yet: the last change is still the first scene');
  assert.equal(asked.scene_move_asked, 2);
  const moved = messenger.nextLoungeCompanionState({ state: asked, update: update('집 거실'), decision: { progress: 'stay' }, turn: 3, reply: '들어가요', inner: '', now: 3000 });
  assert.deepEqual({ ...moved.scene_change }, { turn: 3, at: 3000, explicit: true });
  assert.equal(moved.scene_turns, 0);
  // it survives the stored form
  const stored = messenger.normalizeLoungeCompanionState(JSON.parse(JSON.stringify({ ...moved, room_id: 'room-1' })), 'room-1');
  assert.deepEqual({ ...stored.scene_change }, { turn: 3, at: 3000, explicit: true });
  // a change nobody asked for is not explicit
  const drift = messenger.nextLoungeCompanionState({ state: moved, update: update('식당'), decision: { progress: 'stay' }, turn: 9, reply: '네', inner: '', now: 9000 });
  assert.equal(drift.scene_change.explicit, false);
});

test('the switch for the follow is on until the member turns it off, and off for a background they chose', () => {
  const { loungeSceneAutoOn } = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
  assert.equal(loungeSceneAutoOn(null), true);
  assert.equal(loungeSceneAutoOn({ theme: 'cafe', auto: true }), true);
  assert.equal(loungeSceneAutoOn({ theme: 'cafe', auto: true, auto_off: true }), false);
  assert.equal(loungeSceneAutoOn({ auto: true, auto_off: true }), false);
  assert.equal(loungeSceneAutoOn({ theme: 'river' }), false, 'a background the member chose before its pick was stamped');
  assert.equal(loungeSceneAutoOn({ theme: 'river', picked_at: 1795000000000 }), true, 'a stamped pick follows an explicit move');
  assert.equal(loungeSceneAutoOn({ theme: 'river', picked_at: 1795000000000, auto_off: true }), false, 'unless the member turned the follow off');
  const { readLoungeRoomBackground } = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
  assert.deepEqual(readLoungeRoomBackground({ theme: 'river', picked_at: 1795000000000 }), { theme: 'river', picked_at: 1795000000000 });
});

test('the five new places are backgrounds with images, and the scene text for the model carries the activity', () => {
  for (const id of loungePlaceBackgroundIds) {
    const theme = loungeThemes.find(item => item.id === id);
    assert.ok(theme, id); assert.match(theme.image, /^\/lounge\/.+\.webp$/);
  }
  assert.equal(follow.sceneForMatch(scene('차 안', '이동', { activity: '집에 데려다주는 중' }), '차 안').includes('집에 데려다주는 중'), true);
  assert.equal(follow.sceneForMatch(undefined, '도심 호텔 라운지'), '도심 호텔 라운지');
});

test('a call is never a place: "전화 통화 중" kept the background where it was (2026-11-17, a chat in a bar left for a bedroom)', () => {
  for (const line of ['전화 통화 중', '통화 중', '전화 중', '휴대폰 통화 중', '통화', '각자 있는 곳에서 전화 통화 중']) assert.equal(follow.stateScenePlace(scene(line, '기타')), undefined, line);
  assert.equal(follow.stateScenePlace(scene('집 침실', '집')), '집 침실');
  assert.equal(follow.stateScenePlace(scene('통화 연결음이 울리는 사무실', '회사')), '통화 연결음이 울리는 사무실', 'a real place that mentions a call is still a place');
  const kept = decide({ scene: scene('전화 통화 중', '기타'), follow: { key: '와인바', at: now - 60 * minute, place: '와인바' }, sceneTurns: 9 });
  assert.equal(kept.action, 'keep');
});

// 2026-11-18, by the owner: one place is one background; the wording of a spot in it is not a move.
const placeLib = loadTs(fileURLToPath(new URL('../src/lib/loungeScenePlace.ts', import.meta.url)));

test('a motel or a hotel the two are in is one room, however the spot in it is worded (2026-11-18)', () => {
  for (const wording of ['모텔 방', '모텔 방 안', '모텔 침대 위', '근처 모텔 방 소파', '근처 모텔', '모텔 객실 침대 곁', '모텔']) assert.equal(placeLib.canonicalScenePlace(wording), '모텔 방', wording);
  for (const wording of ['호텔 객실', '호텔 스위트', '호텔 객실 침대 위', '호텔 방']) assert.equal(placeLib.canonicalScenePlace(wording), '호텔 객실', wording);
  // Somewhere else in it, or outside it, is another place.
  for (const wording of ['호텔 로비 카페', '호텔 수영장', '호텔 연회장 복도', '모텔 주차장', '모텔 앞']) assert.notEqual(placeLib.canonicalScenePlace(wording), '호텔 객실', wording);
  assert.equal(placeLib.canonicalScenePlace('호텔 로비 카페의 낮은 소파 자리'), '호텔 로비 카페');
  assert.equal(placeLib.canonicalScenePlace('와인바 창가 자리'), '와인바');
  // 2026-11-19, by the owner: a cocktail bar in a hotel was read as the hotel's room and the scene moved. Only a room is the room.
  for (const wording of ['호텔 지하 칵테일바', '호텔 와인바', '호텔 바', '호텔 클럽', '호텔 스파', '모텔 근처 포차']) assert.equal(placeLib.canonicalScenePlace(wording), wording, wording);
  assert.equal(placeLib.canonicalScenePlace('밤의 모텔 객실'), '모텔 방');
  assert.ok(!placeLib.sameScenePlace('호텔 지하 칵테일바', '호텔 객실'));
  assert.equal(placeLib.canonicalScenePlace('와인바 앞'), '와인바 앞', 'outside is not the bar');
  assert.ok(placeLib.sameScenePlace('모텔 침대 위', '모텔 방'));
  assert.ok(!placeLib.sameScenePlace('모텔 방', '집 거실'));
  // The background does not follow a change of wording, and a name that says nothing of where is not a place.
  assert.equal(follow.sceneFollowKey(undefined, '모텔 침대 위'), follow.sceneFollowKey(undefined, '근처 모텔 방 소파'));
  assert.equal(follow.stateScenePlace({ location: '저녁의 조용한 실내' }), undefined);
  assert.equal(follow.stateScenePlace({ location: '모텔 방' }), '모텔 방');
  const was = { key: follow.sceneFollowKey(undefined, '모텔 방'), at: now - 5 * 60 * minute, place: '모텔 방' };
  assert.equal(decide({ scene: scene('모텔 침대 위', '기타'), sceneTurns: 9, follow: was }).reason, 'same', 'a long time later, still the same room');
});

test('the engine keeps one wording for one place and counts it as no move (2026-11-18)', () => {
  const base = messenger.normalizeLoungeCompanionState(null, 'room-1');
  const at = (state, location, extra = {}, turn = 2) => messenger.nextLoungeCompanionState({ state, update: { scene: { location, scene_type: '기타', activity: '', time_of_day: '밤', season: '', objects: [] } }, decision: { progress: 'stay' }, turn, reply: '답이에요 길게 쓴 답', inner: '', ...extra });
  const first = at(base, '근처 모텔 방 소파', {}, 1);
  assert.equal(first.scene.location, '모텔 방', 'a motel is named by its room');
  const second = at(first, '모텔 침대 위', {}, 2);
  assert.equal(second.scene.location, '모텔 방', 'the wording it had is kept');
  assert.equal(second.scene_turns, first.scene_turns + 1, 'the scene did not move');
  assert.equal(second.scene_change, first.scene_change, 'and nothing is noted as a change');
  const gone = at(second, '집 거실', {}, 3);
  assert.equal(gone.scene.location, '집 거실'); assert.equal(gone.scene_turns, 0);
  assert.match(messenger.loungeCompanionUpdateInstructions, /location은 방이나 건물 단위의 장소.*침대 위, 소파, 창가 자리.*activity에 쓰고.*직전 scene의 location을 표현까지 그대로/);
});

test('numbered pages of twenty, and a shared list that does not repeat itself (2026-11-18)', () => {
  const items = Array.from({ length: 45 }, (_, index) => index + 1);
  assert.deepEqual([placeLib.pageOf(items, 1).items.length, placeLib.pageOf(items, 3).items, placeLib.pageOf(items, 1).pages], [20, [41, 42, 43, 44, 45], 3]);
  assert.equal(placeLib.pageOf(items, 99).page, 3, 'a page that is not there is the last');
  assert.deepEqual(placeLib.pageOf([], 1), { items: [], pages: 1, page: 1 });
  const scenes = [{ id: 'a', name: '밤의 모텔 객실', description: '' }, { id: 'b', name: '저녁의 조용한 실내', description: '' }, { id: 'c', name: '새벽의 호텔 객실', description: '' }, { id: 'd', name: '저녁의 모텔 객실', description: '' }, { id: 'e', name: '', description: '' }, { id: 'f', name: '촛불 켜진 밤 침실', description: '' }];
  assert.deepEqual(placeLib.distinctSharedScenes(scenes).map(scene => scene.id), ['a', 'c', 'f'], 'a name that says nothing of where, and a second motel room, are left out');
  assert.equal(placeLib.isGenericPlaceName('저녁의 조용한 실내'), true);
  assert.equal(placeLib.isGenericPlaceName('호텔 로비 카페'), false);
});

test('a story that begins in a place the card cannot name opens on it: 윤지안 starts in her car', () => {
  const lounge = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
  const room = { id: 'lounge-x', host_persona: 'diplomat', theme: 'river', scenario: { id: 'diplomat-old-friend-fling' } };
  assert.equal(lounge.loungeRoomSceneTheme({ ...room, background: null }), 'car');
  // a background the member chose still wins, and other stories keep their card's theme
  assert.equal(lounge.loungeRoomSceneTheme({ ...room, background: { theme: 'cafe' } }), 'cafe');
  assert.equal(lounge.loungeRoomSceneTheme({ ...room, scenario: { id: 'poker-after-the-final' }, theme: 'hotellobby', background: null }), 'hotellobby');
});

test('a background picked by hand is not written over by a follow that began before it (2026-11-20, back to the first background)', async () => {
  const { readFileSync } = await import('node:fs');
  const api = readFileSync(new URL('../api/lounge-images.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/components/LoungePage.tsx', import.meta.url), 'utf8');
  // Both writes of the automatic follow read the room again first, and write nothing when the member has chosen since.
  const held = api.slice(api.indexOf('const heldBackground'), api.indexOf('const saveOnRoom'));
  assert.match(held, /if \(!automatic\) return/);
  assert.match(held, /select=background/);
  assert.match(held, /background\.auto_off === true \|\| \(background\.auto !== true && typeof background\.picked_at !== 'number'\)/);
  assert.match(held, /picked_at : undefined\) === pickedAt \? \{ background \} : undefined/, 'a pick made again meanwhile is not written over');
  assert.match(api, /const saveOnRoom[\s\S]{0,200}const held = await heldBackground\(\);\s*if \(!held\) return json\(\{ background: null \}\)/);
  assert.match(api, /const recordFollow[\s\S]{0,200}const held = await heldBackground\(\);\s*if \(!held\) return;\s*const kept = held\.background \?\? \{\}/);
  assert.doesNotMatch(api, /const kept = room\.background/, 'the old read at the start is not written back');
  // The page shows an answer of the follow only while the follow is still on, and a pick that could not be saved says so.
  assert.match(page, /mounted\.current && followingPlace\.current\) keepBackground\(picked\)/);
  assert.doesNotMatch(page, /not saved on the room/);
  assert.match(page, /catch \(err\) \{\s*if \(!\('scene' in picked\)\) keepBackground\(before\);\s*throw err;/);
});

test('every place the background picker shows can be picked: the last definition of choose_lounge_room_background lists them all (2026-11-20, 와인바)', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const last = readdirSync(dir).sort().filter(name => /FUNCTION public\.choose_lounge_room_background\(/.test(readFileSync(new URL(name, dir), 'utf8'))).at(-1);
  const sql = readFileSync(new URL(last, dir), 'utf8');
  const list = /NOT IN \(([^)]*)\)/.exec(sql)?.[1] ?? '';
  const missing = loungeThemes.filter(theme => !list.includes(`'${theme.id}'`)).map(theme => theme.id);
  assert.deepEqual(missing, [], `${last} does not list: ${missing.join(', ')}`);
});

test('a story starts from its own place, not the engine\'s wording of it (2026-11-28: 강무진\'s boardroom became his office)', () => {
  const storyPlace = '계약서에 서명한 날 오전, 고층 빌딩에 있는 그의 자문사 중역 회의실(협상장). 긴 월넛 테이블 위에 서명한 합의서가 놓여 있다.';
  const start = decide({ story: true, storyPlace, scene: scene('강무진의 사무실', '회사'), sceneTurns: 2, change: { turn: 1, at: now - 2 * minute, explicit: false } });
  assert.equal(start.action, 'apply'); assert.equal(start.reason, 'first');
  assert.match(start.place, /중역 회의실/);
  // once the start is set, the engine's other wording of the same room keeps it
  const set = { key: start.key, at: now - 60 * minute, place: start.place };
  assert.equal(decide({ story: true, storyPlace, scene: scene('강무진의 사무실', '회사'), sceneTurns: 9, follow: set }).reason, 'story_stays');
  // an explicit move at the start is still followed
  const moved = decide({ story: true, storyPlace, scene: scene('한남동 와인바', '바'), sceneTurns: 0, change: { turn: 3, at: now - minute, explicit: true } });
  assert.equal(moved.place, '한남동 와인바');
  // a chat that is not a story is not touched
  assert.equal(decide({ storyPlace, scene: scene('집 거실', '집') }).place, '집 거실');
});

// The last replies of 윤지안 (2026-11-27), newest first: a coffee cup and a pen in every one of them.
const jianReplies = [
  '*커피잔을 내려놓고 살짝 웃는다.* 집착이라고 하면 좀 억울하네요. *볼펜을 손끝으로 한 바퀴 돌리다가 멈춘다.* 성실한 건 기본이고요.',
  '*볼펜을 손끝에서 한 바퀴 돌리다가 입꼬리를 살짝 올린다.* 칭찬으로 들려서 고마워요. *고개를 살짝 기울인다.* *커피잔을 밀어 놓고 지수를 똑바로 본다.*',
  '*볼펜을 내려놓고 지수를 똑바로 본다.* 이혼남인 것 자체는 괜찮아요. *커피잔을 손끝으로 천천히 돌린다.*',
  '*식은 커피잔을 옆으로 밀고 팔을 테이블에 걸친다.* 오래된 얘기예요.',
];

test('the things a character\'s actions keep coming back to are found in its last replies (2026-11-28)', () => {
  const worn = messenger.loungeOverusedActions(jianReplies, { names: ['지수', '윤지안'] });
  assert.deepEqual(worn.slice(0, 2).sort(), ['볼펜', '커피잔']);
  assert.ok(worn.includes('손끝'), 'the same hand on the cup and the pen');
  assert.ok(!worn.includes('지수'), 'the member\'s name is not a gesture');
  assert.ok(!worn.includes('고개'), 'once in three is not worn out');
  // what the member just brought up themselves is theirs to bring up
  assert.ok(!messenger.loungeOverusedActions(jianReplies, { userText: '커피 한 잔 더 하실래요? 그 커피잔 비었네요' }).includes('커피잔'));
  // a glass and a coffee glass are one thing; the dialogue outside the stars is not read
  assert.deepEqual(messenger.loungeOverusedActions(['*잔을 내려놓는다.* 볼펜은 왜요?', '*커피잔을 든다.* 볼펜을 주세요.']), ['커피잔']);
  assert.deepEqual(messenger.loungeOverusedActions([]), []);
});

test('the reply is told the worn-out actions, and the scene no longer offers those objects', () => {
  const state = messenger.normalizeLoungeCompanionState({ room_id: 'r1', scene: { location: '신문사 사옥 옥상 정원', scene_type: '기타', activity: '마주 앉아 이야기', time_of_day: '오후', season: '', objects: ['기획 기사', '포럼 발표문', '커피잔', '사원증', '볼펜'] } }, 'r1');
  const turn = messenger.loungeTurnConditions({ state, turn: 21, decision: { progress: 'stay' }, innerVoice: 'off', userText: '최근 연애는요?', recentReplies: jianReplies, names: ['지수'] });
  assert.ok(turn.overused_actions.includes('커피잔') && turn.overused_actions.includes('볼펜'));
  assert.deepEqual(turn.scene.objects, ['기획 기사', '포럼 발표문', '사원증']);
  const fresh = messenger.loungeTurnConditions({ state, turn: 2, decision: { progress: 'stay' }, innerVoice: 'off', recentReplies: ['*발표문을 넘긴다.* 왔어요?'] });
  assert.equal(fresh.overused_actions, undefined);
  assert.equal(fresh.scene.objects.length, 5);
  assert.match(messenger.loungeCompanionRules({ innerVoice: 'off' }), /turn\.overused_actions/);
});
