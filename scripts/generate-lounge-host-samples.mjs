// Generate one short, fixed sample per style. Uses the same speech settings as
// the moderator. Existing samples are reused unless --overwrite is explicit.
import dotenv from 'dotenv';
import ts from 'typescript';
import { readFile, writeFile, access } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
if (!process.env.OPENAI_API_KEY) throw new Error('Configure the server speech API key before generating voice samples.');
const source = await readFile(new URL('../src/lib/lounge.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;
const lounge = {};
new Function('exports', output)(lounge);
const selectedHost = process.argv.find(argument => argument.startsWith('--host='))?.slice('--host='.length);
const hosts = selectedHost ? lounge.loungeHosts.filter(host => host.id === selectedHost) : lounge.loungeHosts;
if (!hosts.length) throw new Error('Unknown lounge host.');
for (const host of hosts) {
  const file = new URL(`../public${host.voiceSample}`, import.meta.url);
  const exists = await access(file).then(() => true, () => false);
  if (exists && !process.argv.includes('--overwrite')) { console.log(`Reused ${host.id} sample`); continue; }
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(lounge.loungeSpeechRequest(host.id, host.sampleText, 'mp3')), signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Sample generation failed for ${host.id} (HTTP ${response.status}).`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 100 || audio.length > 1_000_000) throw new Error('Unexpected sample audio length.');
  await writeFile(file, audio);
  console.log(`Saved ${host.voiceSample}: ${audio.length} bytes`);
}
