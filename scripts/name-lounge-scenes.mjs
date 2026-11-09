// Gives the shared backgrounds that have no name a name and tags (and an English slug, for the log), so the library can be searched.
//   node scripts/name-lounge-scenes.mjs [--dry]
// Needs SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY in .env.local and migration 20261216 applied (the name and tags columns).
// Only rows whose name is empty are touched; the pictures and their files stay where they are.
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const service = process.env.SUPABASE_SERVICE_ROLE_KEY, key = process.env.OPENAI_API_KEY;
if (!base || !service || !key) throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY are required in .env.local');
const dry = process.argv.includes('--dry');
const headers = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

const listed = await fetch(`${base}/rest/v1/lounge_scene_backgrounds?name=is.null&select=id,description&order=created_at.asc&limit=200`, { headers });
if (!listed.ok) throw new Error(`could not read the library (${listed.status}); is migration 20261216 applied?`);
const rows = await listed.json();
console.log(`${rows.length} backgrounds without a name`);

const instructions = `너는 배경 사진 보관함의 사서다. description은 배경 사진 한 장의 장소 묘사다. 이 사진을 나중에 찾아 쓰기 쉽게 이름과 태그를 붙인다.
- name: 한국어 짧은 이름(2~14자 정도). 장소의 종류와 시간대·날씨를 담는다(예: "비 오는 밤 자동차 안", "노을 지는 주방").
- tags: 한국어 키워드 5~8개. 장소의 종류(식당, 집, 거리 등), 실내/실외, 시간대, 분위기, 눈에 띄는 사물을 넣는다. 사람 이름이나 글자는 쓰지 않는다.
설명 없이 JSON만 출력한다.`;
const schema = { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['name', 'tags'] };

for (const row of rows) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-6-luna', reasoning: { effort: 'none' }, max_output_tokens: 300, store: false, instructions, input: JSON.stringify({ description: row.description }), text: { format: { type: 'json_schema', name: 'scene_name', strict: true, schema } } }),
  });
  const body = await response.json();
  const text = body.output_text ?? (body.output ?? []).flatMap(part => part.content ?? []).map(part => part.text ?? '').join('');
  let named; try { named = JSON.parse(text); } catch { console.warn(`skip ${row.id}: no usable answer`); continue; }
  const name = String(named.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const tags = [...new Set((Array.isArray(named.tags) ? named.tags : []).map(tag => String(tag).replace(/[#\s]+/g, ' ').trim().slice(0, 16)).filter(Boolean))].slice(0, 8);
  if (name.length < 2) { console.warn(`skip ${row.id}: name too short`); continue; }
  console.log(`${dry ? '[dry] ' : ''}${name}  [${tags.join(', ')}]  <- ${row.description.slice(0, 40)}`);
  if (dry) continue;
  const saved = await fetch(`${base}/rest/v1/lounge_scene_backgrounds?id=eq.${row.id}&name=is.null`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ name, tags }) });
  if (!saved.ok) console.warn(`could not save ${row.id}: ${saved.status}`);
}
