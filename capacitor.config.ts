import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android (and later iOS) app of 사석 (2026-11-08). Phase 1: the app opens the live site, so the API, sign-in,
 * payment returns and every origin check work as on the web, and a web deploy updates the app at once. `dist` is still
 * the webDir Capacitor copies into the app, but it is not shown while `server.url` is set.
 *
 * The app adds "SaseokApp" to its user agent, so the site and the server can tell the app from a browser
 * (src/lib/nativeApp.ts on the page, isSaseokAppRequest in api/lounge.ts on the server).
 */
const config: CapacitorConfig = {
  appId: 'kr.saseok.app',
  appName: '사석에서',
  webDir: 'dist',
  // The web view's colour before the site paints: the site's dark background, not a white flash after the splash.
  backgroundColor: '#1a110d',
  server: {
    url: 'https://saseok.kr',
    androidScheme: 'https',
    // Sign-in goes through Supabase and Kakao and comes back to the site; Inicis is the payment window. They stay inside
    // the app; any other address opens in the phone's browser.
    allowNavigation: ['saseok.kr', '*.saseok.kr', '*.supabase.co', 'kauth.kakao.com', 'accounts.kakao.com', 'logins.daum.net', '*.inicis.com'],
  },
  plugins: {
    // The pages are dark: light status-bar and navigation-bar icons on the dark window behind them.
    SystemBars: { style: 'DARK' },
  },
  android: {
    appendUserAgent: 'SaseokApp/1',
    allowMixedContent: false,
  },
};

export default config;
