import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = (path, require = () => {}) => {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(exports, require);
  return exports;
};
const lounge = compile('../src/lib/lounge.ts');
const study = compile('../src/lib/loungeStudy.ts');
const sessionLib = compile('../src/lib/loungeSession.ts');
const handler = compile('../api/lounge.ts', path => path.endsWith('loungeStudy') ? study : path.endsWith('loungeSession') ? sessionLib : lounge).default;
const roomId = 'lounge-00000000-0000-4000-8000-000000000001';
const request = (body, authorization = 'Bearer example', origin) => new Request('https://app.test/api/lounge', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
const result = (body, status = 200) => new Response(JSON.stringify(body), { status });
const run = async (mock, task) => {
  const originalFetch = globalThis.fetch;
  const previous = { ...process.env };
  process.env.OPENAI_API_KEY = 'test-key'; process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_ANON_KEY = 'test-anon'; process.env.APP_ORIGIN = 'https://app.test';
  globalThis.fetch = mock;
  try { await task(); } finally { globalThis.fetch = originalFetch; for (const name of ['OPENAI_API_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','APP_ORIGIN']) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
};

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

test('topic study requires search, stores real source URLs, and does not transcribe or generate speech', async () => {
  const calls = [];
  await run(async (url, init) => {
    calls.push(url);
    if (url.includes('/auth/')) return result({ id: 'host' });
    if (url.includes('claim_voice_lounge_study')) return result({ state: 'claimed', ticket: 'study-ticket', topic: '녹터널애니멀 영화' });
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.tools, [{ type: 'web_search' }]); assert.equal(body.tool_choice, 'required');
      assert.equal(JSON.parse(body.input).topic, '녹터널애니멀 영화'); assert.equal(body.store, false);
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
    const response = await handler(request({ action: 'prepare', roomId }));
    assert.equal(response.status, 200); assert.equal((await response.json()).study.confidence, 'verified');
    assert.equal(calls.filter(url => url.endsWith('/responses')).length, 1);
    assert.equal(calls.some(url => /audio|claim_voice_lounge_host/.test(url)), false);
  });
});

test('cached, concurrent and unauthorized topic preparation never repeat paid search', async () => {
  for (const claim of [null, { state: 'skipped' }, { state: 'busy' }, { state: 'ready', study: researched }, { state: 'exhausted' }]) {
    await run(async url => {
      if (url.includes('/auth/')) return result({ id: 'host' });
      if (url.includes('claim_voice_lounge_study')) return result(claim);
      throw new Error('Must not call OpenAI or save again');
    }, async () => {
      const response = await handler(request({ action: 'prepare', roomId }));
      const body = await response.json();
      if (claim?.state === 'exhausted') { assert.equal(response.status, 503); assert.equal(body.retryable, false); }
      else if (claim?.state === 'ready') assert.deepEqual(body.study, researched);
      else assert.equal(body.skipped, true);
    });
  }
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
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '녹터널애니멀', host_persona: 'ina', capacity: 1, memory: '', study_required: true, topic_study: briefing }]);
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_members?')) return result([]);
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body); assert.equal(body.tools, undefined);
      assert.deepEqual(JSON.parse(body.input).study, briefing); assert.match(body.instructions, /참가자 모두가 스포일러에 동의/);
      assert.match(body.instructions, /질문 목록은 대본이 아니며/);
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ text: '작품의 첫 인상은 어땠나요?', memory: '' }) }] }] });
    }
    if (url.includes('finish_voice_lounge_host')) return result(true);
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2]));
    throw new Error('Unexpected fetch');
  }, async () => { assert.equal((await handler(request({ action: 'host', roomId, reason: 'opening' }))).status, 200); });
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
      assert.match(context.session.question, /참여한 이유/); assert.match(context.session.question, /얻고 싶은/);
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
test('cost estimate counts aggregate speaking minutes instead of room duration per participant', () => {
  const cost = lounge.estimateLoungeCost(55);
  assert.ok(Math.abs(cost.total - .3084) < .000001);
  assert.ok(Math.abs(lounge.estimateLoungeCost(360).total - 1.2234) < .000001);
});

test('solo responds to a new human turn promptly, while group pacing and the room budget stay intact', () => {
  const now = Date.now();
  const room = { status: 'active', capacity: 1, ai_turns: 2, last_ai_at: new Date(now - 6000).toISOString(), started_at: new Date(now - 10_000).toISOString() };
  const messages = [{ id: 1, kind: 'host', created_at: room.last_ai_at }, { id: 2, kind: 'human', created_at: new Date(now - 500).toISOString() }];
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 2500, now - 6000, now - 3500, now - 1200), 'followup');
  assert.equal(lounge.nextLoungeHostReason({ ...room, capacity: 6 }, messages, now, now - 500, now - 4000), null);
  assert.equal(lounge.nextLoungeHostReason(room, [...messages, { id: 3, kind: 'host', created_at: new Date(now).toISOString() }], now, now - 500, now - 4000), null, 'do not answer the same human twice');
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now, now - 4000), null, 'wait until the human finishes');
  assert.equal(lounge.nextLoungeHostReason({ ...room, ai_turns: 120 }, messages, now, now - 500, 0), null);
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 1500, now - 6000, now - 3500, now - 1200), null, 'a short pause is not the end of the turn');
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 2500, now - 6000, now - 2000, now - 1200), null, 'wait after the AI finishes speaking');
  assert.equal(lounge.nextLoungeHostReason(room, messages, now, now - 2500, now - 6000, now - 3500, now - 500), null, 'settle after transcription is saved');
  assert.equal(lounge.loungeSpeechPauseMs(1), 2000);
  assert.equal(lounge.loungeSpeechPauseMs(6), 950);
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
  assert.equal(queue.push(new Float32Array(2376)), true);
  assert.equal(sources[0].startTime, .08, 'first packet is scheduled immediately');
  queue.push(new Float32Array(2400));
  assert.equal(sources[1].startTime, sources[0].startTime + sources[0].buffer.duration, 'timely packets join without gaps');
  assert.deepEqual(automation.slice(0, 2), [['set', 0, .08], ['ramp', 1, .088]], 'startup has a smooth gain ramp');
  assert.ok(automation.some(event => event[0] === 'cancel'), 'the provisional ending fade is removed between timely chunks');
  assert.equal(queue.finish(), true);
  assert.equal(sources.reduce((sum, source) => sum + source.buffer.duration * 24000, 0), 4800, 'EOF plays all held samples');
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
  delayed.push(new Float32Array(2400));
  context.currentTime = 1;
  delayed.push(new Float32Array(2400));
  assert.equal(sources.at(-1).startTime, 1.02, 'late packets get a fresh playback lead');
  assert.deepEqual(automation.slice(-4, -2), [['set', 0, 1.02], ['ramp', 1, 1.028]], 'a jitter gap fades in without a hard edge'); delayed.stop();
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
      if (url.endsWith('/audio/transcriptions')) { paid++; return result({ text: '영화 이야기' }); }
      if (url.includes('post_voice_lounge_message')) return new Response(null, { status: 403 });
      throw new Error('Unexpected fetch');
    }, async () => {
      const response = await handler(request({ action: 'transcribe', roomId, audio: Buffer.alloc(400).toString('base64'), mimeType: 'audio/webm' }));
      assert.equal(response.status, denied ? 429 : 502);
      assert.equal(paid, denied ? 0 : 1);
      if (denied) assert.equal((await response.json()).retryAfterSeconds, 5);
    });
  }
});
test('LiveKit creates a room with one seat for solo and six seats for a group', async () => {
  const originalEnv = { ...process.env };
  process.env.LIVEKIT_URL = 'wss://voice.test'; process.env.LIVEKIT_API_KEY = 'test-key'; process.env.LIVEKIT_API_SECRET = 'test-secret';
  try {
    for (const capacity of [1, 6]) {
      let roomOptions, grantOptions;
      const tokenHandler = compile('../api/livekit-token.ts', () => ({
        RoomServiceClient: class { async listRooms() { return []; } async createRoom(options) { roomOptions = options; } },
        AccessToken: class { addGrant(options) { grantOptions = options; } async toJwt() { return 'test-token'; } },
      })).default;
      await run(async url => {
        if (url.includes('/auth/')) return result({ id: 'host', user_metadata: { nickname: '나' } });
        if (url.includes('voice_lounge_rooms?')) return result([{ capacity, status: 'lobby', expires_at: null, created_at: new Date().toISOString() }]);
        if (url.includes('voice_lounge_members?')) return result([{ user_id: 'host' }]);
        throw new Error('Unexpected fetch');
      }, async () => {
        const response = await tokenHandler(new Request('https://app.test/api/livekit-token', { method: 'POST', headers: { Authorization: 'Bearer example', 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: roomId }) }));
        assert.equal(response.status, 200);
        assert.equal(roomOptions.maxParticipants, capacity);
        assert.equal(grantOptions.canUpdateOwnMetadata, true, 'lounge members must be able to share their selected avatar');
      });
    }
  } finally {
    for (const name of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']) {
      if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name];
    }
  }
});
