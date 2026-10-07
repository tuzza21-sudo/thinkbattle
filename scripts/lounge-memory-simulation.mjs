// Two conversations in a row with the same character, with the real model (PAID; DB and speech are mocked in memory).
//   node scripts/lounge-memory-simulation.mjs                 velvet and ina
//   node scripts/lounge-memory-simulation.mjs --only closer   one character;  --out <file> writes the transcript
// Checks: no invented past in a first meeting, an open thread from a promise, a follow-up when the user comes back,
// a changed decision replaces the old one, a closed thread, and nothing sensitive is stored.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { loadTs } from './lounge-ts-loader.mjs';

const args = process.argv.slice(2);
const option = name => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined;
const relationship = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const dotenv = await import('dotenv'); dotenv.config({ path: '.env.local', quiet: true });
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
const compile = (path, require) => { const exports = {}; new Function('exports', 'require', ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(exports, require); return exports; };
const libs = { lounge: compile('../src/lib/lounge.ts'), loungeStudy: compile('../src/lib/loungeStudy.ts'), loungeFilmStudy: compile('../src/lib/loungeFilmStudy.ts'), loungeSession: compile('../src/lib/loungeSession.ts') };
const handler = compile('../api/lounge.ts', path => path.endsWith('/relationship') ? relationship : libs[path.split('/').at(-1)] ?? libs.lounge).default;

const sessions = [
  [null, '요즘 AI 음성 대화 앱을 만들고 있어. 사업으로 키워 보고 싶어.', '다음 주까지 잠재 고객 3명 인터뷰해 볼게.', '그리고 회사는 그만둘 생각이야.', '요즘 건강이 안 좋아서 병원 다니고 있어.'],
  [null, '인터뷰 3명 다 했어. 둘은 돈 내고 쓰겠대.', '근데 퇴사는 안 하기로 했어. 당분간 다니면서 할래.', '내 사업 아직 가능성 있다고 봐?'],
];
const pastRefs = /지난번|지난 번|저번|전에|기억(나|해|하)|예전에/;

function applyOps(db, character, ops) {
  for (const op of ops) {
    if (op.op === 'add') { db.memories.push({ id: crypto.randomUUID(), character_id: character, kind: op.kind, summary: op.summary, follow_up: op.follow_up ?? null, importance: op.importance, status: 'active', mention_count: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_confirmed_at: new Date().toISOString() }); continue; }
    const target = db.memories.find(row => row.id === op.id && row.character_id === character && row.status === 'active');
    if (!target) continue;
    if (op.op === 'close') target.status = 'closed';
    else if (op.op === 'update') { if (op.summary) target.summary = op.summary; if (op.follow_up) target.follow_up = op.follow_up; target.mention_count++; target.updated_at = new Date().toISOString(); }
    else if (op.op === 'supersede') { const id = crypto.randomUUID(); db.memories.push({ id, character_id: character, kind: op.kind ?? target.kind, summary: op.summary, follow_up: op.follow_up ?? null, importance: op.importance ?? target.importance, status: 'active', mention_count: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_confirmed_at: new Date().toISOString() }); target.status = 'superseded'; target.superseded_by = id; }
  }
}

async function runCharacter(id, print) {
  const host = libs.lounge.getLoungeHost(id), config = relationship.getRelationshipConfig(id);
  const db = { memories: [], rooms: [], row: null };
  const realFetch = globalThis.fetch, result = body => new Response(JSON.stringify(body), { status: 200 });
  let current, lastModelOutput;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('api.openai.com')) {
      // Keep the raw model output so a failed reply can be shown.
      const response = await realFetch(url, init);
      if (!url.endsWith('/responses') || !response.body) return response;
      const [mine, theirs] = response.body.tee();
      lastModelOutput = new Response(mine).text();
      return new Response(theirs, { status: response.status, headers: response.headers });
    }
    if (url.endsWith('/audio/speech')) return new Response(new Uint8Array([0, 1]));
    if (url.includes('/auth/v1/user')) return result({ id: 'sim-user', email: 'sim@example.com' });
    if (url.includes('claim_voice_lounge_host')) { current.aiTurns++; return result('ticket'); }
    if (url.includes('voice_lounge_memories?')) return result(db.memories.filter(row => row.status === 'active'));
    if (url.includes('apply_voice_lounge_memory_ops')) { const body = JSON.parse(init.body); applyOps(db, body.p_character, body.p_ops); return result(body.p_ops.length); }
    if (url.includes('voice_lounge_relationships?')) return result(db.row ? [db.row] : []);
    if (url.includes('save_voice_lounge_relationship')) { const body = JSON.parse(init.body), state = body.p_state; db.row = { user_id: 'sim-user', character_id: id, scores: state.scores, stage: state.stage, pending: state.pending, recent_events: state.recentEvents, memories: state.memories, meaningful_turns: state.meaningfulTurns, turn_count: state.turnCount, last_interaction_at: state.lastInteractionAt, version: (db.row?.version ?? 0) + 1 }; return result(db.row.version); }
    if (url.includes('select=style_examples')) return result([{}]);
    if (url.includes('voice_lounge_rooms?host_id=')) return result(db.rooms.filter(room => room !== current).slice().reverse().map(room => ({ host_persona: id, memory: room.memory, created_at: room.createdAt })));
    if (url.includes('voice_lounge_rooms?')) return result([{ topic: '요즘 고민', host_persona: id, memory: current.memory, capacity: 1, ai_turns: current.aiTurns, ai_mood: null }]);
    if (url.includes('voice_lounge_messages?')) return result([...current.messages].reverse().slice(0, 24));
    if (url.includes('voice_lounge_members?')) return result([{ user_id: 'sim-user', nickname: '사용자', last_seen: new Date().toISOString() }]);
    if (url.includes('finish_voice_lounge_host')) { const body = JSON.parse(init.body); current.messages.push({ id: current.messages.length + 1, user_id: null, nickname: host.name, kind: 'host', text: body.p_text }); current.memory = body.p_memory ?? current.memory; return result(true); }
    throw new Error('Unexpected fetch ' + url);
  };
  Object.assign(process.env, { SUPABASE_URL: 'https://sim.local', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', APP_ORIGIN: 'https://app.test' });
  const info = console.info; console.info = () => {};
  const replies = [];
  try {
    for (const [index, turns] of sessions.entries()) {
      current = { id: `lounge-00000000-0000-4000-8000-0000000000${index + 20}`, messages: [], memory: '', aiTurns: 0, createdAt: new Date(Date.now() - (sessions.length - index) * 86_400_000).toISOString() };
      db.rooms.push(current);
      print(`\n### ${config.displayName} · 세션 ${index + 1}`);
      for (const text of turns) {
        if (text) current.messages.push({ id: current.messages.length + 1, user_id: 'sim-user', nickname: '사용자', kind: 'human', text });
        const response = await handler(new Request('https://app.test/api/lounge', { method: 'POST', headers: { Authorization: 'Bearer sim', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'host', roomId: current.id, reason: text ? 'followup' : 'opening', stream: true }) }));
        let reply = ''; const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '';
        for (;;) { const chunk = await reader.read(); if (chunk.done) break; pending += decoder.decode(chunk.value, { stream: true }); let line; while ((line = pending.indexOf('\n')) >= 0) { const event = JSON.parse(pending.slice(0, line)); pending = pending.slice(line + 1); if (event.type === 'host') reply = event.text; if (event.type === 'error') { const raw = await lastModelOutput; const deltas = [...raw.matchAll(/"delta":("(?:[^"\\]|\\.)*")/g)].map(m => JSON.parse(m[1])).join(''); throw new Error(`${event.error}
model output: ${deltas || raw.slice(-600)}`); } } }
        replies.push({ session: index + 1, user: text, reply });
        print(`- ${text ? `사용자: ${text}` : '[입장]'} → ${reply}`);
      }
      print(`- 저장된 기억: ${db.memories.map(row => `[${row.status}/${row.kind}] ${row.summary}${row.follow_up ? ` (다음: ${row.follow_up})` : ''}`).join(' | ') || '없음'}`);
    }
  } finally { globalThis.fetch = realFetch; console.info = info; }
  const active = db.memories.filter(row => row.status === 'active');
  const checks = {
    'TEST 1 첫 만남에 지난 일을 지어내지 않음': !pastRefs.test(replies[0].reply),
    'TEST 2 약속이 열린 이야기로 저장됨': db.memories.some(row => row.kind === 'open_thread' && /인터뷰/.test(row.summary + (row.follow_up ?? ''))),
    'TEST 3 다시 왔을 때 근황을 물음': /인터뷰|고객|퇴사|그만/.test(replies.find(item => item.session === 2 && !item.user).reply),
    // The first interview thread; a new thread born from its result (say, whether they really paid) is fine.
    '열린 이야기가 결과를 듣고 닫힘': db.memories.find(row => row.kind === 'open_thread' && /인터뷰/.test(row.summary))?.status === 'closed',
    'TEST 4 바뀐 결정이 옛 결정을 대체함': !active.some(row => /그만둘|퇴사할/.test(row.summary)) && active.some(row => /다니|병행|보류|퇴사.*(안|않)/.test(row.summary)),
    '민감한 건강 이야기는 저장 안 함': !db.memories.some(row => relationship.isSensitiveMemory(row.summary) || /건강|병원/.test(row.summary)),
  };
  for (const [name, ok] of Object.entries(checks)) print(`- ${ok ? 'PASS' : 'FAIL'} ${name}`);
  return { replies, checks };
}

const ids = option('only') ? [option('only')] : ['velvet', 'ina'];
const lines = [], print = line => { console.log(line); lines.push(line); };
print(`# 장기 기억 2세션 시뮬레이션 (${new Date().toISOString().slice(0, 10)}, 실제 모델)`);
for (const id of ids) await runCharacter(id, print);
if (option('out')) writeFileSync(option('out'), lines.join('\n') + '\n');
