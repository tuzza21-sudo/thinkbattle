import { loungeCharacters } from './loungeCharacters';
import { loungeFreePlan, loungePlans } from './loungePlans';
import {
  SEO_BRAND, SEO_COMPANY, SEO_EMAIL, SEO_ORIGIN, seoCharacterPage, seoCharacterPortrait, seoGuideByPath, seoGuides, seoHome, seoHomeFaq,
  type SeoFaq,
} from './seoContent';

export { SEO_ORIGIN };
export const SEO_DEFAULT_IMAGE = { url: `${SEO_ORIGIN}/og-saseok.jpg`, alt: '한강 야경이 보이는 라운지, 사석', width: 1200, height: 630 };

export type PageSeo = {
  title: string; description: string; path: string; noindex: boolean;
  /** An absolute address and a description of the picture a shared link shows; the lounge's picture when absent. */
  image?: { url: string; alt: string };
  /** What kind of page this is, for the structured data. */
  kind?: 'home' | 'guide' | 'character' | 'legal';
  faq?: readonly SeoFaq[];
  breadcrumb?: ReadonlyArray<{ name: string; path: string }>;
};

const short = (text: string, max: number) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

// Pages that should never show up in search: rooms, places, and everything behind a login or for staff.
const privatePrefixes = ['/lounge/spaces', '/super-admin', '/admin', '/history', '/battle', '/simulation', '/report', '/institution', '/argument-library'];

const homeCrumb = { name: SEO_BRAND, path: '/lounge' };

/** The title, description and address a search engine or a shared link should see for a path; null for pages this site does not describe. */
export function seoFor(pathname: string): PageSeo | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '/lounge') return { title: seoHome.title, description: seoHome.description, path: '/lounge', noindex: false, kind: 'home', faq: seoHomeFaq };
  const guide = seoGuideByPath(path);
  if (guide) return { title: guide.title, description: guide.description, path, noindex: false, kind: 'guide', faq: guide.faq, breadcrumb: [homeCrumb, { name: guide.label, path }] };
  const character = path.startsWith('/lounge/characters/') ? loungeCharacters.find(item => item.id === path.slice('/lounge/characters/'.length)) : undefined;
  if (character) {
    const page = seoCharacterPage(character);
    return {
      title: page.title,
      description: short(page.description, 150),
      path,
      noindex: false,
      kind: 'character',
      image: { url: `${SEO_ORIGIN}${seoCharacterPortrait(character)}`, alt: `${character.name}, ${character.job}. AI로 만든 가상의 캐릭터` },
      faq: page.faq,
      breadcrumb: [homeCrumb, { name: character.name, path }],
    };
  }
  if (path === '/terms') return { title: '이용약관 · 사석', description: '사석 이용약관. 대화방 이용 규칙, 안전 관리, 베타 기간 이용 시간 안내.', path, noindex: false, kind: 'legal' };
  if (path === '/account-deletion') return { title: '계정·데이터 삭제 안내 · 사석', description: '사석 계정을 삭제하는 방법과 삭제되는 데이터, 보관되는 정보 안내.', path, noindex: false, kind: 'legal' };
  if (path === '/privacy') return { title: '개인정보 처리 안내 · 사석', description: '사석이 처리하는 개인정보와 대화 데이터, 보관 기간, 이용자의 권리 안내.', path, noindex: false, kind: 'legal' };
  // Rooms and places keep the lounge title; the staff and login-only screens of the other service keep their own, so only the no-index tag is set.
  if (path === '/lounge/spaces' || path.startsWith('/lounge/')) return { title: seoHome.title, description: seoHome.description, path, noindex: true };
  if (privatePrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return { title: '', description: '', path, noindex: true };
  return null;
}

/** Every address that belongs in the sitemap: the lounge home, the keyword pages, the characters and the legal pages. */
export const seoIndexablePaths = (): string[] => [
  '/lounge',
  ...seoGuides.map(guide => guide.path),
  ...loungeCharacters.map(character => `/lounge/characters/${character.id}`),
  '/terms', '/privacy', '/account-deletion',
];

const organization = {
  '@type': 'Organization', '@id': `${SEO_ORIGIN}/#org`, name: SEO_COMPANY, url: `${SEO_ORIGIN}/`, email: SEO_EMAIL,
  logo: { '@type': 'ImageObject', url: `${SEO_ORIGIN}/brand/saseok-profile.png` },
  brand: { '@type': 'Brand', name: SEO_BRAND },
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: SEO_EMAIL, availableLanguage: 'ko' },
};
const website = { '@type': 'WebSite', '@id': `${SEO_ORIGIN}/#site`, url: `${SEO_ORIGIN}/`, name: SEO_BRAND, alternateName: ['Saseok', '사석에서'], inLanguage: 'ko-KR', publisher: { '@id': `${SEO_ORIGIN}/#org` } };
const application = {
  '@type': 'WebApplication', '@id': `${SEO_ORIGIN}/#app`, name: SEO_BRAND, alternateName: '사석 AI 컴패니언', url: `${SEO_ORIGIN}/lounge`,
  applicationCategory: 'EntertainmentApplication', operatingSystem: 'Web', inLanguage: 'ko-KR',
  description: '나를 기억하고 함께한 시간만큼 가까워지는 AI 컴패니언. AI 캐릭터 채팅, 전화로 하는 음성 대화, 직접 만드는 캐릭터와 시나리오. 캐릭터는 AI로 만든 가상의 인물입니다.',
  featureList: ['AI 컴패니언 채팅', 'AI 전화·AI 통화(음성 대화)', '대화를 기억하는 장기 기억', '롤플레이와 시나리오', '나만의 캐릭터 만들기'],
  audience: { '@type': 'PeopleAudience', suggestedMinAge: 18 },
  publisher: { '@id': `${SEO_ORIGIN}/#org` },
  offers: [
    { '@type': 'Offer', name: loungeFreePlan.name, price: 0, priceCurrency: 'KRW', url: `${SEO_ORIGIN}/lounge` },
    ...loungePlans.map(plan => ({ '@type': 'Offer', name: plan.name, price: plan.price, priceCurrency: 'KRW', url: `${SEO_ORIGIN}/lounge` })),
  ],
};

/** The structured data (JSON-LD graph) of a page: who runs the site, what the app is, and what this page is. */
export function seoJsonLd(seo: PageSeo) {
  const url = `${SEO_ORIGIN}${seo.path}`;
  const graph: Record<string, unknown>[] = [organization, website];
  if (seo.kind === 'home' || seo.kind === 'guide') graph.push(application);
  if (seo.kind) {
    graph.push({
      '@type': 'WebPage', '@id': `${url}#page`, url, name: seo.title, description: seo.description, inLanguage: 'ko-KR',
      isPartOf: { '@id': `${SEO_ORIGIN}/#site` }, publisher: { '@id': `${SEO_ORIGIN}/#org` },
      ...(seo.kind === 'character' ? { about: { '@type': 'Thing', name: seo.title.split(' — ')[0], description: 'AI로 만든 가상의 캐릭터입니다. 실제 인물이 아닙니다.' } } : {}),
      ...(seo.kind === 'guide' ? { about: { '@id': `${SEO_ORIGIN}/#app` } } : {}),
      ...(seo.image ? { primaryImageOfPage: { '@type': 'ImageObject', url: seo.image.url, caption: seo.image.alt } } : {}),
    });
  }
  if (seo.breadcrumb?.length) {
    graph.push({ '@type': 'BreadcrumbList', itemListElement: seo.breadcrumb.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: `${SEO_ORIGIN}${item.path}` })) });
  }
  if (seo.faq?.length) {
    graph.push({ '@type': 'FAQPage', mainEntity: seo.faq.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/** JSON for a <script> tag: a "<" inside a string must not end the tag. */
export const seoJsonLdText = (seo: PageSeo) => JSON.stringify(seoJsonLd(seo)).replace(/</g, '\\u003c');

const setMeta = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  if (!node) { node = document.createElement('meta'); node.setAttribute(attribute, key); document.head.appendChild(node); }
  node.setAttribute('content', content);
};

/** Writes a page's search tags into the document head. Search engines that run scripts, and link previews that do, read these. */
export function applySeo(seo: PageSeo) {
  if (!seo.title) { setMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow'); return; }
  const url = `${SEO_ORIGIN}${seo.path}`;
  const image = seo.image ?? SEO_DEFAULT_IMAGE;
  document.title = seo.title;
  setMeta('meta[name="description"]', 'name', 'description', seo.description);
  setMeta('meta[property="og:title"]', 'property', 'og:title', seo.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', url);
  setMeta('meta[property="og:image"]', 'property', 'og:image', image.url);
  setMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', image.alt);
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', seo.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', seo.description);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image.url);
  // The recorded size belongs to the lounge's picture only.
  for (const key of ['og:image:width', 'og:image:height']) {
    const node = document.head.querySelector<HTMLMetaElement>(`meta[property="${key}"]`);
    if (node && seo.image) node.remove();
    else if (!node && !seo.image) setMeta(`meta[property="${key}"]`, 'property', key, String(key.endsWith('width') ? SEO_DEFAULT_IMAGE.width : SEO_DEFAULT_IMAGE.height));
  }
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
  canonical.href = url;
  setMeta('meta[name="robots"]', 'name', 'robots', seo.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1');
  // The structured data follows the page; a page with none (a room, a place) keeps the site's own.
  let script = document.head.querySelector<HTMLScriptElement>('script#seo-jsonld');
  if (!script) { script = document.createElement('script'); script.type = 'application/ld+json'; script.id = 'seo-jsonld'; document.head.appendChild(script); }
  script.textContent = seoJsonLdText(seo.kind ? seo : { ...seo, kind: 'home', path: '/lounge', breadcrumb: undefined, faq: undefined, image: undefined });
}
