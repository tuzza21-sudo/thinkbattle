type ListedChat = { room_id: string; last_kind: string };

/**
 * Only the chats the member has spoken in (2026-11-18, by the owner: once they have, the room stays): a room opened from a character's page has
 * nothing from the member in it until they speak, and was listed all the same. A room whose last message is the member's is one; for the others the
 * room is asked whether it holds a message of the member's. A room that cannot be asked is kept, so a failure never empties the list.
 */
export async function loungeChatsInProgress<T extends ListedChat>(chats: T[], spoke: (roomId: string) => Promise<boolean>): Promise<T[]> {
  const kept = await Promise.all(chats.map(async chat => chat.last_kind === 'human' || await spoke(chat.room_id).catch(() => true)));
  return chats.filter((_, index) => kept[index]);
}
