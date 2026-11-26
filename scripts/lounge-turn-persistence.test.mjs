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

test('durable jobs keep writer-authored living context through recorder recovery and ordered state updates', () => {
  const character_life = { feeling: '마음이 가볍다', body: '운동 후 허기가 있다', attention: '친구들과 먹을 저녁 준비', want: '자기 이야기를 편하게 나누기', cause: '주말을 시작했다' };
  const job = { room_id: 'room', turn: 1, user_text: '안녕하세요.', reply: '반가워요.', status: 'ready', payload: { companion: true, character_life, answer: { memory: '지금 장면: 카페' } }, created_at: '2026-11-16T00:00:00Z', updated_at: '2026-11-16T00:00:00Z' };
  const { commit } = turns.reduceLoungeTurn('room', undefined, { relationship: null, state: null, stateVersion: 0, mood: {} }, job);
  assert.equal(commit.state.character_life.body, character_life.body);
  assert.equal(commit.state.character_life.recorded_at, '2026-11-16T00:00:00.000Z');
});

test('the latest full user utterance reaches every reader, including its middle and conclusion', () => {
  const latest = `${'앞'.repeat(480)} 이건 농담이 아니라 진짜 서운해서 묻는 거예요. ${'뒤'.repeat(480)}`;
  const messages = [{ kind: 'host', text: 'x'.repeat(900) }, { kind: 'human', text: latest }];
  const analysis = m.loungeAnalyzerInput({ character: '서도현', memory: '', messages });
  const direction = m.loungeDirectorInput({ memory: '', messages });
  assert.equal(analysis.latest, latest); assert.equal(direction.latest, latest);
  assert.deepEqual(analysis.recent, direction.recent);
  assert.equal(analysis.recent[0].text, messages[0].text, 'a recent anecdote keeps its middle as well as the latest user utterance');
  const older = m.loungeTurnMessages([{ kind: 'host', text: 'x'.repeat(1500) }, ...Array.from({ length: 6 }, (_, index) => ({ kind: index % 2 ? 'host' : 'human', text: '다음 이야기' }))]);
  assert.equal(older.recent[0].text.length, 1000, 'older messages are still bounded');
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

test('a chat saves through the durable turn store: a beta account starts at the closest stage there, and adult mode there does not score crossing a line (2026-11-17)', () => {
  const teacher = relationship.getRelationshipConfig('teacher');
  const stages = teacher.stages.filter(stage => stage.enabled !== false);
  const job = (payload, events = []) => ({ room_id: 'room', turn: 1, user_text: '안녕하세요.', reply: '반가워요.', status: 'ready', payload: { companion: true, answer: { memory: '', events }, ...payload }, created_at: '2026-11-17T00:00:00.000Z', updated_at: '2026-11-17T00:00:00.000Z' });
  const snapshot = { relationship: null, state: null, stateVersion: 0, mood: {} };
  const first = turns.reduceLoungeTurn('room', teacher, snapshot, job({ closestStart: true }));
  assert.equal(first.commit.relationship.stage, stages[3].id, 'the first turn of a new chat of adult05 is saved at the closest stage');
  assert.equal(first.commit.relationshipVersion, 0, 'a new row');
  const other = turns.reduceLoungeTurn('room', teacher, snapshot, job({}));
  assert.equal(other.commit.relationship.stage, stages[0].id, 'any other account starts at the first stage');
  // A stored row is the member's own, whatever the flag says.
  const row = { user_id: 'u', character_id: 'teacher', scores: { empathy: 40, romance: 25, tension: 30 }, stage: stages[0].id, pending: { direction: null, turns: 0 }, recent_events: [], memories: [], meaningful_turns: 0, turn_count: 1, last_interaction_at: null, version: 1 };
  assert.equal(turns.reduceLoungeTurn('room', teacher, { ...snapshot, relationship: row }, job({ closestStart: true })).commit.relationship.stage, stages[0].id);
  // Four turns of "crossing a line" took a stage 4 chat down to 2 (a 차유진 chat, adult05): in adult mode at the closest step they are not scored.
  let record = relationship.createClosestRelationship(teacher);
  const violates = [{ type: 'VIOLATES_BOUNDARY', confidence: 0.95, note: '' }];
  let current = { ...snapshot, relationship: { ...row, scores: record.scores, stage: record.stage, version: 1 } };
  for (let turn = 1; turn <= 4; turn++) {
    const { commit } = turns.reduceLoungeTurn('room', teacher, current, { ...job({ closest: true, adultClosest: true }, violates), turn });
    assert.equal(commit.relationship.stage, stages[3].id, `turn ${turn} stays at the closest stage`);
    current = { ...current, relationship: { ...current.relationship, scores: commit.relationship.scores, stage: commit.relationship.stage, version: current.relationship.version + 1 } };
  }
  const scored = turns.reduceLoungeTurn('room', teacher, { ...snapshot, relationship: { ...row, scores: record.scores, stage: record.stage, version: 1 } }, job({ closest: true }, violates));
  assert.ok(scored.commit.relationship.scores.empathy < record.scores.empathy, 'without adult mode it is scored as before');
});

test('a chat turn answered by the fallback model for the adult model writes no summary, no agreement and nothing on her mind (2026-11-18)', () => {
  const teacher = relationship.getRelationshipConfig('teacher');
  const job = payload => ({ room_id: 'room', turn: 1, user_text: '안녕하세요.', reply: '미안해요, 방금 장면은 제가 너무 앞서 갔어요. 속도를 늦출게요.', status: 'ready', payload: { companion: true, answer: { memory: '유진이 정한 범위를 지키는 것', events: [], lingering: '멈춰 달라는 말을 지켜 주길 바람', next_intent: '접촉을 멈추게 하기' }, ...payload }, created_at: '2026-11-18T00:00:00.000Z', updated_at: '2026-11-18T00:00:00.000Z' });
  const snapshot = { relationship: null, state: null, stateVersion: 0, mood: {} };
  const normal = turns.reduceLoungeTurn('room', teacher, snapshot, job({}));
  assert.equal(normal.commit.memory, '유진이 정한 범위를 지키는 것'); assert.equal(normal.commit.state.lingering?.what, '멈춰 달라는 말을 지켜 주길 바람');
  const braked = turns.reduceLoungeTurn('room', teacher, snapshot, job({ braked: true }));
  assert.equal(braked.commit.memory, null, 'the summary is not rewritten');
  assert.equal(braked.commit.state.lingering, undefined); assert.equal(braked.commit.state.next_intent, undefined);
  assert.equal(braked.commit.state.fallback_replies.length, 1, 'its start is kept to leave it out of what the next replies read');
});

test('the room\'s record as lists: taken apart once, added to, merged only where ordinary, and written back as one item a line (2026-11-25)', () => {
  const ledger = m.loungeMemoryLedgerFromSummary('지금 장면: 와인바, 밤\n둘 사이: 해요체를 쓴다. 서로 농담을 주고받는다.\n있었던 일: 사용자는 10억 원을 벌었다. 유진이 축하했다.\n남은 것: 저녁 약속.\n줄거리 없는 한 줄');
  assert.equal(ledger.scene, '지금 장면: 와인바, 밤');
  assert.deepEqual(ledger.between.map(item => item.id), ['bs0', 'bs1']);
  assert.deepEqual(ledger.events.map(item => item.text), ['사용자는 10억 원을 벌었다.', '유진이 축하했다.']);
  assert.deepEqual(ledger.pending.map(item => item.text), ['저녁 약속.', '줄거리 없는 한 줄'], 'an unlabelled line follows the part before it');
  const text = m.loungeMemoryText(ledger);
  assert.deepEqual(text.split('\n').slice(0, 2), ['지금 장면: 와인바, 밤', '둘 사이: 해요체를 쓴다.']);
  assert.deepEqual(m.loungeMemoryLedgerFromSummary(text), ledger, 'the written text reads back to the same lists');

  const ops = (record_ops, history_merge = { refs: [], text: '' }) => ({ memory: '지금 장면: 와인바, 밤', record_ops, history_merge });
  const third = m.applyLoungeMemoryLedger(ledger, ops([
    { op: 'add', section: 'events', ref: '', text: '하나', major: false, quote: '' }, { op: 'add', section: 'events', ref: '', text: '둘', major: false, quote: '' },
    { op: 'add', section: 'events', ref: '', text: '셋', major: false, quote: '' }, { op: 'remove', section: 'events', ref: 'es0', text: '', major: false, quote: '' },
    { op: 'add', section: 'events', ref: '', text: '유진이 축하했다.', major: false, quote: '' },
  ]), 7);
  assert.deepEqual(third.events.map(item => item.text), ['사용자는 10억 원을 벌었다.', '유진이 축하했다.', '하나', '둘'], 'two new lines a turn at most, none removed, none twice');
  assert.equal(ledger.events.length, 2, 'the lists before are not changed');

  const facts = m.applyLoungeMemoryLedger(ledger, ops([
    { op: 'add', section: 'member', ref: '', text: '10억 원을 벌었다', major: false, quote: '10억 벌었어요' },
    { op: 'add', section: 'member', ref: '', text: '빚이 있다', major: false, quote: '빚이 있어요' },
  ]), 8, ['저 오늘 10억 벌었어요!']);
  assert.deepEqual(facts.member.map(item => item.text), ['10억 원을 벌었다']);
  const changed = m.applyLoungeMemoryLedger(facts, ops([{ op: 'update', section: 'member', ref: facts.member[0].id, text: '번 10억을 다 잃었다', major: false, quote: '' }]), 9, ['다 잃었어요']);
  assert.equal(changed.member[0].text, '10억 원을 벌었다', 'a member fact changes only on the member\'s words');
  assert.equal(m.applyLoungeMemoryLedger(facts, ops([{ op: 'update', section: 'member', ref: facts.member[0].id, text: '번 10억을 다 잃었다', major: false, quote: '다 잃었어요' }]), 9, ['그 10억 다 잃었어요']).member[0].text, '번 10억을 다 잃었다');

  let long = { ...ledger, events: Array.from({ length: 30 }, (_, index) => ({ id: `e${index}`, text: `일 ${index}`, turn: index, ...(index === 1 ? { major: true } : {}) })) };
  assert.equal(m.loungeMemoryLedgerForRecorder(long).merge_due, true);
  assert.equal(m.applyLoungeMemoryLedger(long, ops([], { refs: ['e0', 'e1', 'e2'], text: '합침' }), 31).events.length, 30, 'a major line is never merged');
  const merged = m.applyLoungeMemoryLedger(long, ops([], { refs: ['e0', 'e2', 'e3'], text: '처음 세 가지 일' }), 31).events;
  assert.deepEqual(merged.slice(0, 3).map(item => item.text), ['처음 세 가지 일', '일 1', '일 4']);
  long = { ...ledger, events: Array.from({ length: 60 }, (_, index) => ({ id: `e${index}`, text: `${'긴 일'.repeat(20)} ${index}`, turn: index, ...(index === 0 ? { major: true } : {}) })) };
  const capped = m.applyLoungeMemoryLedger(long, ops([]), 61);
  assert.equal(capped.events.length, 40);
  assert.equal(capped.events[0].major, true, 'the oldest ordinary lines go first');
  const shown = m.loungeMemoryText(capped);
  assert.ok(shown.length <= 1800);
  assert.match(shown, / 0$/m, 'over the length the major line is still shown');
  assert.match(shown, / 59$/m);

  const forgetting = structuredClone(facts);
  assert.equal(m.forgetLoungeMemoryLine(forgetting, '사용자에 대해: 10억 원을 벌었다'), true);
  assert.equal(forgetting.member.length, 0);
  assert.equal(m.forgetLoungeMemoryLine(forgetting, '없는 줄'), false);
});

test('a durable turn in a room kept as lists writes its summary from them and leaves them alone for a reply the adult model did not write', () => {
  const job = (turn, answer, extra = {}) => ({ room_id: 'room', turn, user_text: '저 10억 벌었어요', reply: '와, 축하해요.', status: 'ready', payload: { companion: true, ledger: turn === 1 ? { seed: '지금 장면: 카페\n있었던 일: 커피를 마셨다.' } : {}, answer, ...extra }, created_at: '2026-11-24T00:00:00Z', updated_at: '2026-11-24T00:00:00Z' });
  const answer = { memory: '지금 장면: 카페 — 축하하는 중', record_ops: [{ op: 'add', section: 'member', ref: '', text: '10억 원을 벌었다', major: false, quote: '10억 벌었어요' }], history_merge: { refs: [], text: '' } };
  const { commit } = turns.reduceLoungeTurn('room', undefined, { relationship: null, state: null, stateVersion: 0, mood: {} }, job(1, answer));
  assert.equal(commit.memory, '지금 장면: 카페 — 축하하는 중\n사용자에 대해: 10억 원을 벌었다\n있었던 일: 커피를 마셨다.');
  const later = turns.reduceLoungeTurn('room', undefined, { relationship: null, state: commit.state, stateVersion: 1, mood: {} }, job(2, { ...answer, memory: '지금 장면: 카페', record_ops: [] }));
  assert.match(later.commit.memory, /사용자에 대해: 10억 원을 벌었다/);
  const braked = turns.reduceLoungeTurn('room', undefined, { relationship: null, state: commit.state, stateVersion: 1, mood: {} }, job(2, { ...answer, memory: '지금 장면: 모텔', record_ops: [{ op: 'add', section: 'events', ref: '', text: '잤다', major: true, quote: '' }] }, { braked: true }));
  assert.equal(braked.commit.memory, null);
  assert.deepEqual(braked.commit.state.memory_ledger, commit.state.memory_ledger);
  const plain = turns.reduceLoungeTurn('room', undefined, { relationship: null, state: null, stateVersion: 0, mood: {} }, { ...job(1, { memory: '요약 그대로' }), payload: { companion: true, answer: { memory: '요약 그대로' } } });
  assert.equal(plain.commit.memory, '요약 그대로', 'a room without lists keeps the summary the recorder wrote');
});

test('the clock: Korean date, weekday and time, and the gap before the member\'s last message (2026-11-25)', () => {
  assert.equal(m.loungeClockNow(new Date('2026-11-24T11:48:46Z')), '2026년 11월 24일 화요일 20시 48분');
  assert.equal(m.loungeClockNow(new Date('2026-11-24T15:05:00Z')), '2026년 11월 25일 수요일 0시 5분');
  const at = Date.parse('2026-11-24T11:48:46Z');
  assert.deepEqual(m.loungeClock([{ kind: 'host', at: at - 30 * 60_000 }, { kind: 'human', at }], at), { now: '2026년 11월 24일 화요일 20시 48분', since_last_message: '30분' });
  assert.equal(m.loungeClock([{ kind: 'host', at: at - 26 * 3_600_000 }, { kind: 'human', at }, { kind: 'host', at: at + 1000 }], at).since_last_message, '1일');
  assert.equal(m.loungeElapsed(95 * 60_000), '1시간 35분');
  assert.deepEqual(m.loungeClock([{ kind: 'human', at }], at), { now: '2026년 11월 24일 화요일 20시 48분' });
  assert.match(m.loungeClockRule, /날짜를 지어내지 않는다/);
});
