/**
 * Sending a push notification to a member's phones through Firebase Cloud Messaging (HTTP v1), 2026-11-09. Used by the
 * Node/edge functions in api/. The service account is in FIREBASE_SERVICE_ACCOUNT (the JSON of the key, on one line);
 * without it nothing is sent. A token Firebase says no longer exists is deleted from lounge_push_tokens.
 */
export type PushMessage = { title: string; body: string; /** The page the app opens when the notification is tapped. */ url?: string };

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
type Env = Record<string, string | undefined>;

export function readServiceAccount(env: Env): ServiceAccount | undefined {
  try {
    const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || '') as Partial<ServiceAccount>;
    return parsed.project_id && parsed.client_email && parsed.private_key ? parsed as ServiceAccount : undefined;
  } catch { return undefined; }
}

const base64Url = (bytes: ArrayBuffer | string) => {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  let text = ''; for (const byte of data) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let cached: { token: string; until: number } | undefined;
/** An OAuth access token for Firebase Messaging, from the service account's signed assertion; kept for about 50 minutes. */
export async function firebaseAccessToken(account: ServiceAccount, now = Date.now()): Promise<string> {
  if (cached && cached.until > now) return cached.token;
  const pem = account.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const seconds = Math.floor(now / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: seconds, exp: seconds + 3600 }))}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64Url(signature)}` }),
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) throw new Error(`firebase token ${response.status}`);
  cached = { token: body.access_token, until: now + Math.min(body.expires_in ?? 3600, 3000) * 1000 };
  return body.access_token;
}

/** The channel the app creates for its notifications (src/lib/appPush.ts); the message names it so it is shown at once. */
export const pushChannelId = 'saseok';

/** Sends to one token: 'sent', 'gone' (Firebase no longer knows the token) or 'failed'. */
export async function sendPushToToken(account: ServiceAccount, accessToken: string, token: string, message: PushMessage): Promise<'sent' | 'gone' | 'failed'> {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ message: { token, notification: { title: message.title, body: message.body }, data: { url: message.url ?? '/lounge' }, android: { priority: 'HIGH', notification: { channel_id: pushChannelId } } } }),
  });
  if (response.ok) return 'sent';
  const body = await response.json().catch(() => ({})) as { error?: { status?: string } };
  return response.status === 404 || body.error?.status === 'UNREGISTERED' ? 'gone' : 'failed';
}
