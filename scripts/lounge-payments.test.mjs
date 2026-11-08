import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const handler = loadTs(fileURLToPath(new URL('../api/payments.ts', import.meta.url))).default;
const userId = '00000000-0000-4000-8000-0000000000aa';
const day = 86_400_000;
const result = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = (action, body = {}) => new Request(`https://app.test/api/payments?action=${action}`, { method: 'POST', headers: { Authorization: 'Bearer session', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const order = (extra = {}) => ({ id: 'p1', user_id: userId, plan: 'plus', amount: 20_000, oid: 'SS1700000000AAAA', device: 'pc', status: 'paid', tid: 'INIpayTest_tid_1', paid_at: new Date(Date.now() - 2 * day).toISOString(), period_start: new Date(Date.now() - 2 * day).toISOString(), period_end: new Date(Date.now() + 28 * day).toISOString(), ...extra });

/** Runs one request with the database and Inicis answering from `world`; returns the response, its body and what was called. */
async function ask(action, body, world = {}) {
  const calls = { patches: [], refunds: [] };
  const w = { user: { id: userId }, row: order(), latest: undefined, seconds: [], posts: [], refund: { resultCode: '00', resultMsg: '정상' }, claim: undefined, ...world };
  const previous = { ...process.env }, fetch = globalThis.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'private-service' });
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('/auth/v1/user')) return result(w.user);
    if (url.includes('iniapi.inicis.com')) { calls.refunds.push(JSON.parse(init.body)); if (w.refund === 'network') throw new Error('offline'); return result(w.refund); }
    if (url.includes('lounge_call_usage')) return result(w.seconds.map(seconds => ({ seconds })));
    if (url.includes('lounge_character_posts')) return result(w.posts.map(source => ({ source })));
    if (init.method === 'PATCH') {
      const patch = JSON.parse(init.body); calls.patches.push({ url, patch });
      if (patch.status === 'cancelled') return result(w.claim ?? [{ ...w.row, status: 'cancelled' }]);
      return result([{ ...w.row, status: 'paid' }]);
    }
    if (url.includes('lounge_payments?oid=eq.')) return result(w.row ? [w.row] : []);
    if (url.includes('lounge_payments?user_id=eq.')) return result(w.latest === undefined ? [w.row] : w.latest);
    throw new Error('Unexpected call ' + url);
  };
  try {
    const response = await handler(request(action, body));
    return { response, body: await response.json(), ...calls };
  } finally { globalThis.fetch = fetch; for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
}

test('within 7 days and with no paid feature used the plan is cancelled and the card refunded in full', async () => {
  const done = await ask('cancel', { oid: order().oid });
  assert.equal(done.response.status, 200); assert.deepEqual(done.body, { ok: true, oid: order().oid, amount: 20_000 });
  assert.equal(done.patches.length, 1); assert.equal(done.patches[0].patch.status, 'cancelled', 'the plan ends first');
  assert.equal(done.refunds.length, 1);
  const refund = done.refunds[0];
  assert.equal(refund.type, 'Refund'); assert.equal(refund.paymethod, 'Card'); assert.equal(refund.tid, 'INIpayTest_tid_1'); assert.equal(refund.mid, 'INIpayTest');
  assert.match(refund.hashData, /^[0-9a-f]{128}$/); assert.match(refund.timestamp, /^\d{14}$/);
  // The free use is not counted as "used": calls within the free minutes, and a few photos the member asked for.
  const light = await ask('cancel', { oid: order().oid }, { seconds: [4 * 60], posts: ['request', 'request', 'request'] });
  assert.equal(light.response.status, 200, 'calls within the free minutes and the free few photos are not use of the plan');
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

test('a refund Inicis refuses or that cannot be asked for puts the plan back; a second press does nothing', async () => {
  const refused = await ask('cancel', { oid: order().oid }, { refund: { resultCode: '01', resultMsg: '이미 취소된 거래' } });
  assert.equal(refused.response.status, 502); assert.equal(refused.body.code, 'refund_failed');
  assert.deepEqual(refused.patches.map(item => item.patch.status), ['cancelled', 'paid'], 'ended, then restored');
  const offline = await ask('cancel', { oid: order().oid }, { refund: 'network' });
  assert.equal(offline.response.status, 502); assert.deepEqual(offline.patches.map(item => item.patch.status), ['cancelled', 'paid']);
  const second = await ask('cancel', { oid: order().oid }, { claim: [] });
  assert.equal(second.response.status, 409); assert.equal(second.refunds.length, 0, 'only the request that ended the plan asks for the refund');
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
  assert.deepEqual(eligible.body.order, { oid: order().oid, plan: 'plus', amount: 20_000, paidAt: eligible.body.order.paidAt, periodEnd: eligible.body.order.periodEnd, refundable: true, canCancel: true });
  const used = await ask('status', {}, { seconds: [10 * 60] });
  assert.equal(used.body.order.refundable, false); assert.equal(used.body.order.reason, 'used'); assert.match(used.body.order.message, /사용/);
  const none = await ask('status', {}, { latest: [] , row: undefined });
  assert.deepEqual(none.body, { order: null });
});

// ---- One paid plan, by the month or the year (2026-11-08) ----
async function create(body, world = {}) {
  const inserted = [];
  const previous = { ...process.env }, fetch = globalThis.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'private-service' });
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('/auth/v1/user')) return result({ id: userId, email: 'member@example.com', is_anonymous: false, user_metadata: { nickname: '멤버' } });
    if (url.endsWith('/rest/v1/lounge_payments') && init.method === 'POST') { inserted.push(JSON.parse(init.body)); return result([]); }
    throw new Error('Unexpected call ' + url);
  };
  try {
    const response = await handler(request('create', { device: 'pc', ...body }));
    return { response, body: await response.json(), inserted };
  } finally { globalThis.fetch = fetch; for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
}

test('Pro is sold by the month (20,000) and by the year (150,000); the server sets the price and the order id says which', async () => {
  const month = await create({ plan: 'pro', term: 'month', price: 1 });
  assert.equal(month.response.status, 200);
  assert.equal(month.inserted[0].plan, 'pro'); assert.equal(month.inserted[0].amount, 20_000); assert.match(month.inserted[0].oid, /^SS/);
  assert.equal(month.body.fields.price, '20000', 'a price sent by the browser is ignored');
  const year = await create({ plan: 'pro', term: 'year' });
  assert.equal(year.inserted[0].plan, 'pro'); assert.equal(year.inserted[0].amount, 150_000); assert.match(year.inserted[0].oid, /^SY/);
  assert.equal(year.body.fields.price, '150000'); assert.match(year.body.fields.goodname, /1년/);
  const none = await create({ plan: 'pro' });
  assert.equal(none.inserted[0].amount, 20_000, 'no term is the month');
});

test('Plus is no longer sold, and an unknown plan is refused', async () => {
  for (const plan of ['plus', 'max', undefined]) {
    const refused = await create({ plan, term: 'month' });
    assert.equal(refused.response.status, 400); assert.equal(refused.inserted.length, 0);
  }
});
