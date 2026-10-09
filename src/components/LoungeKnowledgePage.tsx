import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Check, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { loungeHosts } from '../lib/lounge';
import { getLoungeCharacter } from '../lib/loungeCharacters';
import { loungeExperienceCategories, loungeExperienceCategoryLabels, loungeKnowledgeKinds, loungeKnowledgeLimits, type LoungeExperienceCategory, type LoungeKnowledgeKind } from '../lib/loungeKnowledge';
import { deleteLoungeKnowledge, listLoungeKnowledge, saveLoungeKnowledge, type LoungeKnowledgeRow } from '../lib/loungeKnowledgeApi';
import './LoungeKnowledge.css';

const kindLabel: Record<LoungeKnowledgeKind, string> = { knowledge: '전문 지식', experience: '겪은 일' };
const kindHint: Record<LoungeKnowledgeKind, string> = {
  knowledge: '사실과 노하우. 질문과 가까울 때 캐릭터가 자기 지식처럼 꺼내 써요. 금융·법령·의료처럼 시간이 지나면 달라지는 내용은 "시한성"으로 표시하고 기준 날짜를 적어 주세요.',
  experience: '그 사람이 겪은 일화(가상의 경험). 한 번에 하나만 나오고, 한 번 들은 사람에게는 다시 나오지 않아요. 한 일화에는 한 가지 사건만 담고, 얻은 교훈을 같이 적어 주세요. 일화 속 수치와 결과는 현실의 근거로 쓰이지 않아요.',
};
type Draft = { id?: string; kind: LoungeKnowledgeKind; title: string; content: string; active: boolean; tags: string; lesson: string; category: LoungeExperienceCategory | ''; sourceNote: string; asOf: string; timeSensitive: boolean };
const emptyDraft = (kind: LoungeKnowledgeKind = 'knowledge'): Draft => ({ kind, title: '', content: '', active: true, tags: '', lesson: '', category: '', sourceNote: '', asOf: '', timeSensitive: false });
const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 뒤 다시 시도해 주세요.';
const tagList = (tags: string) => [...new Set(tags.split(/[,\n]/).map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))];

/** The super administrator's screen for each character's professional knowledge and experience. */
export function LoungeKnowledgePage() {
  const [character, setCharacter] = useState<string>(loungeHosts[0].id);
  const [loaded, setLoaded] = useState<{ character: string; rows: LoungeKnowledgeRow[]; error: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [filter, setFilter] = useState<'all' | LoungeKnowledgeKind>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const formId = useId();
  const name = (id: string) => getLoungeCharacter(id)?.name ?? id;

  // The list for the chosen character; switching shows the loading state until its own list arrives.
  useEffect(() => {
    let cancelled = false;
    listLoungeKnowledge(character).then(rows => ({ rows, error: '' }), err => ({ rows: [] as LoungeKnowledgeRow[], error: errorText(err) }))
      .then(result => { if (!cancelled) setLoaded({ character, ...result }); });
    return () => { cancelled = true; };
  }, [character, version]);
  const rows = loaded?.character === character ? loaded.rows : null;
  const reload = () => setVersion(value => value + 1);

  const visible = useMemo(() => (rows ?? []).filter(row => filter === 'all' || row.kind === filter), [rows, filter]);
  const counts = useMemo(() => ({ knowledge: (rows ?? []).filter(row => row.kind === 'knowledge').length, experience: (rows ?? []).filter(row => row.kind === 'experience').length }), [rows]);
  const experience = draft.kind === 'experience';
  const contentLimit = experience ? loungeKnowledgeLimits.experience : loungeKnowledgeLimits.knowledge;
  const tags = tagList(draft.tags);
  const valid = draft.title.trim().length > 0 && draft.title.trim().length <= loungeKnowledgeLimits.title && draft.content.trim().length > 0 && draft.content.trim().length <= contentLimit
    && tags.length <= loungeKnowledgeLimits.tags && tags.every(tag => tag.length <= loungeKnowledgeLimits.tag) && draft.lesson.trim().length <= loungeKnowledgeLimits.lesson && (!draft.timeSensitive || Boolean(draft.asOf));
  const entryOf = (value: Draft) => ({ ...(value.id ? { id: value.id } : {}), character, kind: value.kind, title: value.title.trim(), content: value.content.trim(), active: value.active,
    tags: tagList(value.tags), lesson: value.lesson.trim(), category: value.category, sourceNote: value.sourceNote.trim(), asOf: value.asOf, timeSensitive: value.timeSensitive });
  const draftOf = (row: LoungeKnowledgeRow): Draft => ({ id: row.id, kind: row.kind, title: row.title, content: row.content, active: row.active, tags: row.tags.join(', '), lesson: row.lesson ?? '',
    category: (row.category ?? '') as LoungeExperienceCategory | '', sourceNote: row.source_note ?? '', asOf: row.as_of?.slice(0, 10) ?? '', timeSensitive: row.time_sensitive });

  const choose = (id: string) => { if (id === character) return; setCharacter(id); setDraft(emptyDraft()); setNotice(''); setFilter('all'); };
  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await saveLoungeKnowledge(entryOf(draft));
      setNotice(draft.id ? '수정했어요.' : '추가했어요. 다음 대화부터 반영돼요(최대 1분).');
      setDraft(emptyDraft(draft.kind));
      reload();
    } catch (err) { setError(errorText(err)); }
    finally { setSaving(false); }
  };
  const edit = (row: LoungeKnowledgeRow) => { setDraft(draftOf(row)); setNotice(''); setError(''); document.getElementById(formId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const toggle = async (row: LoungeKnowledgeRow) => {
    setError(''); setNotice('');
    try { await saveLoungeKnowledge(entryOf({ ...draftOf(row), active: !row.active })); reload(); } catch (err) { setError(errorText(err)); }
  };
  const remove = async (row: LoungeKnowledgeRow) => {
    if (!window.confirm(`"${row.title}" 항목을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setError(''); setNotice('');
    try { await deleteLoungeKnowledge(row.id); if (draft.id === row.id) setDraft(emptyDraft()); reload(); } catch (err) { setError(errorText(err)); }
  };

  return <main className="lounge-knowledge">
    <header>
      <Link to="/super-admin" className="lounge-knowledge-back"><ArrowLeft size={15} /> 슈퍼 관리자</Link>
      <h1><BookOpen size={26} aria-hidden="true" /> 캐릭터 지식·경험</h1>
      <p>캐릭터가 전문 분야 질문에 답할 때 쓰는 지식과 겪은 일을 쌓아 두는 곳이에요. 대화마다 질문과 가까운 항목만 골라 쓰기 때문에, 얼마든지 늘려도 응답 비용은 거의 그대로예요. 겪은 일은 한 번에 하나만, 한 번 들려준 사람에게는 다시 말하지 않아요.</p>
    </header>

    <div className="lounge-knowledge-people" role="tablist" aria-label="캐릭터">
      {loungeHosts.map(host => <button key={host.id} type="button" role="tab" aria-selected={host.id === character} onClick={() => choose(host.id)}>
        <img src={host.portrait} alt="" /><span>{name(host.id)}</span>
      </button>)}
    </div>

    <form id={formId} className="lounge-knowledge-form" onSubmit={submit}>
      <h2>{draft.id ? '항목 수정' : `${name(character)}에게 새로 알려 주기`}</h2>
      <aside className="rules" aria-label="작성 규칙">
        <strong>작성할 때 지켜 주세요</strong>
        <ul>
          <li>실제 회사·브랜드·기관·실존 인물·사건의 이름은 쓰지 말고 "한 대기업", "어떤 의뢰인"처럼 일반화해 주세요.</li>
          <li>연락처, 이메일, 인터넷 주소, 주민등록번호 같은 개인정보는 저장되지 않아요.</li>
          <li>겪은 일은 누구의 이야기인지 특정되지 않게, 이 캐릭터의 가상의 경험으로 써 주세요.</li>
          <li>한 항목에는 한 가지 주제만 담아 주세요. 여러 주제를 섞으면 질문과 정확히 연결되지 않아요.</li>
        </ul>
      </aside>
      <fieldset>
        <legend>종류</legend>
        {loungeKnowledgeKinds.map(kind => <label key={kind} className={draft.kind === kind ? 'on' : ''}>
          <input type="radio" name="kind" checked={draft.kind === kind} onChange={() => setDraft({ ...draft, kind })} /> {kindLabel[kind]}
        </label>)}
        <small>{kindHint[draft.kind]}</small>
      </fieldset>
      <label className="field">제목 <em>{draft.title.trim().length}/{loungeKnowledgeLimits.title}</em>
        <input value={draft.title} maxLength={loungeKnowledgeLimits.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="질문과 비교되는 이름이에요. 구체적일수록 잘 찾아요." />
      </label>
      <label className="field">{experience ? '일화' : '내용'} <em>{draft.content.trim().length}/{contentLimit}</em>
        <textarea value={draft.content} maxLength={contentLimit} rows={experience ? 8 : 7} onChange={event => setDraft({ ...draft, content: event.target.value })}
          placeholder={experience ? '한 가지 사건을 무슨 일이 있었고 어떻게 끝났는지까지 써 주세요. 앞뒤 사정을 자세히 적어 둘수록 "그래서 어떻게 됐어요?" 같은 이어지는 질문에도 일관되게 답해요. 대화에서는 필요한 부분만 짧게 말해요.' : '한 항목에는 한 가지 주제만 담아 주세요. 길면 여러 항목으로 나누는 편이 더 정확히 찾아요.'} />
      </label>
      {experience && <>
        <label className="field">교훈 <em>{draft.lesson.trim().length}/{loungeKnowledgeLimits.lesson}</em>
          <input value={draft.lesson} maxLength={loungeKnowledgeLimits.lesson} onChange={event => setDraft({ ...draft, lesson: event.target.value })} placeholder="이 일에서 얻은 한 줄. 캐릭터가 일화를 든 뒤 이어 가는 말의 근거가 돼요." />
        </label>
        <label className="field">경험의 종류
          <select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as LoungeExperienceCategory | '' })}>
            <option value="">선택 안 함</option>
            {loungeExperienceCategories.map(category => <option key={category} value={category}>{loungeExperienceCategoryLabels[category]}</option>)}
          </select>
        </label>
      </>}
      <label className="field">태그 <em>{tags.length}/{loungeKnowledgeLimits.tags}</em>
        <input value={draft.tags} onChange={event => setDraft({ ...draft, tags: event.target.value })} placeholder="쉼표로 구분. 예: 반대신문, 증인, 후회" />
      </label>
      {!experience && <div className="grid">
        <label className="field">출처 메모 <em>{draft.sourceNote.trim().length}/{loungeKnowledgeLimits.sourceNote}</em>
          <input value={draft.sourceNote} maxLength={loungeKnowledgeLimits.sourceNote} onChange={event => setDraft({ ...draft, sourceNote: event.target.value })} placeholder="관리자만 보는 메모. 어디서 확인했는지" />
        </label>
        <label className="field">기준 날짜
          <input type="date" value={draft.asOf} max={new Date().toISOString().slice(0, 10)} onChange={event => setDraft({ ...draft, asOf: event.target.value })} />
        </label>
      </div>}
      {!experience && <label className="check"><input type="checkbox" checked={draft.timeSensitive} onChange={event => setDraft({ ...draft, timeSensitive: event.target.checked })} /> 시한성 지식 (시간이 지나면 달라져요. 기준 날짜 필수)</label>}
      <label className="check"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} /> 대화에 사용</label>
      <div className="actions">
        <button type="submit" className="primary" disabled={!valid || saving}>{saving ? <LoaderCircle size={16} className="spin" /> : draft.id ? <Check size={16} /> : <Plus size={16} />} {draft.id ? '수정 저장' : '추가'}</button>
        {draft.id && <button type="button" onClick={() => setDraft(emptyDraft(draft.kind))}><X size={16} /> 수정 취소</button>}
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {(error || loaded?.error) && <p className="error" role="alert">{error || loaded?.error}</p>}
    </form>

    <section className="lounge-knowledge-list" aria-live="polite">
      <div className="head">
        <h2>{name(character)}의 항목 <small>지식 {counts.knowledge} · 경험 {counts.experience}</small></h2>
        <div role="group" aria-label="종류 보기">
          {(['all', ...loungeKnowledgeKinds] as const).map(item => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === 'all' ? '전체' : kindLabel[item]}</button>)}
        </div>
      </div>
      {!rows ? <p className="empty"><LoaderCircle size={16} className="spin" /> 불러오는 중이에요.</p>
        : !visible.length ? <p className="empty">아직 항목이 없어요. 위에서 첫 항목을 추가해 보세요.</p>
          : <ul>{visible.map(row => <li key={row.id} className={row.active ? '' : 'off'}>
            <div className="meta">
              <span className={`kind ${row.kind}`}>{kindLabel[row.kind]}</span>
              {row.category && <span className="state">{loungeExperienceCategoryLabels[row.category as LoungeExperienceCategory] ?? row.category}</span>}
              {row.time_sensitive && <span className="state sensitive">시한성{row.as_of ? ` · 기준 ${row.as_of.slice(0, 10)}` : ''}</span>}
              {row.kind === 'experience' && <span className="state" title="이 일화를 들은 사람 수(한 번 들은 사람에게는 다시 나오지 않아요)">지금까지 {row.times_shown}명에게</span>}
              {!row.active && <span className="state">사용 안 함</span>}
              {!row.embedded && <span className="state warn">검색 준비 안 됨 · 다시 저장해 주세요</span>}
            </div>
            <h3>{row.title}</h3>
            <p>{row.content}</p>
            {row.lesson && <p className="lesson">교훈 · {row.lesson}</p>}
            {row.tags.length > 0 && <p className="tags">{row.tags.map(tag => `#${tag}`).join(' ')}</p>}
            {row.source_note && <p className="note">출처 메모 · {row.source_note}</p>}
            <div className="row-actions">
              <button type="button" onClick={() => edit(row)}><Pencil size={14} /> 수정</button>
              <button type="button" onClick={() => void toggle(row)}>{row.active ? '사용 중지' : '사용'}</button>
              <button type="button" className="danger" onClick={() => void remove(row)}><Trash2 size={14} /> 삭제</button>
            </div>
          </li>)}</ul>}
    </section>
  </main>;
}
