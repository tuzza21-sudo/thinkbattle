// Generates the four one-to-one character portraits with the OpenAI image API (paid, one request each).
//   node scripts/generate-lounge-character-portraits.mjs [--only=velvet] [--overwrite] [--model=gpt-image-2] [--quality=medium]
// Needs OPENAI_API_KEY in .env.local and Python with Pillow (PNG -> 512x512 WebP).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
const options = Object.fromEntries(process.argv.slice(2).map(arg => { const [key, value = 'true'] = arg.replace(/^--/, '').split('='); return [key, value]; }));
const model = options.model || 'gpt-image-2', quality = options.quality || 'medium';
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required in .env.local');

const common = 'Use case: photorealistic-natural. Asset type: square profile photo for a fictional AI lounge conversation character. The person is entirely fictional and must not resemble any real person or celebrity. Natural skin texture, realistic lighting, shoulders-up framing with the face centred and filling roughly 60% of the frame, sharp focus on the eyes, soft out-of-focus background, no text, no logos, no watermark, no hands in frame. Tasteful and professional styling.';
const portraits = {
  auditor: {
    file: 'host-auditor-v1.webp',
    prompt: `${common} A fictional Korean man in his late thirties, clean-shaven, short neat dark hair, thin rimless glasses, wearing a charcoal fine-knit sweater over a crisp white collar. Calm, level, slightly skeptical gaze with the faintest dry half-smile, as if weighing an argument. Background: a softly blurred study with bookshelves in cool grey-blue tones. Cool, even, neutral lighting.`,
  },
  closer: {
    file: 'host-closer-v1.webp',
    prompt: `${common} A fictional Korean man in his mid forties with short dark hair graying at the temples, a composed commanding presence, wearing a perfectly tailored dark navy suit, white shirt and no tie, a slim steel watch just visible. Steady direct eye contact and a controlled, confident hint of a smile, like a veteran negotiator who never needs to raise his voice. Background: a softly blurred glass-walled boardroom at dusk in warm amber and beige tones. Warm directional key light.`,
  },
  velvet: {
    file: 'host-velvet-v2.webp',
    prompt: `${common} A strikingly beautiful fictional Korean woman in her early thirties with refined, balanced features, high cheekbones, luminous smooth skin with a soft natural glow, large dark almond-shaped eyes with long lashes, elegantly arched brows, and full lips in a deep burgundy-rose tint. Glossy, sleek dark hair in a polished side-parted waist-to-shoulder-length style with a subtle shine, small pearl-and-gold drop earrings, wearing an elegant dark plum velvet blazer with a slim neckline and a delicate gold necklace. Self-assured, poised, direct gaze with a slight knowing half-smile and one eyebrow barely raised: captivating, dignified and hard to impress. Background: a dimly lit upscale lounge with soft warm bokeh in deep plum and amber tones. Soft, flattering, cinematic but natural lighting with a gentle rim light on the hair. Elegant, magazine-portrait quality, tasteful and not provocative.`,
  },
  trickster: {
    file: 'host-trickster-v1.webp',
    prompt: `${common} A fictional Korean man in his late twenties with tousled dark hair, a quick mischievous grin with one corner of the mouth higher than the other, bright playful eyes with a raised eyebrow, wearing a mustard-yellow overshirt over a plain white tee. Looks like he just thought of the perfect comeback. Background: softly blurred colourful café lights in warm yellow and teal. Bright, lively, natural daylight.`,
  },
};

const targets = options.only ? [options.only] : Object.keys(portraits);
const folder = join(tmpdir(), 'lounge-character-portraits'); mkdirSync(folder, { recursive: true });
for (const id of targets) {
  const portrait = portraits[id];
  if (!portrait) throw new Error(`Unknown character: ${id}`);
  const output = join('public', 'lounge', portrait.file);
  if (existsSync(output) && options.overwrite !== 'true') { console.log(`skip ${id}: ${output} exists (use --overwrite)`); continue; }
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: portrait.prompt, size: '1024x1024', quality, n: 1 }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${id}: ${response.status} ${body?.error?.code ?? ''} ${body?.error?.message ?? ''}`.trim());
  const encoded = body?.data?.[0]?.b64_json;
  if (!encoded) throw new Error(`${id}: the response contained no image data`);
  const png = join(folder, `${id}.png`);
  writeFileSync(png, Buffer.from(encoded, 'base64'));
  execFileSync('python', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");im=im.resize((512,512),Image.LANCZOS);im.save(sys.argv[2],"WEBP",quality=86,method=6)', png, output]);
  rmSync(png, { force: true });
  console.log(`saved ${output}`);
}
