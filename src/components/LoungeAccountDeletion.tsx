import { useState } from 'react';
import { LoaderCircle, Trash2, TriangleAlert } from 'lucide-react';
import { deleteLoungeAccount, LoungeApiError } from '../lib/loungeApi';
import { supabase } from '../lib/supabase';

/**
 * 계정 관리 › 계정 삭제 (2026-11-08; the app stores require deleting the account from inside the app). The member types
 * 삭제 to confirm; a plan still running is said first and has to be accepted. Afterwards the page reloads signed out.
 */
export function LoungeAccountDeletion() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paidRunning, setPaidRunning] = useState(false);

  const remove = async (acceptPaid: boolean) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await deleteLoungeAccount(acceptPaid);
      await supabase.auth.signOut().catch(() => undefined);
      window.location.assign('/lounge');
    } catch (failure) {
      if (failure instanceof LoungeApiError && failure.code === 'paid_plan_running') setPaidRunning(true);
      else setError(failure instanceof Error ? failure.message : '계정을 삭제하지 못했어요.');
      setBusy(false);
    }
  };

  if (!open) return <button type="button" className="btn lounge-subscription-cancel lounge-delete-open" onClick={() => setOpen(true)}><Trash2 size={15} />계정 삭제</button>;
  return <div className="lounge-subscription-confirm lounge-delete-confirm" role="alertdialog" aria-label="계정 삭제 확인">
    <p><TriangleAlert size={15} aria-hidden="true" /> 계정을 삭제하면 대화 기록, 캐릭터의 기억과 관계, 내가 만든 캐릭터와 페르소나, 프로필 사진이 모두 지워지고 되돌릴 수 없어요. 결제 내역은 법에 따라 5년간 이름 없이 보관돼요.</p>
    {paidRunning && <p className="lounge-delete-paid">이용 중인 이용권이 있어요. 삭제하면 남은 기간은 사라지고 여기서 환불되지 않아요. 환불은 ask.saseok@gmail.com으로 문의해 주세요. 그래도 삭제할까요?</p>}
    <label className="lounge-delete-type">확인을 위해 <b>삭제</b>라고 입력해 주세요
      <input value={typed} onChange={event => setTyped(event.target.value)} disabled={busy} autoComplete="off" />
    </label>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div>
      <button type="button" className="btn lounge-subscription-danger" disabled={busy || typed.trim() !== '삭제'} onClick={() => void remove(paidRunning)}>{busy ? <LoaderCircle size={15} className="lounge-spin" /> : null}{busy ? '삭제하는 중…' : paidRunning ? '이용권을 포기하고 삭제' : '계정 삭제'}</button>
      <button type="button" className="btn lounge-subscription-back" disabled={busy} onClick={() => { setOpen(false); setTyped(''); setError(''); setPaidRunning(false); }}>돌아가기</button>
    </div>
  </div>;
}
