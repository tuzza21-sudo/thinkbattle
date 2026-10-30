import { supabase } from './supabase';
import { isLoungeSceneImage } from './lounge';
import { loungePhotoBuckets, type LoungeCharacterPost } from './loungePhotos';

/** A post with an address the browser can show: public photos by their public URL, private ones by a signed URL. */
export type LoungePhotoView = LoungeCharacterPost & { url: string };

const columns = 'id,character_id,user_id,room_id,visibility,source,status,scene,caption,image_path,created_at';

/** Addresses for posts; a private photo whose link cannot be signed is left out. */
export async function withPhotoUrls(posts: readonly LoungeCharacterPost[]): Promise<LoungePhotoView[]> {
  const privatePaths = posts.filter(post => post.visibility === 'private' && post.image_path).map(post => post.image_path!);
  const signed = new Map<string, string>();
  if (privatePaths.length) {
    const { data } = await supabase.storage.from(loungePhotoBuckets.private).createSignedUrls(privatePaths, 3600);
    for (const item of data ?? []) if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
  }
  return posts.flatMap(post => {
    if (!post.image_path) return [];
    const url = post.visibility === 'public'
      ? supabase.storage.from(loungePhotoBuckets.public).getPublicUrl(post.image_path).data.publicUrl
      : signed.get(post.image_path);
    return url ? [{ ...post, url }] : [];
  });
}

/**
 * The address of a background image: a scene shared by every member by its public URL, one the member made for their
 * conversation (kept privately under their folder) by a signed one.
 */
export async function signLoungeBackground(path: string) {
  if (isLoungeSceneImage(path)) return supabase.storage.from(loungePhotoBuckets.public).getPublicUrl(path).data.publicUrl;
  const { data } = await supabase.storage.from(loungePhotoBuckets.private).createSignedUrl(path, 7200);
  return data?.signedUrl ?? null;
}

/** A background made for a scene and shared by every member (lounge_scene_backgrounds). */
export type LoungeSharedScene = { id: string; description: string; image_path: string; url: string };
/** The shared scenes, most picked and newest first; empty before migration 20261129. */
export async function loadLoungeSharedScenes(limit = 30): Promise<LoungeSharedScene[]> {
  const { data, error } = await supabase.from('lounge_scene_backgrounds').select('id,description,image_path').order('uses', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
  if (error) return [];
  return ((data ?? []) as Array<Omit<LoungeSharedScene, 'url'>>).filter(row => isLoungeSceneImage(row.image_path))
    .map(row => ({ ...row, url: supabase.storage.from(loungePhotoBuckets.public).getPublicUrl(row.image_path).data.publicUrl }));
}

/** The photos the character sent in this conversation, oldest first. Only the member's own are readable. */
export async function loadLoungeRoomPhotos(roomId: string) {
  // With the model that made each photo, to compare models; before migration 20261128 there is no such column.
  const read = (select: string) => supabase.from('lounge_character_posts').select(select).eq('room_id', roomId).eq('status', 'ready').order('created_at').limit(60);
  let { data, error } = await read(`${columns},image_model`);
  if (error && /image_model/.test(error.message)) ({ data, error } = await read(columns));
  if (error) throw new Error(error.message);
  return withPhotoUrls((data ?? []) as unknown as LoungeCharacterPost[]);
}

/** A character's gallery: their own public posts, and the photos they sent this member (empty when logged out). */
export async function loadLoungeCharacterGallery(characterId: string) {
  const [shared, mine] = await Promise.all([
    supabase.from('lounge_character_posts').select(columns).eq('character_id', characterId).eq('visibility', 'public').eq('status', 'ready').order('created_at', { ascending: false }).limit(30),
    supabase.from('lounge_character_posts').select(columns).eq('character_id', characterId).eq('visibility', 'private').eq('status', 'ready').order('created_at', { ascending: false }).limit(60),
  ]);
  if (shared.error) throw new Error(shared.error.message);
  return { shared: await withPhotoUrls((shared.data ?? []) as LoungeCharacterPost[]), mine: mine.error ? [] : await withPhotoUrls((mine.data ?? []) as LoungeCharacterPost[]) };
}
