/** Paid plans. The server charges the price defined here, never one sent by the browser. */
export type LoungePlanId = 'plus' | 'pro';

export type LoungePlan = { id: LoungePlanId; name: string; price: number; tagline: string; featured?: boolean; features: string[] };

export const loungePlans: LoungePlan[] = [
  {
    id: 'plus', name: 'Plus', price: 20_000, tagline: '매일 조금씩, 꾸준히 이야기하고 싶다면',
    features: ['음성 통화 하루 30분', '채팅 무제한', '내 프로필 설정 최대 1,500자', '이미지 전송 하루 10장', '나만의 캐릭터 5개', '페르소나 5개'],
  },
  {
    id: 'pro', name: 'Pro', price: 30_000, tagline: '더 길게, 더 깊게 이야기하고 싶다면', featured: true,
    features: ['음성 통화 하루 60분', '채팅 무제한', '내 프로필 설정 최대 3,000자', '이미지 전송 하루 30장', '나만의 캐릭터 10개', '페르소나 10개', '새 캐릭터와 기능 먼저 만나기'],
  },
];

export const getLoungePlan = (id: unknown) => loungePlans.find(plan => plan.id === id);

/** What the payment window shows as the product name. */
export const loungePlanGoodName = (plan: LoungePlan) => `사석 ${plan.name} 1개월 이용권`;
