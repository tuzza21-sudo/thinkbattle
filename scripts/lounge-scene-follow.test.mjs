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

test('a background the member chose is never touched', () => {
  assert.deepEqual(decide({ manual: true, scene: scene('집 거실', '집') }), { action: 'keep', reason: 'manual' });
});

test('the same place changes nothing, however many replies ask', () => {
  const s = scene('집 거실', '집');
  const key = follow.sceneFollowKey(s, '집 거실');
  assert.equal(decide({ scene: s, follow: { key, at: now - 60 * minute, place: '집 거실' } }).reason, 'same');
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
  const settled = decide({ scene: next, sceneTurns: 5, follow: was(30) });
  assert.equal(settled.action, 'apply'); assert.equal(settled.reason, 'moved');
  assert.equal(decide({ scene: next, sceneTurns: 5, change: { turn: 3, at: now - 3 * minute, explicit: false }, follow: was(5) }).action, 'keep');
});

test('a place on the way is left at once: the corridor gives way to the room, other places still wait', () => {
  const corridor = { key: follow.sceneFollowKey(scene('호텔 복도', '이동'), '호텔 복도'), at: now - 2 * minute, place: '호텔 복도' };
  const room = scene('호텔 객실', '집');
  assert.equal(follow.onTheWay(corridor), true);
  assert.equal(follow.onTheWay({ key: '집|호텔객실', at: 0, place: '호텔 객실' }), false);
  assert.equal(follow.onTheWay({ key: '기타|엘리베이터앞', at: 0, place: '엘리베이터 앞' }), true);
  const arrived = decide({ scene: room, sceneTurns: 0, follow: corridor });
  assert.equal(arrived.action, 'apply'); assert.equal(arrived.reason, 'moved'); assert.equal(arrived.place, '호텔 객실');
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
  assert.equal(loungeSceneAutoOn({ theme: 'river' }), false, 'a background the member chose');
});

test('the five new places are backgrounds with images, and the scene text for the model carries the activity', () => {
  for (const id of loungePlaceBackgroundIds) {
    const theme = loungeThemes.find(item => item.id === id);
    assert.ok(theme, id); assert.match(theme.image, /^\/lounge\/.+\.webp$/);
  }
  assert.equal(follow.sceneForMatch(scene('차 안', '이동', { activity: '집에 데려다주는 중' }), '차 안').includes('집에 데려다주는 중'), true);
  assert.equal(follow.sceneForMatch(undefined, '도심 호텔 라운지'), '도심 호텔 라운지');
});
