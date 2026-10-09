import { supabase } from './supabase';
import type { LoungeKnowledgeInput, LoungeKnowledgeKind } from './loungeKnowledge';

export type LoungeKnowledgeRow = {
  id: string; character_id: string; kind: LoungeKnowledgeKind; title: string; content: string; active: boolean; embedded: boolean; updated_at: string;
  tags: string[]; lesson: string | null; category: string | null; source_note: string | null; as_of: string | null; time_sensitive: boolean; times_shown: number;
};

const failure = (error: { message?: string } | null) => new Error(/not authorized/.test(error?.message ?? '') ? '관리자 권한이 필요해요.' : '불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');

/** The administrator's view of the entries, newest first. Embedding numbers are never returned. */
export async function listLoungeKnowledge(character?: string): Promise<LoungeKnowledgeRow[]> {
  const { data, error } = await supabase.rpc('admin_list_lounge_knowledge', { p_character: character ?? null });
  if (error) throw failure(error);
  return (data ?? []) as LoungeKnowledgeRow[];
}

/** Saves an entry (the server makes its embedding) and returns its id. */
export async function saveLoungeKnowledge(entry: LoungeKnowledgeInput): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('다시 로그인해 주세요.');
  const response = await fetch('/api/lounge-knowledge', { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ entry }) });
  const payload = await response.json().catch(() => null) as { id?: string; error?: string } | null;
  if (!response.ok || typeof payload?.id !== 'string') throw new Error(payload?.error ?? '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  return payload.id;
}

export async function deleteLoungeKnowledge(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_lounge_knowledge', { p_id: id });
  if (error) throw failure(error);
}
