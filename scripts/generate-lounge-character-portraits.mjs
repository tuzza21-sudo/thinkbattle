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
  jaeseok: {
    // 윤태오 (talk show host) was replaced by 임시우, a film director; the id stays so rooms and links keep working.
    file: 'host-witty-v3.webp',
    prompt: `${common} A fictional Korean man in his late thirties with an artistic, cinematic presence: a tall slim frame, tousled dark wavy hair with a few silver strands at the temples, light stubble, a strong straight nose and expressive dark eyes with a warm, slightly wistful half-smile, as if he is quietly framing a scene in his mind. He wears a dark charcoal knit sweater under a relaxed black linen jacket, and a small director's viewfinder hangs on a cord at his neck. Background: a softly blurred warm hotel lounge with amber lamps and dark wood. Warm cinematic lighting with gentle contrast.`,
  },
  auditor: {
    // The economics commentator was replaced by a semiconductor researcher; the id stays so rooms and links keep working.
    file: 'host-auditor-v3.webp',
    prompt: `${common} A fictional Korean man in his mid thirties, strikingly handsome in a refined, wholesome way, the kind of man everyone would call the ideal catch: tall and broad-shouldered with a lean athletic build, a clean defined jawline, high straight nose bridge, smooth well-groomed skin, neatly styled black hair with a soft natural wave, thin gold-rimmed glasses, warm deep eyes and a gentle, confident half-smile. Calm, intelligent, kind and quietly magnetic. He wears a crisp white shirt with the collar open and sleeves rolled up, a plain unmarked ID badge on a lanyard at his neck with no logo and no readable text. Background: a softly blurred forest-view lounge at dusk with warm lamp light and green foliage. Soft warm key light with gentle contrast.`,
  },
  closer: {
    // Redrawn again (v4) as a charismatic, attractive man in his early forties; v2 read as a gangster and v3 as too old.
    file: 'host-closer-v4.webp',
    prompt: `${common} A fictional Korean man in his early forties with magnetic charisma and a strikingly attractive, masculine face: a sharp defined jawline, a faint neat shadow of stubble, a straight strong nose, intense deep dark eyes under confident straight brows that hold the gaze, thick black hair with no grey, styled back with a slight natural wave, healthy clear skin and no wrinkles beyond faint smile lines. Tall with broad shoulders and a lean athletic build. He wears a perfectly tailored dark charcoal suit jacket over a crisp white shirt open at the collar with no tie, a slim steel watch just visible. A calm, assured gaze with a slow, knowing half-smile, a man whose quiet presence fills the room: charismatic, magnetic and attractive, polished and a little dangerous in charm only, never threatening and nothing like a gangster. Background: a softly blurred glass-walled boardroom at dusk in warm amber and deep shadow. Warm directional key light with a subtle rim light, flattering and cinematic.`,
  },
  velvet: {
    file: 'host-velvet-v2.webp',
    prompt: `${common} A strikingly beautiful fictional Korean woman in her early thirties with refined, balanced features, high cheekbones, luminous smooth skin with a soft natural glow, large dark almond-shaped eyes with long lashes, elegantly arched brows, and full lips in a deep burgundy-rose tint. Glossy, sleek dark hair in a polished side-parted waist-to-shoulder-length style with a subtle shine, small pearl-and-gold drop earrings, wearing an elegant dark plum velvet blazer with a slim neckline and a delicate gold necklace. Self-assured, poised, direct gaze with a slight knowing half-smile and one eyebrow barely raised: captivating, dignified and hard to impress. Background: a dimly lit upscale lounge with soft warm bokeh in deep plum and amber tones. Soft, flattering, cinematic but natural lighting with a gentle rim light on the hair. Elegant, magazine-portrait quality, tasteful and not provocative.`,
  },
  lawyer: {
    // The lawyer became a former police detective turned private detective; the id stays so rooms and links keep working.
    file: 'host-lawyer-v2.webp',
    prompt: `${common} A fictional Korean man in his mid forties with short dark hair, slightly untidy and graying at the temples, light stubble, lean angular features and sharp, tired but alert dark eyes, wearing a dark grey wool overcoat over a white shirt with an open collar and no tie. Observant and calm with the faintest dry half-smile, as if he has just noticed the detail everyone else missed. Background: a softly blurred private detective's office at night, warm desk lamp glow and thin stripes of light through window blinds, a corkboard in the dark behind him with no readable text. Moody low-key lighting with a warm key light on the face.`,
  },
  diplomat: {
    // 윤지안, the social-affairs reporter, took the diplomat's slot; the id stays so rooms and links keep working.
    file: 'host-reporter-v1.webp',
    prompt: `${common} A strikingly beautiful fictional Korean woman aged thirty-two with an intelligent, bright and lively presence: refined balanced features, luminous clear skin with a soft natural glow, large dark almond-shaped eyes with a lively spark, softly arched brows, and a hint of a playful smile at one corner of her lips. Her chin is lifted a little, a poised and slightly aloof first impression that looks about to break into a laugh. Glossy dark chestnut hair, long with soft layers and a natural side part falling past the shoulders, small delicate stud earrings, wearing a crisp ivory blouse under a tailored soft-grey blazer. Confident, witty and warm underneath: captivating but approachable. Background: a riverside evening lounge with floor-to-ceiling windows and a softly glowing city skyline in warm amber and blue dusk bokeh. Soft, flattering natural lighting with a gentle rim light on the hair. Elegant magazine-portrait quality, tasteful and not provocative.`,
  },
  ina: {
    // 한이나, the interviewer, was replaced by 윤서연, a book editor on her first blind date since her divorce; the id stays so rooms and links keep working.
    file: 'host-seoyeon-v1.webp',
    prompt: `${common} A strikingly beautiful fictional Korean woman aged thirty-six with an elegant, feminine and gentle beauty, the kind of woman a lonely man would not forget after one smile: refined balanced features, a soft oval face, luminous clear skin with a natural glow, large warm dark-brown eyes with a faint playful spark, softly arched brows, and a sweet smile with a hint of mischief at one corner of her lips that makes her look girlish and bright. Her head is tilted very slightly, as if she is teasing him with her eyes. Natural long dark-brown hair in soft loose waves falling past the shoulders with a few strands framing her face, small pearl stud earrings, a delicate thin necklace, wearing a soft cream knit top with a gently rounded neckline. Graceful, warm and quietly alluring: approachable but just out of reach. Background: a cozy cafe window on a rainy afternoon with warm amber bokeh and soft droplets on the glass. Soft, flattering natural window light with a gentle glow on the hair. Elegant magazine-portrait quality, tasteful and not provocative.`,
  },
  'diplomat-cute': {
    // A second, cuter and livelier take on 윤지안 to choose from (the same slot as diplomat: pick one file name for host-reporter-v1.webp).
    file: 'host-reporter-v2.webp',
    prompt: `${common} A fictional Korean woman in her early thirties, clearly an adult, with a cute, baby-faced and cheerful look: a soft round face with full apple cheeks, big bright sparkling eyes with gentle double eyelids, a small button nose, and a wide happy smile showing a hint of teeth with faint dimples. Dewy glowing skin with neat peach-pink makeup, soft airy see-through bangs and chestnut-brown medium-length hair with a bouncy natural wave just past the shoulders, small gold hoop earrings. She wears a crisp white shirt under a light pastel-cream blazer. Her whole vibe is lively, playful, charming and approachable, with a mischievous sparkle in her eyes as if she just thought of a joke; polished and glamorous in a healthy, natural, tasteful way. Background: a bright golden-hour riverside lounge with warm bokeh and a hint of the city skyline. Soft flattering light, magazine-portrait quality, wholesome, tasteful and not provocative.`,
  },
  trickster: {
    // Redrawn again (v3) when 백도하 became a 35-year-old stand-up comedian turned late-night talk show host.
    file: 'host-trickster-v3.webp',
    prompt: `${common} A fictional Korean man aged thirty-five who is strikingly handsome in a relaxed, charming and witty way, the kind of man women find irresistible: refined balanced features, a defined jawline with a trace of light stubble, a straight nose, clear healthy skin, long-lashed dark eyes with a warm, amused sparkle, softly tousled dark hair with a natural side-swept fringe, and a confident easygoing grin that is a little crooked, with one eyebrow slightly raised as if he just delivered the perfect line and is waiting for your reaction. Effortless, unhurried and magnetic, a man who is comfortable in his own skin. He wears a deep forest-green knit polo-collar sweater under an unbuttoned black wool coat, a thin silver chain just visible at the collar. Background: a softly blurred late-night talk show set with a warm desk lamp glow, deep blue backdrop and golden bokeh lights. Soft cinematic key light with a gentle rim light on the hair, polished and magazine-quality but natural.`,
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
