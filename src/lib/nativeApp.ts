import { supabase } from './supabase';

/**
 * Whether the page runs inside the 사석 app (2026-11-08): the Android app (capacitor.config.ts) adds "SaseokApp" to its
 * user agent. The app opens the live site, so this is how a page knows where it is.
 */
export const saseokAppAgent = 'SaseokApp';
export const isSaseokApp = () => typeof navigator !== 'undefined' && navigator.userAgent.includes(saseokAppAgent);

/**
 * Where a sign-in in the browser tab comes back to the app (AndroidManifest.xml intent filter). Supabase must list it
 * under Authentication > URL Configuration > Redirect URLs, or it sends the browser tab to the site instead.
 */
export const saseokAppAuthReturn = 'kr.saseok.app://auth';

/**
 * Google refuses to sign in inside an app's web view (2026-11-08: it opened Chrome and the sign-in stayed there). In the
 * app, Google opens in a browser tab over the app and comes back to saseokAppAuthReturn with a code; the page keeps the
 * PKCE verifier, so listenForAppAuthReturn finishes the sign-in in the app.
 */
export async function signInInAppBrowser(provider: 'google' | 'kakao') {
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: saseokAppAuthReturn, skipBrowserRedirect: true } });
  if (error || !data?.url) throw new Error(error?.message || '로그인 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.');
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: data.url });
}

let listening = false;
/** In the app: when the sign-in tab comes back with a code, closes the tab and signs in (the auth listener does the rest). */
export async function listenForAppAuthReturn() {
  if (!isSaseokApp() || listening) return;
  listening = true;
  const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')]);
  await App.addListener('appUrlOpen', ({ url }) => {
    if (!url.startsWith(saseokAppAuthReturn)) return;
    void (async () => {
      await Browser.close().catch(() => undefined);
      const params = new URL(url).searchParams;
      const code = params.get('code');
      if (!code) { console.warn('[app sign-in] came back without a code', params.get('error_description') ?? params.get('error') ?? ''); return; }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) console.warn('[app sign-in] code not exchanged', error.message);
    })();
  });
}
