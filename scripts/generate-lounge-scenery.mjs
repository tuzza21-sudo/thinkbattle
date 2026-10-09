// Generates lounge room scenery (1536x1024 WebP) with the OpenAI image API (paid, one request each).
//   node scripts/generate-lounge-scenery.mjs [--only=embassy] [--overwrite] [--model=gpt-image-2] [--quality=medium]
// Needs OPENAI_API_KEY in .env.local and Python with Pillow (PNG -> WebP).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
const options = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, value = 'true'] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const model = options.model || 'gpt-image-2', quality = options.quality || 'medium';
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required in .env.local');

const common = 'Use case: photorealistic-natural. Asset type: wide 3:2 background photograph for a voice conversation app, an empty, inviting interior with no people. Premium editorial interior photography, warm cinematic lighting, realistic materials, shallow depth of field with the foreground softly out of focus, the centre of the frame calm and uncluttered. No people, no text, no logos, no watermark, no readable signs.';
const scenes = {
  embassy: {
    file: 'embassy-reception-v1.webp',
    prompt: `${common} A refined diplomatic reception lounge at dusk: floor-to-ceiling windows overlooking a wide city river with softly glowing skyline lights and a deep blue-violet sky, a long polished walnut conference table set with white orchids, water glasses and neatly aligned notepads, elegant upholstered chairs, a few softly blurred plain flagpoles with muted silk flags in no recognisable national design, champagne-gold sconces, a pale marble floor with a navy rug. Calm, formal and quietly warm.`,
  },
  lawlibrary: {
    file: 'law-library-v1.webp',
    prompt: `${common} A private law-firm library after hours: tall dark-oak shelves of leather-bound books, a long dark-wood reading table with green banker's lamps glowing, neat stacks of case files and a fountain pen, leather armchairs, a tall window with rain-streaked glass and soft city lights beyond, a rolling library ladder, warm amber light with deep green and walnut tones. Quiet, focused and slightly dramatic.`,
  },
};

const targets = options.only ? options.only.split(',') : Object.keys(scenes);
const folder = join(tmpdir(), 'lounge-scenery'); mkdirSync(folder, { recursive: true });
for (const id of targets) {
  const scene = scenes[id];
  if (!scene) throw new Error(`Unknown scene: ${id}`);
  const output = join('public', 'lounge', scene.file);
  if (existsSync(output) && options.overwrite !== 'true') { console.log(`skip ${id}: ${output} exists (use --overwrite)`); continue; }
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: scene.prompt, size: '1536x1024', quality, n: 1 }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${id}: ${response.status} ${body?.error?.code ?? ''} ${body?.error?.message ?? ''}`.trim());
  const encoded = body?.data?.[0]?.b64_json;
  if (!encoded) throw new Error(`${id}: the response contained no image data`);
  const png = join(folder, `${id}.png`);
  writeFileSync(png, Buffer.from(encoded, 'base64'));
  execFileSync('python', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");im=im.resize((1536,1024),Image.LANCZOS);im.save(sys.argv[2],"WEBP",quality=84,method=6)', png, output]);
  rmSync(png, { force: true });
  console.log(`saved ${output}`);
}
