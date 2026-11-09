import { loungeCharacters } from '../src/lib/loungeCharacters';
import { loungeHosts } from '../src/lib/lounge';
import { cleanReachOutLine, reachOutHourAllowed, reachOutInstructions, reachOutPolicyFor, reachOutQualifies, reachedOutToday } from '../src/lib/loungeReachOut';
import { firebaseAccessToken, readServiceAccount, sendPushToToken } from '../src/lib/pushServer';

export const config = { runtime: 'edge' };

// A character reaching out first (2026-11-09; the rules are in src/lib/loungeReachOut.ts).
//   GET (Vercel cron, with CRON_SECRET)   once a day: for each member with notifications on, at most one character writes one
//                                         line, it is left in the chat and sent as a push.
//   GET ?dry=1                            the same, without writing or sending: who would be reached.
// Off until LOUNGE_REACH_OUT=on. Members who turned the switch off (lounge_reach_out), members already reached out to today
// (Korean date) and hours outside 9-22 in Korea are skipped.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const supabaseBase = () => (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const service = (path: string, init: RequestInit = {}) => fetch(`${supabaseBase()}${path}`, {
  ...init, signal: AbortSignal.timeout(15_000),
  headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers as Record<string, string> | undefined) },
});
const rows = async <T,>(path: string): Promise<T[]> => { const response = await service(path); return response.ok ? await response.json() as T[] : []; };

/** The most members reached out to in one run: a limit on cost and on time. */
export const reachOutRunLimit = 40;

type Room = { id: string; host_persona: string; memory: string | null };
type Message = { kind: string; text: string; created_at: string };

/** The chat of this member that qualifies today, the one they wrote in most recently. */
async function chatToReach(userId: string, now: number) {
  const rooms = await rows<Room>(`/rest/v1/voice_lounge_rooms?host_id=eq.${userId}&capacity=eq.1&space_id=is.null&select=id,host_persona,memory`);
  let best: { room: Room; lastHumanAt: number } | undefined;
  for (const room of rooms) {
    if (!loungeHosts.some(host => host.id === room.host_persona) || !loungeCharacters.some(character => character.id === room.host_persona)) continue; // a member's own character is not reached out from
    const last = (await rows<{ created_at: string }>(`/rest/v1/voice_lounge_messages?room_id=eq.${encodeURIComponent(room.id)}&kind=eq.human&order=id.desc&limit=1&select=created_at`))[0];
    if (!last) continue;
    const counted = await service(`/rest/v1/voice_lounge_messages?room_id=eq.${encodeURIComponent(room.id)}&kind=eq.human&select=id`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
    const humanMessages = Number((counted.headers.get('content-range') || '').split('/')[1]) || 0;
    const lastHumanAt = Date.parse(last.created_at);
    if (reachOutQualifies({ policy: reachOutPolicyFor(room.host_persona), lastHumanAt, humanMessages }, now) && (!best || lastHumanAt > best.lastHumanAt)) best = { room, lastHumanAt };
  }
  return best?.room;
}

/** One line in the character's voice, from the talk so far; undefined when the model gives nothing usable. */
async function writeLine(room: Room) {
  const character = loungeCharacters.find(item => item.id === room.host_persona);
  const host = loungeHosts.find(item => item.id === room.host_persona);
  if (!character || !host) return undefined;
  const recent = (await rows<Message>(`/rest/v1/voice_lounge_messages?room_id=eq.${encodeURIComponent(room.id)}&order=id.desc&limit=8&select=kind,text,created_at`)).reverse()
    .map(message => ({ who: message.kind === 'host' ? character.name : '이용자', text: message.text.slice(0, 300), when: message.created_at }));
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25_000),
    body: JSON.stringify({
      model: process.env.LOUNGE_REACH_OUT_MODEL || 'gpt-6-luna', reasoning: { effort: 'none' }, max_output_tokens: 160, store: false,
      instructions: reachOutInstructions,
      input: JSON.stringify({ character: { name: character.name, role: character.role, how_to_talk: String((host as { instruction?: string }).instruction ?? '').slice(0, 700) }, memory: (room.memory ?? '').slice(0, 900), recent }),
    }),
  });
  if (!response.ok) return undefined;
  const body = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const text = body.output_text ?? (body.output ?? []).flatMap(part => part.content ?? []).map(part => part.text ?? '').join('');
  return { line: cleanReachOutLine(text), name: character.name };
}

export async function runReachOut(options: { now?: number; dry?: boolean } = {}) {
  const now = options.now ?? Date.now();
  if (process.env.LOUNGE_REACH_OUT !== 'on') return { skipped: 'off' as const };
  if (!reachOutHourAllowed(now)) return { skipped: 'outside_hours' as const };
  const account = readServiceAccount(process.env);
  if (!account && !options.dry) return { skipped: 'push_not_configured' as const };

  // Without the migration nothing could be recorded, and a member would be written to again and again.
  if (!(await service('/rest/v1/lounge_reach_out?select=user_id&limit=1')).ok) return { skipped: 'not_ready' as const };
  const tokens = await rows<{ user_id: string; token: string }>('/rest/v1/lounge_push_tokens?select=user_id,token&order=updated_at.desc&limit=1000');
  const byUser = new Map<string, string[]>();
  for (const row of tokens) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.token]);

  const result = { members: byUser.size, reached: [] as Array<{ user: string; character: string; line: string }>, skipped: 0, failed: 0 };
  const accessToken = account && !options.dry ? await firebaseAccessToken(account) : '';
  for (const [userId, userTokens] of byUser) {
    if (result.reached.length >= reachOutRunLimit) break;
    try {
      const state = (await rows<{ enabled: boolean; last_sent_at: string | null }>(`/rest/v1/lounge_reach_out?user_id=eq.${userId}&select=enabled,last_sent_at`))[0];
      if ((state && !state.enabled) || reachedOutToday(state?.last_sent_at, now)) { result.skipped += 1; continue; }
      const room = await chatToReach(userId, now);
      if (!room) { result.skipped += 1; continue; }
      if (options.dry) { result.reached.push({ user: userId, character: room.host_persona, line: '(dry run)' }); continue; }
      const written = await writeLine(room);
      if (!written?.line) { result.failed += 1; continue; }
      // The line is left in the chat first, so the push always opens something that is there.
      const saved = await service('/rest/v1/voice_lounge_messages', { method: 'POST', body: JSON.stringify({ room_id: room.id, nickname: written.name, kind: 'host', text: written.line }) });
      if (!saved.ok) { result.failed += 1; continue; }
      let delivered = 0;
      for (const token of userTokens) {
        const sent = await sendPushToToken(account!, accessToken, token, { title: written.name, body: written.line, url: `/lounge/${room.id}` });
        if (sent === 'sent') delivered += 1;
        if (sent === 'gone') await service(`/rest/v1/lounge_push_tokens?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => undefined);
      }
      await service('/rest/v1/lounge_reach_out?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: userId, last_sent_at: new Date(now).toISOString(), last_character: room.host_persona, updated_at: new Date(now).toISOString() }) });
      if (delivered) result.reached.push({ user: userId, character: room.host_persona, line: written.line }); else result.failed += 1;
    } catch (error) {
      result.failed += 1;
      console.warn('[reach-out] member failed', error instanceof Error ? error.message : error);
    }
  }
  return result;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'GET 요청만 허용됩니다.' }, 405);
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: '허용되지 않은 요청이에요.' }, 401);
  if (!supabaseBase() || !serviceKey()) return json({ error: '서버 설정이 아직 끝나지 않았어요.' }, 503);
  try {
    const result = await runReachOut({ dry: new URL(req.url).searchParams.get('dry') === '1' });
    const redacted = 'reached' in result ? { ...result, reached: result.reached.map(item => ({ character: item.character, line: item.line })) } : result;
    console.info('[reach-out]', JSON.stringify('reached' in result ? { members: result.members, reached: result.reached.length, skipped: result.skipped, failed: result.failed } : result));
    return json(redacted);
  } catch (error) {
    console.error('[reach-out] failed', error instanceof Error ? error.message : error);
    return json({ error: '처리하지 못했어요.' }, 502);
  }
}
