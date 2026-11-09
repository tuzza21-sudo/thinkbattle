import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
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
    // Every file of the relationship folder, so a character added later is part of the graph without editing this list.
    const relationship = [...['index', 'events', 'types', 'engine', 'persistence', 'memory', 'templates'].map(name => `src/lib/relationship/${name}.ts`), ...readdirSync(resolve(workspace, 'src/lib/relationship/configs')).filter(name => name.endsWith('.ts')).map(name => `src/lib/relationship/configs/${name}`)];
    for (const file of ['api/lounge-images.ts', 'src/lib/lounge.ts', 'src/lib/loungeCharacters.ts', 'src/lib/loungePhotos.ts', 'src/lib/loungeSceneFollow.ts', 'src/lib/loungeCustomCharacters.ts', 'src/lib/loungeScenarios.ts', 'src/lib/loungeStory.ts', 'src/lib/loungeAdmin.ts', 'src/lib/loungePlans.ts', ...relationship]) {
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

test('the place of a scene line is what comes before its first dash or comma', () => {
  assert.equal(photos.loungeScenePlace('식당 — 저녁을 먹는 중'), '식당');
  assert.equal(photos.loungeScenePlace('호텔 객실, 창가에서 와인을 따르는 중'), '호텔 객실');
  assert.equal(photos.loungeScenePlace('주방 - 같이 요리'), '주방');
  assert.equal(photos.loungeScenePlace('카페'), '카페');
  assert.equal(photos.loungeScenePlace('식당  —  저녁'), photos.loungeScenePlace('식당 — 점심'), 'what they do there does not change the place');
});

test('a background that follows the place (automatic): a place that fits is saved, a member\'s own choice and a background that already fits are left, and nothing is made', async () => {
  const ask = async ({ background = null, choice, shared = [], env = {} }) => {
    const calls = { patched: null, images: 0, matched: 0 };
    Object.assign(process.env, env);
    try {
      await run(async (url, init) => {
        if (url.includes('/auth/v1/user')) return result({ id: userId });
        if (url.includes('voice_lounge_rooms?id=eq.') && (init?.method ?? 'GET') === 'GET') return result([{ scenario: null, story_state: null, memory: '지금 장면: 호텔 객실 — 와인을 따르는 중', background }]);
        if (url.includes('voice_lounge_rooms?id=eq.') && init?.method === 'PATCH') { calls.patched = JSON.parse(init.body).background; return result([]); }
        if (url.includes('lounge_scene_backgrounds?select=')) return result(shared);
        if (url.endsWith('/responses')) { calls.matched++; return result(sceneOutput({ choice, place: choice === 'new' ? '밤의 호텔 객실, 창가의 낮은 조명' : '' })); }
        if (url.includes('/images/generations') || url.includes('/storage/')) { calls.images++; return result({}); }
        throw new Error('Unexpected call ' + url);
      }, async () => { calls.response = await (await handler(request({ action: 'scene', roomId, auto: true }))).json(); });
    } finally { for (const key of Object.keys(env)) delete process.env[key]; }
    return calls;
  };
  const sharedRoom = { id: '11111111-1111-4111-8111-111111111111', scene_key: null, description: '밤의 호텔 객실, 창가의 낮은 조명', image_path: 'scenes/room.webp' };
  const fits = await ask({ choice: sharedRoom.id, shared: [sharedRoom] });
  const { follow: fitsNote, ...fitsSaved } = fits.patched;
  assert.deepEqual(fitsSaved, { scene: sharedRoom.id, image: 'scenes/room.webp', prompt: sharedRoom.description, auto: true }, 'the shared scene for a hotel room is used');
  assert.equal(fitsNote.place, '호텔 객실', 'and what it was decided for is kept (the stated place of the summary line)');
  assert.equal(fits.response.background.scene, sharedRoom.id);
  const theme = await ask({ choice: 'cafe' });
  const { follow: themeNote, ...themeSaved } = theme.patched;
  assert.deepEqual(themeSaved, { theme: 'cafe', auto: true }, 'one of the places'); assert.ok(themeNote.key);
  const same = await ask({ choice: 'cafe', background: { theme: 'cafe', auto: true } });
  assert.equal(same.response.background, null, 'a background that already fits is not changed');
  assert.deepEqual({ theme: same.patched.theme, auto: same.patched.auto, hasFollow: Boolean(same.patched.follow) }, { theme: 'cafe', auto: true, hasFollow: true }, 'only what it was decided for is kept, so it is not asked again');
  const chosen = await ask({ choice: 'cafe', background: { theme: 'river' } });
  assert.equal(chosen.matched, 0, 'a background the member chose is left alone (no model call)'); assert.equal(chosen.patched, null);
  const none = await ask({ choice: 'new' });
  assert.deepEqual(Object.keys(none.patched).sort(), ['auto', 'follow'], 'no place fits: the background stays as it is, not the empty space (only the decision is kept)'); assert.equal(none.images, 0, 'and nothing is made'); assert.equal(none.response.background, null);
  const off = await ask({ choice: 'cafe', env: { LOUNGE_AUTO_SCENE: 'off' } });
  assert.equal(off.matched, 0); assert.equal(off.patched, null);
});

test('the background follows the v4 engine\'s scene: the start, an explicit move at once, otherwise not often', async () => {
  const minute = 60_000;
  const ask = async ({ scene, sceneTurns = 5, change, follow, background = { auto: true }, choice = 'livingroom' }) => {
    const calls = { patched: null, matched: 0 };
    const state = { room_id: roomId, scene, scene_turns: sceneTurns, ...(change ? { scene_change: change } : {}) };
    await run(async (url, init) => {
      if (url.includes('/auth/v1/user')) return result({ id: userId });
      if (url.includes('voice_lounge_rooms?id=eq.') && (init?.method ?? 'GET') === 'GET') return result([{ scenario: null, story_state: null, memory: '', host_persona: 'guide', background: { ...background, ...(follow ? { follow } : {}) } }]);
      if (url.includes('voice_lounge_rooms?id=eq.') && init?.method === 'PATCH') { calls.patched = JSON.parse(init.body).background; return result([]); }
      if (url.includes('voice_lounge_companion_state')) return result([{ state }]);
      if (url.includes('lounge_scene_backgrounds?select=')) return result([]);
      if (url.endsWith('/responses')) { calls.matched++; return result(sceneOutput({ choice, place: '' })); }
      throw new Error('Unexpected call ' + url);
    }, async () => { calls.response = await (await handler(request({ action: 'scene', roomId, auto: true }))).json(); });
    return calls;
  };
  const living = { location: '집 거실', scene_type: '집', activity: '소파에서 이야기하는 중', time_of_day: '밤', season: '', objects: [] };
  const key = (type, place) => `${type}|${place.replace(/\s/g, '')}`;
  // the start: nothing decided yet, a stated place -> applied
  const start = await ask({ scene: living });
  assert.equal(start.matched, 1); assert.equal(start.patched.theme, 'livingroom'); assert.equal(start.patched.follow.place, '집 거실');
  // the same place again (every later reply asks): no model call, nothing written
  const same = await ask({ scene: living, background: { theme: 'livingroom', auto: true }, follow: { key: key('집', '집 거실'), at: Date.now() - 60 * minute, place: '집 거실' } });
  assert.equal(same.matched, 0); assert.equal(same.patched, null); assert.equal(same.response.background, null);
  const was = { key: key('식당', '식당'), at: Date.now() - 2 * minute, place: '식당' };
  // an explicit move, two minutes after the last change: at once
  const explicit = await ask({ scene: living, sceneTurns: 0, change: { turn: 8, at: Date.now() - 30_000, explicit: true }, follow: was, background: { theme: 'restaurant', auto: true } });
  assert.equal(explicit.matched, 1); assert.equal(explicit.patched.theme, 'livingroom');
  // a drift nobody asked for, two minutes after the last change: not
  const drift = await ask({ scene: living, sceneTurns: 5, change: { turn: 8, at: Date.now() - 30_000, explicit: false }, follow: was, background: { theme: 'restaurant', auto: true } });
  assert.equal(drift.matched, 0); assert.equal(drift.patched, null);
  // a settled change after a long while: yes
  const settled = await ask({ scene: living, sceneTurns: 6, follow: { ...was, at: Date.now() - 45 * minute }, background: { theme: 'restaurant', auto: true } });
  assert.equal(settled.matched, 1); assert.equal(settled.patched.theme, 'livingroom');
  // a place the engine does not know ("where each is"): nothing to follow
  const vague = await ask({ scene: { ...living, location: '각자 있는 곳에서 전화 통화', scene_type: '기타' } });
  assert.equal(vague.matched, 0); assert.equal(vague.patched, null);
  // a background the member chose is never touched
  const chosen = await ask({ scene: living, background: { theme: 'river' } });
  assert.equal(chosen.matched, 0); assert.equal(chosen.patched, null);
});

test('a photo the character sends first (source character) is for Plus, Pro and the admin; a photo the member asked for is for everyone', async () => {
  const ask = async ({ source, plan = null, email }) => {
    const calls = { claimed: 0 };
    await run(async (url, init) => {
      if (url.includes('/auth/v1/user')) return result({ id: userId, ...(email ? { email } : {}) });
      if (url.includes('lounge_active_plan')) return result(plan);
      if (url.includes('claim_lounge_character_photo')) { calls.claimed++; return result({ state: 'character_limit' }); }
      throw new Error('Unexpected call ' + url);
    }, async () => { const response = await handler(request({ action: 'photo', roomId, source })); calls.status = response.status; calls.body = await response.json(); });
    return calls;
  };
  const free = await ask({ source: 'character' });
  assert.deepEqual([free.claimed, free.body], [0, { skipped: true }], 'no plan: dropped quietly, before anything is claimed');
  assert.equal((await ask({ source: 'character', plan: 'plus' })).claimed, 1, 'Plus');
  assert.equal((await ask({ source: 'character', plan: 'pro' })).claimed, 1, 'Pro');
  assert.equal((await ask({ source: 'character', email: 'Piorne@Naver.com' })).claimed, 1, 'the super admin');
  assert.equal((await ask({ source: 'request' })).claimed, 1, 'one the member asked for: for everyone');
});

test('photos are counted by the month by plan: Plus 10, Pro 30, no plan 3, the admin none; a used-up month stops a request with a message and drops one sent first', async () => {
  const ask = async ({ source = 'request', plan = null, email, planDown = false, state = 'character_limit' }) => {
    const calls = { monthly: 'unset' };
    await run(async (url, init) => {
      if (url.includes('/auth/v1/user')) return result({ id: userId, ...(email ? { email } : {}) });
      if (url.includes('lounge_active_plan')) return planDown ? { ok: false, status: 500, json: async () => ({}) } : result(plan);
      if (url.includes('claim_lounge_character_photo')) { calls.monthly = JSON.parse(init.body).p_monthly; return result({ state, monthly: calls.monthly }); }
      throw new Error('Unexpected call ' + url);
    }, async () => { const response = await handler(request({ action: 'photo', roomId, source })); calls.status = response.status; calls.body = await response.json(); });
    return calls;
  };
  assert.equal((await ask({})).monthly, 3, 'no plan');
  assert.equal((await ask({ plan: 'plus' })).monthly, 10, 'Plus');
  assert.equal((await ask({ plan: 'pro' })).monthly, 30, 'Pro');
  assert.equal((await ask({ email: 'piorne@naver.com' })).monthly, null, 'the super admin has no monthly limit');
  assert.equal((await ask({ planDown: true })).monthly, 10, 'a plan that cannot be read counts as Plus for a request');
  const stopped = await ask({ plan: 'plus', state: 'month_limit' });
  assert.equal(stopped.status, 429); assert.equal(stopped.body.code, 'lounge_photo_month_limit'); assert.match(stopped.body.error, /이번 달 받을 수 있는 사진 10장/);
  assert.deepEqual((await ask({ source: 'character', plan: 'plus', state: 'month_limit' })).body, { skipped: true }, 'one sent first is dropped quietly');
});
