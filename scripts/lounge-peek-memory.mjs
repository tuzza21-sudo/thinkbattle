// Read-only look at everything a one-to-one character can remember of a member (2026-11-02), to see what "forget" left
// behind: the long-term memories (active and forgotten), the relationship (stage, scores, important events), the room's
// summary and the scene state the server keeps. Only GET requests; nothing is written. Needs VITE_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY in .env.local. Without a user id it shows the latest rooms with the character (ids and
// counts only) so the right member can be picked.
//   node scripts/lounge-peek-memory.mjs <character=velvet> [user id] [last messages of the newest room=0]
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, '')]; }));
const url = env.VITE_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in .env.local');
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const get = async path => {
  const response = await fetch(`${url}/rest/v1/${path}`, { method: 'GET', headers });
  return response.ok ? response.json() : { error: response.status, body: (await response.text()).slice(0, 200) };
};
const [character = 'velvet', userId, lastMessages = '0'] = process.argv.slice(2);
const cut = (text, n = 160) => String(text ?? '').replace(/\s+/g, ' ').slice(0, n);

const rooms = await get(`voice_lounge_rooms?host_persona=eq.${character}&capacity=eq.1&space_id=is.null${userId ? `&host_id=eq.${userId}` : ''}&order=created_at.desc&limit=${userId ? 6 : 8}&select=id,host_id,created_at,ai_turns,voice_on,memory`);
if (!Array.isArray(rooms)) { console.log('rooms', rooms); process.exit(1); }
if (!userId) {
  console.log(`latest ${character} rooms (pick a member and run again with the user id):`);
  for (const room of rooms) console.log(` ${room.host_id} · room ${room.id} · ${room.created_at} · turns ${room.ai_turns} · summary ${cut(room.memory, 0).length ? 'yes' : 'none'}`);
  process.exit(0);
}

console.log(`\n=== rooms with ${character} (newest first)`);
for (const room of rooms) console.log(` ${room.id} · ${room.created_at} · turns ${room.ai_turns} · ${room.voice_on ? 'call' : 'chat'}\n   summary: ${cut(room.memory, 300) || '(none)'}`);

const memories = await get(`voice_lounge_memories?user_id=eq.${userId}&character_id=eq.${character}&order=updated_at.desc&select=id,kind,status,summary,importance,updated_at`);
console.log('\n=== long-term memories');
if (!Array.isArray(memories)) console.log(memories);
else {
  const byStatus = memories.reduce((all, item) => ({ ...all, [item.status]: (all[item.status] ?? 0) + 1 }), {});
  console.log(' by status:', JSON.stringify(byStatus));
  for (const item of memories.filter(item => item.status === 'active')) console.log(`  active · ${item.kind} · ${item.importance} · ${cut(item.summary)}`);
}

const relationship = await get(`voice_lounge_relationships?user_id=eq.${userId}&character_id=eq.${character}&select=stage,scores,memories,turn_count,meaningful_turns,last_interaction_at,created_at`);
console.log('\n=== relationship');
if (!Array.isArray(relationship) || !relationship[0]) console.log(relationship);
else {
  const row = relationship[0];
  console.log(` stage ${row.stage} · turns ${row.turn_count} (meaningful ${row.meaningful_turns}) · since ${row.created_at} · last ${row.last_interaction_at}`);
  console.log(' scores:', JSON.stringify(row.scores));
  for (const event of row.memories ?? []) console.log(`  event · ${event.type} · ${event.importance} · ${cut(event.summary)}`);
}

const milestones = await get(`voice_lounge_relationship_milestones?user_id=eq.${userId}&character_id=eq.${character}&order=created_at.asc&select=from_stage,to_stage,created_at`);
console.log('\n=== stage changes');
if (Array.isArray(milestones)) for (const item of milestones) console.log(` ${item.created_at} · ${item.from_stage ?? '-'} -> ${item.to_stage}`);

const state = await get(`voice_lounge_companion_state?user_id=eq.${userId}&character_id=eq.${character}&select=state,updated_at`);
console.log('\n=== scene state the server keeps');
if (!Array.isArray(state) || !state[0]) console.log(state);
else {
  const kept = state[0].state ?? {};
  console.log(` room ${kept.room_id} · scene ${kept.scene?.location ?? '(none)'} · turns here ${kept.scene_turns}`);
  console.log(' self_facts:', JSON.stringify((kept.self_facts ?? []).map(item => item.fact)));
  console.log(' shared:', JSON.stringify((kept.shared ?? []).map(item => item.what)));
  console.log(' inner voices:', JSON.stringify(kept.inner ?? []));
  console.log(' intimacy_boost:', JSON.stringify(kept.intimacy_boost ?? null));
}

// Which switches this member has: this one user only, and the address itself is not printed.
const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: 'GET', headers }).catch(() => null);
const account = response?.ok ? await response.json() : null;
const listed = name => (env[name] ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean).includes(String(account?.email ?? '').toLowerCase());
console.log('\n=== this account');
console.log(account ? ` in LOUNGE_ADULT_MODE_USERS: ${listed('LOUNGE_ADULT_MODE_USERS')} · in LOUNGE_RELATIONSHIP_DEBUG_USERS: ${listed('LOUNGE_RELATIONSHIP_DEBUG_USERS')}` : ' (could not be read)');

if (Number(lastMessages) > 0 && rooms[0]) {
  const messages = await get(`voice_lounge_messages?room_id=eq.${rooms[0].id}&order=id.desc&limit=${Number(lastMessages)}&select=kind,text`);
  console.log(`\n=== last ${lastMessages} messages of the newest room`);
  if (Array.isArray(messages)) for (const message of [...messages].reverse()) console.log(` ${message.kind === 'host' ? '령' : '나'}: ${cut(message.text, 220)}`);
}
