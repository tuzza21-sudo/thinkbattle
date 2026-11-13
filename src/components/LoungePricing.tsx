import { useEffect, useState } from 'react';
import { Check, CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import * as PortOne from '@portone/browser-sdk/v2';
import type { AppUser } from '../types';
import { completeLoungePayment, createLoungePayment, type LoungePaymentOrder } from '../lib/loungeApi';
import { loungeFreePlan, loungePlanReceiptName, loungePlans, loungeTermLabel, type LoungePlan } from '../lib/loungePlans';
import { supabase } from '../lib/supabase';
import { isSaseokApp } from '../lib/nativeApp';
import { LoungeBusinessFooter } from './LoungeBusinessFooter';
import './LoungePricing.css';

const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const phoneDigits = (value: string) => value.replace(/\D/g, '');
const phoneOk = (value: string) => /^01\d{8,9}$/.test(phoneDigits(value));

/**
 * Opens the PortOne (KG Inicis) window. On a phone the page moves to the card company and comes back to /lounge/payment;
 * on a computer the window closes in place and the answer is here: the payment id to check, or why it stopped.
 */
async function openPaymentWindow(order: LoungePaymentOrder): Promise<{ paymentId: string } | { message: string } | null> {
  const response = await PortOne.requestPayment(order.request);
  if (!response) return null;
  if (response.code !== undefined) return { message: response.message || '결제가 완료되지 않았어요.' };
  return { paymentId: response.paymentId };
}

const errorText = (error: unknown) => error instanceof Error ? error.message : '결제를 시작하지 못했어요.';

/** The free plan and the paid plan by the month and by the year, shown at the bottom of the lounge home. */
export function LoungePricing({ user, onLoginRequest }: { user: AppUser | null; onLoginRequest?: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // KG Inicis's PC window needs the buyer's phone number; it is asked for on the card, sent to the window and not kept.
  const [asking, setAsking] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  // In the store app a pass is not sold yet (the stores require their own in-app billing for it): the plans show, without a buy button.
  const inApp = isSaseokApp();
  const start = async (plan: LoungePlan) => {
    setNotice(null);
    if (!user || user.isAnonymous) { setNotice('회원가입 또는 로그인 후 결제할 수 있어요.'); onLoginRequest?.(); return; }
    const mobile = isMobile();
    if (!mobile && !phoneOk(phone)) { setAsking(plan.key); return; }
    setBusy(plan.key);
    try {
      const done = await openPaymentWindow(await createLoungePayment(plan.id, plan.term, mobile ? 'mobile' : 'pc', mobile ? undefined : phoneDigits(phone)));
      if (done && 'paymentId' in done) navigate(`/lounge/payment?paymentId=${encodeURIComponent(done.paymentId)}`);
      else if (done) setNotice(done.message);
    }
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
        {inApp ? <p className="lounge-pricing-included">앱에서는 아직 이용권을 구매할 수 없어요</p> : <>
          {asking === plan.key && <form className="lounge-pricing-phone" onSubmit={event => { event.preventDefault(); void start(plan); }}>
            <label htmlFor={`lounge-pay-phone-${plan.key}`}>휴대폰 번호</label>
            <input id={`lounge-pay-phone-${plan.key}`} type="tel" inputMode="numeric" autoComplete="tel" placeholder="010-1234-5678" maxLength={13} value={phone} onChange={event => setPhone(event.target.value)} autoFocus />
            <p>카드 결제창(KG이니시스)에 필요해요. 결제창에만 전달하고 사석에는 저장하지 않아요.</p>
          </form>}
          <button type="button" className="lounge-pricing-cta" disabled={busy !== null || (asking === plan.key && !phoneOk(phone))} onClick={() => void start(plan)}>
            {busy === plan.key ? <><LoaderCircle size={15} className="lounge-pricing-spin" aria-hidden="true" /> 결제창 여는 중</> : asking === plan.key ? '결제창 열기' : `${plan.name} 시작하기`}
          </button>
        </>}
      </li>)}
    </ul>
    {notice && <p className="lounge-pricing-notice" role="status">{notice}</p>}
    <p className="lounge-pricing-fine">부가세 포함 가격이에요. 결제한 날부터 월간은 1개월, 연간은 1년 동안 이용할 수 있고, 자동으로 다시 결제되지 않아요. 결제는 포트원을 거쳐 KG이니시스에서 안전하게 처리돼요. 결제 후 7일 안에 늘어난 기능을 쓰지 않았다면 계정 관리의 ‘이용권’에서 바로 취소하고 환불받을 수 있어요. 그 밖의 취소·환불은 <Link to="/terms">이용약관</Link>을 확인하거나 <a href="mailto:ask.saseok@gmail.com">ask.saseok@gmail.com</a>으로 문의해 주세요.</p>
  </section>;
}

/** /lounge/pricing: the plans on a page of their own, linked from the header. */
export function LoungePricingPage({ user, onLoginRequest }: { user: AppUser | null; onLoginRequest?: () => void }) {
  return <main className="lounge-lobby lounge-home"><LoungePricing user={user} onLoginRequest={onLoginRequest} /></main>;
}

type PaymentRecord = { plan: string; amount: number; status: string; period_end: string | null };
const dateText = (value: string) => new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * /lounge/payment: where the member lands after paying. It comes with ?paymentId=… (from the window on a computer, or back
 * from the card company on a phone, then with code and message when it stopped), which the server checks with PortOne;
 * the address is then replaced by the result so a reload does not check again.
 */
export function LoungePaymentResult() {
  const [params, setParams] = useSearchParams();
  const paymentId = params.get('paymentId');
  const checking = Boolean(paymentId) && !params.get('result');
  const success = params.get('result') === 'success';
  const oid = params.get('oid') ?? '';
  const code = params.get('code') ?? undefined, stopped = params.get('message') ?? undefined;
  const [record, setRecord] = useState<PaymentRecord | null | undefined>(undefined);
  useEffect(() => {
    if (!checking || !paymentId) return;
    let cancelled = false;
    void completeLoungePayment(paymentId, code, stopped)
      .then(done => { if (!cancelled) setParams(done.result === 'success' ? { result: 'success', oid: done.oid } : { result: 'fail', message: done.message }, { replace: true }); })
      .catch(() => { if (!cancelled) setParams({ result: 'fail', message: '결제 결과를 확인하지 못했어요. 결제가 됐다면 잠시 뒤 계정 관리의 이용권에 보여요.' }, { replace: true }); });
    return () => { cancelled = true; };
  }, [checking, paymentId, code, stopped, setParams]);
  useEffect(() => {
    if (!success || !oid) { setRecord(null); return; }
    let cancelled = false;
    setRecord(undefined);
    void supabase.from('lounge_payments').select('plan,amount,status,period_end').eq('oid', oid).maybeSingle()
      .then(({ data }) => { if (!cancelled) setRecord((data as PaymentRecord | null) ?? null); });
    return () => { cancelled = true; };
  }, [success, oid]);
  const plan = record ? loungePlanReceiptName(record.plan, oid) : undefined;
  return <div className="lounge-page lounge-payment-page">
    <main className="lounge-payment-result">
      {checking ? <>
        <LoaderCircle size={40} className="lounge-pricing-spin lounge-payment-icon ok" aria-hidden="true" />
        <h1>결제를 확인하고 있어요</h1>
        <p>잠시만 기다려 주세요. 이 화면을 닫아도 결제는 그대로 처리돼요.</p>
      </> : success ? <>
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
      {!checking && <div className="lounge-payment-actions">
        <Link to="/lounge" className="lounge-pricing-cta solid">홈으로</Link>
        {!success && <Link to="/lounge/pricing" className="lounge-pricing-cta">요금제 다시 보기</Link>}
      </div>}
      <p className="lounge-pricing-fine">결제 관련 문의: <a href="mailto:ask.saseok@gmail.com">ask.saseok@gmail.com</a></p>
    </main>
    <LoungeBusinessFooter />
  </div>;
}
