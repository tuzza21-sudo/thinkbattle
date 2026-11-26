// Makes a character's lobby voice sample with Gemini speech (2026-11-27: ElevenLabs refuses while its invoice is unpaid,
// and every character speaks with Gemini then). Its sampleText and speechInstruction, read by a Gemini prebuilt voice,
// saved as a 24 kHz 16-bit mono WAV in public/lounge (or the folder given). Several voices make one file each, to compare.
//   node scripts/generate-lounge-gemini-voice-sample.mjs <host id> <file.wav> [--voices=Zephyr,Laomedeia] [--dir=docs/voice-samples/x]
// Needs GEMINI_API_KEY in .env.local. With one voice the file is <file.wav>; with several, <voice>-<file.wav>.
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });

const [hostId, file] = process.argv.slice(2);
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
if (!hostId || !file?.endsWith('.wav')) throw new Error('Usage: node scripts/generate-lounge-gemini-voice-sample.mjs <host id> <file.wav> [--voices=A,B] [--dir=folder]');
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required in .env.local');
const lounge = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
const host = lounge.getLoungeHost(hostId);
if (!host?.sampleText) throw new Error(`${hostId}: no sampleText`);
const voices = option('voices')?.split(',').filter(Boolean) ?? [lounge.loungeGeminiSpeech[hostId]?.voiceName ?? 'Kore'];
const dir = option('dir') ?? 'public/lounge';
mkdirSync(dir, { recursive: true });

const wav = pcm => {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
};
for (const voice of voices) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${lounge.loungeGeminiSpeechModel}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(lounge.loungeGeminiSpeechRequest(hostId, host.sampleText, voice)),
  });
  if (!response.ok) { console.log(`${voice}: Gemini ${response.status} ${(await response.text()).slice(0, 160)}`); continue; }
  const data = (await response.json()).candidates?.[0]?.content?.parts?.find(part => part.inlineData)?.inlineData?.data;
  if (!data) { console.log(`${voice}: no audio`); continue; }
  const out = join(dir, voices.length > 1 ? `${voice}-${file}` : file);
  const bytes = wav(Buffer.from(data, 'base64'));
  writeFileSync(out, bytes);
  console.log(`saved ${out} (${bytes.length} bytes, ${(bytes.length / 48000).toFixed(1)} s) · ${voice}`);
}
