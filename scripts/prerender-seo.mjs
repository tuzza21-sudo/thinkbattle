// Run after `vite build`: writes the static pages, sitemap.xml, llms.txt and llms-full.txt into dist/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLlmsFullTxt, buildLlmsTxt, buildSitemap, fileFor, pagesToWrite, quietPagesToWrite, renderPage } from './seo-build.mjs';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const template = readFileSync(join(dist, 'index.html'), 'utf8');
const write = (file, text) => { const target = join(dist, file); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, text); };

const pages = pagesToWrite();
// The home is the root address (index.html); /lounge is not a page of its own — the app sends a visitor on to /.
for (const page of [...pages, ...quietPagesToWrite()]) write(fileFor(page.path), renderPage(template, page));
write('sitemap.xml', buildSitemap(new Date().toISOString().slice(0, 10)));
write('llms.txt', buildLlmsTxt());
write('llms-full.txt', buildLlmsFullTxt());
console.log(`seo: ${pages.length} pages (+ legal, no-index), sitemap.xml, llms.txt, llms-full.txt`);
