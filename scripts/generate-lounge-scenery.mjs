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
  // The 'embassy' theme id is kept for existing rooms; the place is now the reporter's rooftop rest garden on top of a newspaper building
  // (the old diplomatic reception scene is embassy-reception-v1.webp, kept with the shelved diplomat).
  embassy: {
    file: 'newsroom-rooftop-v1.webp',
    prompt: `${common} A quiet rooftop rest garden on top of a newspaper office building just after the evening deadline, at blue hour: a warm wooden deck with low planters of ornamental grasses and small potted trees, a few wooden benches and a small round table in the foreground softly out of focus with two paper coffee cups and a folded newspaper with no readable text, strings of warm bulb lights overhead, a low glass railing and a wide view over a glowing city skyline and a river, a softly lit office window below with a few desks and monitors glowing, a dusk sky fading from amber to deep blue, a vending machine glowing in the corner, a calm relaxed after-work mood, the centre of the frame open and uncluttered.`,
  },
  // The 'hotel' theme id is kept for existing rooms; the place is now the film director's post-production suite before dawn.
  hotel: {
    file: 'postproduction-suite-v1.webp',
    prompt: `${common} A film post-production editing suite in the hour before dawn: a dim room lit mostly by the cool blue-white glow of two large monitors showing an abstract paused multi-track timeline with no readable text and no recognisable film frame, an editing console with a jog wheel and a keyboard, studio headphones resting on the desk, a half-finished cup of coffee going cold on the desk edge in the foreground softly out of focus, a worn leather sofa behind, shelves with hard drives and film canisters, a small desk lamp casting a warm amber pool of light, a window with blinds showing the first faint blue light of dawn over a city skyline, neatly coiled cables, a soft haze, a moody thriller-director atmosphere, the centre of the frame calm and open.`,
  },
  // The 'forest' theme id is kept for existing rooms; the place is now an old LP jazz bar after midnight.
  forest: {
    file: 'jazz-lp-bar-v1.webp',
    prompt: `${common} An old LP jazz bar after midnight: a warm wood-panelled room with floor-to-ceiling shelves of vinyl records, a vintage turntable with a spinning record on the bar counter in the foreground softly out of focus beside a lowball glass of amber whisky and a small candle, a pair of large vintage speakers, brass pendant lamps with a warm glow, a small low stage with an upright bass and a saxophone on a stand, leather stools along a long wooden bar, framed black-and-white photographs with no readable text, a rain-streaked window with blurred neon lights outside, a calm intimate late-night mood, the centre of the frame open and uncluttered.`,
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
  // 백도하 became a late-night talk show host; the 'theater' theme id is kept for existing rooms (the earlier scene is improv-theater-v1.webp).
  theater: {
    file: 'talkshow-stage-v1.webp',
    prompt: `${common} A late-night talk show set seen from the empty audience side just before the show: a polished dark wooden host desk with a warm brass lamp, a ceramic mug and a small stack of blank cue cards, a guest armchair in deep burgundy leather beside it, a deep blue backdrop with a softly glowing abstract city skyline and golden bokeh lights, a warm spotlight on the desk area and a soft blue wash on the backdrop, studio cameras on pedestals softly out of focus at the sides, tiered rows of empty audience seats in the foreground softly out of focus. Warm, witty, inviting and full of anticipation.`,
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
