import { useEffect, useState } from 'react';
import { CircleAlert, LoaderCircle, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cancelLoungePlan, getLoungePlanStatus, type LoungePlanStatus } from '../lib/loungeApi';
import { loungePlanReceiptName } from '../lib/loungePlans';

const dateText = (value: string) => new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
const errorText = (error: unknown) => error instanceof Error ? error.message : '이용권을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';

/**
 * 계정 관리 › 이용권 (2026-11-07): the plan the member has now and the button that cancels it. Within 7 days of paying and
 * with none of the paid features used, the cancellation refunds the whole amount on the spot (api/payments.ts); in any
 * other case the button is off and the page says why and where to write for the prorated refund the terms promise.
 */
export function LoungeSubscription({ onNavigate }: { onNavigate?: () => void }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; order: LoungePlanStatus | null } | { status: 'done'; amount: number }>({ status: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getLoungePlanStatus().then(order => { if (!cancelled) setState({ status: 'ready', order }); }, failure => { if (!cancelled) setState({ status: 'error', message: errorText(failure) }); });
    return () => { cancelled = true; };
  }, []);

  const cancel = async (order: LoungePlanStatus) => {
    if (busy) return;
    setBusy(true); setError('');
    try { const result = await cancelLoungePlan(order.oid); setState({ status: 'done', amount: result.amount }); setConfirming(false); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };

  return <div className="lounge-subscription">
    {state.status === 'loading' && <p className="lounge-persona-note"><LoaderCircle size={14} className="lounge-spin" /> 이용권을 불러오는 중이에요.</p>}
    {state.status === 'error' && <p className="lounge-persona-note" role="alert">{state.message}</p>}
    {state.status === 'done' && <p className="lounge-account-success" role="status"><Ticket size={16} />이용권을 취소했어요. {state.amount.toLocaleString('ko-KR')}원은 결제한 카드로 환불돼요(카드사에 따라 3~7영업일).</p>}
    {state.status === 'ready' && !state.order && <>
      <p className="lounge-persona-note">이용 중인 이용권이 없어요. 통화 시간과 사진, 기억을 더 늘리고 싶다면 요금제를 확인해 보세요.</p>
      <Link to="/lounge/pricing" className="btn lounge-persona-open" onClick={onNavigate}><Ticket size={16} />요금제(안) 보기</Link>
    </>}
    {state.status === 'ready' && state.order && (() => {
      const order = state.order;
      
      return <>
        <dl className="lounge-subscription-summary">
          <div><dt>이용권</dt><dd>{loungePlanReceiptName(order.plan, order.oid)}</dd></div>
          <div><dt>이용 기간</dt><dd>{dateText(order.periodEnd)}까지</dd></div>
          <div><dt>결제 금액</dt><dd>{order.amount.toLocaleString('ko-KR')}원</dd></div>
          <div><dt>주문번호</dt><dd>{order.oid}</dd></div>
        </dl>
        {!order.refundable && <p className="lounge-persona-note" role="note"><CircleAlert size={13} /> {order.message} 남은 기간만큼의 환불은 <a href="mailto:ask.saseok@gmail.com">ask.saseok@gmail.com</a>으로 문의해 주세요(이용약관 환불 기준).</p>}
        {order.refundable && !confirming && <p className="lounge-persona-note">결제 후 7일 안에, 이용권으로 늘어난 기능을 쓰지 않았다면 바로 취소하고 전액 환불받을 수 있어요.</p>}
        {confirming ? <div className="lounge-subscription-confirm" role="alertdialog" aria-label="이용권 취소 확인">
          <p>취소하면 이용권이 바로 끝나고 {order.amount.toLocaleString('ko-KR')}원이 결제한 카드로 환불돼요. 되돌릴 수 없어요. 취소할까요?</p>
          <div>
            <button type="button" className="btn lounge-subscription-danger" disabled={busy} onClick={() => void cancel(order)}>{busy ? <LoaderCircle size={15} className="lounge-spin" /> : null}{busy ? '취소하는 중…' : '취소하고 환불받기'}</button>
            <button type="button" className="btn lounge-subscription-back" disabled={busy} onClick={() => { setConfirming(false); setError(''); }}>돌아가기</button>
          </div>
        </div> : <button type="button" className="btn lounge-subscription-cancel" disabled={!order.refundable || !order.canCancel} onClick={() => setConfirming(true)}>이용권 취소</button>}
        {order.refundable && !order.canCancel && <p className="lounge-persona-note">지금은 자동 취소를 쓸 수 없어요. ask.saseok@gmail.com으로 문의해 주세요.</p>}
        {error && <div className="form-error" role="alert">{error}</div>}
      </>;
    })()}
  </div>;
}
