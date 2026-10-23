import { loungeCharacters } from './loungeCharacters';

export const SEO_ORIGIN = 'https://saseok.kr';
const HOME_TITLE = '사석 — 진짜 대화는 사석에서';
const HOME_DESCRIPTION = '혼자여도 괜찮아요. 성격이 뚜렷한 AI 캐릭터와 목소리로 이야기하고, 마음이 맞는 사람들과 함께 앉아 보세요. 목소리로 만나는 대화 라운지 사석.';

export type PageSeo = { title: string; description: string; path: string; noindex: boolean };

const short = (text: string, max: number) => text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

// Pages that should never show up in search: rooms, places, and everything behind a login or for staff.
const privatePrefixes = ['/lounge/spaces', '/super-admin', '/admin', '/history', '/battle', '/simulation', '/report', '/institution', '/argument-library'];

/** The title, description and address a search engine or a shared link should see for a path; null for pages this site does not describe. */
export function seoFor(pathname: string): PageSeo | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '/lounge') return { title: HOME_TITLE, description: HOME_DESCRIPTION, path: '/lounge', noindex: false };
  const character = path.startsWith('/lounge/characters/') ? loungeCharacters.find(item => item.id === path.slice('/lounge/characters/'.length)) : undefined;
  if (character) {
    return {
      title: `${character.name} — ${character.job} AI 캐릭터와 목소리로 대화 · 사석`,
      description: short(`${character.name}(${character.job}). ${character.role}. AI로 만든 가상의 인물과 목소리로 직접 이야기해 보세요.`, 150),
      path,
      noindex: false,
    };
  }
  if (path === '/terms') return { title: '이용약관 · 사석', description: '사석 이용약관. 대화방 이용 규칙, 안전 관리, 베타 기간 이용 시간 안내.', path, noindex: false };
  if (path === '/privacy') return { title: '개인정보 처리 안내 · 사석', description: '사석이 처리하는 개인정보와 대화 데이터, 보관 기간, 이용자의 권리 안내.', path, noindex: false };
  // Rooms and places keep the lounge title; the staff and login-only screens of the other service keep their own, so only the no-index tag is set.
  if (path === '/lounge/spaces' || path.startsWith('/lounge/')) return { title: HOME_TITLE, description: HOME_DESCRIPTION, path, noindex: true };
  if (privatePrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return { title: '', description: '', path, noindex: true };
  return null;
}

const setMeta = (selector: string, attribute: 'name' | 'property', key: string, content: string) => {
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  if (!node) { node = document.createElement('meta'); node.setAttribute(attribute, key); document.head.appendChild(node); }
  node.setAttribute('content', content);
};

/** Writes a page's search tags into the document head. Search engines that run scripts, and link previews that do, read these. */
export function applySeo(seo: PageSeo) {
  const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!seo.title) { setMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow'); return; }
  const url = `${SEO_ORIGIN}${seo.path}`;
  document.title = seo.title;
  setMeta('meta[name="description"]', 'name', 'description', seo.description);
  setMeta('meta[property="og:title"]', 'property', 'og:title', seo.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', url);
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', seo.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', seo.description);
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
  canonical.href = url;
  if (seo.noindex) setMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow');
  else robots?.remove();
}
