import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { isLoungeCustomId, loungeCustomPortraitUrl, registerLoungeCustomCharacterRow, type LoungeCustomCharacterRow } from './loungeCustomCharacters';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '');
/** The public address of a member character's portrait. */
export const loungeCustomPortrait = (row: Pick<LoungeCustomCharacterRow, 'portrait_path'>) => loungeCustomPortraitUrl(supabaseUrl, row.portrait_path);
export const registerLoungeCustomRow = (row: LoungeCustomCharacterRow) => registerLoungeCustomCharacterRow(row, loungeCustomPortrait(row));

/** One member character: the creator's own or a public one. Registered so the lounge can show and talk with it. */
export async function loadLoungeCustomCharacter(id: string) {
  const { data, error } = await supabase.from('lounge_custom_characters').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) registerLoungeCustomRow(data as LoungeCustomCharacterRow);
  return (data ?? null) as LoungeCustomCharacterRow | null;
}
export async function listMyLoungeCharacters(userId: string) {
  const { data, error } = await supabase.from('lounge_custom_characters').select('*').eq('owner_id', userId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as LoungeCustomCharacterRow[];
}
export async function listPublicLoungeCharacters() {
  const { data, error } = await supabase.from('lounge_custom_characters').select('*').eq('status', 'public').order('updated_at', { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as LoungeCustomCharacterRow[];
}

/**
 * Makes sure a room's or page's member character is registered before it is drawn. `ready` is true right away for a
 * house character; for a member's it turns true once the character has been read (`missing` when it cannot be).
 */
export function useLoungeCustomCharacter(id: string | null | undefined) {
  const custom = isLoungeCustomId(id);
  const [state, setState] = useState<{ id: string; row: LoungeCustomCharacterRow | null } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!custom || !id) return;
    let cancelled = false;
    loadLoungeCustomCharacter(id).then(row => { if (!cancelled) setState({ id, row }); }).catch(() => { if (!cancelled) setFailed(id); });
    return () => { cancelled = true; };
  }, [custom, id]);
  const loaded = state?.id === id ? state : null;
  return { ready: !custom || Boolean(loaded?.row), missing: custom && (failed === id || (loaded !== null && !loaded.row)), row: loaded?.row ?? null };
}
