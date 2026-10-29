import { isLoungeCustomCharacterId } from '../src/lib/lounge.js';
import { loungeCustomPortraitUrl, registerLoungeCustomCharacterRow, type LoungeCustomCharacterRow } from '../src/lib/loungeCustomCharacters.js';
import { getLoungeCharacter, loungeCharacters, loungePersonaPrompt } from '../src/lib/loungeCharacters.js';
import { isLoungeImageModel, type LoungeImageModel, loungeBackgroundDaily, loungeBackgroundImagePrompt, loungeBackgroundSize, loungePhotoBuckets, loungePhotoImagePrompt, loungePhotoModel, loungePhotoNow, loungePhotoReferences, loungePhotoSceneInstructions, loungePhotoSceneSchema, loungePhotoSize, readLoungePhotoScene } from '../src/lib/loungePhotos.js';
import { applyDecay, getRelationshipConfig, relationshipFromRow, speechLevel, type RelationshipRow } from '../src/lib/relationship/index.js';

/**
 * Character photos (a Node function: a photo takes 20 to 60 seconds).
 * POST {action:'photo', roomId, source:'request'|'character', request?}: a photo for the member in their one-to-one room,
 *   within the daily allowance. The scene and the character's caption are written first, then the image is made from
 *   the character's reference photos and stored privately under the member's folder.
 * GET (Vercel cron, with CRON_SECRET): one public post from each character's day, at most once a day.
 */
type NodeRequest = { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type NodeResponse = { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: Uint8Array | string) => void };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const timed = (url: string, init: RequestInit, timeout = 20_000) => fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });

class LoungePhotoError extends Error {
  status: number; code: string;
  constructor(message: string, status: number, code: string) { super(message); this.status = status; this.code = code; }
}
const claimRefusals: Record<string, [string, number, string]> = {
  denied: ['내 1:1 대화에서만 사진을 받을 수 있어요.', 403, 'lounge_photo_denied'],
  disabled: ['지금은 사진 기능을 잠시 쉬고 있어요.', 503, 'lounge_photo_disabled'],
  busy: ['사진을 하나 준비하고 있어요. 조금만 기다려 주세요.', 409, 'lounge_photo_busy'],
};

type Context = { base: string; service: string; key: string; origin: string };
const serviceHeaders = (context: Context, extra: Record<string, string> = {}) => ({ apikey: context.service, Authorization: `Bearer ${context.service}`, ...extra });

/** The scene and caption, written by the character. */
async function writeScene(context: Context, characterId: string, kind: 'chat' | 'daily', input: Record<string, unknown>) {
  const character = getLoungeCharacter(characterId);
  if (!character) throw new LoungePhotoError('사진을 보낼 인물을 찾지 못했어요.', 400, 'lounge_photo_character');
  const response = await timed('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${context.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
    model: 'gpt-6-luna', reasoning: { effort: 'low' }, max_output_tokens: 700, store: false,
    instructions: `${loungePersonaPrompt(character)}\n${loungePhotoSceneInstructions(kind)}`,
    input: JSON.stringify(input),
    text: { format: { type: 'json_schema', name: 'lounge_photo_scene', strict: true, schema: loungePhotoSceneSchema } },
  }) }, 30_000);
  if (!response.ok) throw new LoungePhotoError('사진 장면을 정하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_scene_failed');
  const result = await response.json() as { output?: Array<{ content?: Array<{ type: string; text?: string }> }> };
  const text = (result.output ?? []).flatMap(item => item.content ?? []).filter(part => part.type === 'output_text').map(part => part.text ?? '').join('');
  let scene;
  try { scene = readLoungePhotoScene(JSON.parse(text)); } catch { scene = undefined; }
  if (!scene) throw new LoungePhotoError('사진 장면을 정하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_scene_invalid');
  return scene;
}

/** A made image: its bytes and type (GPT gives webp, FLUX jpeg). */
type MadeImage = { bytes: Uint8Array<ArrayBuffer>; type: string; ext: string };
const webp = (bytes: Uint8Array<ArrayBuffer>): MadeImage => ({ bytes, type: 'image/webp', ext: 'webp' });
const gptQuality = (model: LoungeImageModel) => model === 'gpt-low' ? 'low' : process.env.LOUNGE_IMAGE_QUALITY || 'medium';
const bytesToBase64 = (bytes: Uint8Array) => { let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); };

/**
 * An image from FLUX.2 on Black Forest Labs' API: the request is queued, its polling address is asked until the image is
 * ready, and the image (a signed address valid for ten minutes) is downloaded at once. References go as base64, so BFL
 * never has to reach our site (nor a member's character's storage).
 */
async function fluxImage(model: 'flux-klein' | 'flux-pro', prompt: string, size: string, references: Uint8Array[] = []): Promise<MadeImage> {
  const key = process.env.BFL_API_KEY;
  if (!key) throw new LoungePhotoError('FLUX 모델을 쓰려면 서버에 BFL_API_KEY를 설정해야 해요. 다른 모델을 골라 주세요.', 503, 'lounge_photo_flux_not_configured');
  const [width, height] = size.split('x').map(Number);
  const inputs = Object.fromEntries(references.slice(0, 4).map((bytes, index) => [index ? 'input_image_' + (index + 1) : 'input_image', bytesToBase64(bytes)]));
  const endpoint = model === 'flux-klein' ? 'flux-2-klein-4b' : 'flux-2-pro';
  const queued = await timed('https://api.bfl.ai/v1/' + endpoint, { method: 'POST', headers: { 'x-key': key, accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, width, height, output_format: 'jpeg', ...inputs }) }, 30_000);
  const task = await queued.json().catch(() => null) as { id?: string; polling_url?: string; detail?: unknown } | null;
  if (!queued.ok || !task?.polling_url) {
    console.warn('[Lounge photo] flux refused', JSON.stringify({ model: endpoint, status: queued.status, detail: JSON.stringify(task?.detail ?? null).slice(0, 160) }));
    if (queued.status === 429) throw new LoungePhotoError('사진 요청이 잠시 몰렸어요. 조금 뒤 다시 부탁해 주세요.', 429, 'lounge_photo_rate_limit');
    if (queued.status === 402) throw new LoungePhotoError('FLUX 크레딧이 모자라요. BFL 계정을 확인하거나 다른 모델을 골라 주세요.', 503, 'lounge_photo_flux_credits');
    throw new LoungePhotoError('사진을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_failed');
  }
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const polled = await timed(task.polling_url, { headers: { 'x-key': key, accept: 'application/json' } }).catch(() => null);
    const state = await polled?.json().catch(() => null) as { status?: string; result?: { sample?: string } } | null;
    if (!state?.status || state.status === 'Pending') continue;
    if (state.status === 'Ready' && state.result?.sample) {
      const image = await timed(state.result.sample, {}, 30_000);
      if (!image.ok) break;
      const type = image.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
      return { bytes: new Uint8Array(await image.arrayBuffer()), type, ext: type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg' };
    }
    if (/moderat/i.test(state.status)) throw new LoungePhotoError('이 장면은 사진으로 만들 수 없어요. 다른 장면으로 부탁해 주세요.', 422, 'lounge_photo_blocked');
    console.warn('[Lounge photo] flux failed', JSON.stringify({ model: endpoint, status: state.status }));
    break;
  }
  throw new LoungePhotoError('사진을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_failed');
}

/** The image, made from the character's reference photos by the chosen model. */
async function makeImage(context: Context, characterId: string, scene: string, model: LoungeImageModel = 'gpt'): Promise<MadeImage> {
  const prompt = loungePhotoImagePrompt(characterId, scene);
  const references: Array<{ bytes: Uint8Array<ArrayBuffer>; type: string }> = [];
  for (const path of loungePhotoReferences(characterId)) {
    // House characters' photos are site files; a member's character's portrait is a full storage address.
    const reference = await timed(/^https?:\/\//.test(path) ? path : context.origin + path, {}).catch(() => null);
    if (!reference?.ok) continue;
    references.push({ bytes: new Uint8Array(await reference.arrayBuffer()), type: reference.headers.get('content-type')?.split(';')[0] || 'image/webp' });
  }
  // Without a reference the face would be a stranger's, so no photo is better than a wrong one.
  if (!references.length) throw new LoungePhotoError('인물 사진을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_reference');
  if (model === 'flux-klein' || model === 'flux-pro') return fluxImage(model, prompt, loungePhotoSize, references.map(item => item.bytes));
  const form = new FormData();
  form.append('model', process.env.LOUNGE_IMAGE_MODEL || loungePhotoModel);
  form.append('prompt', prompt);
  references.forEach((item, index) => form.append('image[]', new Blob([item.bytes], { type: item.type }), 'reference-' + index + '.webp'));
  form.append('size', loungePhotoSize);
  form.append('quality', gptQuality(model));
  form.append('output_format', 'webp');
  form.append('output_compression', '82');
  const response = await timed('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${context.key}` }, body: form }, 150_000);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    console.warn('[Lounge photo] image failed', JSON.stringify({ status: response.status, code: payload?.error?.code }));
    if (payload?.error?.code === 'moderation_blocked' || /safety|moderation/i.test(payload?.error?.message ?? '')) throw new LoungePhotoError('이 장면은 사진으로 만들 수 없어요. 다른 장면으로 부탁해 주세요.', 422, 'lounge_photo_blocked');
    if (response.status === 429) throw new LoungePhotoError('사진 요청이 잠시 몰렸어요. 조금 뒤 다시 부탁해 주세요.', 429, 'lounge_photo_rate_limit');
    throw new LoungePhotoError('사진을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_failed');
  }
  const b64 = ((await response.json()) as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
  if (!b64) throw new LoungePhotoError('사진을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_empty');
  return webp(Uint8Array.from(atob(b64), character => character.charCodeAt(0)));
}

async function upload(context: Context, bucket: string, path: string, bytes: Uint8Array<ArrayBuffer>, type = 'image/webp') {
  const response = await timed(`${context.base}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: serviceHeaders(context, { 'Content-Type': type, 'x-upsert': 'true' }), body: new Blob([bytes], { type }) }, 30_000);
  if (!response.ok) throw new LoungePhotoError('사진을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_storage');
}

/** A photo for a member in their own one-to-one conversation. */
async function memberPhoto(context: Context, authorization: string, anon: string, userId: string, roomId: string, source: 'request' | 'character', request: string, model: LoungeImageModel) {
  const rpc = async <T,>(name: string, args: Record<string, unknown>) => {
    const response = await timed(`${context.base}/rest/v1/rpc/${name}`, { method: 'POST', headers: serviceHeaders(context, { 'Content-Type': 'application/json' }), body: JSON.stringify(args) });
    if (!response.ok) throw new LoungePhotoError('사진 요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_rpc');
    return await response.json() as T;
  };
  const claim = await rpc<{ state: string; id?: string; character?: string; left?: number; daily?: number }>('claim_lounge_character_photo', { p_user: userId, p_room: roomId, p_source: source, p_scene: request });
  if (claim.state === 'character_limit') return json({ skipped: true });
  if (claim.state === 'limit') return json({ error: `오늘 받을 수 있는 사진 ${claim.daily ?? 0}장을 모두 받았어요. 내일 다시 부탁해 주세요.`, code: 'lounge_photo_limit', retryable: false }, 429);
  if (claim.state !== 'claimed' || !claim.id || !claim.character) {
    const [message, status, code] = claimRefusals[claim.state] ?? claimRefusals.denied;
    return json({ error: message, code, retryable: claim.state === 'busy' }, status);
  }
  const postId = claim.id, characterId = claim.character;
  try {
    // A member's character: photos only from a portrait the AI made, never from an uploaded image.
    if (isLoungeCustomCharacterId(characterId)) {
      const response = await timed(`${context.base}/rest/v1/lounge_custom_characters?id=eq.${characterId}&select=*`, { headers: serviceHeaders(context) });
      const [row] = response.ok ? await response.json() as LoungeCustomCharacterRow[] : [];
      if (!row || row.portrait_source !== 'ai') throw new LoungePhotoError('이 캐릭터는 AI로 만든 대표 사진이 있어야 사진을 보낼 수 있어요.', 409, 'lounge_photo_no_ai_portrait');
      registerLoungeCustomCharacterRow(row, loungeCustomPortraitUrl(context.base, row.portrait_path));
    }
    const userHeaders = { apikey: anon, Authorization: authorization };
    const [messagesResponse, relationshipResponse] = await Promise.all([
      timed(`${context.base}/rest/v1/voice_lounge_messages?room_id=eq.${encodeURIComponent(roomId)}&order=id.desc&limit=12&select=kind,text`, { headers: userHeaders }),
      timed(`${context.base}/rest/v1/voice_lounge_relationships?user_id=eq.${encodeURIComponent(userId)}&character_id=eq.${encodeURIComponent(characterId)}&select=*`, { headers: serviceHeaders(context) }).catch(() => null),
    ]);
    const recent = messagesResponse.ok ? (await messagesResponse.json() as Array<{ kind: string; text: string }>).reverse().map(message => ({ speaker: message.kind === 'host' ? '나' : '상대', text: message.text.slice(0, 300) })) : [];
    const config = getRelationshipConfig(characterId);
    const rows = relationshipResponse?.ok ? await relationshipResponse.json() as RelationshipRow[] : [];
    const record = config ? applyDecay(relationshipFromRow(config, rows[0]), config, new Date()) : undefined;
    const stage = config && record ? config.stages.find(item => item.id === record.stage) ?? config.stages[0] : undefined;
    const scene = await writeScene(context, characterId, 'chat', {
      now: loungePhotoNow(), request: request || '지금 무엇을 하고 있는지 보여 주는 사진', recent,
      ...(config && stage ? { relationship: { stage: stage.label, hint: stage.hint, speech_level: speechLevel(config, stage.id) } } : {}),
    });
    const image = await makeImage(context, characterId, scene.scene, model);
    const path = `${userId}/${postId}.${image.ext}`;
    await upload(context, loungePhotoBuckets.private, path, image.bytes, image.type);
    const ready = { status: 'ready', image_path: path, scene: scene.scene, caption: scene.caption };
    const patch = (fields: Record<string, unknown>) => timed(`${context.base}/rest/v1/lounge_character_posts?id=eq.${postId}`, { method: 'PATCH', headers: serviceHeaders(context, { 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify(fields) });
    // Before migration 20261128 there is no image_model column; the photo is saved without it.
    let saved = await patch({ ...ready, image_model: model });
    if (!saved.ok) saved = await patch(ready);
    if (!saved.ok) throw new LoungePhotoError('사진을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_save');
    const [post] = await saved.json() as unknown[];
    console.info('[Lounge photo]', JSON.stringify({ character: characterId, source, model, left: claim.left }));
    return json({ post, left: claim.left });
  } catch (error) {
    // A failed photo is given back: the reservation goes, so it does not count.
    await timed(`${context.base}/rest/v1/lounge_character_posts?id=eq.${postId}&status=eq.pending`, { method: 'DELETE', headers: serviceHeaders(context) }).catch(() => {});
    throw error;
  }
}

/**
 * A background for the member's own one-to-one conversation, made from their description. A few a day; each is kept
 * under the member's folder and saved on the room (rooms.background), which the conversation then shows.
 */
async function memberBackground(context: Context, userId: string, roomId: string, request: string, model: LoungeImageModel) {
  if (request.length < 4) return json({ error: '어떤 곳인지 조금만 더 적어 주세요.', code: 'lounge_background_short', retryable: false }, 400);
  const rooms = await timed(`${context.base}/rest/v1/voice_lounge_rooms?id=eq.${encodeURIComponent(roomId)}&host_id=eq.${userId}&capacity=eq.1&space_id=is.null&select=id`, { headers: serviceHeaders(context) });
  if (!rooms.ok || !(await rooms.json() as unknown[]).length) return json({ error: '내 1:1 대화에서만 배경을 바꿀 수 있어요.', code: 'lounge_background_denied', retryable: false }, 403);
  const folder = `${userId}/backgrounds`;
  const listed = await timed(`${context.base}/storage/v1/object/list/${loungePhotoBuckets.private}`, { method: 'POST', headers: serviceHeaders(context, { 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix: folder, limit: 100, sortBy: { column: 'created_at', order: 'desc' } }) });
  const kst = new Date(Date.now() + 9 * 3_600_000);
  const todayStart = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3_600_000).toISOString();
  const used = listed.ok ? (await listed.json() as Array<{ created_at?: string }>).filter(item => (item.created_at ?? '') >= todayStart).length : 0;
  if (used >= loungeBackgroundDaily) return json({ error: `오늘 만들 수 있는 배경 ${loungeBackgroundDaily}장을 모두 만들었어요. 기존 배경에서 골라 주세요.`, code: 'lounge_background_limit', retryable: false }, 429);
  const made = model === 'flux-klein' || model === 'flux-pro' ? await fluxImage(model, loungeBackgroundImagePrompt(request), loungeBackgroundSize) : await gptBackground(context, request, model);
  const path = folder + '/' + roomId.replace(/^lounge-/, '') + '-' + crypto.randomUUID().slice(0, 8) + '.' + made.ext;
  await upload(context, loungePhotoBuckets.private, path, made.bytes, made.type);
  // Saved on the room so it stays on every device; the member's browser keeps it too if this does not go through.
  const saved = await timed(`${context.base}/rest/v1/voice_lounge_rooms?id=eq.${encodeURIComponent(roomId)}&host_id=eq.${userId}`, { method: 'PATCH', headers: serviceHeaders(context, { 'Content-Type': 'application/json' }), body: JSON.stringify({ background: { image: path, prompt: request } }) }).catch(() => null);
  if (!saved?.ok) console.warn('[Lounge background] not saved on the room', saved?.status);
  console.info('[Lounge background]', JSON.stringify({ model, left: loungeBackgroundDaily - used - 1 }));
  return json({ image: path, prompt: request, left: loungeBackgroundDaily - used - 1 });
}

/** A background from GPT, at the chosen quality. */
async function gptBackground(context: Context, request: string, model: LoungeImageModel): Promise<MadeImage> {
  const response = await timed('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: 'Bearer ' + context.key, 'Content-Type': 'application/json' }, body: JSON.stringify({
    model: loungePhotoModel, prompt: loungeBackgroundImagePrompt(request), size: loungeBackgroundSize, quality: gptQuality(model), output_format: 'webp', output_compression: 82, n: 1,
  }) }, 150_000);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    console.warn('[Lounge background] image failed', JSON.stringify({ status: response.status, code: payload?.error?.code }));
    if (payload?.error?.code === 'moderation_blocked' || /safety|moderation/i.test(payload?.error?.message ?? '')) throw new LoungePhotoError('이 장소는 배경으로 만들 수 없어요. 다른 장소로 적어 주세요.', 422, 'lounge_background_blocked');
    if (response.status === 429) throw new LoungePhotoError('요청이 잠시 몰렸어요. 조금 뒤 다시 시도해 주세요.', 429, 'lounge_background_rate_limit');
    throw new LoungePhotoError('배경을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_background_failed');
  }
  const b64 = ((await response.json()) as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
  if (!b64) throw new LoungePhotoError('배경을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_background_empty');
  return webp(Uint8Array.from(atob(b64), character => character.charCodeAt(0)));
}

/** Once a day, one post from each character's own day to their public gallery. */
async function dailyPosts(context: Context) {
  const settings = await timed(`${context.base}/rest/v1/lounge_image_settings?id=eq.1&select=enabled`, { headers: serviceHeaders(context) });
  if (!settings.ok || !(await settings.json() as Array<{ enabled: boolean }>)[0]?.enabled || process.env.LOUNGE_DAILY_POSTS === 'off') return { posted: 0, skipped: 'disabled' };
  const kst = new Date(Date.now() + 9 * 3_600_000);
  const todayStart = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3_600_000).toISOString();
  const done = await timed(`${context.base}/rest/v1/lounge_character_posts?source=eq.daily&created_at=gte.${encodeURIComponent(todayStart)}&select=character_id`, { headers: serviceHeaders(context) });
  const posted = new Set(done.ok ? (await done.json() as Array<{ character_id: string }>).map(row => row.character_id) : []);
  const waiting = loungeCharacters.filter(character => !posted.has(character.id));
  const results = await Promise.allSettled(waiting.map(async character => {
    const previous = await timed(`${context.base}/rest/v1/lounge_character_posts?character_id=eq.${character.id}&visibility=eq.public&order=created_at.desc&limit=5&select=scene`, { headers: serviceHeaders(context) });
    const scene = await writeScene(context, character.id, 'daily', { now: loungePhotoNow(), previous: previous.ok ? (await previous.json() as Array<{ scene: string }>).map(row => row.scene) : [] });
    const id = crypto.randomUUID(), image = await makeImage(context, character.id, scene.scene), path = `${character.id}/${id}.${image.ext}`;
    await upload(context, loungePhotoBuckets.public, path, image.bytes, image.type);
    const saved = await timed(`${context.base}/rest/v1/lounge_character_posts`, { method: 'POST', headers: serviceHeaders(context, { 'Content-Type': 'application/json' }), body: JSON.stringify({ id, character_id: character.id, visibility: 'public', source: 'daily', status: 'ready', scene: scene.scene, caption: scene.caption, image_path: path }) });
    if (!saved.ok) throw new Error(`save ${saved.status}`);
    return character.id;
  }));
  const failed = results.flatMap((result, index) => result.status === 'rejected' ? [{ character: waiting[index].id, error: result.reason instanceof Error ? result.reason.message.slice(0, 80) : 'error' }] : []);
  console.info('[Lounge photo] daily', JSON.stringify({ posted: results.length - failed.length, failed }));
  return { posted: results.length - failed.length, failed };
}

async function handle(req: Request) {
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY, key = process.env.OPENAI_API_KEY;
  if (!base || !anon || !service || !key) return json({ error: '사진 기능 서버 설정을 확인해 주세요.', code: 'lounge_photo_not_configured', retryable: false }, 503);
  // Reference photos are the site's own files; LOUNGE_ASSET_ORIGIN can point at another copy of them.
  const context: Context = { base, service, key, origin: (process.env.LOUNGE_ASSET_ORIGIN || new URL(req.url).origin).replace(/\/$/, '') };
  try {
    if (req.method === 'GET') {
      const secret = process.env.CRON_SECRET;
      if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: '허용되지 않은 요청이에요.' }, 401);
      return json(await dailyPosts(context));
    }
    if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin && !(process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).includes(origin)) return json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
    const authorization = req.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, 401);
    const raw = await req.text();
    if (raw.length > 2000) return json({ error: '요청이 너무 큽니다.' }, 413);
    let body: { action?: string; roomId?: string; source?: string; request?: unknown; imageModel?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ error: '올바르지 않은 요청이에요.' }, 400); }
    const roomId = body.roomId;
    const background = body.action === 'background';
    if ((body.action !== 'photo' && !background) || typeof roomId !== 'string' || !/^lounge-[a-f0-9-]{36}$/.test(roomId) || (!background && !['request', 'character'].includes(body.source ?? ''))) return json({ error: '올바르지 않은 사진 요청이에요.' }, 400);
    const auth = await timed(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } });
    if (!auth.ok) return json({ error: '로그인 세션이 만료됐어요.' }, 401);
    const user = await auth.json() as { id: string; is_anonymous?: boolean };
    // Photos are kept per member, so a guest without an account cannot receive them.
    if (user.is_anonymous) return json({ error: background ? '배경 만들기는 로그인한 회원만 쓸 수 있어요.' : '사진은 로그인한 회원만 받을 수 있어요.', code: 'lounge_photo_member_only', retryable: false }, 403);
    const request = typeof body.request === 'string' ? body.request.replace(/\s+/g, ' ').trim().slice(0, background ? 300 : 200) : '';
    const model: LoungeImageModel = isLoungeImageModel(body.imageModel) ? body.imageModel : 'gpt';
    if (background) return await memberBackground(context, user.id, roomId, request, model);
    return await memberPhoto(context, authorization, anon, user.id, roomId, body.source as 'request' | 'character', request, model);
  } catch (error) {
    if (error instanceof LoungePhotoError) return json({ error: error.message, code: error.code, retryable: error.status >= 500 || error.status === 429 }, error.status);
    console.error('[Lounge photo] failed', error instanceof Error ? `${error.name}: ${error.message.slice(0, 120)}` : 'error');
    return json({ error: '사진을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'lounge_photo_failed', retryable: true }, 502);
  }
}

function handler(req: Request): Promise<Response>;
function handler(req: NodeRequest, res: NodeResponse): Promise<void>;
async function handler(req: Request | NodeRequest, res?: NodeResponse): Promise<Response | void> {
  const headers = new Headers();
  if (!(req instanceof Request)) for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item)); else if (value !== undefined) headers.set(name, value);
  }
  const response = await handle(req instanceof Request ? req : new Request(`https://${headers.get('host') || 'localhost'}${req.url || '/api/lounge-images'}`, {
    method: req.method || 'GET', headers, ...((req.method || 'GET') !== 'GET' && (req.method || 'GET') !== 'HEAD' ? { body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) } : {}),
  }));
  if (!res) return response;
  res.statusCode = response.status; response.headers.forEach((value, name) => res.setHeader(name, value)); res.end(new Uint8Array(await response.arrayBuffer()));
}
export default handler;
