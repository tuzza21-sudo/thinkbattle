/**
 * Whether the page runs inside the 사석 app (2026-11-08): the Android app (capacitor.config.ts) adds "SaseokApp" to its
 * user agent. The app opens the live site, so this is how a page knows where it is.
 */
export const saseokAppAgent = 'SaseokApp';
export const isSaseokApp = () => typeof navigator !== 'undefined' && navigator.userAgent.includes(saseokAppAgent);
