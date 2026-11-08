import { useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import './BetaRecruitPopup.css';

/** Where the beta tester application form is. */
export const betaRecruitUrl = 'https://forms.gle/e2D2BdmSAx2VTh2v6';
const storageKey = 'saseok-beta-recruit-hidden-until';
const hideMs = 24 * 60 * 60 * 1000;

const hiddenUntil = () => { try { return Number(window.localStorage.getItem(storageKey)) || 0; } catch { return 0; } };
const hideFor = (ms: number) => { try { window.localStorage.setItem(storageKey, String(Date.now() + ms)); } catch { /* private window: it comes back next visit */ } };

/**
 * The beta tester call (2026-11-08): a popup on the lounge's front pages. "오늘 하루 보지 않기" hides it for a day, closing it
 * hides it for this visit only. It waits a moment after the page opens and never shows over another dialog (`blocked`).
 */
export function BetaRecruitPopup({ blocked = false }: { blocked?: boolean }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(false);
  const apply = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (hiddenUntil() > Date.now()) return;
    const timer = window.setTimeout(() => setReady(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  const visible = ready && !closed && !blocked;
  useEffect(() => {
    if (!visible) return;
    setOpen(true);
    apply.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setClosed(true); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!visible || !open) return null;
  return <div className="beta-popup-overlay" onClick={event => { if (event.target === event.currentTarget) setClosed(true); }}>
    <section className="beta-popup" role="dialog" aria-modal="true" aria-labelledby="beta-popup-title">
      <button type="button" className="beta-popup-close" onClick={() => setClosed(true)} aria-label="닫기"><X size={18} /></button>
      <span className="beta-popup-eyebrow">BETA TESTER</span>
      <h2 id="beta-popup-title">베타테스터를 모집합니다</h2>
      <div className="beta-popup-body">
        <p>안녕하세요. AI 컴패니언 서비스 <strong>‘사석에서’</strong>를 개발하고 있습니다.</p>
        <p>기존의 자극적인 캐릭터 채팅과는 조금 다른 방향을 고민하고 있습니다.</p>
        <p>개성과 자신만의 삶을 가진 AI 캐릭터와 목소리로 대화하고, 서로의 이야기를 기억하며, 시간이 흐를수록 우정과 설렘, 로맨스로 발전하는 경험을 만들고 있습니다.</p>
        <p>현재 정식 출시를 앞두고 베타테스터를 모집합니다.</p>
        <p>참여는 무료이며, 선정된 분께 테스트용 이용권과 추후 서비스 이용권, 신규 서비스 이용 기회를 제공합니다.</p>
        <p>직접 사용해 보시고 대화의 자연스러움, 캐릭터의 몰입감, 관계의 발전 등에 관해 솔직한 의견을 보내주시면 감사하겠습니다.</p>
        <p className="beta-popup-thanks">감사합니다.</p>
      </div>
      <a ref={apply} className="beta-popup-apply" href={betaRecruitUrl} target="_blank" rel="noopener noreferrer" onClick={() => hideFor(hideMs * 7)}>베타테스트 신청하기 <ExternalLink size={15} aria-hidden="true" /></a>
      <button type="button" className="beta-popup-later" onClick={() => { hideFor(hideMs); setClosed(true); }}>오늘 하루 보지 않기</button>
    </section>
  </div>;
}
