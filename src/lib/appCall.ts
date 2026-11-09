import { registerPlugin } from '@capacitor/core';
import { isSaseokApp } from './nativeApp';

/**
 * Keeps a voice call alive while the screen is off, in the Android app (2026-11-09): android/.../CallKeepAlivePlugin runs a
 * foreground service of type microphone (a "통화 중" notification) from when the call screen opens until it closes. Outside
 * the app these do nothing. A failure to start (the call still works while the app is on the screen) is not an error.
 */
const plugin = registerPlugin<{ start: () => Promise<void>; stop: () => Promise<void> }>('CallKeepAlive');

export async function startCallKeepAlive() {
  if (!isSaseokApp()) return;
  try { await plugin.start(); } catch (error) { console.warn('[call] keep-alive not started', error instanceof Error ? error.message : error); }
}

export async function stopCallKeepAlive() {
  if (!isSaseokApp()) return;
  try { await plugin.stop(); } catch { /* the service stops with the app */ }
}
