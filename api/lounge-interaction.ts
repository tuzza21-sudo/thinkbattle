import { RoomServiceClient } from 'livekit-server-sdk';
import { loungeInteractionInstructions, loungeInteractionSchema, readLoungeInteraction, type LoungeInteractionMember } from '../src/lib/loungeInteraction.js';

type NodeRequest = { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body?: unknown };
type NodeResponse = { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: Uint8Array | string) => void };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const timed = (url: string, init: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });

async function handle(req: Request) {
  if (req.method !== 'POST') return json({ error: 'POST 요청만 허용됩니다.' }, 405);
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin && !(process.env.APP_ORIGIN || '').split(',').map(value => value.trim()).includes(origin)) return json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, 401);
  const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const voiceUrl = process.env.LIVEKIT_URL, voiceKey = process.env.LIVEKIT_API_KEY, voiceSecret = process.env.LIVEKIT_API_SECRET;
  if (!base || !anon || !service || !voiceUrl || !voiceKey || !voiceSecret) return json({ error: 'AI 대화 보호 서버 설정을 확인해 주세요.', code: 'lounge_interaction_not_configured', retryable: false }, 503);
  try {
    const raw = await req.text();
    if (raw.length > 4000) return json({ error: '요청이 너무 큽니다.' }, 413);
    let body: { roomId?: string; action?: string; messageId?: number; targetId?: string };
    try { body = JSON.parse(raw); } catch { return json({ error: '올바르지 않은 요청이에요.' }, 400); }
    const roomId = body?.roomId;
    if (typeof roomId !== 'string' || !/^lounge-[a-f0-9-]{36}$/.test(roomId) || !['review', 'sync', 'release'].includes(body.action ?? '')
      || (body.messageId !== undefined && (!Number.isSafeInteger(body.messageId) || body.messageId < 1))
      || (body.action === 'release' && !uuid.test(body.targetId ?? ''))) return json({ error: '올바르지 않은 대화 보호 요청이에요.' }, 400);
    const authHeaders = { apikey: anon, Authorization: authorization };
    const auth = await timed(`${base}/auth/v1/user`, { headers: authHeaders });
    if (!auth.ok) return json({ error: '로그인 세션이 만료됐어요.' }, 401);
    const user = await auth.json() as { id: string };
    if (!uuid.test(user.id)) return json({ error: '로그인 정보를 확인해 주세요.' }, 401);
    const rpc = async <T,>(name: string, args: Record<string, unknown>, empty = false): Promise<T> => {
      const response = await timed(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
      if (!response.ok) throw new Error('interaction_rpc_failed');
      return empty ? undefined as T : await response.json() as T;
    };
    // Authorize before constructing any voice operation with the administrator key.
    const access = await timed(`${base}/rest/v1/voice_lounge_members?room_id=eq.${encodeURIComponent(roomId)}&user_id=eq.${user.id}&active=eq.true&select=user_id`, { headers: authHeaders });
    if (!access.ok || !(await access.json() as unknown[]).length) return json({ error: '대화방 참가 권한이 없어요.' }, 403);
    const sync = async () => {
      const pending = await rpc<Array<{ user_id: string; speaking_restricted_until: string | null; safety_updated_at: string }>>('pending_voice_lounge_voice_sync', { p_room: roomId, p_actor: user.id });
      if (!pending.length) return;
      const voice = new RoomServiceClient(voiceUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:'), voiceKey, voiceSecret);
      const present = await voice.listParticipants(roomId);
      for (const member of pending) {
        const participant = present.find(item => item.identity === member.user_id);
        const canPublish = !(Date.parse(member.speaking_restricted_until || '') > Date.now());
        if (participant && participant.permission?.canPublish !== canPublish) await voice.updateParticipant(roomId, member.user_id, { permission: { canPublish, canSubscribe: true, canPublishData: true, canUpdateMetadata: true } });
        await rpc('ack_voice_lounge_voice_sync', { p_room: roomId, p_user: member.user_id, p_version: member.safety_updated_at }, true);
      }
    };
    if (body.action === 'sync') { await sync(); return json({ ok: true }); }
    if (body.action === 'release') {
      if (!await rpc<boolean>('release_voice_lounge_restriction', { p_room: roomId, p_actor: user.id, p_target: body.targetId })) return json({ error: '방장만 발언 제한을 해제할 수 있어요.' }, 403);
      await sync(); return json({ ok: true });
    }
    if (!process.env.OPENAI_API_KEY) return json({ error: 'AI 대화 보호 서버 설정을 확인해 주세요.', code: 'lounge_interaction_not_configured', retryable: false }, 503);
    const claim = await rpc<{ ticket: string; message_id: number; speaker_id: string; text: string; members: LoungeInteractionMember[]; topic: string; recent: unknown[] } | null>('claim_voice_lounge_interaction', { p_room: roomId, p_actor: user.id, p_message: body.messageId ?? null });
    if (!claim) return json({ skipped: true });
    try {
      const response = await timed('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({
        model: 'gpt-6-luna', reasoning: { effort: 'none' }, max_output_tokens: 500, store: false,
        instructions: loungeInteractionInstructions, input: JSON.stringify({ text: claim.text, speaker_id: claim.speaker_id, members: claim.members, topic: claim.topic, recent: claim.recent }),
        text: { format: { type: 'json_schema', name: 'lounge_interaction', strict: true, schema: loungeInteractionSchema } },
      }) });
      if (!response.ok) throw new Error('interaction_ai_failed');
      const decision = readLoungeInteraction(await response.json() as Parameters<typeof readLoungeInteraction>[0], claim.members, claim.speaker_id, claim.text);
      const applied = await rpc<Record<string, unknown>>('finish_voice_lounge_interaction', { p_room: roomId, p_message: claim.message_id, p_ticket: claim.ticket, p_decision: decision });
      // A committed decision is never counted again if the voice server is down.
      try { await sync(); } catch { return json({ ...applied, voiceSyncPending: true }); }
      return json(applied);
    } catch {
      await rpc('fail_voice_lounge_interaction', { p_room: roomId, p_message: claim.message_id, p_ticket: claim.ticket }, true).catch(() => {});
      return json({ error: 'AI 대화 보호 확인이 지연됐어요. 잘못된 발언 제한 없이 다시 확인할게요.', code: 'lounge_interaction_failed', retryable: true }, 502);
    }
  } catch {
    return json({ error: '대화 보호와 음성 권한 연결을 확인해 주세요.', code: 'lounge_interaction_sync_failed', retryable: true }, 502);
  }
}

function handler(req: Request): Promise<Response>;
function handler(req: NodeRequest, res: NodeResponse): Promise<void>;
async function handler(req: Request | NodeRequest, res?: NodeResponse): Promise<Response | void> {
  const headers = new Headers();
  if (!(req instanceof Request)) for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item)); else if (value !== undefined) headers.set(name, value);
  }
  const response = await handle(req instanceof Request ? req : new Request(`https://${headers.get('host') || 'localhost'}${req.url || '/api/lounge-interaction'}`, {
    method: req.method || 'GET', headers, ...((req.method || 'GET') !== 'GET' && (req.method || 'GET') !== 'HEAD' ? { body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) } : {}),
  }));
  if (!res) return response;
  res.statusCode = response.status; response.headers.forEach((value, name) => res.setHeader(name, value)); res.end(new Uint8Array(await response.arrayBuffer()));
}
export default handler;
