import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const relationship = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const { selectMemoriesForPrompt, normalizeMemoryOps, previousSessionSummary, isSensitiveMemory, memoriesForView, longMemoryInstructions, memoryOpsSchema, relationshipConfigs, memorySettings, openingFollowUp } = relationship;
const now = new Date('2026-10-08T12:00:00Z');
const daysAgo = n => new Date(now.getTime() - n * 86_400_000).toISOString();
const row = (id, kind, summary, extra = {}) => ({ id, character_id: 'velvet', kind, summary, follow_up: null, importance: 0.7, status: 'active', mention_count: 1, updated_at: daysAgo(1), last_confirmed_at: daysAgo(1), ...extra });

test('the prompt gets at most six memories of this character, open threads first, nothing superseded', () => {
  const rows = [
    row('a', 'project', 'AI 음성 대화 앱을 만들고 있다', { importance: 0.9 }),
    row('b', 'open_thread', '다음 주까지 고객 3명을 인터뷰하기로 했다', { follow_up: '인터뷰 결과', updated_at: daysAgo(2) }),
    row('c', 'open_thread', '금요일에 연봉 협상이 있다', { follow_up: '협상 결과', updated_at: daysAgo(0.5) }),
    row('d', 'decision', '회사를 그만두기로 했다', { status: 'superseded' }),
    row('e', 'preference', '구체적인 실행안을 좋아한다', { importance: 0.6 }),
    row('f', 'event', '첫 고객을 얻었다', { character_id: 'ina' }),
    ...Array.from({ length: 6 }, (_, i) => row(`x${i}`, 'event', `작은 일 ${i}`, { importance: 0.5, last_confirmed_at: daysAgo(60) })),
  ];
  const { forPrompt, refs } = selectMemoriesForPrompt(rows, 'velvet', now);
  assert.equal(forPrompt.length, memorySettings.promptLimit);
  assert.deepEqual(forPrompt.slice(0, 2).map(item => item.kind), ['open_thread', 'open_thread']);
  assert.equal(forPrompt[0].summary, '금요일에 연봉 협상이 있다', 'the newest open thread comes first');
  assert.equal(forPrompt[0].follow_up, '협상 결과');
  assert.equal(forPrompt[2].summary, 'AI 음성 대화 앱을 만들고 있다', 'then the most important');
  assert.ok(!forPrompt.some(item => item.summary.includes('그만두기로')), 'superseded memories are never shown');
  assert.ok(!forPrompt.some(item => item.summary.includes('첫 고객')), "another character's memories are never shown");
  assert.deepEqual(forPrompt.map(item => item.ref), ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  assert.equal(refs.get('m1'), 'c');
  assert.ok(forPrompt.every(item => !('id' in item) && !('importance' in item)), 'database ids and scores stay on the server');
});

test('model proposals become safe operations', () => {
  const shown = [row('uuid-1', 'project', '사용자는 AI 음성대화 서비스를 개발하고 있다.'), row('uuid-2', 'open_thread', '고객 3명 인터뷰', { follow_up: '인터뷰 결과' })];
  const refs = new Map([['m1', 'uuid-1'], ['m2', 'uuid-2']]);
  const ops = normalizeMemoryOps([
    { op: 'add', ref: '', kind: 'decision', summary: '사용자는 당분간 회사를 계속 다니기로 했다.', importance: 0.8, follow_up: '' },
    { op: 'add', ref: '', kind: 'event', summary: '오늘 점심을 먹었다.', importance: 0.2, follow_up: '' },
    { op: 'add', ref: '', kind: 'event', summary: '사용자는 우울증 진단을 받았다.', importance: 0.9, follow_up: '' },
    { op: 'close', ref: 'm2', kind: '', summary: '', importance: 0, follow_up: '' },
    { op: 'update', ref: 'm9', kind: '', summary: '없는 기억', importance: 0.7, follow_up: '' },
  ], refs, shown);
  assert.deepEqual(ops, [
    { op: 'add', kind: 'decision', summary: '사용자는 당분간 회사를 계속 다니기로 했다.', importance: 0.8 },
    { op: 'close', id: 'uuid-2' },
  ], 'low importance, sensitive and unknown targets are dropped');
});

test('a repeated fact updates the shown memory instead of creating a duplicate, and limits hold', () => {
  const shown = [row('uuid-1', 'project', '사용자는 AI 음성대화 서비스를 개발하고 있다.')];
  const refs = new Map([['m1', 'uuid-1']]);
  assert.deepEqual(normalizeMemoryOps([{ op: 'add', ref: '', kind: 'project', summary: '사용자는 AI 음성 대화 서비스를 만들고 있다.', importance: 0.8, follow_up: '' }], refs, shown),
    [{ op: 'update', id: 'uuid-1', summary: '사용자는 AI 음성 대화 서비스를 만들고 있다.', importance: 0.8 }]);
  const many = ['첫 고객을 얻었다', '투자 미팅을 잡았다', '팀원을 한 명 뽑았다', '웹사이트를 열었다', '가격을 정했다', '시제품을 완성했다']
    .map(summary => ({ op: 'add', ref: '', kind: 'event', summary, importance: 0.7, follow_up: '' }));
  assert.equal(normalizeMemoryOps(many, refs, shown).length, memorySettings.maxOpsPerTurn);
  assert.deepEqual(normalizeMemoryOps([{ op: 'add', ref: '', kind: 'open_thread', summary: '금요일 협상', importance: 0.8, follow_up: '' }], refs, shown), [], 'an open thread needs something to follow up');
  assert.deepEqual(normalizeMemoryOps([{ op: 'supersede', ref: 'm1', kind: '', summary: '', importance: 0.8, follow_up: '' }], refs, shown), [], 'a replacement needs the new fact');
  assert.deepEqual(normalizeMemoryOps('not a list', refs, shown), []);
  assert.deepEqual(normalizeMemoryOps([{ op: 'supersede', ref: 'm1', kind: 'decision', summary: '앱 개발을 접었다', importance: 0.8, follow_up: '' }, { op: 'close', ref: 'm1' }], refs, shown),
    [{ op: 'supersede', id: 'uuid-1', kind: 'decision', summary: '앱 개발을 접었다', importance: 0.8 }], 'one operation per memory per turn');
});

test('sensitive topics are never stored', () => {
  for (const text of ['우울증 진단을 받았다', '요즘 죽고 싶다고 했다', '교회에 다닌다', '지지하는 후보가 있다', '전화번호는 010', '계좌 번호를 알려 줬다', '병원에 입원했다', '동성애자라고 밝혔다'])
    assert.ok(isSensitiveMemory(text), text);
  for (const text of ['AI 음성 대화 앱을 만들고 있다', '다음 주에 고객 인터뷰를 한다', '연봉 협상을 준비 중이다', '구체적인 실행안을 좋아한다'])
    assert.ok(!isSensitiveMemory(text), text);
  assert.match(longMemoryInstructions, /건강·질병·정신건강[^.]*memory_ops에 쓰지 않는다/);
});

test('the previous conversation with the same character is offered only at the start of a new room', () => {
  const rooms = [
    { host_persona: 'ina', memory: '공감형과 나눈 이야기', created_at: daysAgo(1) },
    { host_persona: 'velvet', memory: '', created_at: daysAgo(2) },
    { host_persona: 'velvet', memory: '사용자는 사업 계획을 이야기했고 고객 인터뷰를 하기로 했다.', created_at: daysAgo(3) },
  ];
  assert.deepEqual(previousSessionSummary(rooms, 'velvet', 1, now), { summary: '사용자는 사업 계획을 이야기했고 고객 인터뷰를 하기로 했다.', days_ago: 3 });
  assert.equal(previousSessionSummary(rooms, 'velvet', memorySettings.previousSessionTurns + 1, now), undefined, 'later turns rely on the room itself');
  assert.equal(previousSessionSummary(rooms, 'auditor', 1, now), undefined, 'no other character’s conversation');
});

test('a new conversation opens with the most important unfinished story, the oldest among equals', () => {
  const rows = [
    row('a', 'open_thread', '금요일에 연봉 협상이 있다', { follow_up: '협상 결과', created_at: daysAgo(1) }),
    row('b', 'open_thread', '고객 3명을 인터뷰하기로 했다', { follow_up: '인터뷰 결과', created_at: daysAgo(5) }),
    row('c', 'project', 'AI 음성 대화 앱을 만들고 있다', { importance: 0.9 }),
  ];
  const { forPrompt, chosen } = selectMemoriesForPrompt(rows, 'velvet', now);
  assert.equal(openingFollowUp(forPrompt, chosen).follow_up, '인터뷰 결과');
  rows[0].importance = 0.8;
  const again = selectMemoriesForPrompt(rows, 'velvet', now);
  assert.deepEqual(openingFollowUp(again.forPrompt, again.chosen), { ref: 'm1', summary: '금요일에 연봉 협상이 있다', follow_up: '협상 결과' });
  const none = selectMemoriesForPrompt([rows[2]], 'velvet', now);
  assert.equal(openingFollowUp(none.forPrompt, none.chosen), undefined);
  assert.match(longMemoryInstructions, /opening_follow_up이 있으면[^.]*방 주제 질문 대신/);
});

test('the user view lists open threads first and only this character', () => {
  const view = memoriesForView([row('a', 'project', '앱 개발', { importance: 0.9 }), row('b', 'open_thread', '인터뷰', { importance: 0.6 }), row('c', 'event', '다른 캐릭터', { character_id: 'ina' })], 'velvet');
  assert.deepEqual(view.map(item => item.id), ['b', 'a']);
});

test('every character says how it uses memories, and the rules forbid inventing a past', () => {
  for (const config of Object.values(relationshipConfigs)) assert.ok(config.memoryStyle && config.memoryStyle.length > 10, config.characterId);
  assert.notEqual(relationshipConfigs.velvet.memoryStyle, relationshipConfigs.ina.memoryStyle);
  assert.match(longMemoryInstructions, /없는 과거는 지어내지 않으며/);
  assert.match(longMemoryInstructions, /지금 사용자의 말이 기억과 다르면 지금 말을 따른다/);
  assert.match(longMemoryInstructions, /reason=opening/);
  assert.deepEqual(memoryOpsSchema.items.required, ['op', 'ref', 'kind', 'summary', 'importance', 'follow_up']);
});
