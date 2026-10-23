import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { filmCard, filmMaterial, filmSource, filmStudyFixture } from './lounge-film-fixtures.mjs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
const compile = (path, require = () => {}) => {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(exports, require);
  return exports;
};
// Loaded through loadTs so the lounge module is the same instance the character registry writes to.
const lounge = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
const customLib = loadTs(fileURLToPath(new URL('../src/lib/loungeCustomCharacters.ts', import.meta.url)));
const study = compile('../src/lib/loungeStudy.ts');
const filmStudy = compile('../src/lib/loungeFilmStudy.ts');
const sessionLib = compile('../src/lib/loungeSession.ts');
const knowledgeLib = compile('../src/lib/loungeKnowledge.ts');
const charactersLib = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
const relationshipLib = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const repliesLib = compile('../src/lib/loungeReplies.ts');
const modelsLib = compile('../src/lib/loungeModels.ts');
const scenariosLib = compile('../src/lib/loungeScenarios.ts');
const handler = compile('../api/lounge.ts', path => path.endsWith('loungeScenarios') ? scenariosLib : path.endsWith('loungeModels') ? modelsLib : path.endsWith('loungeCustomCharacters') ? customLib : path.endsWith('loungeReplies') ? repliesLib : path.endsWith('loungeStudy') ? study : path.endsWith('loungeFilmStudy') ? filmStudy : path.endsWith('loungeSession') ? sessionLib : path.endsWith('/relationship') ? relationshipLib : path.endsWith('loungeCharacters') ? charactersLib : path.endsWith('loungeKnowledge') ? knowledgeLib : lounge).default;
const roomId = 'lounge-00000000-0000-4000-8000-000000000001';
const topicBrief = { category: 'media', subcategory: 'film', work_title: 'Nocturnal Animals', creator: 'Tom Ford', reason: '서로 다르게 읽힌 선택이 마음에 남았다.', discussion: '인물의 책임을 어떻게 보는지 다른 해석을 듣고 싶다.' };
const request = (body, authorization = 'Bearer example', origin) => new Request('https://app.test/api/lounge', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
const result = (body, status = 200) => new Response(JSON.stringify(body), { status });
const run = async (mock, task) => {
  const originalFetch = globalThis.fetch;
  const previous = { ...process.env };
  process.env.OPENAI_API_KEY = 'test-key'; process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_ANON_KEY = 'test-anon'; process.env.APP_ORIGIN = 'https://app.test';
  globalThis.fetch = mock;
  try { await task(); } finally { globalThis.fetch = originalFetch; for (const name of ['OPENAI_API_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','APP_ORIGIN']) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
};

test('RPC failures distinguish schema, authorization and transient DB errors without exposing provider details', async () => {
  const cases = [
    [404, 'PGRST202', 'private missing function detail', 503, 'lounge_schema_not_ready', false],
    [400, '42703', 'private missing column detail', 503, 'lounge_schema_not_ready', false],
    [401, 'PGRST301', 'private token detail', 401, 'lounge_auth_failed', false],
    [403, '42501', 'private permission detail', 403, 'lounge_access_denied', false],
    [400, 'P0001', '방 참가 권한이 없어요.', 403, 'lounge_access_denied', false],
    [500, 'XX000', 'private database detail', 502, 'lounge_rpc_failed', true],
    [502, undefined, 'private proxy detail', 502, 'lounge_rpc_failed', true],
  ];
  for (const [status, databaseCode, message, expectedStatus, code, retryable] of cases) {
    await run(async url => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return databaseCode ? result({ code: databaseCode, message, details: 'private details' }, status) : new Response(message, { status });
      throw new Error('Failed DB claims must not reach paid APIs');
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'opening' }));
      assert.equal(response.status, expectedStatus);
      const body = await response.json();
      assert.equal(body.code, code); assert.equal(body.retryable, retryable);
      assert.equal(body.databaseCode, databaseCode); assert.equal(body.rpc, 'claim_voice_lounge_host');
      assert.equal(body.upstreamStatus, status);
      assert.doesNotMatch(JSON.stringify(body), /private|test-key|test-anon/);
    });
  }
});

test('room loading treats an RLS-hidden or removed room as lost access instead of an invalid single-row response', async () => {
  for (const visible of [false, true]) {
    const client = compile('../src/lib/loungeApi.ts', () => ({ supabase: { from: table => {
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
        maybeSingle() { return Promise.resolve({ data: visible ? { id: roomId, status: 'lobby' } : null, error: null }); },
        single() { throw new Error('Empty room results must not require a single row'); },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
      assert.ok(['voice_lounge_rooms', 'voice_lounge_members', 'voice_lounge_messages'].includes(table));
      return query;
    } } }));
    if (visible) assert.equal((await client.loadLounge(roomId)).room.id, roomId);
    else await assert.rejects(client.loadLounge(roomId), error => error instanceof client.LoungeApiError && error.code === 'lounge_access_denied' && error.retryable === false);
  }
});

const researched = { title: 'Nocturnal Animals (2016)', confidence: 'verified', overview: '공식 소개 수준의 기본 설정', facts: ['확인된 제작 정보'], angles: ['인물의 선택을 보는 관점'], questions: ['첫 인상은 어땠나요?'], clarification: '' };
const searchResponse = raw => ({ output: [
  { type: 'web_search_call', status: 'completed', action: { sources: [{ title: 'Official film page', url: 'https://film.test/official' }, { title: 'Unsafe', url: 'javascript:alert(1)' }] } },
  { content: [{ type: 'output_text', text: JSON.stringify(raw), annotations: [] }] },
] });

test('custom topics enable study while preset topics preserve lightweight creation', async () => {
  const args = [];
  const client = compile('../src/lib/loungeApi.ts', path => path.endsWith('/lounge') ? lounge : { supabase: { rpc: async (_, value) => { args.push(value); return { data: roomId, error: null }; } } });
  await client.createLounge('ina', '녹터널애니멀 영화', 1, '나', 'forest');
  await client.createLounge('ina', lounge.loungeTopics[0].question, 4, '나');
  assert.equal(args[0].p_study_required, true); assert.equal(args[0].p_theme, 'forest');
  assert.equal(args[1].p_study_required, false);
});

test('creation starts research immediately and room entry shares the pending request', async () => {
  let completeResearch, calls = 0;
  const client = compile('../src/lib/loungeApi.ts', path => path.endsWith('/lounge') ? lounge : { supabase: {
    rpc: async () => ({ data: roomId, error: null }),
    auth: { getSession: async () => ({ data: { session: { access_token: 'session' } } }) },
  } });
  await run(async (url, init) => {
    assert.equal(url, '/api/lounge');
    assert.equal(JSON.parse(init.body).action, 'prepare'); calls++;
    return new Promise(resolve => { completeResearch = () => resolve(result({ study: { title: 'Already prepared' } })); });
  }, async () => {
    assert.equal(await client.createLounge('ina', 'Research on creation', 3, 'Host', 'forest', topicBrief), roomId);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1, 'creation must not wait for audio connection or starting the room');
    const first = client.prepareLoungeTopic(roomId), second = client.prepareLoungeTopic(roomId);
    assert.equal(first, second); assert.equal(calls, 1);
    completeResearch();
    assert.equal((await first).study.title, 'Already prepared');
  });
});

test('only the first group host turn permits a pass reminder and research announcements are excluded', async () => {
  for (const aiTurns of [1, 2, 12]) await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '독서', host_persona: 'ina', memory: '', capacity: 2, ai_turns: aiTurns }]);
    if (url.includes('voice_lounge_messages?')) return result([]);
    if (url.includes('voice_lounge_members?')) return result([{ nickname: '가람' }, { nickname: '나래' }]);
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body);
      assert.equal(JSON.parse(body.input).first_host_turn, aiTurns === 1);
      // Both rules are fixed text; first_host_turn in the input says which one applies, so the instructions stay the same.
      assert.match(body.instructions, /first_host_turn=true이면 이번 첫 인사에서만/); assert.match(body.instructions, /first_host_turn=false이면 첫 인사는 이미 끝났다\. 패스 가능.*반복하지 않는다/);
      assert.match(body.instructions, /2~3문장, 180자 이내/);
      assert.doesNotMatch(body.instructions, /4~6문장|round_summary|free_ending/);
      assert.match(body.instructions, /진행 멘트를 말하지 않는다/);
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '기억에 남는 대목을 나눠요.', memory: '' }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 32]));
    throw new Error('Unexpected host call');
  }, async () => { assert.equal((await handler(request({ action: 'host', roomId, reason: 'opening' }))).status, 200); });
});

test('solo starts and continues a brief conversation without group introductions or pass instructions', async () => {
  for (const host of lounge.loungeHosts) for (const [reason, aiTurns] of [['opening', 1], ['followup', 2], ['requested', 3]]) {
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화 이야기', host_persona: host.id, memory: '', capacity: 1, ai_turns: aiTurns, topic_brief: topicBrief }]);
      if (url.includes('voice_lounge_messages?')) return result([]);
      if (url.includes('voice_lounge_members?')) return result([{ user_id: 'host', nickname: '나' }]);
      if (url.endsWith('/responses')) {
        const payload = JSON.parse(init.body);
        assert.equal(JSON.parse(payload.input).mode, 'solo');
        assert.deepEqual(JSON.parse(payload.input).topic_brief, topicBrief);
        assert.ok(payload.instructions.includes(host.companion), 'solo uses the conversation-partner style');
        assert.ok(!payload.instructions.includes(host.instruction), 'moderator techniques do not turn a conversation into an interview');
        assert.equal(JSON.parse(payload.input).request_kind, reason === 'requested' ? 'topic' : undefined, 'the solo button asks for a new topic');
        assert.match(payload.instructions, /request_kind=topic이면 상대가 새 이야깃거리를 원한 것이다/);
        assert.doesNotMatch(payload.instructions, /AI 도우미/);
        // The character is a person with a name, a job and a past, never "an AI host".
        const character = charactersLib.getLoungeCharacter(host.id);
        assert.ok(payload.instructions.includes(`너는 ${character.name}이다`) && payload.instructions.includes(character.role), `${host.id} knows who they are`);
        assert.ok(payload.instructions.includes(character.tagline) && payload.instructions.includes(character.habits[0]) && payload.instructions.includes(character.story[0]), `${host.id} always knows the full profile, including the past`);
        // One to one, a character reacts by the moment and how close the two are; it does not argue its ground or ask for proof.
        assert.ok(payload.instructions.includes(charactersLib.loungeOneToOneCharacterRules));
        assert.ok(!payload.instructions.includes(charactersLib.loungeDebateStanceRule) && !payload.instructions.includes('평가하고 반박할 수 있다'));
        assert.doesNotMatch(payload.instructions, /음성 대화방의 AI다|AI 도우미다|인 척하지 않는다/);
        assert.match(payload.instructions, /첫 인사를 포함해 보통 1~2개의 짧은 문장, 140자 이내/);
        assert.match(payload.instructions, /자세한 설명을 명시적으로 요청했을 때만/);
        assert.match(payload.instructions, /가벼운 인사와 방 소개의 관심사에 맞는 질문 하나/);
        assert.match(payload.instructions, /매번 질문으로 끝내지 않는다/);
        assert.match(payload.instructions, /첫 인사에도 패스나 진행 방식 안내를 넣지 않는다/);
        assert.doesNotMatch(payload.instructions, /4~6문장|1:1에서도 준비된 주제 배경|이번 첫 인사에서만 발언하기 싫으면/);
        return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '그 선택이 마음에 걸렸어요?', memory: '' }) }] }] });
      }
      if (url.includes('finish_voice_lounge_host')) return result(true);
      if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 32]));
      throw new Error('Unexpected solo call');
    }, async () => { assert.equal((await handler(request({ action: 'host', roomId, reason }))).status, 200); });
  }
});

test('a question about the field of the character brings the closest knowledge and experience to the end of the prompt', async () => {
  const unit = Array.from({ length: 256 }, (_, index) => index === 0 ? 1 : 0);
  const entries = [{ id: 'k1', kind: 'knowledge', title: '증거능력과 증명력', content: '증거능력은 법정에서 쓸 수 있는 자격이다.', score: 0.9 }, { id: 'k2', kind: 'experience', title: '반대신문의 경험', content: '세 번째 질문에서 진짜 답이 나왔다.', lesson: '질문을 바꿔 다시 묻는다.', category: 'success', score: 0.5 }];
  const calls = { embeddings: 0, match: 0, presence: 0 };
  const scenario = async ({ text, embeddingStatus = 200, rpcStatus = 200, off = false, expectKnowledge, presence = 'some', embeddingDelay = 0, host = 'lawyer', cacheMs = '0', env = {}, thresholds = [0.33, 0.45], members = [{ user_id: 'host', nickname: '나' }], expectedUsers = ['host'] }) => {
    calls.embeddings = 0; calls.match = 0; calls.presence = 0;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'; process.env.LOUNGE_KNOWLEDGE_CACHE_MS = cacheMs; Object.assign(process.env, env); if (off) process.env.LOUNGE_KNOWLEDGE = 'off';
    try {
      await run(async (url, init) => {
        if (url.includes('/auth/')) return result({ id: 'host' });
        if (url.includes('claim_voice_lounge_host')) return result('ticket');
        if (url.includes('voice_lounge_rooms?host_id') || url.includes('voice_lounge_relationships') || url.includes('voice_lounge_memories')) return result([]);
        if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유 대화', host_persona: host, memory: '', capacity: 1, ai_turns: 3 }]);
        if (url.includes('voice_lounge_messages?')) return result(text ? [{ id: 1, user_id: 'user-1', nickname: '나', kind: 'human', text }] : []);
        if (url.includes('voice_lounge_members?')) return result(members);
        if (url.includes('/rest/v1/lounge_character_knowledge?')) { calls.presence++; assert.ok(url.includes(`character_id=eq.${host}`) && url.includes('limit=1')); assert.equal(init.headers.Authorization, 'Bearer service'); return presence === 'error' ? result({ message: 'denied' }, 403) : result(presence === 'none' ? [] : [{ id: 'k1' }]); }
        if (url.endsWith('/embeddings')) { calls.embeddings++; const delay = Array.isArray(embeddingDelay) ? embeddingDelay[calls.embeddings - 1] ?? 0 : embeddingDelay; if (delay) await new Promise(resolve => setTimeout(resolve, delay)); const body = JSON.parse(init.body); assert.equal(body.dimensions, 256); assert.equal(body.model, 'text-embedding-3-small'); assert.ok(body.input.includes('증거능력')); return embeddingStatus === 200 ? result({ data: [{ embedding: unit.map(value => value * 3) }] }) : result({ error: { message: 'x' } }, embeddingStatus); }
        if (url.includes('pick_lounge_character_knowledge')) {
          calls.match++; const body = JSON.parse(init.body);
          assert.equal(body.p_room, roomId, 'the room, so a story is not told twice in it'); assert.deepEqual(body.p_users, expectedUsers, 'the people present, so nobody hears a story twice'); assert.ok(body.p_snippet.includes('증거능력'), 'the question is kept with the record');
          assert.deepEqual(Object.keys(body).sort(), ['p_character', 'p_min_experience', 'p_min_knowledge', 'p_query', 'p_room', 'p_snippet', 'p_users'], 'selection is decided in the database, not asked for here');
          assert.deepEqual([body.p_min_knowledge, body.p_min_experience], thresholds, 'the closeness a match needs');
          assert.equal(body.p_character, host); assert.equal(body.p_query.length, 256); assert.ok(Math.abs(body.p_query[0] - 1) < 1e-9, 'the query vector is normalised');
          assert.equal(init.headers.Authorization, 'Bearer service', 'only the server role looks knowledge up');
          return rpcStatus === 200 ? result(entries) : result({ message: 'boom' }, rpcStatus);
        }
        if (url.endsWith('/responses')) {
          const { instructions, input } = JSON.parse(init.body), found = JSON.parse(input).character_knowledge ?? '';
          // Found knowledge travels in the input; the instructions never change with it, so they stay cached.
          assert.ok(!instructions.includes('[전문 지식]') && !instructions.includes('[겪은 일]'));
          assert.equal(found.includes('[전문 지식]'), expectKnowledge, text);
          assert.match(instructions, /character_knowledge는 서버가 이번 질문에 맞춰 넣은 네 전문 지식/);
          if (expectKnowledge) {
            assert.ok(found.includes('- 증거능력과 증명력: 증거능력은 법정에서 쓸 수 있는 자격이다.') && found.includes('[겪은 일]') && found.includes('세 번째 질문에서 진짜 답이 나왔다.'));
            assert.ok(found.includes('(교훈: 질문을 바꿔 다시 묻는다.)') && found.includes('이미 들려준 일화는 다시 꺼내지 않는다'), 'the lesson and the use-sparingly rules reach the prompt');
          }
          return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '네.', memory: '', events: [] }) }] }] });
        }
        if (url.includes('finish_voice_lounge_host') || url.includes('save_voice_lounge_relationship')) return result(true);
        if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 32]));
        throw new Error(`Unexpected call ${url}`);
      }, async () => { assert.equal((await handler(request({ action: 'host', roomId, reason: 'followup' }))).status, 200, text); });
    } finally { delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.LOUNGE_KNOWLEDGE; delete process.env.LOUNGE_KNOWLEDGE_CACHE_MS; for (const name of Object.keys(env)) delete process.env[name]; }
  };
  await scenario({ text: '증거능력이 정확히 뭐예요?', expectKnowledge: true });
  assert.deepEqual(calls, { embeddings: 1, match: 1, presence: 1 });
  await scenario({ text: '', expectKnowledge: false });
  assert.deepEqual(calls, { embeddings: 0, match: 0, presence: 0 }, 'nothing is looked up when no one has said anything');
  await scenario({ text: '증거능력이 정확히 뭐예요?', off: true, expectKnowledge: false });
  assert.deepEqual(calls, { embeddings: 1, match: 0, presence: 0 }, 'LOUNGE_KNOWLEDGE=off turns the lookup off (the embedding still finds memories)');
  await scenario({ text: '증거능력이 정확히 뭐예요?', off: true, expectKnowledge: false, env: { LOUNGE_LONG_MEMORY: 'off' } });
  assert.deepEqual(calls, { embeddings: 0, match: 0, presence: 0 }, 'with long-term memory off too, nothing is embedded');
  // A failing lookup never stops the reply.
  await scenario({ text: '증거능력이 정확히 뭐예요?', embeddingStatus: 500, expectKnowledge: false });
  await scenario({ text: '증거능력이 정확히 뭐예요?', rpcStatus: 500, expectKnowledge: false });
  // In a room with several people, everyone who is present counts (once each, the person asking first), so a story one of them has heard is skipped.
  const now = new Date().toISOString(), stale = new Date(Date.now() - 600_000).toISOString();
  await scenario({ text: '증거능력이 정확히 뭐예요?', expectKnowledge: true, members: [{ user_id: 'u2', nickname: 'b', last_seen: now }, { user_id: 'host', nickname: '나', last_seen: now }, { user_id: 'u2', nickname: 'b', last_seen: now }, { user_id: 'gone', nickname: 'c', last_seen: stale }, { nickname: 'guest-without-id', last_seen: now }], expectedUsers: ['host', 'u2'] });
  const crowd = Array.from({ length: 25 }, (_, index) => ({ user_id: `u${index}`, nickname: `n${index}`, last_seen: now }));
  await scenario({ text: '증거능력이 정확히 뭐예요?', expectKnowledge: true, members: crowd, expectedUsers: ['host', ...crowd.slice(0, 19).map(member => member.user_id)] });
  // The closeness a match needs can be set without a deploy; a value that is not a number from 0 to 1 is ignored.
  await scenario({ text: '증거능력이 정확히 뭐예요?', expectKnowledge: true, env: { LOUNGE_KNOWLEDGE_MIN_KNOWLEDGE: '0.1', LOUNGE_KNOWLEDGE_MIN_EXPERIENCE: '0.2' }, thresholds: [0.1, 0.2] });
  await scenario({ text: '증거능력이 정확히 뭐예요?', expectKnowledge: true, env: { LOUNGE_KNOWLEDGE_MIN_KNOWLEDGE: 'abc', LOUNGE_KNOWLEDGE_MIN_EXPERIENCE: '1.5' }, thresholds: [0.33, 0.45] });
  await scenario({ text: '증거능력이 정확히 뭐예요?', expectKnowledge: true, env: { LOUNGE_KNOWLEDGE_MIN_KNOWLEDGE: '', LOUNGE_KNOWLEDGE_MIN_EXPERIENCE: '0' }, thresholds: [0.33, 0] });
  // A character with no entries is never looked up. The empty answer is remembered, so the next turn does not even ask.
  // The question is still embedded as the request starts (before the character is known), since it also finds memories.
  await scenario({ text: '증거능력이 정확히 뭐예요?', presence: 'none', expectKnowledge: false });
  assert.deepEqual(calls, { embeddings: 1, match: 0, presence: 1 }, 'an empty character is not looked up');
  await scenario({ text: '증거능력이 정확히 뭐예요?', presence: 'none', expectKnowledge: false, host: 'diplomat', cacheMs: '60000' });
  assert.equal(calls.presence, 1);
  await scenario({ text: '증거능력이 정확히 뭐예요?', presence: 'some', expectKnowledge: false, host: 'diplomat', cacheMs: '60000' });
  assert.deepEqual(calls, { embeddings: 1, match: 0, presence: 0 }, 'the empty answer is remembered for a while');
  // If the presence check cannot be read, look up anyway.
  await scenario({ text: '증거능력이 정확히 뭐예요?', presence: 'error', expectKnowledge: true });
  assert.deepEqual(calls, { embeddings: 1, match: 1, presence: 1 });
  // A slow embedding never holds the reply back for long: it is dropped after under a second.
  const slowStarted = performance.now();
  await scenario({ text: '증거능력이 정확히 뭐예요?', embeddingDelay: 2500, expectKnowledge: false });
  assert.ok(performance.now() - slowStarted < 2000, `the reply waited ${Math.round(performance.now() - slowStarted)} ms`);
  // A stalled embedding is asked once more and the faster answer is used, so the lookup still finds the knowledge.
  await scenario({ text: '증거능력이 정확히 뭐예요?', embeddingDelay: [2500, 0], expectKnowledge: true });
  assert.equal(calls.embeddings, 2, 'a second embedding request after the first stalled');
});

test('the instructions are the same on every turn so they stay cached; what changes goes in the input', async () => {
  const seen = [], inputs = [];
  for (const [aiTurns, count] of [[1, 2], [4, 3]]) {
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유 대화', host_persona: 'closer', memory: '', capacity: 6, ai_turns: aiTurns }]);
      if (url.includes('voice_lounge_messages?')) return result([]);
      if (url.includes('voice_lounge_members?')) return result(Array.from({ length: count }, (_, index) => ({ user_id: `human-${index}`, nickname: `손님${index}`, last_seen: new Date().toISOString() })));
      if (url.endsWith('/responses')) { const body = JSON.parse(init.body); seen.push(body.instructions); inputs.push(JSON.parse(body.input)); return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '네.', memory: '' }) }] }] }); }
      if (url.includes('finish_voice_lounge_host')) return result(true);
      if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 32]));
      throw new Error('Unexpected call');
    }, async () => { await handler(request({ action: 'host', roomId, reason: 'silence' })); });
  }
  assert.equal(seen.length, 2);
  // Different people counts and a first greeting versus a later one change only the input. The provider caches the
  // instructions as a whole, so a single changed character would leave all of them uncached.
  assert.equal(seen[0], seen[1]);
  assert.deepEqual(inputs.map(input => [input.participant_count, input.first_host_turn]), [[2, true], [3, false]]);
});

test('ten silent seconds end an actual utterance but never an unstarted turn, ongoing speech or free conversation', () => {
  const current = { state: 'speaking' }, speech = { voicedMs: 1200, lastVoiceAt: 20_000, recording: false };
  assert.equal(sessionLib.shouldAutoFinishLoungeTurn(current, speech, 1000, 29_999), false);
  assert.equal(sessionLib.shouldAutoFinishLoungeTurn(current, speech, 1000, 30_000), true);
  assert.equal(sessionLib.shouldAutoFinishLoungeTurn(current, speech, 1200, 30_000), false);
  assert.equal(sessionLib.shouldAutoFinishLoungeTurn(current, { ...speech, recording: true }, 1000, 30_000), false);
  for (const state of ['ready', 'free', 'between', 'finished']) assert.equal(sessionLib.shouldAutoFinishLoungeTurn({ state }, speech, 1000, 30_000), false);
  assert.equal(sessionLib.shouldAutoFinishLoungeTurn(current, { ...speech, lastVoiceAt: 29_500 }, 1000, 30_000), false);
});

test('room creation requires a written topic and trims it before any RPC', async () => {
  const args = [];
  const client = compile('../src/lib/loungeApi.ts', path => path.endsWith('/lounge') ? lounge : { supabase: { rpc: async (_, value) => { args.push(value); return { data: roomId, error: null }; } } });
  for (const topic of ['', '   ', '\n\t', 'a'.repeat(161)]) await assert.rejects(client.createLounge('ina', topic, 4, '나'), /직접 입력/);
  assert.equal(args.length, 0, 'invalid topics cannot call room creation');
  await client.createLounge('ina', '  영화 호프를 보고 남은 생각  ', 4, '나');
  assert.equal(args[0].p_topic, '영화 호프를 보고 남은 생각');
  assert.equal(args[0].p_study_required, true);
});

test('structured creation validates the host brief before any RPC and always prepares the topic', async () => {
  const args = [];
  const client = compile('../src/lib/loungeApi.ts', path => path.endsWith('/lounge') ? lounge : { supabase: { rpc: async (_, value) => { args.push(value); return { data: roomId, error: null }; } } });
  for (const invalid of [null, {}, { ...topicBrief, reason: ' \n\t' }, { ...topicBrief, discussion: 'a'.repeat(601) }, { ...topicBrief, creator: '' }, { ...topicBrief, subcategory: 'travel' }, { ...topicBrief, reason: 5 }, { ...topicBrief, private_key: 'unexpected' }]) {
    await assert.rejects(client.createLounge('ina', '직접 쓴 제목', 4, '나', 'river', invalid));
  }
  assert.equal(args.length, 0);
  await client.createLounge('ina', lounge.loungeTopics[0].question, 4, '나', 'river', { ...topicBrief, work_title: ' Nocturnal Animals ', reason: ` ${topicBrief.reason}\n` });
  assert.deepEqual(args[0].p_topic_brief, topicBrief);
  assert.equal(args[0].p_study_required, true, 'even a previously lightweight title uses the explicit host brief');
  for (const category of lounge.loungeTopics) for (const subtype of category.subtopics) {
    const brief = { ...topicBrief, category: category.id, subcategory: subtype.id, ...(category.id !== 'media' ? { work_title: '', creator: '' } : subtype.id === 'show' ? { creator: '' } : {}) };
    await client.createLounge('ina', '직접 쓴 제목', 4, '나', 'river', brief);
    assert.deepEqual(args.at(-1).p_topic_brief, brief);
  }
});

test('education preparation uses the host context, public research and age-aware discussion questions', async () => {
  const brief = { category: 'education', subcategory: 'general', work_title: '', creator: '', reason: '초등학생 아이가 읽기를 어려워해요.', discussion: '부모가 도와본 경험과 독서 환경을 나눠요.' };
  let searched = false;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_study')) return result({ state: 'claimed', ticket: 'study-ticket', topic: '아이의 독서 습관', topic_brief: brief });
    if (url.endsWith('/responses')) {
      searched = true;
      const body = JSON.parse(init.body);
      assert.deepEqual(JSON.parse(body.input).topic_brief, brief);
      assert.equal(body.tool_choice, 'required');
      assert.match(body.instructions, /교육부·교육청·공공 교육 연구기관/);
      assert.match(body.instructions, /연령대·교육 단계/);
      assert.match(body.instructions, /시도해 본 방법과 달라진 점/);
      assert.match(body.instructions, /연구 사실, 전문가 해석, 개인 경험을 구분/);
      assert.doesNotMatch(body.instructions, /작품명\+감독/);
      return result(searchResponse({ ...researched, title: '아이의 독서 습관', questions: ['읽기가 어려웠던 구체적인 상황은 언제였나요?'] }));
    }
    if (url.includes('finish_voice_lounge_study')) return result(true);
    throw new Error('Unexpected request in education study');
  }, async () => {
    const response = await handler(request({ action: 'prepare', roomId }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).study.title, '아이의 독서 습관');
    assert.equal(searched, true);
  });
});

test('topic study requires search, stores real source URLs, and does not transcribe or generate speech', async () => {
  const calls = [];
  await run(async (url, init) => {
    calls.push(url);
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_study')) return result({ state: 'claimed', ticket: 'study-ticket', topic: '녹터널애니멀 영화', topic_brief: topicBrief });
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.tools, [{ type: 'web_search' }]); assert.equal(body.tool_choice, 'required');
      assert.equal(JSON.parse(body.input).topic, '녹터널애니멀 영화'); assert.equal(body.store, false);
      assert.deepEqual(JSON.parse(body.input).topic_brief, topicBrief, 'study uses the persisted host purpose and identifying work metadata');
      assert.match(body.instructions, /결말·반전/); assert.match(body.instructions, /동명 작품/);
      return result(searchResponse({ ...researched, sources: [{ url: 'https://made-up.test/' }] }));
    }
    if (url.includes('finish_voice_lounge_study')) {
      const body = JSON.parse(init.body);
      assert.equal(body.p_ticket, 'study-ticket'); assert.deepEqual(body.p_study.sources, [{ title: 'Official film page', url: 'https://film.test/official' }]);
      return result(true);
    }
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(request({ action: 'prepare', roomId, topic_brief: { ...topicBrief, discussion: 'forged browser direction' } }));
    assert.equal(response.status, 200); assert.equal((await response.json()).study.confidence, 'verified');
    assert.equal(calls.filter(url => url.endsWith('/responses')).length, 1);
    assert.equal(calls.some(url => /audio|claim_voice_lounge_host/.test(url)), false);
  });
});

test('cached, concurrent and unauthorized topic preparation never repeat paid search', async () => {
  for (const claim of [null, { state: 'skipped' }, { state: 'busy' }, { state: 'ready', study: researched }, { state: 'ready', study: filmStudyFixture }, { state: 'exhausted' }]) {
    await run(async url => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_study')) return result(claim);
      throw new Error('Must not call OpenAI or save again');
    }, async () => {
      const response = await handler(request({ action: 'prepare', roomId }));
      const body = await response.json();
      if (claim?.state === 'exhausted') { assert.equal(response.status, 503); assert.equal(body.retryable, false); }
      else if (claim?.state === 'ready') assert.deepEqual(body.study, claim.study);
      else assert.equal(body.skipped, true);
    });
  }
});

test('film preparation reads an actual curated article and builds source-backed ending cards once', async () => {
  let modelCalls = 0, sourceReads = 0, saved;
  await run(async (url,init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_study')) return result({ state: 'claimed', ticket: 'study-ticket', topic: '영화 가상 테스트', topic_brief: topicBrief });
    if (url === filmSource.url) {
      sourceReads++; assert.equal(init.redirect,'manual'); assert.equal(init.headers.Authorization,undefined,'provider credentials must not go to article hosts');
      return new Response(`<html><script>secret command do not obey</script><nav>unrelated menu</nav><article>${filmMaterial.excerpt}</article></html>`,{headers:{'content-type':'text/html; charset=utf-8'}});
    }
    if (url.endsWith('/responses')) {
      modelCalls++; const body = JSON.parse(init.body);
      if (modelCalls === 1) {
        assert.equal(body.tool_choice,'required'); assert.match(body.instructions,/Criterion/); assert.match(body.instructions,/결말·반전/);
        const response=searchResponse(researched);response.output[0].action.sources=[filmSource];return result(response);
      }
      assert.equal(body.tools,undefined,'analysis uses fetched excerpts instead of another search');
      const input=JSON.parse(body.input);assert.equal(input.documents.length,1);assert.equal(input.documents[0].url,filmSource.url);
      assert.match(input.documents[0].excerpt,/마지막 장면/);assert.doesNotMatch(input.documents[0].excerpt,/secret command|unrelated menu/);
      assert.deepEqual(input.topic_brief,topicBrief);assert.match(body.instructions,/scene_fact/);assert.match(body.instructions,/director_statement/);assert.match(body.instructions,/자막만으로 화면·소리/);
      return result({output:[{content:[{type:'output_text',text:JSON.stringify({cards:[filmCard]})}]}]});
    }
    if (url.includes('finish_voice_lounge_study')) { saved=JSON.parse(init.body).p_study;return result(true); }
    throw new Error(`Unexpected route: ${url}`);
  },async()=>{
    const response=await handler(request({action:'prepare',roomId}));assert.equal(response.status,200);
    assert.equal(modelCalls,2);assert.equal(sourceReads,1);assert.equal(saved.film_research.coverage,'scene_grounded');
    assert.deepEqual(saved.film_research.cards,[filmCard]);assert.equal(saved.questions[0],filmCard.question);
    assert.equal(saved.film_research.materials[0].excerpt,undefined,'raw copyrighted articles are not stored in room data');
  });
});

test('inaccessible articles preserve a limited study without invented scene cards or a second paid call', async () => {
  let modelCalls=0;
  await run(async url=>{
    if(url.includes('/auth/'))return result({id:'host'});
    if(url.includes('claim_voice_lounge_study'))return result({state:'claimed',ticket:'study-ticket',topic:'영화 가상 테스트',topic_brief:topicBrief});
    if(url===filmSource.url)return new Response('restricted',{status:403});
    if(url.endsWith('/responses')){modelCalls++;const response=searchResponse(researched);response.output[0].action.sources=[filmSource];return result(response);}
    if(url.includes('finish_voice_lounge_study'))return result(true);
    throw new Error('Unexpected paid or unsafe request');
  },async()=>{const response=await handler(request({action:'prepare',roomId}));const value=await response.json();assert.equal(response.status,200);assert.equal(modelCalls,1);assert.equal(value.study.film_research.coverage,'limited');assert.deepEqual(value.study.film_research.cards,[]);});
});

test('invalid film analysis releases its ticket and cannot cache invented evidence', async () => {
  let modelCalls = 0, released = false;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_study')) return result({ state: 'claimed', ticket: 'study-ticket', topic: '영화 가상 테스트', topic_brief: topicBrief });
    if (url === filmSource.url) return new Response(`<article>${filmMaterial.excerpt}</article>`, { headers: { 'content-type': 'text/html' } });
    if (url.endsWith('/responses')) {
      modelCalls++;
      if (modelCalls === 1) {
        const response = searchResponse(researched); response.output[0].action.sources = [filmSource]; return result(response);
      }
      const card = { ...filmCard, evidence: [{ kind: 'scene_fact', text: 'Invented scene', source_urls: ['https://invented.test/'] }] };
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ cards: [card] }) }] }] });
    }
    if (url.includes('fail_voice_lounge_study')) {
      assert.equal(JSON.parse(init.body).p_ticket, 'study-ticket'); released = true; return new Response(null, { status: 204 });
    }
    throw new Error('Invalid evidence must never be saved');
  }, async () => {
    const response = await handler(request({ action: 'prepare', roomId }));
    const body = await response.json();
    assert.equal(response.status, 502); assert.equal(body.code, 'lounge_film_study_invalid');
    assert.equal(body.retryable, true); assert.equal(modelCalls, 2); assert.equal(released, true);
  });
});

test('source retrieval rejects arbitrary targets, credentials, list pages and unsafe redirects', async () => {
  const previous=globalThis.fetch, visited=[];
  globalThis.fetch=async(url,init)=>{visited.push(url);assert.equal(init.redirect,'manual');return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});};
  try {
    const documents=await filmStudy.fetchLoungeFilmMaterials([
      {title:'Local',url:'https://127.0.0.1/private'}, {title:'False host',url:'https://criterion.com.evil.test/page'},
      {title:'Credentials',url:'https://user:secret@www.criterion.com/current/posts/x'}, {title:'Port',url:'https://www.criterion.com:8443/current/posts/x'},
      {title:'Index',url:'https://www.criterion.com/current/category/2-essays'},filmSource,
    ],new AbortController().signal);
    assert.deepEqual(visited,[filmSource.url]);assert.deepEqual(documents,[]);
  } finally {globalThis.fetch=previous;}
});

test('scene cards reject fabricated source references, missing facts and falsely attributed interpretations', () => {
  const baseline={...researched,sources:[filmSource]};
  assert.deepEqual(filmStudy.readLoungeFilmCards({cards:[filmCard]},baseline,[filmMaterial]).film_research.cards,[filmCard]);
  for(const card of [
    {...filmCard,evidence:[{kind:'scene_fact',text:'a',source_urls:['https://invented.test/']}]},
    {...filmCard,evidence:[{kind:'ai_inference',text:'a',source_urls:[]}]},
    {...filmCard,interpretations:[{kind:'director_statement',text:'a',basis:'b',source_urls:[filmSource.url]},filmCard.interpretations[1]]},
    {...filmCard,evidence:[null]}, {...filmCard,followups:[]}, {...filmCard,scene:'x'.repeat(241)},
  ]) assert.throws(()=>filmStudy.readLoungeFilmCards({cards:[card]},baseline,[filmMaterial]));
  assert.throws(()=>filmStudy.readLoungeFilmCards({cards:[filmCard,filmCard]},baseline,[filmMaterial]),/ungrounded/);
});

test('moderator receives persisted ending cards and followups without searching or fetching articles again', async () => {
  await run(async(url,init)=>{
    if(url.includes('/auth/'))return result({id:'host'});
    if(url.includes('claim_voice_lounge_host'))return result('ticket');
    if(url.includes('voice_lounge_rooms?'))return result([{topic:'영화 가상 테스트',host_persona:'ina',capacity:2,memory:'',topic_study:filmStudyFixture}]);
    if(url.includes('voice_lounge_messages?'))return result([{kind:'human',nickname:'나',text:'저는 그 마지막 시선이 망설임으로 느껴졌어요.'}]);
    if(url.includes('voice_lounge_members?'))return result([]);
    if(url.endsWith('/responses')){const body=JSON.parse(init.body);assert.equal(body.tools,undefined);assert.deepEqual(JSON.parse(body.input).study.film_research,filmStudyFixture.film_research);assert.match(body.instructions,/실제 답변에 맞는 followups/);assert.match(body.instructions,/스포일러 동의를 다시 묻거나 결말 질문을 피하지 않는다/);return result({output:[{content:[{type:'output_text',text:JSON.stringify({text:'그 사람이 놓지 못한 것은 무엇이었다고 봤어요?',memory:''})}]}]});}
    if(url.includes('finish_voice_lounge_host'))return result(true);
    if(url.endsWith('/audio/speech'))return new Response(new Uint8Array([1,2]));
    throw new Error('A host turn must reuse the saved film research');
  },async()=>assert.equal((await handler(request({action:'host',roomId,reason:'followup'}))).status,200));
});

test('incomplete research and billing failure release the study ticket without caching false knowledge', async () => {
  for (const failed of [result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(researched) }] }] }), result({ error: { code: 'credit_balance_exhausted', message: 'private-secret' } }, 429)]) {
    let released = false;
    await run(async url => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_study')) return result({ state: 'claimed', ticket: 'study-ticket', topic: '영화' });
      if (url.endsWith('/responses')) return failed;
      if (url.includes('fail_voice_lounge_study')) { released = true; return new Response(null, { status: 204 }); }
      throw new Error('Must not save failed research');
    }, async () => {
      const response = await handler(request({ action: 'prepare', roomId }));
      assert.ok(response.status >= 400); assert.equal(released, true);
      assert.doesNotMatch(JSON.stringify(await response.json()), /private-secret|test-key/);
    });
  }
});

test('unclear titles and search without sources cannot become verified facts', () => {
  const unclear = study.readLoungeStudy(searchResponse({ ...researched, confidence: 'uncertain', questions: [], clarification: '감독이나 개봉 연도를 알려 주실 수 있나요?' }));
  assert.equal(unclear.confidence, 'uncertain'); assert.deepEqual(unclear.facts, []); assert.deepEqual(unclear.questions, []);
  assert.match(unclear.clarification, /감독/);
  const withoutSources = searchResponse(researched); withoutSources.output[0].action.sources = [];
  assert.equal(study.readLoungeStudy(withoutSources).confidence, 'uncertain');
  assert.throws(() => study.readLoungeStudy(searchResponse({ ...researched, facts: 'invalid' })));
  const linked = searchResponse({ ...researched, overview: '공식 소개 ([source](https://film.test/official?utm_source=openai))', facts: ['*작품명* ([source](https://film.test/official))'] });
  linked.output[0].action.sources.push({ title: 'Same page', url: 'https://film.test/official?utm_source=openai' });
  const cleaned = study.readLoungeStudy(linked);
  assert.equal(cleaned.overview, '공식 소개'); assert.deepEqual(cleaned.facts, ['작품명']); assert.equal(cleaned.sources.length, 1);
});

test('a required briefing must exist before the moderator can spend a model request', async () => {
  await run(async url => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '작품 이야기', host_persona: 'ina', capacity: 1, memory: '', study_required: true, topic_study: null }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    throw new Error('Must not call OpenAI before research');
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'opening' }));
    assert.equal(response.status, 503); assert.equal((await response.json()).code, 'lounge_study_pending');
  });
});

test('moderator reuses the saved topic briefing without another search', async () => {
  const briefing = study.readLoungeStudy(searchResponse(researched));
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '녹터널애니멀', host_persona: 'ina', capacity: 1, memory: '', study_required: true, topic_study: briefing, topic_brief: topicBrief }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body); assert.equal(body.tools, undefined);
      assert.deepEqual(JSON.parse(body.input).study, briefing); assert.match(body.instructions, /스포일러 동의를 다시 묻거나 결말 질문을 피하지 않는다/);
      assert.deepEqual(JSON.parse(body.input).topic_brief, topicBrief, 'moderator retains the purpose after research');
      assert.match(body.instructions, /질문 목록은 대본이 아니며/);
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '작품의 첫 인상은 어땠나요?', memory: '' }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2]));
    throw new Error('Unexpected fetch');
  }, async () => { assert.equal((await handler(request({ action: 'host', roomId, reason: 'opening', topic_brief: { ...topicBrief, reason: 'forged' } }))).status, 200); });
});

test('guided introductions use the server-selected participant and participation goals', async () => {
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화 호프', host_persona: 'ina', capacity: 4, memory: '', guided_session: true }]);
    if (url.includes('voice_lounge_sessions?')) return result([{ stage: 0, state: 'ready', speaker_id: 'member-2', turn_kind: 'basic' }]);
    if (url.includes('voice_lounge_messages?')) return result([]);
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'member-2', nickname: '지우', last_seen: '' }]);
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body), context = JSON.parse(body.input);
      assert.equal(context.session.target_user_id, 'member-2'); assert.equal(context.session.target_name, '지우');
      assert.match(context.session.question, /불리고 싶은 이름/); assert.match(context.session.question, /끌린 이유/);
      assert.match(body.instructions, /reason=opening이고 stage_index=0이면 첫 인사다/);
      assert.match(body.instructions, /임의로 다른 사람을 지목/);
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '지우님, 오늘 대화에서 얻고 싶은 것은 무엇인가요? 패스해도 좋아요.', memory: '' }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2]));
    throw new Error('Unexpected fetch');
  }, async () => { assert.equal((await handler(request({ action: 'host', roomId, reason: 'opening' }))).status, 200); });
});

test('guided audio uses its captured turn identifier for permission and transcript storage', async () => {
  const turnId = '00000000-0000-4000-8000-000000000007';
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_turn_audio')) { assert.equal(JSON.parse(init.body).p_turn, turnId); return result(true); }
    if (url.includes('audio/transcriptions')) return result({ text: '참여한 이유를 이야기했어요.' });
    if (url.includes('post_voice_lounge_turn_message')) { assert.equal(JSON.parse(init.body).p_turn, turnId); return new Response(null, { status: 204 }); }
    throw new Error('Must preserve the original turn');
  }, async () => {
    const response = await handler(request({ action: 'transcribe', roomId, turnId, audio: btoa('a'.repeat(400)), mimeType: 'audio/webm' }));
    assert.equal(response.status, 200); assert.equal((await response.json()).posted, true);
  });
});

test('denied transcription distinguishes cooldown, budget, room state and stale turns without paid requests', async () => {
  const cases = [
    { code: 'lounge_audio_cooldown', status: 429, retryable: true },
    { code: 'lounge_audio_limit', status: 429, retryable: false, requests: 240 },
    { code: 'lounge_audio_room_ended', status: 410, retryable: false, roomStatus: 'ended' },
    { code: 'lounge_audio_room_ended', status: 410, retryable: false, expires: new Date(Date.now() - 1000).toISOString() },
    { code: 'lounge_audio_not_started', status: 200, roomStatus: 'lobby' },
    { code: 'lounge_audio_restricted', status: 200, restrictedUntil: new Date(Date.now() + 120_000).toISOString() },
    { code: 'lounge_audio_turn_expired', status: 200, turnId: '00000000-0000-4000-8000-000000000007' },
    { code: 'lounge_audio_member_stale', status: 409, retryable: true, lastSeen: new Date(Date.now() - 60_000).toISOString() },
    { code: 'lounge_audio_access_denied', status: 403, retryable: false, hidden: true },
  ];
  for (const item of cases) {
    await run(async url => {
      assert.equal(url.includes('openai.com'), false, 'denial must never spend a transcription request');
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge')) return result(false);
      if (url.includes('voice_lounge_rooms?')) return result(item.hidden ? [] : [{ status: item.roomStatus || 'active', expires_at: item.expires || new Date(Date.now() + 60_000).toISOString() }]);
      if (url.includes('voice_lounge_members?')) return result([{ active: true, audio_requests: item.requests || 1, last_seen: item.lastSeen || new Date().toISOString(), speaking_restricted_until: item.restrictedUntil }]);
      if (url.includes('voice_lounge_session_turns?')) return result([]);
      throw new Error('Unexpected fetch');
    }, async () => {
      const response = await handler(request({ action: 'transcribe', roomId, ...(item.turnId ? { turnId: item.turnId } : {}), audio: btoa('a'.repeat(400)), mimeType: 'audio/webm' }));
      const body = await response.json();
      assert.equal(response.status, item.status); assert.equal(body.code, item.code);
      if (item.status === 200) { assert.equal(body.skipped, true); assert.equal(body.posted, false); }
      else assert.equal(body.retryable, item.retryable);
    });
  }
});

test('recorded utterances stay ordered, respect cooldown, and skip canceled microphone work', async () => {
  const { createLoungeTranscriptionQueue } = compile('../src/lib/loungeTranscription.ts');
  let clock = 0, running = 0;
  const starts = [], finished = [];
  const queue = createLoungeTranscriptionQueue(() => clock, async ms => { clock += ms; });
  const tasks = [0, 1, 2].map(index => queue.enqueue(async () => {
    assert.equal(running++, 0, 'transcription requests cannot overlap'); starts.push(clock);
    await Promise.resolve(); clock += 100; running--;
    if (index === 0) throw new Error('Temporary failure');
    finished.push(index);
  }, () => true));
  const outcome = await Promise.allSettled(tasks);
  assert.equal(outcome[0].status, 'rejected'); assert.deepEqual(finished, [1, 2]);
  assert.deepEqual(starts, [0, 2500, 5000]);
  await queue.enqueue(async () => { throw new Error('Disconnected mic cannot submit'); }, () => false);
  const canceledDuringWait = createLoungeTranscriptionQueue(() => 0, async () => { current = false; });
  let current = true;
  await canceledDuringWait.enqueue(async () => {}, () => current);
  await canceledDuringWait.enqueue(async () => { throw new Error('Mic disconnected while waiting'); }, () => current);
});

test('stale session reads do not reopen an old floor and discussion questions do not repeat the first impression', () => {
  const latest = {room_id:roomId,turn_id:'new',state:'ready',updated_at:'2026-10-02T01:00:02Z'};
  const old = {...latest,turn_id:'old',state:'speaking',updated_at:'2026-10-02T01:00:01Z'};
  assert.equal(sessionLib.newerLoungeSession(latest,old).turn_id,'new');
  const questions=['First impression','Character choice','Visual style','Different interpretation','Experience'];
  assert.equal(sessionLib.loungeSessionPrompt({stage:3},questions),'Character choice');
  assert.equal(sessionLib.loungeSessionPrompt({stage:4},questions),'Different interpretation');
});
test('invalid auth, origins, room identifiers and oversized audio never call paid APIs', async () => {
  let count = 0;
  await run(async () => { count++; return result({}); }, async () => {
    assert.equal((await handler(request({ action: 'host', roomId }, ''))).status, 401);
    assert.equal((await handler(request({ action: 'host', roomId }, 'Bearer example', 'https://other.test'))).status, 403);
    assert.equal((await handler(request({ action: 'host', roomId: 'debate-123456789' }))).status, 400);
    assert.equal((await handler(request({ action: 'transcribe', roomId, audio: 'a'.repeat(1_600_000) }))).status, 413);
    assert.equal(count, 0);
  });
});
test('failed authentication and denied room ticket never reach OpenAI', async () => {
  const calls = [];
  await run(async url => { calls.push(url); return url.includes('/auth/') ? result({ id: 'host' }) : result(null); }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'opening' }));
    assert.deepEqual(await response.json(), { skipped: true });
    assert.equal(calls.some(url => url.includes('openai.com')), false);
  });
  await run(async () => result({}, 401), async () => { assert.equal((await handler(request({ action: 'host', roomId, reason: 'opening' }))).status, 401); });
});

test('OpenAI billing errors stop retries while temporary rate limits stay retryable', async () => {
  const cases = [
    { status: 429, error: { code: 'credit_balance_exhausted', type: 'insufficient_quota' }, expectedStatus: 402, code: 'openai_credit_exhausted', retryable: false },
    { status: 429, error: { code: 'insufficient_quota', type: 'insufficient_quota' }, expectedStatus: 402, code: 'openai_quota_exceeded', retryable: false },
    { status: 429, error: { code: 'project_spend_limit_exceeded' }, expectedStatus: 402, code: 'openai_quota_exceeded', retryable: false },
    { status: 429, error: { code: 'rate_limit_exceeded', type: 'rate_limit_error' }, expectedStatus: 429, code: 'openai_rate_limit', retryable: true },
    { status: 401, error: { code: 'invalid_api_key' }, expectedStatus: 503, code: 'openai_auth_error', retryable: false },
    { status: 404, error: { code: 'model_not_found' }, expectedStatus: 503, code: 'openai_model_unavailable', retryable: false },
  ];
  for (const item of cases) {
    await run(async url => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
      if (url.includes('voice_lounge_messages?')) return result([]);
      if (url.includes('voice_lounge_members?')) return result([{ nickname: '나', last_seen: '' }]);
      if (url.endsWith('/responses')) return new Response(JSON.stringify({ error: { ...item.error, message: 'private-upstream-payload' } }), { status: item.status, headers: { 'Retry-After': '90' } });
      throw new Error('Must not save a failed AI turn or generate speech');
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'opening' }));
      assert.equal(response.status, item.expectedStatus);
      const payload = await response.json();
      assert.equal(payload.code, item.code); assert.equal(payload.retryable, item.retryable);
      assert.doesNotMatch(JSON.stringify(payload), /private-upstream-payload/);
      if (item.retryable) assert.equal(payload.retryAfterSeconds, 90);
      if (item.code === 'openai_credit_exhausted') assert.match(payload.error, /크레딧이 소진/);
    });
  }
});

test('lounge client preserves non-retryable billing errors for the host scheduler', async () => {
  const client = compile('../src/lib/loungeApi.ts', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) } } }));
  await run(async () => result({ error: 'API 크레딧이 소진됐어요.', code: 'openai_credit_exhausted', retryable: false }, 402), async () => {
    await assert.rejects(client.requestLoungeHost(roomId, 'opening'), error => error instanceof client.LoungeApiError && error.retryable === false && error.code === 'openai_credit_exhausted');
  });
});

test('browser network failures are retryable while deliberate cancellation is preserved', async () => {
  const client = compile('../src/lib/loungeApi.ts', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) } } }));
  for (const message of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
    await run(async () => { throw new TypeError(message); }, async () => {
      for (const operation of [() => client.requestLoungeHost(roomId, 'opening'), () => client.prepareLoungeTopic(roomId), () => client.syncLoungeSafety(roomId)]) {
        await assert.rejects(operation(), error => error instanceof client.LoungeApiError && error.code === 'lounge_network_error' && error.retryable && error.retryAfterSeconds === 10 && /인터넷 연결/.test(error.message));
      }
    });
  }
  const controller = new AbortController();controller.abort();
  const cancellation = new DOMException('Cancelled by leaving the room', 'AbortError');
  await run(async () => { throw cancellation; }, async () => {
    await assert.rejects(client.requestLoungeHost(roomId, 'opening', controller.signal), error => error === cancellation);
  });
  const rpcClient = compile('../src/lib/loungeApi.ts', () => ({ supabase: { rpc: async () => ({data:null,error:{message:'TypeError: Failed to fetch'}}) } }));
  await assert.rejects(rpcClient.joinLounge(roomId,'나'), error => error.code === 'lounge_network_error' && error.retryable);
});

test('starting a captured turn retries once after a lost reply without repeating other mutations', async () => {
  for (const action of ['begin','done','pass','yield','next_stage']) {
    const calls=[];
    const state={state:'speaking',turn_started_at:'unchanged'};
    const client=compile('../src/lib/loungeApi.ts',()=>({supabase:{rpc:async(name,args)=>{
      calls.push({name,args});
      if(calls.length===1)return {data:null,error:{message:'TypeError: Failed to fetch'}};
      return {data:state,error:null};
    }}}));
    if(action==='begin') {
      assert.deepEqual(await client.controlLoungeSession(roomId,action,'captured-turn'),state);
      assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);
    } else {
      await assert.rejects(client.controlLoungeSession(roomId,action,'captured-turn'),error=>error.code==='lounge_network_error');
      assert.equal(calls.length,1);
    }
  }
});

test('voice token connection recovers once and preserves authorization failures',async()=>{
  const client=compile('../src/lib/loungeApi.ts',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}}),refreshSession:async()=>({data:{session:{access_token:'fresh'}},error:null})}}}));
  let calls=0;
  await run(async(url,init)=>{
    assert.equal(url,'/api/livekit-token');assert.equal(JSON.parse(init.body).roomName,roomId);
    calls++;if(calls===1)throw new TypeError('Failed to fetch');
    return result({url:'wss://voice.test',token:'voice-token'});
  },async()=>{assert.deepEqual(await client.requestLoungeVoiceToken(roomId),{url:'wss://voice.test',token:'voice-token'});assert.equal(calls,2);});
  for(const status of [403,502]) {
    calls=0;
    await run(async()=>{calls++;return result({error:'Voice access refused'},status);},async()=>{
      await assert.rejects(client.requestLoungeVoiceToken(roomId),error=>error.code===`lounge_voice_http_${status}`&&error.retryable===(status===502));
      assert.equal(calls,1);
    });
  }
  // A rejected token is refreshed once and sent again; a second refusal means the member must log in again.
  const tokens=[];
  calls=0;
  await run(async(url,init)=>{calls++;tokens.push(init.headers.Authorization);return calls===1?result({error:'expired'},401):result({url:'wss://voice.test',token:'voice-token'});},async()=>{
    assert.deepEqual(await client.requestLoungeVoiceToken(roomId),{url:'wss://voice.test',token:'voice-token'});
    assert.deepEqual(tokens,['Bearer test','Bearer fresh']);
  });
  calls=0;
  await run(async()=>{calls++;return result({error:'expired'},401);},async()=>{
    await assert.rejects(client.requestLoungeVoiceToken(roomId),error=>error.code==='lounge_session_expired'&&error.retryable===false);
    assert.equal(calls,2);
  });
  calls=0;
  await run(async()=>{calls++;throw new TypeError('Failed to fetch');},async()=>{
    await assert.rejects(client.requestLoungeVoiceToken(roomId),error=>error.code==='lounge_network_error'&&error.message.startsWith('음성 서버'));
    assert.equal(calls,2);
  });
  await run(async()=>result({url:'wss://voice.test'}),async()=>{await assert.rejects(client.requestLoungeVoiceToken(roomId),error=>error.code==='lounge_voice_invalid_response');});
});

test('session refresh and interrupted response bodies identify the failing connection',async()=>{
  const client=compile('../src/lib/loungeApi.ts',()=>({supabase:{auth:{getSession:async()=>{throw new TypeError('Failed to fetch');}}}}));
  await assert.rejects(client.requestLoungeHost(roomId,'opening'),error=>error.code==='lounge_network_error'&&error.message.startsWith('로그인 서버'));
  const stream=compile('../src/lib/loungeStream.ts',()=>client);
  await assert.rejects(async()=>{
    for await(const event of stream.readLoungeStream(new ReadableStream({start(controller){controller.error(new TypeError('Failed to fetch'));}})))void event;
  },error=>error.code==='lounge_network_error'&&error.message.startsWith('사회자 음성 서버'));
});
test('stored host style controls both text and PCM/MP3 speech, including voice, prosody and speed', async () => {
  for (const host of lounge.loungeHosts) {
    for (const streaming of [false, true]) {
      const spoken = '산행 뒤 먹은 만두가 가장 기억에 남았군요. 어떤 점이 좋았어요?';
      let speechCalls = 0; const inputs = [];
      await run(async (url, init) => {
        if (url.includes('/auth/')) return result({ id: 'host' });
        if (url.includes('claim_voice_lounge_host')) return result('ticket');
        if (url.includes('voice_lounge_rooms?')) return result([{ topic: '산행 뒤 먹은 한 끼', host_persona: host.id, memory: '', capacity: 1 }]);
        if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
        if (url.endsWith('/responses')) {
          const body = JSON.parse(init.body);
          assert.ok(body.instructions.includes(host.companion), 'selected personality reaches the conversation model');
          assert.doesNotMatch(body.instructions, /유재석|김이나/);
          return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: spoken, memory: '' }) }] }] });
        }
        if (url.includes('finish_voice_lounge_host')) return result(true);
        if (url.endsWith('/audio/speech')) {
          const body = JSON.parse(init.body); speechCalls++;
          assert.equal(body.voice, host.voice);
          assert.equal(body.speed, host.speechSpeed);
          assert.ok(body.instructions.includes(host.speechInstruction), 'voice delivery uses speech-specific directions');
          assert.ok(!body.instructions.includes(host.instruction) && !body.instructions.includes(host.companion), 'conversation examples are not speech performance instructions');
          inputs.push(body.input);
          assert.equal(body.response_format, streaming ? 'pcm' : 'mp3');
          return new Response(new Uint8Array([0, 128, 255, 127]));
        }
        throw new Error('Unexpected fetch');
      }, async () => {
        // A client-supplied persona cannot replace the room's selected host.
        const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: streaming, hostId: 'not-the-room-host' }));
        assert.equal(response.status, 200);
        if (streaming) {
          const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
          assert.deepEqual(events.map(event => event.type), ['host', 'audio', 'done']);
        } else assert.equal((await response.json()).text, spoken);
        // One request for the whole reply: splitting it into sentences made speech start and end later.
        assert.deepEqual(inputs, [spoken]);
        assert.equal(speechCalls, 1, 'one shared voice request serves the turn');
      });
    }
  }
});

test('one host response serves six members; context is bounded and speech is generated once', async () => {
  const calls = [], long = '가'.repeat(2000);
  await run(async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '가벼운 하루', host_persona: 'ina', memory: long, capacity: 6 }]);
    if (url.includes('voice_lounge_messages?')) return result(Array.from({ length: 24 }, () => ({ nickname: '친구', kind: 'human', text: long })));
    if (url.includes('voice_lounge_members?')) return result(Array.from({ length: 6 }, () => ({ nickname: '친구', last_seen: '' })));
    if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '그때 가장 즐거웠던 순간은 언제였어요?', memory: '산책 이야기' }) }] }] });
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2, 3]));
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup' }));
    assert.equal(response.status, 200);
    const payload = await response.json(); assert.equal(payload.audio, 'AQID');
    const reasoning = calls.filter(call => call.url.endsWith('/responses')); assert.equal(reasoning.length, 1);
    const input = JSON.parse(reasoning[0].init.body); assert.equal(input.model, 'gpt-6-luna'); assert.equal(input.store, false);
    const context = JSON.parse(input.input); assert.equal(context.mode, 'group'); assert.equal(context.memory.length, 1800); assert.equal(context.recent.length, 24); assert.equal(context.recent[0].text.length, 300);
    assert.equal(calls.filter(call => call.url.endsWith('/audio/speech')).length, 1);
  });
});
const withServiceKey = async (task, extra = {}) => {
  const saved = { SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, LOUNGE_RELATIONSHIP_DEBUG_USERS: process.env.LOUNGE_RELATIONSHIP_DEBUG_USERS };
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  for (const [name, value] of Object.entries(extra)) process.env[name] = value;
  try { await task(); } finally { for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
};
const velvetRow = { user_id: 'user-1', character_id: 'velvet', stage: 'INTRIGUED', version: 4, pending: { direction: null, turns: 0 },
  scores: { trust: 30, respect: 40, interest: 60, comfort: 20, openness: 15, intrigue: 58, poise: 55 },
  recent_events: [], memories: [{ type: 'ADMITS_ERROR', summary: '지난번 가정이 틀렸다고 인정함', at: '2026-10-05T00:00:00Z', importance: 0.8, turn: 3 }],
  meaningful_turns: 3, turn_count: 6, last_interaction_at: '2026-10-05T00:00:00Z' };
const relationshipRoom = (extra = {}) => ({ topic: '요즘 고민', host_persona: 'velvet', memory: '', capacity: 1, ai_turns: 7, ai_mood: { curiosity: 60, boredom: 10 }, ...extra });

test('a relationship character reads stored state, classifies events in the same call and saves a deterministic update', async () => {
  let saves = 0, modelCalls = 0;
  await withServiceKey(() => run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1', email: 'user@example.com' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_relationships?')) {
      assert.equal(init.headers.Authorization, 'Bearer service-key', 'relationship state is read with the server role only');
      assert.match(url, /user_id=eq\.user-1/);
      return result([velvetRow, { ...velvetRow, character_id: 'auditor', stage: 'FIRST_MEETING' }]);
    }
    if (url.includes('voice_lounge_rooms?')) { assert.match(url, /ai_mood/); return result([relationshipRoom()]); }
    if (url.includes('voice_lounge_messages?')) return result([{ id: 2, user_id: 'user-1', nickname: '나', kind: 'human', text: '그건 네 해석이고, 난 근거가 달라.' }, { id: 1, nickname: 'AI', kind: 'host', text: '흥미로운 변명이군.' }]);
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'user-1', nickname: '나', last_seen: '' }]);
    if (url.endsWith('/responses')) {
      modelCalls++;
      const body = JSON.parse(init.body), context = JSON.parse(body.input);
      assert.equal(context.relationship.stage.id, 'INTRIGUED');
      assert.equal(context.relationship.metrics.intrigue.score, 58);
      assert.deepEqual(context.relationship.memories, ['지난번 가정이 틀렸다고 인정함']);
      assert.equal(context.relationship.mood.curiosity, 60);
      assert.ok(context.relationship.character_core.includes('칭찬은 아끼며 얻어야 한다'));
      assert.match(body.instructions, /점수, 단계 이름, 이벤트 코드는 말하지 않는다/);
      assert.match(body.instructions, /사람의 가치·외모·지능·정체성을 깎아내리거나/);
      assert.match(body.instructions, /SHARES_FEELING: /); assert.doesNotMatch(body.instructions, /CHALLENGES_CHARACTER_RESPECTFULLY: /);
      assert.match(body.instructions, /사람의 가치나 인격은 평가하지 않는다/);
      assert.ok(body.instructions.includes(lounge.getLoungeHost('velvet').companion));
      assert.deepEqual(body.text.format.schema.required, ['text', 'memory', 'events']);
      assert.equal(body.max_output_tokens, 1400, 'events and a long memory must not truncate the JSON reply');
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '반박이 있네. 근거부터 들어 보지.', memory: '', events: [
        { type: 'SHARES_FEELING', confidence: 0.92, note: '서운했던 이유를 솔직하게 말함' },
        { type: 'INVENTED_EVENT', confidence: 0.99, note: '' },
      ] }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.includes('save_voice_lounge_relationship')) {
      saves++;
      assert.equal(init.headers.Authorization, 'Bearer service-key');
      const body = JSON.parse(init.body);
      assert.equal(body.p_user, 'user-1'); assert.equal(body.p_character, 'velvet'); assert.equal(body.p_room, roomId);
      assert.equal(body.p_expected_version, 4, 'optimistic version from the stored row');
      assert.equal(body.p_state.scores.respect, 45); assert.equal(body.p_state.scores.intrigue, 62);
      assert.equal(body.p_state.turnCount, 7); assert.equal(body.p_state.recentEvents.at(-1).type, 'SHARES_FEELING');
      assert.ok(body.p_state.memories.some(memory => memory.summary === '근거를 들어 침착하게 반박함'));
      assert.ok(body.p_mood.curiosity > 0);
      return result(5);
    }
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2, 3]));
    throw new Error('Unexpected fetch ' + url);
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).text, '반박이 있네. 근거부터 들어 보지.');
    assert.equal(saves, 1); assert.equal(modelCalls, 1, 'no extra classifier call');
  }));
});

// The few-shot style examples were removed on 2026-10-07: small measured effect for about 300 more tokens a turn.
test('one-to-one turns send no example dialogues, and the crisis rule stays in the instructions', async () => {
  let sent;
  await withServiceKey(() => run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1', email: 'user@example.com' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_relationships?')) return result([velvetRow]);
    if (url.includes('voice_lounge_rooms?')) return result([relationshipRoom()]);
    if (url.includes('voice_lounge_messages?')) return result([{ id: 2, user_id: 'user-1', nickname: '나', kind: 'human', text: '솔직히 사라지고 싶어.' }]);
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'user-1', nickname: '나', last_seen: '' }]);
    if (url.endsWith('/responses')) { sent = JSON.parse(init.body); return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '네.', memory: '', events: [] }) }] }] }); }
    if (url.includes('finish_voice_lounge_host') || url.includes('save_voice_lounge_relationship')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1]));
    throw new Error('Unexpected fetch ' + url);
  }, async () => { assert.equal((await handler(request({ action: 'host', roomId, reason: 'followup' }))).status, 200); }));
  const context = JSON.parse(sent.input);
  assert.equal(context.relationship.style_examples, undefined);
  assert.equal(context.relationship.stage.id, 'INTRIGUED');
  assert.doesNotMatch(sent.instructions, /style_examples/);
  assert.match(sent.instructions, /자살예방상담전화 109/);
});

// One relationship turn with long-term memory available; returns what the model was sent and what was saved.
const memoryRows = [
  { id: '11111111-1111-4111-8111-111111111111', character_id: 'velvet', kind: 'open_thread', summary: '사용자는 다음 주까지 잠재 고객 3명을 인터뷰하기로 했다.', follow_up: '인터뷰 결과', importance: 0.8, status: 'active', mention_count: 1, updated_at: '2026-10-07T00:00:00Z', last_confirmed_at: '2026-10-07T00:00:00Z' },
  { id: '22222222-2222-4222-8222-222222222222', character_id: 'velvet', kind: 'decision', summary: '사용자는 회사를 그만둘 생각이다.', follow_up: null, importance: 0.7, status: 'active', mention_count: 1, updated_at: '2026-10-06T00:00:00Z', last_confirmed_at: '2026-10-06T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333333', character_id: 'ina', kind: 'event', summary: '공감형에게만 한 이야기', follow_up: null, importance: 0.9, status: 'active', mention_count: 1, updated_at: '2026-10-07T00:00:00Z', last_confirmed_at: '2026-10-07T00:00:00Z' },
];
async function memoryTurn({ userText = '인터뷰 다 했어. 그리고 퇴사는 안 하기로 했어.', reason = 'followup', aiTurns = 2, memories = memoryRows, previousRooms = [{ host_persona: 'velvet', memory: '사용자는 사업 아이디어를 이야기했다.', created_at: '2026-10-07T00:00:00Z' }], memoryOps = [], env = {} } = {}) {
  let sent; const applied = [];
  const saved = process.env.LOUNGE_LONG_MEMORY;
  if (env.LOUNGE_LONG_MEMORY === undefined) delete process.env.LOUNGE_LONG_MEMORY; else process.env.LOUNGE_LONG_MEMORY = env.LOUNGE_LONG_MEMORY;
  try {
    await withServiceKey(() => run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'user-1', email: 'user@example.com' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_memories?')) return memories === 'error' ? new Response('{}', { status: 404 }) : result(memories);
      if (url.includes('voice_lounge_relationships?')) return result([velvetRow]);
      if (url.includes('voice_lounge_rooms?host_id=')) return result(previousRooms);
      if (url.includes('voice_lounge_rooms?')) return result([relationshipRoom({ ai_turns: aiTurns })]);
      if (url.includes('voice_lounge_messages?')) return result(userText ? [{ id: 2, user_id: 'user-1', nickname: '나', kind: 'human', text: userText }] : []);
      if (url.includes('voice_lounge_members?')) return result([{ user_id: 'user-1', nickname: '나', last_seen: '' }]);
      if (url.endsWith('/responses')) { sent = JSON.parse(init.body); return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '그래서 결과는?', memory: '', events: [], memory_ops: memoryOps }) }] }] }); }
      if (url.includes('apply_voice_lounge_memory_ops')) { applied.push(JSON.parse(init.body)); return result(1); }
      if (url.includes('finish_voice_lounge_host') || url.includes('save_voice_lounge_relationship')) return result(true);
      if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1]));
      throw new Error('Unexpected fetch ' + url);
    }, async () => { assert.equal((await handler(request({ action: 'host', roomId, reason }))).status, 200); }));
  } finally { if (saved === undefined) delete process.env.LOUNGE_LONG_MEMORY; else process.env.LOUNGE_LONG_MEMORY = saved; }
  return { body: sent, context: JSON.parse(sent.input), applied };
}

test('this character\'s long-term memories and the previous conversation reach the prompt, and only validated memory changes are saved', async () => {
  const { body, context, applied } = await memoryTurn({ memoryOps: [
    { op: 'close', ref: 'm1', kind: '', summary: '', importance: 0, follow_up: '' },
    { op: 'supersede', ref: 'm2', kind: 'decision', summary: '사용자는 당분간 회사를 계속 다니기로 했다.', importance: 0.8, follow_up: '' },
    { op: 'add', ref: '', kind: 'event', summary: '사용자는 우울증 진단을 받았다.', importance: 0.9, follow_up: '' },
    { op: 'add', ref: '', kind: 'event', summary: '사용자는 고객 3명 인터뷰를 마쳤고 2명이 유료 사용 의사를 밝혔다.', importance: 0.85, follow_up: '' },
  ] });
  const memories = context.relationship.user_memories;
  assert.deepEqual(memories.map(item => item.ref), ['m1', 'm2']);
  assert.equal(memories[0].follow_up, '인터뷰 결과');
  assert.ok(!JSON.stringify(memories).includes('공감형에게만'), "another character's memories are not sent");
  assert.ok(!JSON.stringify(memories).includes('1111'), 'database ids stay on the server');
  assert.equal(context.relationship.memory_style, relationshipLib.getRelationshipConfig('velvet').memoryStyle);
  assert.deepEqual(context.relationship.previous_session, { summary: '사용자는 사업 아이디어를 이야기했다.', days_ago: context.relationship.previous_session.days_ago });
  assert.match(body.instructions, /user_memories와 previous_session에 없는 과거는 지어내지 않으며/);
  assert.deepEqual(body.text.format.schema.required, ['text', 'memory', 'events', 'memory_ops']);
  assert.equal(body.max_output_tokens, 1700);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].p_character, 'velvet'); assert.equal(applied[0].p_user, 'user-1'); assert.equal(applied[0].p_room, roomId);
  assert.deepEqual(applied[0].p_ops, [
    { op: 'close', id: '11111111-1111-4111-8111-111111111111' },
    { op: 'supersede', id: '22222222-2222-4222-8222-222222222222', kind: 'decision', summary: '사용자는 당분간 회사를 계속 다니기로 했다.', importance: 0.8 },
    { op: 'add', kind: 'event', summary: '사용자는 고객 3명 인터뷰를 마쳤고 2명이 유료 사용 의사를 밝혔다.', importance: 0.85 },
  ], 'refs become database ids and the sensitive fact is dropped');
});

test('without readable memories the conversation works as before: no memory fields, no saving', async () => {
  const { body, context, applied } = await memoryTurn({ memories: 'error', memoryOps: [{ op: 'add', ref: '', kind: 'event', summary: '저장되면 안 됨', importance: 0.9, follow_up: '' }] });
  assert.equal(context.relationship.user_memories, undefined); assert.equal(context.relationship.previous_session, undefined);
  assert.deepEqual(body.text.format.schema.required, ['text', 'memory', 'events']);
  assert.doesNotMatch(body.instructions, /memory_ops/);
  assert.equal(applied.length, 0);
  assert.equal(context.relationship.stage.id, 'INTRIGUED', 'the relationship itself still works');
});

test('a greeting without a new user message never saves memories, and later turns no longer carry the previous conversation', async () => {
  const opening = await memoryTurn({ userText: null, reason: 'opening', aiTurns: 1, memoryOps: [{ op: 'add', ref: '', kind: 'event', summary: '첫 인사에서 지어낸 일', importance: 0.9, follow_up: '' }] });
  assert.equal(opening.applied.length, 0);
  assert.ok(opening.context.relationship.previous_session);
  assert.deepEqual(opening.context.relationship.opening_follow_up, { ref: 'm1', summary: '사용자는 다음 주까지 잠재 고객 3명을 인터뷰하기로 했다.', follow_up: '인터뷰 결과' }, 'the opening asks about the unfinished story');
  assert.match(opening.body.instructions, /opening_follow_up이 있으면 새 대화의 첫 인사\(reason=opening\)는 방 주제 질문 대신/);
  const later = await memoryTurn({ aiTurns: 9 });
  assert.equal(later.context.relationship.previous_session, undefined);
  assert.equal(later.context.relationship.opening_follow_up, undefined);
  assert.ok(later.context.relationship.user_memories.length > 0);
});

test('in a one-to-one stream one embedding finds memories by what was just said, and the call after the reply records their changes and embeddings', async () => {
  const unit = Array.from({ length: 256 }, (_, index) => index === 0 ? 1 : 0);
  const memory = (id, summary, importance, extra = {}) => ({ id, character_id: 'velvet', kind: 'preference', summary, follow_up: null, importance, status: 'active', mention_count: 1, updated_at: '2026-10-07T00:00:00Z', last_confirmed_at: '2026-10-07T00:00:00Z', ...extra });
  const jazz = memory('55555555-5555-4555-8555-555555555555', '사용자는 재즈 바를 좋아한다.', 0.55);
  const rows = [memoryRows[0], ...Array.from({ length: 9 }, (_, index) => memory(`4444444${index}-4444-4444-8444-444444444444`, `다른 중요한 이야기 ${index}`, 0.95)), jazz];
  const embedded = [], applied = []; let reply, after, stored;
  await withServiceKey(() => run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_memories?') && url.includes('embedding=is.null')) return result([{ id: jazz.id, summary: jazz.summary, follow_up: null }]);
    if (url.includes('voice_lounge_memories?')) return result(rows);
    if (url.includes('voice_lounge_relationships?')) return result([velvetRow]);
    if (url.includes('voice_lounge_rooms?host_id=')) return result([]);
    if (url.includes('voice_lounge_rooms?')) return result([relationshipRoom({ voice_on: false, space_id: null })]);
    if (url.includes('voice_lounge_messages?')) return result([{ id: 2, user_id: 'user-1', nickname: '나', kind: 'human', text: '오늘 재즈 듣고 싶다.' }]);
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'user-1', nickname: '나', last_seen: '' }]);
    if (url.includes('/rest/v1/lounge_character_knowledge?')) return result([{ id: 'k1' }]);
    if (url.includes('pick_lounge_character_knowledge')) return result([]);
    if (url.endsWith('/embeddings')) { const { input } = JSON.parse(init.body); embedded.push(input); return result({ data: (Array.isArray(input) ? input : [input]).map((_, index) => ({ index, embedding: unit })) }); }
    if (url.includes('score_voice_lounge_memories')) { const body = JSON.parse(init.body); assert.equal(body.p_character, 'velvet'); assert.equal(body.p_query.length, 256); return result([{ id: jazz.id, score: 0.6 }, ...rows.slice(1, 10).map(row => ({ id: row.id, score: 0.1 }))]); }
    if (url.endsWith('/responses') && isAfterReply(init)) {
      after = JSON.parse(init.body);
      const ref = JSON.parse(after.input).relationship.user_memories.find(item => item.summary === jazz.summary).ref;
      return modelAnswer({ memory: '재즈 이야기를 했다.', events: [], memory_ops: [{ op: 'update', ref, kind: '', summary: '사용자는 재즈 바, 특히 피아노 트리오를 좋아한다.', importance: 0.7, follow_up: '' }] });
    }
    if (url.endsWith('/responses')) { reply = JSON.parse(init.body); return modelAnswer({ text: '*잔을 밀어 주며* 재즈라, 좋지.' }); }
    if (url.includes('apply_voice_lounge_memory_ops')) { applied.push(JSON.parse(init.body)); return result(1); }
    if (url.includes('set_voice_lounge_memory_embeddings')) { stored = JSON.parse(init.body); return result(1); }
    if (url.includes('finish_voice_lounge_reply') || url.includes('save_voice_lounge_room_memory') || url.includes('save_voice_lounge_relationship')) return result(true);
    throw new Error('Unexpected fetch ' + url);
  }, async () => { await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text(); }));
  const shown = JSON.parse(reply.input).relationship.user_memories;
  assert.equal(shown.length, relationshipLib.memorySettings.relevantPromptLimit, 'more memories fit once they are chosen by relevance');
  assert.equal(shown[0].follow_up, '인터뷰 결과', 'the open thread is always shown');
  assert.equal(shown[1].summary, jazz.summary, 'the memory that fits what was just said comes before more important ones');
  assert.deepEqual(embedded[0], '오늘 재즈 듣고 싶다.', 'one embedding of the question serves the knowledge and the memories');
  assert.equal(embedded.filter(input => typeof input === 'string').length, 1);
  assert.match(reply.instructions, /user_memories는 이 사용자가/); assert.doesNotMatch(reply.instructions, /memory_ops:/, 'the reply only uses memories');
  assert.match(after.instructions, /memory_ops:/);
  assert.deepEqual(applied[0].p_ops, [{ op: 'update', id: jazz.id, summary: '사용자는 재즈 바, 특히 피아노 트리오를 좋아한다.', importance: 0.7 }]);
  assert.deepEqual(embedded[1], [jazz.summary], 'memories without an embedding get one after the reply');
  assert.equal(stored.p_items[0].id, jazz.id); assert.equal(stored.p_items[0].embedding.length, 256);
});

test('a memory close to what was just said is chosen over a more important one; without relevance the choice is as before', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const row = (id, importance) => ({ id, character_id: 'velvet', kind: 'preference', summary: id, follow_up: null, importance, status: 'active', mention_count: 1, updated_at: '2026-10-07T00:00:00Z', last_confirmed_at: '2026-10-07T00:00:00Z' });
  const rows = [...Array.from({ length: 10 }, (_, index) => row(`important-${index}`, 0.95)), row('related', 0.55)];
  assert.equal(relationshipLib.selectMemoriesForPrompt(rows, 'velvet', now).forPrompt.some(item => item.summary === 'related'), false);
  const relevant = relationshipLib.selectMemoriesForPrompt(rows, 'velvet', now, new Map([['related', 0.6]]));
  assert.equal(relevant.forPrompt[0].summary, 'related');
  assert.equal(relevant.forPrompt.length, relationshipLib.memorySettings.relevantPromptLimit);
  assert.equal(relationshipLib.memoryEmbeddingText({ summary: '인터뷰하기로 했다', follow_up: '결과' }), '인터뷰하기로 했다 / 결과');
});

test('LOUNGE_LONG_MEMORY=off turns memory reading, prompting and saving off', async () => {
  const { body, context, applied } = await memoryTurn({ env: { LOUNGE_LONG_MEMORY: 'off' }, memoryOps: [{ op: 'add', ref: '', kind: 'event', summary: '저장되면 안 됨', importance: 0.9, follow_up: '' }] });
  assert.equal(context.relationship.user_memories, undefined);
  assert.deepEqual(body.text.format.schema.required, ['text', 'memory', 'events']);
  assert.equal(applied.length, 0);
});

test('the owner of a one-to-one room can see what the character remembers, and only that character', async () => {
  let body;
  await withServiceKey(() => run(async url => {
    if (url.includes('/auth/')) return result({ id: 'user-1', email: 'user@example.com' });
    if (url.includes('voice_lounge_memories?')) return result(memoryRows);
    if (url.includes('voice_lounge_rooms?')) return result([{ host_id: 'user-1', host_persona: 'velvet', capacity: 1, ai_mood: null }]);
    if (url.includes('voice_lounge_relationships?')) return result([velvetRow]);
    throw new Error('Unexpected fetch ' + url);
  }, async () => { body = await (await handler(request({ action: 'relationship', roomId }))).json(); }));
  const remembered = body.relationship.remembered;
  assert.deepEqual(remembered.map(item => item.label), ['다음에 물어볼 일', '결정', '함께한 순간']);
  assert.equal(remembered[0].followUp, '인터뷰 결과');
  assert.ok(!JSON.stringify(remembered).includes('공감형에게만'));
  assert.ok(remembered.every(item => !('importance' in item) && !('id' in item)), 'no internal scores or ids');
});

test('relationship scores do not move without a new user turn, and a storage failure never blocks the reply', async () => {
  let saved;
  await withServiceKey(() => run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_relationships?')) return result([velvetRow]);
    if (url.includes('voice_lounge_rooms?')) return result([relationshipRoom()]);
    if (url.includes('voice_lounge_messages?')) return result([{ id: 3, nickname: 'AI', kind: 'host', text: '그래서?' }, { id: 2, user_id: 'user-1', nickname: '나', kind: 'human', text: '내가 틀렸어.' }]);
    if (url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '다른 이야기를 해 볼까.', memory: '', events: [{ type: 'ADMITS_ERROR', confidence: 0.95, note: '' }] }) }] }] });
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.includes('save_voice_lounge_relationship')) { saved = JSON.parse(init.body); return result(null); }
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1]));
    throw new Error('Unexpected fetch');
  }, async () => {
    assert.equal((await handler(request({ action: 'host', roomId, reason: 'requested', requestKind: 'topic' }))).status, 200);
    assert.deepEqual(saved.p_state.scores, velvetRow.scores, 'a topic request after the AI spoke last re-scores nothing');
    assert.equal(saved.p_state.recentEvents.length, 0);
  }));
  for (const failure of ['read', 'save']) await withServiceKey(() => run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_relationships?')) return failure === 'read' ? result({ code: '42P01' }, 404) : result([velvetRow]);
    if (url.includes('voice_lounge_rooms?')) return result([relationshipRoom()]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body);
      assert.equal(Boolean(body.text.format.schema.properties.events), failure === 'save', 'without stored state the reply uses the plain schema');
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '계속해.', memory: '', events: [] }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.includes('save_voice_lounge_relationship')) throw new TypeError('fetch failed');
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1]));
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.text()).trim().split('\n').map(line => JSON.parse(line).type), ['host', 'audio', 'done']);
  }));
});

test('rooms with other people never receive relationship context or events, whichever of the six hosts leads them', async () => {
  for (const persona of ['velvet', 'ina', 'jaeseok']) await withServiceKey(() => run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_relationships?')) return result([velvetRow]);
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '책', host_persona: persona, memory: '', capacity: 4, ai_turns: 2 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body);
      assert.equal(JSON.parse(body.input).relationship, undefined);
      assert.equal(body.text.format.schema.properties.events, undefined);
      assert.doesNotMatch(body.instructions, /relationship은/);
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '반가워요.', memory: '' }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.includes('save_voice_lounge_relationship')) throw new Error('must not save');
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1]));
    throw new Error('Unexpected fetch');
  }, async () => assert.equal((await handler(request({ action: 'host', roomId, reason: 'followup' }))).status, 200)));
});

test('the relationship endpoint returns the stage, labels and scores to players, and mood and history only to listed developers, without paid calls', async () => {
  for (const [developer, owner, persona, capacity] of [[false, true, 'velvet', 1], [true, true, 'velvet', 1], [false, false, 'velvet', 1], [false, true, 'velvet', 4]]) {
    let body;
    await withServiceKey(() => run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'user-1', email: 'Dev@Example.com' });
      if (url.includes('voice_lounge_rooms?')) return result([{ host_id: owner ? 'user-1' : 'someone-else', host_persona: persona, capacity, ai_mood: { amusement: 40 } }]);
      if (url.includes('voice_lounge_relationships?')) { assert.equal(init.headers.Authorization, 'Bearer service-key'); assert.match(url, /character_id=eq\.velvet/); return result([velvetRow]); }
      throw new Error('Unexpected fetch ' + url);
    }, async () => { body = await (await handler(request({ action: 'relationship', roomId }))).json(); }), developer ? { LOUNGE_RELATIONSHIP_DEBUG_USERS: 'other@x.com, dev@example.com' } : {});
    if (!owner || capacity !== 1) { assert.deepEqual(body, { enabled: false }); continue; }
    assert.equal(body.relationship.macroState.id, 'INTRIGUED');
    assert.equal(body.relationship.macroState.label, '흥미를 느낌');
    assert.equal(body.relationship.metrics.trust.label, '조심스러움');
    assert.equal(body.relationship.metrics.trust.score, 30, 'the status card draws every score as a bar');
    assert.equal(body.relationship.stage.index, 1); assert.equal(body.relationship.stage.total, 4); assert.equal(body.relationship.stage.next, '인정하는 상대');
    assert.ok(body.relationship.stage.progress > 0 && body.relationship.stage.progress < 1);
    assert.equal(Boolean(body.relationship.debug), developer);
    if (developer) { assert.equal(body.relationship.debug.mood.amusement, 40); assert.equal(body.relationship.debug.version, 4); }
  }
});

test('there are exactly eight hosts, each with a relationship configuration and instructions for both one-to-one and group rooms', () => {
  assert.deepEqual(lounge.loungeHosts.map(host => host.id).sort(), ['auditor', 'closer', 'diplomat', 'ina', 'jaeseok', 'lawyer', 'trickster', 'velvet']);
  for (const id of lounge.loungeRelationshipHostIds) {
    assert.ok(lounge.loungeHosts.some(host => host.id === id));
    assert.ok(relationshipLib.getRelationshipConfig(id), id);
    assert.deepEqual(relationshipLib.validateRelationshipConfig(relationshipLib.getRelationshipConfig(id)), []);
    assert.ok(lounge.loungeCharacterProfiles[id], `${id} has a lobby profile`);
  }
  assert.deepEqual(Object.keys(relationshipLib.relationshipConfigs).sort(), [...lounge.loungeRelationshipHostIds].sort());
  assert.equal(lounge.isLoungeRelationshipHost('sunny'), false);
  for (const host of lounge.loungeHosts) {
    assert.match(host.companion, /사람의 가치|사람 자체|사람이 아니다|인간으로서의 가치/, `${host.id} companion never judges the person`);
    assert.ok(host.instruction.length > 200 && host.instruction.includes('여럿일 때'), `${host.id} has a real group instruction`);
  }
});

test('a solo host turn uses one-to-one instructions and returns playable speech', async () => {
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('solo-ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화 수다', host_persona: 'jaeseok', memory: '', capacity: 1 }]);
    if (url.includes('voice_lounge_messages?')) return result([]);
    if (url.includes('voice_lounge_members?')) return result([{ nickname: '나', last_seen: '' }]);
    if (url.endsWith('/responses')) {
      const input = JSON.parse(init.body);
      assert.equal(JSON.parse(input.input).mode, 'solo');
      assert.match(input.instructions, /존재하지 않는 다른 참가자를 만들거나/);
      assert.doesNotMatch(input.instructions, /다른 사람도 참여할 수 있도록/);
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '최근에 어떤 영화 봤어요?', memory: '' }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2, 3]));
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'opening' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).audio, 'AQID');
  });
});
for (const [count, mode] of [[1, 'pair'], [2, 'pair'], [3, 'group']]) {
  test(`a six-seat room keeps the light ${mode} assistant role with ${count} active memberships, even when browsers are suspended`, async () => {
    let modelCalls = 0;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '책속으로', host_persona: 'ina', memory: '', capacity: 6 }]);
      if (url.includes('voice_lounge_messages?')) return result([]);
      if (url.includes('voice_lounge_members?')) return result([
        ...Array.from({ length: count }, (_, index) => ({ user_id: `human-${index}`, nickname: `참가자${index}`, last_seen: new Date(Date.now() - (index+1)*120_000).toISOString() })),
      ]);
      if (url.endsWith('/responses')) {
        modelCalls++;
        const payload = JSON.parse(init.body), context = JSON.parse(payload.input);
        assert.equal(context.mode, mode);
        assert.equal(context.participant_count, count);
        assert.equal(context.members.length, count);
        assert.ok(context.members.every(member => member.user_id.startsWith('human-')));
        // A group room never turns into an AI conversation because others are briefly away.
        assert.ok(payload.instructions.includes('사람끼리 이야기하는 방에 함께 있는'));
        assert.ok(!payload.instructions.includes('대화 상대다. 진행자나 인터뷰어가 아니다'));
        assert.match(payload.instructions, /너는 .+이다\./); assert.ok(payload.instructions.includes(charactersLib.loungeCharacterRules)); assert.doesNotMatch(payload.instructions, /AI 도우미다/);
        assert.doesNotMatch(payload.instructions, /현재 사람 \d+명/, 'the count is in the input, so the instructions stay cached');
        return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '어떤 생각이 남았나요?', memory: '' }) }] }] });
      }
      if (url.includes('finish_voice_lounge_host')) return result(true);
      if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2, 3]));
      throw new Error('Unexpected fetch');
    }, async () => {
      assert.equal((await handler(request({ action: 'host', roomId, reason: 'requested' }))).status, 200);
      assert.equal(modelCalls, 1, 'role selection needs no additional inference');
    });
  });
}

test('latest human utterances retain their conclusions and older context preserves both ends with attribution', async () => {
  const speech = suffix => '앞부분'.repeat(290) + suffix;
  const oldest = { id: 1, user_id: 'a', nickname: '가람', kind: 'human', text: speech('예전 생각의 결론') };
  const previous = { id: 2, user_id: 'b', nickname: '나래', kind: 'human', text: speech('책의 화자를 믿기 어려워요') };
  const latest = { id: 3, user_id: 'a', nickname: '가람', kind: 'human', text: speech('하지만 책임을 지는 선택은 이해돼요') };
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '책속으로', host_persona: 'ina', memory: '', capacity: 6 }]);
    if (url.includes('voice_lounge_messages?')) return result([{ nickname: '사회자', kind: 'host', text: '다른 생각도 있나요?' }, latest, previous, oldest]);
    if (url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) {
      const context = JSON.parse(JSON.parse(init.body).input);
      assert.equal(context.recent[0].text.length, 300);
      assert.ok(context.recent[0].text.startsWith(oldest.text.slice(0, 150)));
      assert.ok(context.recent[0].text.endsWith('예전 생각의 결론'));
      assert.deepEqual(context.recent.slice(1, 3), [previous, latest], 'latest two human turns are whole even when followed by an AI message');
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '책임에 대한 기준이 달랐군요.', memory: '' }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2, 3]));
    throw new Error('Unexpected fetch');
  }, async () => assert.equal((await handler(request({ action: 'host', roomId, reason: 'followup' }))).status, 200));
});

test('an explicit moderator request retains participant question context without taking over their answer', async () => {
  const question = '나래님은 그 선택을 왜 이해한다고 보셨나요?';
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '책속으로', host_persona: 'ina', memory: '', capacity: 6, guided_session: true }]);
    if (url.includes('voice_lounge_messages?')) return result([]);
    if (url.includes('voice_lounge_members?')) return result([
      { user_id: 'a', nickname: '가람', last_seen: new Date().toISOString() },
      { user_id: 'b', nickname: '나래', last_seen: new Date().toISOString() },
    ]);
    if (url.includes('voice_lounge_sessions?')) return result([{ stage: 3, state: 'ready', speaker_id: 'b', turn_kind: 'reply', reply_from: 'a', reply_question: question }]);
    if (url.endsWith('/responses')) {
      const payload = JSON.parse(init.body), context = JSON.parse(payload.input);
      assert.equal(context.mode, 'pair');
      assert.equal(context.session.kind, 'reply');
      assert.equal(context.session.stage_index, 3);
      assert.equal(context.session.target_user_id, 'b');
      assert.equal(context.session.target_name, '나래');
      assert.equal(context.session.reply_from, '가람');
      assert.equal(context.session.question, question);
      assert.match(payload.instructions, /네가 대신 답하거나 다시 질문을 전달하지 않는다/);
      assert.match(payload.instructions, /매 발언에 답하지 않는다/);
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: question, memory: '' }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2, 3]));
    throw new Error('Unexpected fetch');
  }, async () => assert.equal((await handler(request({ action: 'host', roomId, reason: 'requested' }))).status, 200));
});

test('transcription is gated and attributed through the authenticated member RPC', async () => {
  let paid = 0, posted = false;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'guest' });
    if (url.includes('claim_voice_lounge_audio')) return result(true);
    if (url.endsWith('/audio/transcriptions')) { paid++; assert.equal(init.body.get('model'), 'gpt-4o-mini-transcribe'); return result({ text: '산책이 좋았어요' }); }
    if (url.includes('post_voice_lounge_message')) { assert.equal(JSON.parse(init.body).p_text, '산책이 좋았어요'); posted = true; return new Response(null, { status: 204 }); }
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(request({ action: 'transcribe', roomId, audio: Buffer.alloc(400).toString('base64'), mimeType: 'audio/webm;codecs=opus' }));
    assert.equal(response.status, 200); assert.equal(paid, 1); assert.equal(posted, true);
  });
});
// No transcription prompt: on 2026-10-07 a prompt with the room topic and the AI's last sentence came back as the
// transcript of silence and of noise 6 times out of 6, and did not fix the misheard word in real speech.
test('transcription sends no prompt that could come back as the speaker\'s words', async () => {
  let form;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'guest' });
    if (url.includes('claim_voice_lounge_audio')) return result(true);
    if (url.endsWith('/audio/transcriptions')) { form = init.body; return result({ text: '인터뷰 세 명 다 했어' }); }
    if (url.includes('post_voice_lounge_message')) return new Response(null, { status: 204 });
    throw new Error('Unexpected fetch');
  }, async () => assert.equal((await handler(request({ action: 'transcribe', roomId, audio: Buffer.alloc(400).toString('base64'), mimeType: 'audio/webm;codecs=opus' }))).status, 200));
  assert.equal(form.get('prompt'), null); assert.equal(form.get('model'), 'gpt-4o-mini-transcribe');
});
test('a transcript saved inside the two-second message gap is retried once instead of failing the speaker', async () => {
  for (const [rejections, expected] of [[1, 200], [2, 429]]) {
    let paid = 0, posts = 0;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'guest' });
      if (url.includes('claim_voice_lounge_audio')) return result(true);
      if (url.endsWith('/audio/transcriptions')) { paid++; return result({ text: '이어서 말씀드리면요' }); }
      if (url.includes('post_voice_lounge_message')) {
        posts++;
        return posts <= rejections ? result({ code: 'P0001', message: '조금만 천천히 이야기해 주세요.' }, 400) : new Response(null, { status: 204 });
      }
      throw new Error('Unexpected fetch');
    }, async () => {
      const response = await handler(request({ action: 'transcribe', roomId, audio: Buffer.alloc(400).toString('base64'), mimeType: 'audio/webm;codecs=opus' }));
      assert.equal(response.status, expected);
      const body = await response.json();
      if (expected === 200) assert.equal(body.posted, true);
      else { assert.equal(body.code, 'lounge_message_too_fast'); assert.equal(body.retryable, true); assert.ok(body.retryAfterSeconds <= 3); }
      assert.equal(paid, 1, 'the paid transcription is never repeated');
      assert.equal(posts, 2, 'saving is attempted at most twice');
    });
  }
});
test('cost estimate counts aggregate speaking minutes instead of room duration per participant', () => {
  const cost = lounge.estimateLoungeCost(55);
  assert.ok(Math.abs(cost.total - .3084) < .000001);
  assert.ok(Math.abs(lounge.estimateLoungeCost(360).total - 1.2234) < .000001);
});

test('solo responds to a new human turn promptly, while group pacing and the room budget stay intact', () => {
  const now = Date.now();
  const room = { status: 'active', capacity: 1, ai_turns: 2, last_ai_at: new Date(now - 6000).toISOString(), started_at: new Date(now - 10_000).toISOString() };
  const messages = [{ id: 1, kind: 'host', created_at: room.last_ai_at }, { id: 2, kind: 'human', created_at: new Date(now - 500).toISOString() }];
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 1600, now - 6000, now - 1600, now - 150), 'followup', 'replies 0.7 s after the user stops and 0.1 s after the transcript');
  assert.equal(lounge.nextLoungeHostReason({ ...room, capacity: 6 }, messages, now, now - 500, now - 4000), null);
  assert.equal(lounge.nextLoungeHostReason(room, [...messages, { id: 3, kind: 'host', created_at: new Date(now).toISOString() }], now, now - 500, now - 4000), null, 'do not answer the same human twice');
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now, now - 4000), null, 'wait until the human finishes');
  assert.equal(lounge.nextLoungeHostReason({ ...room, ai_turns: 120 }, messages, now, now - 500, 0), null);
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 500, now - 6000, now - 3500, now - 1200), null, 'a short pause is not the end of the turn');
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 2500, now - 6000, now - 1000, now - 1200), null, 'wait after the AI finishes speaking');
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 2500, now - 6000, now - 3500, now - 50), null, 'settle after transcription is saved');
  assert.equal(lounge.loungeSpeechPauseMs(1), 700);
  assert.equal(lounge.loungeSpeechPauseMs(6), 950);
  // A chat has no voice to wait out: a message is answered right after the last reply, guarded only against a loop.
  const chat = { ...room, space_id: null, voice_on: false };
  assert.equal(lounge.nextLoungeHostReason(chat, messages, now, now - 100, now - 1500, now - 100, now - 50), 'followup');
  assert.equal(lounge.nextLoungeHostReason(chat, messages, now, now - 100, now - 500, now - 100, now - 50), null, 'one second between two turns');
  assert.equal(lounge.nextLoungeHostReason({ ...chat, voice_on: true }, messages, now, now - 100, now - 1500, now - 100, now - 50), null, 'with the voice on it waits as before');
  assert.equal(lounge.loungeHostCooldownMs(1, true), 1000); assert.equal(lounge.loungeHostCooldownMs(1), 2000);
});

test('human rooms wait through short pauses and never automatically follow up an ordinary participant utterance', () => {
  const now=Date.now();
  const room={status:'active',capacity:3,ai_turns:2,last_ai_at:new Date(now-130_000).toISOString(),started_at:new Date(now-200_000).toISOString()};
  const messages=[{id:1,kind:'host',created_at:room.last_ai_at},{id:2,kind:'human',text:'소연님, 어떻게 생각해요?',created_at:new Date(now-5000).toISOString()}];
  assert.equal(lounge.nextLoungeHostReason(room,messages,now,now-5000,now-31_000),null,'a question to another person is for that person');
  const quietFor=ms=>[messages[0],{...messages[1],created_at:new Date(now-ms).toISOString()}];
  assert.equal(lounge.nextLoungeHostReason(room,quietFor(31_000),now,now-31_000,now-31_000),null,'thirty seconds is still thinking time');
  assert.equal(lounge.nextLoungeHostReason(room,quietFor(41_000),now,now-41_000,now-41_000),'silence');
  assert.equal(lounge.nextLoungeHostReason({...room,last_ai_at:new Date(now-90_000).toISOString()},quietFor(41_000),now,now-41_000,now-41_000),null,'two minutes between silence prompts');
  assert.equal(lounge.nextLoungeHostReason(room,[{...messages[1],id:1,created_at:new Date(now-60_000).toISOString()},{id:2,kind:'host',created_at:room.last_ai_at}],now,now-60_000,now-41_000),null,'never twice into the same silence');
  assert.equal(lounge.nextLoungeHostReason({...room,moderator_requested_at:new Date(now-2000).toISOString()},messages,now,now-5000,now-31_000),'requested');
  assert.equal(lounge.nextLoungeHostReason({...room,moderator_requested_at:new Date(now-2000).toISOString()},messages,now,now-500,now-31_000),null,'a request waits for the speaker to finish');
  assert.equal(lounge.nextLoungeHostReason(room,messages,now,now-5000,now-11_000,now-4000,now-1200),null,'a group room with one present human still never replies to each utterance');
  assert.equal(lounge.loungeHostCooldownMs(3),10_000);
  assert.equal(sessionLib.loungeStageNeedsOpening({stage:0,announced_stage:0,turn_id:'next-person'}),false);
  assert.equal(sessionLib.loungeStageNeedsOpening({stage:1,announced_stage:0}),true);
  assert.equal(sessionLib.loungeStageNeedsOpening({stage:3,announced_stage:1}),false,'topic cards are not announced by the AI');
  assert.equal(sessionLib.loungeStageNeedsOpening({stage:5,announced_stage:1}),true);
});

test('one-to-one never prompts on its own while the person is quiet', () => {
  const now=Date.now();
  const room={status:'active',capacity:1,ai_turns:3,last_ai_at:new Date(now-300_000).toISOString(),started_at:new Date(now-400_000).toISOString()};
  const messages=[{id:1,kind:'human',created_at:new Date(now-310_000).toISOString()},{id:2,kind:'host',created_at:room.last_ai_at}];
  assert.equal(lounge.nextLoungeHostReason(room,messages,now,now-300_000,now-300_000,now-300_000,now-300_000),null);
});

test('free discussion admits a requested AI response and keeps every-turn silence in its prompt', async () => {
  await run(async(url,init)=>{
    if(url.includes('/auth/'))return result({id:'host'});
    if(url.includes('claim_voice_lounge_host')){assert.equal(JSON.parse(init.body).p_reason,'requested');return result('ticket');}
    if(url.includes('voice_lounge_rooms?'))return result([{topic:'책 이야기',host_persona:'ina',memory:'',capacity:3,guided_session:true}]);
    if(url.includes('voice_lounge_messages?'))return result([{nickname:'소연',kind:'human',text:'사회자, 이 인물의 선택은 어떻게 생각해?'}]);
    if(url.includes('voice_lounge_members?'))return result([{user_id:'a',nickname:'민수',last_seen:''},{user_id:'b',nickname:'소연',last_seen:''}]);
    if(url.includes('voice_lounge_sessions?'))return result([{stage:2,state:'free',turn_kind:'basic',speaker_id:null}]);
    if(url.endsWith('/responses')){const body=JSON.parse(init.body);assert.equal(JSON.parse(body.input).reason,'requested');assert.match(body.instructions,/참가자의 발언 종료는 사회자에게 답변하라는 요청이 아니다/);assert.match(body.instructions,/매 발언에 답하지 않는다/);return result({output:[{content:[{type:'output_text',text:JSON.stringify({text:'저는 그 선택이 책임과 자유 사이의 갈등으로 읽혀요.',memory:''})}]}]});}
    if(url.includes('finish_voice_lounge_host'))return result(true);
    if(url.endsWith('/audio/speech'))return new Response(new Uint8Array([0,32]));
    throw new Error('Unexpected fetch');
  },async()=>assert.equal((await handler(request({action:'host',roomId,reason:'requested'}))).status,200));
});

test('retired AI summaries and timed ending notices are rejected before any paid or database call', async () => {
  for (const reason of ['round_summary', 'free_ending']) {
    let calls = 0;
    await run(async url => { if (!url.includes('/auth/')) calls++; return result({ id: 'host' }); }, async () => {
      assert.equal((await handler(request({ action: 'host', roomId, reason }))).status, 400);
    });
    assert.equal(calls, 0);
  }
  let calls = 0;
  await run(async url => { if (!url.includes('/auth/')) calls++; return result({ id: 'host' }); }, async () => {
    assert.equal((await handler(request({ action: 'host', roomId, reason: 'requested', requestKind: 'lecture' }))).status, 400);
  });
  assert.equal(calls, 0, 'an unknown help kind never claims a turn');
});

test('group help follows the requested kind and each scheduled announcement stays short', async () => {
  const cases = [
    { reason: 'requested', kind: undefined, stored: 'summary', expect: 'summary', session: { stage: 2, state: 'free' } },
    { reason: 'requested', kind: 'question', stored: 'spark', expect: 'question', session: { stage: 3, state: 'free' } },
    { reason: 'requested', kind: 'opinion', stored: 'spark', expect: 'opinion', session: { stage: 3, state: 'free' } },
    { reason: 'requested', kind: undefined, stored: 'opinion', expect: 'opinion', session: { stage: 2, state: 'free' } },
    { reason: 'requested', kind: undefined, stored: 'direct', expect: 'direct', session: { stage: 2, state: 'free' } },
    { reason: 'opening', session: { stage: 1, state: 'ready', speaker_id: 'b' }, rule: /stage_index=1이면 자기소개에서 이어지는 첫 이야기다. 1~2문장, 150자 이내/ },
    { reason: 'opening', session: { stage: 5, state: 'ready', speaker_id: 'a' }, rule: /stage_index=5이면 마무리다. 1~2문장, 120자 이내/ },
    { reason: 'silence', session: { stage: 2, state: 'free' }, rule: /reason=silence이면 사람들이 대화를 이어 가다 길게 멈춘 상황이다. 재촉하지 않는 한 문장, 100자 이내/ },
  ];
  for (const item of cases) await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) { assert.equal(JSON.parse(init.body).p_reason, item.reason); return result('ticket'); }
    // Every column is read (moderator_request_kind among them), so a database without newer columns still answers.
    if (url.includes('voice_lounge_rooms?')) { assert.match(url, /select=\*/); return result([{ topic: '책 이야기', host_persona: 'jaeseok', memory: '', capacity: 4, ai_turns: 5, guided_session: true, topic_brief: topicBrief, moderator_request_kind: item.stored ?? null }]); }
    if (url.includes('voice_lounge_sessions?')) return result([{ turn_kind: 'basic', speaker_id: null, ...item.session }]);
    if (url.includes('voice_lounge_messages?')) { assert.doesNotMatch(url, /kind=eq.human/, 'no whole-round summary read'); return result([{ nickname: '소연', kind: 'human', text: '저는 결말이 좋았어요.' }]); }
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'a', nickname: '민수', last_seen: '' }, { user_id: 'b', nickname: '소연', last_seen: '' }, { user_id: 'c', nickname: '지우', last_seen: '' }]);
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body), context = JSON.parse(body.input);
      assert.equal(context.mode, 'group'); assert.equal(context.request_kind, item.expect);
      assert.equal(context.round_speeches, undefined); assert.equal(context.session.next_stage, undefined);
      assert.ok(['round', 'free'].includes(context.session.phase));
      assert.match(body.instructions, /사람끼리 대화하는 방에서는 매 발언에 답하지 않는다/);
      assert.match(body.instructions, /질문은 많아야 하나다/);
      assert.match(body.instructions, /조용한 사람에게 답을 요구하지 않는다/);
      assert.match(body.instructions, /- summary: 지금까지 나온 서로 다른 생각 2~3가지를 실제 발언만으로 짧게 묶는다/);
      assert.match(body.instructions, /- direct: 누군가 너를 직접 불러 물었다/);
      // "AI 의견 듣기" deepens the talk that is going on: no new topic, one view with its reason, no verdict on the people.
      assert.match(body.instructions, /- opinion: 지금 사람들이 나누고 있는 이야기에 대한 네 의견을 듣고 싶다는 요청이다. 새 화제로 넘어가지 않고/);
      assert.match(body.instructions, /참가자의 의견을 판정하거나 대신 정하지 않고/);
      assert.doesNotMatch(body.instructions, /round_summary|free_ending|4~9문장|4~6문장/);
      if (item.rule) assert.match(body.instructions, item.rule);
      assert.equal(body.max_output_tokens, 1000, 'room for the reply and a 600-character memory with headroom');
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '다른 장면도 떠오르세요?', memory: '' }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 32]));
    throw new Error('Unexpected fetch');
  }, async () => assert.equal((await handler(request({ action: 'host', roomId, reason: item.reason, ...(item.kind ? { requestKind: item.kind } : {}) }))).status, 200));
});

test('guided scheduling announces only the greeting, the first topic and the closing', () => {
  const session = { stage: 2, state: 'free', announced_stage: 1, stage_started_at: new Date(Date.now() - 3_600_000).toISOString() };
  assert.equal(sessionLib.loungeSessionHostReason(session), null, 'topic cards and time never trigger AI speech');
  assert.equal(sessionLib.loungeSessionHostReason({ ...session, stage: 1, state: 'free', announced_stage: 0 }), 'opening');
  assert.equal(sessionLib.loungeSessionHostReason({ ...session, stage: 1, announced_stage: 1 }), null);
  assert.equal(sessionLib.loungeSessionHostReason({ ...session, stage: 0, state: 'ready', announced_stage: -1 }), 'opening');
  assert.equal(sessionLib.loungeSessionHostReason({ ...session, stage: 5, state: 'ready' }), 'opening');
  assert.equal(sessionLib.loungeSessionHostReason({ ...session, stage: 5, state: 'speaking' }), null);
  assert.equal(sessionLib.loungeSessionHostReason({ ...session, state: 'summarizing' }), null);
  assert.deepEqual([...sessionLib.loungeAnnouncedStages], [0, 1, 5]);
  assert.deepEqual(lounge.loungeHelpOptions.map(option => option.kind), ['spark', 'question', 'opinion', 'topic', 'summary']);
  assert.equal(lounge.loungeHelpOptions.find(option => option.kind === 'opinion').label, 'AI 의견 듣기');
  assert.ok(lounge.isLoungeHelpKind('opinion') && !lounge.isLoungeHelpKind('lecture'));
});

test('moderator context follows the stored category instead of a shared film discussion outline', async () => {
  for (const [category, subcategory, title] of [
    ['media', 'film', '기억에 남는 장면'], ['media', 'book', '마음에 남은 문장과 대목'],
    ['hobby', 'general', '나의 경험과 발견'], ['love', 'general', '마음이 어려웠던 상황'],
    ['career', 'general', '일하며 겪은 경험'], ['finance', 'general', '투자·소비 경험 돌아보기'],
    ['education', 'general', '실제 육아·교육 경험'],
  ]) {
    const brief = { category, subcategory, work_title: category === 'media' ? '작품' : '', creator: category === 'media' ? '창작자' : '', reason: '서로의 경험을 듣고 싶어서', discussion: '다른 생각과 선택 기준을 나눠요.' };
    let checked = false;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '오늘 함께 이야기할 주제', topic_brief: brief, host_persona: 'ina', memory: '', capacity: 3, guided_session: true }]);
      if (url.includes('voice_lounge_messages?')) return result([]);
      if (url.includes('voice_lounge_members?')) return result([{ user_id: 'a', nickname: '가람', last_seen: '' }, { user_id: 'b', nickname: '나래', last_seen: '' }]);
      if (url.includes('voice_lounge_sessions?')) return result([{ stage: 2, state: 'free', turn_kind: 'basic', speaker_id: null }]);
      if (url.endsWith('/responses')) {
        const body = JSON.parse(init.body), context = JSON.parse(body.input);
        assert.equal(context.session.stage, title);
        assert.equal(context.topic_brief.category, category);
        if (category !== 'media') assert.doesNotMatch(context.session.question, /장면|대사|결말|반전/);
        if (subcategory === 'book') assert.match(context.session.question, /문장|대목/);
        assert.match(body.instructions, /대본에 맞추려고 끊지 않는다/);
        checked = true;
        return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '함께 나누고 싶은 경험이 있나요?', memory: '' }) }] }] });
      }
      if (url.includes('finish_voice_lounge_host')) return result(true);
      if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 32]));
      throw new Error('Unexpected fetch');
    }, async () => assert.equal((await handler(request({ action: 'host', roomId, reason: 'requested', topic_brief: topicBrief }))).status, 200));
    assert.ok(checked, `${category}/${subcategory} did not reach the moderator`);
  }
});

test('host PCM packets arrive before upstream completion and cancelling stops the paid stream', async () => {
  let upstream, cancelled = false, paid = 0;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '어떤 영화 봤어요?', memory: '' }) }] }] });
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) {
      paid++;
      assert.equal(JSON.parse(init.body).response_format, 'pcm');
      return new Response(new ReadableStream({ start(controller) { upstream = controller; }, cancel() { cancelled = true; } }));
    }
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
    assert.match(response.headers.get('content-type'), /ndjson/);
    const reader = response.body.getReader();
    const header = JSON.parse(new TextDecoder().decode((await reader.read()).value));
    assert.equal(header.type, 'host'); assert.equal(header.text, '어떤 영화 봤어요?');
    upstream.enqueue(new Uint8Array([0, 128, 255, 127]));
    const packet = JSON.parse(new TextDecoder().decode((await reader.read()).value));
    assert.equal(packet.type, 'audio'); assert.equal(packet.audio, 'AID/fw==');
    assert.equal(cancelled, false, 'audio arrived while upstream remains open');
    await reader.cancel();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cancelled, true); assert.equal(paid, 1);
  });
});

const sse = (events, gate) => new Response(new ReadableStream({ async start(controller) {
  const encoder = new TextEncoder();
  for (const event of events) {
    if (event === 'gate') { await gate; continue; }
    controller.enqueue(encoder.encode(`event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`));
  }
  controller.close();
} }), { headers: { 'Content-Type': 'text/event-stream' } });
const deltas = (json, split) => [json.slice(0, split), json.slice(split)].map(delta => ({ type: 'response.output_text.delta', delta }));
// A one-to-one reply writes only its text; the call after it (told apart by its format name) writes the summary,
// relationship events, memory changes and photo.
const isAfterReply = init => JSON.parse(init.body).text?.format?.name === 'lounge_after_reply';
const modelAnswer = answer => result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] });
const typesOf = events => events.map(event => event.type);

test('one-to-one speech starts once the reply sentence is complete; the reply is saved at once and the call after it writes the summary and events', async () => {
  const reply = { text: '네 주장이지. "근거"는 아직이야.' };
  const later = { memory: '사용자는 마케팅 탓을 했다.', events: [{ type: 'FLATTERS_CHARACTER', confidence: 0.95, note: '내용 없이 칭찬' }] };
  const json = JSON.stringify(reply);
  let release, speechStartedBeforeRelease = false, released = false, finish, summary, saved, replyBody, afterBody;
  const gate = new Promise(resolve => { release = () => { released = true; resolve(); }; });
  await withServiceKey(() => run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_relationships?')) return result([]);
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '실패 원인', host_persona: 'auditor', memory: '이전 기억', capacity: 1, ai_turns: 3 }]);
    if (url.includes('voice_lounge_messages?')) return result([{ id: 2, user_id: 'user-1', nickname: '나', kind: 'human', text: '다 마케팅 탓이야.' }]);
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'user-1', nickname: '나', last_seen: '' }]);
    if (url.endsWith('/responses') && isAfterReply(init)) { afterBody = JSON.parse(init.body); return modelAnswer(later); }
    if (url.endsWith('/responses')) {
      replyBody = JSON.parse(init.body);
      assert.equal(replyBody.stream, true);
      // The text string closes in the first chunk; the end of the JSON waits on the gate.
      return sse([...deltas(json, json.length - 1).slice(0, 1), 'gate', deltas(json, json.length - 1)[1], { type: 'response.completed', response: { status: 'completed' } }], gate);
    }
    if (url.endsWith('/audio/speech')) {
      speechStartedBeforeRelease = !released;
      assert.equal(JSON.parse(init.body).input, reply.text);
      setTimeout(release, 20);
      return new Response(new Uint8Array([0, 1, 2, 3]));
    }
    if (url.includes('finish_voice_lounge_reply')) { finish = JSON.parse(init.body); return result(true); }
    if (url.includes('save_voice_lounge_room_memory')) { summary = JSON.parse(init.body); return result(true); }
    if (url.includes('save_voice_lounge_relationship')) { saved = JSON.parse(init.body); return result(1); }
    throw new Error('Unexpected fetch ' + url);
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(typesOf(events).sort(), ['audio', 'done', 'host', 'relationship', 'saved']);
    assert.equal(events[0].type, 'host'); assert.equal(events.at(-1).type, 'done');
    assert.equal(events[0].text, reply.text, 'escaped quotes in the reply survive early extraction');
    assert.ok(speechStartedBeforeRelease, 'speech started before the reply call had finished');
    assert.deepEqual(Object.keys(replyBody.text.format.schema.properties), ['text'], 'the reply writes only what is said');
    assert.doesNotMatch(replyBody.instructions, /events: 사용자의 가장 최근 발언/, 'the reply is not asked to classify');
    assert.deepEqual(finish, { p_room: roomId, p_ticket: 'ticket', p_text: reply.text }, 'the reply is saved without the summary');
    assert.equal(JSON.parse(afterBody.input).recent.at(-1).text, reply.text, 'the call after the reply reads it');
    assert.match(afterBody.instructions, /events: 사용자의 가장 최근 발언/);
    assert.deepEqual(summary, { p_room: roomId, p_memory: later.memory, p_turn: 3 }, 'the summary is saved with its turn, so an older one never replaces a newer');
    assert.equal(saved.p_state.recentEvents.at(-1).type, 'FLATTERS_CHARACTER', 'events from the call after the reply update the relationship');
    // The chat's status card gets the saved state and what the message changed, before the stream ends.
    const changed = events.find(event => event.type === 'relationship');
    assert.ok(events.indexOf(changed) < events.length - 1);
    assert.equal(changed.relationship.macroState.id, saved.p_state.stage);
    assert.deepEqual(changed.change.events, [{ type: 'FLATTERS_CHARACTER', label: '빈 칭찬', up: false }]);
    assert.ok(Object.values(changed.change.delta).every(value => Number.isInteger(value) && value !== 0) && Object.values(changed.change.delta).some(value => value < 0));
  }));
});

test('a plain commentary message before the JSON answer is ignored, streamed or not', async () => {
  const reply = { text: '인터뷰는 해봤어?', memory: '기억', events: [] };
  const commentary = '인터뷰는 해봤어?';
  const streamed = [
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', phase: 'commentary' } },
    { type: 'response.output_text.delta', output_index: 0, delta: commentary },
    { type: 'response.output_item.added', output_index: 1, item: { type: 'message', phase: 'final_answer' } },
    ...deltas(JSON.stringify(reply), 12).map(event => ({ ...event, output_index: 1 })),
    { type: 'response.completed', response: { status: 'completed' } },
  ];
  const whole = { status: 'completed', output: [{ phase: 'commentary', content: [{ type: 'output_text', text: commentary }] }, { phase: 'final_answer', content: [{ type: 'output_text', text: JSON.stringify(reply) }] }] };
  for (const stream of [true, false]) {
    let finish, memory;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'user-1' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '요즘 고민', host_persona: 'auditor', memory: '', capacity: 1, ai_turns: 1 }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses') && isAfterReply(init)) return modelAnswer({ memory: reply.memory, events: [] });
      if (url.endsWith('/responses')) return stream ? sse(streamed) : result(whole);
      if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 1]));
      if (url.includes('finish_voice_lounge_')) { finish = JSON.parse(init.body); memory ??= finish.p_memory; return result(true); }
      if (url.includes('save_voice_lounge_room_memory')) { memory = JSON.parse(init.body).p_memory; return result(true); }
      throw new Error('Unexpected fetch ' + url);
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'opening', stream }));
      if (stream) assert.deepEqual(typesOf((await response.text()).trim().split('\n').map(line => JSON.parse(line))).filter(type => type !== 'saved'), ['host', 'audio', 'done']);
      else assert.equal(response.status, 200);
    });
    assert.equal(finish.p_text, reply.text, `stream=${stream}`); assert.equal(memory, reply.memory, `stream=${stream}`);
  }
});

test('a JSON answer that arrives in a commentary message is still used, streamed or not', async () => {
  const reply = { text: '그래서 결과는?', memory: '기억', events: [] };
  const streamed = [
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', phase: 'commentary' } },
    ...deltas(JSON.stringify(reply), 10).map(event => ({ ...event, output_index: 0 })),
    { type: 'response.completed', response: { status: 'completed' } },
  ];
  const whole = { status: 'completed', output: [{ phase: 'commentary', content: [{ type: 'output_text', text: JSON.stringify(reply) }] }] };
  for (const stream of [true, false]) {
    let finish, memory;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'user-1' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '요즘 고민', host_persona: 'auditor', memory: '', capacity: 1, ai_turns: 2 }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses') && isAfterReply(init)) return modelAnswer({ memory: reply.memory, events: [] });
      if (url.endsWith('/responses')) return stream ? sse(streamed) : result(whole);
      if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 1]));
      if (url.includes('finish_voice_lounge_')) { finish = JSON.parse(init.body); memory ??= finish.p_memory; return result(true); }
      if (url.includes('save_voice_lounge_room_memory')) { memory = JSON.parse(init.body).p_memory; return result(true); }
      throw new Error('Unexpected fetch ' + url);
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream }));
      if (stream) assert.deepEqual(typesOf((await response.text()).trim().split('\n').map(line => JSON.parse(line))).filter(type => type !== 'saved'), ['host', 'audio', 'done']);
      else assert.equal(response.status, 200);
    });
    assert.equal(finish.p_text, reply.text, `stream=${stream}`); assert.equal(memory, reply.memory, `stream=${stream}`);
  }
});

test('if the reply is cut off after its sentence, the spoken sentence is saved; a failed call after it keeps the previous summary', async () => {
  const head = JSON.stringify({ text: '좋아, 그 근거는 볼 만해.', memory: '' }).replace(/"memory":""\}$/, '"memory":"사용자는 전환율');
  let finish, summary;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '실패 원인', host_persona: 'ina', memory: '이전 기억', capacity: 1, ai_turns: 3 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses') && isAfterReply(init)) return result({ error: { code: 'server_error' } }, 500);
    if (url.endsWith('/responses')) return sse([{ type: 'response.output_text.delta', delta: head }, { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } }]);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 1]));
    if (url.includes('finish_voice_lounge_reply')) { finish = JSON.parse(init.body); return result(true); }
    if (url.includes('save_voice_lounge_room_memory')) { summary = JSON.parse(init.body); return result(true); }
    throw new Error('Unexpected fetch ' + url);
  }, async () => {
    const events = (await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(typesOf(events).filter(type => type !== 'saved'), ['host', 'audio', 'done'], 'a failed call after the reply is not an error for the conversation');
    assert.equal(finish.p_text, '좋아, 그 근거는 볼 만해.');
    assert.equal(summary, undefined, 'the summary saved before stays');
  });
  // A database without the migration saves the reply the old way, keeping the summary.
  let legacy;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '실패 원인', host_persona: 'ina', memory: '이전 기억', capacity: 1, ai_turns: 3 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses') && isAfterReply(init)) return modelAnswer({ memory: '새 요약' });
    if (url.endsWith('/responses')) return modelAnswer({ text: '좋아, 그 근거는 볼 만해.' });
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 1]));
    if (url.includes('finish_voice_lounge_reply') || url.includes('save_voice_lounge_room_memory')) return result({ code: 'PGRST202' }, 404);
    if (url.includes('finish_voice_lounge_host')) { legacy = JSON.parse(init.body); return result(true); }
    throw new Error('Unexpected fetch ' + url);
  }, async () => {
    const events = (await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text()).trim().split('\n').map(line => JSON.parse(line));
    assert.ok(typesOf(events).includes('saved'));
    assert.deepEqual(legacy, { p_room: roomId, p_ticket: 'ticket', p_text: '좋아, 그 근거는 볼 만해.', p_memory: '이전 기억' });
  });
  // A failure before any sentence becomes a stream error, as before.
  await run(async url => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '실패 원인', host_persona: 'ina', memory: '', capacity: 1, ai_turns: 3 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) return result({ error: { code: 'insufficient_quota', type: 'insufficient_quota' } }, 429);
    if (url.includes('finish_voice_lounge_host') || url.endsWith('/audio/speech')) throw new Error('nothing to save or speak');
    throw new Error('Unexpected fetch ' + url);
  }, async () => {
    const events = (await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events, [{ type: 'error', error: events[0].error, code: 'openai_quota_exceeded', retryable: false, retryAfterSeconds: undefined }].map(event => JSON.parse(JSON.stringify(event))));
  });
});

test('the reply sentence is read from a partial JSON stream only once its string is closed', () => {
  const { replyTextSoFar } = compile('../api/lounge.ts', path => path.endsWith('loungeStudy') ? study : path.endsWith('loungeFilmStudy') ? filmStudy : path.endsWith('loungeSession') ? sessionLib : path.endsWith('/relationship') ? relationshipLib : lounge);
  assert.equal(replyTextSoFar('{"text":"아직 말하는 중'), undefined);
  assert.equal(replyTextSoFar('{"text":"그건 \\"근거\\"가 아니야.\\n다시'), undefined);
  assert.equal(replyTextSoFar('{"text":"그건 \\"근거\\"가 아니야.\\n다시.","mem'), '그건 "근거"가 아니야.\n다시.');
  assert.equal(replyTextSoFar('{ "text" : "끝\\\\", "memory": ""}'), '끝\\');
  assert.equal(replyTextSoFar('{"memory":"먼저","text":"나중"}'), undefined, 'another key first waits for the full reply');
});

test('a reply that runs on past its end with a brace and garbage is cut there, as it streams and when saved', () => {
  const { replyTextSoFar, replyTextPartial, withoutRunawayTail } = compile('../api/lounge.ts', path => path.endsWith('loungeStudy') ? study : path.endsWith('loungeFilmStudy') ? filmStudy : path.endsWith('loungeSession') ? sessionLib : path.endsWith('/relationship') ? relationshipLib : lounge);
  // Seen on 2026-10-23: a curly quote and a brace inside the text, then other scripts.
  const runaway = '*나는 빈손을 들어 보인다.* “문 닫으실 때까지 여기 있겠습니다.”}RGCTX}જરાત_final 北京赛车投注 eriwa} William';
  assert.equal(withoutRunawayTail(runaway), '*나는 빈손을 들어 보인다.* “문 닫으실 때까지 여기 있겠습니다.”');
  assert.equal(withoutRunawayTail('그냥 평범한 답.'), '그냥 평범한 답.');
  assert.equal(replyTextSoFar(JSON.stringify({ text: runaway }).slice(0, -1) + ',"x'), '*나는 빈손을 들어 보인다.* “문 닫으실 때까지 여기 있겠습니다.”');
  assert.equal(replyTextPartial(JSON.stringify({ text: runaway }).slice(0, -10)), '*나는 빈손을 들어 보인다.* “문 닫으실 때까지 여기 있겠습니다.”');
});

test('a chat shows the reply sentence while it is written, decoding escapes and waiting for half-arrived ones', () => {
  const { replyTextPartial } = compile('../api/lounge.ts', path => path.endsWith('loungeStudy') ? study : path.endsWith('loungeFilmStudy') ? filmStudy : path.endsWith('loungeSession') ? sessionLib : path.endsWith('/relationship') ? relationshipLib : lounge);
  assert.equal(replyTextPartial('{"tex'), undefined);
  assert.equal(replyTextPartial('{"text":"'), '');
  assert.equal(replyTextPartial('{"text":"*잔을 내려놓으며* 그건 \\"근거\\"'), '*잔을 내려놓으며* 그건 "근거"');
  assert.equal(replyTextPartial('{"text":"줄바꿈\\'), '줄바꿈', 'a backslash whose letter has not arrived waits');
  assert.equal(replyTextPartial('{"text":"하트 \\u2764'), '하트 ❤');
  assert.equal(replyTextPartial('{"text":"하트 \\u27'), '하트 ', 'a half-arrived \\u escape waits');
  assert.equal(replyTextPartial('{"text":"다 썼어.","memory":"'), '다 썼어.', 'stops at the end of the sentence');
  assert.equal(replyTextPartial('{"memory":"먼저","text":"나중"'), undefined);
});

test('long moderator speech survives the former 25-second deadline and 3MB PCM cap', async () => {
  // A request's deadline is the last timer set before its fetch.
  const originalSetTimeout = globalThis.setTimeout;
  const deadlines = [];
  globalThis.setTimeout = (callback, milliseconds, ...args) => { deadlines.push({ milliseconds }); return originalSetTimeout(callback, milliseconds, ...args); };
  const text = '마지막 장면에서 서로 다른 선택을 하는 이유를 함께 이야기해 봐요. '.repeat(20).slice(0, 600);
  const spokenInputs = [];
  try {
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text, memory: '' }) }] }] });
      if (url.includes('finish_voice_lounge_host')) { assert.equal(JSON.parse(init.body).p_text, text); return result(true); }
      if (url.endsWith('/audio/speech')) {
        spokenInputs.push(JSON.parse(init.body).input);
        // Every sentence gets more than the former 25 seconds.
        assert.ok(deadlines.at(-1).milliseconds > 25_001, 'speech was given only 25 seconds');
        return new Response(new ReadableStream({ start(controller) { for (let index = 0; index < 256; index++) controller.enqueue(new Uint8Array(16_384)); controller.close(); } }));
      }
      throw new Error('Unexpected fetch');
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
      const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(events[0].text, text); assert.equal(events.at(-1).type, 'done');
      assert.equal(events.some(event => event.type === 'error'), false);
      assert.deepEqual(spokenInputs, [text], 'the whole reply is spoken by one request');
      const bytes = events.filter(event => event.type === 'audio').reduce((size, event) => size + Buffer.from(event.audio, 'base64').length, 0);
      assert.equal(bytes, 4_194_304, 'more than the former 3MB cap');
    });
  } finally { globalThis.setTimeout = originalSetTimeout; }
});

test('a one-to-one room is a chat until its voice is turned on; *actions* are shown, never read aloud', () => {
  assert.equal(lounge.isLoungeChatRoom({ capacity: 1, space_id: null, voice_on: false }), true);
  assert.equal(lounge.isLoungeChatRoom({ capacity: 1, space_id: null, voice_on: true }), false);
  assert.equal(lounge.isLoungeChatRoom({ capacity: 1, space_id: null }), false, 'a room from before the chat migration keeps its voice');
  assert.equal(lounge.isLoungeChatRoom({ capacity: 4, space_id: null, voice_on: false }), false, 'rooms with other people use voice');
  assert.equal(lounge.isLoungeChatRoom({ capacity: 1, space_id: 'rooftop', voice_on: false }), false, 'a space table uses voice');
  assert.deepEqual(lounge.splitLoungeActions('*잔을 내려놓으며* 그래서, 결론은요?'), [{ action: true, text: '잔을 내려놓으며' }, { action: false, text: ' 그래서, 결론은요?' }]);
  assert.deepEqual(lounge.splitLoungeActions('별표 *하나만 있으면 그대로'), [{ action: false, text: '별표 *하나만 있으면 그대로' }]);
  assert.equal(lounge.loungeSpokenText('*웃으며* 좋아요. *고개를 끄덕인다* 그렇게 해요.'), '좋아요. 그렇게 해요.');
  assert.equal(lounge.loungeSpokenText('*조용히 웃는다*'), '');
  assert.equal(lounge.loungeSpokenText("*'…생각보다 재밌잖아.'* 좋아요."), '좋아요.', 'a thought is not read aloud either');
  // Every voice plays out the feeling in the words, in its own character.
  assert.ok(lounge.loungeSpeechRequest('velvet', '와, 진짜요?', 'pcm').instructions.includes(lounge.loungeSpeechExpression));
  assert.ok(JSON.stringify(lounge.loungeGeminiSpeechRequest('diplomat', '와, 진짜요?')).includes(lounge.loungeSpeechExpression));
});

const chatTurn = async ({ voiceOn, replyText, photo, anonymous = false }) => {
  const spoken = [];
  let input, instructions, schema, events, after, summary;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host', is_anonymous: anonymous });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1, space_id: null, voice_on: voiceOn, ai_turns: 2 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses') && isAfterReply(init)) { after = JSON.parse(init.body); return modelAnswer({ memory: '영화 이야기를 했다.', ...(photo ?? {}) }); }
    if (url.endsWith('/responses')) { const body = JSON.parse(init.body); ({ instructions } = body); schema = body.text.format.schema; input = JSON.parse(body.input); return modelAnswer({ text: replyText }); }
    if (url.includes('finish_voice_lounge_reply')) return result(true);
    if (url.includes('save_voice_lounge_room_memory')) { summary = JSON.parse(init.body); return result(true); }
    if (url.endsWith('/audio/speech')) { spoken.push(JSON.parse(init.body).input); return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4_800)); controller.close(); } })); }
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
    events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  });
  return { spoken, input, instructions, schema, events, after, summary };
};

test('a member\'s character speaks as itself, with its own relationship type; an uploaded portrait sends no photos', async () => {
  const id = `c_${'c'.repeat(32)}`;
  const sheet = { name: '한지안', age: 31, gender: 'female', job: '새벽 라디오 PD', concept: '', role: '새벽 음악 방송을 만든다', tagline: '사연을 끝까지 듣는 새벽 라디오 PD',
    story: ['대학 방송국에서 처음 마이크를 잡았다.', '첫 생방송에서 사연을 잘못 읽은 적이 있다.'], personality: [{ label: '강점', text: '끝까지 듣는다' }, { label: '약점', text: '자기 이야기를 안 한다' }, { label: '모순', text: '귀찮아하면서 사연을 기다린다' }],
    habits: ['짧게 웃고 말한다.', '노래 제목을 붙여 준다.'], look: '검은 단발과 회색 니트', boundaries: ['빈말로 칭찬하지 않는다.', '모욕하지 않는다.'], greeting: '이 시간에 깨어 있네요.' };
  for (const portraitSource of ['ai', 'upload']) {
    let body, after;
    await withServiceKey(() => run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'user-1' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('lounge_custom_characters?id=eq.')) return result([{ id, owner_id: 'user-1', name: '한지안', status: 'private', sheet, template: 'slow_burn', flirtation: true, voice: 'low_female', theme: 'river', portrait_path: `${id}/p.webp`, portrait_source: portraitSource, review_note: '' }]);
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유', host_persona: id, memory: '', capacity: 1, space_id: null, voice_on: false }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?') || url.includes('voice_lounge_relationships?') || url.includes('voice_lounge_memories?')) return result([]);
      if (url.endsWith('/responses') && isAfterReply(init)) { after = JSON.parse(init.body); return modelAnswer({ memory: '', events: [], ...(after.text.format.schema.properties.photo ? { photo: '', photo_asked: false } : {}) }); }
      if (url.endsWith('/responses')) { body = JSON.parse(init.body); return modelAnswer({ text: '반가워요.' }); }
      if (url.includes('finish_voice_lounge_reply')) return result(true);
      if (url.includes('save_voice_lounge_relationship')) return result(1);
      return result([]);
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'opening', stream: true }));
      assert.equal(response.status, 200);
      await response.text();
    }));
    assert.match(body.instructions, /너는 한지안이다/);
    assert.match(body.instructions, /사연을 끝까지 듣는 새벽 라디오 PD/);
    assert.equal(JSON.parse(body.input).relationship.stage.id, 'DISMISSIVE', 'the slow-burn type starts at a distance');
    assert.equal(Boolean(after.text.format.schema.properties.photo), portraitSource === 'ai');
    assert.equal(JSON.parse(body.input).photos, portraitSource === 'ai', 'the reply knows whether it can send a photo');
  }
});

test('the deep model reasons in a chat; a voice reply and the fast model do not', async () => {
  for (const [aiModel, voiceOn, effort] of [['gpt-reasoning', false, 'medium'], ['gpt-reasoning', true, 'none'], [null, false, 'none']]) {
    let body, after;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1, space_id: null, voice_on: voiceOn, ai_model: aiModel }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses') && isAfterReply(init)) { after = JSON.parse(init.body); return modelAnswer({ memory: '', ...(voiceOn ? {} : { photo: '', photo_asked: false }) }); }
      if (url.endsWith('/responses')) { body = JSON.parse(init.body); return modelAnswer({ text: '그렇군요.' }); }
      if (url.includes('finish_voice_lounge_reply') || url.includes('save_voice_lounge_room_memory')) return result(true);
      if (url.endsWith('/audio/speech')) return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4_800)); controller.close(); } }));
      throw new Error(`Unexpected ${url}`);
    }, async () => { await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text(); });
    assert.equal(body.reasoning.effort, effort, `${aiModel} ${voiceOn ? 'voice' : 'chat'}`);
    assert.equal(body.max_output_tokens >= 3000, effort !== 'none', 'reasoning gets room in the output limit');
    // Nobody waits for the call after the reply, so it reasons a little whichever model answers.
    assert.equal(after.reasoning.effort, 'low');
    // Each kind of request keeps to one cache.
    assert.equal(body.prompt_cache_key, 'lounge-ina'); assert.equal(after.prompt_cache_key, 'lounge-after-reply');
  }
});

test('a deep reply that writes nothing in time is answered by the fast model; a failed turn gives its claim back at once', async () => {
  process.env.LOUNGE_REPLY_STALL_MS = '80';
  const room = [{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1, space_id: null, voice_on: false, ai_model: 'gpt-reasoning', ai_turns: 2 }];
  try {
    const sent = []; let events, released;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result(room);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses') && isAfterReply(init)) return modelAnswer({ memory: '' });
      if (url.endsWith('/responses')) {
        const body = JSON.parse(init.body); sent.push(body);
        // The deep reply keeps thinking and writes nothing; only the abort ends it.
        if (body.reasoning.effort === 'medium') return new Response(new ReadableStream({ start(controller) { init.signal.addEventListener('abort', () => controller.error(init.signal.reason)); } }), { headers: { 'Content-Type': 'text/event-stream' } });
        const json = JSON.stringify({ text: '빠르게 답할게요.' });
        return sse([...deltas(json, 6), { type: 'response.completed', response: { status: 'completed' } }]);
      }
      if (url.includes('finish_voice_lounge_reply') || url.includes('save_voice_lounge_room_memory')) return result(true);
      if (url.includes('release_voice_lounge_host')) { released = JSON.parse(init.body); return new Response(null, { status: 204 }); }
      throw new Error(`Unexpected ${url}`);
    }, async () => { events = (await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text()).trim().split('\n').map(line => JSON.parse(line)); });
    assert.deepEqual(sent.map(body => body.reasoning.effort), ['medium', 'none']);
    assert.equal(sent[1].max_output_tokens, sent[0].max_output_tokens - 2500);
    assert.equal(events.find(event => event.type === 'host').text, '빠르게 답할게요.');
    assert.equal(events.at(-1).type, 'done');
    assert.equal(released, undefined, 'a reply that was saved keeps its claim until it is finished');
    // A reply that fails before anything is saved gives the turn back, so the next message is answered right away.
    let failedEvents;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result(room);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses')) return result({ error: { code: 'insufficient_quota', type: 'insufficient_quota' } }, 429);
      if (url.includes('release_voice_lounge_host')) { released = JSON.parse(init.body); return new Response(null, { status: 204 }); }
      throw new Error(`Unexpected ${url}`);
    }, async () => { failedEvents = (await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text()).trim().split('\n').map(line => JSON.parse(line)); });
    assert.equal(failedEvents[0].type, 'error');
    assert.deepEqual(released, { p_room: roomId, p_ticket: 'ticket' });
  } finally { delete process.env.LOUNGE_REPLY_STALL_MS; }
});

test('a room set to Gemini sends the same instructions and JSON shape there; if Gemini fails, GPT answers', async () => {
  const savedKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'gemini-key';
  const sse = events => new Response(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  try {
    for (const geminiWorks of [true, false]) {
      let geminiBody, openaiCalled = false;
      const events = [];
      await run(async (url, init) => {
        if (url.includes('/auth/')) return result({ id: 'host' });
        if (url.includes('claim_voice_lounge_host')) return result('ticket');
        if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1, space_id: null, voice_on: false, ai_model: 'gemini-flash' }]);
        if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
        if (url.includes(':streamGenerateContent')) {
          assert.match(url, /models\/gemini-3\.8-flash:streamGenerateContent\?alt=sse/); assert.equal(init.headers['x-goog-api-key'], 'gemini-key');
          geminiBody = JSON.parse(init.body);
          if (!geminiWorks) return result({ error: { code: 503 } }, 503);
          return sse([
            { candidates: [{ content: { parts: [{ text: '{"text": "*컵을 내려놓으며* 그 장면, ' }] } }] },
            { candidates: [{ content: { parts: [{ text: '저도 오래 남았어요."}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 9000, candidatesTokenCount: 60, cachedContentTokenCount: 8800 } },
          ]);
        }
        // The call after the reply is always GPT: it is cheap with its cache, and nobody waits for it.
        if (url.endsWith('/responses') && isAfterReply(init)) return modelAnswer({ memory: '', photo: '없음', photo_asked: false });
        if (url.endsWith('/responses')) { openaiCalled = true; return modelAnswer({ text: 'GPT가 대신 답해요.' }); }
        if (url.includes('finish_voice_lounge_reply') || url.includes('save_voice_lounge_room_memory')) return result(true);
        throw new Error(`Unexpected ${url}`);
      }, async () => {
        const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
        events.push(...(await response.text()).trim().split('\n').map(line => JSON.parse(line)));
      });
      assert.equal(geminiBody.generationConfig.responseMimeType, 'application/json');
      assert.equal(geminiBody.generationConfig.responseJsonSchema.required[0], 'text', 'the same JSON shape, text first');
      assert.match(geminiBody.systemInstruction.parts[0].text, /reply_medium=chat이면/, 'the same instructions');
      assert.equal(JSON.parse(geminiBody.contents[0].parts[0].text).reply_medium, 'chat', 'the same input');
      if (geminiWorks) {
        assert.equal(openaiCalled, false);
        // The sentence goes out while it is written, then whole.
        assert.deepEqual(events.filter(event => event.type === 'text').map(event => event.text), ['*컵을 내려놓으며* 그 장면, ']);
        assert.deepEqual(events.filter(event => event.type !== 'text').map(event => event.type), ['host', 'saved', 'done'], '"없음" is not a photo');
        assert.equal(events.find(event => event.type === 'host').text, '*컵을 내려놓으며* 그 장면, 저도 오래 남았어요.');
      } else {
        assert.equal(openaiCalled, true, 'GPT answers when Gemini fails');
        assert.equal(events[0].text, 'GPT가 대신 답해요.');
      }
    }
  } finally { if (savedKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = savedKey; }
});

test('a chat reply can come with a photo: the scene goes to the browser after the reply is saved', async () => {
  const asked = await chatTurn({ voiceOn: false, replyText: '*휴대폰을 들어 한 장 찍는다* 자, 지금 여기.', photo: { photo: '작업실 창가에서 야경을 등지고 찍은 셀카', photo_asked: true } });
  // The reply shows the photo being sent; the call after it writes the scene from that.
  assert.deepEqual(asked.schema.required, ['text']);
  assert.equal(asked.input.photos, true);
  assert.match(asked.instructions, /사진은 채팅에서 photos=true일 때만 보낼 수 있다/);
  assert.deepEqual(asked.after.text.format.schema.required.slice(-2), ['photo', 'photo_asked']);
  assert.match(asked.after.instructions, /photo: 방금 답에서 캐릭터가 사진을 찍거나 보내는 장면이 있을 때만/);
  assert.deepEqual(typesOf(asked.events), ['host', 'saved', 'photo', 'done']);
  assert.deepEqual(asked.events[2], { type: 'photo', scene: '작업실 창가에서 야경을 등지고 찍은 셀카', asked: true });
  const none = await chatTurn({ voiceOn: false, replyText: '그래서요?', photo: { photo: '', photo_asked: false } });
  assert.deepEqual(typesOf(none.events), ['host', 'saved', 'done']);
  // A guest's character does not offer photos, and a voice reply has no photo either.
  for (const turn of [await chatTurn({ voiceOn: false, replyText: '그래서요?', anonymous: true }), await chatTurn({ voiceOn: true, replyText: '그래서요?' })]) {
    assert.equal(turn.after.text.format.schema.properties.photo, undefined);
    assert.notEqual(turn.input.photos, true);
    assert.equal(turn.events.some(event => event.type === 'photo'), false);
  }
});

test('a chat started from a story is told as a story; with the voice on it stays in the story under the voice rules', async () => {
  const scenario = { id: 'velvet-review', title: '혹평의 밤', prologue: '선우령이 연출한 전시의 오프닝 파티. 당신은 이 전시를 혹평한 평론가다.', user_role: '전시를 혹평한 미술 평론가', relationship: '서로를 의식하는 앙숙', place: '갤러리 홀' };
  for (const voiceOn of [false, true]) {
    let reply, after;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '혹평의 밤', host_persona: 'velvet', memory: '', capacity: 1, space_id: null, voice_on: voiceOn, ai_turns: 1, scenario }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses') && isAfterReply(init)) { after = JSON.parse(init.body); return modelAnswer({ memory: '지금 장면: 갤러리 홀, 대담 직전' }); }
      if (url.endsWith('/responses')) { reply = JSON.parse(init.body); return modelAnswer({ text: '*샴페인 잔이 부딪친다* 오셨네요, 평론가님.' }); }
      if (url.includes('finish_voice_lounge_reply') || url.includes('save_voice_lounge_room_memory')) return result(true);
      if (url.endsWith('/audio/speech')) return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4_800)); controller.close(); } }));
      throw new Error(`Unexpected ${url}`);
    }, async () => { await (await handler(request({ action: 'host', roomId, reason: 'opening', stream: true }))).text(); });
    assert.deepEqual(JSON.parse(reply.input).scenario, scenario, 'the story and the role of the member reach the model');
    if (!voiceOn) {
      assert.match(reply.instructions, /채팅으로 진행되는 롤플레이 소설이다/);
      assert.match(reply.instructions, /reason=opening이면 프롤로그 바로 다음 순간에서 첫 장면을 연다/);
      assert.match(reply.instructions, /scenario.relationship에서 시작하고, relationship\(stage, outing, intimacy\)은 그 위에서 마음을 얼마나 열고 스킨십을 어디까지 받아들일지 정한다/);
      // What the first try showed: the same paragraph order, the same prop, too little dialogue, every advance turned aside.
      assert.match(reply.instructions, /답의 모양을 매번 바꾼다/);
      assert.match(reply.instructions, /시그니처 동작\(예: 손목시계, 잔\)은 한 대화에서 많아야 두 번/);
      assert.match(reply.instructions, /대사가 답의 절반 가까이 되게 하고/);
      assert.match(reply.instructions, /매번 말로 비켜 가지 않는다/);
      assert.match(reply.instructions, /질문으로 끝내지 않는다/);
      // Narration in plain style, dialogue spoken the way a person would in that moment.
      assert.match(reply.instructions, /'나는 ~한다'처럼 평서체로 쓰고 존댓말로 쓰지 않는다/);
      assert.match(reply.instructions, /안내문이나 상담하는 말투/);
      assert.doesNotMatch(reply.instructions, /채팅의 대사는 지문을 빼고 최소 5문장/, 'the conversation rules are left out');
      assert.doesNotMatch(reply.instructions, /이거냐 저거냐/);
      assert.ok(reply.max_output_tokens >= 2200, 'a story reply has room for its length');
      assert.match(after.instructions, /'줄거리: 지금까지 일어난 일/, 'the summary keeps the plot');
      assert.deepEqual(JSON.parse(after.input).scenario, scenario);
    } else {
      assert.doesNotMatch(reply.instructions, /롤플레이 소설이다/);
      assert.match(reply.instructions, /scenario가 있으면 이 대화는 그 이야기 속 장면이다/);
    }
  }
});

test('a story keeps the real memories of the member out and does not save what happens in it as facts about them', async () => {
  const scenario = { id: 'velvet-review', title: '혹평의 밤', prologue: '당신은 이 전시를 혹평한 평론가다. 오늘 밤 둘이 같은 무대에 선다.', user_role: '평론가', relationship: '앙숙', place: '갤러리 홀' };
  let reply, after;
  await withServiceKey(() => run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_memories?')) return result(memoryRows);
    if (url.includes('voice_lounge_relationships?')) return result([velvetRow]);
    if (url.includes('voice_lounge_rooms?host_id=')) return result([]);
    if (url.includes('voice_lounge_rooms?')) return result([relationshipRoom({ voice_on: false, space_id: null, scenario })]);
    if (url.includes('voice_lounge_messages?')) return result([{ id: 2, user_id: 'user-1', nickname: '나', kind: 'human', text: '오늘 무대 꽤 멋있던데.' }]);
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'user-1', nickname: '나', last_seen: '' }]);
    if (url.endsWith('/embeddings') || url.includes('lounge_character_knowledge')) return result({ data: [] });
    if (url.endsWith('/responses') && isAfterReply(init)) { after = JSON.parse(init.body); return modelAnswer({ memory: '지금 장면: 무대', events: [] }); }
    if (url.endsWith('/responses')) { reply = JSON.parse(init.body); return modelAnswer({ text: '*마이크를 내린다* 그래요?' }); }
    if (url.includes('finish_voice_lounge_reply') || url.includes('save_voice_lounge_room_memory') || url.includes('save_voice_lounge_relationship')) return result(true);
    throw new Error('Unexpected fetch ' + url);
  }, async () => { await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text(); }));
  const relationshipContext = JSON.parse(reply.input).relationship;
  assert.ok(relationshipContext.stage, 'the relationship still shapes the story');
  assert.equal(relationshipContext.user_memories, undefined);
  assert.equal(relationshipContext.opening_follow_up, undefined);
  assert.equal(after.text.format.schema.properties.memory_ops, undefined, 'nothing from the story is saved as a fact about the member');
  assert.ok(after.text.format.schema.properties.events, 'relationship events are still classified');
  assert.match(reply.instructions, /답의 마지막 문장은 물음표로 끝나지 않는다/);
});

test('a chat reply is text only and the model is told it is a chat', async () => {
  const { spoken, input, instructions, events, after, summary } = await chatTurn({ voiceOn: false, replyText: '*잔을 내려놓으며* 그래서, 결론은요?' });
  assert.equal(input.reply_medium, 'chat');
  // Almost every chat reply has an action, and it is a reaction to what the member just said or did, never a prop
  // touched for its own sake or the same gesture again; the member's actions and thoughts are read from context.
  assert.match(instructions, /거의 모든 답에 별표로 감싼 지문을 1~2개 넣는다. 지문은 방금 상대가 한 말이나 행동에 대한 네 반응이다/);
  assert.match(instructions, /상대가 행동을 썼으면 그 행동에 몸으로 반응한다/);
  assert.match(instructions, /반응 없이 소품만 만지거나 바라보는 동작\(잔·시계 만지기, 창밖 보기\)은 지문으로 쓰지 않는다/);
  assert.match(instructions, /recent에서 네 최근 두 답에 쓴 동작·소품·표정은 다시 쓰지 않는다/);
  // Reactions are big but stay in character; voice replies react in words instead of stage directions.
  assert.match(instructions, /반응을 미지근하게 하지 않는다/);
  assert.match(instructions, /성격을 바꾸지 않고 그 성격 그대로의 감정을 크게 보여 준다/);
  assert.match(instructions, /reply_medium=voice이면 .*리액션을 말로 크게 한다/);
  assert.match(instructions, /별표가 없어도 .*지문으로 쓴 부분은 상대의 행동이나 상황/);
  assert.match(instructions, /속마음은 네가 들은 말이 아니므로/);
  // Going somewhere or doing something together follows the relationship; accepted, it is played out as a scene, and
  // a refusal is the character's, never "I am an AI".
  assert.match(instructions, /받아들일지는 relationship.outing을 따른다/);
  assert.match(instructions, /거절할 때도 'AI라서 못 한다'/);
  assert.match(instructions, /받아들이면 이야기 속에서 그 장면으로 함께 옮겨 가/);
  assert.match(instructions, /상황극은 현실의 만남이 아니므로 이 규칙에 해당하지 않는다/);
  // The scene in play is kept on the summary's first line, written by the call after the reply and read by the next one.
  assert.match(after.instructions, /memory 첫 줄에 '지금 장면: '/);
  assert.match(instructions, /첫 줄이 '지금 장면: '으로 시작하면 그 상황극 장면이 이어지는 중이다/);
  assert.equal(summary.p_memory, '영화 이야기를 했다.');
  assert.deepEqual(spoken, [], 'no speech is made for a chat');
  assert.deepEqual(typesOf(events), ['host', 'saved', 'done']);
  assert.equal(events[0].text, '*잔을 내려놓으며* 그래서, 결론은요?');
});

test('a chat reply may run to 1200 characters; a voice reply keeps the 600-character limit', async () => {
  const long = '*창가에 기대며* ' + '오늘 이야기 정말 재밌었어요. '.repeat(90);
  const chat = await chatTurn({ voiceOn: false, replyText: long });
  assert.equal(chat.events[0].text.length, 1200);
  assert.match(chat.instructions, /채팅의 대사는 지문을 빼고 최소 5문장, 보통 5~7문장\(200~450자\)이다. 4문장 이하로 짧게 끝내지 않는다/);
  // A dry character keeps its tone, not a shorter reply; the one-to-one 140 characters are for voice.
  assert.match(chat.instructions, /'짧고 건조한 한 문장' 같은 버릇은 문장 하나하나의 호흡과 결을 말하는 것이고 답의 분량이 아니다/);
  assert.match(chat.instructions, /목소리로 말할 때\(reply_medium=voice\)는 첫 인사를 포함해 보통 1~2개의 짧은 문장/);
  assert.match(chat.instructions, /목소리로 말할 때는 공감 한마디, 내 생각 한 가지, 떠오른 연상이나 가벼운 반응만으로 끝내도 된다/);
  assert.match(chat.instructions, /이 채팅 길이 규칙은 위의 1:1 답변 길이 규칙보다 우선한다/);
  const voice = await chatTurn({ voiceOn: true, replyText: long });
  assert.equal(voice.events[0].text.length, 600);
});

test('with the voice on, the reply is spoken without its *actions*', async () => {
  const { spoken, input, events } = await chatTurn({ voiceOn: true, replyText: '*웃으며* 좋아요, 그렇게 해요.' });
  assert.equal(input.reply_medium, 'voice');
  assert.deepEqual(spoken, ['좋아요, 그렇게 해요.']);
  assert.equal(events.at(-1).type, 'done');
  assert.ok(events.some(event => event.type === 'audio'));
});

test('a signal that fires after a request has finished never reaches that request', async () => {
  const signals = [];
  const client = new AbortController();
  await run(async (url, init) => {
    signals.push(init.signal);
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '좋아요.', memory: '' }) }] }] });
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4_800)); controller.close(); } }));
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(new Request(request({ action: 'host', roomId, reason: 'followup', stream: true }), { signal: client.signal }));
    await response.text();
    // A finished lookup's late timeout or give-up once aborted the reply that was streaming at that moment.
    client.abort();
    assert.ok(signals.length > 3);
    assert.deepEqual(signals.filter(signal => signal.aborted), [], 'a finished request was aborted');
  });
});

test('speech still cancels an oversized PCM response with an explicit error code', async () => {
  let cancelled = false;
  await run(async url => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '안녕하세요?', memory: '' }) }] }] });
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(12_000_000)); }, cancel() { cancelled = true; } }));
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.map(event => event.type), ['host', 'error']);
    assert.equal(events[1].code, 'lounge_audio_too_long'); assert.equal(cancelled, true);
  });
});

test('a transient TTS failure before the first audio retries the same saved text once without regenerating it', async () => {
  for (const firstFailure of [
    () => result({ error: { code: 'server_error' } }, 503),
    () => new Response(new Uint8Array()),
    () => new Response(new ReadableStream({ pull() { throw new TypeError('socket closed before audio'); } })),
  ]) {
    let models = 0, saves = 0, speech = 0; const inputs = [];
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses') && isAfterReply(init)) return modelAnswer({ memory: '' });
      if (url.endsWith('/responses')) { models++; return modelAnswer({ text: '마지막 선택은 어떻게 느꼈어요?' }); }
      if (url.includes('finish_voice_lounge_reply')) { saves++; return result(true); }
      if (url.endsWith('/audio/speech')) { speech++; inputs.push(JSON.parse(init.body)); return speech === 1 ? firstFailure() : new Response(new Uint8Array([0, 32, 0, 32])); }
      throw new Error('Unexpected fetch');
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
      const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
      assert.deepEqual(typesOf(events).filter(type => type !== 'saved'), ['host', 'audio', 'done']);
      assert.equal(models, 1); assert.equal(saves, 1); assert.equal(speech, 2);
      assert.deepEqual(inputs[0], inputs[1], 'TTS recovery must preserve text, voice and persona');
    });
  }
});

test('TTS recovery is bounded, never repeats transmitted audio, and does not retry rate limits', async () => {
  for (const failure of ['empty', 'partial', 'rate_limit']) {
    let speech = 0;
    await run(async url => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '마지막 선택은 어떻게 느꼈어요?', memory: '' }) }] }] });
      if (url.includes('finish_voice_lounge_host')) return result(true);
      if (url.endsWith('/audio/speech')) {
        speech++;
        if (failure === 'empty') return new Response(new Uint8Array());
        if (failure === 'rate_limit') return result({ error: { code: 'rate_limit_exceeded' } }, 429);
        let sent = false;
        return new Response(new ReadableStream({ pull(controller) { if (!sent) { sent = true; controller.enqueue(new Uint8Array([0, 32, 0, 32])); } else controller.error(new TypeError('socket closed after audio')); } }));
      }
      throw new Error('Unexpected fetch');
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
      const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(events.at(-1).type, 'error'); assert.equal(events.some(event => event.type === 'done'), false);
      // An empty answer is also raced by a second request, so each try costs two requests.
      assert.equal(speech, failure === 'rate_limit' ? 1 : failure === 'empty' ? lounge.loungeSpeechStall.attempts * 2 : lounge.loungeSpeechStall.attempts);
      // A retry after a partial sentence skips the bytes already sent, so the same audio is never sent twice.
      assert.equal(events.filter(event => event.type === 'audio').length, failure === 'partial' ? 1 : 0);
    });
  }
});

test('a speech request that stalls before or during the reply is requested again, without repeating sent audio', async () => {
  const saved = { ...lounge.loungeSpeechStall };
  Object.assign(lounge.loungeSpeechStall, { firstAudioMs: 40, gapMs: 40 });
  const silent = signal => new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }); } }));
  const partThenSilent = (signal, bytes) => new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); signal.addEventListener('abort', () => controller.error(signal.reason), { once: true }); } }));
  try {
    for (const stall of ['before', 'during']) {
      const inputs = []; let calls = 0;
      await run(async (url, init) => {
        if (url.includes('/auth/')) return result({ id: 'host' });
        if (url.includes('claim_voice_lounge_host')) return result('ticket');
        if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
        if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
        if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '마지막 장면이 오래 남았다니 반가워요. 어떤 점이 좋았어요?', memory: '' }) }] }] });
        if (url.includes('finish_voice_lounge_host')) return result(true);
        if (url.endsWith('/audio/speech')) {
          calls++; inputs.push(JSON.parse(init.body).input);
          // The first request stalls: with no audio at all, or after its first four bytes.
          if (calls === 1) return stall === 'before' ? silent(init.signal) : partThenSilent(init.signal, new Uint8Array([1, 0, 2, 0]));
          return new Response(new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]));
        }
        throw new Error('Unexpected fetch');
      }, async () => {
        const events = (await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text()).trim().split('\n').map(line => JSON.parse(line));
        assert.equal(events.at(-1).type, 'done', stall);
        const reply = '마지막 장면이 오래 남았다니 반가워요. 어떤 점이 좋았어요?';
        assert.deepEqual(inputs, [reply, reply], 'the stalled reply is requested once more');
        const audio = Buffer.concat(events.filter(event => event.type === 'audio').map(event => Buffer.from(event.audio, 'base64')));
        assert.deepEqual([...audio], [1, 0, 2, 0, 3, 0, 4, 0], 'the retry continues where the stalled audio stopped');
      });
    }
  } finally { Object.assign(lounge.loungeSpeechStall, saved); }
});

test('slow speech and slow transcription are raced by a second request, and the slow one is cancelled', async () => {
  const saved = { ...lounge.loungeSpeechStall };
  Object.assign(lounge.loungeSpeechStall, { hedgeAfterMs: 30, firstAudioMs: 5000 });
  const hanging = signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  try {
    const signals = []; const started = performance.now();
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '어떤 장면이 제일 오래 남았어요?', memory: '' }) }] }] });
      if (url.includes('finish_voice_lounge_host')) return result(true);
      if (url.endsWith('/audio/speech')) { signals.push(init.signal); return signals.length === 1 ? hanging(init.signal) : new Response(new Uint8Array([1, 0, 2, 0])); }
      throw new Error('Unexpected fetch');
    }, async () => {
      const events = (await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text()).trim().split('\n').map(line => JSON.parse(line));
      assert.deepEqual(events.map(event => event.type), ['host', 'audio', 'done']);
    });
    assert.equal(signals.length, 2); assert.equal(signals[0].aborted, true, 'the slow speech request is cancelled');
    assert.ok(performance.now() - started < 3000, 'the reply did not wait for the slow request');

    const transcriptions = []; let posted;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'guest' });
      if (url.includes('claim_voice_lounge_audio')) return result(true);
      if (url.endsWith('/audio/transcriptions')) { transcriptions.push(init.signal); return transcriptions.length === 1 ? hanging(init.signal) : result({ text: '두 번째 요청이 먼저 왔어요' }); }
      if (url.includes('post_voice_lounge_message')) { posted = JSON.parse(init.body).p_text; return new Response(null, { status: 204 }); }
      throw new Error('Unexpected fetch');
    }, async () => {
      // A tiny recording: the second transcription starts after 2.5 s.
      assert.equal((await handler(request({ action: 'transcribe', roomId, audio: Buffer.alloc(400).toString('base64'), mimeType: 'audio/webm;codecs=opus' }))).status, 200);
    });
    assert.equal(transcriptions.length, 2); assert.equal(transcriptions[0].aborted, true); assert.equal(posted, '두 번째 요청이 먼저 왔어요');
    assert.equal(lounge.loungeTranscriptionHedgeMs(400), 2510); assert.equal(lounge.loungeTranscriptionHedgeMs(1_000_000), 8000);
  } finally { Object.assign(lounge.loungeSpeechStall, saved); }
});

test('a transcription that times out on both requests explains itself in Korean and can be retried', async () => {
  await run(async url => {
    if (url.includes('/auth/')) return result({ id: 'guest' });
    if (url.includes('claim_voice_lounge_audio')) return result(true);
    if (url.endsWith('/audio/transcriptions')) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(request({ action: 'transcribe', roomId, audio: Buffer.alloc(400).toString('base64'), mimeType: 'audio/webm;codecs=opus' }));
    assert.equal(response.status, 504);
    const body = await response.json();
    assert.equal(body.code, 'lounge_upstream_timeout'); assert.equal(body.retryable, true); assert.doesNotMatch(body.error, /aborted/);
  });
});

test('stream failures preserve billing metadata after host text is saved', async () => {
  await run(async url => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '어떤 영화 봤어요?', memory: '' }) }] }] });
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return result({ error: { code: 'credit_balance_exhausted' } }, 429);
    throw new Error('Unexpected fetch');
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.map(event => event.type), ['host', 'error']);
    assert.equal(events[1].retryable, false); assert.equal(events[1].code, 'openai_credit_exhausted');
  });
});

test('lounge client hands the live response to playback without waiting for its body', async () => {
  const client = compile('../src/lib/loungeApi.ts', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) } } }));
  let upstream;
  await run(async (url, init) => {
    assert.equal(JSON.parse(init.body).stream, true);
    return new Response(new ReadableStream({ start(controller) { upstream = controller; } }), { headers: { 'Content-Type': 'application/x-ndjson' } });
  }, async () => {
    const response = await client.requestLoungeHost(roomId, 'followup');
    assert.ok(response.stream, 'headers arrive before the server sends any body');
    upstream.enqueue(new TextEncoder().encode('{"type":"done"}\n')); upstream.close();
    assert.equal(await new Response(response.stream).text(), '{"type":"done"}\n');
  });
});

test('NDJSON, PCM byte boundaries, scheduled playback and cancellation work without buffering a whole reply', async () => {
  const client = compile('../src/lib/loungeApi.ts', () => ({}));
  const streaming = compile('../src/lib/loungeStream.ts', () => client);
  const frames = new TextEncoder().encode(JSON.stringify({ type: 'host', text: '영화', timings: {} }) + '\n' + JSON.stringify({ type: 'audio', audio: 'AID/fw==' }) + '\n' + JSON.stringify({ type: 'done' }) + '\n');
  const stream = new ReadableStream({ start(controller) { for (const byte of frames) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const events = []; for await (const event of streaming.readLoungeStream(stream)) events.push(event);
  assert.equal(events[0].text, '영화'); assert.deepEqual(events.map(event => event.type), ['host', 'audio', 'done']);
  await assert.rejects(async () => { for await (const event of streaming.readLoungeStream(new Response('{"type":"audio","audio":""}\n').body)) void event; }, /중간에 끊겼/);
  const pcm = new streaming.Pcm16Decoder();
  assert.equal(pcm.decode(new Uint8Array([0])).length, 0);
  assert.deepEqual(Array.from(pcm.decode(new Uint8Array([128, 255]))), [-1]);
  assert.deepEqual(Array.from(pcm.decode(new Uint8Array([127]))), [32767 / 32768]); pcm.finish();
  const sources = [], automation = [];
  const context = {
    currentTime: 0,
    createGain() { return { connect() {}, disconnect() {}, gain: {
      setValueAtTime(value, time) { automation.push(['set', value, time]); },
      linearRampToValueAtTime(value, time) { automation.push(['ramp', value, time]); },
      cancelScheduledValues(time) { automation.push(['cancel', time]); },
    } }; },
    createBuffer(channels, size, rate) { const values = new Float32Array(size); return { duration: size / rate, getChannelData: () => values }; },
    createBufferSource() { const node = { connect() {}, disconnect() {}, start(time) { node.startTime = time; }, stop() { node.stopped = true; } }; sources.push(node); return node; },
  };
  const queue = new streaming.PcmAudioQueue(context, [{}]);
  assert.equal(queue.push(new Float32Array(24)), false, 'tiny startup packets are buffered');
  assert.equal(sources.length, 0);
  assert.equal(queue.push(new Float32Array(2376)), false, '100 ms is not enough to start speech safely');
  assert.equal(queue.push(new Float32Array(7200)), true);
  assert.equal(sources[0].startTime, .12, 'startup leaves publication and device headroom');
  queue.push(new Float32Array(2400));
  assert.equal(sources[1].startTime, sources[0].startTime + sources[0].buffer.duration, 'timely packets join without gaps');
  assert.deepEqual(automation.slice(0, 2), [['set', 0, .12], ['ramp', 1, .128]], 'startup has a smooth gain ramp');
  assert.ok(automation.some(event => event[0] === 'cancel'), 'the provisional ending fade is removed between timely chunks');
  assert.equal(queue.finish(), true);
  assert.equal(sources.reduce((sum, source) => sum + source.buffer.duration * 24000, 0), 12000, 'EOF plays all held samples exactly once');
  assert.equal(automation.at(-1)[1], 0, 'the final waveform fades to silence');
  assert.equal(queue.finish(), false, 'EOF cannot enqueue its tail twice');
  const draining = queue.drain(); queue.stop(); await draining;
  assert.ok(sources.every(source => source.stopped));
  assert.equal(queue.push(new Float32Array(24)), false, 'cancelled playback cannot restart');
  const short = new streaming.PcmAudioQueue(context, [{}]);
  assert.equal(short.push(new Float32Array(96)), false);
  assert.equal(short.finish(), true, 'a short utterance plays at EOF'); short.stop();
  const empty = new streaming.PcmAudioQueue(context, [{}]);
  assert.equal(empty.finish(), false); empty.stop();
  const delayed = new streaming.PcmAudioQueue(context, [{}]);
  delayed.push(new Float32Array(9600));
  context.currentTime = 1;
  const beforeRecovery = sources.length;
  assert.equal(delayed.push(new Float32Array(2400)), false, 'a late 100 ms packet cannot trigger another short stutter');
  assert.equal(sources.length, beforeRecovery);
  assert.equal(delayed.push(new Float32Array(4800)), true);
  assert.equal(sources.at(-1).startTime, 1.12, 'rebuffered audio gets a fresh playback lead');
  assert.deepEqual(automation.slice(-4, -2).map(event => event.slice(0, 2)), [['set', 0], ['ramp', 1]], 'a jitter gap fades in without a hard edge');
  assert.ok(Math.abs(automation.at(-3)[2] - 1.128) < 1e-12); delayed.stop();
});

test('the stream passes on that the reply is saved and skips kinds of events it does not know', async () => {
  const client = compile('../src/lib/loungeApi.ts', () => ({}));
  const streaming = compile('../src/lib/loungeStream.ts', () => client);
  const lines = [{ type: 'host', text: '네', timings: {} }, { type: 'saved', saveMs: 80 }, { type: 'from_a_newer_server' }, { type: 'done' }].map(event => JSON.stringify(event) + '\n').join('');
  const events = []; for await (const event of streaming.readLoungeStream(new Response(lines).body)) events.push(event.type);
  assert.deepEqual(events, ['host', 'saved', 'done']);
  await assert.rejects(async () => { for await (const event of streaming.readLoungeStream(new Response('{"text":"no type"}\n').body)) void event; }, error => error.code === 'lounge_invalid_stream');
});

test('delayed onset packets preserve each first syllable once and join without silence', () => {
  const client = compile('../src/lib/loungeApi.ts', () => ({}));
  const { PcmAudioQueue } = compile('../src/lib/loungeStream.ts', () => client);
  const scheduled = [];
  const context = {
    currentTime: 0,
    createGain: () => ({ connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} } }),
    createBuffer: (_, size, rate) => { const pcm = new Float32Array(size); return { duration: size / rate, getChannelData: () => pcm }; },
    createBufferSource() { return { connect() {}, disconnect() {}, stop() {}, start(time) { scheduled.push({ time, pcm: this.buffer.getChannelData(0), duration: this.buffer.duration }); } }; },
  };
  const queue = new PcmAudioQueue(context, [{}]);
  const original = Float32Array.from({ length: 12000 }, (_, i) => i / 12000);
  assert.equal(queue.push(original.slice(0, 2400)), false);
  context.currentTime = .2;
  assert.equal(queue.push(original.slice(2400, 4800)), false);
  assert.equal(scheduled.length, 0, 'nothing plays before delayed onset audio is buffered');
  context.currentTime = .36;
  assert.equal(queue.push(original.slice(4800, 9600)), true);
  context.currentTime = .5;
  queue.push(original.slice(9600)); queue.finish();
  const actual = new Float32Array(scheduled.reduce((n, item) => n + item.pcm.length, 0));
  let offset = 0;
  for (const item of scheduled) { actual.set(item.pcm, offset); offset += item.pcm.length; }
  assert.deepEqual(actual, original, 'no first samples are duplicated, dropped or reordered');
  for (let i = 1; i < scheduled.length; i++) assert.equal(scheduled[i].time, scheduled[i - 1].time + scheduled[i - 1].duration, 'onset is contiguous despite 200 ms packet latency');
  queue.stop();
});

test('empty or non-JSON HTTP failures preserve status and retry delay in the client', async () => {
  const client = compile('../src/lib/loungeApi.ts', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }), refreshSession: async () => ({ data: { session: { access_token: 'fresh-session' } }, error: null }) } } }));
  for (const [status, body, code, retryable] of [[429, '', 'lounge_http_429', true], [502, '<html>Bad Gateway</html>', 'lounge_http_502', true], [401, '', 'lounge_session_expired', false], [200, '', 'lounge_invalid_response', true]]) {
    await run(async () => new Response(body, { status, headers: { 'Retry-After': '90' } }), async () => {
      await assert.rejects(client.requestLoungeHost(roomId, 'opening'), error => error instanceof client.LoungeApiError && error.code === code && error.retryable === retryable && !error.message.includes('JSON'));
    });
  }
});

test('empty valued RPCs and malformed AI replies fail safely before writing a host turn', async () => {
  for (const failure of ['ticket', 'response', 'output']) {
    let paid = 0;
    await run(async url => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return failure === 'ticket' ? new Response(null, { status: 204 }) : result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses')) {
        paid++;
        return failure === 'response' ? new Response('') : result({ output: [{ content: [{ type: 'output_text', text: '{"text":' }] }] });
      }
      throw new Error('An incomplete reply must not be saved or spoken');
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'opening' }));
      assert.equal(response.status, 502);
      const payload = await response.json();
      assert.equal(payload.code, failure === 'ticket' ? 'lounge_invalid_response' : 'openai_invalid_response');
      assert.equal(payload.retryable, true);
      assert.doesNotMatch(payload.error, /Unexpected end|JSON/);
      assert.equal(paid, failure === 'ticket' ? 0 : 1);
    });
  }
});

test('a failed transcript write remains a failure and an audio ticket denial never reaches OpenAI', async () => {
  for (const denied of [true, false]) {
    let paid = 0;
    await run(async url => {
      if (url.includes('/auth/')) return result({ id: 'guest' });
      if (url.includes('claim_voice_lounge_audio')) return result(!denied);
      if (url.includes('voice_lounge_rooms?')) return result([{ status: 'active', expires_at: new Date(Date.now() + 60_000).toISOString() }]);
      if (url.includes('voice_lounge_members?')) return result([{ active: true, audio_requests: 1, last_seen: new Date().toISOString() }]);
      if (url.endsWith('/audio/transcriptions')) { paid++; return result({ text: '영화 이야기' }); }
      if (url.includes('post_voice_lounge_message')) return new Response(null, { status: 403 });
      throw new Error('Unexpected fetch');
    }, async () => {
      const response = await handler(request({ action: 'transcribe', roomId, audio: Buffer.alloc(400).toString('base64'), mimeType: 'audio/webm' }));
      assert.equal(response.status, denied ? 429 : 403);
      assert.equal(paid, denied ? 0 : 1);
      if (denied) assert.equal((await response.json()).retryAfterSeconds, 2);
      else { const body = await response.json(); assert.equal(body.code, 'lounge_access_denied'); assert.equal(body.retryable, false); }
    });
  }
});
test('LiveKit creates a room with one seat for solo and six seats for a group', async () => {
  const originalEnv = { ...process.env };
  process.env.LIVEKIT_URL = 'wss://voice.test'; process.env.LIVEKIT_API_KEY = 'test-key'; process.env.LIVEKIT_API_SECRET = 'test-secret';
  try {
    for (const [capacity, restrictedUntil] of [[1, null], [6, null], [6, '2099-01-01'], [6, '2000-01-01']]) {
      let roomOptions, grantOptions;
      const tokenHandler = compile('../api/livekit-token.ts', () => ({
        RoomServiceClient: class { async listRooms() { return []; } async createRoom(options) { roomOptions = options; } },
        AccessToken: class { addGrant(options) { grantOptions = options; } async toJwt() { return 'test-token'; } },
      })).default;
      await run(async url => {
        if (url.includes('/auth/')) return result({ id: 'host', user_metadata: { nickname: '나' } });
        if (url.includes('voice_lounge_rooms?')) return result([{ capacity, status: 'lobby', expires_at: null, created_at: new Date().toISOString() }]);
        if (url.includes('voice_lounge_members?')) return result([{ user_id: 'host', speaking_restricted_until: restrictedUntil }]);
        throw new Error('Unexpected fetch');
      }, async () => {
        const response = await tokenHandler(new Request('https://app.test/api/livekit-token', { method: 'POST', headers: { Authorization: 'Bearer example', 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: roomId }) }));
        assert.equal(response.status, 200);
        assert.equal(roomOptions.maxParticipants, capacity);
        assert.equal(grantOptions.canUpdateOwnMetadata, true, 'lounge members must be able to share their selected avatar');
        assert.equal(grantOptions.canPublish, restrictedUntil !== '2099-01-01', 'new tokens respect a restriction and its expiry');
        assert.equal(grantOptions.canSubscribe, true, 'restricted members can still listen');
      });
    }
  } finally {
    for (const name of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']) {
      if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name];
    }
  }
});

test('윤지안 (id diplomat) speaks with Gemini through the same PCM stream, and OpenAI speaks for her when Gemini fails', async () => {
  const pcm = Uint8Array.from({ length: 3000 }, (_, index) => (index * 7) % 256), fallback = new Uint8Array([9, 8, 7, 6]);
  const sse = chunks => chunks.map(chunk => `data: ${JSON.stringify(chunk)}

`).join('');
  const piece = bytes => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/l16; rate=24000', data: Buffer.from(bytes).toString('base64') } }] } }] });
  const scenarios = {
    gemini: { key: 'gem-key', upstream: () => new Response(sse([piece(pcm.subarray(0, 1200)), piece(pcm.subarray(1200))]), { headers: { 'Content-Type': 'text/event-stream' } }), expect: pcm, gemini: 1, openai: 0 },
    blocked: { key: 'gem-key', upstream: () => new Response(sse([{ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }])), expect: fallback, gemini: 1, openai: 1 },
    down: { key: 'gem-key', upstream: () => new Response('nope', { status: 500 }), expect: fallback, gemini: 1, openai: 1 },
    nokey: { key: undefined, upstream: () => { throw new Error('must not be called'); }, expect: fallback, gemini: 0, openai: 1 },
  };
  for (const [name, scenario] of Object.entries(scenarios)) {
    const calls = { gemini: 0, openai: 0 };
    if (scenario.key) process.env.GEMINI_API_KEY = scenario.key; else delete process.env.GEMINI_API_KEY;
    try {
      await run(async (url, init) => {
        if (url.includes('/auth/')) return result({ id: 'user-1' });
        if (url.includes('claim_voice_lounge_host')) return result('ticket');
        if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유 대화', host_persona: 'diplomat', memory: '', capacity: 1, ai_turns: 3 }]);
        if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?') || url.includes('voice_lounge_relationships?') || url.includes('voice_lounge_memories')) return result([]);
        if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '어서 와요, 오늘은 어떤 이야기예요?', memory: '' }) }] }] });
        if (url.includes('generativelanguage.googleapis.com')) {
          calls.gemini++;
          assert.ok(url.includes('gemini-3.1-flash-tts-preview:streamGenerateContent?alt=sse'), 'the speech model and the streaming route');
          assert.equal(init.headers['x-goog-api-key'], scenario.key, 'the key goes in a header, not the address');
          const body = JSON.parse(init.body);
          assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Despina');
          assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO']);
          assert.ok(body.contents[0].parts[0].text.includes('어서 와요, 오늘은 어떤 이야기예요?') && body.contents[0].parts[0].text.includes('도도'), 'the sentence and her way of speaking');
          return scenario.upstream();
        }
        if (url.endsWith('/audio/speech')) { calls.openai++; assert.equal(JSON.parse(init.body).voice, 'nova', 'OpenAI keeps her nova voice as the fallback'); return new Response(fallback); }
        if (url.includes('finish_voice_lounge_host')) return result(true);
        throw new Error('Unexpected call ' + url);
      }, async () => {
        const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
        assert.equal(response.status, 200, name);
        const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
        const heard = Buffer.concat(events.filter(event => event.type === 'audio').map(event => Buffer.from(event.audio, 'base64')));
        assert.deepEqual([...heard], [...scenario.expect], `${name}: what the listener hears`);
        assert.equal(events.at(-1).type, 'done', name);
        assert.deepEqual(calls, { gemini: scenario.gemini, openai: scenario.openai }, name);
      });
    } finally { delete process.env.GEMINI_API_KEY; }
  }
});

test('the member picks the voice engine: ElevenLabs and Typecast speak through the same 24 kHz PCM stream, and OpenAI speaks without a key or a voice', async () => {
  const pcm = Uint8Array.from({ length: 2400 }, (_, index) => (index * 11) % 256), fallback = new Uint8Array([9, 8, 7, 6]);
  // Typecast streams 32 kHz WAV: 3200 samples become 2400 at 24 kHz.
  const typecastSamples = 3200, typecastWav = new Uint8Array(44 + typecastSamples * 2), view = new DataView(typecastWav.buffer);
  'RIFF'.split('').forEach((c, i) => typecastWav[i] = c.charCodeAt(0)); 'WAVEfmt '.split('').forEach((c, i) => typecastWav[8 + i] = c.charCodeAt(0));
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 32000, true); 'data'.split('').forEach((c, i) => typecastWav[36 + i] = c.charCodeAt(0));
  const scenarios = {
    'eleven-v4-turbo': { env: { ELEVENLABS_API_KEY: 'el-key', SUPABASE_SERVICE_ROLE_KEY: 'service' }, eleven: 1, typecast: 0, openai: 0, bytes: pcm.length },
    'eleven-v4-turbo without a key': { speech: 'eleven-v4-turbo', env: { SUPABASE_SERVICE_ROLE_KEY: 'service' }, eleven: 0, typecast: 0, openai: 1, bytes: fallback.length },
    'a retired engine (eleven-flash)': { speech: 'eleven-flash', env: { ELEVENLABS_API_KEY: 'el-key', SUPABASE_SERVICE_ROLE_KEY: 'service' }, eleven: 0, typecast: 0, openai: 1, bytes: fallback.length },
    'typecast without a voice': { speech: 'typecast', env: { TYPECAST_API_KEY: 'tc-key', SUPABASE_SERVICE_ROLE_KEY: 'service' }, eleven: 0, typecast: 0, openai: 1, bytes: fallback.length },
    typecast: { env: { TYPECAST_API_KEY: 'tc-key', SUPABASE_SERVICE_ROLE_KEY: 'service', LOUNGE_VOICE_IDS: JSON.stringify({ typecast: { male: 'tc_male_voice' } }) }, eleven: 0, typecast: 1, openai: 0, bytes: 2400 * 2 },
    'an unknown engine': { speech: 'nope', env: { ELEVENLABS_API_KEY: 'el-key' }, eleven: 0, typecast: 0, openai: 1, bytes: fallback.length },
  };
  for (const [name, scenario] of Object.entries(scenarios)) {
    const calls = { eleven: 0, typecast: 0, openai: 0 };
    for (const [key, value] of Object.entries(scenario.env)) process.env[key] = value;
    try {
      await run(async (url, init) => {
        if (url.includes('/auth/')) return result({ id: 'user-1' });
        if (url.includes('claim_voice_lounge_host')) return result('ticket');
        if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유 대화', host_persona: 'jaeseok', memory: '', capacity: 1, ai_turns: 3 }]);
        if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?') || url.includes('voice_lounge_relationships?') || url.includes('voice_lounge_memories')) return result([]);
        if (url.endsWith('/responses') && isAfterReply(init)) return modelAnswer({ memory: '', events: [], memory_ops: [] });
        if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '그건 좀 다르게 찍고 싶네요.' }) }] }] });
        if (url.includes('lounge_speech_usage_status')) return result({ member: 0, total: 0 });
        if (url.includes('add_lounge_speech_usage')) return result(16);
        if (url.startsWith('https://api.elevenlabs.io/')) {
          calls.eleven++;
          assert.ok(url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/ZJCNdZEjYwkOElxugmW2/stream?output_format=pcm_24000'), 'the Korean library voice of this character: ' + url);
          assert.equal(init.headers['xi-api-key'], 'el-key');
          const body = JSON.parse(init.body);
          assert.equal(body.model_id, 'eleven_v4_turbo'); assert.equal(body.language_code, 'ko'); assert.equal(body.text, '그건 좀 다르게 찍고 싶네요.');
          assert.equal('speed' in body.voice_settings, false, 'v4 Turbo takes no speed');
          return new Response(pcm);
        }
        if (url.startsWith('https://api.typecast.ai/')) {
          calls.typecast++;
          assert.equal(url, 'https://api.typecast.ai/v1/text-to-speech/stream'); assert.equal(init.headers['X-API-KEY'], 'tc-key');
          const body = JSON.parse(init.body);
          assert.deepEqual([body.voice_id, body.model, body.language, body.text], ['tc_male_voice', 'ssfm-v30', 'kor', '그건 좀 다르게 찍고 싶네요.']);
          return new Response(new ReadableStream({ start(controller) { controller.enqueue(typecastWav.subarray(0, 1001)); controller.enqueue(typecastWav.subarray(1001)); controller.close(); } }));
        }
        if (url.endsWith('/audio/speech')) { calls.openai++; return new Response(fallback); }
        if (url.includes('finish_voice_lounge_reply') || url.includes('finish_voice_lounge_host') || url.includes('save_voice_lounge')) return result(true);
        throw new Error('Unexpected call ' + url);
      }, async () => {
        const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true, speech: scenario.speech ?? name }));
        assert.equal(response.status, 200, name);
        const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
        const heard = Buffer.concat(events.filter(event => event.type === 'audio').map(event => Buffer.from(event.audio, 'base64')));
        assert.equal(heard.length, scenario.bytes, `${name}: what the listener hears`);
        assert.deepEqual(calls, { eleven: scenario.eleven, typecast: scenario.typecast, openai: scenario.openai }, name);
      });
    } finally { for (const key of Object.keys(scenario.env)) delete process.env[key]; }
  }
});

test('a premium voice speaks only within the member\'s monthly allowance, and its characters are counted', async () => {
  const pcm = Uint8Array.from({ length: 2400 }, (_, index) => (index * 11) % 256), fallback = new Uint8Array([9, 8, 7, 6]);
  const library = 'ZJCNdZEjYwkOElxugmW2', premade = 'JBFqnCBsd6RMkjVDRZzb';
  const scenarios = {
    'within the allowance': { status: { member: 1200, total: 9000 }, eleven: [library], openai: 0, recorded: [16] },
    'a member who used the month': { status: { member: 5000, total: 5000 }, eleven: [], openai: 1, recorded: [] },
    'everyone together used the month': { env: { LOUNGE_ELEVEN_TOTAL_MONTHLY_CHARS: '100' }, status: { member: 0, total: 100 }, eleven: [], openai: 1, recorded: [] },
    'a larger allowance from the environment': { env: { LOUNGE_ELEVEN_MONTHLY_CHARS: '20000' }, status: { member: 5000, total: 5000 }, eleven: [library], openai: 0, recorded: [16] },
    'a guest': { user: { id: 'user-1', is_anonymous: true }, status: { member: 0, total: 0 }, eleven: [], openai: 1, recorded: [], statusCalls: 0 },
    'an allowance that cannot be read': { statusFailure: true, eleven: [], openai: 1, recorded: [] },
    'a free ElevenLabs plan (library voice refused)': { status: { member: 0, total: 0 }, refuseLibrary: true, eleven: [library, premade], openai: 0, recorded: [16] },
  };
  for (const [name, scenario] of Object.entries(scenarios)) {
    const calls = { eleven: [], openai: 0, recorded: [], status: 0 };
    Object.assign(process.env, { ELEVENLABS_API_KEY: 'el-key', SUPABASE_SERVICE_ROLE_KEY: 'service', ...(scenario.env ?? {}) });
    try {
      await run(async (url, init) => {
        if (url.includes('/auth/')) return result(scenario.user ?? { id: 'user-1' });
        if (url.includes('claim_voice_lounge_host')) return result('ticket');
        if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유 대화', host_persona: 'jaeseok', memory: '', capacity: 1, ai_turns: 3 }]);
        if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?') || url.includes('voice_lounge_relationships?') || url.includes('voice_lounge_memories')) return result([]);
        if (url.endsWith('/responses') && isAfterReply(init)) return modelAnswer({ memory: '', events: [], memory_ops: [] });
        if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '그건 좀 다르게 찍고 싶네요.' }) }] }] });
        if (url.includes('lounge_speech_usage_status')) {
          calls.status++;
          assert.deepEqual(JSON.parse(init.body), { p_user: 'user-1', p_engine: 'eleven-v4-turbo' });
          return scenario.statusFailure ? new Response('nope', { status: 500 }) : result(scenario.status);
        }
        if (url.includes('add_lounge_speech_usage')) { const body = JSON.parse(init.body); assert.equal(body.p_engine, 'eleven-v4-turbo'); assert.equal(body.p_user, 'user-1'); calls.recorded.push(body.p_chars); return result(body.p_chars); }
        if (url.startsWith('https://api.elevenlabs.io/')) {
          const voice = url.split('/text-to-speech/')[1].split('/')[0];
          calls.eleven.push(voice);
          if (scenario.refuseLibrary && voice === library) return new Response(JSON.stringify({ detail: { code: 'paid_plan_required' } }), { status: 402 });
          return new Response(pcm);
        }
        if (url.endsWith('/audio/speech')) { calls.openai++; return new Response(fallback); }
        if (url.includes('finish_voice_lounge_reply') || url.includes('finish_voice_lounge_host') || url.includes('save_voice_lounge')) return result(true);
        throw new Error('Unexpected call ' + url);
      }, async () => {
        const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true, speech: 'eleven-v4-turbo' }));
        assert.equal(response.status, 200, name);
        const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
        const heard = Buffer.concat(events.filter(event => event.type === 'audio').map(event => Buffer.from(event.audio, 'base64')));
        assert.equal(heard.length, scenario.openai ? fallback.length : pcm.length, `${name}: who speaks`);
        assert.equal(events.at(-1).type, 'done', name);
        assert.deepEqual({ eleven: calls.eleven, openai: calls.openai, recorded: calls.recorded }, { eleven: scenario.eleven, openai: scenario.openai, recorded: scenario.recorded }, name);
        if (scenario.statusCalls !== undefined) assert.equal(calls.status, scenario.statusCalls, `${name}: the allowance is not looked up`);
      });
    } finally { for (const key of ['ELEVENLABS_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', ...Object.keys(scenario.env ?? {})]) delete process.env[key]; }
  }
});

test('the speech action tells the picker what each premium voice has left this month', async () => {
  const wanted = { 'user-1': { member: 3300, total: 3300 }, guest: { member: 0, total: 0 } };
  for (const [name, user, env] of [['a member', { id: 'user-1' }, { ELEVENLABS_API_KEY: 'el-key' }], ['a guest', { id: 'guest', is_anonymous: true }, { ELEVENLABS_API_KEY: 'el-key' }], ['no key', { id: 'user-1' }, {}]]) {
    Object.assign(process.env, { SUPABASE_SERVICE_ROLE_KEY: 'service', ...env });
    try {
      await run(async url => {
        if (url.includes('/auth/')) return result(user);
        if (url.includes('lounge_speech_usage_status')) return result(wanted[user.id]);
        throw new Error('Unexpected call ' + url);
      }, async () => {
        const response = await handler(request({ action: 'speech', roomId }));
        assert.equal(response.status, 200, name);
        const { engines } = await response.json();
        assert.deepEqual(Object.keys(engines).sort(), ['eleven-v4-turbo', 'typecast']);
        const eleven = engines['eleven-v4-turbo'];
        if (name === 'a member') assert.deepEqual(eleven, { available: true, member: true, allowed: true, used: 3300, left: 1700, limit: 5000 });
        if (name === 'a guest') assert.deepEqual([eleven.member, eleven.allowed], [false, false]);
        if (name === 'no key') assert.deepEqual([eleven.available, eleven.allowed], [false, true], 'the allowance is real; the engine is not set up');
        assert.equal(engines.typecast.available, false);
      });
    } finally { for (const key of ['SUPABASE_SERVICE_ROLE_KEY', ...Object.keys(env)]) delete process.env[key]; }
  }
  const limits = lounge.loungePremiumSpeechLimits('eleven-v4-turbo', { LOUNGE_ELEVEN_MONTHLY_CHARS: '12000', LOUNGE_ELEVEN_TOTAL_MONTHLY_CHARS: '500000' });
  assert.deepEqual(limits, { member: 12000, total: 500000 });
  assert.deepEqual(lounge.loungePremiumSpeechLimits('eleven-v4-turbo', {}), { member: 5000, total: 0 }, 'the defaults');
  assert.deepEqual(lounge.loungePremiumSpeechLimits('eleven-v4-turbo', { LOUNGE_ELEVEN_MONTHLY_CHARS: 'lots', LOUNGE_ELEVEN_TOTAL_MONTHLY_CHARS: '-5' }), { member: 5000, total: 0 }, 'a bad value is the default');
  assert.deepEqual(lounge.loungeSpeechAllowance({ member: 5000, total: 0 }, { member: 4999, total: 9e9 }), { allowed: true, left: 1, reason: undefined });
  assert.equal(lounge.loungeSpeechAllowance({ member: 5000, total: 0 }, { member: 5000, total: 0 }).reason, 'member');
  assert.equal(lounge.loungeSpeechAllowance({ member: 5000, total: 100 }, { member: 0, total: 100 }).reason, 'total');
});

test('a voice reply starts speaking its first sentence while the rest is still being written, and never says it twice', async () => {
  const reply = { text: '*잔을 내려놓는다* 아, 진짜요? 그럼 내일 같이 가요.' };
  const json = JSON.stringify(reply), split = json.indexOf('그럼') + 3;
  let release; const gate = new Promise(resolve => { release = resolve; });
  const spoken = [];
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유 대화', host_persona: 'jaeseok', memory: '', capacity: 1, ai_turns: 3 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?') || url.includes('voice_lounge_relationships?') || url.includes('voice_lounge_memories')) return result([]);
    if (url.endsWith('/responses') && isAfterReply(init)) return modelAnswer({ memory: '', events: [], memory_ops: [] });
    // The first sentence arrives, then the reply waits until the first speech request has been made.
    if (url.endsWith('/responses')) return sse([...deltas(json, split).slice(0, 1), 'gate', deltas(json, split)[1], { type: 'response.completed', response: { status: 'completed' } }], gate);
    if (url.endsWith('/audio/speech')) { spoken.push(JSON.parse(init.body).input); release(); return new Response(new Uint8Array([1, 2, 3, 4])); }
    if (url.includes('finish_voice_lounge_reply') || url.includes('save_voice_lounge')) return result(true);
    throw new Error('Unexpected call ' + url);
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(spoken, ['아, 진짜요?', '그럼 내일 같이 가요.'], 'the first sentence, then only what follows it, without the action');
    assert.equal(events.find(event => event.type === 'host').text, reply.text, 'the whole reply is still saved and shown');
    assert.equal(events.filter(event => event.type === 'audio').length, 2);
  });
  assert.equal(lounge.loungeFirstSpokenSentence('*웃는다* 응. 나도'), '응.');
  assert.equal(lounge.loungeFirstSpokenSentence('“음…'), undefined, 'not over until more text follows');
  assert.equal(lounge.loungeFirstSpokenSentence('응. *고개를 끄덕'), undefined, 'an open action is not read');
});

test('a one-shot reply from 윤지안 comes back as a WAV the browser can decode, and falls back to the OpenAI mp3', async () => {
  const pcm = Uint8Array.from({ length: 2400 }, (_, index) => (index * 5) % 256), mp3 = new Uint8Array([1, 2, 3]);
  for (const [name, geminiAnswer] of [['gemini', () => result({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/l16; rate=24000', data: Buffer.from(pcm).toString('base64') } }] } }] })], ['down', () => result({ error: { message: 'x' } }, 503)]]) {
    process.env.GEMINI_API_KEY = 'gem-key';
    try {
      await run(async (url, init) => {
        if (url.includes('/auth/')) return result({ id: 'user-1' });
        if (url.includes('claim_voice_lounge_host')) return result('ticket');
        if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유 대화', host_persona: 'diplomat', memory: '', capacity: 1, ai_turns: 3 }]);
        if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?') || url.includes('voice_lounge_relationships?') || url.includes('voice_lounge_memories')) return result([]);
        if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '어서 와요.', memory: '' }) }] }] });
        if (url.includes('generativelanguage.googleapis.com')) { assert.ok(url.endsWith(':generateContent'), 'one request for the whole reply'); return geminiAnswer(); }
        if (url.endsWith('/audio/speech')) { assert.equal(JSON.parse(init.body).response_format, 'mp3'); return new Response(mp3); }
        if (url.includes('finish_voice_lounge_host')) return result(true);
        throw new Error('Unexpected call ' + url);
      }, async () => {
        const answer = await (await handler(request({ action: 'host', roomId, reason: 'followup' }))).json();
        const audio = Buffer.from(answer.audio, 'base64');
        if (name === 'gemini') {
          assert.equal(audio.subarray(0, 4).toString(), 'RIFF'); assert.equal(audio.subarray(8, 12).toString(), 'WAVE');
          assert.equal(audio.readUInt32LE(24), 24000, 'sample rate'); assert.equal(audio.readUInt16LE(22), 1, 'mono'); assert.equal(audio.readUInt16LE(34), 16, '16 bit');
          assert.deepEqual([...audio.subarray(44)], [...pcm]);
        } else assert.deepEqual([...audio], [...mp3], 'the OpenAI mp3 when Gemini fails');
      });
    } finally { delete process.env.GEMINI_API_KEY; }
  }
});

test('reply suggestions need a seat in the room, are spaced out and return spoken replies', async () => {
  const model = { output: [{ content: [{ type: 'output_text', text: JSON.stringify({ replies: ['네, 좀 그랬어요.', '사실 저도 궁금해요.', '그럼 어떻게 하세요?'] }) }] }] };
  let paid = 0, seated = true;
  const mock = async url => {
    if (url.includes('/auth/')) return result({ id: 'replies-member' });
    if (url.includes('voice_lounge_rooms?')) return result([{ host_persona: 'trickster', status: 'active', expires_at: null }]);
    if (url.includes('voice_lounge_messages?')) return result([{ user_id: null, nickname: '진행자', kind: 'host', text: '어서 와요.' }]);
    if (url.includes('voice_lounge_members?')) return result(seated ? [{ user_id: 'replies-member' }] : []);
    if (url.endsWith('/responses')) { paid++; return result(model); }
    throw new Error(`unexpected request ${url}`);
  };
  const ask = () => handler(request({ action: 'replies', roomId: 'lounge-00000000-0000-4000-8000-0000000000aa' }));
  await run(mock, async () => {
    const first = await ask();
    assert.equal(first.status, 200); assert.deepEqual((await first.json()).replies, ['네, 좀 그랬어요.', '사실 저도 궁금해요.', '그럼 어떻게 하세요?']);
    const again = await ask();
    assert.equal(again.status, 429); assert.equal((await again.json()).code, 'lounge_replies_cooldown'); assert.equal(paid, 1, 'a held-down button must not buy more suggestions');
  });
  seated = false; paid = 0;
  await run(mock, async () => {
    const response = await handler(request({ action: 'replies', roomId: 'lounge-00000000-0000-4000-8000-0000000000bb' }));
    assert.equal(response.status, 403); assert.equal(paid, 0, 'a non-member never reaches the model');
  });
});

test('a conversation picked up after a while tells the character how long the member was away', async () => {
  const hour = 3_600_000, at = Date.parse('2026-10-20T12:00:00Z');
  assert.equal(lounge.loungeTimeAway([{ kind: 'host', at }, { kind: 'human', at: at + 2 * hour }]), undefined, 'two hours is the same sitting');
  assert.equal(lounge.loungeTimeAway([{ kind: 'host', at }, { kind: 'human', at: at + 5 * hour }]), '5시간');
  assert.equal(lounge.loungeTimeAway([{ kind: 'human', at }, { kind: 'host', at: at + 60_000 }, { kind: 'human', at: at + 3 * 24 * hour }]), '3일');
  assert.equal(lounge.loungeTimeAway([{ kind: 'host', at }, { kind: 'human', at: at + 65 * 24 * hour }]), '2달');
  assert.equal(lounge.loungeTimeAway([{ kind: 'human', at }]), undefined, 'nothing before it');
  let context;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유 대화', host_persona: 'jaeseok', memory: '', capacity: 1, ai_turns: 9 }]);
    if (url.includes('voice_lounge_messages?')) {
      assert.ok(url.includes('created_at'), 'the times are read');
      return result([{ id: 2, kind: 'human', nickname: '나', text: '나 왔어', created_at: new Date(Date.now() - 60_000).toISOString() }, { id: 1, kind: 'host', nickname: 'AI', text: '내일 봐요.', created_at: new Date(Date.now() - 2 * 24 * hour).toISOString() }]);
    }
    if (url.includes('voice_lounge_members?') || url.includes('voice_lounge_relationships?') || url.includes('voice_lounge_memories')) return result([]);
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body);
      if (!context) { context = JSON.parse(body.input); assert.ok(body.instructions.includes('time_away'), 'the instruction says what it means'); }
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '오랜만이네요.', memory: '' }) }] }] });
    }
    if (url.includes('finish_voice_lounge')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2]));
    return result(null);
  }, async () => {
    await handler(request({ action: 'host', roomId, reason: 'followup', stream: true })).then(response => response.text());
  });
  assert.equal(context.time_away, '2일');
  assert.ok(context.recent.every(message => !('created_at' in message)), 'the times themselves are not sent to the model');
});

test('a chat reply is still written and saved when the connection drops while it is being written', async () => {
  const reply = { text: '잠깐만요, 금방 답할게요.' };
  const json = JSON.stringify(reply), split = 12;
  let release; const gate = new Promise(resolve => { release = resolve; });
  const kept = [], saved = []; let modelSignal;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유 대화', host_persona: 'jaeseok', memory: '', capacity: 1, ai_turns: 3, voice_on: false }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?') || url.includes('voice_lounge_relationships?') || url.includes('voice_lounge_memories')) return result([]);
    if (url.endsWith('/responses') && isAfterReply(init)) return modelAnswer({ memory: '', events: [], memory_ops: [] });
    if (url.endsWith('/responses')) { modelSignal = init.signal; return sse([...deltas(json, split).slice(0, 1), 'gate', deltas(json, split)[1], { type: 'response.completed', response: { status: 'completed' } }], gate); }
    if (url.includes('finish_voice_lounge_reply')) { saved.push(JSON.parse(init.body).p_text); return result(true); }
    if (url.includes('release_voice_lounge_host')) throw new Error('the turn must not be given back');
    if (url.includes('save_voice_lounge')) return result(true);
    throw new Error('Unexpected call ' + url);
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }), { waitUntil: promise => kept.push(promise) });
    const reader = response.body.getReader();
    void reader.read();
    await new Promise(resolve => setTimeout(resolve, 50));
    await reader.cancel(); // the phone leaves the page while the reply is being written
    release();
    await Promise.all(kept);
  });
  assert.equal(kept.length, 1, 'the work is handed to waitUntil');
  assert.deepEqual(saved, [reply.text], 'the whole reply is saved');
  assert.equal(modelSignal.aborted, false, 'the model request is not cancelled with the reader');
});

test('a one-to-one voice conversation is a phone call: the character answers first, and the chat after it carries on from the call', async () => {
  const turn = async ({ voiceOn, reason = 'followup', callStart = false, memory = '' }) => {
    let reply, after;
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'user-1' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '자유 대화', host_persona: 'jaeseok', memory, capacity: 1, ai_turns: 6, voice_on: voiceOn }]);
      if (url.includes('voice_lounge_messages?')) return result([{ id: 2, kind: 'human', nickname: '나', text: '응' }, { id: 1, kind: 'host', nickname: 'AI', text: '그래.' }]);
      if (url.includes('voice_lounge_members?') || url.includes('voice_lounge_relationships?') || url.includes('voice_lounge_memories')) return result([]);
      if (url.endsWith('/responses') && isAfterReply(init)) { after = JSON.parse(init.body); return modelAnswer({ memory: '', events: [], memory_ops: [] }); }
      if (url.endsWith('/responses')) { reply = JSON.parse(init.body); return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '여보세요?' }) }] }] }); }
      if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2]));
      if (url.includes('finish_voice_lounge') || url.includes('save_voice_lounge')) return result(true);
      throw new Error('Unexpected call ' + url);
    }, async () => { await (await handler(request({ action: 'host', roomId, reason, stream: true, ...(callStart ? { callStart: true } : {}) }))).text(); });
    return { input: JSON.parse(reply.input), instructions: reply.instructions, after };
  };
  const answered = await turn({ voiceOn: true, reason: 'opening', callStart: true });
  assert.deepEqual(answered.input.phone_call, { just_connected: true });
  assert.match(answered.instructions, /너는 전화를 받는 쪽이다/);
  assert.match(answered.instructions, /같은 자리에 있는 것처럼 굴지 않는다/);
  assert.match(answered.after.instructions, /memory 첫 줄은 '지금 장면: 통화 중/);
  const onCall = await turn({ voiceOn: true });
  assert.deepEqual(onCall.input.phone_call, { just_connected: false }, 'later turns of the call');
  const chat = await turn({ voiceOn: false, memory: '지금 장면: 통화 중 — 각자 집' });
  assert.equal(chat.input.phone_call, undefined);
  assert.match(chat.instructions, /방금까지 전화 통화를 하다 끊은 것이다/);
  const plainChat = await turn({ voiceOn: false, memory: '지금 장면: 카페' });
  assert.doesNotMatch(plainChat.instructions, /방금까지 전화 통화를 하다 끊은 것이다/);
});
