import { firebaseAccessToken, readServiceAccount, sendPushToToken } from '../src/lib/pushServer';

export const config = { runtime: 'edge' };

// Push notifications for the Android app (2026-11-09).
//   POST ?action=test   (member) -> a test notification to the member's own phones (one in 30 seconds)
// Sending to a member for a reason of the service (a character reaching out) is done by the server code that decides it,
// with sendPushToToken from src/lib/pushServer.ts; the members' tokens are in lounge_push_tokens.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const supabaseBase = () => (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const service = (path: string, init: RequestInit = {}) => fetch(`${supabaseBase()}${path}`, {
  ...init, signal: AbortSignal.timeout(10_000),
  headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers as Record<string, string> | undefined) },
});

async function testNotification(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin && !(process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).includes(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/i.test(authorization)) return json({ error: '로그인이 필요해요.' }, 401);
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const auth = await fetch(`${supabaseBase()}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization }, signal: AbortSignal.timeout(10_000) });
  if (!auth.ok) return json({ error: '다시 로그인해 주세요.' }, 401);
  const user = await auth.json() as { id?: string };
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) return json({ error: '다시 로그인해 주세요.' }, 401);

  const account = readServiceAccount(process.env);
  if (!account) return json({ error: '알림 서버 설정이 아직 끝나지 않았어요.', code: 'push_not_configured' }, 503);
  const found = await service(`/rest/v1/lounge_push_tokens?user_id=eq.${user.id}&select=token,last_test_at`);
  if (!found.ok) return json({ error: '알림을 준비하고 있어요. 잠시 뒤 다시 시도해 주세요.', code: 'not_ready' }, 503);
  const tokens = await found.json() as Array<{ token: string; last_test_at: string | null }>;
  if (!tokens.length) return json({ error: '이 기기가 아직 알림에 등록되지 않았어요. 알림을 켠 뒤 다시 눌러 주세요.', code: 'no_token' }, 409);
  if (tokens.some(row => row.last_test_at && Date.now() - Date.parse(row.last_test_at) < 30_000)) return json({ error: '잠시 뒤에 다시 눌러 주세요.', code: 'too_soon' }, 429);

  const accessToken = await firebaseAccessToken(account);
  let sent = 0;
  for (const { token } of tokens) {
    const result = await sendPushToToken(account, accessToken, token, { title: '사석에서', body: '알림이 켜졌어요. 캐릭터의 소식을 이곳으로 알려 드릴게요.', url: '/lounge' });
    if (result === 'sent') sent += 1;
    if (result === 'gone') await service(`/rest/v1/lounge_push_tokens?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => undefined);
  }
  await service(`/rest/v1/lounge_push_tokens?user_id=eq.${user.id}`, { method: 'PATCH', body: JSON.stringify({ last_test_at: new Date().toISOString() }) }).catch(() => undefined);
  return sent ? json({ ok: true, sent }) : json({ error: '알림을 보내지 못했어요. 알림을 껐다가 다시 켜 주세요.', code: 'send_failed' }, 502);
}

export default async function handler(req: Request): Promise<Response> {
  const action = new URL(req.url).searchParams.get('action');
  if (!supabaseBase() || !serviceKey()) return json({ error: '서버 설정이 아직 끝나지 않았어요.' }, 503);
  if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);
  try {
    if (action === 'test') return await testNotification(req);
    return json({ error: '알 수 없는 요청이에요.' }, 404);
  } catch (error) {
    console.error('[push] failed', action, error instanceof Error ? error.message : error);
    return json({ error: '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, 502);
  }
}
