import { useEffect, useState } from 'react';
import { Check, LoaderCircle, ShieldCheck } from 'lucide-react';
import { confirmLoungeAdult, getLoungeAdultStatus } from '../lib/loungeApi';
import { isSaseokApp } from '../lib/nativeApp';

/** 계정 관리 › 성인 인증 (앱 only): unlocks adult mode after the member confirms they are 18+. */
export function LoungeAdultVerification() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isSaseokApp()) return;
    void getLoungeAdultStatus().then(at => setVerified(Boolean(at)), () => setVerified(false));
  }, []);

  if (!isSaseokApp()) return null;

  const confirm = async () => {
    if (busy || verified) return;
    setBusy(true); setNote('');
    try {
      await confirmLoungeAdult();
      setVerified(true);
      setNote('성인 인증이 완료됐어요. 이제 캐릭터와의 대화에서 성인 모드를 쓸 수 있어요.');
    } catch (failure) {
      setNote(failure instanceof Error ? failure.message : '성인 인증을 완료하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="lounge-app-notifications">
    {verified === null ? <p className="lounge-persona-note">성인 인증 상태를 확인하는 중…</p>
      : verified ? <p className="lounge-persona-note"><Check size={13} /> 성인 인증이 완료됐어요. 앱에서도 성인 모드가 열려 있어요.</p>
      : <>
        <p className="lounge-persona-note">앱에서는 스토어 정책상 성인 인증 후에만 성인 모드가 열려요. 만 18세 이상만 인증할 수 있어요.</p>
        <button type="button" className="btn lounge-persona-open" disabled={busy} onClick={() => void confirm()}>
          {busy ? <LoaderCircle size={15} className="lounge-spin" /> : <ShieldCheck size={15} />}
          {busy ? '인증 중…' : '만 18세 이상입니다 · 성인 인증'}
        </button>
      </>}
    {note && <p className="lounge-persona-note" role="status">{note}</p>}
  </div>;
}
