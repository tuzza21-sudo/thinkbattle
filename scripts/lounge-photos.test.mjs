import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { loadTs } from './lounge-ts-loader.mjs';

const photos = loadTs(fileURLToPath(new URL('../src/lib/loungePhotos.ts', import.meta.url)));
const lounge = loadTs(fileURLToPath(new URL('../src/lib/lounge.ts', import.meta.url)));
const characters = loadTs(fileURLToPath(new URL('../src/lib/loungeCharacters.ts', import.meta.url)));
const handler = loadTs(fileURLToPath(new URL('../api/lounge-images.ts', import.meta.url))).default;
const roomId = 'lounge-00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-0000000000aa';
const result = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = (body, init = {}) => new Request('https://app.test/api/lounge-images', { method: 'POST', headers: { Authorization: 'Bearer session', 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...init });
const sceneOutput = value => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const run = async (mock, task) => {
  const previous = { ...process.env }, fetch = globalThis.fetch;
  Object.assign(process.env, { OPENAI_API_KEY: 'test-key', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'private-service', CRON_SECRET: 'cron-secret' });
  globalThis.fetch = mock;
  try { await task(); } finally { globalThis.fetch = fetch; for (const name of ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET']) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
};

test('the deployed ESM function loads with real Node resolution (Vercel compiles it file by file)', async () => {
  const workspace = fileURLToPath(new URL('../', import.meta.url));
  const tempRoot = resolve(workspace, 'node_modules/.tmp');
  mkdirSync(tempRoot, { recursive: true });
  const directory = mkdtempSync(resolve(tempRoot, 'lounge-images-runtime-'));
  try {
    writeFileSync(resolve(directory, 'package.json'), JSON.stringify({ type: 'module' }));
    const relationship = ['index', 'events', 'types', 'engine', 'persistence', 'memory', 'templates', 'configs/auditor', 'configs/closer', 'configs/diplomat', 'configs/empath', 'configs/lawyer', 'configs/trickster', 'configs/velvetKnife', 'configs/wit'].map(name => `src/lib/relationship/${name}.ts`);
    for (const file of ['api/lounge-images.ts', 'src/lib/lounge.ts', 'src/lib/loungeCharacters.ts', 'src/lib/loungePhotos.ts', 'src/lib/loungeCustomCharacters.ts', ...relationship]) {
      const target = resolve(directory, file.replace(/\.ts$/, '.js'));
      mkdirSync(resolve(target, '..'), { recursive: true });
      writeFileSync(target, ts.transpileModule(readFileSync(resolve(workspace, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText);
    }
    const { default: deployed } = await import(pathToFileURL(resolve(directory, 'api/lounge-images.js')).href);
    assert.equal((await deployed(new Request('https://app.test/api/lounge-images', { method: 'PUT' }))).status, 503, 'loads and answers (no configuration in the test)');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('a photo keeps the character\'s face from their own photos and stays clothed and tasteful', () => {
  const velvet = characters.getLoungeCharacter('velvet');
  assert.deepEqual(photos.loungePhotoReferences('velvet'), [lounge.getLoungeHost('velvet').portrait, ...(velvet.fullBody ? [velvet.fullBody] : [])]);
  assert.deepEqual(photos.loungePhotoReferences('nobody'), []);
  const prompt = photos.loungePhotoImagePrompt('velvet', 'She leans on a rooftop railing at dusk, phone camera at arm\'s length.');
  assert.match(prompt, /same face, hair and build as in the references/);
  assert.match(prompt, /Fully clothed and tasteful: no nudity, no underwear or sleepwear, no sexual pose/);
  assert.match(prompt, /No text, captions, watermarks or logos/);
  for (const kind of ['chat', 'daily']) assert.match(photos.loungePhotoSceneInstructions(kind), /노출·속옷·잠옷 차림·신체 부위 강조·성적인 자세나 상황은 쓰지 않는다/);
  assert.match(photos.loungePhotoSceneInstructions('chat'), /relationship.stage가 있으면 그 관계의 온도/);
  assert.match(photos.loungePhotoSceneInstructions('daily'), /previous의 장면과 겹치지 않게/);
});

test('a scene from the model is trimmed, actions are taken out of the caption, and an empty scene is refused', () => {
  assert.deepEqual(photos.readLoungePhotoScene({ scene: '  A quiet studio at night, she sketches under a desk lamp.  ', caption: '*웃으며* 아직 안 잤어.' }), { scene: 'A quiet studio at night, she sketches under a desk lamp.', caption: '웃으며 아직 안 잤어.' });
  assert.equal(photos.readLoungePhotoScene({ scene: 'short', caption: '' }), undefined);
  assert.equal(photos.readLoungePhotoScene(null), undefined);
  assert.equal(photos.readLoungePhotoScene({ scene: 'x'.repeat(900), caption: '' }).scene.length, 600);
});

test('a requested photo: scene, image from the references, private storage, and the post comes back', async () => {
  const calls = [];
  let imageForm, uploaded, patched;
  await run(async (url, init = {}) => {
    calls.push(url);
    if (url.includes('/auth/')) return result({ id: userId });
    if (url.includes('claim_lounge_character_photo')) { const args = JSON.parse(init.body); assert.equal(args.p_user, userId); assert.equal(args.p_source, 'request'); assert.equal(args.p_scene, '퇴근길 모습'); return result({ state: 'claimed', id: 'post-1', character: 'velvet', left: 4 }); }
    if (url.includes('voice_lounge_messages?')) return result([{ kind: 'host', text: '오늘은 늦게까지 작업했어.' }, { kind: 'human', text: '사진 보여줘' }]);
    if (url.includes('voice_lounge_relationships?')) return result([]);
    if (url.endsWith('/responses')) { const body = JSON.parse(init.body); assert.match(body.instructions, /사진 한 장의 장면/); assert.equal(JSON.parse(body.input).request, '퇴근길 모습'); return result(sceneOutput({ scene: 'Night street after work, she glances back at the camera under neon light.', caption: '이 시간까지 일했어. 칭찬은 사양할게.' })); }
    if (url.startsWith('https://app.test/lounge/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } });
    if (url.endsWith('/v1/images/edits')) { imageForm = init.body; return result({ data: [{ b64_json: Buffer.from('webp-bytes').toString('base64') }] }); }
    if (url.includes('/storage/v1/object/lounge-character-private/')) { uploaded = url; assert.equal(init.headers.Authorization, 'Bearer private-service'); return result({ Key: 'ok' }); }
    if (url.includes('lounge_character_posts?id=eq.post-1') && init.method === 'PATCH') { patched = JSON.parse(init.body); return result([{ id: 'post-1', ...patched, created_at: '2026-10-21T12:00:00Z', visibility: 'private' }]); }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler(request({ action: 'photo', roomId, source: 'request', request: '퇴근길 모습' }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.post.id, 'post-1'); assert.equal(payload.left, 4);
  });
  assert.equal(imageForm.get('model'), photos.loungePhotoModel);
  assert.equal(imageForm.getAll('image[]').length, photos.loungePhotoReferences('velvet').length, 'every reference photo is sent');
  assert.equal(imageForm.get('output_format'), 'webp');
  assert.match(imageForm.get('prompt'), /Night street after work/);
  assert.equal(uploaded, `https://db.test/storage/v1/object/lounge-character-private/${userId}/post-1.webp`);
  assert.equal(patched.status, 'ready'); assert.equal(patched.caption, '이 시간까지 일했어. 칭찬은 사양할게.');
});

test('a refused image gives the reservation back and says why', async () => {
  let released = false;
  await run(async (url, init = {}) => {
    if (url.includes('/auth/')) return result({ id: userId });
    if (url.includes('claim_lounge_character_photo')) return result({ state: 'claimed', id: 'post-2', character: 'velvet', left: 3 });
    if (url.includes('voice_lounge_messages?') || url.includes('voice_lounge_relationships?')) return result([]);
    if (url.endsWith('/responses')) return result(sceneOutput({ scene: 'A rooftop bar at night, she raises a glass toward the city lights.', caption: '건배.' }));
    if (url.startsWith('https://app.test/lounge/')) return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/webp' } });
    if (url.endsWith('/v1/images/edits')) return result({ error: { code: 'moderation_blocked', message: 'Your request was rejected by the safety system.' } }, 400);
    if (url.includes('lounge_character_posts?id=eq.post-2') && init.method === 'DELETE') { released = true; return new Response(null, { status: 204 }); }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler(request({ action: 'photo', roomId, source: 'request' }));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'lounge_photo_blocked');
  });
  assert.equal(released, true);
});

test('over the daily allowance nothing is generated; the character\'s own photos stop quietly', async () => {
  for (const [state, status] of [['limit', 429], ['character_limit', 200]]) await run(async url => {
    if (url.includes('/auth/')) return result({ id: userId });
    if (url.includes('claim_lounge_character_photo')) return result({ state, daily: 5 });
    throw new Error('Must not spend a model call');
  }, async () => {
    const response = await handler(request({ action: 'photo', roomId, source: state === 'limit' ? 'request' : 'character' }));
    assert.equal(response.status, status);
    const payload = await response.json();
    if (state === 'limit') { assert.equal(payload.code, 'lounge_photo_limit'); assert.match(payload.error, /5장/); } else assert.equal(payload.skipped, true);
  });
});

test('guests cannot receive photos and the daily run needs the cron secret', async () => {
  await run(async url => {
    if (url.includes('/auth/')) return result({ id: userId, is_anonymous: true });
    throw new Error('Unexpected');
  }, async () => {
    assert.equal((await handler(request({ action: 'photo', roomId, source: 'request' }))).status, 403);
    assert.equal((await handler(new Request('https://app.test/api/lounge-images'))).status, 401);
    assert.equal((await handler(new Request('https://app.test/api/lounge-images', { headers: { authorization: 'Bearer wrong' } }))).status, 401);
  });
});
