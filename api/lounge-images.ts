import { getLoungeCharacter, loungeCharacters, loungePersonaPrompt } from '../src/lib/loungeCharacters.js';
import { loungePhotoBuckets, loungePhotoImagePrompt, loungePhotoModel, loungePhotoNow, loungePhotoReferences, loungePhotoSceneInstructions, loungePhotoSceneSchema, loungePhotoSize, readLoungePhotoScene } from '../src/lib/loungePhotos.js';
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

/** The image, made from the character's reference photos; webp bytes. */
async function makeImage(context: Context, characterId: string, scene: string) {
  const form = new FormData();
  form.append('model', process.env.LOUNGE_IMAGE_MODEL || loungePhotoModel);
  form.append('prompt', loungePhotoImagePrompt(characterId, scene));
  let references = 0;
  for (const [index, path] of loungePhotoReferences(characterId).entries()) {
    const reference = await timed(`${context.origin}${path}`, {}).catch(() => null);
    if (!reference?.ok) continue;
    form.append('image[]', new Blob([await reference.arrayBuffer()], { type: reference.headers.get('content-type')?.split(';')[0] || 'image/webp' }), `reference-${index}.webp`);
    references++;
  }
  // Without a reference the face would be a stranger's, so no photo is better than a wrong one.
  if (!references) throw new LoungePhotoError('인물 사진을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_reference');
  form.append('size', loungePhotoSize);
  form.append('quality', process.env.LOUNGE_IMAGE_QUALITY || 'medium');
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
  return Uint8Array.from(atob(b64), character => character.charCodeAt(0));
}

async function upload(context: Context, bucket: string, path: string, bytes: Uint8Array) {
  const response = await timed(`${context.base}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: serviceHeaders(context, { 'Content-Type': 'image/webp', 'x-upsert': 'true' }), body: new Blob([bytes], { type: 'image/webp' }) }, 30_000);
  if (!response.ok) throw new LoungePhotoError('사진을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_storage');
}

/** A photo for a member in their own one-to-one conversation. */
async function memberPhoto(context: Context, authorization: string, anon: string, userId: string, roomId: string, source: 'request' | 'character', request: string) {
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
    const bytes = await makeImage(context, characterId, scene.scene);
    const path = `${userId}/${postId}.webp`;
    await upload(context, loungePhotoBuckets.private, path, bytes);
    const saved = await timed(`${context.base}/rest/v1/lounge_character_posts?id=eq.${postId}`, { method: 'PATCH', headers: serviceHeaders(context, { 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify({ status: 'ready', image_path: path, scene: scene.scene, caption: scene.caption }) });
    if (!saved.ok) throw new LoungePhotoError('사진을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_photo_save');
    const [post] = await saved.json() as unknown[];
    console.info('[Lounge photo]', JSON.stringify({ character: characterId, source, left: claim.left }));
    return json({ post, left: claim.left });
  } catch (error) {
    // A failed photo is given back: the reservation goes, so it does not count.
    await timed(`${context.base}/rest/v1/lounge_character_posts?id=eq.${postId}&status=eq.pending`, { method: 'DELETE', headers: serviceHeaders(context) }).catch(() => {});
    throw error;
  }
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
    const id = crypto.randomUUID(), path = `${character.id}/${id}.webp`;
    await upload(context, loungePhotoBuckets.public, path, await makeImage(context, character.id, scene.scene));
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
    let body: { action?: string; roomId?: string; source?: string; request?: unknown };
    try { body = JSON.parse(raw); } catch { return json({ error: '올바르지 않은 요청이에요.' }, 400); }
    const roomId = body.roomId;
    if (body.action !== 'photo' || typeof roomId !== 'string' || !/^lounge-[a-f0-9-]{36}$/.test(roomId) || !['request', 'character'].includes(body.source ?? '')) return json({ error: '올바르지 않은 사진 요청이에요.' }, 400);
    const auth = await timed(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } });
    if (!auth.ok) return json({ error: '로그인 세션이 만료됐어요.' }, 401);
    const user = await auth.json() as { id: string; is_anonymous?: boolean };
    // Photos are kept per member, so a guest without an account cannot receive them.
    if (user.is_anonymous) return json({ error: '사진은 로그인한 회원만 받을 수 있어요.', code: 'lounge_photo_member_only', retryable: false }, 403);
    const request = typeof body.request === 'string' ? body.request.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    return await memberPhoto(context, authorization, anon, user.id, roomId, body.source as 'request' | 'character', request);
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
