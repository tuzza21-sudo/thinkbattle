import { useCallback, useEffect, useId, useState } from 'react';
import { UserCog, X } from 'lucide-react';
import { listLoungeChats, listMyLoungePersonas, setLoungeRoomPersona } from '../lib/loungeApi';
import type { LoungeMemberPersonaRow } from '../lib/loungePersonas';
import { loadLoungePersonaPreference, saveLoungePersonaPreference } from '../lib/loungePersonaPreference';
import { supabase } from '../lib/supabase';
import { LoungePersonaManager } from './LoungePersonaManager';
import './LoungePersonaPicker.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
/** What a room has chosen: an empty value for the default, 'none', or a persona id. */
const chosenOf = (value: unknown) => {
  const room = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  return room?.none === true ? 'none' : typeof room?.id === 'string' ? room.id : '';
};

/**
 * On a character's page (2026-11-18, by the owner): who the member is in the conversations with this character. The pick goes to the conversation they
 * already have with the character, if there is one, and is kept for the ones they open next. The default persona (the star) is used until one is picked.
 * Since 2026-11-20 the same sheet makes, edits and deletes personas (the manager of the profile, with a way to tap one to use it), so there is no
 * second page to go to.
 */
export function LoungePersonaPicker({ characterId, characterName }: { characterId: string; characterName: string }) {
  const [open, setOpen] = useState(false);
  const [personas, setPersonas] = useState<LoungeMemberPersonaRow[] | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [value, setValue] = useState(() => loadLoungePersonaPreference(characterId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleId = useId();
  useEffect(() => {
    let cancelled = false;
    void Promise.all([listMyLoungePersonas().catch(() => [] as LoungeMemberPersonaRow[]), listLoungeChats().catch(() => [])]).then(async ([list, chats]) => {
      const chat = chats.find(item => item.character_id === characterId);
      let chosen = loadLoungePersonaPreference(characterId);
      if (chat) {
        const { data } = await supabase.from('voice_lounge_rooms').select('member_persona').eq('id', chat.room_id).maybeSingle();
        if (data) chosen = chosenOf((data as { member_persona?: unknown }).member_persona);
      }
      if (cancelled) return;
      setPersonas(list); setRoomId(chat?.room_id ?? null); setValue(chosen);
    });
    return () => { cancelled = true; };
  }, [characterId]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);
  const choose = async (next: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (roomId) await setLoungeRoomPersona(roomId, next && next !== 'none' ? next : null, next === 'none');
      saveLoungePersonaPreference(characterId, next);
      setValue(next);
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  const onList = useCallback((list: LoungeMemberPersonaRow[]) => setPersonas(list), []);
  const label = value === 'none' ? '쓰지 않음' : (personas?.find(persona => persona.id === value) ?? (value === '' ? personas?.find(persona => persona.is_default) : undefined))?.title ?? '기본';
  return <>
    <button type="button" className="lounge-persona-pick-button" onClick={() => setOpen(true)} title={`${characterName}과(와) 대화할 때의 나(페르소나)를 골라요`}>
      <UserCog size={16} aria-hidden="true" /><span>페르소나</span><small>{label}</small>
    </button>
    {open && <>
      <div className="lounge-persona-pick-backdrop" onClick={() => { if (!busy) setOpen(false); }} />
      <section className="lounge-persona-pick-sheet lounge-account-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><b id={titleId}>{characterName}과(와) 대화할 때의 나</b><button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="닫기"><X size={18} /></button></header>
        <p className="lounge-persona-pick-note">{roomId ? `지금 ${characterName}과(와) 하는 대화에 바로 쓰고, 새로 여는 대화에도 써요.` : `${characterName}과(와) 새로 여는 대화부터 써요.`}</p>
        <LoungePersonaManager choice={{ value, busy, onChoose: next => void choose(next) }} onList={onList} />
        {error && <p className="lounge-persona-pick-error" role="alert">{error}</p>}
      </section>
    </>}
  </>;
}
