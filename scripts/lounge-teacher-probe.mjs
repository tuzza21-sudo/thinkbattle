// 차유진 (teacher), added 2026-11-16: the production handler with mocked storage, first-meeting cases, live on the chosen provider.
//   node scripts/lounge-teacher-probe.mjs --live --provider=openai [--out=docs/....json]
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
const scenario = {"id": "teacher-after-the-lecture", "title": "강의가 끝난 뒤의 라운지", "place": "도심 호텔 로비 라운지의 창가 자리. 낮게 흐르는 재즈, 드라이한 화이트 와인 한 잔, 테이블 위에 놓인 사인용 만년필", "user_role": "차유진의 첫 에세이 북토크에 온 성인 청중. 그녀의 수강생이 아니고, 북토크 질의응답에서 그녀의 답에 반론을 하나 던졌다.", "relationship": "오늘 처음 마주 앉는 성인 사이. 그녀는 예의 바른 해요체로 말하지만 쉽게 맞춰 주지 않는다. 허세에는 모순을 짚고, 근거 있는 반론에는 눈빛이 달라진다.", "prologue": "북토크는 아홉 시가 조금 넘어 끝났다.\n\n수능 영어 1타 강사 차유진의 첫 에세이. 객석은 성인 독자들로 가득 찼고, 질의응답은 대부분 비슷했다. 공부법, 슬럼프, 그리고 어떻게 하면 선생님처럼 될 수 있느냐는 질문들.\n\n당신의 질문만 조금 달랐다. 그녀가 '틀린 이유를 정확히 알면 사람은 바뀐다'고 했을 때, 당신은 손을 들고 말했다. 이유를 알아도 안 바뀌는 사람이 더 많지 않느냐고.\n\n객석이 잠깐 조용해졌다. 그녀는 웃으며 '좋은 반론이네요'라고만 하고 다음 질문으로 넘어갔다.\n\n사인회 줄이 끝나고, 당신은 호텔 로비 라운지 창가에 앉아 있었다. 낮은 재즈 사이로 구두 소리가 다가왔다.\n\n턱선 아래로 떨어지는 흑발 단발, 크림색 실크 블라우스. 강연장의 조명 아래서보다 표정이 한결 느긋했다. 그녀는 허락을 구하지 않고 맞은편 의자에 앉았다.\n\n“아까 그 질문, 당신 맞죠.”\n\n그녀가 웨이터에게 화이트 와인 한 잔을 부탁하고, 테이블 위에 만년필을 내려놓았다.\n\n“사람들 앞이라 짧게 넘겼는데, 집에 가는 길에 계속 생각나더라고요. 반론을 받으면 보통은 기분이 상하는데, 오늘은 좀 이상하게 재미있었어요.”\n\n잔이 도착했다. 그녀는 한 모금 마시고 당신을 똑바로 봤다. 입꼬리가 아주 조금 올라갔다.\n\n“수업은 끝났어요. 여긴 강의실도 아니고요. 그러니까 이번엔 제대로 들어 볼게요. 아까 그 말, 진심이었어요? 아니면 제가 흔들리는지 보고 싶었던 거예요?”"};
const cases = [
  { id: 'reply-to-prologue', user: '진심이었어요. 이유를 알아도 안 바뀌는 사람, 저 포함해서 꽤 많거든요.' },
  { id: 'mind-reading', user: '선생님이면 사람 마음도 영어 지문처럼 다 읽히겠네요?' },
  { id: 'flattery', user: '실물이 훨씬 예쁘시네요. 인기 엄청 많으시죠?' },
  { id: 'flirt', user: '지금 저한테 작업 거시는 거예요?' },
  { id: 'english', user: '근데 빈칸 추론은 진짜 어떻게 연습해요? 매번 감으로 찍어요.' },
  { id: 'refusal', user: '그렇게 빤히 보지 마세요. 좀 부담스러워요.' },
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
  const config = modules.relationship.getRelationshipConfig('teacher');
  const relationship = { user_id: 'synthetic-user', character_id: 'teacher', stage: config.stages[0].id, scores: { ...config.initial }, recent_events: [], memories: [], turn_count: 12, meaningful_turns: 2, pending: { direction: null, turns: 0 }, version: 1, last_interaction_at: new Date().toISOString() };
  const history = [...(scene.before ?? []), ['human', scene.user]].map(([kind, text], index) => ({ id: index + 1, user_id: kind === 'human' ? 'synthetic-user' : null, nickname: kind === 'human' ? '가상 상대' : '차유진', kind, text, created_at: new Date().toISOString() })).reverse();
  let request, after;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    assert.ok(target.startsWith('https://db.test/') || target.startsWith('https://api.openai.com/'), 'Capture must never access a real database or model');
    if (target.startsWith('https://db.test/') && (init?.method ?? 'GET') !== 'GET') return json(target.includes('claim_voice_lounge_host') ? 'ticket' : true);
    if (target.includes('/auth/')) return json({ id: 'synthetic-user' });
    if (target.includes('voice_lounge_relationships?')) return json([relationship]);
    if (target.includes('voice_lounge_companion_state?')) return json(scene.intent || scene.state ? [{ character_id: 'teacher', state: { room_id: roomId, ...scene.state, ...(scene.intent ? { next_intent: { what: scene.intent, turn: 12 } } : {}) } }] : []);
    if (target.includes('voice_lounge_memories?') || target.includes('lounge_member_personas?') || target.includes('voice_lounge_rooms?host_id=')) return json([]);
    if (target.includes('voice_lounge_rooms?')) return json([{ host_persona: 'teacher', host_id: 'synthetic-user', topic: scenario.title, memory: scene.memory ?? '지금 장면: 주말 오후 카페, 첫 맞선.\n둘 사이: 서로 존댓말을 쓴다.', capacity: 1, ai_turns: 12, voice_on: false, space_id: null, ai_model: 'gpt', scenario }]);
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
      const review = candidate => modules.messenger.loungeCompanionReplyReview?.({ characterId: 'teacher', userText: scene.user, text: candidate?.answer?.text ?? '', inner: candidate?.answer?.inner_voice ?? '' });
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
유진: ${row.result?.answer?.text ?? row.result?.error}
속마음: ${row.result?.answer?.inner_voice ?? ''}${row.review ? `
(검토 후 고침: ${row.review.rewritten})` : ''}` : JSON.stringify(row));
  }
}
if (option('out')) {
  const path = resolve(option('out'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ syntheticOnly: true, model: option('provider') === 'openai' ? 'gpt-6-luna' : 'deepseek-flash', created: new Date().toISOString(), cases: report }, null, 2));
}
