// Loads a story (and its episodes) from docs/stories/<id>.json into lounge_scenarios with the service key.
//   node scripts/upsert-lounge-story.mjs docs/stories/velvet-black-rose.json            checks the file, changes nothing
//   node scripts/upsert-lounge-story.mjs docs/stories/velvet-black-rose.json --apply    saves it (new or replacing the same id)
// The file has the columns of lounge_scenarios (id, character_id, title, hook, prologue, user_role, relationship, place,
// theme, sort) and `episodes` in the format of src/lib/loungeStory.ts. Every episode and checkpoint is checked first: one
// the page would drop is reported, and nothing is sent. Rooms already in the story keep their copy; a new start gets this.
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });

const storyLib = loadTs(fileURLToPath(new URL('../src/lib/loungeStory.ts', import.meta.url)));
const scenarios = loadTs(fileURLToPath(new URL('../src/lib/loungeScenarios.ts', import.meta.url)));

/** The problems of a story file, by field; none means it can be saved. */
export function checkStory(story) {
  const problems = [];
  const limits = scenarios.loungeScenarioLimits;
  for (const field of ['id', 'character_id', 'title', 'hook', 'prologue', 'user_role', 'relationship', 'place', 'theme']) if (typeof story[field] !== 'string' || !story[field].trim()) problems.push(`${field}: empty`);
  for (const [field, max] of Object.entries(limits)) if (typeof story[field] === 'string' && story[field].trim().length > max) problems.push(`${field}: ${story[field].trim().length} characters, at most ${max}`);
  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(story.id ?? '')) problems.push('id: lowercase letters, numbers and hyphens');
  if (story.episodes !== undefined) {
    const raw = Array.isArray(story.episodes) ? story.episodes : [];
    const kept = storyLib.normalizeLoungeStoryEpisodes(raw);
    if (kept.length !== raw.length) problems.push(`episodes: ${raw.length - kept.length} episode(s) without a title or a valid checkpoint`);
    raw.forEach((episode, index) => {
      const ids = (episode.checkpoints ?? []).map(point => point.id);
      if (new Set(ids).size !== ids.length) problems.push(`episode ${index + 1}: a checkpoint id is used twice`);
      const valid = kept[index]?.checkpoints.length ?? 0;
      if (valid !== ids.length) problems.push(`episode ${index + 1}: ${ids.length - valid} checkpoint(s) with a bad id, label or detail`);
      if (index > 0 && !String(episode.opening ?? '').trim()) problems.push(`episode ${index + 1}: no opening (only the first episode opens with the prologue)`);
    });
  }
  return problems;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: node scripts/upsert-lounge-story.mjs <docs/stories/file.json> [--apply]');
  const story = JSON.parse(await readFile(path, 'utf8'));
  const problems = checkStory(story);
  if (problems.length) { console.error(`${problems.length} problem(s), nothing was sent:\n${problems.map(item => `  ${item}`).join('\n')}`); process.exit(1); }
  console.log(`${story.id} (${story.character_id}) «${story.title}»: prologue ${story.prologue.length} characters, ${story.episodes?.length ?? 0} episodes.`);
  if (!process.argv.includes('--apply')) { console.log('Dry run: add --apply to save.'); process.exit(0); }
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, ''), key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
  const row = { id: story.id, character_id: story.character_id, title: story.title, hook: story.hook, prologue: story.prologue, user_role: story.user_role,
    relationship: story.relationship, place: story.place, theme: story.theme, sort: story.sort ?? 0, active: story.active !== false, updated_at: new Date().toISOString() };
  let response = await fetch(`${base}/rest/v1/lounge_scenarios`, { method: 'POST', headers, body: JSON.stringify({ ...row, ...(story.episodes ? { episodes: story.episodes } : {}) }) });
  if (!response.ok && story.episodes && /episodes/.test(await response.clone().text())) {
    console.warn('The episodes column is not there yet (run supabase/migrations/20261126000000_lounge_story_episodes.sql). Saving the story without its episodes for now.');
    response = await fetch(`${base}/rest/v1/lounge_scenarios`, { method: 'POST', headers, body: JSON.stringify(row) });
  }
  console.log(response.ok ? `Saved ${story.id}.` : `Not saved (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`);
  if (!response.ok) process.exit(1);
}
