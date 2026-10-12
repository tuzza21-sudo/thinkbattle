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
  // The 'lawlibrary' theme id is kept for existing rooms; the place is now the private detective's office.
  lawlibrary: {
    file: 'detective-office-v1.webp',
    prompt: `${common} A private detective's office late at night: a scarred dark-wood desk with a green banker's lamp glowing, an open notebook, a magnifying glass and a coffee mug, a corkboard on the wall with blurred photographs, pinned notes and red string with no readable text, venetian blinds with stripes of amber and blue city light across the room, a tall rain-streaked window with a neon-lit street beyond, a coat on a wooden hat stand, a worn leather chair and filing cabinets. Warm amber light with deep teal shadows. Quiet, atmospheric and full of mystery.`,
  },
  boardroom: {
    file: 'boardroom-v1.webp',
    prompt: `${common} A senior executive boardroom on a high floor at blue hour: a long dark walnut table with a thin brass inlay, leather executive chairs, glass water carafes, blank leather folios and neatly placed pens, floor-to-ceiling windows with a deep blue city skyline and a few glowing towers, a dark wall panel with a switched-off wall display, recessed warm ceiling lights reflecting on the polished table, a charcoal carpet and a slim credenza with a single orchid. Quiet, weighty and calm, the feeling of a room where long negotiations end well.`,
  },
  cocktailbar: {
    file: 'cocktail-bar-v1.webp',
    prompt: `${common} An upscale cocktail bar seen from a seat at the bar counter. In the foreground on the polished dark stone bar top, softly out of focus, two beautifully garnished cocktails: a coupe glass with a pale pink drink and a citrus twist, and a lowball glass with one large clear ice cube and amber whisky, a long bar spoon and a small dish of olives. Behind the counter an illuminated back bar with glass shelves of bottles whose labels are blank, brass fittings, a mirror reflecting warm lights, deep burgundy leather stools, amber and wine-red glow with deep shadows. Intimate, elegant and a little mysterious.`,
  },
  theater: {
    file: 'improv-theater-v1.webp',
    prompt: `${common} A small black-box improv theatre just before a show: a low empty wooden stage with a scuffed floor lit by one warm spotlight and a soft blue wash, a few mismatched props on the stage (a bentwood chair, a trench coat on a stand, a battered suitcase, a rolled-up rug), a deep burgundy curtain at the back, a handful of rows of worn red velvet seats in the foreground softly out of focus, string lights along the side wall. Playful, warm and full of possibility.`,
  },
};

const targets =options.only ? options.only.split(',') : Object.keys(scenes);
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
