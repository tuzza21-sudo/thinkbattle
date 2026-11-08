export const config = { runtime: 'edge' };

// Deleting the member's own account from inside the app (2026-11-08; the stores require it).
//   POST ?action=delete   (member, JSON {acceptPaid?: boolean}) -> removes the member's files and the account
// Every table that holds the member's data deletes with the account (migration 20261212000000); the orders of the
// payments table stay without the account, as the e-commerce act requires. A member with a paid plan still running is
// told first (409 paid_plan_running) and must accept that the rest of it is not refunded here.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const supabaseBase = () => (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const buckets = ['lounge-avatars', 'lounge-character-private', 'lounge-character-public', 'lounge-custom-characters'];

const service = (path: string, init: RequestInit = {}) => fetch(`${supabaseBase()}${path}`, {
  ...init, signal: AbortSignal.timeout(15_000),
  headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
});

/** Removes everything the member stored under their own folder (<user id>/...) in the image buckets. */
async function removeFiles(userId: string) {
  for (const bucket of buckets) {
    try {
      for (let round = 0; round < 5; round += 1) {
        const listed = await service(`/storage/v1/object/list/${bucket}`, { method: 'POST', body: JSON.stringify({ prefix: userId, limit: 1000 }) });
        if (!listed.ok) break;
        const files = (await listed.json() as Array<{ name?: string; id?: string | null }>).filter(file => file.id && file.name);
        if (!files.length) break;
        await service(`/storage/v1/object/${bucket}`, { method: 'DELETE', body: JSON.stringify({ prefixes: files.map(file => `${userId}/${file.name}`) }) });
      }
    } catch (error) { console.warn('[account] files not removed', bucket, error instanceof Error ? error.message : error); }
  }
}

async function deleteAccount(req: Request) {
  const origin = req.headers.get('origin');
  const self = new URL(req.url).origin;
  if (origin && origin !== self && !(process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).includes(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/i.test(authorization)) return json({ error: '로그인이 필요해요.' }, 401);
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const auth = await fetch(`${supabaseBase()}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization }, signal: AbortSignal.timeout(10_000) });
  if (!auth.ok) return json({ error: '다시 로그인해 주세요.' }, 401);
  const user = await auth.json() as { id?: string };
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) return json({ error: '다시 로그인해 주세요.' }, 401);

  let body: { acceptPaid?: unknown } = {};
  try { body = JSON.parse((await req.text()) || '{}'); } catch { return json({ error: '요청 형식이 올바르지 않아요.' }, 400); }

  // The migration (reports, kept orders, foreign keys) must be in place, or the deletion would stop halfway.
  const ready = await service('/rest/v1/lounge_deleted_accounts?select=id&limit=1');
  if (!ready.ok) return json({ error: '계정 삭제를 준비하고 있어요. 잠시 뒤 다시 시도하거나 ask.saseok@gmail.com으로 문의해 주세요.', code: 'not_ready' }, 503);

  const running = await service(`/rest/v1/lounge_payments?user_id=eq.${user.id}&status=eq.paid&period_end=gt.${encodeURIComponent(new Date().toISOString())}&order=period_end.desc&limit=1&select=period_end`);
  const plan = running.ok ? (await running.json() as Array<{ period_end: string }>)[0] : undefined;
  if (plan && body.acceptPaid !== true) return json({ error: '이용 중인 이용권이 있어요. 삭제하면 남은 기간은 사라지고 이 화면에서 환불되지 않아요.', code: 'paid_plan_running', periodEnd: plan.period_end }, 409);

  await removeFiles(user.id);
  const removed = await service(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' });
  if (!removed.ok) {
    console.error('[account] could not delete the account', removed.status, (await removed.text()).slice(0, 200));
    return json({ error: '계정을 삭제하지 못했어요. 잠시 뒤 다시 시도하거나 ask.saseok@gmail.com으로 문의해 주세요.', code: 'delete_failed' }, 502);
  }
  await service('/rest/v1/lounge_deleted_accounts', { method: 'POST', body: JSON.stringify({ had_paid_plan: Boolean(plan) }) }).catch(() => undefined);
  return json({ ok: true });
}

export default async function handler(req: Request): Promise<Response> {
  const action = new URL(req.url).searchParams.get('action');
  if (!supabaseBase() || !serviceKey()) return json({ error: '서버 설정이 아직 끝나지 않았어요.' }, 503);
  if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);
  try {
    if (action === 'delete') return await deleteAccount(req);
    return json({ error: '알 수 없는 요청이에요.' }, 404);
  } catch (error) {
    console.error('[account] failed', action, error instanceof Error ? error.message : error);
    return json({ error: '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, 502);
  }
}
