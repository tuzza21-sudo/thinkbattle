/**
 * The one paid plan (2026-11-08): Pro, sold by the month or by the year. The server charges the price defined here, never
 * one sent by the browser. 'plus' is what the first buyers have in the database (60 minutes of calls a month); it is no
 * longer sold, but stays a plan id so their running months, refunds and limits keep working.
 */
export type LoungePlanId = 'plus' | 'pro';
export type LoungePlanTerm = 'month' | 'year';

export type LoungePlan = { id: LoungePlanId; term: LoungePlanTerm; key: string; name: string; price: number; tagline: string; featured?: boolean; badge?: string; perMonth?: string; features: string[] };

/** The plan every member has: shown on the left of the plans; nothing to buy. */
export const loungeFreePlan = {
  name: '무료', price: 0, tagline: '가볍게 이야기를 시작해 보고 싶다면',
  features: ['일 채팅 30회', '이한결 사주 일 1회 제공'],
};

const proFeatures = ['음성 통화 월 100분', '채팅 무제한', '이한결 무속인의 타로(카드점)·사주 등 운명 상담 포함', '유저와의 대화 맥락 장기기억 유지 기능', '나만의 캐릭터 제작 기능', '내 페르소나 설정(서사 포함) 최대 3,000자', '이미지 전송 월 30장(캐릭터가 보낸 사진·직접 만든 사진 포함)', '새 캐릭터와 기능 먼저 만나기', '자율형 능동 에이전트형 캐릭터 (준비중)'];

export const loungePlans: LoungePlan[] = [
  { id: 'pro', term: 'month', key: 'pro-month', name: 'Pro 월간', price: 20_000, tagline: '더 길게, 더 깊게 이야기하고 싶다면', features: proFeatures },
  { id: 'pro', term: 'year', key: 'pro-year', name: 'Pro 연간', price: 150_000, tagline: '1년 동안 꾸준히, 더 저렴하게', featured: true, badge: '연 90,000원 절약', perMonth: '월 12,500원 꼴', features: proFeatures },
];

/** The year in a plan's name and receipts: an order id from a year plan starts with SY, a month's with SS. */
export const loungeOrderPrefix: Record<LoungePlanTerm, string> = { month: 'SS', year: 'SY' };
export const loungeOrderTerm = (oid: unknown): LoungePlanTerm => typeof oid === 'string' && oid.startsWith(loungeOrderPrefix.year) ? 'year' : 'month';
export const loungeTermLabel = (term: LoungePlanTerm) => term === 'year' ? '1년' : '1개월';
/** The plan as a receipt names it: "Pro 1개월 이용권"; Plus for the first buyers. */
export const loungePlanReceiptName = (id: unknown, oid: unknown) => id === 'pro' || id === 'plus' ? `${id === 'pro' ? 'Pro' : 'Plus'} ${loungeTermLabel(loungeOrderTerm(oid))} 이용권` : String(id ?? '');

/**
 * Minutes of voice calls a month (the month in Korea), counted as the time spent in calls, not as characters spoken.
 * A member with no plan has LOUNGE_FREE_CALL_MINUTES (5 when unset), but only one who signed up after the limit began
 * (lounge_call_limits.applies_from); a beta tester has LOUNGE_TESTER_CALL_MINUTES (30); the earlier members and the super
 * admin have no limit (lounge_call_exempt in the database). The limit is applied unless LOUNGE_CALL_LIMITS=off.
 */
export const loungeCallMinutes: Record<LoungePlanId, number> = { plus: 60, pro: 100 };
export const loungeFreeCallMinutesDefault = 5;
/** A beta tester without a plan: 30 minutes a month (LOUNGE_TESTER_CALL_MINUTES). */
export const loungeTesterCallMinutesDefault = 30;
export function loungeCallLimitMinutes(plan: unknown, env: Record<string, string | undefined>, tester = false) {
  if (plan === 'plus' || plan === 'pro') return loungeCallMinutes[plan];
  if (tester) {
    const value = Number(env.LOUNGE_TESTER_CALL_MINUTES);
    return env.LOUNGE_TESTER_CALL_MINUTES?.trim() && Number.isFinite(value) && value >= 0 ? Math.floor(value) : loungeTesterCallMinutesDefault;
  }
  const value = Number(env.LOUNGE_FREE_CALL_MINUTES);
  return env.LOUNGE_FREE_CALL_MINUTES?.trim() && Number.isFinite(value) && value >= 0 ? Math.floor(value) : loungeFreeCallMinutesDefault;
}
export const loungeCallLimitsOn = (env: Record<string, string | undefined>) => env.LOUNGE_CALL_LIMITS !== 'off';

/** Seconds as the call time is told: "12분 34초". */
export const loungeCallDuration = (seconds: number) => { const total = Math.max(0, Math.floor(seconds)); return `${Math.floor(total / 60)}분 ${total % 60}초`; };
/**
 * The line on the call screen: the time spent in calls this month, counted to the second and told as minutes and seconds,
 * against the plan's minutes when there is one (or a limit in force). `extraSeconds` is the time since the server's count.
 */
export function loungeCallAllowanceText(call?: { usedSeconds: number; limitMinutes: number | null; plan: unknown; enforced: boolean } | null, extraSeconds = 0) {
  if (!call) return '';
  const used = loungeCallDuration(call.usedSeconds + extraSeconds);
  return call.limitMinutes !== null && (call.plan || call.enforced) ? `이번 달 통화 ${used} / ${call.limitMinutes}분` : `이번 달 통화 ${used}`;
}

/**
 * The photo a character sends first, unasked (2026-11-07), is for Plus and Pro. It comes at a moment the relationship
 * marks: a step closer (the stage went up), or something that mattered went well (a promise kept, a plan carried out, a
 * deep thing shared). The reply model is never left to find the moment: a one-to-one chat (messenger) did not tell it
 * about photos at all, so none came first. A step closer always sends one; the other moments at most once in
 * `loungeFirstPhotoCooldownHours`; the day's limit of unasked photos (2) is the database's.
 */
export const loungeFirstPhotoEvents = ['KEEPS_PROMISE', 'FOLLOWS_THROUGH', 'SHARES_VULNERABILITY'] as const;
export const loungeFirstPhotoCooldownHours = 12;
export function loungeFirstPhotoMoment(change?: { stage?: string | null; events?: ReadonlyArray<{ type: string; up?: boolean }> } | null): 'stage' | 'event' | undefined {
  if (!change) return undefined;
  if (change.stage === 'promoted') return 'stage';
  return change.events?.some(event => event.up !== false && (loungeFirstPhotoEvents as readonly string[]).includes(event.type)) ? 'event' : undefined;
}
/** What the photo is asked for (the character writes the scene and its own caption from the talk). */
export const loungeFirstPhotoRequest = { stage: '둘의 사이가 한 걸음 가까워진 지금, 캐릭터가 먼저 보내는 사진. 방금 장면과 이어지게.', event: '방금 일어난 일 뒤에 캐릭터가 먼저 보내는 사진. 방금 장면과 이어지게.' } as const;

/**
 * What a character remembers in a reply (2026-11-07). The same for every member, whatever the plan: this is a beta that
 * tests whether the talk is worth coming back to, so the plans differ only in what costs money (calls, photos,
 * characters). A conversation keeps up to 40 long-term memories per character; each reply is shown `prompt` of them
 * (`relevant` when they can be picked by what is being talked about), the latest `recent` messages as they were written
 * (in a one-to-one chat), and a running summary of the whole conversation of at most `summary` characters.
 */
export const loungeMemoryLimits = { prompt: 8, relevant: 12, recent: 20, summary: 900 } as const;

/**
 * Photos a member may receive in a month (the month in Korea), counting the ones a character sends first and the ones
 * the member asks for: Plus 10, Pro 30, a member without a plan 3, the super admin no limit. The database counts them
 * (claim_lounge_character_photo); the daily number the admin sets stays on top as a ceiling.
 */
export const loungePhotoMonthly: Record<'free' | LoungePlanId, number> = { free: 3, plus: 10, pro: 30 };
export const loungePhotoMonthlyFor = (plan: unknown): number => loungePhotoMonthly[plan === 'pro' ? 'pro' : plan === 'plus' ? 'plus' : 'free'];

/** A plan on sale, by id and term (the month when no term is named); the first buyers' Plus is not on sale. */
export const getLoungePlan = (id: unknown, term: unknown = 'month') => loungePlans.find(plan => plan.id === id && plan.term === (term === 'year' ? 'year' : 'month'));

/** What the payment window shows as the product name. */
export const loungePlanGoodName = (plan: LoungePlan) => `사석 Pro ${loungeTermLabel(plan.term)} 이용권`;
