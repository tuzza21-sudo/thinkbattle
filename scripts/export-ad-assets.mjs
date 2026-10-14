// Writes docs/ad-agent/assets.json: the characters, places and brand lines the ad agent builds creatives from, with
// absolute image and voice addresses. Run it again whenever a character, picture or place changes.
//   node scripts/export-ad-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const site = 'https://saseok.kr';
const lounge = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
const characters = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
const url = path => path ? `${site}${path.startsWith('/') ? '' : '/'}${path.replace(/\?.*$/, '')}` : null;

const themeOf = id => lounge.loungeThemes.find(theme => theme.id === id);
const assets = {
  generatedAt: new Date().toISOString(),
  site,
  brand: {
    name: '사석', tagline: '진짜 대화는 사석에서', slogan: '혼자여도 괜찮아요. 오늘 밤, 이야기할 사람이 있으니까.',
    description: '목소리로 만나는 AI 캐릭터 대화 라운지', shareImage: `${site}/og-saseok.jpg`,
  },
  // Wording and image rules every creative must follow (see README.md).
  rules: [
    '캐릭터와 사진은 모두 AI로 만든 가상의 인물이라고 밝힌다.',
    '상담·치료·정신 건강을 약속하지 않는다. 외로움 같은 보는 사람의 상태를 짐작하는 문구를 쓰지 않는다.',
    '성인(18세 이상)만 대상으로 한다. 연애·플러팅을 앞세우지 않는다.',
    '실제 인물이나 유명인을 닮게 만들지 않는다. 실제 대화처럼 보이는 화면은 "화면 예시"라고 표시한다.',
  ],
  characters: characters.loungeCharacters.map(character => {
    const host = lounge.getLoungeHost(character.id);
    const place = themeOf(lounge.loungeHostThemes[character.id]?.[0]);
    const profile = lounge.loungeCharacterProfiles[character.id];
    return {
      id: character.id, name: character.name, age: character.age, job: character.job, role: character.role,
      tagline: character.tagline, quote: character.quote, traits: profile?.traits ?? [], summary: profile?.summary ?? '',
      voice: host.voiceLabel, greeting: host.greeting,
      images: { portrait: url(host.portrait), fullBody: url(character.fullBody) },
      voiceSample: url(host.voiceSample),
      place: place ? { id: place.id, name: place.name, caption: place.caption, image: url(place.image) } : null,
    };
  }),
  places: lounge.loungeThemes.map(theme => ({ id: theme.id, name: theme.name, subtitle: theme.subtitle, caption: theme.caption, image: url(theme.image) })),
};
mkdirSync(new URL('../docs/ad-agent/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/ad-agent/assets.json', import.meta.url), JSON.stringify(assets, null, 2) + '\n', 'utf8');
console.log(`${assets.characters.length} characters, ${assets.places.length} places -> docs/ad-agent/assets.json`);
