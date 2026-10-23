import { useEffect } from 'react';

/**
 * Keeps the screen on while `active` (a call). Phones turn the screen off after a short while, and a page whose screen
 * is off stops running, which dropped the call (2026-10-24). The browser lets go of the lock whenever the page is hidden,
 * so it is asked for again when the page is visible again. A browser without it, or one that refuses it (a battery
 * saver), leaves the screen to turn off as before.
 */
export function useScreenWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null, cancelled = false;
    const request = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) { void next.release().catch(() => {}); return; }
        lock = next;
      } catch { /* refused for now; asked again the next time the page is shown */ }
    };
    const onVisible = () => { void request(); };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); void lock?.release().catch(() => {}); };
  }, [active]);
}
