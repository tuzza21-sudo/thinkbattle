import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Coffee, MessageCircle, X } from 'lucide-react';
import './LoungeAccountDialog.css';

type Props = {
  title: string; description: string; eyebrow: string; children: ReactNode;
  onClose: () => void; language?: 'ko' | 'en'; displayName?: string; avatarUrl?: string;
};

export function LoungeAccountDialog({ title, description, eyebrow, children, onClose, language = 'ko', displayName, avatarUrl }: Props) {
  const en = language === 'en';
  const titleId = useId(), descriptionId = useId();
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const target = dialog.current?.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? dialog.current;
      target?.focus({ preventScroll: true });
    });
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab' || !dialog.current) return;
      const targets = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), summary, [tabindex="0"]')).filter(target => target.getClientRects().length > 0);
      const first = targets[0], last = targets[targets.length - 1];
      if (!first) { event.preventDefault(); dialog.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      cancelAnimationFrame(frame); document.removeEventListener('keydown', keyboard);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return <div className="modal-overlay auth-modal-overlay lounge-account-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close.current(); }}>
    <section ref={dialog} className="modal-content auth-modal lounge-account-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
      <aside className="lounge-account-scene" aria-label={en ? 'A seat in the lounge' : '라운지의 나만의 자리'}>
        <div className="lounge-account-view"><span><Coffee size={18} /> {en ? 'Conversation lounge' : '수다 라운지'}</span><small>A LITTLE ROOM FOR YOU</small></div>
        <div className="lounge-account-welcome">
          {displayName ? <div className="lounge-account-preview"><span>{avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.slice(0, 1)}</span><small>{en ? 'Your seat in the conversation' : '대화 속 나의 자리'}</small><strong>{displayName}</strong></div> : <><span className="lounge-account-invitation"><MessageCircle size={16} /> {en ? 'It starts with a conversation' : '취향에서 시작하는 사이'}</span><h2>{en ? <>A good view.<br />An even better conversation.</> : <>좋은 풍경 옆에,<br />좋은 대화 하나.</>}</h2><p>{en ? 'A film you loved. A thought that stayed. There is a seat for your story here.' : '좋아하는 영화, 마음에 남은 문장.\n당신의 이야기가 놓일 자리를 준비했어요.'}</p></>}
          <div className="lounge-account-scene-note"><span /><p>{en ? 'Take your time. Make yourself at home.' : '서두르지 않아도 괜찮아요. 편하게 머물러요.'}</p></div>
        </div>
      </aside>
      <div className="lounge-account-content">
        <div className="auth-modal-header"><div className="auth-modal-heading"><span className="lounge-account-eyebrow">{eyebrow}</span><h2 id={titleId}>{title}</h2><p id={descriptionId}>{description}</p></div><button type="button" className="icon-button lounge-account-close" onClick={onClose} aria-label={en ? 'Close' : '닫기'}><X size={20} /></button></div>
        {children}
      </div>
    </section>
  </div>;
}
