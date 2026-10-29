import { useEffect, useId, useRef, useState } from 'react';
import { Check, Image as ImageIcon, LoaderCircle, Sparkles, X } from 'lucide-react';
import { getLoungeTheme, loungeThemes, type LoungeRoomBackground, type LoungeThemeId } from '../lib/lounge';
import { loungeBackgroundDaily } from '../lib/loungePhotos';

const tile = (image: string) => ({ backgroundImage: `url('${image}')`, backgroundSize: 'cover', backgroundPosition: 'center' });

/**
 * The background of a one-to-one conversation, changed as the story moves: one of the places, the conversation's own,
 * or a place the member describes (made as an image, a few a day). Opens as a sheet over the room, from its own button
 * or, with `open` and `onOpenChange`, from somewhere else (the chat's settings menu) without the button.
 */
export function LoungeBackgroundPicker({ current, ownTheme, onPick, onMake, open: openFromOutside, onOpenChange }: {
  current: LoungeRoomBackground | null; ownTheme: LoungeThemeId;
  onPick: (theme: LoungeThemeId | null) => Promise<void>; onMake: (prompt: string) => Promise<void>;
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [openHere, setOpenHere] = useState(false);
  const controlled = openFromOutside !== undefined;
  const open = controlled ? openFromOutside : openHere;
  const setOpen = (value: boolean) => { if (controlled) onOpenChange?.(value); else setOpenHere(value); };
  const [prompt, setPrompt] = useState(current?.prompt ?? '');
  const [busy, setBusy] = useState<'pick' | 'make' | ''>('');
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);
  const selected = current?.image ? 'image' : current?.theme ?? null;
  const pick = async (theme: LoungeThemeId | null) => {
    setBusy('pick'); setError('');
    try { await onPick(theme); close(); } catch (err) { setError(err instanceof Error ? err.message : '배경을 바꾸지 못했어요.'); } finally { setBusy(''); }
  };
  const make = async () => {
    const value = prompt.replace(/\s+/g, ' ').trim();
    if (value.length < 4 || busy) return;
    setBusy('make'); setError('');
    try { await onMake(value); close(); } catch (err) { setError(err instanceof Error ? err.message : '배경을 만들지 못했어요.'); } finally { setBusy(''); }
  };
  const own = getLoungeTheme(ownTheme);
  return <>
    {!controlled && <button type="button" ref={trigger} className="lounge-background-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} title="배경 바꾸기"><ImageIcon size={16} /><span>배경</span></button>}
    {open && <>
      <div className="lounge-background-backdrop" onClick={() => { if (!busy) close(); }} />
      <section className="lounge-background-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><b id={titleId}>배경 바꾸기</b><button type="button" onClick={close} disabled={Boolean(busy)} aria-label="닫기"><X size={18} /></button></header>
        <p className="lounge-background-note">장면이 옮겨 가면 배경도 바꿔 보세요. 캐릭터도 그곳에 함께 있는 것처럼 이어 가요.</p>
        <div className="lounge-background-grid" role="radiogroup" aria-label="배경 고르기">
          <button type="button" role="radio" aria-checked={selected === null} disabled={Boolean(busy)} onClick={() => void pick(null)} style={tile(own.image)}>
            <span>{own.name}<small>이 대화의 기본</small></span>{selected === null && <Check size={16} />}
          </button>
          {loungeThemes.filter(theme => theme.id !== ownTheme).map(theme => <button key={theme.id} type="button" role="radio" aria-checked={selected === theme.id} disabled={Boolean(busy)} onClick={() => void pick(theme.id)} style={tile(theme.image)}>
            <span>{theme.name}</span>{selected === theme.id && <Check size={16} />}
          </button>)}
        </div>
        <form className="lounge-background-make" onSubmit={event => { event.preventDefault(); void make(); }}>
          <label htmlFor={`${titleId}-prompt`}><Sparkles size={14} /> 원하는 장소를 직접 적어서 만들기</label>
          <textarea id={`${titleId}-prompt`} rows={2} maxLength={300} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="예: 비 오는 밤, 촛불이 켜진 작은 이탈리안 레스토랑의 창가 자리" disabled={busy === 'make'} />
          <div><small>인물 없이 장소만 그려요 · 하루 {loungeBackgroundDaily}장까지{selected === 'image' && current?.prompt ? ' · 지금은 직접 만든 배경' : ''}</small>
            <button type="submit" disabled={prompt.trim().length < 4 || Boolean(busy)}>{busy === 'make' ? <><LoaderCircle size={15} className="lounge-spin" />만드는 중… 30초쯤 걸려요</> : '배경 만들기'}</button></div>
        </form>
        {error && <p className="lounge-background-error" role="alert">{error}</p>}
      </section>
    </>}
  </>;
}
