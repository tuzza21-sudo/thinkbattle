// Loads a file of knowledge and experience entries into a character's knowledge (the lounge_character_knowledge table).
//   node scripts/import-lounge-knowledge.mjs docs/lounge-knowledge/ina.jsonl            checks the file, changes nothing
//   node scripts/import-lounge-knowledge.mjs docs/lounge-knowledge/ina.jsonl --apply    embeds and saves the new entries
//   add --update to also overwrite entries that already have the same character and title
// A .jsonl file has one entry per line, a .csv file has one per row under a header line. The fields are those of the
// administrator's form: character, kind (knowledge|experience), title, content, tags (a list in jsonl, comma separated in
// csv), lesson, category, sourceNote, asOf, timeSensitive, active. The names source_note, as_of and time_sensitive work too.
// Every entry is checked exactly as the form checks it before anything is sent anywhere.
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });

// The reading and checking of a file is shared with the administrator's upload screen (src/lib/loungeKnowledgeImport.ts).
const source = path => fileURLToPath(new URL(`../src/lib/${path}`, import.meta.url));
const knowledge = loadTs(source('loungeKnowledge.ts'));
const lounge = loadTs(source('lounge.ts'));
const importer = loadTs(source('loungeKnowledgeImport.ts'));

export const { parseCsv } = importer;
/** Checks every entry like the form does. Returns the clean entries and the problems with their line numbers. */
export const checkEntries = (path, text, characters = lounge.loungeHosts.map(host => host.id)) => importer.checkKnowledgeFile(path, text, characters);

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const path = process.argv[2];
  if (!path || path.startsWith('--')) throw new Error('Usage: node scripts/import-lounge-knowledge.mjs <file.jsonl|file.csv> [--apply] [--update]');
  const apply = process.argv.includes('--apply'), update = process.argv.includes('--update');
  const { entries, problems } = checkEntries(path, await readFile(path, 'utf8'));
  if (problems.length) { console.error(`${problems.length} problem(s), nothing was sent:\n${problems.map(problem => `  ${problem}`).join('\n')}`); process.exit(1); }
  const count = (key, value) => entries.filter(entry => entry[key] === value).length;
  console.log(`${entries.length} entries are valid: ${count('kind', 'knowledge')} knowledge, ${count('kind', 'experience')} experience; characters: ${[...new Set(entries.map(entry => entry.character))].join(', ')}.`);

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY, openaiKey = process.env.OPENAI_API_KEY;
  if (!url || !serviceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local to compare with the database.');
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  const request = async (route, init = {}) => {
    const response = await fetch(`${url}/rest/v1/${route}`, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Database request failed (HTTP ${response.status}) for ${route.split('?')[0]}.`);
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  };
  const characters = [...new Set(entries.map(entry => entry.character))];
  const existing = new Map();
  for (const character of characters) for (const row of await request(`lounge_character_knowledge?character_id=eq.${character}&select=id,title,kind,active`)) existing.set(`${character}\n${row.title}`, row);
  const fresh = entries.filter(entry => !existing.has(`${entry.character}\n${entry.title}`));
  const same = entries.filter(entry => existing.has(`${entry.character}\n${entry.title}`));
  console.log(`In the database now: ${[...characters].map(character => `${character} ${[...existing.keys()].filter(key => key.startsWith(`${character}\n`)).length}`).join(', ')}.`);
  console.log(`New: ${fresh.length}. Already there with the same title: ${same.length} (${update ? 'will be overwritten' : 'left as they are; add --update to overwrite'}).`);
  if (!apply) { console.log('Dry run: nothing was embedded or saved. Add --apply to save.'); process.exit(0); }
  if (!openaiKey) throw new Error('Set OPENAI_API_KEY in .env.local to embed the entries.');

  const todo = [...fresh.map(entry => ({ entry })), ...(update ? same.map(entry => ({ entry, id: existing.get(`${entry.character}\n${entry.title}`).id })) : [])];
  let saved = 0;
  for (let start = 0; start < todo.length; start += 20) {
    const batch = todo.slice(start, start + 20);
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ model: knowledge.loungeEmbeddingModel, input: batch.map(({ entry }) => knowledge.loungeKnowledgeEmbeddingText(entry)), dimensions: knowledge.loungeKnowledgeDimensions, encoding_format: 'float' }),
    });
    if (!response.ok) throw new Error(`Embedding request failed (HTTP ${response.status}) after ${saved} saved.`);
    const data = (await response.json()).data ?? [];
    for (const [index, item] of batch.entries()) {
      const embedding = knowledge.normalizeLoungeEmbedding(data[index]?.embedding);
      if (!embedding) throw new Error(`Unusable embedding for 「${item.entry.title}」 after ${saved} saved.`);
      const { entry } = item;
      const row = { character_id: entry.character, kind: entry.kind, title: entry.title, content: entry.content, active: entry.active, embedding, tags: entry.tags,
        lesson: entry.kind === 'experience' ? entry.lesson || null : null, category: entry.kind === 'experience' ? entry.category || null : null,
        source_note: entry.kind === 'knowledge' ? entry.sourceNote || null : null, as_of: entry.kind === 'knowledge' ? entry.asOf || null : null,
        time_sensitive: entry.kind === 'knowledge' && entry.timeSensitive };
      if (item.id) await request(`lounge_character_knowledge?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }) });
      else await request('lounge_character_knowledge', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=minimal' } });
      saved++;
    }
    console.log(`Saved ${saved}/${todo.length}`);
  }
  for (const character of characters) {
    const active = await request(`lounge_character_knowledge?character_id=eq.${character}&active=eq.true&select=id`);
    const embedded = await request(`lounge_character_knowledge?character_id=eq.${character}&active=eq.true&embedding=not.is.null&select=id`);
    console.log(`${character}: ${active.length} active entries, ${embedded.length} with an embedding.`);
  }
}
