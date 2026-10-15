import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const { seoFor } = loadTs(fileURLToPath(new URL('../src/lib/seo.ts', import.meta.url)));
const { loungeCharacters } = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the sitemap lists the lounge home, every character page and the legal pages', () => {
  const sitemap = read('public/sitemap.xml');
  for (const path of ['/lounge', '/terms', '/privacy', ...loungeCharacters.map(character => `/lounge/characters/${character.id}`)]) {
    assert.ok(sitemap.includes(`<loc>https://saseok.kr${path}</loc>`), `${path} is in the sitemap`);
    assert.equal(seoFor(path)?.noindex, false, `${path} can be indexed`);
  }
});

test('every character has its own title and a description of search length', () => {
  const titles = new Set();
  for (const character of loungeCharacters) {
    const seo = seoFor(`/lounge/characters/${character.id}`);
    assert.ok(seo.title.includes(character.name) && seo.title.includes('사석'));
    assert.ok(seo.description.length <= 150 && seo.description.includes('AI'), 'description is short and says it is AI');
    titles.add(seo.title);
  }
  assert.equal(titles.size, loungeCharacters.length, 'titles are distinct');
});

test('rooms, places and staff screens are kept out of search, and the home redirect shares the lounge address', () => {
  for (const path of ['/lounge/lounge-abc', '/lounge/spaces/hotel-lounge', '/lounge/characters/unknown', '/super-admin', '/admin', '/battle/new', '/history']) {
    assert.equal(seoFor(path)?.noindex, true, `${path} is noindex`);
  }
  assert.equal(seoFor('/').path, '/lounge');
  assert.equal(seoFor('/lounge/').path, '/lounge');
  assert.equal(seoFor('/debate'), null, 'the other service keeps its own titles');
});

test('robots.txt blocks the private paths and points to the sitemap; vercel.json adds the header for them', () => {
  const robots = read('public/robots.txt');
  for (const path of ['/api/', '/super-admin', '/admin', '/lounge/spaces', '/lounge/lounge-']) assert.ok(robots.includes(`Disallow: ${path}`), path);
  assert.ok(robots.includes('Sitemap: https://saseok.kr/sitemap.xml'));
  assert.ok(!/Disallow: \/lounge\s*$/m.test(robots) && !/Disallow: \/\s*$/m.test(robots), 'the public pages are not blocked');
  const header = JSON.parse(read('vercel.json')).headers.find(item => item.headers.some(entry => entry.key === 'X-Robots-Tag'));
  assert.ok(header && /super-admin/.test(header.source) && /lounge\/lounge-/.test(header.source));
});

test('index.html carries structured data for the organisation, site and app', () => {
  const html = read('index.html');
  const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  const graph = JSON.parse(match[1])['@graph'];
  assert.deepEqual(graph.map(item => item['@type']).sort(), ['Organization', 'WebApplication', 'WebSite']);
});
