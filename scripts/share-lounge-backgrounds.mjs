// Shares the backgrounds a member made in their one-to-one conversations with the lounge's shared scene library, so any
// conversation can use them when its scene moves (2026-11-03). A member's own background is kept under their folder in the
// private bucket and shown only in that room; the shared library (lounge_scene_backgrounds, public bucket under scenes/) is
// what a scene change and the background picker offer to everyone.
//   node scripts/share-lounge-backgrounds.mjs --user=<user id> [--characters=ina,diplomat] [--describe=descriptions.json]
//       lists what would be shared and changes nothing
//   ... --apply     copies each picture to scenes/ and adds it to the library
// A picture the room no longer shows (the member picked another background after it) stays in their folder and is shared
// too: it is found there, its room from its name, and since its words are gone it needs a description from --describe.
// Only the named member's rooms are read: nobody else's background is shared without being asked. A description replaces the
// member's own words, which may be private and are shown to every member (the picker) and read by the model that matches a
// scene; --describe takes a JSON object of { "<private image path>": "<description, 4-400 characters>" }. Without one the
// member's own words are used, so look at the list first. Running it again shares nothing twice (scene_key names the picture).
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, '')]; }));
const base = env.VITE_SUPABASE_URL?.replace(/\/$/, ''), key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in .env.local');
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const flag = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = process.argv.includes('--apply');
const user = flag('user');
if (!user || !/^[0-9a-f-]{36}$/.test(user)) throw new Error('--user=<the member\'s user id> is needed: only that member\'s backgrounds are shared');
const characters = (flag('characters') ?? '').split(',').map(item => item.trim()).filter(Boolean);
const descriptions = flag('describe') ? JSON.parse(readFileSync(flag('describe'), 'utf8')) : {};
const buckets = { private: 'lounge-character-private', public: 'lounge-character-public' };
const get = async path => { const response = await fetch(`${base}/rest/v1/${path}`, { headers }); if (!response.ok) throw new Error(`${path}: ${response.status}`); return response.json(); };

const rooms = await get(`voice_lounge_rooms?host_id=eq.${user}&capacity=eq.1&space_id=is.null&background=not.is.null${characters.length ? `&host_persona=in.(${characters.join(',')})` : ''}&order=created_at.asc&select=id,host_persona,background`);
// A member's own picture: a path in their folder (a shared scene's is under scenes/, a place has no picture).
const own = new Map();
for (const room of rooms) {
  const image = room.background?.image;
  if (typeof image !== 'string' || !image.startsWith(`${user}/backgrounds/`)) continue;
  if (!own.has(image)) own.set(image, { image, prompt: String(room.background.prompt ?? '').trim(), from: room.host_persona });
}
// Every picture in the member's folder: one a room replaced is no longer on any room, and is only here.
const listed = await fetch(`${base}/storage/v1/object/list/${buckets.private}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: `${user}/backgrounds`, limit: 500, sortBy: { column: 'created_at', order: 'asc' } }) });
for (const file of listed.ok ? await listed.json() : []) {
  const image = `${user}/backgrounds/${file.name}`;
  if (own.has(image)) continue;
  const roomId = `lounge-${file.name.replace(/-[0-9a-f]{8}.(webp|jpe?g)$/i, '')}`;
  const [room] = await get(`voice_lounge_rooms?id=eq.${encodeURIComponent(roomId)}&host_id=eq.${user}&select=host_persona`);
  if (!room || (characters.length && !characters.includes(room.host_persona))) continue;
  own.set(image, { image, prompt: '', from: `${room.host_persona} (replaced in its room)` });
}
console.log(`${rooms.length} rooms with a background, ${own.size} picture(s) of the member's own`);

let shared = 0;
for (const { image, prompt, from } of own.values()) {
  const sceneKey = `member-bg:${createHash('sha1').update(image).digest('hex').slice(0, 20)}`;
  const description = String(descriptions[image] ?? prompt).trim();
  const known = await get(`lounge_scene_backgrounds?scene_key=eq.${encodeURIComponent(sceneKey)}&select=id`);
  const label = `${from} · ${image.split('/').pop()}`;
  if (known.length) { console.log(`already shared  ${label}`); continue; }
  if (description.length < 4 || description.length > 400) { console.log(`SKIPPED (description ${description.length} characters; give 4-400 with --describe)  ${label}`); continue; }
  console.log(`${apply ? 'sharing' : 'would share'}  ${label}\n    «${description}»${descriptions[image] ? '' : '  (the member\'s own words)'}`);
  if (!apply) continue;
  const source = await fetch(`${base}/storage/v1/object/${buckets.private}/${image}`, { headers });
  if (!source.ok) { console.log(`  not read (${source.status})`); continue; }
  const bytes = new Uint8Array(await source.arrayBuffer());
  const ext = /\.jpe?g$/i.test(image) ? 'jpg' : 'webp';
  const path = `scenes/${randomUUID()}.${ext}`;
  const stored = await fetch(`${base}/storage/v1/object/${buckets.public}/${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': ext === 'jpg' ? 'image/jpeg' : 'image/webp', 'x-upsert': 'true' }, body: bytes });
  if (!stored.ok) { console.log(`  not stored (${stored.status})`); continue; }
  const inserted = await fetch(`${base}/rest/v1/lounge_scene_backgrounds?on_conflict=scene_key`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify({ scene_key: sceneKey, description, image_path: path, created_by: user }) });
  console.log(inserted.ok ? `  shared as ${path}` : `  not added to the library (${inserted.status}): ${(await inserted.text()).slice(0, 160)}`);
  if (inserted.ok) shared++;
}
console.log(apply ? `${shared} shared` : 'Dry run: add --apply to share.');
