import { isLoungeCustomCharacterId } from '../src/lib/lounge.js';
import {
  loungeCustomBucket, loungeCustomDraftInstructions, loungeCustomDraftSchema, loungeCustomExtrasInstructions, loungeCustomExtrasSchema, loungeCustomPortraitPrompt, loungeCustomPortraitUrl, loungeCustomReviewInstructions,
  loungeCustomReviewSchema, loungeCustomThemes, loungeCustomUploadReviewInstructions, loungeCustomUploadReviewSchema, loungeVoicePresets,
  normalizeLoungeCustomSheet, validateLoungeCustomBasics, validateLoungeCustomSheet, type LoungeCustomCharacterRow, type LoungeCustomSheet,
} from '../src/lib/loungeCustomCharacters.js';
import { relationshipTemplateIds } from '../src/lib/relationship/index.js';

/**
 * Characters that members create (a Node function: portraits take up to a minute).
 * POST with the member's session, one of:
 *   draft   {name, age, gender, job, concept?}: the AI writes the introduction, personality and tastes (and the tagline,
 *           look and greeting); nothing is stored.
 *   save    {id?, sheet, template, flirtation, voice, theme}: the rules (the AI writes a missing tagline, look or
 *           greeting), an AI review, then the character is stored.
 *   portrait {id}: a portrait draft from the sheet's look (10 a day); choose {id, path} makes it the portrait.
 *   upload  {id, image (data URL), consent}: an image the member made, checked, used as the portrait only.
 */
type NodeRequest = { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type NodeResponse = { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: Uint8Array | string) => void };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const timed = (url: string, init: RequestInit, timeout = 20_000) => fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });

class LoungeCharacterError extends Error {
  status: number; code: string; problems?: Array<{ field: string; message: string }>;
  constructor(message: string, status: number, code: string, problems?: Array<{ field: string; message: string }>) { super(message); this.status = status; this.code = code; this.problems = problems; }
}
type Context = { base: string; service: string; key: string; userId: string };
const serviceHeaders = (context: Context, extra: Record<string, string> = {}) => ({ apikey: context.service, Authorization: `Bearer ${context.service}`, ...extra });
const newId = () => `c_${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
const randomName = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('');

/** A structured answer from the text model. */
async function modelJson<T>(context: Context, name: string, instructions: string, input: unknown, schema: object, maxTokens: number): Promise<T> {
  const response = await timed('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${context.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
    model: process.env.LOUNGE_CHARACTER_MODEL || 'gpt-6-luna', reasoning: { effort: 'low' }, max_output_tokens: maxTokens, store: false,
    instructions, input: typeof input === 'string' ? input : JSON.stringify(input),
    text: { format: { type: 'json_schema', name, strict: true, schema } },
  }) }, 60_000);
  if (!response.ok) throw new LoungeCharacterError('AI 연결이 잠시 어려워요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_character_model');
  const result = await response.json() as { output?: Array<{ content?: Array<{ type: string; text?: string }> }> };
  const text = (result.output ?? []).flatMap(item => item.content ?? []).filter(part => part.type === 'output_text').map(part => part.text ?? '').join('');
  try { return JSON.parse(text) as T; } catch { throw new LoungeCharacterError('AI 답이 불완전했어요. 다시 시도해 주세요.', 502, 'lounge_character_model_invalid'); }
}

async function ownCharacter(context: Context, id: unknown) {
  if (typeof id !== 'string' || !isLoungeCustomCharacterId(id)) throw new LoungeCharacterError('캐릭터를 찾을 수 없어요.', 404, 'lounge_character_missing');
  const response = await timed(`${context.base}/rest/v1/lounge_custom_characters?id=eq.${id}&owner_id=eq.${context.userId}&select=*`, { headers: serviceHeaders(context) });
  const [row] = response.ok ? await response.json() as LoungeCustomCharacterRow[] : [];
  if (!row) throw new LoungeCharacterError('내 캐릭터만 바꿀 수 있어요.', 404, 'lounge_character_missing');
  return row;
}
async function patchCharacter(context: Context, id: string, fields: Record<string, unknown>) {
  const response = await timed(`${context.base}/rest/v1/lounge_custom_characters?id=eq.${id}&owner_id=eq.${context.userId}`, { method: 'PATCH', headers: serviceHeaders(context, { 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }) });
  if (!response.ok) throw new LoungeCharacterError('캐릭터를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_character_save');
  return (await response.json() as LoungeCustomCharacterRow[])[0];
}
async function upload(context: Context, path: string, bytes: Uint8Array, type: string) {
  const response = await timed(`${context.base}/storage/v1/object/${loungeCustomBucket}/${path}`, { method: 'POST', headers: serviceHeaders(context, { 'Content-Type': type, 'x-upsert': 'true' }), body: new Blob([bytes], { type }) }, 30_000);
  if (!response.ok) throw new LoungeCharacterError('사진을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_character_storage');
}
// A public character that changes is reviewed again before others see the change.
const afterEdit = (row: LoungeCustomCharacterRow) => row.status === 'public' ? { status: 'pending' } : row.status === 'rejected' ? { status: 'private' } : {};

async function draft(context: Context, body: Record<string, unknown>) {
  const basics = normalizeLoungeCustomSheet(body);
  const problems = validateLoungeCustomBasics(basics);
  if (problems.length) throw new LoungeCharacterError('기본 정보를 확인해 주세요.', 400, 'lounge_character_basics', problems);
  const written = await modelJson<Record<string, unknown>>(context, 'lounge_character_draft', loungeCustomDraftInstructions,
    { name: basics.name, age: basics.age, gender: basics.gender, job: basics.job, concept: basics.concept }, loungeCustomDraftSchema, 3000);
  return json({ sheet: normalizeLoungeCustomSheet({ ...written, name: basics.name, age: basics.age, gender: basics.gender, job: basics.job, concept: basics.concept }) });
}

async function save(context: Context, body: Record<string, unknown>) {
  const sheet: LoungeCustomSheet = normalizeLoungeCustomSheet(body.sheet);
  const template = relationshipTemplateIds.find(id => id === body.template);
  const voice = loungeVoicePresets.find(preset => preset.id === body.voice)?.id;
  const theme = loungeCustomThemes.find(item => item.id === body.theme)?.id;
  const problems = validateLoungeCustomSheet(sheet);
  if (!template) problems.push({ field: 'template', message: '관계 유형을 골라 주세요.' });
  if (!voice) problems.push({ field: 'voice', message: '목소리를 골라 주세요.' });
  if (!theme) problems.push({ field: 'theme', message: '대화할 장소를 골라 주세요.' });
  if (problems.length) throw new LoungeCharacterError('채워야 할 항목이 있어요.', 400, 'lounge_character_incomplete', problems);
  // A sheet written by hand has no tagline, look or greeting yet: the AI writes the ones that are empty from the rest.
  if (!sheet.tagline || !sheet.look || !sheet.greeting) {
    const extras = normalizeLoungeCustomSheet(await modelJson<Record<string, unknown>>(context, 'lounge_character_extras', loungeCustomExtrasInstructions,
      { name: sheet.name, age: sheet.age, gender: sheet.gender, job: sheet.job, intro: sheet.intro, personality: sheet.personality, tastes: sheet.tastes, empty: ['tagline', 'look', 'greeting'].filter(field => !sheet[field as 'tagline' | 'look' | 'greeting']) }, loungeCustomExtrasSchema, 600));
    sheet.tagline ||= extras.tagline; sheet.look ||= extras.look; sheet.greeting ||= extras.greeting;
    const filled = validateLoungeCustomSheet(sheet);
    if (filled.length) throw new LoungeCharacterError('AI가 쓴 항목을 확인하지 못했어요. 한 줄 소개, 외모, 첫 인사를 직접 적거나 다시 저장해 주세요.', 502, 'lounge_character_extras', filled);
  }
  const review = await modelJson<{ allowed: boolean; problems: Array<{ field: string; message: string }> }>(context, 'lounge_character_review', loungeCustomReviewInstructions, sheet, loungeCustomReviewSchema, 900);
  if (!review.allowed) throw new LoungeCharacterError('검수에서 고칠 점이 나왔어요.', 422, 'lounge_character_review', review.problems.length ? review.problems.slice(0, 6) : [{ field: 'intro', message: '설정을 조금 더 구체적이고 안전하게 다듬어 주세요.' }]);
  const fields = { name: sheet.name, sheet, template, flirtation: body.flirtation !== false, voice, theme };
  if (body.id !== undefined) {
    const row = await ownCharacter(context, body.id);
    return json({ character: await patchCharacter(context, row.id, { ...fields, ...afterEdit(row) }) });
  }
  const response = await timed(`${context.base}/rest/v1/lounge_custom_characters`, { method: 'POST', headers: serviceHeaders(context, { 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify({ id: newId(), owner_id: context.userId, ...fields }) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (payload?.message?.includes('3개까지')) throw new LoungeCharacterError('캐릭터는 한 사람당 3개까지 만들 수 있어요.', 409, 'lounge_character_limit');
    throw new LoungeCharacterError('캐릭터를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_character_save');
  }
  return json({ character: (await response.json() as LoungeCustomCharacterRow[])[0] });
}

async function portrait(context: Context, body: Record<string, unknown>) {
  const row = await ownCharacter(context, body.id);
  const claim = await timed(`${context.base}/rest/v1/rpc/claim_lounge_custom_portrait`, { method: 'POST', headers: serviceHeaders(context, { 'Content-Type': 'application/json' }), body: JSON.stringify({ p_owner: context.userId }) });
  if (!claim.ok) throw new LoungeCharacterError('사진 요청을 처리하지 못했어요.', 502, 'lounge_character_portrait_claim');
  if (await claim.json() !== true) throw new LoungeCharacterError('오늘은 대표 사진을 10장까지 만들 수 있어요. 내일 다시 시도해 주세요.', 429, 'lounge_character_portrait_limit');
  const response = await timed('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${context.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
    model: process.env.LOUNGE_PORTRAIT_MODEL || 'gpt-image-2.5-flare', prompt: loungeCustomPortraitPrompt(normalizeLoungeCustomSheet(row.sheet)),
    size: '1024x1536', quality: process.env.LOUNGE_IMAGE_QUALITY || 'medium', output_format: 'webp', output_compression: 82,
  }) }, 150_000);
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    if (payload?.error?.code === 'moderation_blocked' || /safety|moderation/i.test(payload?.error?.message ?? '')) throw new LoungeCharacterError('이 외모 설명으로는 사진을 만들 수 없어요. 외모를 고쳐 다시 시도해 주세요.', 422, 'lounge_character_portrait_blocked');
    throw new LoungeCharacterError('사진을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_character_portrait_failed');
  }
  const b64 = ((await response.json()) as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json;
  if (!b64) throw new LoungeCharacterError('사진을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.', 502, 'lounge_character_portrait_empty');
  const path = `${row.id}/draft-${randomName()}.webp`;
  await upload(context, path, Uint8Array.from(atob(b64), character => character.charCodeAt(0)), 'image/webp');
  return json({ path, url: loungeCustomPortraitUrl(context.base, path) });
}

async function choose(context: Context, body: Record<string, unknown>) {
  const row = await ownCharacter(context, body.id);
  if (typeof body.path !== 'string' || !new RegExp(`^${row.id}/draft-[0-9a-f]{16}\\.webp$`).test(body.path)) throw new LoungeCharacterError('고른 사진을 확인하지 못했어요.', 400, 'lounge_character_portrait_path');
  return json({ character: await patchCharacter(context, row.id, { portrait_path: body.path, portrait_source: 'ai', ...afterEdit(row) }) });
}

const uploadTypes: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
async function uploadPortrait(context: Context, body: Record<string, unknown>) {
  const row = await ownCharacter(context, body.id);
  if (body.consent !== true) throw new LoungeCharacterError('사진을 올리려면 권리와 실존 인물 관련 안내에 동의해 주세요.', 400, 'lounge_character_upload_consent');
  const match = typeof body.image === 'string' ? /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(body.image) : null;
  if (!match) throw new LoungeCharacterError('webp, jpg, png 사진만 올릴 수 있어요.', 400, 'lounge_character_upload_type');
  const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  if (bytes.length > 3_000_000) throw new LoungeCharacterError('사진이 너무 커요. 3MB 이하로 올려 주세요.', 413, 'lounge_character_upload_size');
  // The moderation model catches sexual and violent images; the vision review adds minors, public figures and personal data.
  const moderation = await timed('https://api.openai.com/v1/moderations', { method: 'POST', headers: { Authorization: `Bearer ${context.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'omni-moderation-latest', input: [{ type: 'image_url', image_url: { url: body.image } }] }) }, 30_000);
  const flagged = moderation.ok ? ((await moderation.json()) as { results?: Array<{ flagged?: boolean }> }).results?.some(result => result.flagged) : undefined;
  if (flagged !== false) throw new LoungeCharacterError(flagged ? '이 사진은 대표 사진으로 쓸 수 없어요.' : '사진을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.', flagged ? 422 : 502, flagged ? 'lounge_character_upload_blocked' : 'lounge_character_upload_check');
  const review = await modelJson<{ allowed: boolean; reason: string }>(context, 'lounge_character_upload_review', loungeCustomUploadReviewInstructions,
    [{ role: 'user', content: [{ type: 'input_text', text: '이 이미지를 검사해 주세요.' }, { type: 'input_image', image_url: body.image }] }], loungeCustomUploadReviewSchema, 300)
    .catch(() => ({ allowed: false, reason: '사진을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }));
  if (!review.allowed) throw new LoungeCharacterError(review.reason || '이 사진은 대표 사진으로 쓸 수 없어요.', 422, 'lounge_character_upload_blocked');
  const path = `${row.id}/upload-${randomName()}.${uploadTypes[match[1]]}`;
  await upload(context, path, bytes, match[1]);
  return json({ character: await patchCharacter(context, row.id, { portrait_path: path, portrait_source: 'upload', ...afterEdit(row) }) });
}

async function handle(req: Request) {
  if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY, key = process.env.OPENAI_API_KEY;
  if (!base || !anon || !service || !key) return json({ error: '캐릭터 만들기 서버 설정을 확인해 주세요.', code: 'lounge_character_not_configured' }, 503);
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin && !(process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).includes(origin)) return json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, 401);
  try {
    const raw = await req.text();
    if (raw.length > 4_200_000) return json({ error: '요청이 너무 커요.' }, 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw); } catch { return json({ error: '올바르지 않은 요청이에요.' }, 400); }
    const auth = await timed(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } });
    if (!auth.ok) return json({ error: '로그인 세션이 만료됐어요.' }, 401);
    const user = await auth.json() as { id: string; is_anonymous?: boolean };
    if (user.is_anonymous) return json({ error: '캐릭터는 회원만 만들 수 있어요. 로그인해 주세요.', code: 'lounge_character_member_only' }, 403);
    const context: Context = { base, service, key, userId: user.id };
    switch (body.action) {
      case 'draft': return await draft(context, body);
      case 'save': return await save(context, body);
      case 'portrait': return await portrait(context, body);
      case 'choose': return await choose(context, body);
      case 'upload': return await uploadPortrait(context, body);
      default: return json({ error: '올바르지 않은 요청이에요.' }, 400);
    }
  } catch (error) {
    if (error instanceof LoungeCharacterError) return json({ error: error.message, code: error.code, ...(error.problems ? { problems: error.problems } : {}) }, error.status);
    console.error('[Lounge character] failed', error instanceof Error ? `${error.name}: ${error.message.slice(0, 120)}` : 'error');
    return json({ error: '캐릭터 요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'lounge_character_failed' }, 502);
  }
}

function handler(req: Request): Promise<Response>;
function handler(req: NodeRequest, res: NodeResponse): Promise<void>;
async function handler(req: Request | NodeRequest, res?: NodeResponse): Promise<Response | void> {
  const headers = new Headers();
  if (!(req instanceof Request)) for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item)); else if (value !== undefined) headers.set(name, value);
  }
  const response = await handle(req instanceof Request ? req : new Request(`https://${headers.get('host') || 'localhost'}${req.url || '/api/lounge-characters'}`, {
    method: req.method || 'GET', headers, ...((req.method || 'GET') !== 'GET' && (req.method || 'GET') !== 'HEAD' ? { body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) } : {}),
  }));
  if (!res) return response;
  res.statusCode = response.status; response.headers.forEach((value, name) => res.setHeader(name, value)); res.end(new Uint8Array(await response.arrayBuffer()));
}
export default handler;
