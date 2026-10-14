import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LoaderCircle, Pencil, Sparkles, X } from 'lucide-react';
import { loungeTopicLimit } from '../lib/loungeTopics';
import type { LoungeHostId } from '../lib/lounge';

export type LoungeTopicPickerProps = {
  topic: string | null; source: 'ai' | 'member' | null; setBy: string | null; suggestions: string[] | null; hostName: string; disabled: boolean;
  /** Only the owner (who opened the room, or took it over) changes the topic. */
  isOwner: boolean; ownerName: string | null; hostId: LoungeHostId;
  onSuggest: () => Promise<void>; onSet: (topic: string, source: 'ai' | 'member') => Promise<void>; onHostChange: (host: LoungeHostId) => Promise<void>;
};
const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/**
 * The sheet is fixed to the visible bottom edge and lifted by the height of the on-screen keyboard, so on a phone neither the
 * keyboard nor the bars of the room hide the field.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    update();
    viewport.addEventListener('resize', update); viewport.addEventListener('scroll', update);
    return () => { viewport.removeEventListener('resize', update); viewport.removeEventListener('scroll', update); };
  }, []);
  return inset;
}

/** The owner of a room in a place sets its topic, picked from the character's suggestions or typed. The button sits in the room's bottom bar. */
export function LoungeTopicPicker({ topic, suggestions, hostName, disabled, isOwner, onSuggest, onSet }: LoungeTopicPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'suggest' | 'set' | null>(null);
  const [error, setError] = useState('');
  const inset = useKeyboardInset();
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', close); };
  }, [open]);
  if (!isOwner) return null;
  const run = async (kind: 'suggest' | 'set', task: () => Promise<void>) => {
    if (busy || disabled) return;
    setBusy(kind); setError('');
    try { await task(); } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  };
  const choose = (value: string, from: 'ai' | 'member') => void run('set', async () => { await onSet(value.trim(), from); setOpen(false); setDraft(''); });
  const title = topic ? '주제 바꾸기' : '주제 정하기';
  return <>
    <button type="button" className="lounge-ask-button lounge-topic-trigger" disabled={disabled} onClick={() => { setOpen(true); setError(''); }}><Pencil size={16} />{title}</button>
    {open && createPortal(<div className="lounge-topic-sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="lounge-topic-sheet" role="dialog" aria-modal="true" aria-label={title} style={{ bottom: inset, maxHeight: `calc(100dvh - ${inset}px - 16px)` }}>
        <div className="lounge-topic-sheet-head"><b>{title}</b><button type="button" onClick={() => setOpen(false)} aria-label="닫기"><X size={18} /></button></div>
        {topic && <p className="lounge-topic-sheet-current"><small>지금 이야기</small>{topic}</p>}
        {Boolean(suggestions?.length) && <div className="lounge-topic-sheet-suggestions" role="group" aria-label={`${hostName}의 추천 주제`}>
          {suggestions!.map(item => <button type="button" key={item} disabled={disabled || Boolean(busy)} onClick={() => choose(item, 'ai')}>{item}</button>)}
        </div>}
        <button type="button" className="lounge-topic-sheet-suggest" disabled={disabled || Boolean(busy)} onClick={() => void run('suggest', onSuggest)}>{busy === 'suggest' ? <LoaderCircle size={14} className="lounge-spin" /> : <Sparkles size={14} />}{suggestions?.length ? '다른 추천 받기' : `${hostName}에게 추천받기`}</button>
        <form className="lounge-topic-sheet-form" onSubmit={event => { event.preventDefault(); if (draft.trim()) choose(draft, 'member'); }}>
          <input value={draft} maxLength={loungeTopicLimit} enterKeyHint="done" disabled={disabled} aria-label="이야기하고 싶은 주제" placeholder="직접 이야기할 주제를 적어 주세요" onChange={event => setDraft(event.target.value)} />
          <button type="submit" disabled={disabled || Boolean(busy) || !draft.trim()}>{busy === 'set' ? <LoaderCircle size={15} className="lounge-spin" /> : <Check size={15} />}정하기</button>
        </form>
        <small className="lounge-topic-sheet-count">{draft.length}/{loungeTopicLimit} · 다른 참가자들은 방 목록에서 이 주제를 보고 들어와요.</small>
        {error && <p className="lounge-topic-error" role="alert">{error}</p>}
      </div>
    </div>, document.body)}
  </>;
}
