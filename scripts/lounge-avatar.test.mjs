import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const module = {};
new Function('exports', ts.transpileModule(readFileSync('api/lounge-avatar.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(module);
const handler = module.default;
const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEhcAAAAASUVORK5CYII=';
const photo = { image, mimeType: 'image/png', consent: true };
const request = (body = photo, token = 'Bearer test-user', origin) => new Request('https://app.test/api/lounge-avatar', { method: 'POST', headers: { Authorization: token, ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
async function run(mock, task) {
  const previousFetch = globalThis.fetch, previous = { ...process.env };
  process.env.GEMINI_API_KEY = 'secret-gemini'; process.env.SUPABASE_URL = 'https://db.test'; process.env.SUPABASE_ANON_KEY = 'public-key'; process.env.APP_ORIGIN = 'https://app.test';
  globalThis.fetch = mock;
  try { await task(); } finally { globalThis.fetch = previousFetch; for (const key of ['GEMINI_API_KEY','SUPABASE_URL','SUPABASE_ANON_KEY','APP_ORIGIN']) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
}
test('auth, consent, origin, file signatures and size are checked before paid requests', async () => {
  let calls = 0;
  await run(async () => { calls++; return json({}); }, async () => {
    assert.equal((await handler(request(photo, ''))).status, 401);
    assert.equal((await handler(request(photo, undefined, 'https://evil.test'))).status, 403);
    for (const body of [null, {}, { ...photo, consent: false }, { ...photo, mimeType: 'image/svg+xml' }, { ...photo, image: btoa('<script>not an image</script>') }, { ...photo, mimeType: 'image/jpeg' }]) assert.equal((await handler(request(body))).status, 400);
    assert.equal((await handler(request({ ...photo, image: 'a'.repeat(2_100_000) }))).status, 413);
    assert.equal(calls, 0);
  });
});
test('anonymous accounts, expired sessions and exhausted quotas never reach Gemini', async () => {
  for (const [auth, authStatus, quota, expected] of [[{ id: 'guest', is_anonymous: true }, 200, true, 403], [{},401,true,401], [{id:'member'},200,false,429]]) {
    await run(async url => {
      if (url.includes('/auth/')) return json(auth, authStatus);
      if (url.includes('/rpc/')) return json(quota);
      throw new Error('Paid API should not be called');
    }, async () => { assert.equal((await handler(request())).status, expected); });
  }
});
test('server fixes the model, prompt, resolution and quota; only final image is returned', async () => {
  await run(async (url, init) => {
    if (url.includes('/auth/')) return json({ id: 'member', is_anonymous: false });
    if (url.includes('/rpc/')) { assert.match(url, /consume_lounge_avatar_generation$/); assert.deepEqual(JSON.parse(init.body), {}); return json(true); }
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent');
    assert.equal(init.headers.Authorization, undefined); assert.equal(init.headers['x-goog-api-key'], 'secret-gemini');
    const input = JSON.parse(init.body);
    assert.match(input.contents[0].parts[0].text, /Preserve their distinctive facial geometry/);
    assert.doesNotMatch(input.contents[0].parts[0].text, /user-injected/);
    assert.deepEqual(input.generationConfig.responseFormat, { image: { aspectRatio: 'ASPECT_RATIO_ONE_BY_ONE', imageSize: 'IMAGE_SIZE_FIVE_TWELVE' } });
    assert.deepEqual(input.contents[0].parts[1].inlineData, { mimeType: 'image/png', data: image });
    return json({ candidates: [{ content: { parts: [{ thought: true, inlineData: { mimeType: 'image/jpeg', data: 'bad-thought' } }, { inlineData: { mimeType: 'image/png', data: image } }] } }] });
  }, async () => {
    const response = await handler(request({ ...photo, model: 'costly-model', prompt: 'user-injected', imageSize: '4K' }));
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { image, mimeType: 'image/png', model: module.AVATAR_MODEL });
  });
});
test('missing setup, safety refusals and upstream billing errors are actionable without leaking secrets', async () => {
  for (const [upstream, status, expected] of [[{},200,422], [{error:{message:'private secret-gemini'}},429,429], [{error:{message:'private secret-gemini'}},403,503]]) {
    await run(async url => url.includes('/auth/') ? json({id:'member'}) : url.includes('/rpc/') ? json(true) : json(upstream,status), async () => {
      const response = await handler(request()); assert.equal(response.status, expected); assert.doesNotMatch(JSON.stringify(await response.json()), /secret-gemini|private/);
    });
  }
  await run(async () => { throw new Error('not called'); }, async () => { delete process.env.GEMINI_API_KEY; assert.equal((await handler(request())).status,503); });
});

test('Google request, permission, quota and billing failures remain distinct without exposing provider data', async () => {
  const cases = [
    [400, 'INVALID_ARGUMENT', 'Invalid value for aspectRatio', 400, 'gemini_invalid_request', false],
    [403, 'PERMISSION_DENIED', 'Project cannot access this resource', 503, 'gemini_permission_denied', false],
    [404, 'NOT_FOUND', 'Model unavailable', 503, 'gemini_model_unavailable', false],
    [429, 'RESOURCE_EXHAUSTED', 'Your prepayment credits are depleted.', 402, 'gemini_credit_exhausted', false],
    [429, 'RESOURCE_EXHAUSTED', 'Insufficient credit balance', 402, 'gemini_credit_exhausted', false],
    [400, 'FAILED_PRECONDITION', 'Billing is not enabled on your project', 402, 'gemini_billing_error', false],
    [403, 'PERMISSION_DENIED', 'Billing account is suspended due to unpaid balance', 402, 'gemini_billing_error', false],
    [429, 'RESOURCE_EXHAUSTED', 'generate_content_free_tier_requests, limit: 0', 402, 'gemini_paid_plan_required', false],
    [429, 'RESOURCE_EXHAUSTED', 'Rate limit exceeded', 429, 'gemini_quota_exceeded', true],
    [503, 'UNAVAILABLE', 'Service unavailable', 502, 'gemini_upstream_error', true],
  ];
  for (const [status, googleStatus, message, expected, code, retryable] of cases) {
    await run(async url => url.includes('/auth/') ? json({ id:'member' }) : url.includes('/rpc/') ? json(true) : json({error:{status:googleStatus,message:`${message} secret-gemini sensitive-input`}},status), async () => {
      const response = await handler(request()); assert.equal(response.status,expected);
      const result = await response.json();assert.equal(result.code,code);assert.equal(result.upstreamStatus,status);assert.equal(result.googleStatus,googleStatus);assert.equal(result.retryable,retryable);
      assert.doesNotMatch(JSON.stringify(result),/secret-gemini|sensitive-input/);
    });
  }
});
