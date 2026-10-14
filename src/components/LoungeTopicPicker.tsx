import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Crown, LoaderCircle, Pencil, Sparkles, UserRoundCog, X } from 'lucide-react';
import { loungeTopicLimit } from '../lib/loungeTopics';
import type { LoungeHostId } from '../lib/lounge';
import { loungeCharacters } from '../lib/loungeCharacters';

export type LoungeTopicPickerProps = {
  topic: string | null; source: 'ai' | 'member' | null; setBy: string | null; suggestions: string[] | null; hostName: string; disabled: boolean;
  /** Only the owner (who opened the room, or took it over) changes the topic and the character. */
  isOwner: boolean; ownerName: string | null; hostId: LoungeHostId;
  onSuggest: () => Promise<void>; onSet: (topic: string, source: 'ai' | 'member') => Promise<void>; onHostChange: (host: LoungeHostId) => Promise<void>;
};
/**
 * On a phone the on-screen keyboard covers the bottom of the page and the room's own bars sit above the field, so the
 * topic is typed in a sheet fixed to the visible bottom edge, lifted by the height of the keyboard.
 */
const narrowScreen = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
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
function TopicSheet({ title, draft, busy, disabled, onChange, onSubmit, onCancel }: { title: string; draft: string; busy: boolean; disabled: boolean; onChange: (value: string) => void; onSubmit: () => void; onCancel: () => void }) {
  const inset = useKeyboardInset();
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', close); };
  }, [onCancel]);
  return createPortal(<div className="lounge-topic-sheet-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <form className="lounge-topic-sheet" role="dialog" aria-modal="true" aria-label={title} style={{ bottom: inset }} onSubmit={event => { event.preventDefault(); if (draft.trim()) onSubmit(); }}>
      <div className="lounge-topic-sheet-head"><b>{title}</b><button type="button" onClick={onCancel} aria-label="닫기"><X size={18} /></button></div>
      <input value={draft} maxLength={loungeTopicLimit} autoFocus enterKeyHint="done" disabled={disabled} aria-label="이야기하고 싶은 주제" placeholder="이야기하고 싶은 주제를 적어 주세요" onChange={event => onChange(event.target.value)} />
      <div className="lounge-topic-sheet-foot"><small>{draft.length}/{loungeTopicLimit}</small><button type="submit" disabled={disabled || busy || !draft.trim()}>{busy ? <LoaderCircle size={15} className="lounge-spin" /> : <Check size={15} />}이 주제로 정하기</button></div>
    </form>
  </div>, document.body);
}

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/** The owner of a room in a place sets its topic (picked from the character's suggestions or typed) and its character. */
export function LoungeTopicPicker({ topic, source, setBy, suggestions, hostName, disabled, isOwner, ownerName, hostId, onSuggest, onSet, onHostChange }: LoungeTopicPickerProps) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [choosingHost, setChoosingHost] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'suggest' | 'set' | 'host' | null>(null);
  const [error, setError] = useState('');
  const run = async (kind: 'suggest' | 'set' | 'host', task: () => Promise<void>) => {
    if (busy || disabled) return;
    setBusy(kind); setError('');
    try { await task(); } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  };
  const choose = (value: string, from: 'ai' | 'member') => void run('set', async () => { await onSet(value.trim(), from); setOpen(false); setTyping(false); setDraft(''); });
  const credit = topic && setBy ? source === 'ai' ? `${hostName}의 추천 · ${setBy}님이 골랐어요` : `${setBy}님이 정했어요` : '';
  // Others see who owns the room; the table header already shows the topic.
  if (!isOwner) return <section className="lounge-topic-picker compact" aria-label="지금 이야기할 주제">
    <small><Crown size={12} aria-hidden="true" /> {ownerName ? `방장 ${ownerName}님이 주제와 캐릭터를 정해요` : '방장이 주제와 캐릭터를 정해요'}</small>
  </section>;
  if (choosingHost) return <section className="lounge-topic-picker" aria-label="대화를 도와줄 캐릭터">
    <div className="lounge-topic-picker-head"><span>방장 · 캐릭터 바꾸기</span><strong>누가 대화를 도와줄까요?</strong></div>
    <div className="lounge-topic-suggestions" role="group" aria-label="캐릭터">
      {loungeCharacters.map(character => <button type="button" key={character.id} aria-pressed={character.id === hostId} disabled={disabled || Boolean(busy)}
        onClick={() => void run('host', async () => { if (character.id !== hostId) await onHostChange(character.id); setChoosingHost(false); })}>{character.name}<small>{character.job}</small></button>)}
    </div>
    <div className="lounge-topic-actions">{busy === 'host' && <LoaderCircle size={14} className="lounge-spin" />}<button type="button" className="quiet" onClick={() => setChoosingHost(false)}>그대로 두기</button></div>
    {error && <p className="lounge-topic-error" role="alert">{error}</p>}
  </section>;
  const editing = !topic || open;
  if (!editing) return <section className="lounge-topic-picker compact" aria-label="지금 이야기할 주제">
    <small><Crown size={12} aria-hidden="true" /> 내가 방장이에요{credit && ` · ${credit}`}</small>
    <button type="button" className="lounge-topic-change" disabled={disabled} onClick={() => setOpen(true)}>주제 바꾸기</button>
    <button type="button" className="lounge-topic-change" disabled={disabled} onClick={() => setChoosingHost(true)}><UserRoundCog size={13} />캐릭터 바꾸기</button>
    {error && <p className="lounge-topic-error" role="alert">{error}</p>}
  </section>;
  return <section className="lounge-topic-picker" aria-label="지금 이야기할 주제">
    <div className="lounge-topic-picker-head">
      <span>방장 · 지금 이야기</span>
      <strong>{topic ?? '아직 정한 주제가 없어요'}</strong>
      {credit && <small>{credit}</small>}
    </div>
    {Boolean(suggestions?.length) && <div className="lounge-topic-suggestions" role="group" aria-label={`${hostName}의 추천 주제`}>
        {suggestions!.map(item => <button type="button" key={item} disabled={disabled || Boolean(busy)} onClick={() => choose(item, 'ai')}>{item}</button>)}
      </div>}
      {typing && narrowScreen() ? <TopicSheet title={topic ? '주제 바꾸기' : '주제 정하기'} draft={draft} busy={busy === 'set'} disabled={disabled} onChange={setDraft} onSubmit={() => choose(draft, 'member')} onCancel={() => { setTyping(false); setDraft(''); }} /> : null}
      {typing && !narrowScreen() ? <form className="lounge-topic-form" onSubmit={event => { event.preventDefault(); if (draft.trim()) choose(draft, 'member'); }}>
        <input value={draft} maxLength={loungeTopicLimit} autoFocus disabled={disabled} aria-label="이야기하고 싶은 주제" placeholder="이야기하고 싶은 주제를 적어 주세요" onChange={event => setDraft(event.target.value)} />
        <button type="submit" disabled={disabled || Boolean(busy) || !draft.trim()} aria-label="이 주제로 정하기">{busy === 'set' ? <LoaderCircle size={15} className="lounge-spin" /> : <Check size={15} />}</button>
        <button type="button" onClick={() => { setTyping(false); setDraft(''); }} aria-label="직접 입력 취소"><X size={15} /></button>
      </form> : null}
      {!typing || narrowScreen() ? <div className="lounge-topic-actions">
        <button type="button" disabled={disabled || Boolean(busy)} onClick={() => void run('suggest', onSuggest)}>{busy === 'suggest' ? <LoaderCircle size={14} className="lounge-spin" /> : <Sparkles size={14} />}{suggestions?.length ? '다른 추천 받기' : `${hostName}에게 추천받기`}</button>
        <button type="button" disabled={disabled || Boolean(busy)} onClick={() => setTyping(true)}><Pencil size={14} />직접 정하기</button>
        {topic && <button type="button" className="quiet" onClick={() => { setOpen(false); setTyping(false); }}>그대로 두기</button>}
      </div> : null}
    {!topic && <p className="lounge-topic-hint">방장인 내가 주제를 정해요. 다른 참가자들은 방 목록에서 이 주제를 보고 들어와요.</p>}
    {error && <p className="lounge-topic-error" role="alert">{error}</p>}
  </section>;
}
