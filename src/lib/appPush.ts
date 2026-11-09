import { supabase } from './supabase';
import { isSaseokApp } from './nativeApp';
import { pushChannelId } from './pushServer';

/**
 * Push notifications in the Android app (2026-11-09). The phone's Firebase token is registered for the signed-in member
 * (register_push_token); tapping a notification opens its page (data.url). Nothing here runs in a browser.
 */
export type PushState = 'unsupported' | 'off' | 'on' | 'blocked';

const tokenKey = 'saseok-push-token';
const readToken = () => { try { return window.localStorage.getItem(tokenKey) ?? ''; } catch { return ''; } };
const writeToken = (token: string) => { try { if (token) window.localStorage.setItem(tokenKey, token); else window.localStorage.removeItem(tokenKey); } catch { /* the token is registered again next time */ } };

/**
 * The plugin is returned inside an object on purpose: a Capacitor plugin proxy answers to `then`, so an async function that
 * returned it (or an await on it) never finished and the settings block stayed empty (found on the phone, 2026-11-09).
 */
async function plugin() { const { PushNotifications } = await import('@capacitor/push-notifications'); return { push: PushNotifications }; }

/** Whether this phone is registered for the member: the permission, and a token that was saved. */
export async function pushState(): Promise<PushState> {
  if (!isSaseokApp()) return 'unsupported';
  const { push } = await plugin();
  const permission = (await push.checkPermissions()).receive;
  if (permission === 'denied') return 'blocked';
  return permission === 'granted' && readToken() ? 'on' : 'off';
}

/** Asks for the permission when needed, gets the phone's token and registers it; resolves with the new state. */
export async function turnOnPush(): Promise<PushState> {
  if (!isSaseokApp()) return 'unsupported';
  const { push } = await plugin();
  let permission = (await push.checkPermissions()).receive;
  if (permission === 'prompt' || permission === 'prompt-with-rationale') permission = (await push.requestPermissions()).receive;
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  await push.createChannel({ id: pushChannelId, name: '사석 알림', description: '캐릭터의 소식', importance: 4, visibility: 1 }).catch(() => undefined);
  const token = await new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('알림 등록이 오래 걸리고 있어요. 잠시 뒤 다시 시도해 주세요.')), 15_000);
    void push.addListener('registration', registered => { window.clearTimeout(timer); resolve(registered.value); });
    void push.addListener('registrationError', failure => { window.clearTimeout(timer); reject(new Error(failure.error || '알림을 등록하지 못했어요.')); });
    void push.register();
  });
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: 'android' });
  if (error) throw new Error(/register_push_token|schema cache|could not find/i.test(error.message) ? '알림을 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.' : error.message);
  writeToken(token);
  return 'on';
}

/** Takes this phone off the member's notifications. */
export async function turnOffPush(): Promise<PushState> {
  const token = readToken();
  if (token) await supabase.rpc('unregister_push_token', { p_token: token });
  writeToken('');
  return isSaseokApp() ? 'off' : 'unsupported';
}

let listening = false;
/** In the app: a tap on a notification opens the page it names. */
export async function listenForPushTaps() {
  if (!isSaseokApp() || listening) return;
  listening = true;
  const { push } = await plugin();
  await push.addListener('pushNotificationActionPerformed', action => {
    const url = String(action.notification.data?.url ?? '/lounge');
    if (url.startsWith('/') && !url.startsWith('//')) window.location.assign(url);
  });
}
