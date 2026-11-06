import { useState } from 'react';
import { Check } from 'lucide-react';
import './LoungePricing.css';

type Plan = { id: 'plus' | 'pro'; name: string; price: number; tagline: string; featured?: boolean; features: string[] };

// Temporary plans shown on the home while payments are being set up; nothing here is enforced yet.
const plans: Plan[] = [
  {
    id: 'plus', name: 'Plus', price: 20_000, tagline: '매일 조금씩, 꾸준히 이야기하고 싶다면',
    features: ['음성 통화 하루 30분', '채팅 무제한', '내 프로필 설정 최대 1,500자', '이미지 전송 하루 10장', '나만의 캐릭터 5개', '페르소나 5개'],
  },
  {
    id: 'pro', name: 'Pro', price: 30_000, tagline: '더 길게, 더 깊게 이야기하고 싶다면', featured: true,
    features: ['음성 통화 하루 60분', '채팅 무제한', '내 프로필 설정 최대 3,000자', '이미지 전송 하루 30장', '나만의 캐릭터 10개', '페르소나 10개', '새 캐릭터와 기능 먼저 만나기'],
  },
];

/** The paid plans, shown at the bottom of the lounge home. */
export function LoungePricing() {
  const [notice, setNotice] = useState<string | null>(null);
  return <section className="lounge-home-section lounge-pricing" id="pricing" aria-labelledby="lounge-pricing-title">
    <header className="lounge-home-subhead">
      <h2 id="lounge-pricing-title">요금제</h2>
      <p>더 오래 통화하고, 캐릭터가 나를 더 잘 알게 하고 싶다면 골라 보세요.</p>
    </header>
    <ul className="lounge-pricing-grid">
      {plans.map(plan => <li key={plan.id} className={`lounge-pricing-card${plan.featured ? ' featured' : ''}`}>
        <div className="lounge-pricing-head">
          <strong>{plan.name}</strong>
          {plan.featured && <span className="lounge-pricing-badge">추천</span>}
        </div>
        <p className="lounge-pricing-tagline">{plan.tagline}</p>
        <p className="lounge-pricing-price"><b>{plan.price.toLocaleString('ko-KR')}원</b><span>/ 월</span></p>
        <ul className="lounge-pricing-features">
          {plan.features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}
        </ul>
        <button type="button" className="lounge-pricing-cta" onClick={() => setNotice(`${plan.name} 결제는 준비 중이에요. 곧 열릴게요.`)}>{plan.name} 시작하기</button>
      </li>)}
    </ul>
    {notice && <p className="lounge-pricing-notice" role="status">{notice}</p>}
    <p className="lounge-pricing-fine">부가세 포함 가격이에요. 매월 같은 날 자동으로 결제되고, 다음 결제일 전까지 언제든 해지할 수 있어요. 문의 <a href="mailto:ask.saseok@gmail.com">ask.saseok@gmail.com</a></p>
  </section>;
}
