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
const lounge = compile('../src/lib/lounge.ts');
const study = compile('../src/lib/loungeStudy.ts');
const filmStudy = compile('../src/lib/loungeFilmStudy.ts');
const sessionLib = compile('../src/lib/loungeSession.ts');
const relationshipLib = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const handler = compile('../api/lounge.ts', path => path.endsWith('loungeStudy') ? study : path.endsWith('loungeFilmStudy') ? filmStudy : path.endsWith('loungeSession') ? sessionLib : path.endsWith('/relationship') ? relationshipLib : lounge).default;
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
      assert.match(body.instructions, aiTurns === 1 ? /이번 첫 인사에서만/ : /첫 인사는 이미 끝났다\. 패스 가능.*반복하지 않는다/);
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
  const client=compile('../src/lib/loungeApi.ts',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}}}));
  let calls=0;
  await run(async(url,init)=>{
    assert.equal(url,'/api/livekit-token');assert.equal(JSON.parse(init.body).roomName,roomId);
    calls++;if(calls===1)throw new TypeError('Failed to fetch');
    return result({url:'wss://voice.test',token:'voice-token'});
  },async()=>{assert.deepEqual(await client.requestLoungeVoiceToken(roomId),{url:'wss://voice.test',token:'voice-token'});assert.equal(calls,2);});
  for(const status of [401,403,502]) {
    calls=0;
    await run(async()=>{calls++;return result({error:'Voice access refused'},status);},async()=>{
      await assert.rejects(client.requestLoungeVoiceToken(roomId),error=>error.code===`lounge_voice_http_${status}`&&error.retryable===(status===502));
      assert.equal(calls,1);
    });
  }
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
      let speechCalls = 0;
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
          assert.equal(body.input, spoken);
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
      return result([velvetRow, { ...velvetRow, character_id: 'auditor', stage: 'UNVERIFIED' }]);
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
      assert.match(body.instructions, /CHALLENGES_CHARACTER_RESPECTFULLY: /);
      assert.match(body.instructions, /사람의 가치나 인격은 평가하지 않는다/);
      assert.ok(body.instructions.includes(lounge.getLoungeHost('velvet').companion));
      assert.deepEqual(body.text.format.schema.required, ['text', 'memory', 'events']);
      assert.equal(body.max_output_tokens, 1400, 'events and a long memory must not truncate the JSON reply');
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '반박이 있네. 근거부터 들어 보지.', memory: '', events: [
        { type: 'CHALLENGES_CHARACTER_RESPECTFULLY', confidence: 0.92, note: '근거를 들어 침착하게 반박함' },
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
      assert.equal(body.p_state.turnCount, 7); assert.equal(body.p_state.recentEvents.at(-1).type, 'CHALLENGES_CHARACTER_RESPECTFULLY');
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

test('the relationship endpoint returns labels to players and raw scores only to listed developers, without paid calls', async () => {
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
    assert.equal(body.relationship.metrics.trust.score, developer ? 30 : undefined);
    assert.equal(Boolean(body.relationship.debug), developer);
    if (developer) { assert.equal(body.relationship.debug.mood.amusement, 40); assert.equal(body.relationship.debug.version, 4); }
  }
});

test('there are exactly six hosts, each with a relationship configuration and instructions for both one-to-one and group rooms', () => {
  assert.deepEqual(lounge.loungeHosts.map(host => host.id).sort(), ['auditor', 'closer', 'ina', 'jaeseok', 'trickster', 'velvet']);
  for (const id of lounge.loungeRelationshipHostIds) {
    assert.ok(lounge.loungeHosts.some(host => host.id === id));
    assert.ok(relationshipLib.getRelationshipConfig(id), id);
    assert.deepEqual(relationshipLib.validateRelationshipConfig(relationshipLib.getRelationshipConfig(id)), []);
    assert.ok(lounge.loungeCharacterProfiles[id], `${id} has a lobby profile`);
  }
  assert.deepEqual(Object.keys(relationshipLib.relationshipConfigs).sort(), [...lounge.loungeRelationshipHostIds].sort());
  assert.equal(lounge.isLoungeRelationshipHost('sunny'), false);
  for (const host of lounge.loungeHosts) {
    assert.match(host.companion, /사람의 가치|사람 자체|사람이 아니다/, `${host.id} companion never judges the person`);
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
        assert.ok(payload.instructions.includes('사람끼리 이야기하는 방의 AI 도우미'));
        assert.ok(!payload.instructions.includes('대화 상대다. 진행자나 인터뷰어가 아니다'));
        assert.match(payload.instructions, new RegExp(`현재 사람 ${count}명이 함께 있다`));
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
      assert.match(payload.instructions, /AI가 대신 답하거나 다시 질문을 전달하지 않는다/);
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
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 1600, now - 6000, now - 1600, now - 350), 'followup', 'replies 1.5 s after the user stops and 0.3 s after the transcript');
  assert.equal(lounge.nextLoungeHostReason({ ...room, capacity: 6 }, messages, now, now - 500, now - 4000), null);
  assert.equal(lounge.nextLoungeHostReason(room, [...messages, { id: 3, kind: 'host', created_at: new Date(now).toISOString() }], now, now - 500, now - 4000), null, 'do not answer the same human twice');
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now, now - 4000), null, 'wait until the human finishes');
  assert.equal(lounge.nextLoungeHostReason({ ...room, ai_turns: 120 }, messages, now, now - 500, 0), null);
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 1400, now - 6000, now - 3500, now - 1200), null, 'a short pause is not the end of the turn');
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 2500, now - 6000, now - 1000, now - 1200), null, 'wait after the AI finishes speaking');
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 2500, now - 6000, now - 3500, now - 200), null, 'settle after transcription is saved');
  assert.equal(lounge.loungeSpeechPauseMs(1), 1500);
  assert.equal(lounge.loungeSpeechPauseMs(6), 950);
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
    { reason: 'requested', kind: undefined, stored: 'direct', expect: 'direct', session: { stage: 2, state: 'free' } },
    { reason: 'opening', session: { stage: 1, state: 'ready', speaker_id: 'b' }, rule: /stage_index=1이면 자기소개에서 이어지는 첫 이야기다. 1~2문장, 150자 이내/ },
    { reason: 'opening', session: { stage: 5, state: 'ready', speaker_id: 'a' }, rule: /stage_index=5이면 마무리다. 1~2문장, 120자 이내/ },
    { reason: 'silence', session: { stage: 2, state: 'free' }, rule: /reason=silence이면 사람들이 대화를 이어 가다 길게 멈춘 상황이다. 재촉하지 않는 한 문장, 100자 이내/ },
  ];
  for (const item of cases) await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_host')) { assert.equal(JSON.parse(init.body).p_reason, item.reason); return result('ticket'); }
    if (url.includes('voice_lounge_rooms?')) { assert.match(url, /moderator_request_kind/); return result([{ topic: '책 이야기', host_persona: 'jaeseok', memory: '', capacity: 4, ai_turns: 5, guided_session: true, topic_brief: topicBrief, moderator_request_kind: item.stored ?? null }]); }
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
      assert.match(body.instructions, /- direct: 누군가 AI를 직접 불러 물었다/);
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
  assert.deepEqual(lounge.loungeHelpOptions.map(option => option.kind), ['spark', 'question', 'topic', 'summary']);
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

test('one-to-one speech starts once the reply sentence is complete, before the memory and events are written', async () => {
  const reply = { text: '네 주장이지. "근거"는 아직이야.', memory: '사용자는 마케팅 탓을 했다.', events: [{ type: 'MAKES_UNSUPPORTED_CLAIM', confidence: 0.95, note: '근거 없이 단정' }] };
  const json = JSON.stringify(reply);
  let release, speechStartedBeforeRelease = false, released = false, finish, saved;
  const gate = new Promise(resolve => { release = () => { released = true; resolve(); }; });
  await withServiceKey(() => run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_relationships?')) return result([]);
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '실패 원인', host_persona: 'auditor', memory: '이전 기억', capacity: 1, ai_turns: 3 }]);
    if (url.includes('voice_lounge_messages?')) return result([{ id: 2, user_id: 'user-1', nickname: '나', kind: 'human', text: '다 마케팅 탓이야.' }]);
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'user-1', nickname: '나', last_seen: '' }]);
    if (url.endsWith('/responses')) {
      assert.equal(JSON.parse(init.body).stream, true);
      // The text field closes in the first chunk; the rest waits on the gate.
      return sse([...deltas(json, json.indexOf(',"memory"') + 3).slice(0, 1), 'gate', deltas(json, json.indexOf(',"memory"') + 3)[1], { type: 'response.completed', response: { status: 'completed' } }], gate);
    }
    if (url.endsWith('/audio/speech')) {
      speechStartedBeforeRelease = !released;
      assert.equal(JSON.parse(init.body).input, reply.text);
      setTimeout(release, 20);
      return new Response(new Uint8Array([0, 1, 2, 3]));
    }
    if (url.includes('finish_voice_lounge_host')) { finish = JSON.parse(init.body); return result(true); }
    if (url.includes('save_voice_lounge_relationship')) { saved = JSON.parse(init.body); return result(1); }
    throw new Error('Unexpected fetch ' + url);
  }, async () => {
    const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.map(event => event.type), ['host', 'audio', 'done']);
    assert.equal(events[0].text, reply.text, 'escaped quotes in the reply survive early extraction');
    assert.ok(speechStartedBeforeRelease, 'speech started while the memory and events were still being generated');
    assert.equal(finish.p_text, reply.text); assert.equal(finish.p_memory, reply.memory, 'the full memory is saved before the stream closes');
    assert.equal(saved.p_state.recentEvents.at(-1).type, 'MAKES_UNSUPPORTED_CLAIM', 'events written after the text still update the relationship');
  }));
});

test('if the reply is cut off after its sentence, the spoken sentence is saved and the previous memory is kept', async () => {
  const head = JSON.stringify({ text: '좋아, 그 근거는 볼 만해.', memory: '' }).replace(/"memory":""\}$/, '"memory":"사용자는 전환율');
  let finish;
  await run(async (url, init) => {
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '실패 원인', host_persona: 'ina', memory: '이전 기억', capacity: 1, ai_turns: 3 }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) return sse([{ type: 'response.output_text.delta', delta: head }, { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } }]);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 1]));
    if (url.includes('finish_voice_lounge_host')) { finish = JSON.parse(init.body); return result(true); }
    throw new Error('Unexpected fetch ' + url);
  }, async () => {
    const events = (await (await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }))).text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.map(event => event.type), ['host', 'audio', 'done']);
    assert.equal(finish.p_text, '좋아, 그 근거는 볼 만해.');
    assert.equal(finish.p_memory, '이전 기억');
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

test('long moderator speech survives the former 25-second deadline and 3MB PCM cap', async () => {
  const originalTimeout = AbortSignal.timeout;
  const deadlines = [];
  AbortSignal.timeout = milliseconds => { const controller = new AbortController(); deadlines.push({ milliseconds, controller }); return controller.signal; };
  const text = '마지막 장면에서 서로 다른 선택을 하는 이유를 함께 이야기해 봐요. '.repeat(20).slice(0, 600);
  let speechSignal, speechDeadline, upstream;
  try {
    await run(async (url, init) => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_host')) return result('ticket');
      if (url.includes('voice_lounge_rooms?')) return result([{ topic: '영화', host_persona: 'ina', memory: '', capacity: 1 }]);
      if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
      if (url.endsWith('/responses')) return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text, memory: '' }) }] }] });
      if (url.includes('finish_voice_lounge_host')) { assert.equal(JSON.parse(init.body).p_text, text); return result(true); }
      if (url.endsWith('/audio/speech')) {
        assert.equal(JSON.parse(init.body).input, text);
        speechSignal = init.signal; speechDeadline = deadlines.at(-1);
        return new Response(new ReadableStream({ start(controller) { upstream = controller; speechSignal.addEventListener('abort', () => controller.error(speechSignal.reason), { once: true }); } }));
      }
      throw new Error('Unexpected fetch');
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
      const eventsPromise = response.text();
      // One-to-one replies open the stream first and start speech inside it.
      for (let wait = 0; wait < 200 && !speechDeadline; wait++) await new Promise(resolve => setTimeout(resolve, 5));
      // Advance only the TTS deadline virtually, not wall time or completed RPCs.
      if (speechDeadline.milliseconds <= 25_001) speechDeadline.controller.abort(new DOMException('deadline', 'TimeoutError'));
      assert.equal(speechSignal.aborted, false, 'long speech was cancelled after just 25 seconds');
      for (let index = 0; index < 256; index++) upstream.enqueue(new Uint8Array(16_384));
      upstream.close();
      const events = (await eventsPromise).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(events[0].text, text); assert.equal(events.at(-1).type, 'done');
      assert.equal(events.some(event => event.type === 'error'), false);
      assert.equal(events.filter(event => event.type === 'audio').reduce((size, event) => size + Buffer.from(event.audio, 'base64').length, 0), 4_194_304);
    });
  } finally { AbortSignal.timeout = originalTimeout; }
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
      if (url.endsWith('/responses')) { models++; return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '마지막 선택은 어떻게 느꼈어요?', memory: '' }) }] }] }); }
      if (url.includes('finish_voice_lounge_host')) { saves++; return result(true); }
      if (url.endsWith('/audio/speech')) { speech++; inputs.push(JSON.parse(init.body)); return speech === 1 ? firstFailure() : new Response(new Uint8Array([0, 32, 0, 32])); }
      throw new Error('Unexpected fetch');
    }, async () => {
      const response = await handler(request({ action: 'host', roomId, reason: 'followup', stream: true }));
      const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
      assert.deepEqual(events.map(event => event.type), ['host', 'audio', 'done']);
      assert.equal(models, 1); assert.equal(saves, 1); assert.equal(speech, 2);
      assert.deepEqual(inputs[0], inputs[1], 'TTS recovery must preserve text, voice and persona');
    });
  }
});

test('TTS recovery is bounded and never repeats already transmitted syllables or immediate rate limits', async () => {
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
      assert.equal(speech, failure === 'empty' ? 2 : 1);
      assert.equal(events.filter(event => event.type === 'audio').length, failure === 'partial' ? 1 : 0);
    });
  }
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
  const client = compile('../src/lib/loungeApi.ts', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) } } }));
  for (const [status, body, code, retryable] of [[429, '', 'lounge_http_429', true], [502, '<html>Bad Gateway</html>', 'lounge_http_502', true], [401, '', 'lounge_http_401', false], [200, '', 'lounge_invalid_response', true]]) {
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
