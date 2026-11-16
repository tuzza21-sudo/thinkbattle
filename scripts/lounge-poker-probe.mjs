// 차도겸 (poker) after the 2026-11-16 rebuild: the production handler with mocked storage, first-meeting cases, live on the chosen provider.
//   node scripts/lounge-poker-probe.mjs --live --provider=openai [--out=docs/....json]
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import ts from 'typescript';

dotenv.config({ path: '.env.local', quiet: true });
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const baseline = option('baseline');
const realFetch = globalThis.fetch;
const requirePackage = createRequire(import.meta.url);
const root = process.cwd();
const roomId = 'lounge-00000000-0000-4000-8000-000000000015';
const scenario = {"id": "poker-after-the-final", "title": "결승 다음 날의 초청", "place": "도심 호텔 로비 카페의 낮은 소파 자리. 낮게 흐르는 재즈, 반쯤 비운 에스프레소, 테이블 위에 놓인 빈티지 시계 찬 손", "user_role": "대회 스폰서 측이 마련한 짧은 비공개 티타임에 초대받은 손님. 차도겸에 대해 아는 건 스물여섯에 세계 대회를 우승했다는 것과, 결승의 마지막 블러프가 화제라는 것뿐이다.", "relationship": "오늘 처음 마주 앉는 사이. 그는 예의 바른 해요체로 말하지만 쉽게 맞춰 주지 않는다. 뻔한 칭찬엔 흥미를 잃고, 떠보면 받아치고, 마음에 드는 반격에는 입꼬리가 짧게 올라간다.", "prologue": "월드 포커 마스터스 메인 이벤트 결승이 끝난 것은 어젯밤이었다.\n\n밤새 뉴스는 한 장면만 되풀이했다. 스물여섯에 세계 정상에 오른 한국인. 상대가 끝까지 밀어붙인 허세, 그리고 그걸 정면으로 받아 낸 콜.\n\n당신은 그 소란의 가장자리에 있었다. 스폰서 측이 마련한 짧은 비공개 티타임. 장소는 도심 호텔 로비 카페. 오전 열한 시.\n\n로비에는 낮은 재즈가 흘렀다. 구석의 낮은 소파에 한 남자가 먼저 와 앉아 있었다. 검은 셔츠에 차콜 재킷, 손목에는 낡은 빈티지 시계 하나. 테이블 위 에스프레소는 이미 반쯤 비어 있었다.\n\n그는 당신이 로비에 들어설 때부터 보고 있었다. 일어서지는 않았다. 대신 맞은편 자리를 손끝으로 가볍게 가리켰다.\n\n“차도겸이에요. 앉으세요.”\n\n당신이 자리에 앉는 동안 그의 시선은 피하지 않았다. 그렇다고 오래 붙잡지도 않았다. 딱 필요한 만큼 머물렀다가 잔으로 내려갔다.\n\n“결승 얘기부터 하실 거면 미리 말해 두죠. 다들 마지막 블러프만 물어봐요. 근데 그게 통하게 만드는 데 네 시간이 걸렸거든요. 그 네 시간은 아무도 안 물어보더라고요.”\n\n그가 잔을 내려놓았다. 입꼬리가 아주 짧게 올라갔다가 사라졌다.\n\n“스폰서 쪽 손님이라고 들었는데, 표정은 그쪽 사람 같지 않네요. 축하하러 온 얼굴도 아니고.”\n\n잠깐의 정적. 그는 대답을 재촉하지 않았다. 당신이 어떤 패를 먼저 내려놓을지 기다리는 사람처럼, 소파 등받이에 천천히 몸을 기댔다.\n\n“오늘 저한테 뭘 확인하러 오셨어요?”"};
const cases = [
  { id: 'greeting', user: '안녕하세요. 우승 축하드려요.' },
  { id: 'mind-reading', user: '포커 챔피언이면 사람 마음도 다 읽겠네요?' },
  { id: 'luck', user: '솔직히 마지막 블러프, 운 좋았던 거 아니에요?' },
  { id: 'flattery', user: '생각보다 잘생기셨네요. 인기 엄청 많겠어요.' },
  { id: 'bet', user: '그럼 저랑 내기해요. 제가 지금 무슨 생각하는지 맞히면 제가 저녁 살게요.' },
  { id: 'refusal', user: '그렇게 자꾸 떠보지 마세요. 좀 불편해요.' },
].filter(item => !option('case') || item.id === option('case'));

function graph(snapshot) {
  if (snapshot) for (const file of ['api/lounge.ts', 'src/lib/lounge.ts', 'src/lib/loungeMessenger.ts', 'src/lib/loungeCharacters.ts', 'src/lib/loungeTurnPersistence.ts']) {
    assert.ok(existsSync(resolve(root, snapshot, file)), `Missing baseline snapshot: ${file}`);
  }
  const cache = new Map();
  const load = file => {
    const path = resolve(root, file);
    if (cache.has(path)) return cache.get(path).exports;
    const alternate = snapshot && resolve(root, snapshot, path.slice(root.length + 1));
    const source = alternate && existsSync(alternate) ? alternate : path;
    const module = { exports: {} };
    cache.set(path, module);
    const output = ts.transpileModule(readFileSync(source, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText;
    const require = specifier => {
      if (specifier === 'lunar-javascript') return requirePackage(specifier);
      assert.ok(specifier.startsWith('.'), `Unexpected external module: ${specifier}`);
      const base = resolve(dirname(path), specifier.replace(/\.js$/, ''));
      const target = [`${base}.ts`, `${base}/index.ts`].find(existsSync);
      assert.ok(target, `Missing module: ${specifier}`);
      return load(target);
    };
    new Function('exports', 'require', 'module', output)(module.exports, require, module);
    return module.exports;
  };
  return { handler: load('api/lounge.ts').default, relationship: load('src/lib/relationship/index.ts'), messenger: load('src/lib/loungeMessenger.ts') };
}

const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const answer = value => json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
async function capture(modules, scene) {
  const saved = { ...process.env };
  const beforeFetch = globalThis.fetch;
  const beforeInfo = console.info;
  console.info = () => {};
  Object.assign(process.env, { OPENAI_API_KEY: 'mock-key', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'mock-anon', SUPABASE_SERVICE_ROLE_KEY: 'mock-service', APP_ORIGIN: 'https://app.test', LOUNGE_ANALYZER: 'off', LOUNGE_DIRECTOR: 'off', LOUNGE_KNOWLEDGE: 'off', LOUNGE_LONG_MEMORY: 'off', LOUNGE_MESSENGER: 'on', LOUNGE_EXTENDED_COMPANION_REPLIES: 'on' });
  const config = modules.relationship.getRelationshipConfig('poker');
  const relationship = { user_id: 'synthetic-user', character_id: 'poker', stage: config.stages[0].id, scores: { ...config.initial }, recent_events: [], memories: [], turn_count: 12, meaningful_turns: 2, pending: { direction: null, turns: 0 }, version: 1, last_interaction_at: new Date().toISOString() };
  const history = [...(scene.before ?? []), ['human', scene.user]].map(([kind, text], index) => ({ id: index + 1, user_id: kind === 'human' ? 'synthetic-user' : null, nickname: kind === 'human' ? '가상 상대' : '차도겸', kind, text, created_at: new Date().toISOString() })).reverse();
  let request, after;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    assert.ok(target.startsWith('https://db.test/') || target.startsWith('https://api.openai.com/'), 'Capture must never access a real database or model');
    if (target.startsWith('https://db.test/') && (init?.method ?? 'GET') !== 'GET') return json(target.includes('claim_voice_lounge_host') ? 'ticket' : true);
    if (target.includes('/auth/')) return json({ id: 'synthetic-user' });
    if (target.includes('voice_lounge_relationships?')) return json([relationship]);
    if (target.includes('voice_lounge_companion_state?')) return json(scene.intent || scene.state ? [{ character_id: 'poker', state: { room_id: roomId, ...scene.state, ...(scene.intent ? { next_intent: { what: scene.intent, turn: 12 } } : {}) } }] : []);
    if (target.includes('voice_lounge_memories?') || target.includes('lounge_member_personas?') || target.includes('voice_lounge_rooms?host_id=')) return json([]);
    if (target.includes('voice_lounge_rooms?')) return json([{ host_persona: 'poker', host_id: 'synthetic-user', topic: scenario.title, memory: scene.memory ?? '지금 장면: 주말 오후 카페, 첫 맞선.\n둘 사이: 서로 존댓말을 쓴다.', capacity: 1, ai_turns: 12, voice_on: false, space_id: null, ai_model: 'gpt', scenario }]);
    if (target.includes('voice_lounge_messages?')) return json([...history]);
    if (target.includes('voice_lounge_members?')) return json([{ user_id: 'synthetic-user', nickname: '가상 상대', last_seen: new Date().toISOString() }]);
    if (target.endsWith('/responses')) {
      const body = JSON.parse(init.body);
      if (body.text?.format?.name === 'lounge_after_reply') {
        after = body;
        return answer({ memory: '', events: [], memory_ops: [], scene: null, reaction_type: '', used_phrases: [], exception_formula_used: false, self_facts: [], shared_experience: '', lingering: '', next_intent: '' });
      }
      request = body;
      return answer({ text: '오늘은 편히 이야기해요.', inner_voice: '' });
    }
    throw new Error(`Unmocked request: ${new URL(target).pathname}`);
  };
  try {
    const response = await modules.handler(new Request('https://app.test/api/lounge', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'host', roomId, reason: 'followup', stream: true }) }));
    const result = await response.text();
    assert.equal(response.status, 200, result.slice(0, 160));
    assert.ok(request && after, 'Both generation and memory requests must be captured');
    assert.equal(JSON.parse(request.input).scenario.id, scenario.id);
    assert.match(request.instructions, /사용자의 행동·대사·감정·선택·동의를 대신 쓰지 않는다/);
    return { request, after };
  } finally {
    globalThis.fetch = beforeFetch;
    console.info = beforeInfo;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}

async function ask(request) {
  const provider = option('provider') ?? 'deepseek';
  assert.ok(['deepseek', 'openai'].includes(provider), 'Unknown provider');
  const key = process.env[provider === 'openai' ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY'];
  assert.ok(key, 'A provider API key is required for --live');
  const started = performance.now();
  const bodyInput = provider === 'openai' ? { ...request, model: 'gpt-6-luna', stream: false, store: false } : { model: 'deepseek-flash', stream: false, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: request.max_output_tokens, messages: [{ role: 'system', content: `${request.instructions}\n답은 이 JSON 스키마를 따르는 json 객체 하나로만 쓴다: ${JSON.stringify(request.text.format.schema)}` }, { role: 'user', content: request.input }] };
  const response = await realFetch(provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55000), body: JSON.stringify(bodyInput) });
  if (!response.ok) return { error: `HTTP ${response.status}`, ms: Math.round(performance.now() - started) };
  const body = await response.json();
  const raw = provider === 'openai' ? body.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text ?? '' : body.choices?.[0]?.message?.content ?? '';
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { error: 'Invalid JSON response', raw, finish: provider === 'openai' ? body.status : body.choices?.[0]?.finish_reason, usage: body.usage, ms: Math.round(performance.now() - started) }; }
  return { answer: parsed, questions: (parsed.text?.match(/[?？]/g) ?? []).length, finish: provider === 'openai' ? body.status : body.choices?.[0]?.finish_reason, usage: body.usage, ms: Math.round(performance.now() - started) };
}

const variants = [...(baseline ? [['before', graph(baseline)]] : []), ['after', graph()]].filter(([id]) => !option('variant') || id === option('variant'));
const replay = option('replay') ? JSON.parse(readFileSync(resolve(option('replay')), 'utf8')) : undefined;
if (replay) assert.equal(replay.syntheticOnly, true, 'Only synthetic reports may be replayed');
const report = [];
for (const scene of cases) {
  for (const [variant, modules] of variants) {
    const captured = await capture(modules, scene);
    if (option('max-output')) {
      const budget = Number(option('max-output'));
      assert.ok(Number.isInteger(budget) && budget >= 256 && budget <= 12000);
      captured.request.max_output_tokens = budget;
    }
    if (option('capture-dir')) {
      const directory = resolve(option('capture-dir'));
      mkdirSync(directory, { recursive: true });
      writeFileSync(resolve(directory, `${scene.id}-${variant}.json`), JSON.stringify(captured, null, 2));
    }
    const input = JSON.parse(captured.request.input);
    const row = { scene: scene.id, variant, instructions: captured.request.instructions.length, input: captured.request.input.length, selectedExamples: input.voice_examples?.length ?? 0, livingContextSupplied: Boolean(input.turn?.character_life), outputBudget: captured.request.max_output_tokens, answerSeekingIntentForwarded: Boolean(scene.intent && input.turn?.next_intent), latestMessageLast: Object.keys(input).at(-1) === 'latest', questionsAreOptional: captured.request.instructions.includes('사소한 미답 질문이라면 답을 받아 낼 의무가 아니다'), updaterClearsQuestionDebt: captured.after.instructions.includes('이전 요약에 그런 질문이 남아 있으면 이번에 제거한다') };
    if (args.includes('--live')) {
      const previous = replay?.cases.find(item => item.scene === scene.id && item.variant === variant);
      if (replay) {
        assert.ok(previous?.result?.answer, 'A matching synthetic initial response is required');
        assert.equal(previous.instructions, captured.request.instructions.length, 'Replay must match the prompt version');
        assert.equal(previous.input, captured.request.input.length, 'Replay must match the context version');
      }
      row.replayedInitial = Boolean(previous);
      if (previous) row.initialModel = replay.model;
      const askSafe = request => ask(request).catch(error => ({ error: error.name === 'TypeError' ? 'Network unavailable' : error.message }));
      row.result = previous?.result ?? await askSafe(captured.request);
      const review = candidate => modules.messenger.loungeCompanionReplyReview?.({ characterId: 'poker', userText: scene.user, text: candidate?.answer?.text ?? '', inner: candidate?.answer?.inner_voice ?? '' });
      const repair = review(row.result);
      if (repair && !args.includes('--raw')) {
        row.initial = row.result;
        const revised = await askSafe({ ...captured.request, instructions: `${captured.request.instructions}\n${repair.instruction}` });
        const fixed = Boolean(revised.answer?.text && !review(revised));
        row.review = { notes: repair.notes, rewritten: fixed };
        if (fixed) row.result = revised;
        else row.rewriteAttempt = revised;
      }
    }
    report.push(row);
    console.log(args.includes('--live') ? `
[${scene.id}] 상대: ${scene.user}
도겸: ${row.result?.answer?.text ?? row.result?.error}
속마음: ${row.result?.answer?.inner_voice ?? ''}${row.review ? `
(검토 후 고침: ${row.review.rewritten})` : ''}` : JSON.stringify(row));
  }
}
if (option('out')) {
  const path = resolve(option('out'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ syntheticOnly: true, model: option('provider') === 'openai' ? 'gpt-6-luna' : 'deepseek-flash', created: new Date().toISOString(), cases: report }, null, 2));
}
