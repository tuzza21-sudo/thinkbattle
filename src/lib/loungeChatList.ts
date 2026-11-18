export type LoungeChatRoomTurns = Array<{ id: string; ai_turns: number | null }> | null;
type ListedChat = { room_id: string; last_kind: string };

/**
 * Only the chats that are going on (2026-11-18, by the owner): a room opened from a character's page has nothing from the member in it until they
 * speak, and was listed all the same. A room whose last message is the member's, or in which the character has answered twice, is a conversation; a
 * room with no answer is not. With one answer (the reply to the member, or the character's own opening) the room is asked whether the member has said
 * anything. A room whose answers cannot be read is kept, so a failure never empties the list.
 */
export async function loungeChatsInProgress<T extends ListedChat>(chats: T[], read: (ids: string[]) => Promise<LoungeChatRoomTurns>, humans: (roomId: string) => Promise<number>): Promise<T[]> {
  if (!chats.length) return chats;
  const turns = await read(chats.map(chat => chat.room_id)).catch(() => null);
  if (!turns) return chats;
  const answered = new Map(turns.map(row => [row.id, Number(row.ai_turns ?? 0)]));
  const maybe = chats.filter(chat => chat.last_kind !== 'human' && answered.get(chat.room_id) === 1);
  const spoke = new Set((await Promise.all(maybe.map(async chat => (await humans(chat.room_id).catch(() => 1)) > 0 ? chat.room_id : ''))).filter(Boolean));
  return chats.filter(chat => chat.last_kind === 'human' || !answered.has(chat.room_id) || (answered.get(chat.room_id) ?? 0) >= 2 || spoke.has(chat.room_id));
}
