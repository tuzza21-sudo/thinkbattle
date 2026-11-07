import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
const load = path => loadTs(fileURLToPath(new URL(path, import.meta.url)));
const m = load('../src/lib/loungeMessenger.ts');
const turns = load('../src/lib/loungeTurnPersistence.ts');
const relationship = load('../src/lib/relationship/index.ts');
const config = relationship.getRelationshipConfig('auditor');
const op = (extra = {}) => ({ op: 'add', ref: '', kind: 'agreement', summary: '서로 반말하기로 합의했다', human_quote: '우리 반말하자', character_quote: '좋아. 반말하자.', speech_level: 'casual', ...extra });

test('the latest full user utterance reaches every reader, including its middle and conclusion', () => {
  const latest = `${'앞'.repeat(480)} 이건 농담이 아니라 진짜 서운해서 묻는 거예요. ${'뒤'.repeat(480)}`;
  const messages = [{ kind: 'host', text: 'x'.repeat(900) }, { kind: 'human', text: latest }];
  const analysis = m.loungeAnalyzerInput({ character: '서도현', memory: '', messages });
  const direction = m.loungeDirectorInput({ memory: '', messages });
  assert.equal(analysis.latest, latest); assert.equal(direction.latest, latest);
  assert.deepEqual(analysis.recent, direction.recent);
  assert.equal(analysis.recent[0].text.length, 600);
});
test('one intent controls the request and a genuine refusal overrides a contradictory playful direction', () => {
  const result = m.readLoungeTurnAnalysis({ subtext: '실제로 불편해한다', request: '그만하기', is_sincere_refusal: true,
    direction: { request: '더 장난치기', quote: '', reaction: '놀리기', goal: '계속 압박하기' } });
  assert.equal(result.direction.request, result.analysis.request);
  assert.equal(result.direction.reaction, '진지하게 듣기');
  assert.match(result.direction.goal, /압박을 멈추고/);
});
test('agreements require evidence from both speakers; fabricated evidence never enters memory', () => {
  assert.deepEqual(m.applyLoungeRoomMemory([op({ character_quote: '' })], [], 1, '우리 반말하자', '글쎄요'), []);
  assert.deepEqual(m.applyLoungeRoomMemory([op()], [], 1, '오늘은 날씨 좋네요', '네'), []);
  const saved = m.applyLoungeRoomMemory([op()], [], 1, '우리 반말하자', '좋아. 반말하자.');
  assert.equal(saved[0].speech_level, 'casual');
  assert.equal(m.loungeRoomSpeechLevel({ room_memory: saved }), 'casual');
  const next = m.applyLoungeRoomMemory([op({ summary: '서로 존댓말을 쓰기로 다시 합의했다', human_quote: '이제 존댓말로 해요', character_quote: '좋아요. 존댓말로 할게요.', speech_level: 'polite' })], saved, 2, '이제 존댓말로 해요', '좋아요. 존댓말로 할게요.');
  assert.equal(m.loungeRoomSpeechLevel({ room_memory: next }), 'polite');
  assert.equal(next.filter(item => item.status === 'active' && item.speech_level).length, 1);
});
test('an earlier proposal may be accepted now, and a resolved hurt feeling keeps the agreement', () => {
  const agreement = m.applyLoungeRoomMemory([op()], [], 2, '좋아요', '좋아. 반말하자.', [{ kind: 'human', text: '우리 반말하자' }]);
  assert.equal(agreement.length, 1);
  const feeling = m.applyLoungeRoomMemory([op({ kind: 'feeling', summary: '사용자는 약속을 잊은 일 때문에 서운했다', human_quote: '약속을 잊어서 서운했어요', character_quote: '', speech_level: '' })], agreement, 3, '약속을 잊어서 서운했어요', '미안해요');
  const ref = feeling.find(item => item.kind === 'feeling').id;
  const resolved = m.applyLoungeRoomMemory([op({ op: 'resolve', ref, kind: 'feeling', summary: '그 일은 풀렸다', human_quote: '이제 괜찮아요', character_quote: '', speech_level: '' })], feeling, 4, '이제 괜찮아요', '고마워요');
  assert.equal(resolved.find(item => item.id === ref).status, 'resolved');
  assert.equal(m.loungeRoomSpeechLevel({ room_memory: resolved }), 'casual');
});
test('a stale or repeated state update cannot undo a newer agreement, and a new chat starts empty', () => {
  const base = m.normalizeLoungeCompanionState(null, 'room');
  const newer = m.nextLoungeCompanionState({ state: base, turn: 4, decision: { progress: 'stay' }, reply: '좋아. 반말하자.', inner: '', userText: '우리 반말하자', update: { room_memory_ops: [op()] } });
  const stale = m.nextLoungeCompanionState({ state: newer, turn: 3, decision: { progress: 'stay' }, reply: '존댓말', inner: '', update: { room_memory_ops: [] } });
  assert.equal(stale, newer);
  assert.deepEqual(m.normalizeLoungeCompanionState(newer, 'new-room').room_memory, []);
  assert.equal(m.normalizeLoungeCompanionState(newer, 'room').room_memory[0].speech_level, 'casual');
});

test('the durable drain preserves event order, retries CAS conflicts, and never skips a pending predecessor', async () => {
  const timestamp = '2026-11-06T00:00:00Z';
  const jobs = [1, 3].map(turn => ({ room_id: 'room', turn, user_text: '솔직하게 이야기할게요', reply: '듣고 있어요', status: turn === 1 ? 'pending' : 'ready', created_at: timestamp, updated_at: timestamp,
    payload: { answer: { memory: `요약 ${turn}`, events: [{ type: 'SHARES_FEELING', confidence: 0.9, note: '마음을 털어놓음' }] } } }));
  let snapshot = { relationship: null, state: null, stateVersion: 0, mood: config.initialMood };
  const applied = []; let conflict = true;
  const store = {
    pending: async () => structuredClone(jobs.filter(job => job.status !== 'applied').reverse()),
    snapshot: async () => structuredClone(snapshot),
    commit: async value => {
      if (conflict) { conflict = false; return 'conflict'; }
      const job = jobs.find(job => job.turn === value.turn);
      if (job.status === 'applied') return 'applied';
      assert.equal(value.stateVersion, snapshot.stateVersion);
      applied.push(value.turn); job.status = 'applied';
      const r = value.relationship;
      snapshot = { state: value.state, stateVersion: snapshot.stateVersion + 1, mood: value.mood,
        relationship: { user_id: 'user', character_id: 'auditor', scores: r.scores, stage: r.stage, pending: r.pending,
          recent_events: r.recentEvents, memories: r.memories, meaningful_turns: r.meaningfulTurns, turn_count: r.turnCount,
          last_interaction_at: r.lastInteractionAt, version: (snapshot.relationship?.version ?? 0) + 1 } };
      return 'saved';
    },
  };
  await turns.drainLoungeTurns('room', config, store);
  assert.deepEqual(applied, []);
  jobs[0].status = 'ready';
  await turns.drainLoungeTurns('room', config, store);
  assert.deepEqual(applied, [1, 3]);
  assert.equal(snapshot.relationship.turn_count, 2);
  await turns.drainLoungeTurns('room', config, store);
  assert.deepEqual(applied, [1, 3]);
  assert.equal(snapshot.state.source_turn, 3);
});
test('only a stale pending recording is retried; a fresh in-flight recording stays pending', async () => {
  let recovered = 0;
  const job = { turn: 1, status: 'pending', updated_at: new Date(1000).toISOString() };
  const store = { pending: async () => [job], snapshot: async () => { throw new Error('must not commit'); }, commit: async () => 'saved',
    recover: async () => { recovered++; return false; } };
  await turns.drainLoungeTurns('room', config, store, 2000); assert.equal(recovered, 0);
  await turns.drainLoungeTurns('room', config, store, 62_000); assert.equal(recovered, 1);
});
test('an opening without a new user utterance cannot manufacture persistent user memories', () => {
  const result = turns.reduceLoungeTurn('room', config, { relationship: null, state: null, stateVersion: 0, mood: {} }, {
    room_id: 'room', turn: 1, user_text: '', reply: '안녕하세요', status: 'ready', created_at: '2026-11-06T00:00:00Z',
    payload: { answer: { memory_ops: [{ op: 'add', kind: 'preference', summary: '사용자는 바다를 좋아한다', importance: 0.9 }] } },
  });
  assert.deepEqual(result.commit.memoryOps, []);
});
test('a recording that keeps failing is closed after the store gives it up, so the later turns go on', async () => {
  const jobs = [{ turn: 1, status: 'pending', updated_at: new Date(0).toISOString(), reply: 'a', user_text: 'b', created_at: '2026-11-06T00:00:00Z', payload: {} },
    { turn: 2, status: 'ready', updated_at: new Date(0).toISOString(), reply: 'c', user_text: 'd', created_at: '2026-11-06T00:00:01Z', payload: { answer: { memory: '요약' } } }];
  let failures = 0; const applied = [];
  const store = {
    pending: async () => structuredClone(jobs.filter(job => job.status !== 'applied')),
    snapshot: async () => ({ relationship: null, state: null, stateVersion: 0, mood: config.initialMood }),
    commit: async value => { applied.push(value.turn); jobs.find(job => job.turn === value.turn).status = 'applied'; return 'saved'; },
    recover: async () => 'failed',
    fail: async job => { failures++; if (failures < 3) return false; jobs.find(item => item.turn === job.turn).status = 'applied'; return true; },
  };
  await turns.drainLoungeTurns('room', config, store, 120_000); assert.deepEqual(applied, []);
  await turns.drainLoungeTurns('room', config, store, 120_000); assert.deepEqual(applied, []);
  await turns.drainLoungeTurns('room', config, store, 120_000);
  assert.equal(failures, 3); assert.deepEqual(applied, [2], 'turn 1 was given up and turn 2 was applied');
});
test('a commit that throws is counted against its turn instead of failing every response forever', async () => {
  const job = { turn: 1, status: 'ready', updated_at: new Date(0).toISOString(), reply: 'a', user_text: 'b', created_at: '2026-11-06T00:00:00Z', payload: {} };
  let failed = 0;
  const store = { pending: async () => [job], snapshot: async () => ({ relationship: null, state: null, stateVersion: 0, mood: config.initialMood }),
    commit: async () => { throw new Error('invalid companion state'); }, fail: async () => { failed++; return false; } };
  await assert.rejects(turns.drainLoungeTurns('room', config, store), /invalid companion state/);
  assert.equal(failed, 1);
});
test('the room record takes only agreements and feelings, sends only what is active, and holds ten', () => {
  // A promise or a plain fact is not recorded here (long-term memory and the room summary keep them).
  assert.deepEqual(m.applyLoungeRoomMemory([op({ kind: 'promise', summary: '내일 같이 영화를 보기로 했다' })], [], 1, '우리 반말하자', '좋아. 반말하자.'), []);
  assert.deepEqual(m.applyLoungeRoomMemory([op({ kind: 'fact', summary: '둘이 해변에 갔다' })], [], 1, '우리 반말하자', '좋아. 반말하자.'), []);
  // What was stored before stays readable, but is not sent to the models.
  const stored = [{ id: 'a', kind: 'promise', summary: '예전 약속', status: 'active', human_quote: '', character_quote: '', turn: 1 },
    { id: 'b', kind: 'agreement', summary: '반말', status: 'active', human_quote: '', character_quote: '', turn: 2, speech_level: 'casual' },
    { id: 'c', kind: 'feeling', summary: '풀린 서운함', status: 'resolved', human_quote: '', character_quote: '', turn: 3 }];
  assert.deepEqual(m.loungeRoomMemoryForPrompt(stored).map(item => item.ref), ['b']);
  assert.equal('status' in m.loungeRoomMemoryForPrompt(stored)[0], false);
  // Ten at most; the old and the resolved ones go first, an active agreement last.
  let record = m.applyLoungeRoomMemory([op()], [], 1, '우리 반말하자', '좋아. 반말하자.');
  for (let turn = 2; turn <= 14; turn++) {
    record = m.applyLoungeRoomMemory([op({ kind: 'feeling', summary: `서운함 ${turn}`, human_quote: `서운해요 ${turn}`, character_quote: '', speech_level: '' })], record, turn, `서운해요 ${turn}`, '미안해요');
  }
  assert.equal(record.length, 10);
  assert.equal(m.loungeRoomSpeechLevel({ room_memory: record }), 'casual', 'the agreement outlives newer feelings');
  assert.equal(record.some(item => item.summary === '서운함 14'), true);
});
