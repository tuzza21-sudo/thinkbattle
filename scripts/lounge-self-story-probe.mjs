// Only synthetic fixtures captured by lounge-dohyun-confidence-probe may be used. Offline unless --live is explicit.
// One writer reply, its existing recorder, then a follow-up writer: three API calls, no database access.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { loadTs } from './lounge-ts-loader.mjs';

dotenv.config({ path: '.env.local', quiet: true });
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const { request: writer, after: recorder } = JSON.parse(readFileSync(option('capture') ?? 'node_modules/.cache/lounge-self-story-capture/greeting-after.json', 'utf8'));
const input = JSON.parse(writer.input);
assert.equal(input.scenario?.id, 'auditor-synthetic-meeting', 'Only the known synthetic fixture is allowed');
assert.equal(input.member_name, '가상 상대');
const m = loadTs('src/lib/loungeMessenger.ts');
const chars = loadTs('src/lib/loungeCharacters.ts');
const firstHuman = { kind: 'human', nickname: '가상 상대', text: '최근에 도현 씨에게 재미있었던 일 하나 들려줘요.' };
input.recent = [firstHuman]; input.latest = firstHuman;
writer.input = JSON.stringify(input);
if (!args.includes('--live')) {
  console.log(JSON.stringify({ syntheticOnly: true, callsIfLive: 3, seededStories: 0, instructions: writer.instructions.length, recorderSupportsSelfStories: 'self_story_updates' in recorder.text.format.schema.properties }));
  process.exit(0);
}
assert.ok(process.env.OPENAI_API_KEY, 'Missing provider key');
const calls = [];
async function ask(request) {
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, model: 'gpt-6-luna', stream: false, store: false }), signal: AbortSignal.timeout(55000) });
  assert.ok(response.ok, `Provider HTTP ${response.status}`);
  const body = await response.json();
  const text = body.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text;
  assert.ok(text, 'Provider returned no JSON');
  const result = JSON.parse(text);
  calls.push({ purpose: request.text.format.name, usage: body.usage, result });
  return result;
}
const first = await ask(writer);
const recordInput = JSON.parse(recorder.input);
recordInput.recent = [firstHuman, { kind: 'host', nickname: '서도현', text: first.text, inner_voice: first.inner_voice ?? '' }];
recordInput.self_stories = [];
recorder.input = JSON.stringify(recordInput);
const update = await ask(recorder);
const state = m.nextLoungeCompanionState({ state: m.normalizeLoungeCompanionState(null, 'synthetic-story-room'), update, decision: { progress: 'stay' }, turn: 1, reply: first.text, inner: first.inner_voice ?? '', userText: firstHuman.text });
const stored = state.self_stories ?? [];
console.log(JSON.stringify({ step: 'recorded', stories: stored }));
const report = { syntheticOnly: true, databaseWrites: false, seededStories: 0, calls, stored };
if (!stored.length) {
  if (option('out')) writeFileSync(option('out'), JSON.stringify(report, null, 2));
  throw new Error('The live recorder did not preserve a generated own story');
}
const secondHuman = { kind: 'human', nickname: '가상 상대', text: '그 얘기 조금 더 해 줘요. 도현 씨는 어떤 마음이었어요?' };
input.recent = [...recordInput.recent, secondHuman]; input.latest = secondHuman; input.memory = update.memory;
input.turn = m.loungeTurnConditions({ bible: chars.getLoungeCharacter('auditor').bible, stage: 1, state, turn: 2, decision: { progress: 'stay' }, innerVoice: 'on', userText: secondHuman.text });
assert.ok(input.turn.self_stories?.length, 'The follow-up must receive the generated story');
writer.input = JSON.stringify(input);
const second = await ask(writer);
report.followup = second;
report.followupStories = input.turn.self_stories;
console.log(JSON.stringify({ step: 'followup', text: second.text, inner_voice: second.inner_voice }));
assert.equal(calls.length, 3);
if (option('out')) writeFileSync(option('out'), JSON.stringify(report, null, 2));
