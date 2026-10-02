import { supabase } from './supabase';
import type { AppUser } from '../types';

export type AvatarImage = { image: string; mimeType: string };
const BUCKET = 'lounge-avatars';
export function validateAvatarFile(file: File): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WebP 사진을 선택해 주세요.');
  if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 사진을 선택해 주세요.');
}
async function normalizeImage(blob: Blob, maxSize: number, mimeType: string): Promise<Blob> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 80_000_000) throw new Error('사진 크기가 너무 커요. 작은 사진을 선택해 주세요.');
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('사진을 읽을 수 없어요. 다른 브라우저에서 시도해 주세요.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('사진을 처리하지 못했어요.')), mimeType, 0.88));
  } finally { bitmap.close(); }
}
const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('사진을 읽지 못했어요.')); reader.readAsDataURL(blob);
});
export async function generateLoungeAvatar(file: File, signal: AbortSignal): Promise<AvatarImage> {
  validateAvatarFile(file);
  const photo = await normalizeImage(file, 1024, 'image/jpeg');
  if (photo.size > 1_200_000) throw new Error('사진 용량이 커요. 더 작은 사진을 선택해 주세요.');
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('로그인 후 사진을 변환해 주세요.');
  const response = await fetch('/api/lounge-avatar', { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ image: await toBase64(photo), mimeType: photo.type, consent: true }), signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '사진 변환에 실패했어요.');
  return result;
}
export function safeLoungeAvatarUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value), origin = new URL(import.meta.env.VITE_SUPABASE_URL).origin;
    return url.origin === origin && url.pathname.startsWith('/storage/v1/object/sign/lounge-avatars/') ? value : undefined;
  } catch { return undefined; }
}
export async function loadLoungeAvatar(path: unknown): Promise<Pick<AppUser, 'loungeAvatarPath' | 'loungeAvatarUrl'>> {
  if (typeof path !== 'string' || !path) return {};
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 7200);
    return { loungeAvatarPath: path, loungeAvatarUrl: error ? undefined : safeLoungeAvatarUrl(data?.signedUrl) };
  } catch { return { loungeAvatarPath: path }; }
}
export async function saveLoungeAvatar(user: AppUser, image: AvatarImage): Promise<AppUser> {
  const bytes = Uint8Array.from(atob(image.image), value => value.charCodeAt(0));
  const avatar = await normalizeImage(new Blob([bytes], { type: image.mimeType }), 512, 'image/webp');
  if (avatar.type !== 'image/webp' || avatar.size > 1048576) throw new Error('아바타를 저장하지 못했어요. WebP를 지원하는 브라우저를 사용해 주세요.');
  const path = `${user.id}/${crypto.randomUUID()}.webp`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, avatar, { contentType: 'image/webp', upsert: false });
  if (uploadError) throw new Error('아바타 저장소에 연결하지 못했어요. DB 설정을 확인하거나 다시 시도해 주세요.');
  const { error, data } = await supabase.from('users').update({ lounge_avatar_path: path }).eq('id', user.id).select('id').single();
  if (error || !data) { await supabase.storage.from(BUCKET).remove([path]); throw new Error('프로필에 아바타를 저장하지 못했어요. 다시 시도해 주세요.'); }
  const updated = { ...user, ...await loadLoungeAvatar(path) };
  // Remove superseded stored files after the new profile has been committed.
  if (user.loungeAvatarPath && user.loungeAvatarPath !== path) void supabase.storage.from(BUCKET).remove([user.loungeAvatarPath]).catch(() => {});
  return updated;
}
