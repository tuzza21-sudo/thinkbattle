export const config = { runtime: 'edge' };

// Relays a member's key actions to Meta's conversions API, next to the browser pixel, so ad measurement survives
// blockers and tracking limits. The member is identified from the login token, never from the request body; the
// email is hashed here before it leaves, and nothing the member said is part of an event.
const PIXEL_ID = process.env.META_PIXEL_ID || '2860857600965753';
const EVENTS = ['CompleteRegistration', 'FirstConversation', 'ConversationEngaged'] as const;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const sent = new Map<string, number[]>();
function limited(userId: string) {
  const now = Date.now(), recent = (sent.get(userId) ?? []).filter(time => now - time < 3_600_000);
  if (recent.length >= 30) return true;
  recent.push(now); sent.set(userId, recent);
  if (sent.size > 2000) sent.delete(sent.keys().next().value as string);
  return false;
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin && !(process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).includes(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/i.test(authorization)) return json({ error: '로그인이 필요합니다.' }, 401);
  const token = process.env.META_CAPI_TOKEN;
  // Without the access token the browser pixel still works; there is simply nothing to relay.
  if (!token) return json({ skipped: true }, 202);
  let body: { eventName?: unknown; eventId?: unknown; eventSourceUrl?: unknown; fbp?: unknown; fbc?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return json({ error: '요청 형식이 올바르지 않아요.' }, 400); }
  const eventName = EVENTS.find(name => name === body.eventName);
  const eventId = typeof body.eventId === 'string' && /^[A-Za-z0-9:_-]{8,100}$/.test(body.eventId) ? body.eventId : '';
  if (!eventName || !eventId) return json({ error: '올바르지 않은 이벤트예요.' }, 400);
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !anon) return json({ skipped: true }, 202);
  try {
    const auth = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization }, signal: AbortSignal.timeout(10_000) });
    if (!auth.ok) return json({ error: '다시 로그인해 주세요.' }, 401);
    const user = await auth.json() as { id?: string; email?: string; is_anonymous?: boolean };
    if (!user.id) return json({ error: '로그인 정보를 확인해 주세요.' }, 401);
    // A guest has no email and does not count as a registration.
    if (eventName === 'CompleteRegistration' && user.is_anonymous) return json({ skipped: true }, 202);
    if (limited(user.id)) return json({ error: '잠시 뒤에 다시 시도해 주세요.' }, 429);
    const sourceUrl = typeof body.eventSourceUrl === 'string' ? body.eventSourceUrl : '';
    let eventSourceUrl = origin ?? new URL(req.url).origin;
    try { const parsed = new URL(sourceUrl); if (/^https?:$/.test(parsed.protocol) && parsed.origin === new URL(req.url).origin) eventSourceUrl = `${parsed.origin}${parsed.pathname}`; } catch { /* Keep the site address. */ }
    const text = (value: unknown) => typeof value === 'string' && /^[\w.\-:%]{1,400}$/.test(value) ? value : undefined;
    const forwarded = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const userData: Record<string, unknown> = {
      external_id: [await sha256(user.id)],
      ...(user.email && !user.is_anonymous ? { em: [await sha256(user.email.trim().toLowerCase())] } : {}),
      ...(forwarded ? { client_ip_address: forwarded } : {}),
      ...(req.headers.get('user-agent') ? { client_user_agent: req.headers.get('user-agent') } : {}),
      ...(text(body.fbp) ? { fbp: text(body.fbp) } : {}), ...(text(body.fbc) ? { fbc: text(body.fbc) } : {}),
    };
    const version = /^v\d+\.\d+$/.test(process.env.META_API_VERSION || '') ? process.env.META_API_VERSION : 'v23.0';
    const response = await fetch(`https://graph.facebook.com/${version}/${PIXEL_ID}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        data: [{ event_name: eventName, event_time: Math.floor(Date.now() / 1000), event_id: eventId, action_source: 'website', event_source_url: eventSourceUrl, user_data: userData }],
        ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // Meta's answer can name internal details; only the outcome is returned.
    if (!response.ok) { console.warn('[Meta events] rejected', response.status); return json({ ok: false }, 502); }
    return json({ ok: true });
  } catch (error) {
    console.warn('[Meta events] failed', error instanceof Error ? error.name : 'error');
    return json({ ok: false }, 502);
  }
}
