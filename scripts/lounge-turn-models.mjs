// Reads lounge_turn_models (apply supabase/migrations/20270101000000_lounge_turn_models.sql first): the latest turns of a room,
// or with --stats how the adult model (NanoGPT) did by hour. Needs SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL in .env.local.
//   node scripts/lounge-turn-models.mjs [roomId] [--stats | --failures]
// --failures lists lounge_turn_failures (apply 20270102000000_lounge_turn_failures.sql first): turns whose claim was refused ('skipped') and
// turns that ended without a reply ('failed', with every model tried), newest last.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]));
const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const get = async path => { const response = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, { headers }); const body = await response.json(); if (!response.ok) throw new Error(JSON.stringify(body)); return body; };
const args = process.argv.slice(2), stats = args.includes('--stats'), failures = args.includes('--failures'), room = args.find(arg => !arg.startsWith('--'));
const kst = value => new Date(Date.parse(value) + 9 * 3600e3).toISOString().slice(5, 19).replace('T', ' ');
if (failures) {
  const rows = await get(`lounge_turn_failures?select=*&order=created_at.desc&limit=60${room ? `&room_id=eq.${room}` : ''}`);
  for (const row of rows.reverse()) console.log(kst(row.created_at), row.outcome.toUpperCase(), row.medium ?? '-', `turn ${row.turn ?? '-'}`, `client ${row.client ?? '-'}`, `reason ${row.reason ?? '-'}`, `adult ${row.adult_mode ?? '-'}/${row.adult_routed ?? '-'}`, `phase ${row.phase}`, `${row.ms ?? '-'}ms`, row.error_code ? `${row.error_code}${row.upstream_status ? ` (${row.upstream_status})` : ''}` : '', row.attempts?.length ? row.attempts.map(a => `${a.provider}:${a.ok ? 'ok' : a.status ?? 'fail'}`).join(' > ') : '');
} else if (stats) {
  for (const row of await get('lounge_nanogpt_stability?select=*&order=hour.desc&limit=48')) console.log(String(row.hour).slice(5, 16), `adult turns ${row.adult_routed_turns}`, `NanoGPT answered ${row.answered_by_nanogpt}`, `with a failure ${row.turns_with_a_nanogpt_failure}`, `answered by other ${row.answered_by_other}`, `failed attempts ${row.nanogpt_failed_attempts}`);
} else {
  const rows = await get(`lounge_turn_models?select=*&order=created_at.desc&limit=60${room ? `&room_id=eq.${room}` : ''}`);
  for (const row of rows.reverse()) console.log(kst(row.created_at), row.medium, `turn ${row.turn}`, `stage ${row.stage}`, `chosen ${row.chosen_model ?? 'gpt'}`, `sexual ${row.sexual ?? '-'}`, `adult ${row.adult_routed}`, `-> ${row.applied_provider}/${row.applied_model}`, row.client ? `client ${row.client}` : '', row.fallback ? `FALLBACK ${row.attempts.map(a => `${a.provider}:${a.ok ? 'ok' : a.status}`).join(' > ')}` : '');
}
