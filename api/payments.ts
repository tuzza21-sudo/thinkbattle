import { getLoungePlan, loungeCallLimitMinutes, loungeOrderPrefix, loungeOrderTerm, loungePhotoMonthly, loungePlanGoodName, type LoungePlan } from '../src/lib/loungePlans';

export const config = { runtime: 'edge' };

// KG Inicis card payments for the paid plan (Pro, by the month or by the year). One order is one month or one year, with no automatic renewal.
//   POST ?action=create          (member, JSON {plan, term, device}) -> a pending order and the fields for the payment window
//   POST ?action=return          (Inicis, PC INIStdPay)       -> approve, record, redirect to /lounge/payment
//   POST ?action=mobile-return   (Inicis, mobile smart pay)   -> the same for phones
//   GET  ?action=close           (Inicis, PC window closed)   -> the page that closes the overlay
//   POST ?action=status          (member)                     -> the plan running now and whether it can be cancelled with a refund
//   POST ?action=cancel          (member, JSON {oid})         -> cancels the plan and refunds the card when the refund terms are met
// The amount always comes from loungePlans on the server, and an order counts as paid only when Inicis approves that
// exact amount for that exact order. Without INICIS_* variables the Inicis test merchant is used: test card payments
// are approved and cancelled again by Inicis the same night.

const TEST_MID = 'INIpayTest';
const MID = process.env.INICIS_MID || TEST_MID;
const SIGN_KEY = process.env.INICIS_SIGN_KEY || (MID === TEST_MID ? 'SU5JTElURV9UUklQTEVERVNfS0VZU1RS' : '');
const MOBILE_HASH_KEY = process.env.INICIS_MOBILE_HASH_KEY || (MID === TEST_MID ? '3CB8183A4BE283555ACC8363C0360223' : '');
const TEST = MID === TEST_MID || process.env.INICIS_TEST === '1';
const STD_HOST = TEST ? 'https://stgstdpay.inicis.com' : 'https://stdpay.inicis.com';
const MOBILE_PAY_URL = 'https://mobile.inicis.com/smart/payment/';
const IDC = ['fc', 'ks', 'stg'];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const html = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

async function digest(algorithm: 'SHA-256' | 'SHA-512', value: string) {
  return new Uint8Array(await crypto.subtle.digest(algorithm, new TextEncoder().encode(value)));
}
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (value: string) => hex(await digest('SHA-256', value));
const sha512Base64 = async (value: string) => btoa(String.fromCharCode(...await digest('SHA-512', value)));

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

async function markFailed(oid: string, code: string, message: string) {
  try {
    await db(`lounge_payments?oid=eq.${oid}&status=eq.pending`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', result_code: code.slice(0, 20), result_message: message.slice(0, 300), updated_at: new Date().toISOString() }) });
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

/** Marks a pending order paid. False when it was no longer pending or the write failed, so the caller cancels. */
async function markPaid(order: PaymentRow, tid: string, payMethod: string) {
  try {
    const { start, end } = await periodFor(order);
    const now = new Date().toISOString();
    const rows = await db<PaymentRow[]>(`lounge_payments?oid=eq.${order.oid}&status=eq.pending`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paid', tid, pay_method: payMethod.slice(0, 40), result_code: '0000', result_message: null, paid_at: now, period_start: start.toISOString(), period_end: end.toISOString(), updated_at: now }),
    });
    return rows.length === 1;
  } catch (error) {
    console.error('[payments] could not record payment', order.oid, error instanceof Error ? error.message : error);
    return false;
  }
}

const resultUrl = (req: Request, params: Record<string, string>) => `${new URL(req.url).origin}/lounge/payment?${new URLSearchParams(params)}`;
// The PC window may post the result inside its overlay frame, so the result page is opened in the top window.
const redirect = (url: string) => html(`<!doctype html><html><head><meta charset="utf-8"><title>결제 결과</title></head><body><script>var u=${JSON.stringify(url).replace(/</g, '\\u003c')};try{(window.top||window).location.replace(u)}catch(e){location.replace(u)}</script><noscript><a href="${url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">결제 결과 보기</a></noscript></body></html>`);
const failTo = (req: Request, message: string) => redirect(resultUrl(req, { result: 'fail', message: message.slice(0, 120) }));

/** An Inicis address is used only when it is https on the host the IDC code names. */
function inicisUrl(raw: string, idc: string, host: (idc: string) => string) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && IDC.includes(idc) && url.hostname === host(idc) ? url : null;
  } catch { return null; }
}

const form = async (req: Request) => new URLSearchParams(await req.text());
const post = (url: string, fields: Record<string, string>) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields), signal: AbortSignal.timeout(20_000) });

/** Inicis's mobile answers are key=value pairs joined by &, with values that are not always escaped. */
function parsePairs(text: string) {
  const out: Record<string, string> = {};
  for (const part of text.split('&')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

async function createOrder(req: Request) {
  const origin = req.headers.get('origin');
  const self = new URL(req.url).origin;
  if (origin && origin !== self && !(process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).includes(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!SIGN_KEY || !MOBILE_HASH_KEY) return json({ error: '결제 설정이 아직 끝나지 않았어요.' }, 503);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer \S+$/i.test(authorization)) return json({ error: '로그인이 필요해요.' }, 401);
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const auth = await fetch(`${supabaseBase()}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization }, signal: AbortSignal.timeout(10_000) });
  if (!auth.ok) return json({ error: '다시 로그인해 주세요.' }, 401);
  const user = await auth.json() as { id?: string; email?: string; is_anonymous?: boolean; user_metadata?: { nickname?: string; name?: string } };
  if (!user.id) return json({ error: '다시 로그인해 주세요.' }, 401);
  if (user.is_anonymous || !user.email) return json({ error: '회원가입 후 결제할 수 있어요.', code: 'signup_required' }, 403);

  let body: { plan?: unknown; term?: unknown; device?: unknown };
  try { body = JSON.parse(await req.text()); } catch { return json({ error: '요청 형식이 올바르지 않아요.' }, 400); }
  const plan = getLoungePlan(body.plan, body.term);
  if (!plan) return json({ error: '요금제를 다시 골라 주세요.' }, 400);
  const device = body.device === 'mobile' ? 'mobile' : 'pc';

  const oid = `${loungeOrderPrefix[plan.term]}${Date.now()}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`.slice(0, 40);
  await db('lounge_payments', { method: 'POST', body: JSON.stringify({ user_id: user.id, plan: plan.id, amount: plan.price, oid, device }) });

  const buyerName = (user.user_metadata?.nickname || user.user_metadata?.name || user.email.split('@')[0]).slice(0, 15);
  return json(device === 'mobile' ? await mobileFields(plan, oid, buyerName, user.email, self) : await pcFields(plan, oid, buyerName, user.email, self));
}

async function pcFields(plan: LoungePlan, oid: string, buyerName: string, email: string, origin: string) {
  const price = String(plan.price), timestamp = String(Date.now());
  return {
    mode: 'pc', scriptUrl: `${STD_HOST}/stdjs/INIStdPay.js`, oid,
    fields: {
      version: '1.0', gopaymethod: 'Card', mid: MID, oid, price, timestamp, use_chkfake: 'Y',
      signature: await sha256(`oid=${oid}&price=${price}&timestamp=${timestamp}`),
      verification: await sha256(`oid=${oid}&price=${price}&signKey=${SIGN_KEY}&timestamp=${timestamp}`),
      mKey: await sha256(SIGN_KEY),
      currency: 'WON', goodname: loungePlanGoodName(plan), buyername: buyerName, buyertel: '', buyeremail: email,
      returnUrl: `${origin}/api/payments?action=return`, closeUrl: `${origin}/api/payments?action=close`,
      acceptmethod: 'centerCd(Y)', charset: 'UTF-8',
    },
  };
}

async function mobileFields(plan: LoungePlan, oid: string, buyerName: string, email: string, origin: string) {
  const amount = String(plan.price), timestamp = String(Date.now());
  return {
    mode: 'mobile', actionUrl: MOBILE_PAY_URL, oid,
    fields: {
      P_INI_PAYMENT: 'CARD', P_MID: MID, P_OID: oid, P_AMT: amount, P_GOODS: loungePlanGoodName(plan), P_UNAME: buyerName, P_EMAIL: email,
      P_NEXT_URL: `${origin}/api/payments?action=mobile-return`, P_NOTI: oid, P_CHARSET: 'utf8',
      P_TIMESTAMP: timestamp, P_CHKFAKE: await sha512Base64(`${amount}${oid}${timestamp}${MOBILE_HASH_KEY}`),
      P_RESERVED: 'centerCd=Y&amt_hash=Y',
    },
  };
}

async function pcReturn(req: Request) {
  const data = await form(req);
  const oid = data.get('orderNumber') || '';
  const order = await findOrder(oid).catch(() => undefined);
  if (!order) return failTo(req, '주문을 찾지 못했어요.');
  if (order.status === 'paid') return redirect(resultUrl(req, { result: 'success', oid }));
  const code = data.get('resultCode') || '', message = data.get('resultMsg') || '결제가 완료되지 않았어요.';
  if (code !== '0000') { await markFailed(oid, code, message); return failTo(req, message); }

  const idc = data.get('idc_name') || '', authToken = data.get('authToken') || '';
  const host = (name: string) => `${name}stdpay.inicis.com`;
  const authUrl = inicisUrl(data.get('authUrl') || '', idc, host);
  const netCancelUrl = inicisUrl(data.get('netCancelUrl') || '', idc, host);
  if (data.get('mid') !== MID || !authUrl || !authToken) { await markFailed(oid, 'invalid', 'invalid return'); return failTo(req, '결제 정보를 확인하지 못했어요.'); }

  const sign = async () => {
    const timestamp = String(Date.now());
    return {
      mid: MID, authToken, timestamp, charset: 'UTF-8', format: 'JSON', price: String(order.amount),
      signature: await sha256(`authToken=${authToken}&timestamp=${timestamp}`),
      verification: await sha256(`authToken=${authToken}&signKey=${SIGN_KEY}&timestamp=${timestamp}`),
    };
  };
  const netCancel = async () => {
    if (!netCancelUrl) return;
    try { await post(netCancelUrl.href, await sign()); } catch (error) { console.error('[payments] net cancel failed', oid, error instanceof Error ? error.message : error); }
  };

  let approval: Record<string, unknown>;
  try {
    const response = await post(authUrl.href, await sign());
    approval = await response.json() as Record<string, unknown>;
  } catch (error) {
    console.error('[payments] approval failed', oid, error instanceof Error ? error.message : error);
    await netCancel(); await markFailed(oid, 'network', 'approval request failed');
    return failTo(req, '결제 승인 중 연결이 끊겼어요. 결제는 취소됐어요.');
  }
  if (approval.resultCode !== '0000') {
    const reason = String(approval.resultMsg || '결제가 승인되지 않았어요.');
    await markFailed(oid, String(approval.resultCode || ''), reason);
    return failTo(req, reason);
  }
  if (Number(approval.TotPrice) !== order.amount || String(approval.MOID) !== oid || !(await markPaid(order, String(approval.tid || ''), String(approval.payMethod || '')))) {
    await netCancel(); await markFailed(oid, 'mismatch', `approved ${String(approval.TotPrice)} for ${String(approval.MOID)}`);
    return failTo(req, '결제 기록을 남기지 못해 결제를 취소했어요.');
  }
  return redirect(resultUrl(req, { result: 'success', oid }));
}

async function mobileReturn(req: Request) {
  const data = await form(req);
  const oid = data.get('P_NOTI') || '';
  const order = await findOrder(oid).catch(() => undefined);
  if (!order) return failTo(req, '주문을 찾지 못했어요.');
  if (order.status === 'paid') return redirect(resultUrl(req, { result: 'success', oid }));
  const status = data.get('P_STATUS') || '', message = data.get('P_RMESG1') || '결제가 완료되지 않았어요.';
  if (status !== '00') { await markFailed(oid, status, message); return failTo(req, message); }

  const tid = data.get('P_TID') || '';
  const reqUrl = inicisUrl(data.get('P_REQ_URL') || '', data.get('idc_name') || '', name => `${name}mobile.inicis.com`);
  if (!reqUrl || !tid) { await markFailed(oid, 'invalid', 'invalid return'); return failTo(req, '결제 정보를 확인하지 못했어요.'); }
  const netCancel = async () => {
    try {
      const timestamp = String(Date.now()), amount = String(order.amount);
      await post(`${reqUrl.origin}/smart/payNetCancel.ini`, { P_TID: tid, P_MID: MID, P_AMT: amount, P_OID: oid, P_TIMESTAMP: timestamp, P_CHKFAKE: await sha512Base64(`${amount}${oid}${timestamp}${MOBILE_HASH_KEY}`) });
    } catch (error) { console.error('[payments] mobile net cancel failed', oid, error instanceof Error ? error.message : error); }
  };

  let approval: Record<string, string>;
  try {
    approval = parsePairs(await (await post(reqUrl.href, { P_MID: MID, P_TID: tid })).text());
  } catch (error) {
    console.error('[payments] mobile approval failed', oid, error instanceof Error ? error.message : error);
    await netCancel(); await markFailed(oid, 'network', 'approval request failed');
    return failTo(req, '결제 승인 중 연결이 끊겼어요. 결제는 취소됐어요.');
  }
  if (approval.P_STATUS !== '00') {
    const reason = approval.P_RMESG1 || '결제가 승인되지 않았어요.';
    await markFailed(oid, approval.P_STATUS || '', reason);
    return failTo(req, reason);
  }
  if (Number(approval.P_AMT) !== order.amount || (approval.P_OID && approval.P_OID !== oid) || !(await markPaid(order, approval.P_TID || tid, approval.P_TYPE || 'CARD'))) {
    await netCancel(); await markFailed(oid, 'mismatch', `approved ${approval.P_AMT} for ${approval.P_OID}`);
    return failTo(req, '결제 기록을 남기지 못해 결제를 취소했어요.');
  }
  return redirect(resultUrl(req, { result: 'success', oid }));
}

// ---- Cancelling a plan from the account (2026-11-07) ----
// The terms (청약철회): within 7 days of paying, with none of the paid features used, the plan is cancelled and the whole
// amount refunded. The member does it from the account; any other case (7 days passed, or a paid feature used) is the
// prorated refund the terms promise by e-mail, which a person decides. The refund is Inicis's INIAPI card cancellation
// (needs INICIS_API_KEY, and the server's address registered with Inicis; INICIS_API_CLIENT_IP names it). Without the
// key nothing is cancelled and the member is told to write.
const REFUND_DAYS = 7;
const INIAPI_REFUND_URL = 'https://iniapi.inicis.com/v2/pg/refund';
const inicisApiKey = () => process.env.INICIS_API_KEY || (MID === TEST_MID ? 'ItEQKi3rY7uvDS8l' : '');

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
  const origin = req.headers.get('origin');
  const self = new URL(req.url).origin;
  if (origin && origin !== self && !(process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).includes(origin)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
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
  return json({ order: { oid: order.oid, plan: order.plan, amount: order.amount, paidAt: order.paid_at ?? null, periodEnd: order.period_end, refundable: check.ok, ...(check.ok ? {} : { reason: check.reason, message: check.message }), canCancel: Boolean(inicisApiKey() && order.tid) } });
}

const kstStamp = (time = Date.now()) => new Date(time + 9 * 3_600_000).toISOString().replace(/\D/g, '').slice(0, 14);

/** Asks Inicis to cancel the whole card approval. */
async function inicisRefund(order: PaymentRow): Promise<{ ok: boolean; code: string; message: string }> {
  const type = 'Refund', paymethod = 'Card', timestamp = kstStamp(), clientIp = process.env.INICIS_API_CLIENT_IP || '127.0.0.1', tid = String(order.tid);
  const hashData = hex(await digest('SHA-512', `${inicisApiKey()}${type}${paymethod}${timestamp}${clientIp}${MID}${tid}`));
  const response = await fetch(INIAPI_REFUND_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json;charset=utf-8' }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ type, paymethod, timestamp, clientIp, mid: MID, tid, msg: '회원 요청 이용권 취소(7일 이내)', hashData }),
  });
  const body = await response.json().catch(() => ({})) as { resultCode?: string; resultMsg?: string };
  return { ok: body.resultCode === '00', code: String(body.resultCode ?? response.status), message: String(body.resultMsg ?? '') };
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
  if (!order.tid || !inicisApiKey()) return json({ error: '자동 취소 설정이 아직 끝나지 않았어요. ask.saseok@gmail.com으로 문의해 주세요.', code: 'cancel_unavailable' }, 503);
  const check = await refundable(order);
  if (!check.ok) return json({ error: `${check.message} 남은 기간만큼의 환불은 ask.saseok@gmail.com으로 문의해 주세요.`, code: 'not_refundable', reason: check.reason }, 409);

  // The plan ends first (only one request can do this), then the card is refunded; a refund that fails puts the plan back.
  const claimed = await db<PaymentRow[]>(`lounge_payments?oid=eq.${order.oid}&status=eq.paid`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', result_code: 'cancel', result_message: '회원 요청 취소(7일 이내)', updated_at: new Date().toISOString() }) });
  if (claimed.length !== 1) return json({ error: '이미 처리된 요청이에요.', code: 'already_cancelled' }, 409);
  const restore = async (message: string) => {
    try { await db(`lounge_payments?oid=eq.${order.oid}&status=eq.cancelled`, { method: 'PATCH', body: JSON.stringify({ status: 'paid', result_code: '0000', result_message: message.slice(0, 300), updated_at: new Date().toISOString() }) }); }
    catch (error) { console.error('[payments] could not restore the plan after a failed refund', order.oid, error instanceof Error ? error.message : error); }
  };
  try {
    const refund = await inicisRefund(order);
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
  try {
    if (action === 'close') return html(`<!doctype html><html><head><meta charset="utf-8"><script src="${STD_HOST}/stdjs/INIStdPay_close.js" charset="UTF-8"></script></head><body></body></html>`);
    if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);
    if (action === 'create') return await createOrder(req);
    if (action === 'status') return await planStatus(req);
    if (action === 'cancel') return await cancelPlan(req);
    if (action === 'return') return await pcReturn(req);
    if (action === 'mobile-return') return await mobileReturn(req);
    return json({ error: '알 수 없는 요청이에요.' }, 404);
  } catch (error) {
    console.error('[payments] failed', action, error instanceof Error ? error.message : error);
    return action === 'create' ? json({ error: '결제를 준비하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, 502) : failTo(req, '결제를 처리하지 못했어요. 문의해 주세요.');
  }
}
