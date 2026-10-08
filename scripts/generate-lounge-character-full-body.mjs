// Generates full-body photos of the six lounge characters from their existing portraits with the OpenAI image
// edit API (paid, one request each), so the face stays the same person.
//   node scripts/generate-lounge-character-full-body.mjs [--only=velvet] [--overwrite] [--model=gpt-image-2] [--quality=medium]
// Needs OPENAI_API_KEY in .env.local and Python with Pillow (WebP <-> PNG, 768x1152 WebP output).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
const options = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, value = 'true'] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const model = options.model || 'gpt-image-2', quality = options.quality || 'medium';
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required in .env.local');

const common = 'Use case: identity-preserve. Turn the supplied portrait of an entirely fictional person into a full-body standing photograph of the same fictional person: keep the same face, hairstyle, age, skin tone and expression. The whole figure from head to shoes is visible in a vertical 2:3 frame, with some space above the head and below the feet. Natural, relaxed adult pose. Premium editorial lifestyle photography, realistic natural skin and fabric texture, soft cinematic lighting, 50mm lens, shallow depth of field. The person must not resemble any real person or celebrity. Tasteful and fully clothed. No text, logo, watermark, microphone or headset.';
const characters = {
  jaeseok: { portrait: 'host-witty-v2.webp', file: 'host-witty-full-v1.webp',
    prompt: `${common} He wears the same beautifully fitted charcoal navy suit, ivory dress shirt, narrow dark tie and white pocket square, with polished brown leather shoes. He stands at ease in a warm hotel lounge with soft lamps and cream sofas, one hand in his trouser pocket and the other mid-gesture as if about to deliver a gentle punchline, with a knowing, friendly smile.` },
  ina: { portrait: 'host-empathetic-v1.webp', file: 'host-empathetic-full-v1.webp',
    prompt: `${common} She wears the same soft cream knit cardigan over a pale top, light beige wide-leg trousers and simple flat shoes, holding a closed hardcover book against her side. She stands on a quiet seaside terrace at golden hour with the sea softly blurred behind her, turned slightly toward the camera with a calm, welcoming, attentive smile.` },
  auditor: { portrait: 'host-auditor-v1.webp', file: 'host-auditor-full-v1.webp',
    prompt: `${common} He wears the same charcoal fine-knit sweater over a crisp white collared shirt, dark grey tailored trousers and black leather shoes, with thin rimless glasses, holding a folded document at his side. He stands upright in front of tall dark bookshelves in a quiet study with cool, even light, a level, slightly skeptical gaze and the faintest dry half-smile.` },
  closer: { portrait: 'host-closer-v1.webp', file: 'host-closer-full-v1.webp',
    prompt: `${common} He wears the same dark navy suit and white open-collar shirt with no tie, a slim steel watch and dark leather shoes. He stands beside a floor-to-ceiling window of a rooftop lounge at dusk with city lights and an amber sky behind him, hands loosely clasped in front, calm and quietly commanding, steady eye contact.` },
  velvet: { portrait: 'host-velvet-v2.webp', file: 'host-velvet-full-v1.webp',
    prompt: `${common} She wears an elegant deep wine-burgundy velvet suit with a tailored blazer and matching wide trousers over a silk camisole, pearl drop earrings, a thin gold necklace, a slim vintage gold wristwatch and refined pointed heels. She stands in a dim late-night hotel bar with deep plum shadows and warm gold bokeh, partly in shadow, poised and composed, one hand resting lightly on the back of a velvet bar chair, with a faint enigmatic half-smile. Mysterious, sophisticated and dignified, not sultry.` },
  trickster: { portrait: 'host-trickster-v1.webp', file: 'host-trickster-full-v1.webp',
    prompt: `${common} He wears the same mustard-yellow overshirt open over a plain white tee, relaxed dark jeans and white sneakers, holding a paper takeaway coffee cup. He leans casually against a rain-streaked cafe window with warm string lights and a cozy blurred cafe interior, one eyebrow raised and a lopsided mischievous grin, as if he just thought of a joke.` },
};

const targets = options.only ? options.only.split(',') : Object.keys(characters);
const folder = join(tmpdir(), 'lounge-character-full-body'); mkdirSync(folder, { recursive: true });
const python = (code, ...args) => execFileSync('python', ['-c', code, ...args]);
async function edit(character, fidelity) {
  const form = new FormData();
  const source = join(folder, `${character.file}.source.png`);
  python('import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],"PNG")', join('public', 'lounge', character.portrait), source);
  form.append('model', model); form.append('prompt', character.prompt); form.append('size', '1024x1536'); form.append('quality', quality); form.append('n', '1');
  if (fidelity) form.append('input_fidelity', 'high');
  form.append('image', new Blob([readFileSync(source)], { type: 'image/png' }), 'portrait.png');
  const response = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  rmSync(source, { force: true });
  return { response, body: await response.json().catch(() => null) };
}
for (const id of targets) {
  const character = characters[id];
  if (!character) throw new Error(`Unknown character: ${id}`);
  const output = join('public', 'lounge', character.file);
  if (existsSync(output) && options.overwrite !== 'true') { console.log(`skip ${id}: ${output} exists (use --overwrite)`); continue; }
  let { response, body } = await edit(character, true);
  // Models without the high-fidelity option reject it; the prompt alone then keeps the face.
  if (!response.ok && /input_fidelity/.test(body?.error?.message ?? '')) ({ response, body } = await edit(character, false));
  if (!response.ok) throw new Error(`${id}: ${response.status} ${body?.error?.code ?? ''} ${body?.error?.message ?? ''}`.trim());
  const encoded = body?.data?.[0]?.b64_json;
  if (!encoded) throw new Error(`${id}: the response contained no image data`);
  const png = join(folder, `${id}.png`);
  writeFileSync(png, Buffer.from(encoded, 'base64'));
  python('import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");im=im.resize((768,1152),Image.LANCZOS);im.save(sys.argv[2],"WEBP",quality=84,method=6)', png, output);
  rmSync(png, { force: true });
  console.log(`saved ${output}`);
}
