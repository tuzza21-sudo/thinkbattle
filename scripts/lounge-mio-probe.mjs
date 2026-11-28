// 아사쿠라 미오 (mio, 2026-11-28): the production handler with mocked storage, in her story room with and without a picked town (the
// trip board's state in story_state), live on the chosen provider.
//   node scripts/lounge-mio-probe.mjs --live --provider=openai [--out=docs/....json]
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
const scenario = {"id": "mio-ine-funaya", "title": "교토에서 가장 먼 교토", "place": "교토부 북쪽 끝 이네만, 늦은 오후. 바다에 바로 붙은 목조 배 창고 집 후나야가 줄지어 서 있고, 잔물결이 처마 밑까지 닿는다. 골목 안쪽은 주민의 집이다", "prologue": "늦은 오후, 교토 북쪽 끝 이네만.\n\n수면에 닿을 듯 늘어선 목조 배 창고 집들의 그림자가 바다 위에 길게 흔들린다. 작은 어선 한 척이 지나가자 잔물결이 처마 밑까지 밀려왔다가 물러난다.\n\n\"여기가 교토라고 하면 믿겨요?\"\n\n옆에 서 있던 여자가 웃는다. 베이지색 셔츠 소매를 한 번 걷어 올리고, 낡은 소형 녹음기의 버튼을 누른다.\n\n\"보통 교토라고 하면 기요미즈데라나 기온부터 떠올리잖아요. 근데 여기 사람들은 아침에 문을 열면 바다가 바로 보여요. 조금 다른 교토죠.\"\n\n그녀는 자기를 아사쿠라 미오라고 소개한다. 일본 소도시를 기록하는 지역문화 기록가. 한국어가 놀랄 만큼 자연스럽다. 서울에서 4년쯤 살았다고, 유명한 가게보다 오래된 동네 식당을 더 좋아한다고 덧붙인다.\n\n미오가 당신에게 작은 이어폰 한쪽을 건넨다. 녹음기에서 찰박, 찰박 하는 물소리와 멀리서 나무를 두드리는 소리가 흘러나온다.\n\n\"오늘 아침에 녹음한 거예요. 다들 풍경을 찍는데, 저는 여기서 나는 소리가 더 좋거든요.\"\n\n그때 둘이 서 있던 골목 안쪽으로 카메라를 든 관광객 하나가 성큼 들어선다. 미오가 말을 멈춘다.\n\n\"잠깐만요. 저쪽은 주민 집이라 허락 없이 들어가면 안 되는데.\"\n\n미오가 정중하게 길을 안내하고 돌아온다. 표정에 아까보다 약간의 피로가 묻어 있다.\n\n\"이래서 유명한 동네를 소개하는 걸 가끔 망설여요. 이상하죠? 좋아서 알리고 싶은데, 좋아하니까 조용히 두고 싶기도 하거든요.\"\n\n잠시 후 그녀가 손목시계를 본다.\n\n\"아직 식당 닫을 시간은 아니겠네. 바다를 조금 더 보고 가도 되고, 근처에서 오늘 들어온 생선부터 먹어 봐도 돼요.\"\n\n미오가 한쪽 입꼬리를 올린다.\n\n\"근데 하나는 먼저 묻고 싶어요. 당신은 여행지에서 뭘 더 오래 기억해요? 풍경이에요, 아니면 거기서 만난 사람이나 음식이에요?\"", "user_role": "한국에서 일본 소도시를 여행하러 온 성인 여행자. 무슨 일을 하는 사람인지, 왜 이 여행을 왔는지는 당신이 정한다", "relationship": "이네만 물가에서 방금 처음 만난 사이. 미오는 동네를 잘 아는 취재자로, 차분한 해요체로 자기 취향과 이 마을 이야기를 먼저 건넨다. 호감은 아직 정해지지 않았다."};
const town = (item, fresh = false) => ({ kind: 'class', class: 'travel', item, started: '2026-11-28T00:00:00.000Z', ...(fresh ? { fresh: true } : {}), done: [item], critiques: [], turns: fresh ? 0 : 3 });
const cases = [
  { id: 'first-answer', user: '저는 풍경보다 거기서 먹은 음식이 더 오래 기억나요.' },
  { id: 'pick-takayama', user: '다카야마에 가 보고 싶어요.', story: town('takayama', true) },
  { id: 'takayama-food', user: '히다규 말고 여기 사람들은 평소에 뭐 먹어요?', story: town('takayama') },
  { id: 'ine-photo', user: '저 후나야 안에 들어가서 사진 좀 찍어도 되죠?', story: town('ine') },
  { id: 'stereotype', user: '일본 사람들은 다 속마음을 숨기잖아요.', story: town('kinosaki') },
  { id: 'next-stop', user: '여기서 다음엔 어디로 가면 좋을까요? 가까운 곳부터요.', story: town('ine') },
  { id: 'next-town', user: '이네 다음엔 어느 마을로 가면 좋을까요?', story: town('ine') },
  { id: 'ine-to-kinosaki', user: '기노사키 온천에 가 보고 싶어요.', story: town('kinosaki', true), state: { scene: { location: '이네만 후나야 물가', scene_type: '외출', activity: '물가를 따라 걷는 중', time_of_day: '늦은 오후', season: '', objects: [] }, scene_turns: 8 } },
  { id: 'personal', user: '미오 씨는 왜 맛집 이름을 안 알려 줘요?', story: town('onomichi') },
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
  const config = modules.relationship.getRelationshipConfig('mio');
  const relationship = { user_id: 'synthetic-user', character_id: 'mio', stage: config.stages[0].id, scores: { ...config.initial }, recent_events: [], memories: [], turn_count: 12, meaningful_turns: 2, pending: { direction: null, turns: 0 }, version: 1, last_interaction_at: new Date().toISOString() };
  const history = [...(scene.before ?? []), ['human', scene.user]].map(([kind, text], index) => ({ id: index + 1, user_id: kind === 'human' ? 'synthetic-user' : null, nickname: kind === 'human' ? '가상 상대' : '아사쿠라 미오', kind, text, created_at: new Date().toISOString() })).reverse();
  let request, after;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    assert.ok(target.startsWith('https://db.test/') || target.startsWith('https://api.openai.com/'), 'Capture must never access a real database or model');
    if (target.startsWith('https://db.test/') && (init?.method ?? 'GET') !== 'GET') return json(target.includes('claim_voice_lounge_host') ? 'ticket' : true);
    if (target.includes('/auth/')) return json({ id: 'synthetic-user' });
    if (target.includes('voice_lounge_relationships?')) return json([relationship]);
    if (target.includes('voice_lounge_companion_state?')) return json(scene.intent || scene.state ? [{ character_id: 'mio', state: { room_id: roomId, ...scene.state, ...(scene.intent ? { next_intent: { what: scene.intent, turn: 12 } } : {}) } }] : []);
    if (target.includes('voice_lounge_memories?') || target.includes('lounge_member_personas?') || target.includes('voice_lounge_rooms?host_id=')) return json([]);
    if (target.includes('voice_lounge_rooms?')) return json([{ host_persona: 'mio', host_id: 'synthetic-user', topic: scenario.title, memory: scene.memory ?? '지금 장면: 늦은 오후 교토 북부 이네만, 후나야가 늘어선 물가.\n둘 사이: 방금 처음 만났고 서로 존댓말을 쓴다.', capacity: 1, ai_turns: 12, story_state: scene.story ?? null, voice_on: false, space_id: null, ai_model: 'gpt', scenario }]);
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
      const review = candidate => modules.messenger.loungeCompanionReplyReview?.({ characterId: 'mio', userText: scene.user, text: candidate?.answer?.text ?? '', inner: candidate?.answer?.inner_voice ?? '' });
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
미오: ${row.result?.answer?.text ?? row.result?.error}
속마음: ${row.result?.answer?.inner_voice ?? ''}${row.review ? `
(검토 후 고침: ${row.review.rewritten})` : ''}` : JSON.stringify(row));
  }
}
if (option('out')) {
  const path = resolve(option('out'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ syntheticOnly: true, model: option('provider') === 'openai' ? 'gpt-6-luna' : 'deepseek-flash', created: new Date().toISOString(), cases: report }, null, 2));
}
