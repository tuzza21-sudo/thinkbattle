import { loungeRpc } from './loungeApi';
import { loadLoungeAvatarUrls } from './loungeAvatar';
import { loungeAgeGroups } from './lounge';
import { readAgeGroup } from './auth';
import type { AppUserAgeGroup } from '../types';

/** Friends, ratings, profile cards and notes (쪽지). The database functions are in 20261022000000_lounge_friends_profiles_notes.sql. */
export type LoungeProfile = {
  id: string; nickname: string; avatarUrl?: string; ageGroup?: AppUserAgeGroup; region?: string; bio?: string;
  ratingCount: number; ratingAvg: number | null; isSelf: boolean; isFriend: boolean; isBlocked: boolean; canRate: boolean; myRating: number | null; guest: boolean;
};
export type LoungePerson = { userId: string; nickname: string; avatarUrl?: string; isFriend: boolean; myRating: number | null };
export type LoungeFriendRoom = { id: string; topic: string; spaceId: string; spaceName: string; count: number; capacity: number };
export type LoungeFriend = { userId: string; nickname: string; avatarUrl?: string; ageGroup?: AppUserAgeGroup; region?: string; online: boolean; lastSeen: string | null; room: LoungeFriendRoom | null };
export type LoungeNote = { id: number; otherId: string; otherName: string; otherAvatarUrl?: string; mine: boolean; body: string; createdAt: string; readAt: string | null };
export const loungeNoteLimit = 500;
export const loungeBioLimit = 200;
export const loungeRegionLimit = 30;

export const loungeAgeLabel = (group?: string) => loungeAgeGroups.find(item => item.id === group)?.label;

const messages: Array<[RegExp, string]> = [
  [/registered account required/i, '회원가입한 계정으로 로그인하면 쓸 수 있어요. 게스트는 이용할 수 없어요.'],
  [/friend list is full/i, '친구는 최대 200명까지 둘 수 있어요.'],
  [/guests cannot be friends/i, '게스트는 친구로 추가할 수 없어요.'],
  [/too many notes/i, '쪽지를 너무 많이 보냈어요. 잠시 뒤에 다시 보내 주세요.'],
  [/cannot send a note|member unavailable|profile unavailable/i, '이 분에게는 지금 보낼 수 없어요.'],
  [/only people who talked together/i, '함께 대화한 분만 평가할 수 있어요.'],
  [/not in this room/i, '이 대화방에 함께한 기록이 없어요.'],
];
const call = async <T>(name: string, args: Record<string, unknown>) => {
  try { return await loungeRpc<T>(name, args); }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    // Messages already in Korean (connection errors) pass through; database exceptions are in English.
    throw new Error(messages.find(([pattern]) => pattern.test(message))?.[1] ?? (/[가-힣]/.test(message) ? message : '잠시 연결이 어려워요. 다시 시도해 주세요.'), { cause: error });
  }
};
const text = (value: unknown) => typeof value === 'string' && value ? value : undefined;

type ProfileRow = { id: string; nickname: string; avatar_path?: string | null; age_group?: string | null; region?: string | null; bio?: string | null; rating_count?: number; rating_avg?: number | null;
  is_self?: boolean; is_friend?: boolean; is_blocked?: boolean; can_rate?: boolean; my_rating?: number | null; guest?: boolean };
export async function loadLoungeProfile(userId: string, roomId?: string): Promise<LoungeProfile> {
  const row = await call<ProfileRow>('get_lounge_profile', { p_user: userId, p_room: roomId ?? null });
  const urls = await loadLoungeAvatarUrls([row.avatar_path]);
  return { id: row.id, nickname: row.nickname, avatarUrl: row.avatar_path ? urls.get(row.avatar_path) : undefined, ageGroup: readAgeGroup(row.age_group), region: text(row.region), bio: text(row.bio),
    ratingCount: row.rating_count ?? 0, ratingAvg: row.rating_avg ?? null, isSelf: Boolean(row.is_self), isFriend: Boolean(row.is_friend), isBlocked: Boolean(row.is_blocked),
    canRate: Boolean(row.can_rate), myRating: row.my_rating ?? null, guest: Boolean(row.guest) };
}
export async function listLoungeRoomPeople(roomId: string): Promise<LoungePerson[]> {
  const rows = await call<Array<{ user_id: string; nickname: string; avatar_path: string | null; is_friend: boolean; my_rating: number | null }>>('list_lounge_room_people', { p_room: roomId });
  const urls = await loadLoungeAvatarUrls(rows.map(row => row.avatar_path));
  return rows.map(row => ({ userId: row.user_id, nickname: row.nickname, avatarUrl: row.avatar_path ? urls.get(row.avatar_path) : undefined, isFriend: row.is_friend, myRating: row.my_rating }));
}
export const rateLoungeMember = (roomId: string, userId: string, score: number) => call<void>('rate_lounge_member', { p_room: roomId, p_user: userId, p_score: score });
export const setLoungeFriend = (userId: string, on: boolean) => call<void>('set_lounge_friend', { p_user: userId, p_on: on });
export const blockLoungeUser = (userId: string, on: boolean) => call<void>('block_lounge_user', { p_user: userId, p_on: on });
export async function listLoungeFriends(): Promise<LoungeFriend[]> {
  const rows = await call<Array<{ user_id: string; nickname: string; avatar_path: string | null; age_group: string | null; region: string | null; online: boolean | null; last_seen: string | null;
    room_id: string | null; room_topic: string | null; space_id: string | null; space_name: string | null; room_count: number | null; room_capacity: number | null }>>('list_lounge_friends', {});
  const urls = await loadLoungeAvatarUrls(rows.map(row => row.avatar_path));
  return rows.map(row => ({ userId: row.user_id, nickname: row.nickname, avatarUrl: row.avatar_path ? urls.get(row.avatar_path) : undefined, ageGroup: readAgeGroup(row.age_group), region: text(row.region),
    online: Boolean(row.online), lastSeen: row.last_seen,
    room: row.room_id && row.space_id ? { id: row.room_id, topic: row.room_topic ?? '주제 없이 자유롭게', spaceId: row.space_id, spaceName: row.space_name ?? '', count: row.room_count ?? 0, capacity: row.room_capacity ?? 0 } : null }));
}
export const sendLoungeNote = (userId: string, body: string) => call<number>('send_lounge_note', { p_to: userId, p_body: body });
export async function listLoungeNotes(): Promise<LoungeNote[]> {
  const rows = await call<Array<{ id: number; other_id: string; other_nickname: string; other_avatar_path: string | null; mine: boolean; body: string; created_at: string; read_at: string | null }>>('list_lounge_notes', {});
  const urls = await loadLoungeAvatarUrls(rows.map(row => row.other_avatar_path));
  return rows.map(row => ({ id: row.id, otherId: row.other_id, otherName: row.other_nickname, otherAvatarUrl: row.other_avatar_path ? urls.get(row.other_avatar_path) : undefined, mine: row.mine, body: row.body, createdAt: row.created_at, readAt: row.read_at }));
}
export const markLoungeNotesRead = (userId: string) => call<void>('mark_lounge_notes_read', { p_with: userId });
export const countLoungeUnreadNotes = () => call<number>('count_lounge_unread_notes', {});
export const touchLoungePresence = () => call<void>('touch_lounge_presence', {});

/** "방금 전", "5분 전", "3시간 전", "2일 전". */
export function loungeSince(iso: string | null, now = Date.now()) {
  if (!iso) return '';
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1440)}일 전`;
}
