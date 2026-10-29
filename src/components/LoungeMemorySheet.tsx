import { useEffect, useId, useState } from 'react';
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { addMyLoungeMemory, editMyLoungeMemory, forgetMyLoungeEvent, forgetMyLoungeMemory, getMyLoungeMemory, type LoungeMemoryBook, type LoungeMemoryItem } from '../lib/loungeApi';
import { getRelationshipConfig, memoryKindLabels, relationshipEventLabels, type RelationshipEventType } from '../lib/relationship';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
const day = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
const kinds = Object.entries(memoryKindLabels) as Array<[string, string]>;
type Tab = 'memories' | 'events' | 'timeline';
/** The name with 이 or 가, by whether its last syllable ends in a consonant. */
const subject = (name: string) => { const code = name.charCodeAt(name.length - 1) - 0xac00; return `${name}${code >= 0 && code < 11172 && code % 28 ? '이' : '가'}`; };

/**
 * What a one-to-one character keeps of the member (2026-10-29), from the chat's settings: its memories of them (read,
 * corrected, forgotten, or added by the member), the important moments of the relationship, and how the relationship
 * went stage by stage. The character brings up the memories that fit what is being talked about (6 to 8 a reply).
 */
export function LoungeMemorySheet({ characterId, characterName, onClose, sample }: { characterId: string; characterName: string; onClose: () => void; /** The preview's example: shown instead of the member's, and not changed. */ sample?: LoungeMemoryBook }) {
  const [book, setBook] = useState<LoungeMemoryBook | null>(sample ?? null);
  const [tab, setTab] = useState<Tab>('memories');
  const [editing, setEditing] = useState<{ id?: string; kind: string; summary: string; follow_up: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const titleId = useId();
  const config = getRelationshipConfig(characterId);
  const stageLabel = (id: string | null | undefined) => config?.stages.find(stage => stage.id === id)?.label ?? id ?? '';
  const load = () => getMyLoungeMemory(characterId).then(result => setBook(result ?? { memories: [], relationship: null, milestones: [], limit: 40 }), err => { setBook({ memories: [], relationship: null, milestones: [], limit: 40 }); setError(errorText(err)); });
  useEffect(() => { if (!sample) void load(); }, [characterId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  const run = async (key: string, task: () => Promise<unknown>) => {
    if (sample) { setError('미리보기에서는 바꿀 수 없어요. 실제 대화에서 고칠 수 있어요.'); return false; }
    setBusy(key); setError('');
    try { await task(); await load(); return true; } catch (err) { setError(errorText(err)); return false; } finally { setBusy(''); }
  };
  const save = async () => {
    if (!editing || editing.summary.trim().length < 2) return;
    const done = await run('save', () => editing.id ? editMyLoungeMemory(editing.id, editing.summary, editing.follow_up) : addMyLoungeMemory(characterId, editing.kind, editing.summary, editing.follow_up));
    if (done) setEditing(null);
  };
  const forget = (memory: LoungeMemoryItem) => { if (window.confirm('이 기억을 지울까요? 캐릭터가 더는 떠올리지 않아요.')) void run(memory.id, () => forgetMyLoungeMemory(memory.id)); };
  const events = [...(book?.relationship?.events ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const editor = editing && <form className="lounge-memory-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
    {!editing.id && <label><span>종류</span><select value={editing.kind} onChange={event => setEditing({ ...editing, kind: event.target.value })}>{kinds.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}
    <label><span>기억</span><textarea rows={2} maxLength={160} value={editing.summary} onChange={event => setEditing({ ...editing, summary: event.target.value })} placeholder="예: 다음 달에 제주도로 혼자 여행을 가요" autoFocus /></label>
    <label><span>다음에 물어볼 것 <small>선택</small></span><input maxLength={120} value={editing.follow_up} onChange={event => setEditing({ ...editing, follow_up: event.target.value })} placeholder="예: 여행은 어땠는지" /></label>
    <div><button type="button" onClick={() => setEditing(null)} disabled={busy === 'save'}>취소</button><button type="submit" className="primary" disabled={editing.summary.trim().length < 2 || busy === 'save'}>{busy === 'save' ? <LoaderCircle size={15} className="lounge-spin" /> : <Check size={15} />}저장</button></div>
  </form>;
  return <>
    <div className="lounge-background-backdrop" onClick={() => { if (!busy) onClose(); }} />
    <section className="lounge-background-sheet lounge-memory-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><b id={titleId}>{characterName}의 기억</b><button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="닫기"><X size={18} /></button></header>
      <div className="lounge-memory-tabs" role="tablist">
        {([['memories', '기억'], ['events', '중요한 순간'], ['timeline', '관계의 흐름']] as Array<[Tab, string]>).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {!book ? <p className="lounge-memory-empty"><LoaderCircle size={15} className="lounge-spin" /> 불러오는 중…</p> : <>
        {tab === 'memories' && <div className="lounge-memory-panel">
          <p className="lounge-memory-note">{subject(characterName)} 기억하는 나에 대한 이야기예요. 대화할 때 지금 이야기와 가까운 것을 6~8개쯤 떠올려 자연스럽게 꺼내요. 틀린 건 고치고, 잊었으면 하는 건 지울 수 있어요. ({book.memories.length}/{book.limit})</p>
          {book.memories.length ? <ul className="lounge-memory-list">{book.memories.map(memory => <li key={memory.id}>
            {editing?.id === memory.id ? editor : <>
              <div><span className="lounge-memory-kind">{memoryKindLabels[memory.kind as keyof typeof memoryKindLabels] ?? memory.kind}</span><p>{memory.summary}</p>{memory.follow_up && <small>다음에 물어볼 것: {memory.follow_up}</small>}<time>{day(memory.updated_at)}</time></div>
              <div className="lounge-memory-actions">
                <button type="button" title="고치기" disabled={Boolean(busy)} onClick={() => setEditing({ id: memory.id, kind: memory.kind, summary: memory.summary, follow_up: memory.follow_up ?? '' })}><Pencil size={14} /></button>
                <button type="button" title="지우기" disabled={Boolean(busy)} onClick={() => forget(memory)}>{busy === memory.id ? <LoaderCircle size={14} className="lounge-spin" /> : <Trash2 size={14} />}</button>
              </div>
            </>}
          </li>)}</ul> : <p className="lounge-memory-empty">아직 기억하는 이야기가 없어요. 다음에도 이어 갈 만한 이야기를 나누면 여기에 남아요.</p>}
          {editing && !editing.id ? editor : <button type="button" className="lounge-memory-add" disabled={Boolean(busy) || Boolean(editing)} onClick={() => setEditing({ kind: 'preference', summary: '', follow_up: '' })}><Plus size={15} /> 기억 직접 남기기</button>}
          <p className="lounge-memory-fine">건강, 종교, 연락처 같은 민감한 이야기는 기억하지 않아요.</p>
        </div>}
        {tab === 'events' && <div className="lounge-memory-panel">
          <p className="lounge-memory-note">둘 사이를 움직인 순간들이에요. {characterName}의 마음과 태도에 남아 있어요.</p>
          {events.length ? <ul className="lounge-memory-list">{events.map(event => <li key={`${event.at}-${event.summary}`}>
            <div><span className="lounge-memory-kind">{relationshipEventLabels[event.type as RelationshipEventType] ?? event.type}</span><p>{event.summary}</p><time>{day(event.at)}</time></div>
            <div className="lounge-memory-actions"><button type="button" title="지우기" disabled={Boolean(busy)} onClick={() => { if (window.confirm('이 순간을 지울까요?')) void run(`event-${event.at}`, () => forgetMyLoungeEvent(characterId, event.at, event.summary)); }}>{busy === `event-${event.at}` ? <LoaderCircle size={14} className="lounge-spin" /> : <Trash2 size={14} />}</button></div>
          </li>)}</ul> : <p className="lounge-memory-empty">아직 남은 순간이 없어요. 대화가 깊어지면 여기에 쌓여요.</p>}
        </div>}
        {tab === 'timeline' && <div className="lounge-memory-panel">
          {book.relationship ? <ol className="lounge-memory-timeline">
            <li><b>처음 만난 날</b><span>{stageLabel(book.milestones[0]?.from ?? config?.stages[0]?.id)}</span><time>{day(book.relationship.started_at)}</time></li>
            {book.milestones.filter(item => item.from).map(item => {
              const stages = config?.stages.map(stage => stage.id) ?? [];
              const up = stages.indexOf(item.to) > stages.indexOf(item.from ?? '');
              return <li key={item.at} className={up ? 'up' : 'down'}><b>{up ? '한 걸음 가까워졌어요' : '조금 멀어졌어요'}</b><span>{stageLabel(item.from)} → {stageLabel(item.to)}</span><time>{day(item.at)}</time></li>;
            })}
            <li className="now"><b>지금</b><span>{stageLabel(book.relationship.stage)} · 함께 나눈 대화 {book.relationship.turn_count}번</span><time>{day(book.relationship.last_at)}</time></li>
          </ol> : <p className="lounge-memory-empty">아직 쌓인 관계가 없어요. 이야기를 나누면 여기에서 둘의 흐름을 볼 수 있어요.</p>}
          {book.relationship && !book.milestones.length && <p className="lounge-memory-fine">단계가 바뀐 날은 이번 업데이트부터 기록돼요.</p>}
        </div>}
      </>}
      {error && <p className="lounge-background-error" role="alert">{error}</p>}
    </section>
  </>;
}
