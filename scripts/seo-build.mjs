// Builds the search and answer-engine files from the same data the app reads (src/lib/seo*.ts): one static HTML page per
// public address (so crawlers that do not run scripts still read the text), sitemap.xml, llms.txt and llms-full.txt.
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const source = path => fileURLToPath(new URL(`../src/lib/${path}`, import.meta.url));
const seo = loadTs(source('seo.ts'));
const content = loadTs(source('seoContent.ts'));
const { loungeCharacters } = loadTs(source('loungeCharacters.ts'));
const { loungePlans, loungeFreePlan } = loadTs(source('loungePlans.ts'));

const { SEO_ORIGIN, SEO_COMPANY, SEO_EMAIL, seoGuides, seoHome, seoHomeFaq, seoVirtualNotice } = content;
const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = escapeHtml;
const absolute = path => `${SEO_ORIGIN}${path}`;
const characterPage = character => content.seoCharacterPage(character);
const portrait = character => content.seoCharacterPortrait(character);

/** The tags between <!--seo:start--> and <!--seo:end--> in index.html, for one page. */
export function headFor(page) {
  const url = absolute(page.path);
  const image = page.image ?? seo.SEO_DEFAULT_IMAGE;
  const lines = [
    `<title>${escapeHtml(page.title)}</title>`,
    `<meta name="description" content="${attr(page.description)}" />`,
    `<meta name="robots" content="${page.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1'}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:site_name" content="사석" />',
    `<meta property="og:title" content="${attr(page.title)}" />`,
    `<meta property="og:description" content="${attr(page.description)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${url}" />`,
    '<meta property="og:locale" content="ko_KR" />',
    `<meta property="og:image" content="${attr(image.url)}" />`,
    ...(page.image ? [] : [`<meta property="og:image:width" content="${image.width}" />`, `<meta property="og:image:height" content="${image.height}" />`]),
    `<meta property="og:image:alt" content="${attr(image.alt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${attr(page.title)}" />`,
    `<meta name="twitter:description" content="${attr(page.description)}" />`,
    `<meta name="twitter:image" content="${attr(image.url)}" />`,
    `<script type="application/ld+json" id="seo-jsonld">${seo.seoJsonLdText(page)}</script>`,
  ];
  return lines.map(line => `    ${line}`).join('\n');
}

const list = items => items?.length ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
const sectionHtml = section => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map(text => `<p>${escapeHtml(text)}</p>`).join('')}${list(section.bullets)}</section>`;
const faqHtml = faq => `<section><h2>자주 묻는 질문</h2><dl>${faq.map(item => `<dt>${escapeHtml(item.question)}</dt><dd>${escapeHtml(item.answer)}</dd>`).join('')}</dl></section>`;
const castHtml = () => `<section><h2>사석의 캐릭터</h2><ul>${loungeCharacters.map(character => `<li><a href="/lounge/characters/${character.id}">${escapeHtml(character.name)}</a> — ${escapeHtml(character.job)}. ${escapeHtml(character.tagline)}</li>`).join('')}</ul></section>`;
const guideLinks = () => `<nav aria-label="사석 안내"><ul>${seoGuides.map(guide => `<li><a href="${guide.path}">${escapeHtml(guide.label)}</a></li>`).join('')}<li><a href="/lounge">사석 홈</a></li></ul></nav>`;
const footerHtml = () => `<footer><p>${escapeHtml(seoVirtualNotice)}</p><p>상호 ${SEO_COMPANY} · 문의 <a href="mailto:${SEO_EMAIL}">${SEO_EMAIL}</a> · <a href="/terms">이용약관</a> · <a href="/privacy">개인정보 처리 안내</a></p></footer>`;
const wrap = inner => `<div id="seo-static"><main>${inner}</main></div>`;

/** The text inside <div id="root"> for one page; the app replaces it when it starts. */
export function bodyFor(page) {
  if (page.kind === 'home') {
    return wrap(`<h1>${escapeHtml(seoHome.h1)}</h1><p>${escapeHtml(seoHome.lead)}</p>${seoHome.sections.map(sectionHtml).join('')}${castHtml()}${guideLinks()}${faqHtml(seoHomeFaq)}${footerHtml()}`);
  }
  const guide = seoGuides.find(item => item.path === page.path);
  if (guide) {
    const related = `<nav aria-label="함께 보면 좋은 안내"><ul>${guide.related.map(path => `<li><a href="${path}">${escapeHtml(seoGuides.find(item => item.path === path).label)}</a></li>`).join('')}<li><a href="/lounge">사석 홈</a></li></ul></nav>`;
    return wrap(`<h1>${escapeHtml(guide.h1)}</h1><p>${escapeHtml(guide.lead)}</p>${guide.sections.map(sectionHtml).join('')}${guide.showCast ? castHtml() : ''}${faqHtml(guide.faq)}${related}${footerHtml()}`);
  }
  const character = loungeCharacters.find(item => page.path === `/lounge/characters/${item.id}`);
  if (character) {
    const info = characterPage(character);
    return wrap(`<h1>${escapeHtml(info.h1)}</h1><img src="${attr(portrait(character))}" alt="${attr(`${character.name}, ${character.job}. AI로 만든 가상의 캐릭터`)}" width="240" height="240" /><p>${escapeHtml(info.lead)}</p><p>“${escapeHtml(info.quote)}”</p><section><h2>${escapeHtml(character.name)}은(는) 어떤 캐릭터인가요</h2><p>${escapeHtml(character.role)}</p><p>${escapeHtml(info.about)}</p>${list(info.traits)}${info.voice ? `<p>목소리: ${escapeHtml(info.voice)}</p>` : ''}</section>${faqHtml(info.faq)}${guideLinks()}${footerHtml()}`);
  }
  return wrap(`<h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.description)}</p>${guideLinks()}${footerHtml()}`);
}

/** Turns the built index.html into the page for one address. */
export function renderPage(template, page) {
  if (!template.includes('<!--seo:start-->') || !template.includes('<!--seo:end-->') || !template.includes('<!--seo:body-->')) throw new Error('index.html lost its seo markers');
  return template
    .replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, () => headFor(page).trimStart())
    .replace('<!--seo:body-->', () => bodyFor(page));
}

/** Every public address that gets its own static page, with the tags it carries. */
export const pagesToWrite = () => seo.seoIndexablePaths().map(path => ({ path, ...seo.seoFor(path) }));

/** The file a page is written to inside dist: /lounge → lounge/index.html. */
export const fileFor = path => `${path.replace(/^\//, '')}/index.html`;

export function buildSitemap(date) {
  const entries = pagesToWrite().map(page => {
    const image = page.image ? `<image:image><image:loc>${escapeHtml(page.image.url)}</image:loc></image:image>` : '';
    return `  <url><loc>${absolute(page.path)}</loc><lastmod>${date}</lastmod>${image}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join('\n')}\n</urlset>\n`;
}

const priceLine = plan => `${plan.name} ${plan.price.toLocaleString('ko-KR')}원`;

export function buildLlmsTxt() {
  const lines = [
    '# 사석 (Saseok)',
    '',
    `> ${seoHome.lead} 한국어 서비스이며, 모든 캐릭터·사진·목소리는 AI로 만든 가상의 인물입니다. 만 18세 이상을 위한 서비스입니다.`,
    '',
    '## 핵심 안내',
    ...seoGuides.map(guide => `- [${guide.label}](${absolute(guide.path)}): ${guide.description}`),
    '',
    '## 캐릭터',
    ...loungeCharacters.map(character => `- [${character.name} (${character.job})](${absolute(`/lounge/characters/${character.id}`)}): ${character.tagline}`),
    '',
    '## 기본 정보',
    `- 서비스 주소: ${absolute('/lounge')}`,
    `- 운영: ${SEO_COMPANY} · 문의 ${SEO_EMAIL}`,
    `- 요금: ${[loungeFreePlan.name + ' 0원', ...loungePlans.map(priceLine)].join(', ')} (부가세 포함, 자동 재결제 없음)`,
    `- 이용약관: ${absolute('/terms')} · 개인정보 처리 안내: ${absolute('/privacy')}`,
    `- 전체 내용: ${absolute('/llms-full.txt')}`,
    '',
  ];
  return lines.join('\n');
}

export function buildLlmsFullTxt() {
  const faq = items => items.map(item => `Q. ${item.question}\nA. ${item.answer}`).join('\n\n');
  const sections = sectionList => sectionList.map(section => [`### ${section.heading}`, ...section.paragraphs, ...(section.bullets ?? []).map(item => `- ${item}`)].join('\n')).join('\n\n');
  const parts = [
    `# 사석 (Saseok) — ${seoHome.h1}`, '', seoHome.lead, '', sections(seoHome.sections), '', '## 자주 묻는 질문', '', faq(seoHomeFaq),
    ...seoGuides.flatMap(guide => ['', `## ${guide.h1}`, `주소: ${absolute(guide.path)}`, '', guide.lead, '', sections(guide.sections), '', '### 자주 묻는 질문', '', faq(guide.faq)]),
    '', '## 캐릭터 소개 (모두 AI로 만든 가상의 인물)',
    ...loungeCharacters.flatMap(character => {
      const info = characterPage(character);
      return ['', `### ${info.h1}`, `주소: ${absolute(info.path)}`, character.role, info.lead, ...(info.voice ? [`목소리: ${info.voice}`] : [])];
    }),
    '', '## 알아 두세요', seoVirtualNotice, '',
  ];
  return parts.join('\n');
}
