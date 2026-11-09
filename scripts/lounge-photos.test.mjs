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

test('the member can turn the automatic follow of the scene off for a chat, and on again', async () => {
  const act = async ({ enabled, background, auto }) => {
    const calls = { patched: undefined, matched: 0, state: 0 };
    await run(async (url, init) => {
      if (url.includes('/auth/v1/user')) return result({ id: userId });
      if (url.includes('voice_lounge_rooms?id=eq.') && (init?.method ?? 'GET') === 'GET') return result([{ scenario: null, story_state: null, memory: '지금 장면: 호텔 객실 — 와인을 따르는 중', host_persona: 'guide', background }]);
      if (url.includes('voice_lounge_rooms?id=eq.') && init?.method === 'PATCH') { calls.patched = JSON.parse(init.body).background; return result([]); }
      if (url.includes('voice_lounge_companion_state')) { calls.state++; return result([]); }
      if (url.endsWith('/responses')) { calls.matched++; return result(sceneOutput({ choice: 'cafe', place: '' })); }
      throw new Error('Unexpected call ' + url);
    }, async () => { const response = await handler(request(auto ? { action: 'scene', roomId, auto: true } : { action: 'scene_auto', roomId, enabled })); calls.status = response.status; calls.response = await response.json(); });
    return calls;
  };
  // off on an automatic background: the picture stays, the switch is kept
  const off = await act({ enabled: false, background: { theme: 'cafe', auto: true, follow: { key: 'a', at: 1, place: 'x' } } });
  assert.equal(off.status, 200); assert.equal(off.patched.theme, 'cafe'); assert.equal(off.patched.auto_off, true); assert.equal(off.patched.auto, true);
  // off with no background yet: only the switch is kept
  const offBare = await act({ enabled: false, background: null });
  assert.deepEqual(offBare.patched, { auto: true, auto_off: true });
  // off on a background the member chose: it stays theirs, with the switch
  const offManual = await act({ enabled: false, background: { theme: 'river' } });
  assert.deepEqual(offManual.patched, { theme: 'river', auto_off: true });
  // while it is off, an automatic ask changes nothing and calls no model
  const asked = await act({ auto: true, background: { theme: 'cafe', auto: true, auto_off: true } });
  assert.equal(asked.matched, 0); assert.equal(asked.patched, undefined); assert.equal(asked.response.background, null);
  // on again: the picture stays, the switch and what was decided are forgotten
  const on = await act({ enabled: true, background: { theme: 'cafe', auto: true, auto_off: true, follow: { key: 'a', at: 1, place: 'x' } } });
  assert.deepEqual(on.patched, { theme: 'cafe', auto: true });
  // on over a background the member chose: it becomes an automatic one
  const onManual = await act({ enabled: true, background: { theme: 'river' } });
  assert.deepEqual(onManual.patched, { theme: 'river', auto: true });
  // on with only the switch kept: nothing is left, the follow starts from scratch
  const onBare = await act({ enabled: true, background: { auto: true, auto_off: true } });
  assert.equal(onBare.patched, null);
  // a one-off "fit it to the scene" while it is off keeps it off
  const oneOff = await ask1();
  assert.equal(oneOff.auto_off, true);
  async function ask1() {
    let saved;
    await run(async (url, init) => {
      if (url.includes('/auth/v1/user')) return result({ id: userId });
      if (url.includes('voice_lounge_rooms?id=eq.') && (init?.method ?? 'GET') === 'GET') return result([{ scenario: null, story_state: null, memory: '지금 장면: 호텔 객실 — 와인을 따르는 중', background: { theme: 'river', auto: true, auto_off: true } }]);
      if (url.includes('voice_lounge_rooms?id=eq.') && init?.method === 'PATCH') { saved = JSON.parse(init.body).background; return result([]); }
      if (url.includes('lounge_scene_backgrounds?select=')) return result([]);
      if (url.endsWith('/responses')) return result(sceneOutput({ choice: 'cafe', place: '' }));
      throw new Error('Unexpected call ' + url);
    }, async () => { await handler(request({ action: 'scene', roomId })); });
    return saved;
  }
});

test('the library of backgrounds: reuse first, make only while it is small, name what is made, never blank the room', async () => {
  const minute = 60_000;
  const living = { location: '집 거실', scene_type: '집', activity: '소파에서 이야기하는 중', time_of_day: '밤', season: '', objects: [] };
  const ask = async ({ choice = 'new', total = 10, today = 0, memberToday = 0, imageStatus = 200, library = [], env = {}, name = '비 오는 밤 자동차 안', slug = 'Car Interior, Night Rain!', tags = ['자동차', '밤', '비', '실내', '#이동'] }) => {
    const calls = { patched: [], images: 0, uploaded: [], inserted: null, bumped: [], matchedPlaces: null };
    Object.assign(process.env, env);
    try {
      await run(async (url, init) => {
        if (url.includes('/auth/v1/user')) return result({ id: userId });
        if (url.includes('voice_lounge_rooms?id=eq.') && (init?.method ?? 'GET') === 'GET') return result([{ scenario: null, story_state: null, memory: '', host_persona: 'guide', background: { auto: true } }]);
        if (url.includes('voice_lounge_rooms?id=eq.') && init?.method === 'PATCH') { calls.patched.push(JSON.parse(init.body).background); return result([]); }
        if (url.includes('voice_lounge_companion_state')) return result([{ state: { room_id: roomId, scene: living, scene_turns: 5 } }]);
        if (url.includes('rpc/bump_lounge_scene_use')) { calls.bumped.push(JSON.parse(init.body).p_id); return result(null); }
        if (url.includes('lounge_scene_backgrounds?') && url.includes('created_by=eq.')) return result(Array.from({ length: memberToday }, (_, i) => ({ id: String(i) })));
        if (url.includes('lounge_scene_backgrounds?') && init?.headers?.Range) { const n = url.includes('created_at=gte') ? today : total; return new Response('[]', { status: 200, headers: { 'content-range': `0-0/${n}` } }); }
        if (url.includes('lounge_scene_backgrounds?on_conflict') && init?.method === 'POST') { calls.inserted = JSON.parse(init.body); return result([{ id: '22222222-2222-4222-8222-222222222222', scene_key: calls.inserted.scene_key, description: calls.inserted.description, image_path: calls.inserted.image_path, name: calls.inserted.name, tags: calls.inserted.tags }], 201); }
        if (url.includes('lounge_scene_backgrounds?')) return result(library);
        if (url.endsWith('/responses')) { const input = JSON.parse(init.body).input; calls.matchedPlaces = JSON.parse(input).places; return result(sceneOutput({ choice, place: '비 내린 밤, 가로등 불빛이 번지는 자동차 안', name, slug, tags })); }
        if (url.includes('/images/generations')) { calls.images++; return imageStatus === 200 ? result({ data: [{ b64_json: 'AAAA' }] }) : result({ error: { code: 'server_error' } }, imageStatus); }
        if (url.includes('/storage/v1/object/')) { calls.uploaded.push(url); return result({}); }
        throw new Error('Unexpected call ' + url);
      }, async () => { calls.response = await (await handler(request({ action: 'scene', roomId, auto: true }))).json(); });
    } finally { for (const key of Object.keys(env)) delete process.env[key]; }
    return calls;
  };
  // while the library is small a scene nothing fits is made, named, saved under a descriptive file name and used
  const made = await ask({});
  assert.equal(made.images, 1);
  assert.match(made.inserted.image_path, /^scenes\/car-interior-night-rain-[a-z0-9]{1,8}\.webp$/, 'a descriptive, ASCII file name');
  assert.equal(made.inserted.name, '비 오는 밤 자동차 안'); assert.deepEqual(made.inserted.tags, ['자동차', '밤', '비', '실내', '이동']);
  assert.match(made.inserted.scene_key, /^auto:/); assert.equal(made.response.background.scene, '22222222-2222-4222-8222-222222222222');
  assert.ok(made.patched.some(value => value.follow), 'the decision is kept before the picture is made, so a second ask does not make another');
  // the library is full: only what there is is used, and nothing is made
  const full = await ask({ total: 60 });
  assert.equal(full.images, 0); assert.equal(full.response.background, null);
  // a limit for everyone together
  const cap = await ask({ today: 20 });
  assert.equal(cap.images, 0);
  // the member's own limit
  const memberCap = await ask({ memberToday: 6 });
  assert.equal(memberCap.images, 0); assert.ok(!memberCap.patched.some(value => value.blank), 'the room is never blanked by an automatic ask');
  // a failure to make it leaves the background as it is
  const failed = await ask({ imageStatus: 500 });
  assert.equal(failed.response.background, null); assert.ok(!failed.patched.some(value => value.blank));
  // the limits can be set
  const wider = await ask({ total: 60, env: { LOUNGE_SCENE_LIBRARY_TARGET: '100' } });
  assert.equal(wider.images, 1);
  // a scene of the library that fits is used, and counted as one more use
  const row = { id: '33333333-3333-4333-8333-333333333333', scene_key: null, description: '밤, 비 내린 도시의 자동차 안', image_path: 'scenes/car-interior-night-rain-ab12cd34.webp', name: '비 오는 밤 자동차 안', tags: ['자동차', '밤'], uses: 3 };
  const reused = await ask({ choice: row.id, library: [row] });
  assert.equal(reused.images, 0); assert.deepEqual(reused.bumped, [row.id]);
  assert.match(reused.patched.at(-1).prompt, /^비 오는 밤 자동차 안 — /);
  assert.ok(reused.matchedPlaces.some(place => place.id === row.id && place.description.startsWith('비 오는 밤 자동차 안 · 자동차, 밤 · ')), 'the model reads name, tags, then the description');
});

test('the library is narrowed by what a background shares with the scene, and what is made is named safely', async () => {
  const photos = loadTs(fileURLToPath(new URL('../src/lib/loungePhotos.ts', import.meta.url)));
  const row = (id, name, tags, description, uses = 0) => ({ id, name, tags, description, image_path: `scenes/${id}.webp`, uses });
  const rows = [
    row('a', '노을 지는 주방', ['주방', '저녁', '실내'], '해 질 녘 창으로 노을이 들어오는 아늑한 주방'),
    row('b', '비 오는 밤 자동차 안', ['자동차', '밤', '비'], '비 내린 밤의 자동차 안', 1),
    row('c', '호텔 연회장', ['호텔', '연회장'], '화려한 조명의 호텔 그랜드볼룸', 9),
    row('d', '낮의 공원', ['공원', '실외', '낮'], '햇살이 드는 공원 벤치'),
  ];
  assert.equal(photos.shortlistSceneBackgrounds(rows, '자동차 안, 비 내리는 밤', 2)[0].id, 'b', 'the tags and name count most');
  assert.equal(photos.shortlistSceneBackgrounds(rows, '아무 관련 없는 말', 4)[0].id, 'c', 'with nothing shared, the most used come first');
  assert.equal(photos.shortlistSceneBackgrounds(rows, '주방', 1).length, 1);
  assert.equal(photos.cleanSceneSlug('Car Interior, Night Rain!'), 'car-interior-night-rain');
  assert.equal(photos.cleanSceneSlug('한글만'), 'place');
  assert.equal(photos.cleanSceneSlug('../../etc/passwd'), 'etc-passwd');
  assert.ok(photos.cleanSceneSlug('a'.repeat(200)).length <= 48);
  assert.match(photos.loungeSceneImagePath('Rooftop Bar', 'a1b2c3d4-e5f6', 'webp'), /^scenes\/rooftop-bar-a1b2c3d4\.webp$/);
  assert.deepEqual(photos.cleanSceneTags(['자동차', '자동차', '#밤', '', 5, '아주아주아주아주아주아주긴태그입니다']).slice(0, 2), ['자동차', '밤']);
  assert.equal(photos.cleanSceneTags(Array.from({ length: 20 }, (_, i) => `태그${i}`)).length, 8);
  assert.equal(photos.cleanSceneName('  ', '비 내린 밤의 자동차 안, 가로등이 번진다'), '비 내린 밤의 자동차 안, 가로등이 번진다'.slice(0, 24).trim());
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
