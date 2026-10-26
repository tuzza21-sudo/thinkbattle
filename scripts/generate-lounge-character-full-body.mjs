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
const workCommon = 'Use case: identity-preserve. Turn the supplied portrait of an entirely fictional person into a candid full-length photograph of the same fictional person at work: keep the same face, hairstyle, age, skin tone and general look. The person is caught mid-task and absorbed in their profession, not posing for the camera. The whole figure from head to shoes is visible in a vertical 2:3 frame. Premium editorial documentary photography, realistic natural skin and fabric texture, atmospheric cinematic lighting, 35mm lens, shallow depth of field. The person must not resemble any real person or celebrity. Tasteful and fully clothed. No readable text, no logos, no watermark.';
// Photos for the character detail pages: each character doing their job (node scripts/generate-lounge-character-full-body.mjs --set=work).
const workScenes = {
  jaeseok: { portrait: 'host-witty-v3.webp', file: 'host-witty-work-v2.webp',
    prompt: `${workCommon} He is a film director on a quiet night shoot. He wears the same dark charcoal knit sweater under a relaxed black linen jacket and dark trousers, with the small director's viewfinder on a cord at his neck. He stands on a hushed night street set, holding the viewfinder up to one eye with one hand and pointing off-frame with the other as he frames a shot, absorbed and a little amused. Out-of-focus crew members, a camera on a dolly and warm practical lamps behind him.` },
  ina: { portrait: 'host-seoyeon-v1.webp', file: 'host-seoyeon-work-v1.webp',
    prompt: `${workCommon} She is a book editor reading a manuscript at her favourite neighbourhood cafe. She wears the same soft cream knit top with a light camel cardigan over her shoulders, a long flowing skirt and flat shoes, her long soft waves falling over one shoulder. She sits by a rainy window with a latte and a thick printed manuscript, a pencil in one hand, glancing up from the pages with a small amused smile as if someone off-frame just said something that made her laugh. Warm amber cafe light, droplets on the window, shelves of books out of focus, no readable text anywhere.` },
  auditor: { portrait: 'host-auditor-v3.webp', file: 'host-auditor-work-v1.webp',
    prompt: `${workCommon} He is a semiconductor researcher, very tall at about 188 cm with broad shoulders and a lean athletic build. He wears the same crisp white shirt with the sleeves rolled up, slim dark trousers, a plain unmarked ID badge on a lanyard with no logo and no readable text, and a slim black watch. He stands at a large whiteboard in a bright modern research office in the evening, a marker in one hand, drawing an abstract diagram of connected blocks and arrows with no letters or numbers, and glances back toward the camera with a thoughtful, warm half-smile. Two large monitors with abstract pattern graphics glow behind him.` },
  closer: { portrait: 'host-closer-v4.webp', file: 'host-closer-work-v3.webp',
    prompt: `${workCommon} He is a charismatic veteran negotiator in his early forties, attractive and commanding with a slightly tough edge. He wears the same perfectly tailored dark charcoal suit jacket over a crisp white open-collar shirt with no tie, slim dark trousers and a slim steel watch. He stands beside a long walnut boardroom table at dusk with one hand resting on the back of a leather chair and the other holding a pen, looking toward someone off-frame with a calm, assured, slow half-smile. Floor-to-ceiling windows with a city skyline in warm amber light, a glass of water and a closed folder with no readable text on the table behind him.` },
  trickster: { portrait: 'host-trickster-v3.webp', file: 'host-trickster-work-v3.webp',
    prompt: `${workCommon} He is a handsome, relaxed and witty 35-year-old late-night talk show host, caught mid-show. He wears the same deep forest-green knit polo-collar sweater under an unbuttoned black wool coat, dark slim trousers and polished dark boots, with a thin silver chain at the collar. He sits easily behind a dark wood talk show desk on a warm studio set, leaning back with one arm along the back of the chair and a ceramic mug on the desk, turning toward a guest chair just off-frame with an amused, unhurried grin and one eyebrow slightly raised as he waits for the punchline to land. A deep blue city-skyline backdrop with golden bokeh lights, a warm desk lamp and softly blurred studio cameras and a laughing audience behind him.` },
  diplomat: { portrait: 'host-reporter-v1.webp', file: 'host-reporter-work-v1.webp',
    prompt: `${workCommon} She is a social-affairs newspaper reporter working late in a newsroom. She wears the same ivory blouse and tailored soft-grey blazer with slim dark trousers and low heels, a plain blank press ID badge on a lanyard at her chest, and a slim leather shoulder bag. She leans over a desk reading a printed document with a pen in one hand, a notebook, an open laptop and a paper coffee cup beside her, with an amused, curious expression as if she just spotted something odd in the story. Rows of desks, warm desk lamps and city lights through a tall window softly blurred behind her at night.`,
  },
  lawyer: { portrait: 'host-lawyer-v2.webp', file: 'host-lawyer-work-v1.webp',
    prompt: `${workCommon} He is a private detective investigating a case. He wears the same dark grey wool overcoat over a white open-collar shirt, dark trousers and worn black leather shoes. He stands at a cluttered desk in his office at night, holding a photograph in one hand and a magnifying glass in the other, studying it intently. Behind him a corkboard of photographs connected with red string and no readable text, a green desk lamp, and rain on a window with half-closed blinds.` },
};
const characters = {
  jaeseok: { portrait: 'host-witty-v2.webp', file: 'host-witty-full-v1.webp',
    prompt: `${common} He wears the same beautifully fitted charcoal navy suit, ivory dress shirt, narrow dark tie and white pocket square, with polished brown leather shoes. He stands at ease in a warm hotel lounge with soft lamps and cream sofas, one hand in his trouser pocket and the other mid-gesture as if about to deliver a gentle punchline, with a knowing, friendly smile.` },
  ina: { portrait: 'host-seoyeon-v1.webp', file: 'host-seoyeon-full-v1.webp',
    prompt: `${common} She wears the same soft cream knit top tucked into a long flowing champagne-coloured skirt with a gentle drape that shows her graceful feminine curves, a thin gold necklace and simple low heels, a small leather shoulder bag. She stands under the warm lights of a quiet cafe street at early evening after rain, turned slightly toward the camera with her head tilted and a sweet teasing smile, one hand lightly holding her hair back.` },
  auditor: { portrait: 'host-auditor-v3.webp', file: 'host-auditor-full-v3.webp',
    prompt: `${common} He is very tall, about 188 cm, with long legs, broad shoulders and a lean athletic build, photographed from a slightly low angle so his height shows. He wears the same crisp white open-collar shirt with the sleeves rolled to the forearms, slim dark trousers, a plain unmarked ID badge on a lanyard with no logo and no readable text, a slim black watch and simple leather shoes. He stands in a quiet forest-view lounge at dusk with large windows onto trees and warm lamp light, one hand in his pocket and the other holding a paper coffee cup, relaxed, thoughtful half-smile, looking at the camera.` },
  closer: { portrait: 'host-closer-v1.webp', file: 'host-closer-full-v1.webp',
    prompt: `${common} He wears the same dark navy suit and white open-collar shirt with no tie, a slim steel watch and dark leather shoes. He stands beside a floor-to-ceiling window of a rooftop lounge at dusk with city lights and an amber sky behind him, hands loosely clasped in front, calm and quietly commanding, steady eye contact.` },
  velvet: { portrait: 'host-velvet-v2.webp', file: 'host-velvet-full-v1.webp',
    prompt: `${common} She wears an elegant deep wine-burgundy velvet suit with a tailored blazer and matching wide trousers over a silk camisole, pearl drop earrings, a thin gold necklace, a slim vintage gold wristwatch and refined pointed heels. She stands in a dim late-night hotel bar with deep plum shadows and warm gold bokeh, partly in shadow, poised and composed, one hand resting lightly on the back of a velvet bar chair, with a faint enigmatic half-smile. Mysterious, sophisticated and dignified, not sultry.` },
  lawyer: { portrait: 'host-lawyer-v2.webp', file: 'host-lawyer-full-v2.webp',
    prompt: `${common} He wears the same dark grey wool overcoat over a white open-collar shirt, dark trousers and worn black leather shoes, a small notebook in one hand. He leans against the edge of a scarred wooden desk in a private detective's office at night: a green desk lamp, venetian-blind stripes of light across the wall, rain on the window, a corkboard with blurred photographs and red string behind him with no readable text. He looks toward the camera with a thoughtful, slightly amused half-smile as if he has just spotted the missing piece of a puzzle.` },
  trickster: { portrait: 'host-trickster-v1.webp', file: 'host-trickster-full-v1.webp',
    prompt: `${common} He wears the same mustard-yellow overshirt open over a plain white tee, relaxed dark jeans and white sneakers, holding a paper takeaway coffee cup. He leans casually against a rain-streaked cafe window with warm string lights and a cozy blurred cafe interior, one eyebrow raised and a lopsided mischievous grin, as if he just thought of a joke.` },
};

// Characters added with scripts/new-lounge-character.mjs keep their prompts in scripts/lounge-character-prompts.json
// ({{common}} stands for the shared text above), so no script has to be edited to draw a new character.
const extra = existsSync('scripts/lounge-character-prompts.json') ? JSON.parse(readFileSync('scripts/lounge-character-prompts.json', 'utf8')) : {};
for (const [id, spec] of Object.entries(extra)) {
  if (spec.full && !characters[id]) characters[id] = { portrait: spec.full.portrait, file: spec.full.file, prompt: spec.full.prompt.replaceAll('{{common}}', common) };
  if (spec.work && !workScenes[id]) workScenes[id] = { portrait: spec.work.portrait, file: spec.work.file, prompt: spec.work.prompt.replaceAll('{{common}}', workCommon) };
}
const scenes = options.set === 'work' ? workScenes : characters;
const targets = options.only ? options.only.split(',') : Object.keys(scenes);
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
  const character = scenes[id];
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
