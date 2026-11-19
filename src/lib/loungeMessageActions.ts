import { loungeSpokenText, type LoungeMessage } from './lounge';

/**
 * What a member can do with a message of their one-to-one chat (2026-11-20, by the owner), tapping it:
 *   다시 쓰기: the character's last reply is written again, from where it was before that reply;
 *   음성으로 듣기: a reply of the character read in its voice, kept with the message so it is heard again without being counted again;
 *   되감기: takes back what the member said with the character's answer to it, in whole exchanges counted from the last reply
 *   (2, 4, ... up to 10 messages of the two), and the character no longer knows what came after
 *   (rewind_voice_lounge_chat, migrations 20270107000000 and 20270108000000).
 */
/** How many exchanges (the member's message and the reply to it) can be taken back: ten messages of the two at most. */
export const loungeRewindExchanges = 5;

/** Minutes of message voices a month (the month in Korea): without a plan, with Plus. The super admin has no limit. */
export const loungeMessageVoiceMinutes = { free: 3, plan: 30 } as const;
export type LoungeMessageVoiceStatus = { seconds: number; plan?: unknown; exempt?: unknown };
/** The month's seconds a member may have read aloud; null when there is no limit. */
export function loungeMessageVoiceLimitSeconds(status: Pick<LoungeMessageVoiceStatus, 'plan' | 'exempt'>): number | null {
  if (status.exempt === true) return null;
  return (status.plan === 'plus' || status.plan === 'pro' ? loungeMessageVoiceMinutes.plan : loungeMessageVoiceMinutes.free) * 60;
}
/** What the member sees under the voice button: the month's use told as minutes and seconds against the limit. */
export function loungeMessageVoiceUsageText(usage?: { usedSeconds: number; limitSeconds: number | null } | null) {
  if (!usage) return '';
  const told = (seconds: number) => { const total = Math.max(0, Math.round(seconds)); return total >= 60 ? `${Math.floor(total / 60)}분${total % 60 ? ` ${total % 60}초` : ''}` : `${total}초`; };
  return usage.limitSeconds === null ? `이번 달 음성 변환 ${told(usage.usedSeconds)}` : `이번 달 음성 변환 ${told(usage.usedSeconds)} / ${usage.limitSeconds / 60}분`;
}

/** The words a reply's voice says: what is said aloud, without the inner voice or the *actions*. */
export const loungeMessageVoiceText = (text: string) => loungeSpokenText(text).replace(/\s+/g, ' ').trim().slice(0, 1000);
/** About how long Korean speech of this text lasts, to refuse before making a voice that cannot fit what is left. */
export const loungeMessageVoiceEstimate = (text: string) => Math.max(1, text.replace(/\s+/g, '').length / 7);
/** Seconds of an MP3 at a constant bit rate (ElevenLabs mp3_44100_128). */
export const loungeMp3Seconds = (bytes: number, kbps = 128) => Math.round(bytes * 8 / (kbps * 1000) * 100) / 100;

const said = (message: Pick<LoungeMessage, 'kind'>) => message.kind === 'host' || message.kind === 'human';
/** Where going back from a message goes: to before the member's message that starts its exchange, taking back `count` messages. */
export type LoungeRewindPoint = { from: number; count: number };
/**
 * The messages a chat can go back from, each with its point: every message of the member's last five exchanges. A reply split
 * over several bubbles counts as one message, as the member sees it said; a reply with no message of the member before it (an
 * opening) cannot be taken back.
 */
export function loungeRewindPoints(messages: ReadonlyArray<Pick<LoungeMessage, 'id' | 'kind'>>): Map<number, LoungeRewindPoint> {
  const list = messages.filter(said), points = new Map<number, LoungeRewindPoint>();
  const starts = list.flatMap((message, index) => message.kind === 'human' ? [index] : []).slice(-loungeRewindExchanges);
  if (!starts.length) return points;
  // How many messages of the two are said from each index to the end.
  const left = new Array<number>(list.length + 1).fill(0);
  for (let index = list.length - 1; index >= 0; index--) left[index] = left[index + 1] + (list[index].kind === 'human' || list[index + 1]?.kind !== 'host' ? 1 : 0);
  let start = starts[0];
  for (let index = starts[0]; index < list.length; index++) {
    if (list[index].kind === 'human') start = index;
    points.set(list[index].id, { from: list[start].id, count: left[start] });
  }
  return points;
}
/**
 * The last reply of the character, when the chat ends with one; otherwise undefined: there is no reply to write again. Going
 * back from it goes back from the start of its reply (a reply can be several messages; the database finds where it starts).
 */
export function loungeLastReplyId(messages: ReadonlyArray<Pick<LoungeMessage, 'id' | 'kind'>>): number | undefined {
  const last = messages.filter(said).at(-1);
  return last?.kind === 'host' ? last.id : undefined;
}
/** The messages of a turn that is written again: the last reply and the other parts of it just before it. */
export function loungeLastReplyIds(messages: ReadonlyArray<Pick<LoungeMessage, 'id' | 'kind'>>): Set<number> {
  const list = messages.filter(said), ids = new Set<number>();
  for (let index = list.length - 1; index >= 0 && list[index].kind === 'host'; index--) ids.add(list[index].id);
  return ids;
}
