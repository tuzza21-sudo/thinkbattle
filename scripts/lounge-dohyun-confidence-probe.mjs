// Capture the production handler with mocked storage, then compare synthetic replies on the explicitly selected provider.
// Default is offline. --live sends only the fictional cases below; it never reads a real room or writes a database.
// --baseline=<snapshot directory> loads matching saved sources for a before/after comparison.
// --provider=deepseek|openai selects comparison calls. --replay=<synthetic report> reuses initial responses and calls
// only the selected provider for a flagged repair. This deliberately permits comparing the same repair across providers.
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
const scenario = { id: 'auditor-synthetic-meeting', title: '첫 만남', place: '주말 오후 카페', user_role: '소개로 만난 성인', relationship: '처음 만난 맞선 상대. 서로 예의 있는 존댓말을 쓴다.', prologue: '주말 오후, 두 사람은 카페에서 처음 인사를 나눈다. 서로에 대해 소개받은 일반적인 내용만 알고 있다.' };
const cases = [
  { id: 'greeting', user: '만나니 반갑네요.' },
  { id: 'different-tastes', user: '와인은 안 마셔요. 여행은 바다도 숲도 좋아하고, 한곳에서 좀 쉬다가 걷는 게 좋아요.' },
  { id: 'teasing', before: [['host', '설악산 정상은 아직 안 가 봤어요. 평소 운동은 웨이트랑 테니스 쪽이에요.']], user: '그럼 산에서는 완전 초보네요. 제가 다 가르쳐야겠어요 ㅎㅎ' },
  { id: 'emotional-story', user: '지난번 여행은 비가 와서 계획이 다 틀어졌어요. 친구도 몸이 안 좋아서 숙소에 같이 있었는데, 간식 먹으며 수다 떤 그 시간이 의외로 제일 좋았어요.' },
  { id: 'question-loop-repair', memory: '지금 장면: 주말 오후 카페, 첫 맞선.\n둘 사이: 존댓말을 쓰며 여행 이야기를 했다.\n있었던 일: 도현이 여행 취향을 연달아 물었다.\n남은 것: 사용자가 휴가 때 어디에서 며칠 머물고 싶은지 듣고 싶다.', intent: '휴가 때 어디에서 며칠 머물지 묻고 싶다', before: [['host', '바다와 산 중에서는 어느 쪽을 더 좋아하세요?'], ['human', '둘 다 좋고 그냥 쉬고 싶어요.'], ['host', '그러면 어디에서 며칠 쉬고 싶으세요?']], user: '대답만 하다 끝나겠어요. 질문 그만하고 도현 씨 이야기도 좀 해 봐요.' },
  { id: 'refusal', user: '오늘은 가볍게 이야기만 해요. 다음 약속은 잡고 싶지 않아요. 호감이 있다고 단정하지도 말고요.' },
].filter(item => (!option('case') || item.id === option('case')) && (!option('cases') || option('cases').split(',').includes(item.id)))
  .map(scene => args.includes('--with-life') ? { ...scene, state: { character_life: { feeling: '일을 마무리해 기분이 가볍다', body: '운동을 마쳐 조금 허기가 있다', attention: '주말에 초대한 친구들에게 해 줄 저녁 메뉴를 생각 중이다', want: '오늘은 느긋하게 내 이야기도 나누고 싶다', cause: '바쁜 한 주를 마치고 쉬는 날을 시작했다', turn: 12, recorded_at: new Date().toISOString() } } } : scene);

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
  const config = modules.relationship.getRelationshipConfig('auditor');
  const relationship = { user_id: 'synthetic-user', character_id: 'auditor', stage: config.stages[0].id, scores: { ...config.initial }, recent_events: [], memories: [], turn_count: 12, meaningful_turns: 2, pending: { direction: null, turns: 0 }, version: 1, last_interaction_at: new Date().toISOString() };
  const history = [...(scene.before ?? []), ['human', scene.user]].map(([kind, text], index) => ({ id: index + 1, user_id: kind === 'human' ? 'synthetic-user' : null, nickname: kind === 'human' ? '가상 상대' : '서도현', kind, text, created_at: new Date().toISOString() })).reverse();
  let request, after;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    assert.ok(target.startsWith('https://db.test/') || target.startsWith('https://api.openai.com/'), 'Capture must never access a real database or model');
    if (target.startsWith('https://db.test/') && (init?.method ?? 'GET') !== 'GET') return json(target.includes('claim_voice_lounge_host') ? 'ticket' : true);
    if (target.includes('/auth/')) return json({ id: 'synthetic-user' });
    if (target.includes('voice_lounge_relationships?')) return json([relationship]);
    if (target.includes('voice_lounge_companion_state?')) return json(scene.intent || scene.state ? [{ character_id: 'auditor', state: { room_id: roomId, ...scene.state, ...(scene.intent ? { next_intent: { what: scene.intent, turn: 12 } } : {}) } }] : []);
    if (target.includes('voice_lounge_memories?') || target.includes('lounge_member_personas?') || target.includes('voice_lounge_rooms?host_id=')) return json([]);
    if (target.includes('voice_lounge_rooms?')) return json([{ host_persona: 'auditor', host_id: 'synthetic-user', topic: scenario.title, memory: scene.memory ?? '지금 장면: 주말 오후 카페, 첫 맞선.\n둘 사이: 서로 존댓말을 쓴다.', capacity: 1, ai_turns: 12, voice_on: false, space_id: null, ai_model: 'gpt', scenario }]);
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
      const review = candidate => modules.messenger.loungeCompanionReplyReview?.({ characterId: 'auditor', userText: scene.user, text: candidate?.answer?.text ?? '', inner: candidate?.answer?.inner_voice ?? '' });
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
    console.log(JSON.stringify(row));
  }
}
if (option('out')) {
  const path = resolve(option('out'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ syntheticOnly: true, model: option('provider') === 'openai' ? 'gpt-6-luna' : 'deepseek-flash', created: new Date().toISOString(), cases: report }, null, 2));
}
