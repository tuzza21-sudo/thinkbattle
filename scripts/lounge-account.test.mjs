import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const handler = loadTs(fileURLToPath(new URL('../api/account.ts', import.meta.url))).default;
const userId = '00000000-0000-4000-8000-0000000000bb';
const result = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = (body = {}, method = 'POST', headers = { Authorization: 'Bearer session' }) => new Request('https://app.test/api/account?action=delete', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'POST' ? JSON.stringify(body) : undefined });

/** Runs one request with Supabase answering from `world`; returns the response and what was called. */
async function ask(req, world = {}) {
  const calls = { removedFiles: [], deletedUsers: [], records: [] };
  const w = { ready: true, plan: [], files: { 'lounge-avatars': [{ name: 'a.webp', id: '1' }] }, deleteStatus: 200, ...world };
  const previous = { ...process.env }, fetch = globalThis.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'private-service' });
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('/auth/v1/user')) return w.unauthorized ? result({}, 401) : result({ id: userId });
    if (url.includes('/auth/v1/admin/users/')) { calls.deletedUsers.push(url.split('/').pop()); return result({}, w.deleteStatus); }
    if (url.includes('/rest/v1/lounge_deleted_accounts?')) return w.ready ? result([]) : result({ message: 'relation does not exist' }, 404);
    if (url.includes('/rest/v1/lounge_deleted_accounts')) { calls.records.push(JSON.parse(init.body)); return result([], 201); }
    if (url.includes('/rest/v1/lounge_payments')) return result(w.plan);
    const listing = url.match(/\/storage\/v1\/object\/list\/([a-z-]+)$/);
    if (listing) { const files = w.files[listing[1]] ?? []; w.files[listing[1]] = []; return result(files); }
    const removal = url.match(/\/storage\/v1\/object\/([a-z-]+)$/);
    if (removal && init.method === 'DELETE') { calls.removedFiles.push(...JSON.parse(init.body).prefixes); return result([]); }
    throw new Error('Unexpected call ' + url);
  };
  try {
    const response = await handler(req);
    return { response, body: await response.json(), ...calls };
  } finally { globalThis.fetch = fetch; for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
}

test('a member deletes their account: the files go, then the account, and one anonymous record is kept', async () => {
  const done = await ask(request());
  assert.equal(done.response.status, 200); assert.equal(done.body.ok, true);
  assert.deepEqual(done.removedFiles, [`${userId}/a.webp`]);
  assert.deepEqual(done.deletedUsers, [userId]);
  assert.deepEqual(done.records, [{ had_paid_plan: false }]);
});

test('without the migration nothing is deleted', async () => {
  const early = await ask(request(), { ready: false });
  assert.equal(early.response.status, 503); assert.equal(early.body.code, 'not_ready');
  assert.equal(early.deletedUsers.length, 0); assert.equal(early.removedFiles.length, 0);
});

test('a running paid plan is said first and must be accepted', async () => {
  const plan = [{ period_end: new Date(Date.now() + 86_400_000).toISOString() }];
  const told = await ask(request(), { plan });
  assert.equal(told.response.status, 409); assert.equal(told.body.code, 'paid_plan_running');
  assert.equal(told.deletedUsers.length, 0, 'nothing is deleted before the member accepts');
  const accepted = await ask(request({ acceptPaid: true }), { plan });
  assert.equal(accepted.response.status, 200); assert.deepEqual(accepted.records, [{ had_paid_plan: true }]);
});

test('only a signed-in member, only a POST, and a refused deletion is reported', async () => {
  assert.equal((await ask(request({}, 'POST', {}))).response.status, 401);
  assert.equal((await ask(request(), { unauthorized: true })).response.status, 401);
  assert.equal((await ask(request({}, 'GET'))).response.status, 405);
  const refused = await ask(request(), { deleteStatus: 500 });
  assert.equal(refused.response.status, 502); assert.equal(refused.body.code, 'delete_failed');
  assert.equal(refused.records.length, 0, 'no record of a deletion that did not happen');
});
