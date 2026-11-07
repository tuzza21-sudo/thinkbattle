/** Paid plans. The server charges the price defined here, never one sent by the browser. */
export type LoungePlanId = 'plus' | 'pro';

export type LoungePlan = { id: LoungePlanId; name: string; price: number; tagline: string; featured?: boolean; features: string[] };

export const loungePlans: LoungePlan[] = [
  {
    id: 'plus', name: 'Plus', price: 20_000, tagline: '매일 조금씩, 꾸준히 이야기하고 싶다면',
    features: ['음성 통화 월 60분', '채팅 무제한', '내 프로필 설정 최대 1,500자', '이미지 전송 하루 10장', '관계가 깊어지면 캐릭터가 먼저 사진 보내기', '나만의 캐릭터 5개', '페르소나 5개'],
  },
  {
    id: 'pro', name: 'Pro', price: 30_000, tagline: '더 길게, 더 깊게 이야기하고 싶다면', featured: true,
    features: ['음성 통화 월 120분', '채팅 무제한', '내 프로필 설정 최대 3,000자', '이미지 전송 하루 30장', '관계가 깊어지면 캐릭터가 먼저 사진 보내기', '나만의 캐릭터 10개', '페르소나 10개', '새 캐릭터와 기능 먼저 만나기'],
  },
];

/**
 * Minutes of voice calls a month (the month in Korea), counted as the time spent in calls, not as characters spoken.
 * A member with no plan has LOUNGE_FREE_CALL_MINUTES (5 when unset), but only one who signed up after the limit began
 * (lounge_call_limits.applies_from); a beta tester has LOUNGE_TESTER_CALL_MINUTES (30); the earlier members and the super
 * admin have no limit (lounge_call_exempt in the database). The limit is applied unless LOUNGE_CALL_LIMITS=off.
 */
export const loungeCallMinutes: Record<LoungePlanId, number> = { plus: 60, pro: 120 };
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

export const getLoungePlan = (id: unknown) => loungePlans.find(plan => plan.id === id);

/** What the payment window shows as the product name. */
export const loungePlanGoodName = (plan: LoungePlan) => `사석 ${plan.name} 1개월 이용권`;
