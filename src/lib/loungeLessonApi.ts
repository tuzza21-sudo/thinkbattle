import { supabase } from './supabase';
import { parseLoungeLessonWords, readLoungeLessonLevel, type LoungeLessonItem, type LoungeLessonLevel } from './loungeLesson';

/** A correction from a lesson (lounge_english_attempts): what the member said and how it reads better. */
export type LoungeLessonNote = { id: number; said: string; better: string; polished: string; why: string; verdict: string; created_at: string; item_id: string | null };
export type LoungeLessonBook = { items: LoungeLessonItem[]; notes: LoungeLessonNote[]; level: LoungeLessonLevel };

const failed = (error: { message?: string; code?: string } | null) => {
  if (!error) return;
  // Before migration 20270116000000 the tables are not there.
  if (error.code === '42P01' || error.code === 'PGRST205') throw new Error('영어 수업은 곧 열려요. 조금만 기다려 주세요.');
  if (error.message?.includes('단어장')) throw new Error(error.message);
  throw new Error('잠시 연결이 어려워요. 다시 시도해 주세요.');
};

/** The member's expressions, the latest corrections and their level (each member sees only their own rows). */
export async function loadLoungeLessonBook(): Promise<LoungeLessonBook> {
  const [items, notes, profile] = await Promise.all([
    supabase.from('lounge_english_items').select('*').order('created_at', { ascending: false }).limit(400),
    supabase.from('lounge_english_attempts').select('id,said,better,polished,why,verdict,created_at,item_id').neq('better', '').order('created_at', { ascending: false }).limit(30),
    supabase.from('lounge_english_profiles').select('level').maybeSingle(),
  ]);
  failed(items.error); failed(notes.error);
  return { items: (items.data ?? []) as LoungeLessonItem[], notes: (notes.data ?? []) as LoungeLessonNote[], level: readLoungeLessonLevel(profile.data?.level) };
}

/** Adds the member's own expressions (one a line, "expression - 뜻"); one they already have is left as it is. Returns how many were new. */
export async function addLoungeLessonWords(text: string, level: LoungeLessonLevel) {
  const words = parseLoungeLessonWords(text);
  if (!words.length) throw new Error('영어 표현을 한 줄에 하나씩 적어 주세요. 예: come up with - 생각해 내다');
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('로그인이 필요해요.');
  const target = level === 'B2' ? 'C1' : 'B2';
  const { data, error } = await supabase.from('lounge_english_items')
    .upsert(words.map(word => ({ user_id: user.user!.id, expression: word.expression, meaning: word.meaning, level: target, source: 'mine' })), { onConflict: 'user_id,expression_key', ignoreDuplicates: true })
    .select('id');
  failed(error);
  return data?.length ?? 0;
}

export async function deleteLoungeLessonItem(id: string) {
  const { error } = await supabase.from('lounge_english_items').delete().eq('id', id);
  failed(error);
}

export async function setLoungeLessonLevel(level: LoungeLessonLevel) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('로그인이 필요해요.');
  const { error } = await supabase.from('lounge_english_profiles').upsert({ user_id: user.user.id, level, updated_at: new Date().toISOString() });
  failed(error);
}
