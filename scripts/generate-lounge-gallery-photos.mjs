// Generates the gallery photos on the character pages: two scenes from each lounge character's own day, drawn from
// their portrait with the OpenAI image edit API (paid, one request each) so the face stays the same person.
//   node scripts/generate-lounge-gallery-photos.mjs [--only=auditor,ina] [--overwrite] [--model=gpt-image-2.5-sunburst] [--quality=low]
// Needs OPENAI_API_KEY in .env.local and Python with Pillow. Writes public/lounge/gallery/<id>-<n>.webp (768x1152);
// the captions shown under them are in src/lib/loungeCharacters.ts (gallery).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
const options = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, value = 'true'] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const model = options.model || 'gpt-image-2.5-sunburst', quality = options.quality || 'low';
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required in .env.local');

const common = 'Use case: identity-preserve. A candid photo from the everyday life of the entirely fictional person in the supplied portrait, as if posted on their own social feed: keep the same face, hairstyle, age, skin tone and general look. Natural, unposed moment, vertical 2:3 frame. Realistic lifestyle photography, natural skin and fabric texture, soft natural light, shallow depth of field. The person must not resemble any real person or celebrity. Tasteful and fully clothed. No readable text, no logos, no watermark.';
const scenes = {
  jaeseok: { portrait: 'host-witty-v3.webp', shots: [
    `${common} He sits alone in the back row of an empty old cinema late at night, a paper cup of coffee in one hand and a dog-eared script on his knee, watching the screen glow with a faint amused smile. Dark charcoal knit, warm projector light cutting through dust.`,
    `${common} Early morning at a small street-food stall after an all-night shoot, he eats a bowl of hot noodle soup on a plastic stool, his dark jacket over the chair, tired but laughing at something off-frame. Steam, soft blue dawn light.`,
  ] },
  ina: { portrait: 'host-seoyeon-v1.webp', shots: [
    `${common} A lazy Sunday morning in her bright apartment, she sits cross-legged on the sofa in a soft cream knit with a mug of tea and an open paperback, a cat curled beside her, smiling at the camera as if caught reading. Sunlight through linen curtains, plants and stacked books.`,
    `${common} She browses the shelves of a cozy second-hand bookshop in the evening, pulling out an old book and glancing back over her shoulder with a teasing smile, her long soft waves over a camel cardigan. Warm lamp light, rows of worn spines without readable titles.`,
  ] },
  auditor: { portrait: 'host-auditor-v3.webp', shots: [
    `${common} He is very tall with broad shoulders and a lean athletic build. A weekend evening in his own modern kitchen with a view of a river at dusk, he cooks a French dish in a cast-iron pan, sleeves of a navy knit pushed up, glancing at the camera with a warm, relaxed half-smile. Thin metal-frame glasses, warm pendant lights, fresh herbs on the counter.`,
    `${common} He is very tall with a lean athletic build. Just after an early-morning run along a riverside path, he stands in a black running jacket and shorts with a water bottle, slightly out of breath and smiling, glasses off and hanging at his collar. Soft golden sunrise light over the water and a bridge in the distance.`,
  ] },
  closer: { portrait: 'host-closer-v4.webp', shots: [
    `${common} Late at night he sits alone at the counter of a quiet whisky bar with his dark suit jacket off and his white shirt sleeves rolled, a glass of whisky and a closed folder beside him, looking down with a rare tired half-smile. Amber backlit bottles, deep shadows.`,
    `${common} A Sunday morning on a rooftop terrace, he reads a newspaper with no readable text in a relaxed dark knit and trousers, a cup of black coffee on a small table, looking up at the camera with a calm, assured look. Soft morning city light, potted olive trees.`,
  ] },
  velvet: { portrait: 'host-velvet-v7.webp', shots: [
    `${common} She stands alone in a dim private gallery after closing, studying a large abstract painting with her back half-turned, a glass of red wine in one hand, glancing at the camera over her shoulder with an enigmatic half-smile. Burgundy satin shirt, black blazer, long black hair with wine-coloured ends, a single spotlight.`,
    `${common} Late at night on the balcony of a hotel suite overlooking city lights, she leans on the railing in a black silk robe-style coat over her clothes, the stopped gold watch on her wrist, looking out into the night, poised and mysterious. Cool blue night with warm interior light behind her.`,
  ] },
  trickster: { portrait: 'host-trickster-v3.webp', shots: [
    `${common} After the show at a late-night pojangmacha tent, he sits with a plastic cup and a plate of snacks, leaning back in a dark coat over a green knit, laughing hard at his own joke with his eyes crinkled. Warm orange tent light, steam, blurred city street outside.`,
    `${common} A quiet afternoon in his small messy apartment, he lies on a worn sofa holding a notebook above his face, scribbling a joke with a pen in his mouth, one eyebrow raised as he notices the camera. Soft window light, a guitar and stacked records in the background.`,
  ] },
  diplomat: { portrait: 'host-reporter-v1.webp', shots: [
    `${common} Off duty on a weekend afternoon, she rides a bicycle slowly along a tree-lined riverside path in a light ivory blouse and jeans, her long dark-brown waves blowing, laughing toward the camera. Soft spring sunlight and blossoms.`,
    `${common} Late at night she sits on the floor of her apartment with her back against the sofa, a laptop on her knees and a can of beer beside her, glasses pushed up into her hair, smirking at the screen as if she just found the perfect sentence. Warm desk lamp, city lights through the window.`,
  ] },
  lawyer: { portrait: 'host-lawyer-v2.webp', shots: [
    `${common} Early morning at an old neighbourhood diner, he sits by the rain-streaked window in his dark grey overcoat with a cup of black coffee and a small notebook, looking out at the street with a thoughtful half-smile. Muted grey-blue light, steam from the cup.`,
    `${common} A rare day off by a quiet harbour, he feeds a stray cat on a stone pier, crouching in a worn leather jacket and white shirt, the cat rubbing against his hand, a gentle smile he rarely shows. Overcast soft light, fishing boats in the distance.`,
  ] },
  guide: { portrait: 'host-guide-v1.webp', shots: [
    `${common} High in the Dolomites in early autumn, he stands on a rocky trail in a technical hiking jacket with a backpack and trekking poles, turning back toward the camera with a teasing grin as if daring you to keep up. Jagged pale peaks and golden larches behind him, crisp clear light.`,
    `${common} An evening espresso at a tiny counter bar in Florence, he leans on the marble counter in a light-blue shirt with the sleeves rolled, holding a small espresso cup and raising it toward the camera with a mischievous half-smile. Warm golden light, old stone and wooden shelves.`,
  ] },
};

const targets = options.only ? options.only.split(',') : Object.keys(scenes);
const folder = join(tmpdir(), 'lounge-gallery-photos'); mkdirSync(folder, { recursive: true });
mkdirSync(join('public', 'lounge', 'gallery'), { recursive: true });
const python = (code, ...args) => execFileSync('python', ['-c', code, ...args]);
async function edit(portrait, prompt, file, fidelity) {
  const form = new FormData();
  const source = join(folder, `${file}.source.png`);
  python('import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],"PNG")', join('public', 'lounge', portrait), source);
  form.append('model', model); form.append('prompt', prompt); form.append('size', '1024x1536'); form.append('quality', quality); form.append('n', '1');
  if (fidelity) form.append('input_fidelity', 'high');
  form.append('image', new Blob([readFileSync(source)], { type: 'image/png' }), 'portrait.png');
  const response = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  rmSync(source, { force: true });
  return { response, body: await response.json().catch(() => null) };
}
async function draw(id, index) {
  const { portrait, shots } = scenes[id];
  const file = `${id}-${index + 1}.webp`, output = join('public', 'lounge', 'gallery', file);
  if (existsSync(output) && options.overwrite !== 'true') { console.log(`skip ${file}: exists (use --overwrite)`); return; }
  let { response, body } = await edit(portrait, shots[index], file, true);
  // Models without the high-fidelity option reject it; the prompt alone then keeps the face.
  if (!response.ok && /input_fidelity/.test(body?.error?.message ?? '')) ({ response, body } = await edit(portrait, shots[index], file, false));
  if (!response.ok) throw new Error(`${file}: ${response.status} ${body?.error?.code ?? ''} ${body?.error?.message ?? ''}`.trim());
  const encoded = body?.data?.[0]?.b64_json;
  if (!encoded) throw new Error(`${file}: the response contained no image data`);
  const png = join(folder, `${file}.png`);
  writeFileSync(png, Buffer.from(encoded, 'base64'));
  python('import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");im=im.resize((768,1152),Image.LANCZOS);im.save(sys.argv[2],"WEBP",quality=82,method=6)', png, output);
  rmSync(png, { force: true });
  console.log(`saved ${output}`);
}
for (const id of targets) if (!scenes[id]) throw new Error(`Unknown character: ${id}`);
// Three at a time; one that fails is reported and the rest go on.
const jobs = targets.flatMap(id => scenes[id].shots.map((_, index) => () => draw(id, index)));
const failures = [];
await Promise.all(Array.from({ length: 3 }, async () => { for (let job = jobs.shift(); job; job = jobs.shift()) await job().catch(error => { failures.push(error.message); console.error(error.message); }); }));
if (failures.length) { console.error(`${failures.length} failed`); process.exit(1); }
