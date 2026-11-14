import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const { seoFor, seoJsonLd } = loadTs(fileURLToPath(new URL('../src/lib/seo.ts', import.meta.url)));
const { seoGuides, seoCharacterPortrait } = loadTs(fileURLToPath(new URL('../src/lib/seoContent.ts', import.meta.url)));
const { buildSitemap, buildLlmsTxt, buildLlmsFullTxt, renderPage, pagesToWrite, fileFor } = await import('./seo-build.mjs');
const { loungeCharacters } = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the sitemap lists the lounge home, the keyword pages, every character page and the legal pages', () => {
  const sitemap = buildSitemap('2026-11-14');
  for (const path of ['/lounge', '/terms', '/privacy', '/account-deletion', ...seoGuides.map(guide => guide.path), ...loungeCharacters.map(character => `/lounge/characters/${character.id}`)]) {
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
  const header = JSON.parse(read('vercel.json')).headers.find(item => /super-admin/.test(item.source) && item.headers.some(entry => entry.key === 'X-Robots-Tag'));
  assert.ok(header && /super-admin/.test(header.source) && /lounge\/lounge-/.test(header.source));
});

test('index.html carries structured data for the organisation, site and app', () => {
  const html = read('index.html');
  const match = html.match(/<script type="application\/ld\+json" id="seo-jsonld">(.*?)<\/script>/s);
  const graph = JSON.parse(match[1])['@graph'];
  assert.deepEqual(graph.map(item => item['@type']).sort(), ['Organization', 'WebSite']);
  for (const marker of ['<!--seo:start-->', '<!--seo:end-->', '<!--seo:body-->']) assert.ok(html.includes(marker), marker);
});

const keywords = ['AI 컴패니언', 'AI 전화', 'AI 통화', '음성 채팅', '음성 컴패니언', '캐릭터 채팅'];

test('the keyword pages cover the search terms, each with its own title, a short description and questions', () => {
  const text = seoGuides.map(guide => `${guide.title} ${guide.h1} ${guide.lead} ${guide.sections.map(section => section.paragraphs.join(' ')).join(' ')}`).join(' ');
  for (const keyword of keywords) assert.ok(text.includes(keyword), `${keyword} is on a keyword page`);
  assert.equal(new Set(seoGuides.map(guide => guide.title)).size, seoGuides.length);
  assert.equal(new Set(seoGuides.map(guide => guide.description)).size, seoGuides.length);
  for (const guide of seoGuides) {
    assert.ok(guide.description.length <= 110, `${guide.path} description is short`);
    assert.ok(guide.faq.length >= 4 && guide.related.every(path => seoGuides.some(other => other.path === path)));
    assert.equal(seoFor(guide.path).noindex, false);
  }
});

test('the static page of an address carries its own head, text and structured data', () => {
  const template = read('index.html');
  for (const page of pagesToWrite()) {
    const html = renderPage(template, page);
    assert.ok(html.includes(`<title>${page.title.replace(/&/g, '&amp;')}</title>`), `${page.path} title`);
    assert.ok(html.includes(`<link rel="canonical" href="https://saseok.kr${page.path}" />`), `${page.path} canonical`);
    assert.ok(/<div id="root"><div id="seo-static"><main><h1>/.test(html), `${page.path} has text in the page for crawlers that run no script`);
    assert.ok(html.includes('<a href="/lounge">') && /<a href="\/(ai-companion|ai-call|voice-chat|character-chat)">/.test(html), `${page.path} links to the other pages`);
    const ld = html.match(/<script type="application\/ld\+json" id="seo-jsonld">(.*?)<\/script>/s);
    assert.ok(ld, `${page.path} has structured data`);
    const graph = JSON.parse(ld[1])['@graph'];
    assert.ok(graph.some(item => item['@type'] === 'Organization'));
    assert.ok(!html.includes('<!--seo:'), `${page.path} has no marker left`);
    assert.ok(fileFor(page.path).endsWith('/index.html'));
  }
  const home = JSON.parse(renderPage(template, pagesToWrite()[0]).match(/id="seo-jsonld">(.*?)<\/script>/s)[1])['@graph'];
  assert.deepEqual(home.map(item => item['@type']).sort(), ['FAQPage', 'Organization', 'WebApplication', 'WebPage', 'WebSite']);
  const offers = home.find(item => item['@type'] === 'WebApplication').offers;
  assert.deepEqual(offers.map(item => item.price), [0, 20000, 150000]);
});

test('a character page shares the character portrait and never marks a made-up character as a real person', () => {
  for (const character of loungeCharacters) {
    const seo = seoFor(`/lounge/characters/${character.id}`);
    assert.equal(seo.image.url, `https://saseok.kr${seoCharacterPortrait(character)}`);
    assert.ok(existsSync(new URL(`../public${seoCharacterPortrait(character)}`, import.meta.url)), `${character.id} portrait exists`);
    const graph = seoJsonLd(seo)['@graph'];
    assert.ok(!graph.some(item => item['@type'] === 'Person'), 'a made-up character is never marked as a real person');
    assert.ok(graph.some(item => item['@type'] === 'FAQPage') && graph.some(item => item['@type'] === 'BreadcrumbList'));
  }
});

test('llms.txt lists the pages and llms-full.txt carries the text, both in Korean', () => {
  const short = buildLlmsTxt();
  const full = buildLlmsFullTxt();
  for (const guide of seoGuides) assert.ok(short.includes(`https://saseok.kr${guide.path}`) && full.includes(guide.h1));
  for (const character of loungeCharacters) assert.ok(short.includes(`/lounge/characters/${character.id}`));
  assert.ok(short.startsWith('# 사석') && /가상의 인물/.test(short) && /만 18세/.test(short));
  assert.ok(/20,000원/.test(short) && /150,000원/.test(short));
});

test('no search or answer engine is shut out, and the build writes the static pages', () => {
  const robots = read('public/robots.txt');
  assert.ok(!/User-agent:\s*(GPTBot|OAI-SearchBot|ClaudeBot|Claude-SearchBot|PerplexityBot|Google-Extended|Yeti|Googlebot|Bingbot)/i.test(robots), 'no bot has a group of its own that could block it');
  assert.ok(/prerender-seo\.mjs/.test(read('package.json')));
  assert.ok(/llms/.test(read('vercel.json')));
});
