import { useEffect, useState } from 'react';
import { Check, CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AppUser } from '../types';
import { createLoungePayment, type LoungePaymentOrder } from '../lib/loungeApi';
import { loungeFreePlan, loungePlanReceiptName, loungePlans, loungeTermLabel, type LoungePlan } from '../lib/loungePlans';
import { supabase } from '../lib/supabase';
import { isSaseokApp } from '../lib/nativeApp';
import { LoungeBusinessFooter } from './LoungeBusinessFooter';
import './LoungePricing.css';

declare global { interface Window { INIStdPay?: { pay: (formId: string) => void } } }

const FORM_ID = 'lounge-inicis-form';
const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
  if (window.INIStdPay && document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
  const script = document.createElement('script');
  script.src = src; script.charset = 'UTF-8';
  script.onload = () => resolve();
  script.onerror = () => reject(new Error('결제창을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'));
  document.head.appendChild(script);
});

/** Builds the hidden form Inicis reads, then opens the overlay (PC) or moves to the Inicis mobile page. */
async function openPaymentWindow(order: LoungePaymentOrder) {
  document.getElementById(FORM_ID)?.remove();
  const form = document.createElement('form');
  form.id = FORM_ID; form.method = 'POST'; form.acceptCharset = 'UTF-8'; form.hidden = true;
  for (const [name, value] of Object.entries(order.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  // Inicis's mobile page reads the request as EUC-KR (P_CHARSET only sets the charset of what comes back).
  if (order.mode === 'mobile') { form.acceptCharset = 'EUC-KR'; form.action = order.actionUrl; form.submit(); return; }
  await loadScript(order.scriptUrl);
  if (!window.INIStdPay) throw new Error('결제창을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  window.INIStdPay.pay(FORM_ID);
}

const errorText = (error: unknown) => error instanceof Error ? error.message : '결제를 시작하지 못했어요.';

/** The free plan and the paid plan by the month and by the year, shown at the bottom of the lounge home. */
export function LoungePricing({ user, onLoginRequest }: { user: AppUser | null; onLoginRequest?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // In the store app a pass is not sold yet (the stores require their own in-app billing for it): the plans show, without a buy button.
  const inApp = isSaseokApp();
  const start = async (plan: LoungePlan) => {
    setNotice(null);
    if (!user || user.isAnonymous) { setNotice('회원가입 또는 로그인 후 결제할 수 있어요.'); onLoginRequest?.(); return; }
    setBusy(plan.key);
    try { await openPaymentWindow(await createLoungePayment(plan.id, plan.term, isMobile() ? 'mobile' : 'pc')); }
    catch (error) { setNotice(errorText(error)); }
    finally { setBusy(null); }
  };
  return <section className="lounge-home-section lounge-pricing" id="pricing" aria-labelledby="lounge-pricing-title">
    <header className="lounge-home-subhead">
      <h2 id="lounge-pricing-title">요금제(안)</h2>
      <p>무료로 시작하고, 더 오래 통화하고 캐릭터가 나를 더 잘 알게 하고 싶다면 Pro를 골라 보세요.</p>
      <p className="lounge-pricing-draft">지금 보이는 요금제는 안이에요. 테스트 오픈 중에는 요금과 이용 한도가 바뀔 수 있고, 바뀌면 서비스 화면으로 미리 알려 드려요.</p>
    </header>
    <ul className="lounge-pricing-grid">
      <li className="lounge-pricing-card free">
        <div className="lounge-pricing-head"><strong>{loungeFreePlan.name}</strong></div>
        <p className="lounge-pricing-tagline">{loungeFreePlan.tagline}</p>
        <p className="lounge-pricing-price"><b>0원</b></p>
        <ul className="lounge-pricing-features">
          {loungeFreePlan.features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}
        </ul>
        <p className="lounge-pricing-included">가입하면 바로 이용할 수 있어요</p>
      </li>
      {loungePlans.map(plan => <li key={plan.key} className={`lounge-pricing-card${plan.featured ? ' featured' : ''}`}>
        <div className="lounge-pricing-head">
          <strong>{plan.name}</strong>
          {plan.badge && <span className="lounge-pricing-badge">{plan.badge}</span>}
        </div>
        <p className="lounge-pricing-tagline">{plan.tagline}</p>
        <p className="lounge-pricing-price"><b>{plan.price.toLocaleString('ko-KR')}원</b><span>/ {loungeTermLabel(plan.term)}</span></p>
        {plan.perMonth && <p className="lounge-pricing-permonth">{plan.perMonth}</p>}
        <ul className="lounge-pricing-features">
          {plan.features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}
        </ul>
        {inApp ? <p className="lounge-pricing-included">앱에서는 아직 이용권을 구매할 수 없어요</p> : <button type="button" className="lounge-pricing-cta" disabled={busy !== null} onClick={() => void start(plan)}>
          {busy === plan.key ? <><LoaderCircle size={15} className="lounge-pricing-spin" aria-hidden="true" /> 결제창 여는 중</> : `${plan.name} 시작하기`}
        </button>}
      </li>)}
    </ul>
    {notice && <p className="lounge-pricing-notice" role="status">{notice}</p>}
    <p className="lounge-pricing-fine">부가세 포함 가격이에요. 결제한 날부터 월간은 1개월, 연간은 1년 동안 이용할 수 있고, 자동으로 다시 결제되지 않아요. 결제는 KG이니시스에서 안전하게 처리돼요. 결제 후 7일 안에 늘어난 기능을 쓰지 않았다면 계정 관리의 ‘이용권’에서 바로 취소하고 환불받을 수 있어요. 그 밖의 취소·환불은 <Link to="/terms">이용약관</Link>을 확인하거나 <a href="mailto:ask.saseok@gmail.com">ask.saseok@gmail.com</a>으로 문의해 주세요.</p>
  </section>;
}

/** /lounge/pricing: the plans on a page of their own, linked from the header. */
export function LoungePricingPage({ user, onLoginRequest }: { user: AppUser | null; onLoginRequest?: () => void }) {
  return <main className="lounge-lobby lounge-home"><LoungePricing user={user} onLoginRequest={onLoginRequest} /></main>;
}

type PaymentRecord = { plan: string; amount: number; status: string; period_end: string | null };
const dateText = (value: string) => new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

/** Where Inicis sends the member back after paying (/lounge/payment). */
export function LoungePaymentResult() {
  const [params] = useSearchParams();
  const success = params.get('result') === 'success';
  const oid = params.get('oid') ?? '';
  const [record, setRecord] = useState<PaymentRecord | null | undefined>(success && oid ? undefined : null);
  useEffect(() => {
    if (!success || !oid) return;
    let cancelled = false;
    void supabase.from('lounge_payments').select('plan,amount,status,period_end').eq('oid', oid).maybeSingle()
      .then(({ data }) => { if (!cancelled) setRecord((data as PaymentRecord | null) ?? null); });
    return () => { cancelled = true; };
  }, [success, oid]);
  const plan = record ? loungePlanReceiptName(record.plan, oid) : undefined;
  return <div className="lounge-page lounge-payment-page">
    <main className="lounge-payment-result">
      {success ? <>
        <CircleCheck size={40} className="lounge-payment-icon ok" aria-hidden="true" />
        <h1>결제가 완료됐어요</h1>
        {record === undefined ? <p><LoaderCircle size={15} className="lounge-pricing-spin" aria-hidden="true" /> 결제 내역을 불러오는 중이에요.</p>
          : record && plan ? <dl className="lounge-payment-summary">
            <div><dt>요금제</dt><dd>{plan}</dd></div>
            <div><dt>결제 금액</dt><dd>{record.amount.toLocaleString('ko-KR')}원</dd></div>
            {record.period_end && <div><dt>이용 기간</dt><dd>{dateText(record.period_end)}까지</dd></div>}
            <div><dt>주문번호</dt><dd>{oid}</dd></div>
          </dl>
          : <p>주문번호 {oid}. 결제 내역은 로그인한 계정에서 확인할 수 있어요.</p>}
      </> : <>
        <CircleAlert size={40} className="lounge-payment-icon fail" aria-hidden="true" />
        <h1>결제가 완료되지 않았어요</h1>
        <p>{params.get('message') || '결제가 취소됐거나 처리되지 않았어요.'}</p>
      </>}
      <div className="lounge-payment-actions">
        <Link to="/lounge" className="lounge-pricing-cta solid">홈으로</Link>
        {!success && <Link to="/lounge" className="lounge-pricing-cta">요금제 다시 보기</Link>}
      </div>
      <p className="lounge-pricing-fine">결제 관련 문의: <a href="mailto:ask.saseok@gmail.com">ask.saseok@gmail.com</a></p>
    </main>
    <LoungeBusinessFooter />
  </div>;
}
