import { supabase } from './supabase';
import { loungeNeedsStudy, normalizeLoungeTopicBrief, type LoungeHelpKind, type LoungeSpeechEngine, type LoungeTopicBrief, type LoungeHostId, type LoungeAgeGroup, type LoungeThemeId, type LoungeRoom, type LoungeRoomSummary, type LoungeSpace, type LoungeSpaceTable, type LoungeOpenTable, type LoungeSpaceWait, type LoungeMember, type LoungeMessage, type LoungeTopicStudy } from './lounge';
import type { LoungeHostReason, LoungeSession, LoungeSessionAction } from './loungeSession';
import type { RelationshipView } from './relationship/types';
import type { LoungeCharacterPost } from './loungePhotos';
import type { LoungeCustomCharacterRow, LoungeCustomSheet } from './loungeCustomCharacters';
import type { LoungeScenarioRow } from './loungeScenarios';

export class LoungeApiError extends Error {
  code: string | undefined;
  retryable: boolean;
  retryAfterSeconds: number;
  constructor(message: string, code?: string, retryable = true, retryAfterSeconds = 60) {
    super(message); this.code = code; this.retryable = retryable; this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function loungeConnectionError(error: unknown, source = '서버') {
  if (error instanceof LoungeApiError) return error;
  const message = error instanceof Error ? error.message : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(message)
    ? new LoungeApiError(`${source} 연결이 끊겼어요. 인터넷 연결을 확인한 뒤 잠시 후 다시 시도해 주세요.`, 'lounge_network_error', true, 10)
    : error;
}

async function loungeFetch(url: string, init: RequestInit, source = '서버') {
  try { return await fetch(url, init); }
  catch (error) { if (init.signal?.aborted) throw error; throw loungeConnectionError(error, source); }
}

const sessionExpired = () => new LoungeApiError('로그인 세션이 끝났어요. 다시 로그인해 주세요.', 'lounge_session_expired', false);
async function loungeAccessToken(forceRefresh = false) {
  try {
    let { data, error } = forceRefresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
    if (error) throw error;
    // A missing session is retried once through a refresh before the member is told to log in again.
    if (!data.session && !forceRefresh) ({ data, error } = await supabase.auth.refreshSession());
    if (!data.session?.access_token) throw sessionExpired();
    return data.session.access_token;
  } catch (error) { if (error instanceof LoungeApiError) throw error; throw loungeConnectionError(error, '로그인 서버'); }
}
/** Sends an authenticated request; if the server rejects the token, refreshes the session once and sends it again. */
async function loungeAuthorizedFetch(url: string, init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> }, source: string) {
  const send = async (forceRefresh: boolean) => loungeFetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await loungeAccessToken(forceRefresh)}` } }, source);
  const response = await send(false);
  if (response.status !== 401) return response;
  const retried = await send(true);
  if (retried.status === 401) throw sessionExpired();
  return retried;
}

export async function requestLoungeVoiceToken(roomId: string) {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomName: roomId }) };
  let response: Response;
  try { response = await loungeAuthorizedFetch('/api/livekit-token', init, '음성 서버'); }
  catch (error) {
    if (!(error instanceof LoungeApiError) || error.code !== 'lounge_network_error') throw error;
    await new Promise(resolve => setTimeout(resolve, 500));
    response = await loungeAuthorizedFetch('/api/livekit-token', init, '음성 서버');
  }
  const credentials = await response.json().catch(() => null);
  if (!response.ok) throw new LoungeApiError(typeof credentials?.error === 'string' ? credentials.error : '음성 서버에 연결하지 못했어요. 연결 재시도를 눌러 주세요.', `lounge_voice_http_${response.status}`, response.status >= 500 || response.status === 429, 10);
  if (typeof credentials?.url !== 'string' || !/^wss?:\/\//.test(credentials.url) || typeof credentials.token !== 'string' || !credentials.token) throw new LoungeApiError('음성 서버의 연결 응답이 불완전해요. 연결 재시도를 눌러 주세요.', 'lounge_voice_invalid_response', true, 10);
  return credentials as {url:string;token:string};
}

export async function loungeRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  let result;
  try { result = await supabase.rpc(name, args); }
  catch (error) { throw loungeConnectionError(error, '발언·참가 상태 서버'); }
  const { data, error } = result;
  if (error) {
    const connection = loungeConnectionError(error, '발언·참가 상태 서버');
    if (connection instanceof LoungeApiError) throw connection;
    if (/schema cache|does not exist|Could not find/i.test(error.message)) throw new Error('라운지 서버를 준비 중입니다. 먼저 화면 미리보기로 둘러보세요.');
    throw new Error(error.message);
  }
  return data as T;
}
export const createLounge = async (persona: LoungeHostId, topic: string, capacity: number, nickname: string, theme: LoungeThemeId = 'rooftop', topicBrief?: LoungeTopicBrief) => {
  const title = topic.trim();
  if (!title || title.length > 160) throw new Error('대화할 주제를 1~160자로 직접 입력해 주세요.');
  const brief = topicBrief === undefined ? undefined : normalizeLoungeTopicBrief(topicBrief);
  const studyRequired = Boolean(brief) || loungeNeedsStudy(title);
  const id = await loungeRpc<string>('create_voice_lounge', { p_persona: persona, p_topic: title, p_capacity: capacity, p_nickname: nickname, p_theme: theme, p_study_required: studyRequired, ...(brief ? { p_topic_brief: brief } : {}) });
  // Start while the creator enters the room; the room shares this in-flight request.
  if (studyRequired) void prepareLoungeTopic(id).catch(() => {});
  return id;
};
// A database still on an earlier draft of the spaces migration answers with fewer columns; fill them so the page renders.
export const listLoungeSpaces = async () => (await loungeRpc<Array<Partial<LoungeSpace> & Pick<LoungeSpace, 'id' | 'name' | 'host_persona' | 'theme'>>>('list_voice_lounge_spaces', {}))
  .map((space): LoungeSpace => ({ capacity: 6, present_count: 0, topic: null, ...space, table_count: space.table_count ?? (space.present_count ? 1 : 0),
    participants: space.participants ?? [], seat_free: space.seat_free ?? true, waiting: space.waiting ?? 0 }));
/** Opens a room in a place with the owner's topic, the character who helps the conversation and, if chosen, how many people sit at it (2 to 6). */
export const openLoungeTable = (spaceId: string, nickname: string, topic: string, persona: LoungeHostId, ages: LoungeAgeGroup[] = [], capacity?: number) =>
  loungeRpc<string>('open_voice_lounge_table', { p_space: spaceId, p_nickname: nickname, p_topic: topic, p_persona: persona, p_ages: ages, ...(capacity ? { p_capacity: capacity } : {}) });
/** The owner changes the character helping the room. */
export const setLoungePersona = (roomId: string, persona: LoungeHostId) => loungeRpc<void>('set_voice_lounge_persona', { p_room: roomId, p_persona: persona });
const fillTable = <T extends Partial<LoungeSpaceTable> & Pick<LoungeSpaceTable, 'id'>>(table: T) =>
  ({ topic: null, present_count: 0, capacity: 6, mine: false, host_persona: 'jaeseok' as LoungeHostId, male_count: 0, female_count: 0, owner: null, age_groups: [] as LoungeAgeGroup[], ...table, participants: table.participants ?? [] });
/** Every open room in the house, fullest first among those with a free seat. */
export const listLoungeOpenTables = async () => (await loungeRpc<Array<Partial<LoungeOpenTable> & Pick<LoungeOpenTable, 'id' | 'space_id' | 'space_name' | 'theme'>>>('list_voice_lounge_open_tables', {}))
  .map((table): LoungeOpenTable => fillTable(table));
/** Keeps the visitor's place in line for a full space; returns a table once a seat is free for them. */
export const waitLoungeSpace = (spaceId: string) => loungeRpc<LoungeSpaceWait>('wait_voice_lounge_space', { p_space: spaceId });
export const leaveLoungeWait = (spaceId: string) => loungeRpc<void>('leave_voice_lounge_wait', { p_space: spaceId });
export const listLoungeSpaceTables = async (spaceId: string) => (await loungeRpc<Array<Partial<LoungeSpaceTable> & Pick<LoungeSpaceTable, 'id'>>>('list_voice_lounge_space_tables', { p_space: spaceId }))
  .map((table): LoungeSpaceTable => fillTable(table));
/** Sits at a chosen table if a seat is free (people waiting in line get free seats first). */
export const enterLoungeTable = (roomId: string, nickname: string) => loungeRpc<string>('enter_voice_lounge_table', { p_room: roomId, p_nickname: nickname });
/** Solo play: a private one-to-one with the space's character; an unfinished one is continued. */
export const startLoungeSolo = (spaceId: string, nickname: string, persona?: LoungeHostId) => loungeRpc<string>('start_voice_lounge_solo', { p_space: spaceId, p_nickname: nickname, ...(persona ? { p_persona: persona } : {}) });
/** Keeps or takes the AI voice for this table; returns who sends it now. */
export const claimLoungeBroadcaster = (roomId: string) => loungeRpc<string | null>('claim_voice_lounge_broadcaster', { p_room: roomId });
export const setLoungeTopic = (roomId: string, topic: string, source: 'ai' | 'member') => loungeRpc<void>('set_voice_lounge_topic', { p_room: roomId, p_topic: topic, p_source: source });
export const listOpenLounges = () => loungeRpc<LoungeRoomSummary[]>('list_open_voice_lounges', {});
export const joinLounge = (id: string, nickname: string) => loungeRpc<void>('join_voice_lounge', { p_room: id, p_nickname: nickname });
export const controlLounge = (id: string, action: 'start' | 'end' | 'leave' | 'heartbeat') => loungeRpc<void>('control_voice_lounge', { p_room: id, p_action: action });
// Beta limits: the member's daily allowance (seconds) for 1:1 talks and shared rooms; the Left values are null when not limited.
export type LoungeBetaUsage = { limited: boolean; soloLimit: number; groupLimit: number; soloLeft: number | null; groupLeft: number | null };
export const getMyLoungeBetaUsage = () => loungeRpc<LoungeBetaUsage>('get_my_lounge_beta_usage', {});
export const postLoungeMessage = (id: string, text: string) => loungeRpc<void>('post_voice_lounge_message', { p_room: id, p_text: text });
export const requestLoungeModerator = (id: string, kind: Exclude<LoungeHelpKind, 'direct'> = 'spark') => loungeRpc<void>('request_voice_lounge_moderator', { p_room: id, p_kind: kind });
export async function controlLoungeSession(id: string, action: LoungeSessionAction, turnId?: string, seconds = 0) {
  const args = { p_room: id, p_action: action, p_turn: turnId ?? null, p_seconds: seconds };
  try { return await loungeRpc<LoungeSession>('control_voice_lounge_session', args); }
  catch (error) {
    // Starting this captured turn is idempotent. Other mutations and paid audio are not replayed.
    if (action !== 'begin' || !turnId || !(error instanceof LoungeApiError) || error.code !== 'lounge_network_error') throw error;
    await new Promise(resolve => setTimeout(resolve, 500));
    return loungeRpc<LoungeSession>('control_voice_lounge_session', args);
  }
}
export async function loadLounge(id: string) {
  const results = await Promise.all([
    supabase.from('voice_lounge_rooms').select('*, space:voice_lounge_spaces(name)').eq('id', id).maybeSingle(),
    supabase.from('voice_lounge_members').select('*').eq('room_id', id).eq('active', true),
    supabase.from('voice_lounge_messages').select('*').eq('room_id', id).order('id', { ascending: false }).limit(60),
  ]);
  for (const result of results) if (result.error) throw loungeConnectionError(new Error(result.error.message), '대화방 상태 서버');
  if (!results[0].data) throw new LoungeApiError('대화방을 찾을 수 없거나 참가 권한이 없어요. 라운지에서 다시 입장해 주세요.', 'lounge_access_denied', false);
  const room = results[0].data as LoungeRoom;
  let session: LoungeSession | null = null;
  if (room.guided_session && room.status !== 'lobby') {
    const result = await supabase.from('voice_lounge_sessions').select('*').eq('room_id', id).maybeSingle();
    if (result.error) throw loungeConnectionError(new Error(result.error.message), '대화방 상태 서버');
    session = result.data as LoungeSession | null;
  }
  return { room, session, members: results[1].data as LoungeMember[], messages: (results[2].data as LoungeMessage[]).reverse() };
}
export async function reviewLoungeInteraction(roomId: string, messageId?: number) {
  return interactionRequest({ roomId, action: 'review', ...(messageId ? { messageId } : {}) });
}
export const syncLoungeSafety = (roomId: string) => interactionRequest({ roomId, action: 'sync' });
export const releaseLoungeRestriction = (roomId: string, targetId: string) => interactionRequest({ roomId, action: 'release', targetId });
async function interactionRequest(body: Record<string, unknown>) {
  const response = await loungeAuthorizedFetch('/api/lounge-interaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, '대화 보호 서버');
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new LoungeApiError(
    typeof payload?.error === 'string' ? payload.error : 'AI 대화 보호 연결을 다시 확인해 주세요.',
    typeof payload?.code === 'string' ? payload.code : `lounge_interaction_http_${response.status}`,
    typeof payload?.retryable === 'boolean' ? payload.retryable : response.status === 429 || response.status >= 500,
    typeof payload?.retryAfterSeconds === 'number' && payload.retryAfterSeconds > 0 ? payload.retryAfterSeconds : 60,
  );
  return payload as { skipped?: boolean; voiceSyncPending?: boolean; question_queued?: boolean };
}
async function apiRequest(body: Record<string, unknown>, signal?: AbortSignal, streaming = false) {
  const source = body.action === 'transcribe' ? '발언 전사 서버' : body.action === 'prepare' ? '자료 준비 서버' : body.action === 'topics' ? '주제 추천 서버' : '사회자 서버';
  const response = await loungeAuthorizedFetch('/api/lounge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }, source);
  if (response.ok && streaming && response.headers.get('content-type')?.includes('application/x-ndjson') && response.body) return { stream: response.body };
  const payload = await response.json().catch(() => null);
  const headerDelay = Number(response.headers.get('retry-after'));
  const delay = headerDelay > 0 && Number.isFinite(headerDelay) ? Math.ceil(headerDelay) : 60;
  if (!response.ok) throw new LoungeApiError(
    typeof payload?.error === 'string' ? payload.error : response.status === 429 ? '요청이 잠시 몰렸어요. 잠시 기다린 뒤 다시 시도해 주세요.' : '사회자 연결이 잠시 어려워요. 다시 시도해 주세요.',
    typeof payload?.code === 'string' ? payload.code : `lounge_http_${response.status}`,
    typeof payload?.retryable === 'boolean' ? payload.retryable : response.status === 429 || response.status >= 500,
    typeof payload?.retryAfterSeconds === 'number' && payload.retryAfterSeconds > 0 ? payload.retryAfterSeconds : delay,
  );
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new LoungeApiError('사회자 응답이 비어 있거나 불완전해요. 잠시 뒤 다시 시도해 주세요.', 'lounge_invalid_response');
  return payload;
}
export async function transcribeLoungeAudio(roomId: string, audio: Blob, signal?: AbortSignal, turnId?: string) {
  const encoded = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(audio); });
  return await apiRequest({ action: 'transcribe', roomId, audio: encoded, mimeType: audio.type, ...(turnId ? { turnId } : {}) }, signal) as { posted?: boolean };
}
export const requestLoungeHost = (roomId: string, reason: LoungeHostReason, signal?: AbortSignal, requestKind?: LoungeHelpKind, speech?: LoungeSpeechEngine) => apiRequest({ action: 'host', roomId, reason, stream: true, ...(requestKind ? { requestKind } : {}), ...(speech ? { speech } : {}) }, signal, true) as Promise<{ stream?: ReadableStream<Uint8Array>; skipped?: boolean; audio?: string; text?: string; audioError?: boolean }>;
/** Three replies the member could say next in a one-to-one conversation. */
export const suggestLoungeReplies = (roomId: string) => apiRequest({ action: 'replies', roomId }) as Promise<{ replies?: string[] }>;
/**
 * A photo from the character in the member's one-to-one room: `request` when the member asked, `character` when the
 * character sends one on their own. Takes 20 to 60 seconds. `skipped` means the character's own photos for today are used up.
 */
export async function requestLoungePhoto(roomId: string, source: 'request' | 'character', request?: string) {
  const response = await loungeAuthorizedFetch('/api/lounge-images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'photo', roomId, source, ...(request ? { request: request.slice(0, 200) } : {}) }) }, '사진 서버');
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new LoungeApiError(typeof payload?.error === 'string' ? payload.error : '사진을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.', typeof payload?.code === 'string' ? payload.code : `lounge_photo_http_${response.status}`, payload?.retryable !== false, 10);
  return payload as { post?: LoungeCharacterPost; left?: number; skipped?: boolean };
}
/** A refusal from the character maker, with the fields to fix. */
export class LoungeCharacterError extends LoungeApiError {
  problems: Array<{ field: string; message: string }>;
  constructor(message: string, code: string | undefined, problems: Array<{ field: string; message: string }> = []) { super(message, code, false, 10); this.problems = problems; }
}
async function loungeCharacterRequest<T>(body: Record<string, unknown>): Promise<T> {
  const response = await loungeAuthorizedFetch('/api/lounge-characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, '캐릭터 서버');
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new LoungeCharacterError(typeof payload?.error === 'string' ? payload.error : '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', typeof payload?.code === 'string' ? payload.code : `lounge_character_http_${response.status}`, Array.isArray(payload?.problems) ? payload.problems : []);
  return payload as T;
}
/** The AI writes the rest of a character from the member's few lines. Nothing is stored yet. */
export const draftLoungeCharacter = (basics: Pick<LoungeCustomSheet, 'name' | 'age' | 'gender' | 'job' | 'concept'>) =>
  loungeCharacterRequest<{ sheet: LoungeCustomSheet }>({ action: 'draft', ...basics });
export const saveLoungeCharacter = (character: { id?: string; sheet: LoungeCustomSheet; template: string; flirtation: boolean; voice: string; theme: string }) =>
  loungeCharacterRequest<{ character: LoungeCustomCharacterRow }>({ action: 'save', ...character });
export const makeLoungeCharacterPortrait = (id: string) => loungeCharacterRequest<{ path: string; url: string }>({ action: 'portrait', id });
export const chooseLoungeCharacterPortrait = (id: string, path: string) => loungeCharacterRequest<{ character: LoungeCustomCharacterRow }>({ action: 'choose', id, path });
export const uploadLoungeCharacterPortrait = (id: string, image: string) => loungeCharacterRequest<{ character: LoungeCustomCharacterRow }>({ action: 'upload', id, image, consent: true });
/** The active stories (scenarios) a member can start with a character, in their order. Empty if none can be read. */
export async function listLoungeScenarios(characterId: string): Promise<LoungeScenarioRow[]> {
  const { data, error } = await supabase.from('lounge_scenarios').select('*').eq('character_id', characterId).order('sort').order('created_at');
  return error ? [] : (data ?? []) as LoungeScenarioRow[];
}
/** Opens (or continues) a one-to-one chat in a scenario; returns the room id. */
export const startLoungeScenario = (id: string, nickname: string) => loungeRpc<string>('start_lounge_scenario', { p_scenario: id, p_nickname: nickname });
/** Opens (or continues) a one-to-one chat with a member's character; returns the room id. */
export const startLoungeCustomChat = (id: string, nickname: string) => loungeRpc<string>('start_lounge_custom_chat', { p_character: id, p_nickname: nickname });
export const setLoungeCustomStatus = (id: string, action: 'submit' | 'private' | 'delete') => loungeRpc<string>('set_lounge_custom_character_status', { p_character: id, p_action: action });
export type LoungePhotoUsage = { enabled: boolean; daily: number; used: number };
export const getMyLoungePhotoUsage = () => loungeRpc<LoungePhotoUsage | null>('get_my_lounge_photo_usage', {});
/** The conversation model of the member's own one-to-one room (src/lib/loungeModels.ts). */
export const setLoungeModel = (roomId: string, model: string) => loungeRpc<string>('set_voice_lounge_model', { p_room: roomId, p_model: model });
/** Turns the character's voice on or off in the member's own one-to-one room; off, the talk is a chat. */
export const setLoungeVoice = (roomId: string, on: boolean) => loungeRpc<boolean>('set_voice_lounge_voice', { p_room: roomId, p_on: on });
/** Puts text into the conversation as the member's own turn, like a spoken one. */
export const postLoungeText = (roomId: string, text: string) => loungeRpc<void>('post_voice_lounge_message', { p_room: roomId, p_text: text.trim().slice(0, 1200) });
export const suggestLoungeTopics = (roomId: string) => apiRequest({ action: 'topics', roomId }) as Promise<{ topics?: string[]; skipped?: boolean }>;
export const loadLoungeRelationship = (roomId: string) => apiRequest({ action: 'relationship', roomId }) as Promise<{ enabled: boolean; relationship?: RelationshipView }>;
const topicPreparations = new Map<string, Promise<{ skipped?: boolean; study?: LoungeTopicStudy }>>();
export function prepareLoungeTopic(roomId: string) {
  const pending = topicPreparations.get(roomId);
  if (pending) return pending;
  const preparation = (apiRequest({ action: 'prepare', roomId }) as Promise<{ skipped?: boolean; study?: LoungeTopicStudy }>).finally(() => {
    if (topicPreparations.get(roomId) === preparation) topicPreparations.delete(roomId);
  });
  topicPreparations.set(roomId, preparation);
  return preparation;
}
