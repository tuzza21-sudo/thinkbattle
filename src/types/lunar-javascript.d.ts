// The few parts of lunar-javascript (MIT, https://github.com/6tail/lunar-javascript) that src/lib/loungeSaju.ts uses.
declare module 'lunar-javascript' {
  export interface LunarYunDa { getStartAge(): number; getStartYear(): number; getGanZhi(): string }
  export interface LunarYun { getStartYear(): number; getStartMonth(): number; getStartDay(): number; getDaYun(count?: number): LunarYunDa[] }
  export interface LunarEightChar {
    getYear(): string; getMonth(): string; getDay(): string; getTime(): string;
    getYearShiShenGan(): string; getMonthShiShenGan(): string; getTimeShiShenGan(): string;
    getYearShiShenZhi(): string[]; getMonthShiShenZhi(): string[]; getDayShiShenZhi(): string[]; getTimeShiShenZhi(): string[];
    getYun(gender: number): LunarYun;
  }
  export interface LunarJieQi { getName(): string; getSolar(): SolarDate }
  export interface LunarDate { getEightChar(): LunarEightChar; getSolar(): SolarDate; getYearInGanZhiByLiChun(): string; getMonthInGanZhiExact(): string; getDayInGanZhi(): string; getPrevQi(): LunarJieQi }
  export interface SolarDate { getYear(): number; getMonth(): number; getDay(): number; getLunar(): LunarDate; toYmd(): string }
  export const Solar: { fromYmdHms(year: number, month: number, day: number, hour: number, minute: number, second: number): SolarDate; fromYmd(year: number, month: number, day: number): SolarDate };
  export const Lunar: { fromYmdHms(year: number, month: number, day: number, hour: number, minute: number, second: number): LunarDate };
}
