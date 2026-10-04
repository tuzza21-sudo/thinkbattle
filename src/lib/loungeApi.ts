import { supabase } from './supabase';
import { loungeNeedsStudy, normalizeLoungeTopicBrief, type LoungeTopicBrief, type LoungeHostId, type LoungeThemeId, type LoungeRoom, type LoungeRoomSummary, type LoungeMember, type LoungeMessage, type LoungeTopicStudy } from './lounge';
import type { LoungeSession, LoungeSessionAction } from './loungeSession';

export class LoungeApiError extends Error {
  code: string | undefined;
  retryable: boolean;
  retryAfterSeconds: number;
  constructor(message: string, code?: string, retryable = true, retryAfterSeconds = 60) {
    super(message); this.code = code; this.retryable = retryable; this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function loungeRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
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
export const listOpenLounges = () => loungeRpc<LoungeRoomSummary[]>('list_open_voice_lounges', {});
export const joinLounge = (id: string, nickname: string) => loungeRpc<void>('join_voice_lounge', { p_room: id, p_nickname: nickname });
export const controlLounge = (id: string, action: 'start' | 'end' | 'leave' | 'heartbeat') => loungeRpc<void>('control_voice_lounge', { p_room: id, p_action: action });
export const postLoungeMessage = (id: string, text: string) => loungeRpc<void>('post_voice_lounge_message', { p_room: id, p_text: text });
export const requestLoungeModerator = (id: string) => loungeRpc<void>('request_voice_lounge_moderator', { p_room: id });
export const controlLoungeSession = (id: string, action: LoungeSessionAction, turnId?: string, seconds = 0) => loungeRpc<LoungeSession>('control_voice_lounge_session', { p_room: id, p_action: action, p_turn: turnId ?? null, p_seconds: seconds });
export async function loadLounge(id: string) {
  const results = await Promise.all([
    supabase.from('voice_lounge_rooms').select('*').eq('id', id).maybeSingle(),
    supabase.from('voice_lounge_members').select('*').eq('room_id', id).eq('active', true),
    supabase.from('voice_lounge_messages').select('*').eq('room_id', id).order('id', { ascending: false }).limit(60),
  ]);
  for (const result of results) if (result.error) throw new Error(result.error.message);
  if (!results[0].data) throw new LoungeApiError('대화방을 찾을 수 없거나 참가 권한이 없어요. 라운지에서 다시 입장해 주세요.', 'lounge_access_denied', false);
  const room = results[0].data as LoungeRoom;
  let session: LoungeSession | null = null;
  if (room.guided_session && room.status !== 'lobby') {
    const result = await supabase.from('voice_lounge_sessions').select('*').eq('room_id', id).maybeSingle();
    if (result.error) throw new Error(result.error.message);
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
  const { data } = await supabase.auth.getSession();
  const response = await fetch('/api/lounge-interaction', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body) });
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
  const { data } = await supabase.auth.getSession();
  const response = await fetch('/api/lounge', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify(body), signal });
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
export const requestLoungeHost = (roomId: string, reason: 'opening' | 'silence' | 'followup' | 'requested', signal?: AbortSignal) => apiRequest({ action: 'host', roomId, reason, stream: true }, signal, true) as Promise<{ stream?: ReadableStream<Uint8Array>; skipped?: boolean; audio?: string; text?: string; audioError?: boolean }>;
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
