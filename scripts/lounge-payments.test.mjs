import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const handler = loadTs(fileURLToPath(new URL('../api/payments.ts', import.meta.url))).default;
const userId = '00000000-0000-4000-8000-0000000000aa';
const day = 86_400_000;
const result = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = (action, body = {}, headers = {}) => new Request(`https://app.test/api/payments?action=${action}`, { method: 'POST', headers: { Authorization: 'Bearer session', 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const order = (extra = {}) => ({ id: 'p1', user_id: userId, plan: 'pro', amount: 20_000, oid: 'SS1700000000AAAA', device: 'pc', status: 'paid', tid: 'portone-tx-1', paid_at: new Date(Date.now() - 2 * day).toISOString(), period_start: new Date(Date.now() - 2 * day).toISOString(), period_end: new Date(Date.now() + 28 * day).toISOString(), ...extra });
const paid = (extra = {}) => ({ id: 'SS1700000000AAAA', status: 'PAID', storeId: 'store-test', transactionId: 'portone-tx-1', currency: 'KRW', amount: { total: 20_000 }, method: { type: 'PaymentMethodCard' }, channel: { type: 'TEST' }, ...extra });
const ENV = { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'private-service', PORTONE_STORE_ID: 'store-test', PORTONE_CHANNEL_KEY: 'channel-key-test', PORTONE_API_SECRET: 'portone-secret' };

/**
 * Runs one request with the database and PortOne answering from `world`; returns the response, its body and what was called.
 * world.rows is what the order looks like on each read (the last one repeats), so a race can be played out.
 */
async function ask(action, body, world = {}, { env = {}, headers = {} } = {}) {
  const calls = { patches: [], refunds: [], inserted: [], portone: [] };
  const w = { user: { id: userId, email: 'member@example.com', is_anonymous: false, user_metadata: { nickname: '멤버' } }, row: order(), latest: undefined, seconds: [], posts: [], refund: [200, { cancellation: { status: 'SUCCEEDED' } }], payment: [200, paid()], claim: undefined, paidPatch: undefined, ...world };
  let reads = 0;
  const previous = { ...process.env }, fetch = globalThis.fetch;
  Object.assign(process.env, ENV, env);
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('/auth/v1/user')) return result(w.user);
    if (url.startsWith('https://api.portone.io/')) {
      calls.portone.push({ url, init });
      assert.equal(init.headers.Authorization, 'PortOne portone-secret');
      if (url.endsWith('/cancel')) { calls.refunds.push(JSON.parse(init.body)); if (w.refund === 'network') throw new Error('offline'); return result(w.refund[1], w.refund[0]); }
      return result(w.payment[1], w.payment[0]);
    }
    if (url.includes('lounge_call_usage')) return result(w.seconds.map(seconds => ({ seconds })));
    if (url.includes('lounge_character_posts')) return result(w.posts.map(source => ({ source })));
    if (url.endsWith('/rest/v1/lounge_payments') && init.method === 'POST') { calls.inserted.push(JSON.parse(init.body)); return result([]); }
    if (init.method === 'PATCH') {
      const patch = JSON.parse(init.body); calls.patches.push({ url, patch });
      if (patch.status === 'cancelled') return result(w.claim ?? [{ ...w.row, status: 'cancelled' }]);
      if (patch.status === 'paid' && w.paidPatch === 'error') return result({ message: 'down' }, 500);
      if (patch.status === 'paid' && w.paidPatch === 'taken') return result([]);
      return result([{ ...w.row, ...patch }]);
    }
    if (url.includes('lounge_payments?oid=eq.')) {
      const row = w.rows ? w.rows[Math.min(reads++, w.rows.length - 1)] : w.row;
      return result(row ? [row] : []);
    }
    if (url.includes('lounge_payments?user_id=eq.')) return result(w.latest === undefined ? [w.row] : w.latest);
    throw new Error('Unexpected call ' + url);
  };
  try {
    const response = await handler(request(action, body, headers));
    return { response, body: await response.json(), ...calls };
  } finally {
    globalThis.fetch = fetch;
    for (const name of [...Object.keys(ENV), ...Object.keys(env)]) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
  }
}

// ---- Cancelling from the account ----
test('within 7 days and with no paid feature used the plan is cancelled and the card refunded in full through PortOne', async () => {
  const done = await ask('cancel', { oid: order().oid });
  assert.equal(done.response.status, 200); assert.deepEqual(done.body, { ok: true, oid: order().oid, amount: 20_000 });
  assert.equal(done.patches.length, 1); assert.equal(done.patches[0].patch.status, 'cancelled', 'the plan ends first');
  assert.equal(done.refunds.length, 1);
  assert.equal(done.portone[0].url, `https://api.portone.io/payments/${order().oid}/cancel`);
  assert.match(done.refunds[0].reason, /7일/); assert.equal(done.refunds[0].amount, undefined, 'the whole payment');
  // The free use is not counted as "used": calls within the free minutes, and a few photos the member asked for.
  const light = await ask('cancel', { oid: order().oid }, { seconds: [4 * 60], posts: ['request', 'request', 'request'] });
  assert.equal(light.response.status, 200, 'calls within the free minutes and the free few photos are not use of the plan');
  // Already cancelled at PortOne (from the console, say) counts as done.
  const already = await ask('cancel', { oid: order().oid }, { refund: [409, { type: 'PAYMENT_ALREADY_CANCELLED', message: '이미 취소된 결제입니다.' }] });
  assert.equal(already.response.status, 200); assert.equal(already.patches.length, 1);
});

test('after 7 days, or once a paid feature is used, nothing is cancelled and no refund is asked for; the member is told to write', async () => {
  const late = await ask('cancel', { oid: order().oid }, { row: order({ paid_at: new Date(Date.now() - 8 * day).toISOString() }) });
  assert.equal(late.response.status, 409); assert.equal(late.body.code, 'not_refundable'); assert.equal(late.body.reason, 'late'); assert.match(late.body.error, /ask\.saseok@gmail\.com/);
  assert.deepEqual([late.patches.length, late.refunds.length], [0, 0]);
  for (const world of [{ seconds: [6 * 60] }, { seconds: [3 * 60, 3 * 60] }, { posts: ['character'] }, { posts: ['request', 'request', 'request', 'request'] }]) {
    const used = await ask('cancel', { oid: order().oid }, world);
    assert.equal(used.body.reason, 'used', JSON.stringify(world)); assert.deepEqual([used.patches.length, used.refunds.length], [0, 0]);
  }
  // A month bought ahead has not begun, so using the running one does not count against it.
  const ahead = await ask('cancel', { oid: order().oid }, { row: order({ period_start: new Date(Date.now() + 5 * day).toISOString() }), seconds: [600 * 60] });
  assert.equal(ahead.response.status, 200);
});

test('a refund PortOne refuses or that cannot be asked for puts the plan back; a second press does nothing', async () => {
  const refused = await ask('cancel', { oid: order().oid }, { refund: [400, { type: 'PG_PROVIDER', message: '취소 실패' }] });
  assert.equal(refused.response.status, 502); assert.equal(refused.body.code, 'refund_failed');
  assert.deepEqual(refused.patches.map(item => item.patch.status), ['cancelled', 'paid'], 'ended, then restored');
  const failed = await ask('cancel', { oid: order().oid }, { refund: [200, { cancellation: { status: 'FAILED' } }] });
  assert.deepEqual(failed.patches.map(item => item.patch.status), ['cancelled', 'paid']);
  const offline = await ask('cancel', { oid: order().oid }, { refund: 'network' });
  assert.equal(offline.response.status, 502); assert.deepEqual(offline.patches.map(item => item.patch.status), ['cancelled', 'paid']);
  const second = await ask('cancel', { oid: order().oid }, { claim: [] });
  assert.equal(second.response.status, 409); assert.equal(second.refunds.length, 0, 'only the request that ended the plan asks for the refund');
  const unset = await ask('cancel', { oid: order().oid }, {}, { env: { PORTONE_API_SECRET: '' } });
  assert.equal(unset.body.code, 'cancel_unavailable'); assert.equal(unset.patches.length, 0);
});

test('only the member\'s own, running, latest plan can be cancelled', async () => {
  assert.equal((await ask('cancel', { oid: order().oid }, { row: order({ user_id: '00000000-0000-4000-8000-0000000000bb' }) })).response.status, 404, 'someone else\'s order');
  assert.equal((await ask('cancel', { oid: 'nope' })).response.status, 404, 'an unknown order');
  assert.equal((await ask('cancel', { oid: order().oid }, { row: order({ status: 'cancelled' }) })).body.code, 'already_cancelled');
  assert.equal((await ask('cancel', { oid: order().oid }, { row: order({ status: 'failed' }) })).response.status, 409);
  const later = await ask('cancel', { oid: order().oid }, { latest: [order({ oid: 'SS1800000000BBBB' })] });
  assert.equal(later.body.code, 'cancel_later_first'); assert.equal(later.refunds.length, 0);
  assert.equal((await ask('cancel', { oid: order().oid }, { user: { id: userId, is_anonymous: true } })).response.status, 401, 'a guest');
});

test('the account asks which plan runs now and whether it can be cancelled', async () => {
  const eligible = await ask('status', {});
  assert.deepEqual(eligible.body.order, { oid: order().oid, plan: 'pro', amount: 20_000, paidAt: eligible.body.order.paidAt, periodEnd: eligible.body.order.periodEnd, refundable: true, canCancel: true });
  const used = await ask('status', {}, { seconds: [10 * 60] });
  assert.equal(used.body.order.refundable, false); assert.equal(used.body.order.reason, 'used'); assert.match(used.body.order.message, /사용/);
  const none = await ask('status', {}, { latest: [], row: undefined });
  assert.deepEqual(none.body, { order: null });
});

// ---- Opening the PortOne window (2026-11-13) ----
test('Pro is sold by the month (20,000) and by the year (150,000); the server sets the price and builds the PortOne request', async () => {
  const month = await ask('create', { plan: 'pro', term: 'month', device: 'pc', phone: '010-1234-5678', price: 1 });
  assert.equal(month.response.status, 200);
  assert.equal(month.inserted[0].plan, 'pro'); assert.equal(month.inserted[0].amount, 20_000); assert.match(month.inserted[0].oid, /^SS/);
  assert.equal(month.inserted[0].phone, undefined, 'the phone number is not stored');
  const req = month.body.request;
  assert.equal(req.totalAmount, 20_000, 'a price sent by the browser is ignored');
  assert.equal(req.paymentId, month.inserted[0].oid); assert.equal(month.body.oid, req.paymentId);
  assert.deepEqual([req.storeId, req.channelKey, req.currency, req.payMethod], ['store-test', 'channel-key-test', 'KRW', 'CARD']);
  assert.deepEqual(req.customer, { fullName: '멤버', email: 'member@example.com', phoneNumber: '01012345678' }, 'KG Inicis\'s PC window needs all three');
  assert.equal(req.redirectUrl, 'https://app.test/lounge/payment');
  assert.deepEqual(req.noticeUrls, ['https://app.test/api/payments?action=webhook']);
  assert.ok(!JSON.stringify(month.body).includes('portone-secret'), 'the API secret never reaches the browser');
  const year = await ask('create', { plan: 'pro', term: 'year', device: 'mobile' });
  assert.equal(year.inserted[0].amount, 150_000); assert.match(year.inserted[0].oid, /^SY/);
  assert.equal(year.body.request.totalAmount, 150_000); assert.match(year.body.request.orderName, /1년/);
  assert.equal(year.body.request.customer.phoneNumber, undefined, 'a phone pays without giving the number');
  const none = await ask('create', { plan: 'pro', device: 'mobile' });
  assert.equal(none.inserted[0].amount, 20_000, 'no term is the month');
});

test('a computer without a phone number, Plus, an unknown plan, a guest or missing PortOne settings open nothing', async () => {
  for (const phone of [undefined, '', '1234', '02-123-4567']) {
    const refused = await ask('create', { plan: 'pro', term: 'month', device: 'pc', phone });
    assert.equal(refused.body.code, 'phone_required', String(phone)); assert.equal(refused.inserted.length, 0);
  }
  for (const plan of ['plus', 'max', undefined]) {
    const refused = await ask('create', { plan, term: 'month', device: 'mobile' });
    assert.equal(refused.response.status, 400); assert.equal(refused.inserted.length, 0);
  }
  assert.equal((await ask('create', { plan: 'pro', device: 'mobile' }, { user: { id: userId, is_anonymous: true } })).body.code, 'signup_required');
  const unset = await ask('create', { plan: 'pro', device: 'mobile' }, {}, { env: { PORTONE_CHANNEL_KEY: '' } });
  assert.equal(unset.response.status, 503); assert.equal(unset.inserted.length, 0);
});

// ---- After the window: what PortOne says decides (2026-11-13) ----
const pending = (extra = {}) => order({ status: 'pending', tid: null, paid_at: null, period_start: null, period_end: null, ...extra });

test('a payment PortOne shows as PAID for the exact amount makes the order paid for one month or one year', async () => {
  const month = await ask('complete', { paymentId: pending().oid }, { row: pending(), latest: [] });
  assert.deepEqual(month.body, { result: 'success', oid: pending().oid });
  assert.equal(month.portone[0].url, `https://api.portone.io/payments/${pending().oid}`);
  const write = month.patches.find(item => item.patch.status === 'paid');
  assert.ok(write.url.includes('status=in.(pending,failed)'), 'only an order not paid yet');
  assert.equal(write.patch.tid, 'portone-tx-1'); assert.equal(write.patch.pay_method, 'Card'); assert.equal(write.patch.result_message, 'test channel');
  const length = Date.parse(write.patch.period_end) - Date.parse(write.patch.period_start);
  assert.ok(length >= 28 * day && length <= 31 * day);
  const yearRow = pending({ oid: 'SY1700000000AAAA', amount: 150_000 });
  const year = await ask('complete', { paymentId: yearRow.oid }, { row: yearRow, latest: [], payment: [200, paid({ amount: { total: 150_000 } })] });
  const yearWrite = year.patches.find(item => item.patch.status === 'paid');
  assert.ok(Date.parse(yearWrite.patch.period_end) - Date.parse(yearWrite.patch.period_start) >= 365 * day);
  assert.equal(year.refunds.length, 0);
  // Asking again changes nothing.
  const again = await ask('complete', { paymentId: order().oid });
  assert.deepEqual(again.body, { result: 'success', oid: order().oid }); assert.equal(again.patches.length, 0);
});

test('a wrong amount, another currency or another store is cancelled at PortOne and never paid', async () => {
  for (const payment of [paid({ amount: { total: 100 } }), paid({ currency: 'USD' }), paid({ storeId: 'store-other' })]) {
    const wrong = await ask('complete', { paymentId: pending().oid }, { row: pending(), latest: [], payment: [200, payment] });
    assert.equal(wrong.body.result, 'fail', JSON.stringify(payment));
    assert.equal(wrong.patches.some(item => item.patch.status === 'paid'), false);
    assert.equal(wrong.refunds.length, 1); assert.match(wrong.refunds[0].reason, /불일치/);
    assert.equal(wrong.patches.at(-1).patch.status, 'failed');
  }
});

test('the member\'s return and the webhook arriving together record one payment and cancel nothing', async () => {
  const raced = await ask('complete', { paymentId: pending().oid }, { rows: [pending(), order()], latest: [], paidPatch: 'taken' });
  assert.deepEqual(raced.body, { result: 'success', oid: pending().oid }); assert.equal(raced.refunds.length, 0);
  // A write that fails, and the order is still not paid: the payment is not kept.
  const broken = await ask('complete', { paymentId: pending().oid }, { rows: [pending()], latest: [], paidPatch: 'error' });
  assert.equal(broken.body.result, 'fail'); assert.equal(broken.refunds.length, 1); assert.match(broken.body.message, /취소/);
  // An order marked failed (the window looked closed) that PortOne shows paid after all becomes paid.
  const late = await ask('complete', { paymentId: pending().oid }, { row: pending({ status: 'failed' }), latest: [] });
  assert.equal(late.body.result, 'success'); assert.equal(late.refunds.length, 0);
});

test('a window closed or refused leaves the order failed; one still at the card company stays pending', async () => {
  const closed = await ask('complete', { paymentId: pending().oid, code: 'FAILURE_TYPE_PG', message: '사용자가 결제를 취소하였습니다' }, { row: pending(), payment: [200, paid({ status: 'READY' })] });
  assert.deepEqual(closed.body, { result: 'fail', oid: pending().oid, message: '사용자가 결제를 취소하였습니다' });
  assert.equal(closed.patches[0].patch.status, 'failed'); assert.equal(closed.patches[0].patch.result_code, 'FAILURE_TYPE_PG');
  const never = await ask('complete', { paymentId: pending().oid }, { row: pending(), payment: [404, { type: 'PAYMENT_NOT_FOUND' }] });
  assert.equal(never.body.result, 'fail'); assert.equal(never.patches[0].patch.status, 'failed');
  const refused = await ask('complete', { paymentId: pending().oid }, { row: pending(), payment: [200, paid({ status: 'FAILED', failure: { pgMessage: '한도 초과' } })] });
  assert.equal(refused.body.message, '한도 초과');
  const going = await ask('complete', { paymentId: pending().oid }, { row: pending(), payment: [200, paid({ status: 'PENDING' })] });
  assert.equal(going.body.result, 'fail'); assert.equal(going.patches.length, 0, 'left pending for the webhook');
  assert.equal((await ask('complete', { paymentId: 'nope' })).body.result, 'fail');
  assert.equal((await ask('complete', { paymentId: pending().oid }, { row: pending(), payment: [500, {}] })).response.status, 502, 'PortOne down: tried again later');
});

// ---- The webhook ----
async function signed(body, secretBase64, { id = 'msg_1', timestamp = Math.floor(Date.now() / 1000), tamper = false } = {}) {
  const key = await crypto.subtle.importKey('raw', Buffer.from(secretBase64, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${tamper ? body + ' ' : body}`))).toString('base64');
  return { 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${signature}` };
}

test('a webhook only says which payment to look up; with a secret set it must be signed as Standard Webhooks', async () => {
  const event = JSON.stringify({ type: 'Transaction.Paid', timestamp: new Date().toISOString(), data: { paymentId: pending().oid, storeId: 'store-test', transactionId: 'portone-tx-1' } });
  const open = await ask('webhook', event, { row: pending(), latest: [] }, { headers: {} });
  assert.equal(open.response.status, 200); assert.ok(open.patches.some(item => item.patch.status === 'paid'), 'the payment is looked up and recorded');

  const secret = Buffer.from('a-webhook-secret-for-tests').toString('base64');
  const env = { PORTONE_WEBHOOK_SECRET: `whsec_${secret}` };
  const good = await ask('webhook', event, { row: pending(), latest: [] }, { env, headers: await signed(event, secret) });
  assert.equal(good.response.status, 200); assert.ok(good.patches.some(item => item.patch.status === 'paid'));
  for (const headers of [{}, await signed(event, secret, { tamper: true }), await signed(event, secret, { timestamp: Math.floor(Date.now() / 1000) - 3600 })]) {
    const bad = await ask('webhook', event, { row: pending() }, { env, headers });
    assert.equal(bad.response.status, 400); assert.equal(bad.portone.length, 0);
  }
  // A cancellation made in the PortOne console ends the plan.
  const cancelled = JSON.stringify({ type: 'Transaction.Cancelled', data: { paymentId: order().oid } });
  const ended = await ask('webhook', cancelled, { payment: [200, paid({ status: 'CANCELLED' })] });
  assert.equal(ended.patches[0].patch.status, 'cancelled');
  // Types it does not know are answered 200 and left alone.
  const other = await ask('webhook', JSON.stringify({ type: 'BillingKey.Issued', data: { billingKey: 'x' } }));
  assert.equal(other.response.status, 200); assert.equal(other.portone.length, 0);
});
