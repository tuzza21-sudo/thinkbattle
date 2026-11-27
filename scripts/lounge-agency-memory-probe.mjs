// Use actual synthetic replies to verify recording, local persistence and a subsequent reply; no real database.
// --live is required for provider calls. Run lounge-agency-probe.mjs first for the selected --provider.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { loadTs } from './lounge-ts-loader.mjs';
import { agencyCases, captureAgencyCase } from './lounge-agency-probe.mjs';

const args = process.argv.slice(2), option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const provider = option('provider') ?? 'deepseek';
assert.ok(['deepseek', 'openai'].includes(provider));
const env = args.includes('--live') ? parse(readFileSync(option('env-file') ?? new URL('../.env.local', import.meta.url))) : {};
const { reduceLoungeTurn } = loadTs(fileURLToPath(new URL('../src/lib/loungeTurnPersistence.ts', import.meta.url)));
const { getRelationshipConfig } = loadTs(fileURLToPath(new URL('../src/lib/relationship/index.ts', import.meta.url)));
const source = JSON.parse(readFileSync(option('source') ?? `node_modules/.tmp/lounge-agency-${provider}.json`, 'utf8'));
assert.equal(source.syntheticOnly, true);
const voiceSource = provider === 'deepseek' ? JSON.parse(readFileSync('node_modules/.tmp/lounge-agency-openai.json', 'utf8')) : source;
assert.equal(voiceSource.syntheticOnly, true);

async function ask(request, destination = 'openai') {
  assert.ok(args.includes('--live'), 'External calls require --live');
  const key = env[destination === 'openai' ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY'];
  assert.ok(key, 'Missing provider key');
  const body = destination === 'openai' ? { ...request, model: 'gpt-6-luna', store: false, stream: false }
    : { model: 'deepseek-flash', stream: false, thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: request.max_output_tokens, messages: [
      { role: 'system', content: `${request.instructions}\n답은 이 JSON 스키마를 따르는 json 객체 하나로만 쓴다: ${JSON.stringify(request.text.format.schema)}` },
      { role: 'user', content: request.input },
    ] };
  const response = await fetch(destination === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.deepseek.com/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55000), body: JSON.stringify(body),
  });
  assert.ok(response.ok, `${destination}: HTTP ${response.status}`);
  const result = await response.json(), raw = destination === 'openai' ? result.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text : result.choices?.[0]?.message?.content;
  try { return { answer: JSON.parse(raw), usage: result.usage }; } catch { return { error: 'invalid_json', raw, usage: result.usage }; }
}

const report = { syntheticOnly: true, provider, stages: ['actual reply', 'actual recorder', 'local atomic reducer', 'optional followup'], cases: [] };
for (const id of ['closer-correct-visit', 'diplomat-pressure', 'diplomat-first-day', 'diplomat-withdrawal'].filter(id => !option('cases') || option('cases').split(',').includes(id))) {
  const scene = structuredClone(agencyCases.find(scene => scene.id === id));
  // The current DeepSeek room uses its GPT voiceFallback; its raw DeepSeek voice probes are comparisons, not the app route.
  const initial = (scene.medium === 'voice' ? voiceSource : source).cases.find(row => row.id === id);
  assert.ok(initial?.answer?.text, `Missing valid initial reply: ${id}`);
  if (id === 'diplomat-withdrawal') scene.state = { room_memory: [{ id: 'own-pace', kind: 'boundary', summary: '지안은 오늘 사용자의 집에 가지 않고 현재 자리에서 이야기하고 싶다고 했다', status: 'active', turn: 7, human_quote: '', character_quote: scene.before[0][1] }] };
  const { after } = await captureAgencyCase(scene), input = JSON.parse(after.input);
  input.recent[input.recent.length - 1] = { kind: 'host', text: initial.answer.text, inner_voice: initial.answer.inner_voice ?? '' };
  if (initial.answer.character_life) input.character_life = initial.answer.character_life;
  const row = { id, initial: initial.answer.text, appliedProvider: scene.medium === 'voice' || initial.review?.rewritten ? 'openai' : provider };
  if (args.includes('--live')) {
    row.recording = await ask({ ...after, input: JSON.stringify(input) });
    if (row.recording.answer) {
      const config = getRelationshipConfig(scene.character), room = 'lounge-00000000-0000-4000-8000-000000000001';
      const ledger = input.record ? { scene: input.record.scene, ...Object.fromEntries(['member', 'between', 'events', 'pending'].map(section => [section, input.record[section].map(({ ref, ...item }) => ({ id: ref, ...item, turn: 0 }))])) } : undefined;
      const { commit } = reduceLoungeTurn(room, config, { state: { room_id: room, ...(ledger ? { memory_ledger: ledger } : {}), ...scene.state }, stateVersion: 0, relationship: null, mood: {} }, {
        room_id: room, turn: 8, user_text: scene.user, reply: initial.answer.text, status: 'ready', created_at: '2026-11-27T00:00:00Z',
        payload: { answer: row.recording.answer, recent: input.recent.slice(0, -1), character_life: initial.answer.character_life, companion: true, ...(ledger ? { ledger: {} } : {}) },
      });
      row.persisted = { memory: commit.memory, room_memory: commit.state.room_memory, ledger: commit.state.memory_ledger, stage: commit.relationship.stage };
      if (id === 'closer-correct-visit') {
        const captured = await captureAgencyCase({ ...scene, state: commit.state, memory: commit.memory, before: [...scene.before, ['human', scene.user], ['host', initial.answer.text]], user: '그럼 내일 어디서 만나기로 한 거죠?' });
        row.followup = await ask({ ...captured.request, max_output_tokens: 1200 }, provider);
      }
    }
  }
  report.cases.push(row);
  console.log(JSON.stringify(row));
  if (option('out')) writeFileSync(option('out'), JSON.stringify(report, null, 2));
}
