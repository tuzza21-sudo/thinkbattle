// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- api/lounge.ts is type-checked on its own, without src/types
/// <reference path="../types/lunar-javascript.d.ts" />
/**
 * 사주 for 홍실당 상담 (2026-11-05): the four pillars computed by code, never by a language model. Server only (it pulls in
 * lunar-javascript, MIT, a full Chinese calendar with solar terms and luck pillars).
 *
 * How a Korean birth time is read:
 * - The civil time becomes an instant through the Asia/Seoul time zone history, which knows the years Korea ran at
 *   UTC+8:30 (1908-1911, 1954-1961) and its summer times (1948-1951, 1955-1960, 1987-1988).
 * - The year and month pillars turn at the solar terms (입춘, 경칩, ...). The library reckons them in Beijing time, so the
 *   instant is given to it in Beijing time (UTC+8): a birth minutes before or after 절입 lands on the right side.
 * - The day and hour pillars follow the sun where the person was born: Seoul's local mean time (127°E, about UTC+8:28,
 *   32 minutes behind the clock). With the time unknown, there is no hour pillar.
 * - A lunar date is turned into a solar one with the Chinese lunar calendar, which in a few months differs from the
 *   Korean one by a day; the reading says so when a lunar date was given.
 */
import { Lunar, Solar } from 'lunar-javascript';
import type { LoungeBirth, LoungeFortunePeriod, LoungeSajuDisplay, LoungeSajuInput, LoungeZodiacDisplay } from './loungeConsult';

const stems: Record<string, string> = { 甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계' };
const branches: Record<string, string> = { 子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해' };
const stemElement: Record<string, string> = { 甲: '목', 乙: '목', 丙: '화', 丁: '화', 戊: '토', 己: '토', 庚: '금', 辛: '금', 壬: '수', 癸: '수' };
const branchElement: Record<string, string> = { 寅: '목', 卯: '목', 巳: '화', 午: '화', 辰: '토', 戌: '토', 丑: '토', 未: '토', 申: '금', 酉: '금', 亥: '수', 子: '수' };
const yang = new Set(['甲', '丙', '戊', '庚', '壬']);
const tenGods: Record<string, string> = { 比肩: '비견', 劫财: '겁재', 食神: '식신', 伤官: '상관', 偏财: '편재', 正财: '정재', 七杀: '편관', 正官: '정관', 偏印: '편인', 正印: '정인', 日主: '일간' };
/** The ten gods as Korean books write them (the library's simplified 劫财, 伤官, 七杀 become 劫財, 傷官, 偏官). */
const tenGodHanja: Record<string, string> = { 比肩: '比肩', 劫财: '劫財', 食神: '食神', 伤官: '傷官', 偏财: '偏財', 正财: '正財', 七杀: '偏官', 正官: '正官', 偏印: '偏印', 正印: '正印' };
const hangul = (ganzhi: string) => `${stems[ganzhi[0]] ?? ganzhi[0]}${branches[ganzhi[1]] ?? ganzhi[1]}`;
const god = (name: string | undefined) => (name && tenGods[name]) ?? name ?? '';

// ── The chart in everyday words (2026-11-05: "병오, 임술" was too hard for members). Code translates it, so the reading
// can be told without stems, branches or the names of the ten gods. ──
/** Each day master as a picture of a person. */
const dayMasterPicture: Record<string, string> = {
  甲: '곧게 뻗는 큰 나무 같은 사람. 한번 정하면 위로 쭉 밀고 나가고, 남을 품어 주는 그늘이 있다',
  乙: '어디서든 뿌리내리는 풀과 덩굴 같은 사람. 부드럽고 유연하게 길을 찾고, 사람 사이를 잘 엮는다',
  丙: '하늘의 태양 같은 사람. 밝고 솔직하고, 있으면 주변이 환해지지만 숨기는 게 서툴다',
  丁: '어둠을 밝히는 촛불 같은 사람. 조용히 따뜻하고 섬세하며, 한 사람을 오래 비춰 준다',
  戊: '큰 산 같은 사람. 묵직하고 믿음직해서 사람들이 기대지만, 한번 정하면 잘 안 움직인다',
  己: '곡식을 키우는 밭흙 같은 사람. 사람을 돌보고 길러 내는 데 능하고, 실속을 챙긴다',
  庚: '단단한 바위나 쇠 같은 사람. 결단이 빠르고 의리가 있지만, 말이 세게 나갈 때가 있다',
  辛: '잘 다듬은 보석 같은 사람. 깔끔하고 감각이 예민하며, 자존심과 기준이 분명하다',
  壬: '넓은 바다나 큰 강 같은 사람. 생각이 깊고 크게 보며, 어디든 흘러가는 자유로움이 있다',
  癸: '조용히 스며드는 비나 이슬 같은 사람. 눈치가 빠르고 감성이 풍부하며, 티 안 나게 챙긴다',
};
/** What each of the five elements stands for, in plain words. */
const elementMeaning: Record<string, string> = {
  목: '나무 기운: 새로 시작하고 자라나려는 힘, 계획과 성장',
  화: '불 기운: 열정과 표현력, 사람 앞에 드러나는 힘',
  토: '흙 기운: 안정감과 믿음, 버티고 중재하는 힘',
  금: '쇠 기운: 결단과 원칙, 맺고 끊는 힘',
  수: '물 기운: 지혜와 유연함, 생각하고 흘려보내는 힘',
};
const elementName: Record<string, string> = { 목: '나무', 화: '불', 토: '흙', 금: '쇠', 수: '물' };
const elementColor: Record<string, string> = { 목: '푸른', 화: '붉은', 토: '누런', 금: '흰', 수: '검은' };
const animals: Record<string, string> = { 子: '쥐', 丑: '소', 寅: '호랑이', 卯: '토끼', 辰: '용', 巳: '뱀', 午: '말', 未: '양', 申: '원숭이', 酉: '닭', 戌: '개', 亥: '돼지' };
/** The ten gods as what they say about a life, in plain words. */
const tenGodMeaning: Record<string, string> = {
  比肩: '자기 주장과 독립심, 동료', 劫财: '승부욕과 경쟁, 내 사람 챙기기', 食神: '타고난 재주와 여유, 먹고 즐기는 복',
  伤官: '말재주와 표현력, 틀을 깨는 끼', 偏财: '돈 감각과 사업 수완, 넓은 인맥', 正财: '꼼꼼한 살림과 꾸준히 모으는 돈',
  七杀: '압박을 이겨 내는 추진력, 카리스마', 正官: '책임감과 규칙, 조직과 명예', 偏印: '남다른 생각과 직감, 혼자 파고드는 공부', 正印: '배움과 보살핌, 도와주는 어른',
};
/** A pillar as the season it brings: "불 기운이 센 붉은 말의 해" rather than 병오. */
const pillarInWords = (ganzhi: string) => {
  const [stem, branch] = [stemElement[ganzhi[0]], branchElement[ganzhi[1]]];
  // 와/과 after the first word: 불·흙·물 end in a consonant, 나무·쇠 do not.
  const and = (word: string) => `${word}${['불', '흙', '물'].includes(word) ? '과' : '와'}`;
  const flow = stem === branch ? `${elementName[stem]} 기운이 아주 센` : `${and(elementName[stem])} ${elementName[branch]} 기운이 함께 도는`;
  return { flow, animal: `${elementColor[stem]} ${animals[ganzhi[1]]}` };
};

/** The UTC instant of a Korean civil date and time, through the Asia/Seoul zone history (UTC+8:30 years, summer times). */
export function seoulCivilToUtc(year: number, month: number, day: number, hour: number, minute: number): number {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  const format = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  const offsetAt = (instant: number) => {
    const part = Object.fromEntries(format.formatToParts(new Date(instant)).map(item => [item.type, Number(item.value)]));
    return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute) - Math.floor(instant / 60000) * 60000;
  };
  // Two passes settle the offset even next to a change of it.
  let guess = wanted - 9 * 3600000;
  for (let i = 0; i < 2; i++) guess = wanted - offsetAt(guess);
  return guess;
}

const at = (instant: number) => { const date = new Date(instant); return Solar.fromYmdHms(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), 0); };
const seoulMeanOffset = (8 * 60 + 28) * 60000;
const beijingOffset = 8 * 3600000;

export type LoungeSajuChart = {
  pillars: { year: string; month: string; day: string; hour: string | null };
  day_master: string; five_elements: Record<'목' | '화' | '토' | '금' | '수', number>; strong: string[]; missing: string[];
  ten_gods: { year: string; month: string; hour: string | null; year_branch: string; month_branch: string; day_branch: string; hour_branch: string | null };
  daewoon?: { start_age: number; list: string[]; current: string | null };
  this_year: string; this_month: string; solar_date: string; notes: string[];
  /**
   * The chart with its letters and what each means, side by side (2026-11-05, the owner's call: the original letters make
   * the reading credible, so they stay, each with its explanation).
   */
  explained: {
    day_master: string; pillars: string[]; five_elements: string[]; ten_gods: string[];
    this_year: string; this_month: string; luck_now?: string;
  };
  /** What the page draws under the reading: the four pillars and the count of each element. */
  display: LoungeSajuDisplay;
};

/** A stem or branch with its Hanja, its element and yin-yang (or, for a branch, its animal): "경(庚) 쇠·양". */
const stemText = (char: string) => `${stems[char]}(${char}) ${elementName[stemElement[char]]}·${yang.has(char) ? '양' : '음'}`;
const branchText = (char: string) => `${branches[char]}(${char}) ${elementName[branchElement[char]]}·${animals[char]}`;
const elementHanja: Record<string, string> = { 목: '木', 화: '火', 토: '土', 금: '金', 수: '水' };
const pillarPlaces = { year: '년주: 조상과 어린 시절, 바깥에 보이는 나', month: '월주: 부모와 사회 환경, 청년기와 일하는 방식', day: '일주: 나 자신과 배우자 자리', hour: '시주: 자녀와 말년, 속마음' } as const;
const explainPillar = (place: keyof typeof pillarPlaces, ganzhi: string) => `${pillarPlaces[place]} — ${hangul(ganzhi)}(${ganzhi}): ${stemText(ganzhi[0])} 위에 ${branchText(ganzhi[1])}`;
const explainSeason = (label: string, kind: '해' | '달' | '시기', ganzhi: string) => {
  const words = pillarInWords(ganzhi);
  return `${label} ${hangul(ganzhi)}(${ganzhi}) — ${words.flow} ${kind}${kind === '해' ? `, ${words.animal}의 해` : ''}`;
};

/** The solar date of a birth given in either calendar (a lunar date is converted with the Chinese calendar). */
function solarOf(input: Pick<LoungeBirth, 'date' | 'calendar'>) {
  const [year, month, day] = input.date.split('-').map(Number);
  if (input.calendar === 'solar') return { year, month, day };
  const converted = Lunar.fromYmdHms(year, input.calendar === 'lunar_leap' ? -month : month, day, 12, 0, 0).getSolar();
  return { year: converted.getYear(), month: converted.getMonth(), day: converted.getDay() };
}

/** The chart for a birth, read as above; `now` decides this year's and this month's pillars and the current luck pillar. */
export function computeLoungeSaju(input: LoungeSajuInput, now: Date = new Date()): LoungeSajuChart {
  const notes: string[] = [];
  const solar = solarOf(input);
  if (input.calendar !== 'solar') notes.push('음력으로 받은 날짜를 양력으로 바꿔 봤다. 드물게 하루 차이가 날 수 있다.');
  const [hour, minute] = input.time ? input.time.split(':').map(Number) : [12, 0];
  if (!input.time) notes.push('태어난 시간을 몰라 시주 없이 세 기둥으로 봤다.');
  const instant = seoulCivilToUtc(solar.year, solar.month, solar.day, hour, minute);
  const byTerms = at(instant + beijingOffset).getLunar().getEightChar();
  const bySun = at(instant + seoulMeanOffset).getLunar().getEightChar();
  const raw = { year: byTerms.getYear(), month: byTerms.getMonth(), day: bySun.getDay(), hour: input.time ? bySun.getTime() : null };
  const chars = [raw.year, raw.month, raw.day, ...(raw.hour ? [raw.hour] : [])];
  const counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const pair of chars) { counts[stemElement[pair[0]] as keyof typeof counts]++; counts[branchElement[pair[1]] as keyof typeof counts]++; }
  const top = Math.max(...Object.values(counts));
  const dayStem = raw.day[0];
  const nowSolar = at(now.getTime() + beijingOffset).getLunar();
  const thisYear = nowSolar.getYearInGanZhiByLiChun(), thisMonth = nowSolar.getMonthInGanZhiExact();
  const strong = Object.entries(counts).filter(([, value]) => value === top && value >= 3).map(([name]) => name);
  const missing = Object.entries(counts).filter(([, value]) => value === 0).map(([name]) => name);
  const gods: Array<[string, string]> = [
    ['년간', byTerms.getYearShiShenGan()], ['월간', byTerms.getMonthShiShenGan()], ...(raw.hour ? [['시간', bySun.getTimeShiShenGan()] as [string, string]] : []),
    ['월지', byTerms.getMonthShiShenZhi()[0]], ['일지', bySun.getDayShiShenZhi()[0]],
  ];
  const element = (name: string) => `${name}(${elementHanja[name]})`;
  const chart: LoungeSajuChart = {
    pillars: { year: hangul(raw.year), month: hangul(raw.month), day: hangul(raw.day), hour: raw.hour ? hangul(raw.hour) : null },
    day_master: `${stems[dayStem]}${stemElement[dayStem]}(${yang.has(dayStem) ? '양' : '음'})`,
    five_elements: counts, strong, missing,
    ten_gods: {
      year: god(byTerms.getYearShiShenGan()), month: god(byTerms.getMonthShiShenGan()), hour: raw.hour ? god(bySun.getTimeShiShenGan()) : null,
      year_branch: god(byTerms.getYearShiShenZhi()[0]), month_branch: god(byTerms.getMonthShiShenZhi()[0]), day_branch: god(bySun.getDayShiShenZhi()[0]),
      hour_branch: raw.hour ? god(bySun.getTimeShiShenZhi()[0]) : null,
    },
    this_year: hangul(thisYear), this_month: hangul(thisMonth),
    solar_date: `${solar.year}-${String(solar.month).padStart(2, '0')}-${String(solar.day).padStart(2, '0')}`, notes,
    explained: {
      day_master: `일간 ${stems[dayStem]}${stemElement[dayStem]}(${dayStem}${elementHanja[stemElement[dayStem]]}), ${yang.has(dayStem) ? '양' : '음'}의 ${elementName[stemElement[dayStem]]} — ${dayMasterPicture[dayStem]}`,
      pillars: [explainPillar('year', raw.year), explainPillar('month', raw.month), explainPillar('day', raw.day), ...(raw.hour ? [explainPillar('hour', raw.hour)] : [])],
      five_elements: (['목', '화', '토', '금', '수'] as const).map(name => `${element(name)} ${counts[name]}개${strong.includes(name) ? ', 많은 편' : counts[name] === 0 ? ', 없음' : ''} — ${elementMeaning[name]}`),
      ten_gods: gods.filter(([, name]) => tenGodMeaning[name]).map(([where, name]) => `${where} ${god(name)}(${tenGodHanja[name]}) — ${tenGodMeaning[name]}`),
      this_year: explainSeason('올해', '해', thisYear), this_month: explainSeason('이번 달', '달', thisMonth),
    },
    display: {
      pillars: (['hour', 'day', 'month', 'year'] as const).map(place => {
        const pair = raw[place];
        return { label: { hour: '시주', day: '일주', month: '월주', year: '년주' }[place], hanja: pair ?? '', hangul: pair ? hangul(pair) : '', elements: pair ? [stemElement[pair[0]], branchElement[pair[1]]] : [] };
      }),
      elements: counts, dayMaster: `${stems[dayStem]}${stemElement[dayStem]}(${dayStem}${elementHanja[stemElement[dayStem]]})`, thisYear: `${hangul(thisYear)}(${thisYear})년`,
    },
  };
  // 대운 (luck pillars) run forward or backward by gender, so they are left out when it is not given.
  if (input.gender !== 'none') {
    const yun = byTerms.getYun(input.gender === 'male' ? 1 : 0);
    const list = yun.getDaYun(10).filter(item => item.getStartAge() > 0);
    const age = now.getUTCFullYear() - solar.year + 1;
    const current = [...list].reverse().find(item => item.getStartAge() <= age);
    chart.daewoon = { start_age: list[0]?.getStartAge() ?? 0, list: list.slice(0, 8).map(item => `${item.getStartAge()}세 ${hangul(item.getGanZhi())}`), current: current ? hangul(current.getGanZhi()) : null };
    if (current) chart.explained.luck_now = explainSeason(`지금 대운(${current.getStartAge()}세부터 10년)`, '시기', current.getGanZhi());
  } else notes.push('성별을 밝히지 않아 대운은 빼고 봤다.');
  return chart;
}

// ── 궁합, 운세 and 별자리 (2026-11-05): computed by code from the same calendar, told with their letters and meanings ──
const elements = ['목', '화', '토', '금', '수'] as const;
/** The Korean particle a word takes: 과/와, 을/를, 이/가 by whether its last Hangul letter (before any "(漢字)") ends in a consonant. */
const josa = (word: string, [closed, open]: [string, string]) => {
  const letter = word.replace(/\([^)]*\)$/, '').at(-1) ?? '';
  const code = letter.charCodeAt(0) - 0xac00;
  return `${word}${code >= 0 && code < 11172 && code % 28 !== 0 ? closed : open}`;
};
const and = (word: string) => josa(word, ['과', '와']);
const obj = (word: string) => josa(word, ['을', '를']);
const subj = (word: string) => josa(word, ['이', '가']);
const generates = (a: string, b: string) => elements[(elements.indexOf(a as typeof elements[number]) + 1) % 5] === b;
const controls = (a: string, b: string) => elements[(elements.indexOf(a as typeof elements[number]) + 2) % 5] === b;
/** The ten god `other` is to a day master `day` (both heavenly stems), in the library's names. */
export function loungeTenGod(day: string, other: string): string {
  const [a, b] = [stemElement[day], stemElement[other]];
  const same = yang.has(day) === yang.has(other);
  if (a === b) return same ? '比肩' : '劫财';
  if (generates(a, b)) return same ? '食神' : '伤官';
  if (controls(a, b)) return same ? '偏财' : '正财';
  if (controls(b, a)) return same ? '七杀' : '正官';
  return same ? '偏印' : '正印';
}
const godLine = (day: string, other: string) => { const name = loungeTenGod(day, other); return `${god(name)}(${tenGodHanja[name]}) — ${tenGodMeaning[name]}`; };
const stemPairs: Record<string, string> = { 甲己: '흙(토)', 乙庚: '쇠(금)', 丙辛: '물(수)', 丁壬: '나무(목)', 戊癸: '불(화)' };
const branchHarmony = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
const branchClash = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
const branchTrines = [['申', '子', '辰'], ['寅', '午', '戌'], ['巳', '酉', '丑'], ['亥', '卯', '未']];
const pair = (a: string, b: string, list: readonly string[]) => list.includes(a + b) || list.includes(b + a);
/** Two branches as Korean 궁합 reads them: 육합 (they draw together), 충 (they clash), 삼합 (same team), or neither. */
const branchBond = (a: string, b: string) => pair(a, b, branchHarmony) ? '육합(六合) — 서로 끌어당겨 잘 맞는 사이'
  : pair(a, b, branchClash) ? '충(沖) — 부딪히며 자극을 주는 사이, 맞추려면 노력이 필요하다'
  : a !== b && branchTrines.some(group => group.includes(a) && group.includes(b)) ? '삼합(三合) — 같은 편이 되어 힘을 합치는 사이'
  : a === b ? '같은 글자 — 닮아서 편하지만 고집도 닮았다' : '특별한 합이나 충은 없다 — 무난한 사이';
const stemBond = (a: string, b: string) => {
  const combined = stemPairs[a + b] ?? stemPairs[b + a];
  if (combined) return `천간합(天干合) — ${stems[a]}${stems[b]}합, 서로 끌려 하나가 되면 ${combined} 기운이 생긴다. 궁합에서 가장 반기는 짝이다`;
  const [x, y] = [stemElement[a], stemElement[b]];
  const [mine, theirs] = [elementName[x], elementName[y]];
  return x === y ? `같은 ${mine} 기운 — 생각이 닮아 편하지만 부딪히면 둘 다 안 물러선다`
    : generates(x, y) ? `${subj(mine)} ${obj(theirs)} 살리는 관계 — 내가 챙겨 주는 쪽이다`
    : generates(y, x) ? `${subj(theirs)} ${obj(mine)} 살리는 관계 — 상대가 나를 챙겨 주는 쪽이다`
    : controls(x, y) ? `${subj(mine)} ${obj(theirs)} 누르는 관계 — 내가 이끄는 쪽이고, 상대는 답답할 수 있다`
    : `${subj(theirs)} ${obj(mine)} 누르는 관계 — 상대가 이끄는 쪽이고, 나는 눌릴 수 있다`;
};
const dayStemOf = (chart: LoungeSajuChart) => chart.display.pillars[1].hanja[0];
const branchOf = (chart: LoungeSajuChart, label: string) => chart.display.pillars.find(item => item.label === label)?.hanja[1] ?? '';
const branchWord = (char: string) => `${branches[char]}(${char})`;
/** What the interpreter is given of one chart: the letters with their meanings and the limits of the reading. */
const forReading = (chart: LoungeSajuChart) => ({ explained: chart.explained, strong: chart.strong, missing: chart.missing, notes: chart.notes });

export type LoungeSajuCompat = { reading: Record<string, unknown>; display: LoungeSajuDisplay; partnerDisplay: LoungeSajuDisplay };
/** 궁합: the two day masters, the two day branches (the spouse's seat), the two year branches (띠), and what each lacks that the other has. */
export function computeLoungeCompat(me: LoungeBirth, partner: LoungeBirth, now: Date = new Date()): LoungeSajuCompat {
  const [a, b] = [computeLoungeSaju({ ...me, focus: '전부' }, now), computeLoungeSaju({ ...partner, focus: '전부' }, now)];
  const [dayA, dayB] = [dayStemOf(a), dayStemOf(b)];
  const fills = (from: LoungeSajuChart, to: LoungeSajuChart) => to.missing.filter(name => from.five_elements[name as keyof typeof from.five_elements] >= 2).map(name => `${name}(${elementHanja[name]})`);
  const [mine, theirs] = [fills(b, a), fills(a, b)];
  const between = [
    `일간: 나 ${a.explained.day_master.replace(/^일간 /, '')} / 상대 ${b.explained.day_master.replace(/^일간 /, '')}`,
    `일간끼리: ${stemBond(dayA, dayB)}`,
    `상대가 나에게: ${godLine(dayA, dayB)}`,
    `내가 상대에게: ${godLine(dayB, dayA)}`,
    `일지(배우자 자리)끼리: ${and(branchWord(branchOf(a, '일주')))} ${branchWord(branchOf(b, '일주'))} — ${branchBond(branchOf(a, '일주'), branchOf(b, '일주'))}`,
    `띠(년지)끼리: ${animals[branchOf(a, '년주')]}띠와 ${animals[branchOf(b, '년주')]}띠 — ${branchBond(branchOf(a, '년주'), branchOf(b, '년주'))}`,
    `오행 채워 주기: ${mine.length ? `내게 없는 ${obj(mine.join('·'))} 상대가 갖고 있다` : '상대가 내 빈 기운을 채워 주지는 않는다'} / ${theirs.length ? `상대에게 없는 ${obj(theirs.join('·'))} 내가 갖고 있다` : '내가 상대의 빈 기운을 채워 주지는 않는다'}`,
  ];
  return { reading: { between, me: forReading(a), partner: forReading(b) }, display: { ...a.display, title: '나' }, partnerDisplay: { ...b.display, title: '상대' } };
}

export type LoungeSajuFortune = { reading: Record<string, unknown>; display: LoungeSajuDisplay };
const seoulToday = (now: Date) => { const date = new Date(now.getTime() + 9 * 3600000); return Solar.fromYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()); };
const periodLabels: Record<LoungeFortunePeriod, string> = { today: '오늘의 일진', month: '이번 달 월운', year: '올해 세운' };
/** 운세: today's day pillar (일진), this month's or this year's, read against the member's own chart. */
export function computeLoungeFortune(me: LoungeBirth, period: LoungeFortunePeriod, now: Date = new Date()): LoungeSajuFortune {
  const chart = computeLoungeSaju({ ...me, focus: '전부' }, now);
  const lunarNow = at(now.getTime() + beijingOffset).getLunar();
  const ganzhi = period === 'today' ? seoulToday(now).getLunar().getDayInGanZhi() : period === 'month' ? lunarNow.getMonthInGanZhiExact() : lunarNow.getYearInGanZhiByLiChun();
  const label = periodLabels[period];
  const day = dayStemOf(chart), mine = branchOf(chart, '일주');
  const brought = [stemElement[ganzhi[0]], branchElement[ganzhi[1]]].filter((name, index, all) => all.indexOf(name) === index);
  const fills = brought.filter(name => chart.missing.includes(name));
  const heavy = brought.filter(name => chart.strong.includes(name));
  const explained = [
    `${label}: ${hangul(ganzhi)}(${ganzhi}) — ${stemText(ganzhi[0])} 위에 ${branchText(ganzhi[1])}`,
    `내 일간: ${chart.explained.day_master.replace(/^일간 /, '')}`,
    `이 기운이 나에게: ${godLine(day, ganzhi[0])}`,
    `내 일지(나 자신의 자리)와: ${and(branchWord(mine))} ${branchWord(ganzhi[1])} — ${branchBond(mine, ganzhi[1])}`,
    `오행: ${brought.map(name => `${name}(${elementHanja[name]})`).join('·')} 기운이 들어온다.${fills.length ? ` 내 사주에 없던 ${fills.join('·')} 기운을 채워 준다.` : ''}${heavy.length ? ` 이미 많은 ${heavy.join('·')} 기운이 더 세진다.` : ''}`,
  ];
  return {
    reading: { period: label, pillar: `${hangul(ganzhi)}(${ganzhi})`, explained, me: forReading(chart) },
    display: { ...chart.display, extra: { label: { today: '오늘', month: '이번 달', year: '올해' }[period], hanja: ganzhi, hangul: hangul(ganzhi), elements: [stemElement[ganzhi[0]], branchElement[ganzhi[1]]] } },
  };
}

const signs: Record<string, Omit<LoungeZodiacDisplay, 'now' | 'house' | 'houseMeaning'>> = {
  春分: { sign: '양자리', symbol: '♈', element: '불', mode: '활동궁', ruler: '화성', keywords: '시작, 용기, 직진, 급한 성미' },
  谷雨: { sign: '황소자리', symbol: '♉', element: '흙', mode: '고정궁', ruler: '금성', keywords: '안정, 감각, 끈기, 고집' },
  小满: { sign: '쌍둥이자리', symbol: '♊', element: '공기', mode: '변통궁', ruler: '수성', keywords: '호기심, 말재주, 변화, 산만함' },
  夏至: { sign: '게자리', symbol: '♋', element: '물', mode: '활동궁', ruler: '달', keywords: '보살핌, 집, 감정, 서운함' },
  大暑: { sign: '사자자리', symbol: '♌', element: '불', mode: '고정궁', ruler: '태양', keywords: '자신감, 표현, 너그러움, 자존심' },
  处暑: { sign: '처녀자리', symbol: '♍', element: '흙', mode: '변통궁', ruler: '수성', keywords: '꼼꼼함, 분석, 도움, 걱정' },
  秋分: { sign: '천칭자리', symbol: '♎', element: '공기', mode: '활동궁', ruler: '금성', keywords: '균형, 관계, 미적 감각, 우유부단' },
  霜降: { sign: '전갈자리', symbol: '♏', element: '물', mode: '고정궁', ruler: '명왕성·화성', keywords: '깊이, 집중, 비밀, 집착' },
  小雪: { sign: '사수자리', symbol: '♐', element: '불', mode: '변통궁', ruler: '목성', keywords: '자유, 모험, 낙관, 덤벙댐' },
  冬至: { sign: '염소자리', symbol: '♑', element: '흙', mode: '활동궁', ruler: '토성', keywords: '책임, 목표, 인내, 딱딱함' },
  大寒: { sign: '물병자리', symbol: '♒', element: '공기', mode: '고정궁', ruler: '천왕성·토성', keywords: '독립, 아이디어, 우정, 거리감' },
  雨水: { sign: '물고기자리', symbol: '♓', element: '물', mode: '변통궁', ruler: '해왕성·목성', keywords: '공감, 상상, 예술, 흔들림' },
};
const signOrder = Object.keys(signs);
const solarTermKo: Record<string, string> = { 春分: '춘분', 谷雨: '곡우', 小满: '소만', 夏至: '하지', 大暑: '대서', 处暑: '처서', 秋分: '추분', 霜降: '상강', 小雪: '소설', 冬至: '동지', 大寒: '대한', 雨水: '우수' };
const elementMeanings: Record<string, string> = { 불: '열정과 행동, 먼저 나서는 힘', 흙: '현실 감각과 꾸준함, 손에 잡히는 결과', 공기: '생각과 말, 사람 사이를 잇는 힘', 물: '감정과 직감, 깊이 공감하는 힘' };
const modeMeanings: Record<string, string> = { 활동궁: '일을 시작하고 밀고 나간다', 고정궁: '한번 정하면 지키고 버틴다', 변통궁: '상황에 맞춰 바꾸고 이어 준다' };
const houseMeanings = ['', '나 자신과 새 출발, 첫인상', '돈과 내가 아끼는 것', '말과 배움, 가까운 사람과 짧은 이동', '집과 가족, 마음의 뿌리', '연애와 즐거움, 표현하고 만드는 일', '매일의 일과 몸의 습관', '파트너와 일대일 관계', '깊은 관계와 함께 쓰는 돈, 끝내고 바뀌는 것', '먼 곳과 공부, 믿음과 넓은 시야', '일과 명예, 목표', '친구와 모임, 바라는 것', '쉼과 정리, 혼자만의 속마음'];
/** The sign the sun was in at an instant: the last of the 12 중기 before it (each is the sun at a multiple of 30°, 춘분 being 양자리). */
const signAt = (instant: number) => at(instant + beijingOffset).getLunar().getPrevQi().getName();

/**
 * 별자리: the sun sign at birth, exact even on a boundary day (the sign starts at the 중기, so it is the last one before the
 * birth), and this month's reading by solar houses as sun-sign columns do it: the house the sun walks through now,
 * counted from the member's sign.
 */
export function computeLoungeZodiac(birth: Pick<LoungeBirth, 'date' | 'calendar' | 'time'>, now: Date = new Date()): { reading: Record<string, unknown>; display: LoungeZodiacDisplay } {
  const solar = solarOf(birth);
  const [hour, minute] = birth.time ? birth.time.split(':').map(Number) : [12, 0];
  const term = signAt(seoulCivilToUtc(solar.year, solar.month, solar.day, hour, minute));
  const sign = signs[term] ?? signs['春分'];
  const nowTerm = signAt(now.getTime());
  const house = ((signOrder.indexOf(nowTerm) - signOrder.indexOf(term) + 12) % 12) + 1;
  const display: LoungeZodiacDisplay = { ...sign, now: `${signs[nowTerm]?.symbol ?? ''} ${signs[nowTerm]?.sign ?? ''}`.trim(), house, houseMeaning: houseMeanings[house] };
  return { display, reading: {
    sign: `${sign.symbol} ${sign.sign}`,
    explained: [
      `태양 별자리: ${sign.symbol} ${sign.sign} — 태양이 ${solarTermKo[term] ?? term}(${term}) 자리를 지난 뒤에 태어났다. 키워드: ${sign.keywords}`,
      `원소: ${sign.element} — ${elementMeanings[sign.element]}`,
      `성질: ${sign.mode} — ${modeMeanings[sign.mode]}`,
      `지배 행성: ${sign.ruler}`,
      `지금 태양: ${display.now}에 있어 내 별자리에서 ${house}번째 하우스를 지난다 — ${houseMeanings[house]}에 빛이 드는 달`,
    ],
    notes: ['태양 별자리만 계산했다. 달 별자리, 상승궁, 행성 배치는 보지 않았다.', ...(birth.time ? [] : ['태어난 시간을 몰라 낮 12시로 봤다. 별자리 경계일이면 하루 차이가 날 수 있다.'])],
  } };
}
