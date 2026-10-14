// Generate one short, fixed sample per style. Uses the same speech settings as
// the moderator. Existing samples are reused unless --overwrite is explicit.
import dotenv from 'dotenv';
import ts from 'typescript';
import { readFile, writeFile, access } from 'node:fs/promises';
dotenv.config({ path: '.env.local', quiet: true });
if (!process.env.OPENAI_API_KEY) throw new Error('Configure the server speech API key before generating voice samples.');
// Hosts that speak with Gemini also need GEMINI_API_KEY.
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
  if (lounge.loungeGeminiSpeech[host.id]) {
    // Gemini speech: raw 24 kHz PCM, written as a WAV file.
    const reply = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${lounge.loungeGeminiSpeechModel}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(lounge.loungeGeminiSpeechRequest(host.id, host.sampleText)), signal: AbortSignal.timeout(90_000),
    });
    const part = (await reply.json().catch(() => null))?.candidates?.[0]?.content?.parts?.find(item => item.inlineData?.data)?.inlineData;
    if (!reply.ok || !part) throw new Error(`Gemini sample generation failed for ${host.id} (HTTP ${reply.status}).`);
    const pcm = Buffer.from(part.data, 'base64'), rate = Number(part.mimeType?.match(/rate=(\d+)/i)?.[1]) || 24_000, head = Buffer.alloc(44);
    head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.length, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
    head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40);
    await writeFile(file, Buffer.concat([head, pcm])); console.log(`Saved ${host.voiceSample}: ${pcm.length + 44} bytes (Gemini)`); continue;
  }
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
