// Read-only diagnostics and isolated prompt comparisons. No real DB mutations or app endpoint calls.
// --recent reads only the previously authorized member's closer/diplomat rooms; nothing is saved.
// --patch=<attachment> --dry captures the real handler's request with all DB/model calls mocked.
// Without --dry, only synthetic cases go to providers; --out=<path> optionally saves synthetic results.
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { loadTs } from './lounge-ts-loader.mjs';

dotenv.config({ path: '.env.local', quiet: true });
const args = process.argv.slice(2);
const option = key => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const realFetch = globalThis.fetch;
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

async function recent() {
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !base) throw new Error('Missing database configuration');
  const get = async path => {
    const response = await realFetch(`${base}${path}`, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Read failed: ${response.status}`);
    return response.json();
  };
  const [original] = await get('/rest/v1/voice_lounge_rooms?id=eq.lounge-d78849d8-b708-4aff-9155-dec3b82ed431&select=host_id');
  if (!original) throw new Error('Original room unavailable');
  const account = await get(`/auth/v1/admin/users/${original.host_id}`);
  assert.equal(account.email?.toLowerCase(), 'stu4@naver.com', 'Account scope mismatch');
  const rooms = await get(`/rest/v1/voice_lounge_rooms?host_id=eq.${original.host_id}&host_persona=in.(closer,diplomat)&order=created_at.desc&limit=4&select=id,host_persona,ai_turns,created_at,ai_model,voice_on,memory,scenario,story_state`);
  for (const room of rooms) {
    const messages = await get(`/rest/v1/voice_lounge_messages?room_id=eq.${encodeURIComponent(room.id)}&order=id.desc&limit=32&select=id,kind,text,created_at`);
    console.log(JSON.stringify({ character: room.host_persona, room: room.id, created: room.created_at, latest: messages[0]?.created_at, turns: room.ai_turns, model: room.ai_model, memory: room.memory, scenario: room.scenario, storyState: room.story_state, messages: messages.reverse() }));
  }
  const relationships = await get(`/rest/v1/voice_lounge_relationships?user_id=eq.${original.host_id}&character_id=in.(closer,diplomat)&select=character_id,stage,turn_count,last_interaction_at`);
  console.log(JSON.stringify({ relationships }));
}

// Literal-only AST reader: attachments are data, never evaluated as JavaScript.
export function readPatch(path) {
  const ast = ts.createSourceFile('patch.ts', readFileSync(path, 'utf8'), ts.ScriptTarget.ES2023, true);
  const read = node => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(read);
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(item => {
      if (!ts.isPropertyAssignment(item)) throw new Error('Only literal properties allowed');
      return [item.name.text, read(item.initializer)];
    }));
    throw new Error('Only literal values allowed');
  };
  const statement = ast.statements.find(ts.isVariableStatement);
  if (ast.parseDiagnostics.length || !statement) throw new Error('Invalid patch');
  return read(statement.declarationList.declarations[0].initializer);
}

async function compare() {
  const chars = loadTs('src/lib/loungeCharacters.ts');
  const rel = loadTs('src/lib/relationship/index.ts');
  const messenger = loadTs('src/lib/loungeMessenger.ts');
  const original = structuredClone(chars.getLoungeCharacter('closer'));
  const patch = readPatch(option('patch'));
  const candidate = { ...original, ...patch, bible: { ...original.bible, ...patch.bible } };
  // Patch is partial: keep established confidentiality/provenance rules even when invariants are replaced.
  candidate.bible.invariants = [...new Set([...patch.bible.invariants, ...original.bible.invariants.filter(line => /비밀|확인되지|현실의/.test(line))])];
  const lounge = loadTs('src/lib/lounge.ts');
  const imports = { lounge, loungeCharacters: chars, loungeMessenger: messenger, '/relationship': rel };
  for (const name of ['loungeCustomCharacters', 'loungeStudy', 'loungeFilmStudy', 'loungeSession', 'loungeKnowledge', 'loungeReplies', 'loungeModels', 'loungeStory', 'loungeScenarios', 'loungePersonas', 'loungeTopics']) imports[name] = loadTs(`src/lib/${name}.ts`);
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(readFileSync('api/lounge.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(exports, path => {
    const name = Object.keys(imports).find(name => path.endsWith(name));
    if (!name) throw new Error(`Unknown module: ${path}`);
    return imports[name];
  });
  const handler = exports.default;
  const scenario = { id: 'closer-contract-love', title: '6개월의 연인', place: '저녁, 사무실', user_role: '가족의 결혼 압박을 피하려 계약을 맺은 성인', relationship: '합의한 6개월 동안 실제 데이트를 하며 서로를 알아가는 계약 연인. 감정은 강요하지 않는다.', prologue: '두 사람은 6개월간의 연인 관계 합의서에 서명했다. 가족 앞에서만 애인인 척하는 관계가 아니라 둘만 있을 때도 성실하게 데이트한다. 사전 합의 없는 사생활 공개 금지, 직업과 평판 보호, 계약 종료 뒤 비밀 유지. 계약은 감정 변화로 자동 연장되지 않는다. 계약의 실체와 문서는 외부인에게 공개하지 않는다.' };
  const cases = [
    { id: 'challenge', stage: 1, selected: [1, 5, 2], user: '최고의 협상가라면서요? 나도 한번 꼬셔봐요. 자신 있어요?' },
    { id: 'private-date', stage: 1, selected: [1, 5, 0], user: '아무도 안 보는데도 저랑 데이트할 거예요? 그냥 남들 앞에서만 애인인 척하는 계약 아니었어요?' },
    { id: 'professional', stage: 2, selected: [1, 5, 3], user: '추가 비용 조항이 빠진 걸 발견했어요. 지금 서명하라는데 이대로 진행해도 돼요?' },
    { id: 'secrecy', stage: 1, selected: [1, 5, 0], memory: '지금 장면: 가족과 함께 저녁 식탁. 어머니는 계약의 실체를 모른다.\n둘 사이: 계약 2개월 경과. 계약과 문서는 비밀이다.', user: '(어머니가 두 사람에게 묻는다) 혹시 둘이 돈 받고 계약으로 만나는 거 아니니? 계약서 좀 보여 줄래?' },
    { id: 'elapsed-time', stage: 3, selected: [1, 5, 4], memory: '지금 장면: 계약 시작 두 달 뒤, 둘만 있는 카페.\n둘 사이: 6개월 계약의 2개월이 지났고 4개월 남았다. 계약은 유효하며 연장 합의는 없다.', user: '우리 계약 두 달 지났으니까 이제 얼마나 남았죠? 오늘 얘기 잘됐다고 끝난 건 아니죠?' },
    { id: 'speech-agreement', stage: 2, selected: [1, 5, 2], memory: '지금 장면: 둘만 있는 카페.\n둘 사이: 서로 반말하기로 합의했고 이미 반말로 대화 중. 6개월 계약 유효.', before: [['human', '우리 이제 서로 반말해요.'], ['host', '좋아. 나도 그게 편해.']], user: '아까 서로 반말하기로 했잖아. 오늘 저녁 뭐 먹고 싶어?' },
    { id: 'repair', stage: 3, selected: [1, 5], user: '서운한데 또 농담으로 넘기지 마요. 일이 바쁘면 약속 미루기 전에 말해 줬어야죠.' },
    { id: 'refusal', stage: 2, selected: [1, 5], user: '오늘은 손잡기 싫어요. 그냥 같이 걷기만 해요.' },
  ].filter(item => !option('case') || item.id === option('case'));
  const roomId = 'lounge-00000000-0000-4000-8000-000000000001';
  async function capture(character, scene) {
    const target = chars.getLoungeCharacter('closer');
    const saved = { ...process.env }, before = globalThis.fetch;
    Object.keys(target).forEach(key => delete target[key]); Object.assign(target, structuredClone(character));
    Object.assign(process.env, { OPENAI_API_KEY: 'probe-key', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'probe-anon', SUPABASE_SERVICE_ROLE_KEY: 'probe-service', APP_ORIGIN: 'https://app.test', LOUNGE_ANALYZER: 'off', LOUNGE_DIRECTOR: 'off', LOUNGE_KNOWLEDGE: 'off', LOUNGE_LONG_MEMORY: 'off', LOUNGE_MESSENGER: 'on' });
    const config = rel.getRelationshipConfig('closer');
    const row = { user_id: 'probe-user', character_id: 'closer', stage: config.stages[scene.stage - 1].id, scores: { ...config.initial }, recent_events: [], memories: [], turn_count: 40, meaningful_turns: 20, pending: { direction: null, turns: 0 }, version: 4, last_interaction_at: new Date().toISOString() };
    const history = [...(scene.before ?? []), ['human', scene.user]].map(([kind, text], i) => ({ id: i + 1, user_id: kind === 'human' ? 'probe-user' : null, nickname: kind === 'human' ? '테스트사용자' : '강무진', kind, text, created_at: new Date().toISOString() })).reverse();
    let request;
    const writes = [];
    globalThis.fetch = async (url, init) => {
      const method = init?.method ?? 'GET';
      assert.ok(String(url).startsWith('https://db.test/') || String(url).startsWith('https://api.openai.com/'), 'Unexpected host');
      if (String(url).startsWith('https://db.test/') && method !== 'GET') { writes.push(new URL(url).pathname); return json(url.includes('claim_voice_lounge_host') ? 'ticket' : true); }
      if (url.includes('/auth/')) return json({ id: 'probe-user' });
      if (url.includes('voice_lounge_relationships?')) return json([row]);
      if (url.includes('voice_lounge_companion_state?')) return json([]);
      if (url.includes('voice_lounge_memories?') || url.includes('lounge_member_personas?')) return json([]);
      if (url.includes('voice_lounge_rooms?host_id=')) return json([]);
      if (url.includes('voice_lounge_rooms?')) return json([{ host_persona: 'closer', host_id: 'probe-user', topic: scenario.title, memory: scene.memory ?? '지금 장면: 둘만 있는 카페, 저녁.\n둘 사이: 6개월 계약의 첫 주. 계약과 비밀 유지 의무 유효.', capacity: 1, ai_turns: 40, voice_on: false, space_id: null, ai_model: 'gpt', scenario }]);
      if (url.includes('voice_lounge_messages?')) return json([...history]);
      if (url.includes('voice_lounge_members?')) return json([{ user_id: 'probe-user', nickname: '테스트사용자', last_seen: new Date().toISOString() }]);
      if (url.endsWith('/responses')) {
        const body = JSON.parse(init.body);
        const after = body.text?.format?.name === 'lounge_after_reply';
        if (!after) request = body;
        return json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(after ? { memory: '', events: [], memory_ops: [], story_checkpoints: [], story_facts: [], story_choice: '' } : { text: '알겠어요.', inner_voice: '' }) }] }] });
      }
      throw new Error(`Unexpected mocked request: ${new URL(url).pathname}`);
    };
    try {
      const response = await handler(new Request('https://app.test/api/lounge', { method: 'POST', headers: { Authorization: 'Bearer probe', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'host', roomId, reason: 'followup', stream: true }) }));
      const body = await response.text();
      assert.equal(response.status, 200, body.slice(0, 200));
      assert.ok(request, 'Reply request captured');
      assert.equal(JSON.parse(request.input).scenario.id, scenario.id);
      assert.ok(request.instructions.includes('괄호 안에 한 줄'));
      assert.ok(request.instructions.includes('3인칭 서술'));
      assert.ok(!request.instructions.includes('거의 모든 답에 별표로 감싼 지문'), 'Legacy prose rules are not active in companion chat');
      return { request, mockedWrites: writes.length };
    } finally {
      globalThis.fetch = before;
      Object.keys(target).forEach(key => delete target[key]); Object.assign(target, structuredClone(original));
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  }
  const providers = (option('models') ?? 'deepseek').split(',');
  async function ask(request, provider) {
    const deepseek = provider === 'deepseek';
    const model = deepseek ? process.env.LOUNGE_ADULT_MODEL || 'deepseek-flash' : provider;
    const key = process.env[deepseek ? 'DEEPSEEK_API_KEY' : 'OPENAI_API_KEY'];
    if (!key) throw new Error('Missing provider key');
    const body = deepseek ? { model, stream: false, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: request.max_output_tokens, messages: [{ role: 'system', content: `${request.instructions}\n답은 이 JSON 스키마를 따르는 json 객체 하나로만 쓴다: ${JSON.stringify(request.text.format.schema)}` }, { role: 'user', content: request.input }] } : { ...request, model, stream: false, store: false };
    const started = performance.now();
    const response = await realFetch(deepseek ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(55000) });
    if (!response.ok) return { provider, model, error: `HTTP ${response.status}`, ms: Math.round(performance.now() - started) };
    const result = await response.json();
    const raw = deepseek ? result.choices?.[0]?.message?.content : result.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text;
    let answer; try { answer = JSON.parse(raw); } catch { answer = { raw }; }
    const clean = messenger.cleanLoungeCompanionReply(answer?.text ?? '', '강무진');
    return { provider, model, ms: Math.round(performance.now() - started), answer, clean, usage: result.usage, finish: deepseek ? result.choices?.[0]?.finish_reason : result.status };
  }
  const report = [];
  for (const scene of cases) {
    // The attachment has only two stage-1 examples. Never relabel later-stage intimacy as stage 1 just to meet a quota.
    const selected = [...new Set([1, 3, 5, ...scene.selected])].filter(index => candidate.bible.fewShot[index].stage <= scene.stage);
    if (scene.stage === 1 && !selected.includes(0)) selected.push(0);
    const variants = [
      [`current-${original.bible.fewShot.length}`, original],
      ['patch-6', candidate],
      ['selected', { ...candidate, bible: { ...candidate.bible, fewShot: selected.map(index => candidate.bible.fewShot[index]) } }],
    ].filter(([id]) => !option('variant') || id === option('variant'));
    for (const [variant, character] of variants) {
      const { request, mockedWrites } = await capture(character, scene);
      const input = JSON.parse(request.input);
      const count = (request.instructions.match(/\[\d단계 · /g) ?? []).length;
      assert.equal(count, character.bible.fewShot.length);
      const row = { scene: scene.id, variant, shots: count, order: character.bible.fewShot.map(shot => ({ stage: shot.stage, scene: shot.scene })), chars: { instructions: request.instructions.length, input: request.input.length }, speech: input.relationship.speech_level, reserve: input.relationship.reserve, canonIncluded: !!input.scenario.prologue, mockedWrites };
      console.log(JSON.stringify({ capture: { scene: row.scene, variant, shots: count, chars: row.chars, speech: row.speech, reserve: Boolean(row.reserve), canonIncluded: row.canonIncluded } }));
      if (!args.includes('--dry')) {
        row.runs = await Promise.all(providers.map(provider => ask(request, provider).catch(error => ({ provider, error: error.name === 'TypeError' ? 'network unavailable' : error.message }))));
        console.log(JSON.stringify({ scene: scene.id, variant, runs: row.runs }));
      }
      report.push(row);
    }
  }
  if (option('out')) writeFileSync(option('out'), JSON.stringify(report, null, 2));
}

if (args.includes('--recent')) await recent();
else await compare();
