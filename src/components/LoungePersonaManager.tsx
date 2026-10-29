import { useEffect, useState } from 'react';
import { Check, LoaderCircle, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { deleteMyLoungePersona, listMyLoungePersonas, saveMyLoungePersona } from '../lib/loungeApi';
import { loungePersonaLimits, type LoungeMemberPersonaRow } from '../lib/loungePersonas';

type Draft = Omit<LoungeMemberPersonaRow, 'id'> & { id?: string };
const empty: Draft = { title: '', call_name: '', job: '', personality: '', details: '', is_default: false };
const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/**
 * The member's personas in the profile: who they are in a one-to-one conversation (a name to be called by, a job, a
 * personality, anything else). Up to five; the default one is used in every conversation unless another is chosen there.
 */
export function LoungePersonaManager() {
  const [personas, setPersonas] = useState<LoungeMemberPersonaRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void listMyLoungePersonas().then(setPersonas, err => { setPersonas([]); setError(errorText(err)); }); }, []);
  const save = async () => {
    if (!draft || !draft.title.trim() || busy) return;
    setBusy('save'); setError('');
    try {
      const saved = await saveMyLoungePersona({ ...draft, title: draft.title.trim() });
      // A new default replaces the old one (the database does the same).
      setPersonas(list => {
        const others = (list ?? []).map(item => saved.is_default && item.id !== saved.id ? { ...item, is_default: false } : item);
        return others.some(item => item.id === saved.id) ? others.map(item => item.id === saved.id ? saved : item) : [...others, saved];
      });
      setDraft(null);
    } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  };
  const remove = async (persona: LoungeMemberPersonaRow) => {
    if (busy || !window.confirm(`'${persona.title}' 페르소나를 지울까요?`)) return;
    setBusy(persona.id); setError('');
    try { await deleteMyLoungePersona(persona.id); setPersonas(list => (list ?? []).filter(item => item.id !== persona.id)); }
    catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  };
  const makeDefault = async (persona: LoungeMemberPersonaRow) => {
    if (busy) return;
    setBusy(persona.id); setError('');
    try {
      const saved = await saveMyLoungePersona({ ...persona, is_default: !persona.is_default });
      setPersonas(list => (list ?? []).map(item => item.id === saved.id ? saved : saved.is_default ? { ...item, is_default: false } : item));
    } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  };
  const field = (key: keyof Omit<Draft, 'id' | 'is_default'>, label: string, placeholder: string, rows = 0) => <label className="form-field">
    <span>{label}{key === 'title' && <em className="lounge-required"> 필수</em>}</span>
    {rows ? <textarea rows={rows} value={draft?.[key] ?? ''} maxLength={loungePersonaLimits[key]} placeholder={placeholder} disabled={busy === 'save'} onChange={event => setDraft(current => current && { ...current, [key]: event.target.value })} />
      : <input value={draft?.[key] ?? ''} maxLength={loungePersonaLimits[key]} placeholder={placeholder} disabled={busy === 'save'} onChange={event => setDraft(current => current && { ...current, [key]: event.target.value })} />}
  </label>;
  if (personas === null) return <p className="lounge-persona-note"><LoaderCircle size={14} className="lounge-spin" /> 페르소나를 불러오는 중…</p>;
  return <div className="lounge-persona-manager">
    <p className="lounge-persona-note">캐릭터와 1:1로 대화할 때의 나예요. 직업과 성격을 적어 두면 캐릭터가 그런 사람으로 대하고, 어울릴 때 먼저 이야기해요. 기본 페르소나는 모든 대화에 쓰이고, 대화 중 설정에서 다른 것으로 바꿀 수 있어요.</p>
    {personas.length > 0 && <ul className="lounge-persona-list">{personas.map(persona => <li key={persona.id} className={persona.is_default ? 'default' : ''}>
      <div><b>{persona.title}{persona.is_default && <small>기본</small>}</b><span>{[persona.call_name && `"${persona.call_name}"`, persona.job, persona.personality].filter(Boolean).join(' · ') || '설정 없음'}</span></div>
      <div className="lounge-persona-actions">
        <button type="button" onClick={() => void makeDefault(persona)} disabled={Boolean(busy)} aria-pressed={persona.is_default} title={persona.is_default ? '기본에서 빼기' : '기본으로 쓰기'}><Star size={15} fill={persona.is_default ? 'currentColor' : 'none'} /></button>
        <button type="button" onClick={() => { setDraft({ ...persona }); setError(''); }} disabled={Boolean(busy)} title="고치기"><Pencil size={15} /></button>
        <button type="button" onClick={() => void remove(persona)} disabled={Boolean(busy)} title="지우기">{busy === persona.id ? <LoaderCircle size={15} className="lounge-spin" /> : <Trash2 size={15} />}</button>
      </div>
    </li>)}</ul>}
    {draft ? <form className="lounge-account-form lounge-persona-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      {field('title', '페르소나 이름', '예: 회사원 지수, 여행 작가 모드')}
      {field('call_name', '캐릭터가 부를 이름', '비우면 닉네임으로 불러요')}
      {field('job', '직업', '예: 스타트업 마케터, 대학원생')}
      {field('personality', '성격', '예: 낯을 가리지만 친해지면 장난이 많아요. 말은 짧고 솔직한 편', 2)}
      {field('details', '그 밖의 설정', '예: 28살, 고양이 두 마리, 주말엔 등산. 요즘 이직을 고민 중', 3)}
      <label className="lounge-presence-check"><input type="checkbox" checked={draft.is_default} onChange={event => setDraft({ ...draft, is_default: event.target.checked })} /><span>기본 페르소나로 쓰기<small>모든 1:1 대화에서 이 페르소나로 시작해요.</small></span></label>
      <div className="lounge-persona-form-actions">
        <button type="button" className="avatar-text-button" onClick={() => setDraft(null)} disabled={busy === 'save'}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={!draft.title.trim() || busy === 'save'}>{busy === 'save' ? <LoaderCircle size={16} className="lounge-spin" /> : <Check size={16} />}저장</button>
      </div>
    </form>
      : personas.length < loungePersonaLimits.count && <button type="button" className="lounge-persona-add" onClick={() => { setDraft({ ...empty, is_default: personas.length === 0 }); setError(''); }}><Plus size={15} /> 페르소나 만들기 <small>{personas.length}/{loungePersonaLimits.count}</small></button>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </div>;
}
