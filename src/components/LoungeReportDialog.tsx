import { useEffect, useRef, useState } from 'react';
import { Check, Flag, LoaderCircle, X } from 'lucide-react';
import { loungeReportReasons, reportLoungeMessage, type LoungeReportReason } from '../lib/loungeApi';
import './LoungeReportDialog.css';

/**
 * Report a character's reply (2026-11-08; the app stores require a way to flag AI-generated content from inside the
 * app). A reason, a few optional words, and the reply is kept with the report for review.
 */
export function LoungeReportDialog({ messageId, excerpt, onClose }: { messageId: number; excerpt: string; onClose: () => void }) {
  const [reason, setReason] = useState<LoungeReportReason | ''>('');
  const [detail, setDetail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    if (!reason || state === 'sending') return;
    setState('sending'); setError('');
    try { await reportLoungeMessage(messageId, reason, detail); setState('done'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '신고를 접수하지 못했어요.'); setState('idle'); }
  };

  return <div className="lounge-report-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="lounge-report" role="dialog" aria-modal="true" aria-labelledby="lounge-report-title">
      <button type="button" className="lounge-report-close" onClick={onClose} aria-label="닫기"><X size={18} /></button>
      <h2 id="lounge-report-title"><Flag size={17} aria-hidden="true" /> 이 답변 신고하기</h2>
      {state === 'done' ? <>
        <p className="lounge-report-done" role="status"><Check size={17} aria-hidden="true" /> 신고가 접수됐어요. 알려 주셔서 고마워요. 확인한 뒤 서비스를 고쳐 나갈게요.</p>
        <button type="button" className="lounge-report-primary" onClick={onClose}>닫기</button>
      </> : <>
        <blockquote>{excerpt}</blockquote>
        <p className="lounge-report-label">어떤 점이 문제였나요?</p>
        <div className="lounge-report-reasons" role="radiogroup" aria-label="신고 사유">
          {loungeReportReasons.map((item, index) => <button key={item.key} ref={index === 0 ? first : undefined} type="button" role="radio" aria-checked={reason === item.key} className={reason === item.key ? 'selected' : ''} onClick={() => setReason(item.key)}>{item.label}</button>)}
        </div>
        <label className="lounge-report-detail">자세한 내용 (선택)
          <textarea value={detail} maxLength={500} rows={3} onChange={event => setDetail(event.target.value)} placeholder="어떤 말이 어떻게 불편했는지 적어 주세요." />
        </label>
        {error && <p className="lounge-report-error" role="alert">{error}</p>}
        <button type="button" className="lounge-report-primary" disabled={!reason || state === 'sending'} onClick={() => void send()}>{state === 'sending' ? <LoaderCircle size={16} className="lounge-spin" /> : null}{state === 'sending' ? '접수하는 중…' : '신고하기'}</button>
      </>}
    </section>
  </div>;
}
