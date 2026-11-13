import { getLoungePlan, loungeCallLimitMinutes, loungeOrderPrefix, loungeOrderTerm, loungePhotoMonthly, loungePlanGoodName } from '../src/lib/loungePlans';

export const config = { runtime: 'edge' };

// Card payments for the paid plan (Pro, by the month or by the year) through PortOne V2, with KG Inicis as the payment
// company (2026-11-13; before that Inicis was called directly). One order is one month or one year, with no automatic renewal.
//   POST ?action=create    (member, JSON {plan, term, device, phone?}) -> a pending order and the request for PortOne.requestPayment
//   POST ?action=complete  (the result page, JSON {paymentId, code?, message?}) -> looks the payment up at PortOne and records it
//   POST ?action=webhook   (PortOne, the noticeUrls of each payment)  -> the same, for a member who never came back to the site
//   POST ?action=status    (member)                                   -> the plan running now and whether it can be cancelled with a refund
//   POST ?action=cancel    (member, JSON {oid})                       -> cancels the plan and refunds the card when the refund terms are met
// The PortOne paymentId is our order id. The amount always comes from loungePlans on the server, and an order counts as paid
// only when PortOne's own record of that payment says PAID for that exact amount: what the browser or a webhook says is only
// a reason to look. Needs PORTONE_STORE_ID, PORTONE_CHANNEL_KEY (a test channel with INIpayTest first, the live MID later)
// and PORTONE_API_SECRET; PORTONE_WEBHOOK_SECRET is checked when it is set.

const PORTONE_API = 'https://api.portone.io';
const storeId = () => process.env.PORTONE_STORE_ID || '';
const channelKey = () => process.env.PORTONE_CHANNEL_KEY || '';
const apiSecret = () => process.env.PORTONE_API_SECRET || '';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const supabaseBase = () => (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type PaymentRow = { id: string; user_id: string; plan: string; amount: number; oid: string; device: string; status: string; period_end: string | null; period_start?: string | null; paid_at?: string | null; tid?: string | null };

async function db<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = serviceKey();
  const response = await fetch(`${supabaseBase()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`db ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

const findOrder = async (oid: string) => /^[A-Za-z0-9]{8,40}$/.test(oid)
  ? (await db<PaymentRow[]>(`lounge_payments?oid=eq.${oid}&select=*`))[0]
  : undefined;

/** A failed order can still turn out paid (PortOne is asked again), so failing one never closes it for good. */
async function markFailed(oid: string, code: string, message: string) {
  try {
    await db(`lounge_payments?oid=eq.${oid}&status=in.(pending,failed)`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', result_code: code.slice(0, 20), result_message: message.slice(0, 300), updated_at: new Date().toISOString() }) });
  } catch (error) { console.warn('[payments] could not mark failed', oid, error instanceof Error ? error.message : error); }
}

/** One month (one year for an order id that starts with SY) of the plan; paying again for the same plan while a period is running adds the one after it. */
async function periodFor(order: PaymentRow) {
  const now = new Date();
  const active = await db<Array<{ period_end: string }>>(`lounge_payments?user_id=eq.${order.user_id}&plan=eq.${order.plan}&status=eq.paid&period_end=gt.${now.toISOString()}&order=period_end.desc&limit=1&select=period_end`);
  const start = active[0] ? new Date(active[0].period_end) : now;
  const end = new Date(start);
  end.setMonth(end.getMonth() + (loungeOrderTerm(order.oid) === 'year' ? 12 : 1));
  return { start, end };
}

// ---- PortOne ----
type PortOnePayment = {
  id?: string; status?: string; storeId?: string; transactionId?: string; currency?: string;
  amount?: { total?: number }; method?: { type?: string }; channel?: { type?: string }; failure?: { reason?: string; pgMessage?: string };
  type?: string; message?: string;
};

async function portone<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const response = await fetch(`${PORTONE_API}${path}`, {
    ...init,
    headers: { Authorization: `PortOne ${apiSecret()}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) as T };
}

const getPayment = (paymentId: string) => portone<PortOnePayment>(`/payments/${encodeURIComponent(paymentId)}`);

/** Cancels the whole payment. A payment PortOne already shows as cancelled counts as done. */
async function cancelPayment(paymentId: string, reason: string): Promise<{ ok: boolean; code: string; message: string }> {
  const { status, body } = await portone<{ cancellation?: { status?: string }; type?: string; message?: string }>(`/payments/${encodeURIComponent(paymentId)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  const ok = status < 300 ? ['SUCCEEDED', 'REQUESTED'].includes(String(body.cancellation?.status)) : body.type === 'PAYMENT_ALREADY_CANCELLED';
  return { ok, code: String(body.cancellation?.status ?? body.type ?? status), message: String(body.message ?? '') };
}

/** Marks an order paid. 'taken' when it was no longer pending or failed (another check got there first). */
async function markPaid(order: PaymentRow, payment: PortOnePayment): Promise<'paid' | 'taken' | 'error'> {
  try {
    const { start, end } = await periodFor(order);
    const now = new Date().toISOString();
    const method = String(payment.method?.type || 'Card').replace(/^PaymentMethod/, '');
    const rows = await db<PaymentRow[]>(`lounge_payments?oid=eq.${order.oid}&status=in.(pending,failed)`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paid', tid: String(payment.transactionId || order.oid).slice(0, 80), pay_method: method.slice(0, 40), result_code: 'PAID', result_message: payment.channel?.type === 'TEST' ? 'test channel' : null, paid_at: now, period_start: start.toISOString(), period_end: end.toISOString(), updated_at: now }),
    });
    return rows.length === 1 ? 'paid' : 'taken';
  } catch (error) {
    console.error('[payments] could not record payment', order.oid, error instanceof Error ? error.message : error);
    return 'error';
  }
}

type Settled = { result: 'success'; oid: string } | { result: 'fail'; oid?: string; message: string };

/** Looks the payment up at PortOne and brings the order in line with it: paid, failed, or (cancelled at PortOne) ended. */
async function settle(paymentId: string, hint: { code?: string; message?: string } = {}): Promise<Settled> {
  const order = await findOrder(paymentId);
  if (!order) return { result: 'fail', message: '주문을 찾지 못했어요.' };
  const success = { result: 'success', oid: order.oid } as const;
  const fail = (message: string) => ({ result: 'fail', oid: order.oid, message }) as const;
  const failed = async (code: string, message: string) => { await markFailed(order.oid, code, message); return fail(message); };

  const { status, body: payment } = await getPayment(order.oid);
  // No payment at PortOne: the window was closed before anything was paid.
  if (status === 404) return order.status === 'paid' ? success : failed(hint.code || 'not_found', hint.message || '결제가 완료되지 않았어요.');
  if (status >= 300) throw new Error(`portone ${status} ${payment.type ?? ''}`);

  if (order.status === 'paid') {
    if (payment.status !== 'CANCELLED') return success;
    // Cancelled from the PortOne console: the plan ends with it.
    try { await db(`lounge_payments?oid=eq.${order.oid}&status=eq.paid`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', result_code: 'cancel', result_message: 'cancelled at PortOne', updated_at: new Date().toISOString() }) }); }
    catch (error) { console.error('[payments] could not end a plan cancelled at PortOne', order.oid, error instanceof Error ? error.message : error); }
    return fail('취소된 결제예요.');
  }
  if (order.status === 'cancelled') return fail('취소된 결제예요.');

  if (payment.status !== 'PAID') {
    const message = hint.message || payment.failure?.pgMessage || payment.failure?.reason || '결제가 완료되지 않았어요.';
    if (payment.status === 'FAILED' || payment.status === 'CANCELLED' || hint.code) return failed(hint.code || String(payment.status), message);
    // READY or PENDING: still going on at the card company; the webhook settles it.
    return fail('결제가 아직 끝나지 않았어요. 잠시 뒤 계정 관리의 이용권에서 확인해 주세요.');
  }

  const exact = payment.amount?.total === order.amount && payment.currency === 'KRW' && (!payment.storeId || payment.storeId === storeId());
  if (exact) {
    const wrote = await markPaid(order, payment);
    if (wrote === 'paid') return success;
    // The member's return and the webhook arrive together: the other one may have recorded it already.
    const now = await findOrder(order.oid).catch(() => undefined);
    if (now?.status === 'paid') return success;
    if (wrote === 'taken' && now?.status === 'cancelled') return fail('취소된 결제예요.');
  }
  // A wrong amount, or a payment that could not be recorded, is not kept.
  const reason = exact ? '결제 기록 실패로 자동 취소' : '주문 금액 불일치로 자동 취소';
  const refund = await cancelPayment(order.oid, reason).catch(error => ({ ok: false, code: 'network', message: error instanceof Error ? error.message : 'error' }));
  console.error('[payments] payment not kept', order.oid, reason, `paid ${String(payment.amount?.total)} ${String(payment.currency)}`, 'refund', refund.ok, refund.code);
  return failed(exact ? 'record' : 'mismatch', refund.ok ? '결제 기록을 남기지 못해 결제를 취소했어요.' : '결제를 확인하지 못했어요. ask.saseok@gmail.com으로 문의해 주세요.');
}

/** Standard Webhooks, as PortOne signs them (the same as @portone/server-sdk's Webhook.verify). */
async function webhookSigned(headers: Headers, body: string) {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  // Without a secret the event is still only a reason to ask PortOne, so nothing can be faked through it.
  if (!secret) return true;
  const id = headers.get('webhook-id'), timestamp = headers.get('webhook-timestamp'), signatures = headers.get('webhook-signature');
  if (!id || !timestamp || !signatures || !(Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300)) return false;
  try {
    const raw = Uint8Array.from(atob(secret.startsWith('whsec_') ? secret.slice(6) : secret), char => char.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))));
    return signatures.split(' ').some(part => { const [version, signature] = part.split(','); return version === 'v1' && signature === expected; });
  } catch { return false; }
}

async function webhook(req: Request) {
  const text = await req.text();
  if (!(await webhookSigned(req.headers, text))) return json({ error: 'invalid signature' }, 400);
  let event: { type?: unknown; data?: { paymentId?: unknown } };
  try { event = JSON.parse(text); } catch { return json({ error: 'invalid body' }, 400); }
  const paymentId = event.data?.paymentId;
  // Unknown types are answered 200 and left alone, as PortOne asks.
  if (typeof event.type === 'string' && event.type.startsWith('Transaction.') && typeof paymentId === 'string') {
    const settled = await settle(paymentId);
    console.info('[payments] webhook', event.type, paymentId, settled.result);
  }
  return json({ ok: true });
}

function sameSite(req: Request) {
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin || (process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).includes(origin);
}

async function complete(req: Request) {
  if (!sameSite(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  let body: { paymentId?: unknown; code?: unknown; message?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return json({ error: '요청 형식이 올바르지 않아요.' }, 400); }
  if (typeof body.paymentId !== 'string') return json({ error: '주문을 찾지 못했어요.' }, 400);
  const text = (value: unknown) => typeof value === 'string' && value ? value.slice(0, 120) : undefined;
  return json(await settle(body.paymentId, { code: text(body.code), message: text(body.message) }));
}

async function createOrder(req: Request) {
  if (!sameSite(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!storeId() || !channelKey() || !apiSecret()) return json({ error: '결제 설정이 아직 끝나지 않았어요.' }, 503);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/i.test(authorization)) return json({ error: '로그인이 필요해요.' }, 401);
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const auth = await fetch(`${supabaseBase()}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization }, signal: AbortSignal.timeout(10_000) });
  if (!auth.ok) return json({ error: '다시 로그인해 주세요.' }, 401);
  const user = await auth.json() as { id?: string; email?: string; is_anonymous?: boolean; user_metadata?: { nickname?: string; name?: string } };
  if (!user.id) return json({ error: '다시 로그인해 주세요.' }, 401);
  if (user.is_anonymous || !user.email) return json({ error: '회원가입 후 결제할 수 있어요.', code: 'signup_required' }, 403);

  let body: { plan?: unknown; term?: unknown; device?: unknown; phone?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return json({ error: '요청 형식이 올바르지 않아요.' }, 400); }
  const plan = getLoungePlan(body.plan, body.term);
  if (!plan) return json({ error: '요금제를 다시 골라 주세요.' }, 400);
  const device = body.device === 'mobile' ? 'mobile' : 'pc';
  // KG Inicis's PC window needs the buyer's phone number (optional on phones). It goes to the window only and is not stored.
  const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
  const phoneOk = /^01\d{8,9}$/.test(phone);
  if (device === 'pc' && !phoneOk) return json({ error: '결제창에 필요한 휴대폰 번호를 입력해 주세요.', code: 'phone_required' }, 400);

  const oid = `${loungeOrderPrefix[plan.term]}${Date.now()}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`.slice(0, 40);
  await db('lounge_payments', { method: 'POST', body: JSON.stringify({ user_id: user.id, plan: plan.id, amount: plan.price, oid, device }) });

  const self = new URL(req.url).origin;
  const fullName = (user.user_metadata?.nickname || user.user_metadata?.name || user.email.split('@')[0]).slice(0, 15);
  return json({
    oid,
    request: {
      storeId: storeId(), channelKey: channelKey(), paymentId: oid, orderName: loungePlanGoodName(plan), totalAmount: plan.price,
      currency: 'KRW', payMethod: 'CARD',
      customer: { fullName, email: user.email, ...(phoneOk ? { phoneNumber: phone } : {}) },
      // Phones leave the site for the card company and come back here with ?paymentId=…; a computer gets the answer in place.
      redirectUrl: `${self}/lounge/payment`,
      noticeUrls: [`${self}/api/payments?action=webhook`],
    },
  });
}

// ---- Cancelling a plan from the account (2026-11-07) ----
// The terms (청약철회): within 7 days of paying, with none of the paid features used, the plan is cancelled and the whole
// amount refunded. The member does it from the account; any other case (7 days passed, or a paid feature used) is the
// prorated refund the terms promise by e-mail, which a person decides (and refunds from the PortOne console, which ends
// the plan through the webhook). The refund is PortOne's payment cancellation; without PORTONE_API_SECRET nothing is
// cancelled and the member is told to write.
const REFUND_DAYS = 7;

type Refundable = { ok: true } | { ok: false; reason: 'late' | 'used'; message: string };

/** Whether the order meets the refund terms: 7 days from paying and no paid feature used since (or a month not begun yet). */
async function refundable(order: PaymentRow, now = Date.now()): Promise<Refundable> {
  const paidAt = order.paid_at ? Date.parse(order.paid_at) : NaN;
  if (!Number.isFinite(paidAt) || now - paidAt > REFUND_DAYS * 86_400_000) return { ok: false, reason: 'late', message: `결제한 지 ${REFUND_DAYS}일이 지나서 바로 취소할 수 없어요.` };
  // A month bought ahead (it begins after the running one ends) has not been used yet.
  if (order.period_start && Date.parse(order.period_start) > now) return { ok: true };
  // What the plan adds over the free use: calls beyond the free minutes, any photo a character sent first, photos beyond the free few.
  const kst = new Date(paidAt + 9 * 3_600_000);
  const month = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const [calls, photos] = await Promise.all([
    db<Array<{ seconds: number }>>(`lounge_call_usage?user_id=eq.${order.user_id}&month=gte.${month}&select=seconds`),
    db<Array<{ source: string }>>(`lounge_character_posts?user_id=eq.${order.user_id}&created_at=gte.${encodeURIComponent(order.paid_at as string)}&select=source`),
  ]);
  const seconds = calls.reduce((sum, row) => sum + Number(row.seconds || 0), 0);
  const used = seconds > loungeCallLimitMinutes(null, process.env) * 60 || photos.some(photo => photo.source === 'character') || photos.length > loungePhotoMonthly.free;
  return used ? { ok: false, reason: 'used', message: '이용권으로 늘어난 기능(통화 시간, 사진)을 이미 사용해서 바로 취소할 수 없어요.' } : { ok: true };
}

async function authMember(req: Request): Promise<{ id: string } | Response> {
  if (!sameSite(req)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/i.test(authorization)) return json({ error: '로그인이 필요해요.' }, 401);
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const auth = await fetch(`${supabaseBase()}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization }, signal: AbortSignal.timeout(10_000) });
  if (!auth.ok) return json({ error: '다시 로그인해 주세요.' }, 401);
  const user = await auth.json() as { id?: string; is_anonymous?: boolean };
  return user.id && !user.is_anonymous ? { id: user.id } : json({ error: '다시 로그인해 주세요.' }, 401);
}

/** The member's latest paid plan that has not ended: the one the account can cancel. */
async function runningOrder(userId: string) {
  return (await db<PaymentRow[]>(`lounge_payments?user_id=eq.${userId}&status=eq.paid&period_end=gt.${encodeURIComponent(new Date().toISOString())}&order=period_end.desc&limit=1&select=*`))[0];
}

async function planStatus(req: Request) {
  const member = await authMember(req);
  if (member instanceof Response) return member;
  const order = await runningOrder(member.id);
  if (!order) return json({ order: null });
  const check = await refundable(order);
  return json({ order: { oid: order.oid, plan: order.plan, amount: order.amount, paidAt: order.paid_at ?? null, periodEnd: order.period_end, refundable: check.ok, ...(check.ok ? {} : { reason: check.reason, message: check.message }), canCancel: Boolean(apiSecret() && order.tid) } });
}

async function cancelPlan(req: Request) {
  const member = await authMember(req);
  if (member instanceof Response) return member;
  let body: { oid?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return json({ error: '요청 형식이 올바르지 않아요.' }, 400); }
  const order = typeof body.oid === 'string' ? await findOrder(body.oid) : undefined;
  if (!order || order.user_id !== member.id) return json({ error: '취소할 이용권을 찾지 못했어요.' }, 404);
  if (order.status === 'cancelled') return json({ error: '이미 취소된 이용권이에요.', code: 'already_cancelled' }, 409);
  const latest = order.status === 'paid' ? await runningOrder(member.id) : undefined;
  if (order.status !== 'paid' || !latest) return json({ error: '지금 이용 중인 이용권이 아니에요.' }, 409);
  if (latest.oid !== order.oid) return json({ error: '나중에 결제한 이용권부터 취소해 주세요.', code: 'cancel_later_first' }, 409);
  if (!order.tid || !apiSecret()) return json({ error: '자동 취소 설정이 아직 끝나지 않았어요. ask.saseok@gmail.com으로 문의해 주세요.', code: 'cancel_unavailable' }, 503);
  const check = await refundable(order);
  if (!check.ok) return json({ error: `${check.message} 남은 기간만큼의 환불은 ask.saseok@gmail.com으로 문의해 주세요.`, code: 'not_refundable', reason: check.reason }, 409);

  // The plan ends first (only one request can do this), then the card is refunded; a refund that fails puts the plan back.
  const claimed = await db<PaymentRow[]>(`lounge_payments?oid=eq.${order.oid}&status=eq.paid`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', result_code: 'cancel', result_message: '회원 요청 취소(7일 이내)', updated_at: new Date().toISOString() }) });
  if (claimed.length !== 1) return json({ error: '이미 처리된 요청이에요.', code: 'already_cancelled' }, 409);
  const restore = async (message: string) => {
    try { await db(`lounge_payments?oid=eq.${order.oid}&status=eq.cancelled`, { method: 'PATCH', body: JSON.stringify({ status: 'paid', result_code: 'PAID', result_message: message.slice(0, 300), updated_at: new Date().toISOString() }) }); }
    catch (error) { console.error('[payments] could not restore the plan after a failed refund', order.oid, error instanceof Error ? error.message : error); }
  };
  try {
    const refund = await cancelPayment(order.oid, '회원 요청 이용권 취소(7일 이내)');
    if (!refund.ok) {
      console.error('[payments] refund refused', order.oid, refund.code, refund.message);
      await restore(`cancel refused ${refund.code}`);
      return json({ error: '카드 취소가 처리되지 않았어요. 이용권은 그대로예요. 잠시 뒤 다시 시도하거나 ask.saseok@gmail.com으로 문의해 주세요.', code: 'refund_failed' }, 502);
    }
  } catch (error) {
    console.error('[payments] refund request failed', order.oid, error instanceof Error ? error.message : error);
    await restore('cancel request failed');
    return json({ error: '카드 취소를 요청하지 못했어요. 이용권은 그대로예요. 카드 취소가 이미 됐는지 확인하려면 ask.saseok@gmail.com으로 문의해 주세요.', code: 'refund_failed' }, 502);
  }
  return json({ ok: true, oid: order.oid, amount: order.amount });
}

export default async function handler(req: Request): Promise<Response> {
  const action = new URL(req.url).searchParams.get('action');
  if (!supabaseBase() || !serviceKey()) return json({ error: '결제 설정이 아직 끝나지 않았어요.' }, 503);
  if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);
  try {
    if (action === 'create') return await createOrder(req);
    if (action === 'complete') return await complete(req);
    if (action === 'webhook') return await webhook(req);
    if (action === 'status') return await planStatus(req);
    if (action === 'cancel') return await cancelPlan(req);
    return json({ error: '알 수 없는 요청이에요.' }, 404);
  } catch (error) {
    console.error('[payments] failed', action, error instanceof Error ? error.message : error);
    // A webhook answered with an error is sent again by PortOne.
    return json({ error: action === 'create' ? '결제를 준비하지 못했어요. 잠시 뒤 다시 시도해 주세요.' : '결제를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, 502);
  }
}
