import { useState } from 'react';
import { Check, LoaderCircle, Pencil, Sparkles, X } from 'lucide-react';
import { loungeTopicLimit } from '../lib/loungeTopics';

export type LoungeTopicPickerProps = {
  topic: string | null; source: 'ai' | 'member' | null; setBy: string | null; suggestions: string[] | null; hostName: string; disabled: boolean;
  onSuggest: () => Promise<void>; onSet: (topic: string, source: 'ai' | 'member') => Promise<void>;
};
const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/** Anyone at a space table sets the topic: picked from the character's suggestions or typed. There is no host. */
export function LoungeTopicPicker({ topic, source, setBy, suggestions, hostName, disabled, onSuggest, onSet }: LoungeTopicPickerProps) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'suggest' | 'set' | null>(null);
  const [error, setError] = useState('');
  const run = async (kind: 'suggest' | 'set', task: () => Promise<void>) => {
    if (busy || disabled) return;
    setBusy(kind); setError('');
    try { await task(); } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  };
  const choose = (value: string, from: 'ai' | 'member') => void run('set', async () => { await onSet(value.trim(), from); setOpen(false); setTyping(false); setDraft(''); });
  const editing = !topic || open;
  const credit = topic && setBy ? source === 'ai' ? `${hostName}의 추천 · ${setBy}님이 골랐어요` : `${setBy}님이 정했어요` : '';
  // Once a topic is set the table header shows it; the panel folds to one line.
  if (!editing) return <section className="lounge-topic-picker compact" aria-label="지금 이야기할 주제">
    <small>{credit}</small>
    <button type="button" className="lounge-topic-change" disabled={disabled} onClick={() => setOpen(true)}>주제 바꾸기</button>
  </section>;
  return <section className="lounge-topic-picker" aria-label="지금 이야기할 주제">
    <div className="lounge-topic-picker-head">
      <span>지금 이야기</span>
      <strong>{topic ?? '아직 정한 주제가 없어요'}</strong>
      {credit && <small>{credit}</small>}
    </div>
    {Boolean(suggestions?.length) && <div className="lounge-topic-suggestions" role="group" aria-label={`${hostName}의 추천 주제`}>
        {suggestions!.map(item => <button type="button" key={item} disabled={disabled || Boolean(busy)} onClick={() => choose(item, 'ai')}>{item}</button>)}
      </div>}
      {typing ? <form className="lounge-topic-form" onSubmit={event => { event.preventDefault(); if (draft.trim()) choose(draft, 'member'); }}>
        <input value={draft} maxLength={loungeTopicLimit} autoFocus disabled={disabled} aria-label="이야기하고 싶은 주제" placeholder="이야기하고 싶은 주제를 적어 주세요" onChange={event => setDraft(event.target.value)} />
        <button type="submit" disabled={disabled || Boolean(busy) || !draft.trim()} aria-label="이 주제로 정하기">{busy === 'set' ? <LoaderCircle size={15} className="lounge-spin" /> : <Check size={15} />}</button>
        <button type="button" onClick={() => { setTyping(false); setDraft(''); }} aria-label="직접 입력 취소"><X size={15} /></button>
      </form> : <div className="lounge-topic-actions">
        <button type="button" disabled={disabled || Boolean(busy)} onClick={() => void run('suggest', onSuggest)}>{busy === 'suggest' ? <LoaderCircle size={14} className="lounge-spin" /> : <Sparkles size={14} />}{suggestions?.length ? '다른 추천 받기' : `${hostName}에게 추천받기`}</button>
        <button type="button" disabled={disabled || Boolean(busy)} onClick={() => setTyping(true)}><Pencil size={14} />직접 정하기</button>
        {topic && <button type="button" className="quiet" onClick={() => { setOpen(false); setTyping(false); }}>그대로 두기</button>}
      </div>}
    {!topic && <p className="lounge-topic-hint">주제 없이 그냥 이야기해도 괜찮아요. 누구나 정하거나 바꿀 수 있어요.</p>}
    {error && <p className="lounge-topic-error" role="alert">{error}</p>}
  </section>;
}
