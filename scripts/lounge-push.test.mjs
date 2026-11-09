import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const server = loadTs(fileURLToPath(new URL('../src/lib/pushServer.ts', import.meta.url)));
const handler = loadTs(fileURLToPath(new URL('../api/push.ts', import.meta.url))).default;
const userId = '00000000-0000-4000-8000-0000000000cc';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const account = { project_id: 'demo-project', client_email: 'push@demo-project.iam.gserviceaccount.com', private_key: privateKey };
const result = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = (headers = { Authorization: 'Bearer session' }, method = 'POST') => new Request('https://app.test/api/push?action=test', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'POST' ? '{}' : undefined });

async function ask(req, world = {}) {
  const calls = { sent: [], deleted: [], patched: 0 };
  const w = { tokens: [{ token: 'token-aaaaaaaaaaaaaaaaaaaa', last_test_at: null }], fcm: 200, configured: true, ready: true, ...world };
  const previous = { ...process.env }, fetch = globalThis.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'private-service' });
  if (w.configured) process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(account); else delete process.env.FIREBASE_SERVICE_ACCOUNT;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('/auth/v1/user')) return result({ id: userId });
    if (url.includes('oauth2.googleapis.com/token')) return result({ access_token: 'access-1', expires_in: 3600 });
    if (url.includes('fcm.googleapis.com')) { calls.sent.push(JSON.parse(init.body).message); return result(w.fcm === 200 ? { name: 'x' } : { error: { status: w.fcm === 404 ? 'UNREGISTERED' : 'INTERNAL' } }, w.fcm); }
    if (url.includes('/rest/v1/lounge_push_tokens') && (init.method ?? 'GET') === 'GET') return w.ready ? result(w.tokens) : result({ message: 'no table' }, 404);
    if (url.includes('/rest/v1/lounge_push_tokens') && init.method === 'DELETE') { calls.deleted.push(decodeURIComponent(url.split('token=eq.')[1])); return result([]); }
    if (url.includes('/rest/v1/lounge_push_tokens') && init.method === 'PATCH') { calls.patched += 1; return result([]); }
    throw new Error('Unexpected call ' + url);
  };
  try { const response = await handler(req); return { response, body: await response.json(), ...calls }; }
  finally { globalThis.fetch = fetch; for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'FIREBASE_SERVICE_ACCOUNT']) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
}

test('the service account is read from one line of JSON, and a broken one is no account', () => {
  assert.equal(server.readServiceAccount({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) })?.project_id, 'demo-project');
  assert.equal(server.readServiceAccount({ FIREBASE_SERVICE_ACCOUNT: '{' }), undefined);
  assert.equal(server.readServiceAccount({}), undefined);
});

test('a test notification goes to every token of the member, with the channel and the page to open', async () => {
  const done = await ask(request());
  assert.equal(done.response.status, 200); assert.equal(done.body.sent, 1);
  assert.equal(done.sent[0].token, 'token-aaaaaaaaaaaaaaaaaaaa');
  assert.equal(done.sent[0].android.notification.channel_id, 'saseok');
  assert.equal(done.sent[0].data.url, '/lounge');
  assert.equal(done.patched, 1, 'the time of the test is kept');
});

test('a token Firebase no longer knows is deleted; other failures keep it', async () => {
  const gone = await ask(request(), { fcm: 404 });
  assert.equal(gone.response.status, 502); assert.deepEqual(gone.deleted, ['token-aaaaaaaaaaaaaaaaaaaa']);
  const failed = await ask(request(), { fcm: 500 });
  assert.equal(failed.response.status, 502); assert.equal(failed.deleted.length, 0);
});

test('no key, no table, no phone, one test in 30 seconds, only a signed-in POST', async () => {
  assert.equal((await ask(request(), { configured: false })).body.code, 'push_not_configured');
  assert.equal((await ask(request(), { ready: false })).body.code, 'not_ready');
  assert.equal((await ask(request(), { tokens: [] })).body.code, 'no_token');
  const soon = await ask(request(), { tokens: [{ token: 'token-bbbbbbbbbbbbbbbbbbbb', last_test_at: new Date().toISOString() }] });
  assert.equal(soon.response.status, 429); assert.equal(soon.sent.length, 0);
  assert.equal((await ask(request({}))).response.status, 401);
  assert.equal((await ask(request({}, 'GET'))).response.status, 405);
});
