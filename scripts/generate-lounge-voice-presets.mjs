// Makes the six sample files members listen to when they choose a voice for their own character
// (public/lounge/voice-preset-<id>.mp3, the presets in src/lib/loungeCustomCharacters.ts). Uses ElevenLabs only.
//   node scripts/generate-lounge-voice-presets.mjs [--only=calm_female]
import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });
if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is required in .env.local');
const lounge = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
const custom = loadTs(fileURLToPath(new URL('../src/lib/loungeCustomCharacters.ts', import.meta.url)));
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
const text = '안녕하세요. 오늘은 어떤 이야기를 나눠 볼까요? 편하게 말해 줘요. 저는 천천히 들을 준비가 됐어요.';
for (const preset of custom.loungeVoicePresets.filter(item => !only || item.id === only)) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${preset.eleven}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(lounge.loungeElevenSpeechRequest(text)),
  });
  if (!response.ok) { console.log(`${preset.id}: ElevenLabs ${response.status} ${(await response.text()).slice(0, 120)}`); continue; }
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(new URL(`../public/lounge/voice-preset-${preset.id}.mp3`, import.meta.url), bytes);
  console.log(`saved voice-preset-${preset.id}.mp3 (${bytes.length} bytes) · ${preset.label}`);
}
