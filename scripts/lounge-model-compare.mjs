// Compares conversation models on the reply the lounge really asks for (2026-10-30).
//   node scripts/lounge-model-compare.mjs [out.json] [model[:effort] ...]
// Each scene runs 선우령's 《검은 장미》 through the real handler (api/lounge.ts) with the database faked, so the request
// it sends to the model is exactly what a member's reply sends: the instructions, the relationship, the story's episode,
// the memory. That request is then sent again to each model with only `model` and the reasoning effort changed. The
// replies, the time and the tokens are printed and saved. Needs OPENAI_API_KEY in .env.local; each run costs a few cents.
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { loadTs } from './lounge-ts-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });
const realKey = process.env.OPENAI_API_KEY;
const here = path => new URL(path, import.meta.url);
const compile = (path, require = () => {}) => {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(readFileSync(here(path), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(exports, require);
  return exports;
};
const load = path => loadTs(fileURLToPath(here(path)));
const lounge = load('../src/lib/lounge.ts'), customLib = load('../src/lib/loungeCustomCharacters.ts'), charactersLib = load('../src/lib/loungeCharacters.ts'), relationshipLib = load('../src/lib/relationship/index.ts');
const study = compile('../src/lib/loungeStudy.ts'), filmStudy = compile('../src/lib/loungeFilmStudy.ts'), sessionLib = compile('../src/lib/loungeSession.ts'), knowledgeLib = compile('../src/lib/loungeKnowledge.ts');
const repliesLib = compile('../src/lib/loungeReplies.ts'), modelsLib = compile('../src/lib/loungeModels.ts'), storyLib = compile('../src/lib/loungeStory.ts');
const scenariosLib = compile('../src/lib/loungeScenarios.ts', path => path.endsWith('loungeStory.js') ? storyLib : undefined);
const personasLib = compile('../src/lib/loungePersonas.ts');
const handler = compile('../api/lounge.ts', path => path.endsWith('loungePersonas') ? personasLib : path.endsWith('loungeStory') ? storyLib : path.endsWith('loungeScenarios') ? scenariosLib : path.endsWith('loungeModels') ? modelsLib : path.endsWith('loungeCustomCharacters') ? customLib : path.endsWith('loungeReplies') ? repliesLib : path.endsWith('loungeStudy') ? study : path.endsWith('loungeFilmStudy') ? filmStudy : path.endsWith('loungeSession') ? sessionLib : path.endsWith('/relationship') ? relationshipLib : path.endsWith('loungeCharacters') ? charactersLib : path.endsWith('loungeKnowledge') ? knowledgeLib : lounge).default;

const story = JSON.parse(readFileSync(here('../docs/stories/velvet-black-rose.json'), 'utf8'));
const scenario = { id: story.id, title: story.title, prologue: story.prologue, user_role: story.user_role, relationship: story.relationship, place: story.place, episodes: story.episodes };
const roomId = 'lounge-00000000-0000-4000-8000-000000000001';
const row = { user_id: 'user-1', character_id: 'velvet', stage: 'RESPECTFULLY_ENGAGED', version: 4, pending: { direction: null, turns: 0 },
  scores: { trust: 22, respect: 50, interest: 100, comfort: 12, openness: 54, intrigue: 100, poise: 59 }, recent_events: [], memories: [], meaningful_turns: 40, turn_count: 60, last_interaction_at: new Date().toISOString() };
const result = (body, status = 200) => new Response(JSON.stringify(body), { status });
const modelAnswer = answer => result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] });

// Newest message first, as the handler asks the database for them.
const scenes = [
  { name: '1화 · 봉투를 내밀며 따진다', state: null, memory: '지금 장면: 연회장 뒤 복도, 조명이 돌아온 직후\n둘 사이: 서로의 서명이 같은 거짓말 위에 있다는 걸 막 알았다.',
    chat: [['human', '이 봉투, 5년 전에 제가 서명한 보고서예요. 근데 왜 저한테 이걸 보여 주는 거죠? 당신이 넣은 거예요?']] },
  { name: '1화 · 무섭다고 털어놓는다', state: { episode: 0, done: ['envelope'], opened: true }, memory: '지금 장면: 연회장 뒤 복도\n둘 사이: 그녀가 봉투를 보지 않고도 안다는 얼굴로 선택을 기다린다.',
    chat: [['human', '솔직히 무서워요. 5년 동안 제가 뭘 지웠는지도 모르고 서명했거든요. 그게 제일 싫어요.'], ['host', '*클러치를 닫는다* 확인하지 않은 쪽이 더 오래 아프죠. 그래서 묻는 거예요. 내일, 올 건가요?'], ['human', '봉투는 내가 가지고 있을게요.']] },
  { name: '2화 · 코트를 걸쳐 준 뒤 손을 잡아 달라고 한다', state: { episode: 1, done: ['her-confession', 'escape'], opened: true }, memory: '지금 장면: 수장고 지상 하역장, 탈출 직후. 그녀의 코트가 어깨에 걸려 있다.\n둘 사이: 90초 동안 서로를 믿고 문을 열었다.',
    chat: [['human', '코트 고마워요. 이상하게 손이 아직 떨려요. …잡아 줄래요?'], ['host', '*말없이 레버 봉인의 파편을 장갑으로 털어낸다* 괜찮아요. 숨부터 쉬어요.']] },
  { name: '2화 · 의심하며 증명을 요구한다', state: { episode: 1, done: ['her-confession'], opened: true }, memory: '지금 장면: 수장고 사무실, 반출입 기록을 펼쳐 놓은 책상\n둘 사이: 그녀가 거래 두 번을 자신이 중개했다고 털어놓았다.',
    chat: [['human', '당신도 결국 윤재필 쪽 사람 아니에요? 말로만 이러지 말고 증명해 봐요.'], ['host', '*시선을 피한다* 그중 두 번은 내가 중개했어요. 그땐 그냥 비싼 거래인 줄 알았어요.']] },
  { name: '3화 · 짧은 답', state: { episode: 2, done: ['first-question'], opened: true }, memory: '지금 장면: 호텔 라운지 바 가장 끝자리, 위스키 사워 두 잔\n둘 사이: 질문 하나, 대답 하나. 거짓말하면 끝이라는 규칙.',
    chat: [['human', '…네.'], ['host', '*잔을 입에 대지 않은 채* 5년 전 그 보고서, 당신은 확인했어요?']] },
];

// With --persona, the one scene runs with a persona the member made (the default one), to see whether the character uses it.
const personaScene = { name: '페르소나 · 저녁 메뉴', persona: { title: '게임 스튜디오 대표', call_name: '해준', job: '인디 게임 스튜디오 대표', personality: '말수가 적고 신중하다. 피곤할수록 농담이 줄어든다', details: '고양이 두 마리와 산다. 매운 음식을 좋아하고 커피는 못 마신다' },
  state: { episode: 1, done: ['her-confession', 'escape'], opened: true }, memory: '지금 장면: 수장고 지상 하역장, 탈출 직후. 그녀의 코트가 어깨에 걸려 있다.\n둘 사이: 90초 동안 서로를 믿고 문을 열었다.',
  chat: [['human', '오늘 너무 피곤해요. 저녁 뭘 먹어야 할지 모르겠어요.'], ['host', '*잔기침을 삼키고 코트 깃을 여민다* 손은 좀 괜찮아요?']] };

// With --kiss, 윤지안 at her third stage (설레는 사이) in the story the member reported (2026-10-30): the member goes on to a deep
// kiss after she asked for a slower pace, and she kept stepping back. Her story and the summary of that room are read from the database.
async function kissScene() {
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL).replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_ROLE_KEY, headers = { apikey: key, Authorization: `Bearer ${key}` };
  const [story] = await (await fetch(`${base}/rest/v1/lounge_scenarios?select=*&id=eq.diplomat-old-friend-fling`, { headers })).json();
  if (!story) throw new Error('the story diplomat-old-friend-fling is not in the database');
  return { name: '윤지안 3단계 · 딥 키스', host: 'diplomat',
    scenario: { id: story.id, title: story.title, prologue: story.prologue, user_role: story.user_role, relationship: story.relationship, place: story.place },
    row: { ...row, character_id: 'diplomat', stage: 'FLUTTERING', scores: { spark: 62, trust: 20, banter: 94, comfort: 65, respect: 73, interest: 100, openness: 50 } },
    memory: '지금 장면: 밤, 조용한 골목의 가게 앞 벤치\n둘 사이: 오래된 친구에서 썸으로 가까워지는 중. 지안은 순대국집 뒤 먼저 손을 내밀었고, 골목에서 키스한 뒤에도 마음은 있지만 속도를 맞춰 달라고 했다.\n줄거리: 둘은 추리 영화 내기를 하고 순대국과 소주를 먹으며 손을 잡았다. 지안이 먼저 짧게 키스했지만, 사용자가 지안의 허리를 잡고 더 깊이 다가가자 고개를 돌려 피했다.\n남은 것: 지안이 멈추면 멈춰 달라는 경계를 사용자가 존중할지.',
    chat: [['human', '*그녀의 허리를 끌어안고 입술을 포개며 천천히 깊게 키스한다. 혀끝이 닿는다*'], ['host', '*입술이 닿자 나는 눈을 감는다. 맞잡은 손에 힘이 들어가고, 숨이 조금 가빠진다* 야… 갑자기 오면 나도 놀라지.'], ['human', '*그녀의 입술을 느끼며 더 깊이 들어간다*']] };
}

async function capture(scene) {
  let reply;
  const messages = scene.chat.map(([kind, text], index) => ({ id: 100 - index, user_id: kind === 'human' ? 'user-1' : null, nickname: kind === 'human' ? '나' : '선우령', kind, text, created_at: new Date().toISOString() }));
  const saved = { ...process.env }, originalFetch = globalThis.fetch;
  Object.assign(process.env, { OPENAI_API_KEY: 'test-key', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'test-anon', APP_ORIGIN: 'https://app.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
  globalThis.fetch = async (url, init) => {
    if (url.includes('voice_lounge_rooms?id=eq.') && init?.method === 'PATCH') return new Response(null, { status: 204 });
    if (url.includes('/auth/')) return result({ id: 'user-1' });
    if (url.includes('claim_voice_lounge_host')) return result('ticket');
    if (url.includes('lounge_member_personas?')) return result(scene.persona ? [{ id: 'p1', is_default: true, ...scene.persona }] : []);
    if (url.includes('voice_lounge_memories?')) return result([]);
    if (url.includes('voice_lounge_relationships?')) return result([scene.row ?? row]);
    if (url.includes('voice_lounge_rooms?host_id=')) return result([]);
    if (url.includes('score_voice_lounge_memories')) return result([]);
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: story.title, host_persona: scene.host ?? 'velvet', memory: scene.memory, capacity: 1, ai_turns: 12, ai_mood: { curiosity: 60, boredom: 10 }, voice_on: false, space_id: null, scenario: scene.scenario ?? scenario, story_state: scene.state ?? null }]);
    if (url.includes('voice_lounge_messages?')) return result(messages);
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'user-1', nickname: '나', last_seen: '' }]);
    if (url.endsWith('/embeddings') || url.includes('lounge_character_knowledge')) return result({ data: [] });
    if (url.endsWith('/responses') && JSON.parse(init.body).text?.format?.name === 'lounge_after_reply') return modelAnswer({ memory: scene.memory, events: [], memory_ops: [], story_checkpoints: [], story_facts: [], story_choice: '' });
    if (url.endsWith('/responses')) { reply = JSON.parse(init.body); return modelAnswer({ text: '*고개를 든다* 네.' }); }
    return result(true);
  };
  try {
    const request = new Request('https://app.test/api/lounge', { method: 'POST', headers: { Authorization: 'Bearer example', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'host', roomId, reason: 'followup', stream: true }) });
    await (await handler(request)).text();
  } finally { globalThis.fetch = originalFetch; for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
  if (!reply) throw new Error(`no reply request captured for ${scene.name}`);
  return reply;
}

async function ask(request, model, effort) {
  const body = { ...request, model, reasoning: { effort }, store: false };
  delete body.stream; delete body.prompt_cache_key;
  body.max_output_tokens = Math.max(body.max_output_tokens, effort === 'none' ? 1400 : 4000);
  const started = performance.now();
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${realKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json();
  const ms = Math.round(performance.now() - started);
  if (!response.ok) return { model, effort, error: (json.error?.message ?? response.status).toString().slice(0, 160), ms };
  const out = json.output?.flatMap(item => item.content ?? []).find(part => part.type === 'output_text')?.text;
  let text = ''; try { text = JSON.parse(out).text; } catch { text = out ?? ''; }
  return { model, effort, ms, text, inTokens: json.usage?.input_tokens, outTokens: json.usage?.output_tokens, cached: json.usage?.input_tokens_details?.cached_tokens, reasoningTokens: json.usage?.output_tokens_details?.reasoning_tokens };
}

const args = process.argv.slice(2), withPersona = args.includes('--persona');
const withKiss = args.includes('--kiss');
const [outPath = 'model-compare.json', ...picked] = args.filter(arg => !arg.startsWith('--'));
const targets = (picked.length ? picked : ['gpt-6-luna:none', 'gpt-6-sol:none', 'gpt-6.1-sol:none', 'gpt-6.1-terra:none']).map(item => { const [model, effort = 'none'] = item.split(':'); return { model, effort }; });
const report = [];
for (const scene of withPersona ? [personaScene] : withKiss ? [await kissScene()] : scenes) {
  const request = await capture(scene);
  if (scene === scenes[0]) console.log('speech_level the request asks for:', JSON.parse(request.input).relationship?.speech_level);
  const runs = await Promise.all(targets.map(target => ask(request, target.model, target.effort)));
  report.push({ scene: scene.name, user: scene.chat[0][1], runs });
  console.log(`\n=== ${scene.name}\n나: ${scene.chat[0][1]}`);
  for (const run of runs) console.log(`\n[${run.model}:${run.effort}] ${run.ms}ms in ${run.inTokens ?? '-'} (cached ${run.cached ?? '-'}) out ${run.outTokens ?? '-'}${run.reasoningTokens ? ` (reasoning ${run.reasoningTokens})` : ''}\n${run.error ? `ERROR ${run.error}` : run.text}`);
}
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(`\nsaved ${outPath}`);
