import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './lounge-ts-loader.mjs';

const m = loadTs('src/lib/loungeMessenger.ts');
const empty = () => m.normalizeLoungeCompanionState(null, 'room-1');
const next = (state, turn, reply, updates, userText = '') => m.nextLoungeCompanionState({ state, turn, reply, inner: '', userText, decision: { progress: 'stay' }, update: updates === undefined ? undefined : { self_story_updates: updates } });
const dinner = { id: '', summary: '이번 주말 친구들에게 직접 저녁을 해 주기로 했다.', meaning: '평소 자신 있는 요리를 함께 즐길 생각에 기대된다.', status: 'ongoing', evidence: '이번 주말엔 친구들을 불러서 저녁을 해 주기로 했어요.' };

test('a newly generated own story and its meaning survive serialization and reach the next reply', () => {
  const written = next(empty(), 1, `기분이 좋네요. ${dinner.evidence} 메뉴 고르는 중이에요.`, [dinner]);
  assert.equal(written.self_stories.length, 1);
  assert.equal(written.self_stories[0].status, 'ongoing');
  const restored = m.normalizeLoungeCompanionState(JSON.parse(JSON.stringify(written)), 'room-1');
  const turn = m.loungeTurnConditions({ state: restored, turn: 2, decision: { progress: 'stay' }, innerVoice: 'on', userText: '그 저녁 준비는 어때요?' });
  assert.equal(turn.self_stories[0].summary, dinner.summary);
  assert.equal(turn.self_stories[0].meaning, dinner.meaning);
  assert.equal(turn.self_stories[0].id, written.self_stories[0].id);
});

test('an ongoing self story is updated and completed under the same id', () => {
  const initial = next(empty(), 1, dinner.evidence, [dinner]);
  const evidence = '친구들이 다 맛있게 먹고 갔어요. 다음엔 파스타도 해 달라네요.';
  const updated = next(initial, 2, evidence, [{ id: initial.self_stories[0].id, summary: '친구들에게 저녁을 해 줬고 다음 요리도 부탁받았다.', meaning: '함께 먹는 재미를 다시 느껴 뿌듯하다.', status: 'resolved', evidence }]);
  assert.equal(updated.self_stories.length, 1);
  assert.equal(updated.self_stories[0].id, initial.self_stories[0].id);
  assert.equal(updated.self_stories[0].status, 'resolved');
  assert.match(updated.self_stories[0].summary, /다음 요리/);
});

test('the recorder cannot create an unspoken anecdote or turn the user quote into character history', () => {
  const user = '저는 지난주에 친구들을 불러서 파스타를 해 줬어요.';
  assert.equal(next(empty(), 1, '저도 요리 좋아해요.', [dinner]).self_stories, undefined);
  const echoed = { ...dinner, evidence: user, summary: '지난주 친구들에게 파스타를 해 줬다.' };
  assert.equal(next(empty(), 1, `말씀하신 ${user} 그 시간이 즐거웠겠어요.`, [echoed], user).self_stories, undefined);
  assert.equal(next(empty(), 1, '좋아요.', [{ ...dinner, evidence: '좋아요.' }]).self_stories, undefined);
});

test('unknown ids and malformed statuses do not rewrite a known story', () => {
  const initial = next(empty(), 1, dinner.evidence, [dinner]);
  const evidence = '이번에는 저녁 대신 산책을 하기로 했어요.';
  const result = next(initial, 2, evidence, [{ ...dinner, id: 'missing', evidence }, { ...dinner, status: 'made-up', evidence }]);
  assert.deepEqual(result.self_stories, initial.self_stories);
});

test('failed recording, empty updates and delayed older turns preserve established own stories', () => {
  const initial = next(empty(), 4, dinner.evidence, [dinner]);
  assert.deepEqual(next(initial, 5, '오늘은 조용히 쉬었어요.', undefined).self_stories, initial.self_stories);
  assert.deepEqual(next(initial, 5, '오늘은 조용히 쉬었어요.', []).self_stories, initial.self_stories);
  assert.equal(next(initial, 3, '이전 대답이에요.', [dinner]), initial);
});

test('repeated records are merged and storage and prompt context stay bounded', () => {
  let state = next(empty(), 1, dinner.evidence, [dinner]);
  state = next(state, 2, dinner.evidence, [dinner]);
  assert.equal(state.self_stories.length, 1);
  for (let turn = 3; turn < 61; turn++) {
    const evidence = `오늘은 기록 번호 ${turn}에 관한 이야기를 해 두려고요.`;
    state = next(state, turn, evidence, [{ id: '', summary: `과거 경험 ${turn}`, meaning: '', status: 'past', evidence }]);
  }
  assert.equal(state.self_stories.length, 48);
  assert.equal(m.loungeSelfStoriesForPrompt(state.self_stories).length, 4);
  assert.ok(m.loungeSelfStoriesForRecorder(state.self_stories).length <= 12);
});

test('writer-authored current feeling, body and purpose survive while older recorders cannot erase them', () => {
  const character_life = { feeling: '즐겁다', body: '테니스 뒤 어깨가 뻐근하다', attention: '주말 식사 준비', want: '오늘은 느긋하게 이야기하고 싶다', cause: '운동을 마치고 쉬는 중' };
  const state = m.nextLoungeCompanionState({ state: empty(), update: { character_life }, decision: { progress: 'stay' }, turn: 1, reply: '오늘은 좀 느긋하게 있고 싶어요.', inner: '', now: Date.UTC(2026, 10, 16) });
  const restored = m.normalizeLoungeCompanionState(JSON.parse(JSON.stringify(state)), 'room-1');
  const conditions = m.loungeTurnConditions({ state: restored, turn: 2, decision: { progress: 'stay' }, innerVoice: 'off' });
  assert.equal(conditions.character_life.body, character_life.body);
  assert.equal(conditions.character_life.recorded_at, '2026-11-16T00:00:00.000Z');
  assert.deepEqual(next(restored, 2, '계속 이야기해요.', []).character_life, state.character_life);
  assert.equal(m.normalizeLoungeCompanionState(state, 'new-room').character_life, undefined);
});

test('a carried wish to obtain an answer does not return through the new living-state field', () => {
  const life = m.normalizeLoungeCharacterLife({ feeling: '편하다', want: '휴가 때 어디에 가는지 듣고 싶다' });
  assert.equal(m.loungeCharacterLifeForPrompt(life).want, '');
  const own = m.normalizeLoungeCharacterLife({ want: '내가 좋아하는 식당을 제안하기', body: '배가 고프다' });
  assert.equal(m.loungeCharacterLifeForPrompt(own).want, own.want);
  assert.equal(m.loungeCharacterLifeForPrompt(own, true).want, '');
  assert.equal(m.loungeCharacterLifeForPrompt(own, true).body, own.body);
});

test('topic-relevant older experience outranks unrelated ongoing work and contains no evidence bookkeeping', () => {
  const stories = Array.from({ length: 6 }, (_, index) => ({ id: `s${index}`, summary: index === 0 ? '부산에서 생선을 구워 친구와 먹었던 여행' : `마감 준비 ${index}`, meaning: '', status: index === 0 ? 'past' : 'ongoing', evidence: '저장용 원문', turn: index + 1 }));
  const selected = m.loungeSelfStoriesForPrompt(stories, '그때 부산에서 먹었던 생선 이야기가 기억나요.');
  assert.equal(selected[0].id, 's0');
  assert.equal('evidence' in selected[0], false);
});

test('a fresh-start room resets generated stories and legacy rooms need no authored seeds', () => {
  const initial = next(empty(), 1, dinner.evidence, [dinner]);
  assert.equal(m.normalizeLoungeCompanionState(initial, 'room-2').self_stories, undefined);
  assert.equal(empty().self_stories, undefined);
  assert.equal(m.loungeTurnConditions({ state: empty(), turn: 1, decision: { progress: 'stay' }, innerVoice: 'off' }).self_stories, undefined);
});
