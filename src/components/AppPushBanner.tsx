import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { pushForegroundEvent, type PushForeground } from '../lib/appPush';
import './AppPushBanner.css';

/**
 * A notification that arrives while the app is open (2026-11-09): Android does not show it in the tray, so it is shown at
 * the top of the page for a few seconds. Tapping it opens the page it names (a path of the site).
 */
export function AppPushBanner() {
  const [shown, setShown] = useState<PushForeground | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const onPush = (event: Event) => {
      setShown((event as CustomEvent<PushForeground>).detail);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setShown(null), 6500);
    };
    window.addEventListener(pushForegroundEvent, onPush);
    return () => { window.removeEventListener(pushForegroundEvent, onPush); window.clearTimeout(timer.current); };
  }, []);
  if (!shown) return null;
  const open = () => { const url = shown.url; setShown(null); if (url.startsWith('/') && !url.startsWith('//')) window.location.assign(url); };
  return <div className="app-push-banner" role="status" aria-live="polite">
    <button type="button" className="app-push-open" onClick={open}>
      <span className="app-push-icon"><Bell size={17} aria-hidden="true" /></span>
      <span className="app-push-text"><strong>{shown.title}</strong><span>{shown.body}</span></span>
    </button>
    <button type="button" className="app-push-close" onClick={() => setShown(null)} aria-label="알림 닫기"><X size={16} /></button>
  </div>;
}
