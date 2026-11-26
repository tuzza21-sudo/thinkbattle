// Fetches class photos from Wikimedia Commons (2026-11-27, the national-park trip): for each entry of a list, the first
// freely licensed photo (public domain, CC0, CC BY, CC BY-SA) that a search finds, preferring Commons quality images,
// saved as WebP under public/lounge/class/ with its author, licence and file page in a manifest to paste into
// loungeClassImages. An entry may name the exact Commons file instead of a search.
//   node scripts/fetch-lounge-class-photos.mjs scripts/lounge-park-photos.json [--only=yellowstone,old-faithful] [--overwrite]
// Needs Python with Pillow. The list: [{ "id": "yellowstone", "dir": "parks", "query": "Grand Prismatic Spring aerial", "file"?: "File:..." }].
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [listPath] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const option = name => process.argv.find(arg => arg.startsWith(`--${name}`))?.split('=')[1] ?? (process.argv.includes(`--${name}`) ? 'true' : undefined);
if (!listPath) throw new Error('Usage: node scripts/fetch-lounge-class-photos.mjs <list.json> [--only=a,b] [--overwrite]');
const only = option('only')?.split(',');
const list = JSON.parse(readFileSync(listPath, 'utf8')).filter(entry => !only || only.includes(entry.id));
const headers = { 'User-Agent': 'LoungeClassPhotos/1.0 (educational travel class; uses free Commons images with credit)' };
const api = 'https://commons.wikimedia.org/w/api.php';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
// Commons answers 429 to quick bursts: pause between requests and back off when refused.
async function get(url) {
  for (let attempt = 0; ; attempt++) {
    await wait(1500);
    const response = await fetch(url, { headers });
    if (response.status !== 429 || attempt >= 5) return response;
    await wait(15000 * (attempt + 1));
  }
}
const free = license => /^(public domain|pd|cc0|cc by(-sa)? [\d.]+)/i.test(license.trim());
const plain = html => String(html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function candidates(search) {
  const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: search, gsrlimit: '15',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600' });
  const response = await get(`${api}?${params}`);
  if (!response.ok) throw new Error(`Commons ${response.status}`);
  const pages = Object.values((await response.json()).query?.pages ?? {}).sort((a, b) => a.index - b.index);
  return pages.map(page => ({ title: page.title, info: page.imageinfo?.[0] })).filter(item => item.info);
}
async function exact(title) {
  const params = new URLSearchParams({ action: 'query', format: 'json', titles: title, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1600' });
  const response = await get(`${api}?${params}`);
  return Object.values((await response.json()).query?.pages ?? {}).map(page => ({ title: page.title, info: page.imageinfo?.[0] })).filter(item => item.info);
}
const usable = ({ title, info }) => !/\b(map|karte|carte|plan|diagram|black and white|b&w)\b/i.test(title) && info.mime === 'image/jpeg' && info.width >= 1400 && info.width / info.height < 2.1 && info.height / info.width < 1.6
  && free(info.extmetadata?.LicenseShortName?.value ?? '');

const out = listPath.replace(/\.json$/, '.manifest.json');
const manifest = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
for (const entry of list) {
  const dir = join('public', 'lounge', 'class', entry.dir ?? 'parks');
  const output = join(dir, `${entry.id}.webp`);
  if (existsSync(output) && option('overwrite') !== 'true') { console.log(`skip ${entry.id}: exists`); continue; }
  const pool = entry.file ? await exact(entry.file)
    : [...(await candidates(`${entry.query} incategory:"Quality images"`)), ...(await candidates(entry.query))];
  const pick = pool.find(usable);
  if (!pick) { console.log(`MISSING ${entry.id}: no free photo for "${entry.query ?? entry.file}"`); continue; }
  const meta = pick.info.extmetadata ?? {};
  const response = await get(pick.info.thumburl ?? pick.info.url);
  if (!response.ok) { console.log(`MISSING ${entry.id}: download ${response.status}`); continue; }
  mkdirSync(dir, { recursive: true });
  const source = join(tmpdir(), `lounge-class-${entry.id}.jpg`);
  writeFileSync(source, Buffer.from(await response.arrayBuffer()));
  execFileSync('python', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");im.thumbnail((1280,1280));im.save(sys.argv[2],"WEBP",quality=72,method=6)', source, output]);
  rmSync(source, { force: true });
  manifest[entry.id] = { src: `/${output.replaceAll('\\', '/').replace(/^public\//, '')}`, credit: plain(meta.Artist?.value) || 'Unknown', license: plain(meta.LicenseShortName?.value), source: pick.info.descriptionurl, title: pick.title };
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}
`);
  console.log(`saved ${output} · ${pick.title} · ${manifest[entry.id].license} · ${manifest[entry.id].credit}`);
}
console.log(`manifest: ${out}`);
