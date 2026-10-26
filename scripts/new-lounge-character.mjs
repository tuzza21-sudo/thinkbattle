// Adds the skeleton of a new house character to the code, and registers it in the database.
//   node scripts/new-lounge-character.mjs <id> --name 윤서연 --job "출판 편집자" --gender female --group basic --theme cafe \
//        [--age 36] [--space "공간 이름"] [--register]
// It writes, in the places a character lives in (see docs/add-a-lounge-character.md), a working entry whose text is
// marked TODO(새 캐릭터): the host (lounge.ts), its lobby card, background, group and voice gender, its page
// (loungeCharacters.ts), its relationship (configs/<id>.ts, cut from scripts/templates/relationship-config.template.ts), its
// sitemap entry and its image prompts
// (scripts/lounge-character-prompts.json). The tests refuse to pass while a TODO(새 캐릭터) is left, so nothing is shipped
// half written. With --register the id is also added to lounge_house_characters (and a space for it, with --space) in the
// database with the service key: no SQL to run by hand (needs migration 20261120000000 once).
import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });

const [id, ...rest] = process.argv.slice(2);
const options = Object.fromEntries(rest.filter(arg => arg.startsWith('--')).map(arg => { const [key, ...value] = arg.replace(/^--/, '').split('='); return [key, value.length ? value.join('=') : 'true']; }));
// "--name 윤서연" form: a value in the next argument.
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--') && !rest[i].includes('=') && rest[i + 1] && !rest[i + 1].startsWith('--')) options[rest[i].slice(2)] = rest[i + 1];
const TODO = 'TODO(새 캐릭터)';
const fail = message => { console.error(`\n${message}\n`); process.exit(1); };
if (!id || !/^[a-z][a-z0-9]{1,23}$/.test(id)) fail('Usage: node scripts/new-lounge-character.mjs <id: 영문 소문자와 숫자 2~24자> --name 이름 --job "짧은 직업(12자 이내)" --gender female|male --group basic|challenge --theme <배경 id> [--age 36] [--space "공간 이름"] [--register]');
// The database part, with the service key: the id in lounge_house_characters (the table every function and check reads)
// and, with --space, a space for the character. Idempotent for a row that is already there is refused with a clear message.
const registerInDatabase = async () => {
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) fail('Registering needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const registered = await fetch(`${base}/rest/v1/lounge_house_characters`, { method: 'POST', headers, body: JSON.stringify({ id }) });
  if (!registered.ok) fail(`The registry refused ${id} (HTTP ${registered.status}): ${(await registered.text()).slice(0, 200)}\nIf the table does not exist, run supabase/migrations/20261120000000_lounge_character_registry.sql once; if the id is already there, it is registered.`);
  console.log(`Registered ${id} in lounge_house_characters.`);
  if (options.space) {
    const space = options.theme ?? 'cafe';
    const last = await (await fetch(`${base}/rest/v1/voice_lounge_spaces?select=sort&order=sort.desc&limit=1`, { headers })).json();
    const added = await fetch(`${base}/rest/v1/voice_lounge_spaces`, { method: 'POST', headers, body: JSON.stringify({ id: `${id}-room`, name: options.space, host_persona: id, theme: space, capacity: 6, sort: (last[0]?.sort ?? 0) + 1, open: true }) });
    if (!added.ok) fail(`The space was refused (HTTP ${added.status}): ${(await added.text()).slice(0, 200)}`);
    console.log(`Added the space "${options.space}" (${id}-room, background ${space}).`);
  }
};
if (id && options['register-only']) { await registerInDatabase(); process.exit(0); }

const { name, job, gender = 'female', group = 'challenge', theme = 'cafe' } = options;
const age = options.age ? `${options.age}세` : '30대';
if (!name || !job) fail('--name and --job are required.');
if (job.length > 12) fail('--job is a short job title for the home cards: 12 characters at most.');
if (!['female', 'male'].includes(gender)) fail('--gender is female or male.');

const path = relative => fileURLToPath(new URL(`../${relative}`, import.meta.url));
// Files are edited in memory (as LF text, whatever their line endings) and written together at the end: when anything
// fails, nothing has been touched.
const pending = new Map(), endings = new Map();
const read = relative => {
  if (pending.has(relative)) return pending.get(relative);
  const raw = readFileSync(path(relative), 'utf8');
  endings.set(relative, raw.includes('\r\n') ? '\r\n' : '\n');
  return raw.replace(/\r\n/g, '\n');
};
const write = (relative, text) => { if (!pending.has(relative) && existsSync(path(relative))) read(relative); pending.set(relative, text); };
const flush = () => { for (const [relative, text] of pending) writeFileSync(path(relative), endings.get(relative) === '\r\n' ? text.replace(/\n/g, '\r\n') : text, 'utf8'); };
const lounge = loadTs(path('src/lib/lounge.ts'));
const relationship = loadTs(path('src/lib/relationship/index.ts'));
if (lounge.loungeHosts.some(host => host.id === id)) fail(`${id} is already a character.`);
if (!lounge.loungeThemes.some(item => item.id === theme)) fail(`--theme must be one of: ${lounge.loungeThemes.map(item => item.id).join(', ')}`);
if (!lounge.loungeHostGroups.some(item => item.id === group)) fail(`--group must be one of: ${lounge.loungeHostGroups.map(item => item.id).join(', ')}`);

// Puts `addition` in front of the first `anchor` found after `from` (an exact place, or the script stops).
const insertBefore = (text, anchor, addition, label, from = '') => {
  const start = from ? text.indexOf(from) : 0;
  const index = start < 0 ? -1 : text.indexOf(anchor, start);
  if (index < 0) fail(`Cannot place the ${label}: its anchor was not found. Add it by hand (docs/add-a-lounge-character.md).`);
  return text.slice(0, index) + addition + text.slice(index);
};
const q = text => text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// ---- the host (src/lib/lounge.ts)
let source = read('src/lib/lounge.ts');
const voice = gender === 'female' ? 'marin' : 'onyx';
source = insertBefore(source, '] as const;\n/**\n * Every host has a relationship configuration', `  {
    id: '${id}', name: '${q(job)}', tag: '${TODO} 한 줄 특징', emoji: '✨', color: '#e8e0f0',
    portrait: '/lounge/host-${id}-v1.webp', voiceSample: '/lounge/host-${id}-v1.mp3?v=1', voiceLabel: '${TODO} 목소리를 한 줄로',
    description: '${TODO} 로비 카드의 한 줄 소개',
    greeting: '${TODO} 첫 인사 한두 문장',
    instruction: \`${job}: ${TODO} 여럿이 함께하는 방에서 이 인물이 하는 일과 말투를 쓰세요.
주목하는 지점: ${TODO}
개입 방식: ${TODO}
다른 관점: 장난과 비판의 대상은 말과 상황이며 사람 자체가 아니다.
여럿일 때: 실제로 나온 서로 다른 말을 동등하게 다루고, 특정 참가자만 편애하거나 놀리지 않는다.
피할 것: ${TODO}
예시는 말투와 관점만 참고하고 실제 대화의 사실로 간주하지 않는다. 공통 길이·질문 수·발언 대상과 답변 차례 규칙을 우선한다.\`,
    companion: \`${job}: ${TODO} 1:1 대화에서의 이름·나이·직업·성격·말투·좋아하는 것·숨은 면을 쓰세요. 장난과 비판은 상황과 말에만 하고 사람 자체를 깎아내리지 않는다.\`,
    voice: '${voice}', speechSpeed: 1.08,
    speechInstruction: '${TODO} 한국어로 이 인물의 목소리 결, 템포, 피할 연기를 쓰세요.',
    sampleText: '${TODO} 로비에서 들려줄 한두 문장',
  },
`, 'host');
write('src/lib/lounge.ts', source);

// the registry maps, one line each
source = read('src/lib/lounge.ts');
const groupPattern = new RegExp(`(\\{ id: '${group}',[^\\n]*hostIds: \\[[^\\]]*)\\]`);
if (!groupPattern.test(source)) fail(`Cannot find the ${group} group.`);
source = source.replace(groupPattern, `$1, '${id}']`);
const profilesStart = source.indexOf('export const loungeCharacterProfiles');
const profilesEnd = source.indexOf('\n};', profilesStart);
source = source.slice(0, profilesEnd) + `\n  ${id}: { traits: ['${TODO} 특징 1', '특징 2', '특징 3'], summary: '${TODO} 로비 카드의 소개 두세 문장' },` + source.slice(profilesEnd);
const themesStart = source.indexOf('export const loungeHostThemes');
const themesEnd = source.indexOf('\n};', themesStart);
source = source.slice(0, themesEnd) + `\n  ${id}: ['${theme}'],` + source.slice(themesEnd);
source = source.replace(/(const houseVoiceGender: Record<string, 'female' \| 'male'> = \{[^}]*)\};/, `$1, ${id}: '${gender}' };`);
if (!source.includes(`${id}: '${gender}'`)) fail('Cannot add the voice gender.');
write('src/lib/lounge.ts', source);

// ---- the relationship: a file of its own, cut from a template whose numbers the tests accept
const templateFile = 'scripts/templates/relationship-config.template.ts';
const configFile = `src/lib/relationship/configs/${id}.ts`;
if (existsSync(path(configFile))) fail(`${configFile} already exists.`);
write(configFile, read(templateFile).replaceAll('__ID__', id).replaceAll('__NAME__', q(name)));
let index = read('src/lib/relationship/index.ts');
index = insertBefore(index, "import { witRelationship } from './configs/wit.js';", `import { ${id}Relationship } from './configs/${id}.js';\n`, 'relationship import');
index = insertBefore(index, '].map(config => [config.characterId', `, ${id}Relationship`, 'relationship');
write('src/lib/relationship/index.ts', index);

// ---- the sitemap lists every character page
let sitemap = read('public/sitemap.xml');
const lastEntry = sitemap.lastIndexOf('/lounge/characters/');
const entryEnd = sitemap.indexOf('\n', lastEntry);
if (lastEntry < 0) fail('Cannot find the character pages in public/sitemap.xml.');
sitemap = sitemap.slice(0, entryEnd) + `\n  <url><loc>https://saseok.kr/lounge/characters/${id}</loc></url>` + sitemap.slice(entryEnd);
write('public/sitemap.xml', sitemap);

// ---- the page: the moves follow what the template really changes (the tests keep the two in step)
const config = Object.values(loadTs(path(templateFile))).find(value => value?.characterId);
const effect = type => (config.events[type] ?? relationship.defaultEventEffects[type]).deltas;
const describe = type => relationship.relationshipEventCatalog[type].description;
const wins = relationship.relationshipEventTypes.filter((type, position, all) => all.indexOf(type) === position && !relationship.protectiveEvents.includes(type) && Object.values(effect(type)).some(value => value >= 4));
const losses = relationship.relationshipEventTypes.filter((type, position, all) => all.indexOf(type) === position && !wins.includes(type) && Object.values(effect(type)).some(value => value < 0)).slice(0, 3);
const move = (type, kind) => `      { event: '${type}', title: '${q(describe(type)).slice(0, 60)}', ${kind === 'win' ? `example: '${TODO} 예시 대사', ` : ''}why: '${TODO} 이 인물이 왜 이렇게 반응하는지' },`;
let page = read('src/lib/loungeCharacters.ts');
page = insertBefore(page, '\n];\n', `
  {
    id: '${id}', name: '${q(name)}', age: '${age}', role: '${TODO} 직업을 한 줄로', place: '${theme}',
    job: '${q(job)}',
    look: '${TODO} 외모를 한 줄로', fullBody: '/lounge/host-${id}-work-v1.webp',
    quote: '${TODO} 이 인물을 보여 주는 한마디',
    tagline: '${TODO} 한두 문장 소개',
    story: ['${TODO} 지금까지의 삶 (문단별로)'],
    personality: [{ label: '강점', text: '${TODO}' }, { label: '약점', text: '${TODO}' }, { label: '모순', text: '${TODO}' }],
    habits: ['${TODO} 말버릇과 습관'],
    wins: [
${wins.map(type => move(type, 'win')).join('\n')}
    ],
    losses: [
${losses.map(type => move(type, 'loss')).join('\n')}
    ],
    boundaries: ['장난과 비판은 상황과 말에만 하고 사람 자체를 깎아내리지 않는다.', '${TODO} 이 인물만의 선'],
    relations: [],
  },`, 'page', 'export const loungeCharacters');
write('src/lib/loungeCharacters.ts', page);

// ---- the image prompts (read by the two image scripts)
const promptsFile = 'scripts/lounge-character-prompts.json';
const prompts = existsSync(path(promptsFile)) ? JSON.parse(read(promptsFile)) : {};
if (prompts[id]) fail(`${promptsFile} already has ${id}.`);
const person = gender === 'female' ? 'woman' : 'man';
prompts[id] = {
  portrait: { file: `host-${id}-v1.webp`, prompt: `{{common}} A strikingly beautiful fictional Korean ${person}, ${TODO} age and look: face, hair, clothes, expression, a background that fits the character. Soft flattering natural light. Elegant magazine-portrait quality, tasteful and not provocative.` },
  full: { portrait: `host-${id}-v1.webp`, file: `host-${id}-full-v1.webp`, prompt: `{{common}} ${TODO} She or he wears the same clothes as in the portrait and stands in a place that fits the character, turned slightly toward the camera.` },
  work: { portrait: `host-${id}-v1.webp`, file: `host-${id}-work-v1.webp`, prompt: `{{common}} ${TODO} What the character does for a living, caught mid-task, in the place they do it. Nothing readable on any sign or paper.` },
};
write(promptsFile, JSON.stringify(prompts, null, 2) + '\n');

// ---- the database: one row, no SQL (before any file is written, so a refusal leaves the code as it was)
if (options.register) await registerInDatabase();
else console.log('Not registered in the database yet: add --register (and --space "이름") when it is ready to go live, or later: node scripts/new-lounge-character.mjs ' + id + ' --register-only [--space "이름" --theme <배경 id>]');

flush();
console.log(`Added ${id} (${name}, ${job}) to ${[...pending.keys()].join(', ')}.`);
console.log(`
Next (docs/add-a-lounge-character.md):
  1. Write every ${TODO} in src/lib/lounge.ts, src/lib/loungeCharacters.ts and ${promptsFile}; if the character needs its own scores,
     move its relationship into src/lib/relationship/configs/${id}.ts like seoyeon.ts.
  2. Draw: node scripts/generate-lounge-character-portraits.mjs --only=${id}, then generate-lounge-character-full-body.mjs --only=${id}
     and --set=work --only=${id}. Voice: pick one in the ElevenLabs library, put its id in loungeEngineVoices.eleven, then
     node scripts/generate-lounge-voice-sample.mjs ${id} host-${id}-v1.mp3
  3. Stories and knowledge (admin page or SQL, docs/lounge-knowledge/${id}.jsonl with scripts/import-lounge-knowledge.mjs).
  4. npm run build && npm run test:lounge`);
