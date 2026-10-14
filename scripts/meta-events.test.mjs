import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const exports = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../api/meta-events.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(exports);
const handler = exports.default;
const request = (body, authorization = 'Bearer member-token', origin) => new Request('https://app.test/api/meta-events', { method: 'POST', headers: { Authorization: authorization, 'User-Agent': 'test-agent', 'X-Forwarded-For': '203.0.113.9', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
const event = { eventName: 'CompleteRegistration', eventId: 'CompleteRegistration-user-1', eventSourceUrl: 'https://app.test/lounge?fbclid=private', fbp: 'fb.1.123.456', fbc: 'fb.1.123.abc' };
const run = async (mock, task, env = {}) => {
  const previousFetch = globalThis.fetch, previous = { ...process.env };
  Object.assign(process.env, { META_CAPI_TOKEN: 'secret-capi', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', APP_ORIGIN: 'https://app.test', ...env });
  for (const [name, value] of Object.entries(env)) if (value === undefined) delete process.env[name];
  globalThis.fetch = mock;
  try { await task(); } finally { globalThis.fetch = previousFetch; for (const name of ['META_CAPI_TOKEN', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'APP_ORIGIN', 'META_TEST_EVENT_CODE']) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
};
const ok = body => new Response(JSON.stringify(body), { status: 200 });

test('requests without a login, from another site, or with an unknown event never reach Meta', async () => {
  let calls = 0;
  await run(async () => { calls++; return ok({}); }, async () => {
    assert.equal((await handler(request(event, ''))).status, 401);
    assert.equal((await handler(request(event, undefined, 'https://evil.test'))).status, 403);
    assert.equal((await handler(request({ ...event, eventName: 'Purchase' }))).status, 400);
    assert.equal((await handler(request({ ...event, eventId: 'x' }))).status, 400);
    assert.equal(calls, 0);
  });
});

test('without the access token nothing is relayed and the app is told it was skipped', async () => {
  let calls = 0;
  await run(async () => { calls++; return ok({}); }, async () => {
    const response = await handler(request(event));
    assert.equal(response.status, 202); assert.equal((await response.json()).skipped, true); assert.equal(calls, 0);
  }, { META_CAPI_TOKEN: undefined });
});

test('a member action is relayed with a hashed email and id, the shared event id and no address query', async () => {
  const calls = [];
  await run(async (url, init) => {
    if (url.includes('/auth/')) return ok({ id: 'user-1', email: '  Member@Example.COM ', is_anonymous: false });
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return ok({ events_received: 1 });
  }, async () => {
    const response = await handler(request(event));
    assert.equal(response.status, 200); assert.equal((await response.json()).ok, true);
    const [call] = calls;
    assert.match(call.url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/2860857600965753\/events$/);
    assert.doesNotMatch(call.url, /secret-capi/);
    assert.equal(call.body.access_token, 'secret-capi');
    const [sent] = call.body.data;
    assert.equal(sent.event_name, 'CompleteRegistration'); assert.equal(sent.event_id, event.eventId); assert.equal(sent.action_source, 'website');
    assert.equal(sent.event_source_url, 'https://app.test/lounge', 'the click id in the address is not forwarded');
    assert.deepEqual(sent.user_data.em, [createHash('sha256').update('member@example.com').digest('hex')]);
    assert.deepEqual(sent.user_data.external_id, [createHash('sha256').update('user-1').digest('hex')]);
    assert.equal(sent.user_data.client_ip_address, '203.0.113.9'); assert.equal(sent.user_data.fbp, 'fb.1.123.456');
    assert.doesNotMatch(JSON.stringify(call.body), /member@example/i);
  });
});

test('a guest is not counted as a registration, and a failure at Meta is reported without its details', async () => {
  let relayed = 0;
  await run(async url => url.includes('/auth/') ? ok({ id: 'guest-1', is_anonymous: true }) : (relayed++, ok({})), async () => {
    assert.equal((await handler(request(event))).status, 202); assert.equal(relayed, 0);
  });
  await run(async url => url.includes('/auth/') ? ok({ id: 'user-2', email: 'a@b.test' }) : new Response(JSON.stringify({ error: { message: 'private token detail secret-capi' } }), { status: 400 }), async () => {
    const response = await handler(request({ ...event, eventId: 'CompleteRegistration-user-2' }));
    assert.equal(response.status, 502); assert.doesNotMatch(JSON.stringify(await response.json()), /private|secret-capi/);
  });
});
