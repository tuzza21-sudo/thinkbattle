import { supabase } from './supabase';
import { metaTrackingAllowed } from './metaPixel';

/**
 * Where a member first came from, kept by us (not by Meta): the campaign tags on the first address that was opened
 * (utm_*), whether it carried a Meta ad click, the first page and the site that linked to it. It is saved once, at
 * signup, so the funnel can be read per campaign even for people whose browser blocked the ad pixel. The ad click id
 * itself is not stored, only the fact that there was one.
 */
const KEY = 'saseok:first-touch';
export type FirstTouch = { source: string; medium: string; campaign: string; content: string; term: string; fromMeta: boolean; landing: string; referrer: string; touchedAt: string };

const clean = (value: string | null, max = 80) => (value ?? '').trim().replace(/[^\w.\-: 가-힣]/g, '').slice(0, max);
const cleanPath = (value: string) => value.replace(/[^\w./\-가-힣]/g, '').slice(0, 120);
const read = (): FirstTouch | null => { try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) as FirstTouch : null; } catch { return null; } };

/** Call on every start: only the first visit of a browser is kept. */
export function captureFirstTouch() {
  if (!metaTrackingAllowed() || read()) return;
  try {
    const params = new URLSearchParams(window.location.search);
    let referrer = '';
    try { referrer = document.referrer ? new URL(document.referrer).hostname : ''; } catch { /* Keep it empty. */ }
    if (referrer === window.location.hostname) referrer = '';
    const fromMeta = params.has('fbclid');
    const touch: FirstTouch = {
      source: clean(params.get('utm_source')) || (fromMeta ? 'meta' : referrer || 'direct'),
      medium: clean(params.get('utm_medium')) || (fromMeta ? 'paid' : referrer ? 'referral' : 'none'),
      campaign: clean(params.get('utm_campaign')), content: clean(params.get('utm_content')), term: clean(params.get('utm_term')),
      fromMeta, landing: cleanPath(window.location.pathname), referrer: cleanPath(referrer), touchedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(touch));
  } catch { /* Measuring must never get in the way of the app. */ }
}

/** Saves the remembered first touch for a new member, once. A failed attempt is retried at the next visit. */
export async function saveFirstTouch(userId: string) {
  const touch = read();
  const flag = `${KEY}:saved:${userId}`;
  try {
    if (!touch || localStorage.getItem(flag)) return;
    const { error } = await supabase.rpc('save_user_first_touch', { p_touch: touch });
    if (!error) localStorage.setItem(flag, '1');
  } catch { /* Measuring must never get in the way of the app. */ }
}
