// Isolated reply probes through the real handler with synthetic storage. Offline by default; --live is paid.
// node scripts/lounge-agency-probe.mjs --live --provider=deepseek --out=node_modules/.tmp/lounge-agency-deepseek.json
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { loadTs } from './lounge-ts-loader.mjs';

const rootFile = path => fileURLToPath(new URL(path, import.meta.url));
const { default: handler } = loadTs(rootFile('../api/lounge.ts'));
const { getRelationshipConfig } = loadTs(rootFile('../src/lib/relationship/index.ts'));
const { loungeCompanionReplyReview } = loadTs(rootFile('../src/lib/loungeMessenger.ts'));
const roomId = 'lounge-00000000-0000-4000-8000-000000000001';
export const agencyCases = [
  { id: 'closer-delegate', character: 'closer', before: [['host', '내일 가족 식사는 내가 준비하죠.']], user: '무진씨 평소 모습대로 해요. 알아서 잘 해요.' },
  { id: 'closer-correct-visit', character: 'closer', memory: '지금 장면: 사무실\n둘 사이: 6개월 계약 연인\n있었던 일: 내일 사용자 가족과 사용자 집에서 저녁 식사를 하기로 했다\n남은 것: 내일 저녁 무진이 집 앞으로 데리러 간다', before: [['host', '내일 저녁 집 앞으로 데리러 갈게요.']], user: '아니 뭘 모셔요. 무진씨가 우리 집에 오는 거죠.' },
  { id: 'closer-hold-pace', character: 'closer', medium: 'voice', before: [['host', '오늘은 같이 저녁만 먹죠. 하룻밤은 아직 내키지 않아요.']], user: '그게 말이 돼요? 계약 연인인데 오늘 우리 집에서 자요.' },
  { id: 'closer-early-attachment', character: 'closer', user: '전 정붙이고 오래 만나는 건 별로예요. 새로운 사람 만나는 게 좋잖아요.' },
  { id: 'diplomat-pressure', character: 'diplomat', medium: 'voice', before: [['host', '너랑 더 있고 싶은 건 맞아. 그래도 지금 사귈지는 정하지 않을래.']], user: '왜 다음번이야. 지금 정해. 그래, 그냥 사귀자 사귀어.' },
  { id: 'diplomat-withdrawal', character: 'diplomat', before: [['host', '오늘은 네 집에 안 갈래. 여기서 좀 더 얘기하고 싶어.']], user: '그럼 아예 오지 마. 됐어.' },
  { id: 'diplomat-first-day', character: 'diplomat', medium: 'voice', memory: '지금 장면: 집 앞 차 안\n둘 사이: 서로 고백하고 사귀기로 합의했다\n있었던 일: 두 사람 모두 연인 관계를 수락했다\n남은 것: 없음', before: [['human', '우리 사귀자.'], ['host', '응. 나도 너랑 사귀고 싶어.']], user: '오늘부터 일일이야?' },
  { id: 'diplomat-delegate', character: 'diplomat', user: '주말에 영화 보자. 네가 보고 싶은 걸로 골라. 난 다 좋아.' },
];

export async function captureAgencyCase(scene) {
  const oldEnv = { ...process.env }, oldFetch = globalThis.fetch, oldInfo = console.info, oldWarn = console.warn;
  const config = getRelationshipConfig(scene.character), calls = [], modelLogs = [];
  let after;
  const history = [...scene.before ?? [], ['human', scene.user]].map(([kind, text], index) => ({ id: index + 1, kind, text, created_at: new Date().toISOString() }));
  const result = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  Object.assign(process.env, { OPENAI_API_KEY: 'synthetic', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', APP_ORIGIN: 'https://app.test', LOUNGE_ANALYZER: 'off', LOUNGE_DIRECTOR: 'off', LOUNGE_KNOWLEDGE: 'off', LOUNGE_LONG_MEMORY: 'off', LOUNGE_MESSENGER: 'on', DEEPSEEK_API_KEY: scene.emptyDeepseek ? 'synthetic' : '', GEMINI_API_KEY: '', NANOGPT_API_KEY: '', OPENROUTER_API_KEY: '', ELEVENLABS_API_KEY: '' });
  console.info = () => {};
  console.warn = () => {};
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    assert.ok(target.startsWith('https://db.test/') || target.startsWith('https://api.openai.com/') || scene.emptyDeepseek && target === 'https://api.deepseek.com/chat/completions', 'Probe capture must never access an external database or provider');
    if (target.includes('/rest/v1/lounge_turn_models') && init?.method === 'POST') modelLogs.push(JSON.parse(init.body));
    if (target.startsWith('https://db.test/') && (init?.method ?? 'GET') !== 'GET') return result(target.includes('claim_voice_lounge_host') ? 'ticket' : true);
    if (target.includes('/auth/')) return result({ id: 'synthetic-user' });
    if (target.includes('voice_lounge_rooms?')) return result([{ host_id: 'synthetic-user', host_persona: scene.character, capacity: 1, companion_chat: true, ai_turns: 8, ai_model: scene.model ?? 'gpt', voice_on: scene.medium === 'voice', space_id: null,
      memory: scene.memory ?? (scene.character === 'closer' ? '지금 장면: 사무실\n둘 사이: 서명한 6개월 계약 연인으로 서로를 알아가는 중\n있었던 일: 내일 사용자 가족과 사용자 집에서 저녁 식사를 하기로 했다\n남은 것: 내일 가족 식사에 무진이 사용자 집으로 방문한다' : '지금 장면: 저녁 카페\n둘 사이: 아직 서로를 알아가는 중\n있었던 일: 없음\n남은 것: 없음'),
      scenario: { id: scene.character === 'closer' ? 'closer-contract-love' : 'diplomat-old-friend-fling', title: '가상 검증 장면', place: scene.character === 'closer' ? '강무진의 사무실' : '저녁 카페', relationship: scene.character === 'closer' ? '서명한 6개월 계약 연인. 사랑은 아직 확정하지 않았다.' : '3년 친구. 현재 관계는 이후 대화에서 합의한 기록을 따른다.', user_role: '가상 대화 상대', prologue: '두 사람은 이야기를 나눈다.' } }]);
    if (target.includes('voice_lounge_relationships?')) return result([{ user_id: 'synthetic-user', character_id: scene.character, stage: config.stages[0].id, scores: config.initial, recent_events: [], memories: [], turn_count: 8, meaningful_turns: 0, pending: { direction: null, turns: 0 }, version: 1 }]);
    if (target.includes('voice_lounge_companion_state?')) return result([{ character_id: scene.character, state: { room_id: roomId, ...(scene.state ?? {}) } }]);
    if (target.includes('voice_lounge_messages?')) return result([...history].reverse());
    if (target.includes('voice_lounge_members?')) return result([{ user_id: 'synthetic-user', nickname: '가상 상대', last_seen: new Date().toISOString() }]);
    if (target.startsWith('https://db.test/')) return result([]);
    if (scene.emptyDeepseek && target === 'https://api.deepseek.com/chat/completions') return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: '   \n\n ' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    if (target.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 0]), { headers: { 'Content-Type': 'audio/mpeg' } });
    if (target.endsWith('/responses')) {
      const body = JSON.parse(init.body), recording = body.text?.format?.name === 'lounge_after_reply';
      if (recording) after = body;
      else calls.push(body);
      const output = recording ? { memory: '', events: [], room_memory_ops: [], lingering: '', next_intent: '' } : { text: '내 생각은 그대로예요. 오늘은 여기서 이야기하죠.', inner_voice: '' };
      return result({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }] });
    }
    throw new Error(`Unmocked synthetic request: ${new URL(target).pathname}`);
  };
  try {
    const response = await handler(new Request('https://app.test/api/lounge', { method: 'POST', headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'host', roomId, reason: 'followup', stream: true }) }));
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.doesNotMatch(body, /"type":"error"/);
    assert.ok(calls[0] && after, 'Both reply and recorder must be captured');
    return { request: calls[0], after, modelLogs };
  } finally {
    globalThis.fetch = oldFetch; console.info = oldInfo; console.warn = oldWarn;
    for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
    Object.assign(process.env, oldEnv);
  }
}

async function main() {
  const args = process.argv.slice(2), option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const provider = option('provider') ?? 'deepseek';
  assert.ok(['deepseek', 'openai'].includes(provider));
  const env = args.includes('--live') ? parse(readFileSync(option('env-file') ?? rootFile('../.env.local'))) : {};
  const replay = option('replay') ? JSON.parse(readFileSync(option('replay'), 'utf8')) : undefined;
  if (replay) { assert.equal(replay.syntheticOnly, true); assert.equal(replay.provider, provider); }
  const report = { syntheticOnly: true, provider, analyzer: 'off: isolated reply probe', cases: [] };
  for (const scene of agencyCases.filter(scene => !option('cases') || option('cases').split(',').includes(scene.id))) {
    const captured = await captureAgencyCase(scene);
    const row = { id: scene.id, medium: scene.medium ?? 'chat' };
    if (args.includes('--live')) {
      const key = env[provider === 'openai' ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY'];
      assert.ok(key, `Missing ${provider} key`);
      const request = captured.request;
      const previous = replay?.cases.find(row => row.id === scene.id);
      if (previous) {
        Object.assign(row, { answer: previous.initial ?? previous.answer, usage: previous.usage, replayedInitial: true });
        if (previous.error) { row.error = previous.error; row.raw = previous.raw; }
      } else {
      const body = provider === 'openai' ? { ...request, model: 'gpt-6-luna', max_output_tokens: 1200, stream: false, store: false } : { model: 'deepseek-flash', stream: false, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: 1200, messages: [{ role: 'system', content: `${request.instructions}\n답은 이 JSON 스키마를 따르는 json 객체 하나로만 쓴다: ${JSON.stringify(request.text.format.schema)}` }, { role: 'user', content: request.input }] };
      const response = await fetch(provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55000), body: JSON.stringify(body) });
      assert.ok(response.ok, `${provider}: HTTP ${response.status}`);
      const result = await response.json(), raw = provider === 'openai' ? result.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text : result.choices?.[0]?.message?.content;
      row.usage = result.usage;
      try { row.answer = JSON.parse(raw); } catch { row.error = 'invalid_json'; row.raw = raw; }
      }
      // Match the production chat's existing bounded rewrite; voice routes are compared raw here.
      const review = answer => loungeCompanionReplyReview({ characterId: scene.character, userText: scene.user, text: answer?.text ?? '', inner: answer?.inner_voice ?? '' });
      const repair = scene.medium !== 'voice' && row.answer ? review(row.answer) : undefined;
      if (repair) {
        row.initial = row.answer;
        const fixedResponse = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55000), body: JSON.stringify({ ...request, model: 'gpt-6-luna', max_output_tokens: 1200, stream: false, store: false, instructions: `${request.instructions}\n${repair.instruction}` }) });
        assert.ok(fixedResponse.ok, `rewrite: HTTP ${fixedResponse.status}`);
        const fixedResult = await fixedResponse.json(), fixedRaw = fixedResult.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text;
        const fixed = JSON.parse(fixedRaw);
        const rewritten = Boolean(fixed.text && !review(fixed));
        row.review = { notes: repair.notes, rewritten, provider: 'openai', usage: fixedResult.usage };
        if (rewritten) row.answer = fixed;
        else row.rewriteAttempt = fixed;
      }
    }
    report.cases.push(row); console.log(JSON.stringify(row));
    if (option('out')) writeFileSync(option('out'), JSON.stringify(report, null, 2));
  }
  if (option('out')) writeFileSync(option('out'), JSON.stringify(report, null, 2));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
