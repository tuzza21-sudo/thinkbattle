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
import type { LoungeSajuDisplay, LoungeSajuInput } from './loungeConsult';

const stems: Record<string, string> = { 甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계' };
const branches: Record<string, string> = { 子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해' };
const stemElement: Record<string, string> = { 甲: '목', 乙: '목', 丙: '화', 丁: '화', 戊: '토', 己: '토', 庚: '금', 辛: '금', 壬: '수', 癸: '수' };
const branchElement: Record<string, string> = { 寅: '목', 卯: '목', 巳: '화', 午: '화', 辰: '토', 戌: '토', 丑: '토', 未: '토', 申: '금', 酉: '금', 亥: '수', 子: '수' };
const yang = new Set(['甲', '丙', '戊', '庚', '壬']);
const tenGods: Record<string, string> = { 比肩: '비견', 劫财: '겁재', 食神: '식신', 伤官: '상관', 偏财: '편재', 正财: '정재', 七杀: '편관', 正官: '정관', 偏印: '편인', 正印: '정인', 日主: '일간' };
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

/** The chart for a birth, read as above; `now` decides this year's and this month's pillars and the current luck pillar. */
export function computeLoungeSaju(input: LoungeSajuInput, now: Date = new Date()): LoungeSajuChart {
  const [year, month, day] = input.date.split('-').map(Number);
  const notes: string[] = [];
  let solar = { year, month, day };
  if (input.calendar !== 'solar') {
    const converted = Lunar.fromYmdHms(year, input.calendar === 'lunar_leap' ? -month : month, day, 12, 0, 0).getSolar();
    solar = { year: converted.getYear(), month: converted.getMonth(), day: converted.getDay() };
    notes.push('음력으로 받은 날짜를 양력으로 바꿔 봤다. 드물게 하루 차이가 날 수 있다.');
  }
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
      ten_gods: gods.filter(([, name]) => tenGodMeaning[name]).map(([where, name]) => `${where} ${god(name)}(${name}) — ${tenGodMeaning[name]}`),
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
