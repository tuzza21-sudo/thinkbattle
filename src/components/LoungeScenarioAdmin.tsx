import { useEffect, useState } from 'react';
import { BookOpen, CircleCheck, Plus, Save, Trash2 } from 'lucide-react';
import { deleteLoungeScenario, listLoungeScenariosForAdmin, saveLoungeScenario } from '../lib/superAdmin';
import { loungeScenarioLimits, type LoungeScenarioRow } from '../lib/loungeScenarios';
import { loungeHosts, loungeThemes } from '../lib/lounge';
import { loungeCharacters } from '../lib/loungeCharacters';

const errorText = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
type Draft = Omit<LoungeScenarioRow, 'id'> & { id: string | null };
const blank = (characterId: LoungeScenarioRow['character_id']): Draft => ({ id: null, character_id: characterId, title: '', hook: '', prologue: '', user_role: '', relationship: '', place: '', theme: 'cocktailbar', sort: 0, active: true });
const nameOf = (id: string) => loungeCharacters.find(character => character.id === id)?.name ?? id;
const field = { display: 'grid', gap: 4, fontSize: 13 } as const;

/**
 * The stories members can start with a character: add, change, hide (inactive) or delete. A room already started keeps
 * its own copy of the story, so changes apply to new starts only.
 */
export const LoungeScenarioAdmin = () => {
  const [items, setItems] = useState<LoungeScenarioRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const reload = () => listLoungeScenariosForAdmin().then(setItems).catch(reason => setNotice({ type: 'error', message: errorText(reason) }));
  useEffect(() => { void reload(); }, []);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(previous => previous && { ...previous, [key]: value });
  const save = async () => {
    if (!draft) return;
    setBusy(true); setNotice(null);
    try { await saveLoungeScenario(draft); setDraft(null); await reload(); setNotice({ type: 'success', message: `‘${draft.title}’을(를) 저장했습니다.` }); }
    catch (reason) { setNotice({ type: 'error', message: errorText(reason) }); }
    finally { setBusy(false); }
  };
  const remove = async (item: LoungeScenarioRow) => {
    if (!window.confirm(`‘${item.title}’을(를) 지울까요? 이미 시작된 대화는 그대로 이어집니다.`)) return;
    setBusy(true); setNotice(null);
    try { await deleteLoungeScenario(item.id); await reload(); setNotice({ type: 'success', message: `‘${item.title}’을(를) 지웠습니다.` }); }
    catch (reason) { setNotice({ type: 'error', message: errorText(reason) }); }
    finally { setBusy(false); }
  };
  const input = (key: 'title' | 'hook' | 'user_role' | 'relationship' | 'place', label: string) => <label style={field}>{label} <small>({draft![key].length}/{loungeScenarioLimits[key]}자)</small>
    <input value={draft![key]} maxLength={loungeScenarioLimits[key]} onChange={event => set(key, event.target.value)} /></label>;

  return <section className="card admin-panel">
    <div className="super-admin-section-heading"><div><span className="admin-eyebrow">STORIES</span><h2><BookOpen size={20} style={{ verticalAlign: 'middle' }} /> 캐릭터 시나리오</h2></div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setDraft(blank('velvet'))}><Plus size={16} /> 새 시나리오</button></div>
    <p className="admin-lead">캐릭터 페이지의 “함께할 이야기”입니다. 숨기면 회원에게 보이지 않고, 이미 시작된 대화는 바뀌지 않습니다.</p>
    {notice && <div className={`super-admin-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.type === 'success' && <CircleCheck size={18} />}{notice.message}</div>}

    {draft && <article className="super-admin-form-card" style={{ display: 'grid', gap: 10, marginBottom: '1rem' }}>
      <strong>{draft.id ? '시나리오 고치기' : '새 시나리오'}</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10 }}>
        <label style={field}>캐릭터<select value={draft.character_id} onChange={event => set('character_id', event.target.value as Draft['character_id'])}>{loungeHosts.map(host => <option key={host.id} value={host.id}>{nameOf(host.id)}</option>)}</select></label>
        <label style={field}>배경<select value={draft.theme} onChange={event => set('theme', event.target.value as Draft['theme'])}>{loungeThemes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
        <label style={field}>순서<input type="number" value={draft.sort} onChange={event => set('sort', Number(event.target.value) || 0)} /></label>
        <label style={{ ...field, alignContent: 'end' }}><span><input type="checkbox" checked={draft.active} onChange={event => set('active', event.target.checked)} /> 회원에게 보이기</span></label>
      </div>
      {input('title', '제목')}
      {input('hook', '한 줄 소개 (카드에 보임)')}
      <label style={field}>프롤로그 (시작할 때 들려주는 이야기, 2인칭) <small>({draft.prologue.length}/{loungeScenarioLimits.prologue}자)</small>
        <textarea rows={12} value={draft.prologue} maxLength={loungeScenarioLimits.prologue} onChange={event => set('prologue', event.target.value)} /></label>
      {input('user_role', '회원의 역할 (캐릭터의 삶에서 어떤 의미인 사람인지. 전문 지식이 필요 없게)')}
      {input('relationship', '둘의 관계 (지난 인연, 또는 캐릭터의 어떤 모습을 받아 주는 사람인지)')}
      {input('place', '첫 장면의 장소')}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={busy || !draft.title.trim() || draft.prologue.trim().length < 20} onClick={() => void save()}><Save size={16} /> 저장</button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setDraft(null)}>취소</button>
      </div>
    </article>}

    {!items ? <p className="admin-lead">불러오는 중입니다.</p> : !items.length ? <p className="admin-lead">아직 시나리오가 없습니다.</p>
      : loungeHosts.filter(host => items.some(item => item.character_id === host.id)).map(host => <div key={host.id} style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: '0 0 .5rem', fontSize: 15 }}>{nameOf(host.id)}</h3>
        {items.filter(item => item.character_id === host.id).map(item => <article key={item.id} className="super-admin-form-card" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, opacity: item.active ? 1 : .55 }}>
          <div style={{ fontSize: 13, lineHeight: 1.6, minWidth: 0 }}><strong>{item.title}</strong>{!item.active && ' · 숨김'} · 순서 {item.sort}<br /><span>{item.hook}</span></div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setDraft({ ...item })}>고치기</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void remove(item)} aria-label={`${item.title} 지우기`}><Trash2 size={15} /></button>
          </div>
        </article>)}
      </div>)}
  </section>;
};
