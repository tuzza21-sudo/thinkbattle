// Read-only look at the latest one-to-one conversations with 서도현 (auditor), for checking engine v4 (2026-11-02):
// the messages with their inner voices and actions, and the scene the server keeps. Only GET requests; nothing is
// written. Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
//   node scripts/lounge-peek-auditor.mjs [rooms=1] [messages=40]
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, '')]; }));
const url = env.VITE_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in .env.local');
const get = async path => {
  const response = await fetch(`${url}/rest/v1/${path}`, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}` } });
  return response.ok ? response.json() : { error: response.status, body: (await response.text()).slice(0, 200) };
};
const [roomCount = 1, messageCount = 40] = process.argv.slice(2).map(Number);

const rooms = await get(`voice_lounge_rooms?host_persona=eq.auditor&capacity=eq.1&space_id=is.null&order=created_at.desc&limit=${roomCount}&select=id,host_id,created_at,ai_model,ai_turns,voice_on,memory`);
if (!Array.isArray(rooms)) { console.log('rooms', rooms); process.exit(1); }
for (const room of rooms) {
  console.log(`\n=== room ${room.id} · ${room.created_at} · model ${room.ai_model ?? 'default'} · turns ${room.ai_turns} · ${room.voice_on ? 'call' : 'chat'}`);
  console.log(`memory: ${String(room.memory ?? '').slice(0, 400)}`);
  const state = await get(`voice_lounge_companion_state?user_id=eq.${room.host_id}&character_id=eq.auditor&select=state,updated_at`);
  console.log('companion state:', Array.isArray(state) ? JSON.stringify(state[0] ?? null) : `unavailable (${state.error}: the table may not exist yet)`);
  const messages = await get(`voice_lounge_messages?room_id=eq.${room.id}&order=id.desc&limit=${messageCount}&select=id,kind,text,created_at`);
  if (!Array.isArray(messages)) { console.log('messages', messages); continue; }
  for (const message of [...messages].reverse()) console.log(`\n--- ${message.kind} #${message.id} ${message.created_at}\n${message.text}`);
}
