import { supabase } from './supabase';

/** The Meta pixel (a public id) and the key actions that tell the ad account which visitors became members and talked. */
const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined) || '2860857600965753';

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[]; loaded: boolean; version: string; push: unknown };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

export type MetaEventName = 'CompleteRegistration' | 'FirstConversation' | 'ConversationEngaged';

/** A browser that sends "Do Not Track" or the Global Privacy Control signal is not measured at all. */
export const metaTrackingAllowed = () => typeof window !== 'undefined' && navigator.doNotTrack !== '1' && !(navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl;

let started = false;
export function initMetaPixel() {
  if (started || !PIXEL_ID || !metaTrackingAllowed() || window.fbq) return;
  started = true;
  // Meta's standard loader: calls made before the script arrives are queued and replayed.
  const fbq = function () { if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments as unknown as unknown[]); else fbq.queue.push(arguments); } as unknown as Fbq;
  fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
  window.fbq = fbq; window._fbq = fbq;
  const script = document.createElement('script');
  script.async = true; script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
  fbq('init', PIXEL_ID);
}

/** The app changes screens without reloading the page, so each screen is reported as a page view by hand. */
export function trackMetaPageView() {
  if (!metaTrackingAllowed()) return;
  initMetaPixel();
  window.fbq?.('track', 'PageView');
}

const cookie = (name: string) => document.cookie.split('; ').find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);

/**
 * Reports one action to the browser pixel and, for a signed-in member, to the server, which relays it to Meta's
 * conversions API. Both carry the same event id so Meta counts the action once. Nothing the member said is sent.
 */
export async function trackMetaEvent(name: MetaEventName, eventId: string) {
  if (!metaTrackingAllowed()) return;
  initMetaPixel();
  window.fbq?.(name === 'CompleteRegistration' ? 'track' : 'trackCustom', name, {}, { eventID: eventId });
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/meta-events', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventName: name, eventId, eventSourceUrl: window.location.href, fbp: cookie('_fbp'), fbc: cookie('_fbc') }),
    });
  } catch { /* Measuring must never get in the way of the app. */ }
}

/** An action that counts once per member: remembered in this browser and given an id that Meta also uses to drop repeats. */
export function trackMetaOnce(name: MetaEventName, userId: string) {
  const key = `meta:${name}:${userId}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch { /* Without storage the id below still lets Meta drop a repeat. */ }
  void trackMetaEvent(name, `${name}-${userId}`);
}
