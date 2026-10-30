import { useEffect, useId, useRef, useState } from 'react';
import { Check, Image as ImageIcon, LoaderCircle, Sparkles, Wand2, X } from 'lucide-react';
import { getLoungeTheme, loungeBlankScene, loungeThemes, type LoungeRoomBackground, type LoungeThemeId } from '../lib/lounge';
import type { LoungeBackgroundChoice } from '../lib/loungeApi';
import { loadLoungeSharedScenes, type LoungeSharedScene } from '../lib/loungeGallery';
import { loungeBackgroundDaily } from '../lib/loungePhotos';

const tile = (image: string) => ({ backgroundImage: image.includes('gradient(') ? image : `url('${image}')`, backgroundSize: 'cover', backgroundPosition: 'center' });

/**
 * The background of a one-to-one conversation, changed as the story moves: one of the places, the conversation's own,
 * the empty space, a scene other members' conversations made (shared by everyone), one fitted to where the conversation
 * is now (`onMatch`), or a place the member describes (made as an image, a few a day). Opens as a sheet over the room,
 * from its own button or, with `open` and `onOpenChange`, from somewhere else (the chat's settings menu) without the button.
 */
export function LoungeBackgroundPicker({ current, ownTheme, onPick, onMake, onMatch, open: openFromOutside, onOpenChange }: {
  current: LoungeRoomBackground | null; ownTheme: LoungeThemeId;
  onPick: (choice: LoungeBackgroundChoice | null) => Promise<void>; onMake: (prompt: string) => Promise<void>; onMatch?: () => Promise<void>;
  open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [openHere, setOpenHere] = useState(false);
  const controlled = openFromOutside !== undefined;
  const open = controlled ? openFromOutside : openHere;
  const setOpen = (value: boolean) => { if (controlled) onOpenChange?.(value); else setOpenHere(value); };
  const [prompt, setPrompt] = useState(current?.image && !current.scene ? current.prompt ?? '' : '');
  const [busy, setBusy] = useState<'pick' | 'make' | 'match' | ''>('');
  const [error, setError] = useState('');
  const [shared, setShared] = useState<LoungeSharedScene[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadLoungeSharedScenes().then(list => { if (live) setShared(list); });
    return () => { live = false; };
  }, [open]);
  const selected = current?.blank ? 'blank' : current?.scene ? `scene:${current.scene}` : current?.image ? 'image' : current?.theme === ownTheme ? null : current?.theme ?? null;
  const run = async (kind: 'pick' | 'make' | 'match', work: () => Promise<void>, failure: string) => {
    setBusy(kind); setError('');
    try { await work(); close(); } catch (err) { setError(err instanceof Error ? err.message : failure); } finally { setBusy(''); }
  };
  const pick = (choice: LoungeBackgroundChoice | null) => run('pick', () => onPick(choice), '배경을 바꾸지 못했어요.');
  const make = () => {
    const value = prompt.replace(/\s+/g, ' ').trim();
    if (value.length < 4 || busy) return;
    void run('make', () => onMake(value), '배경을 만들지 못했어요.');
  };
  const own = getLoungeTheme(ownTheme);
  return <>
    {!controlled && <button type="button" ref={trigger} className="lounge-background-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} title="배경 바꾸기"><ImageIcon size={16} /><span>배경</span></button>}
    {open && <>
      <div className="lounge-background-backdrop" onClick={() => { if (!busy) close(); }} />
      <section className="lounge-background-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><b id={titleId}>배경 바꾸기</b><button type="button" onClick={close} disabled={Boolean(busy)} aria-label="닫기"><X size={18} /></button></header>
        <p className="lounge-background-note">장면이 옮겨 가면 배경도 바꿔 보세요. 캐릭터도 그곳에 함께 있는 것처럼 이어 가요.</p>
        {onMatch && <button type="button" className="lounge-background-match" disabled={Boolean(busy)} onClick={() => void run('match', onMatch, '장면에 맞는 배경을 찾지 못했어요.')}>
          {busy === 'match' ? <><LoaderCircle size={15} className="lounge-spin" />지금 장면에 맞는 배경을 찾는 중… 없으면 새로 만들어요</> : <><Wand2 size={15} />지금 장면에 맞추기</>}
        </button>}
        <div className="lounge-background-grid" role="radiogroup" aria-label="배경 고르기">
          <button type="button" role="radio" aria-checked={selected === null} disabled={Boolean(busy)} onClick={() => void pick(null)} style={tile(own.image)}>
            <span>{own.name}<small>이 대화의 기본</small></span>{selected === null && <Check size={16} />}
          </button>
          <button type="button" role="radio" aria-checked={selected === 'blank'} disabled={Boolean(busy)} onClick={() => void pick({ blank: true })} style={tile(loungeBlankScene.image)}>
            <span>{loungeBlankScene.name}<small>아무것도 없는 배경</small></span>{selected === 'blank' && <Check size={16} />}
          </button>
          {loungeThemes.filter(theme => theme.id !== ownTheme).map(theme => <button key={theme.id} type="button" role="radio" aria-checked={selected === theme.id} disabled={Boolean(busy)} onClick={() => void pick({ theme: theme.id })} style={tile(theme.image)}>
            <span>{theme.name}</span>{selected === theme.id && <Check size={16} />}
          </button>)}
        </div>
        {shared.length > 0 && <>
          <p className="lounge-background-label">다른 대화에서 만들어진 장면</p>
          <div className="lounge-background-grid" role="radiogroup" aria-label="함께 쓰는 장면 고르기">
            {shared.map(scene => <button key={scene.id} type="button" role="radio" aria-checked={selected === `scene:${scene.id}`} disabled={Boolean(busy)} onClick={() => void pick({ scene: scene.id })} style={tile(scene.url)} title={scene.description}>
              <span>{scene.description.length > 28 ? `${scene.description.slice(0, 27)}…` : scene.description}</span>{selected === `scene:${scene.id}` && <Check size={16} />}
            </button>)}
          </div>
        </>}
        <form className="lounge-background-make" onSubmit={event => { event.preventDefault(); make(); }}>
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
