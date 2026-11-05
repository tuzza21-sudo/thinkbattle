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
import type { LoungeSajuInput } from './loungeConsult';

const stems: Record<string, string> = { 甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계' };
const branches: Record<string, string> = { 子: '자', 丑: '축', 寅: '인', 卯: '묘', 辰: '진', 巳: '사', 午: '오', 未: '미', 申: '신', 酉: '유', 戌: '술', 亥: '해' };
const stemElement: Record<string, string> = { 甲: '목', 乙: '목', 丙: '화', 丁: '화', 戊: '토', 己: '토', 庚: '금', 辛: '금', 壬: '수', 癸: '수' };
const branchElement: Record<string, string> = { 寅: '목', 卯: '목', 巳: '화', 午: '화', 辰: '토', 戌: '토', 丑: '토', 未: '토', 申: '금', 酉: '금', 亥: '수', 子: '수' };
const yang = new Set(['甲', '丙', '戊', '庚', '壬']);
const tenGods: Record<string, string> = { 比肩: '비견', 劫财: '겁재', 食神: '식신', 伤官: '상관', 偏财: '편재', 正财: '정재', 七杀: '편관', 正官: '정관', 偏印: '편인', 正印: '정인', 日主: '일간' };
const hangul = (ganzhi: string) => `${stems[ganzhi[0]] ?? ganzhi[0]}${branches[ganzhi[1]] ?? ganzhi[1]}`;
const god = (name: string | undefined) => (name && tenGods[name]) ?? name ?? '';

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
  const chars = [byTerms.getYear(), byTerms.getMonth(), bySun.getDay(), ...(input.time ? [bySun.getTime()] : [])];
  const counts = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const pair of chars) { counts[stemElement[pair[0]] as keyof typeof counts]++; counts[branchElement[pair[1]] as keyof typeof counts]++; }
  const top = Math.max(...Object.values(counts));
  const dayStem = bySun.getDay()[0];
  const nowSolar = at(now.getTime() + beijingOffset).getLunar();
  const chart: LoungeSajuChart = {
    pillars: { year: hangul(byTerms.getYear()), month: hangul(byTerms.getMonth()), day: hangul(bySun.getDay()), hour: input.time ? hangul(bySun.getTime()) : null },
    day_master: `${stems[dayStem]}${stemElement[dayStem]}(${yang.has(dayStem) ? '양' : '음'})`,
    five_elements: counts,
    strong: Object.entries(counts).filter(([, value]) => value === top && value >= 3).map(([name]) => name),
    missing: Object.entries(counts).filter(([, value]) => value === 0).map(([name]) => name),
    ten_gods: {
      year: god(byTerms.getYearShiShenGan()), month: god(byTerms.getMonthShiShenGan()), hour: input.time ? god(bySun.getTimeShiShenGan()) : null,
      year_branch: god(byTerms.getYearShiShenZhi()[0]), month_branch: god(byTerms.getMonthShiShenZhi()[0]), day_branch: god(bySun.getDayShiShenZhi()[0]),
      hour_branch: input.time ? god(bySun.getTimeShiShenZhi()[0]) : null,
    },
    this_year: hangul(nowSolar.getYearInGanZhiByLiChun()), this_month: hangul(nowSolar.getMonthInGanZhiExact()),
    solar_date: `${solar.year}-${String(solar.month).padStart(2, '0')}-${String(solar.day).padStart(2, '0')}`, notes,
  };
  // 대운 (luck pillars) run forward or backward by gender, so they are left out when it is not given.
  if (input.gender !== 'none') {
    const yun = byTerms.getYun(input.gender === 'male' ? 1 : 0);
    const list = yun.getDaYun(10).filter(item => item.getStartAge() > 0);
    const age = now.getUTCFullYear() - solar.year + 1;
    const current = [...list].reverse().find(item => item.getStartAge() <= age);
    chart.daewoon = { start_age: list[0]?.getStartAge() ?? 0, list: list.slice(0, 8).map(item => `${item.getStartAge()}세 ${hangul(item.getGanZhi())}`), current: current ? hangul(current.getGanZhi()) : null };
  } else notes.push('성별을 밝히지 않아 대운은 빼고 봤다.');
  return chart;
}
