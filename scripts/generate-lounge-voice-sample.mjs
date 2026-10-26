// Makes the lobby voice sample of a character: its sampleText spoken with its ElevenLabs voice (the voice every character
// speaks with), saved as an mp3 in public/lounge. It also measures how loud the voice is, to set its loudness.
//   node scripts/generate-lounge-voice-sample.mjs <host id> <file name>      e.g.  ina host-seoyeon-v1.mp3
// Needs ELEVENLABS_API_KEY in .env.local. The file name goes into the character's voiceSample (lounge.ts), with ?v=1.
import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';
dotenv.config({ path: '.env.local', quiet: true });

const [hostId, file] = process.argv.slice(2);
if (!hostId || !file?.endsWith('.mp3')) throw new Error('Usage: node scripts/generate-lounge-voice-sample.mjs <host id> <file.mp3>');
if (!process.env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY is required in .env.local');
const lounge = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
const host = lounge.getLoungeHost(hostId);
const voice = lounge.loungeEngineVoice('eleven', hostId, process.env.LOUNGE_VOICE_IDS);
if (!host?.sampleText || !voice) throw new Error(`${hostId}: no sampleText or no ElevenLabs voice`);

const speak = async format => {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=${format}`, {
    method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(lounge.loungeElevenSpeechRequest(host.sampleText)),
  });
  if (!response.ok) throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return Buffer.from(await response.arrayBuffer());
};
const mp3 = await speak('mp3_44100_128');
writeFileSync(new URL(`../public/lounge/${file}`, import.meta.url), mp3);
console.log(`saved public/lounge/${file} (${mp3.length} bytes) for ${host.name}: "${host.sampleText}"`);

// The level the listener hears, in dBFS (RMS of the speech), to compare with the other characters' (about -19 to -20).
const pcm = await speak('pcm_24000');
let sum = 0, count = 0;
for (let i = 0; i + 1 < pcm.length; i += 2) { const value = pcm.readInt16LE(i) / 32768; if (Math.abs(value) > 0.01) { sum += value * value; count++; } }
const level = 10 * Math.log10(sum / Math.max(1, count));
console.log(`level ${level.toFixed(1)} dBFS; to reach -19.5 dBFS the loudness is ${Math.pow(10, (-19.5 - level) / 20).toFixed(2)}x (set it in loungeEngineLoudness only if it is not about 1)`);
