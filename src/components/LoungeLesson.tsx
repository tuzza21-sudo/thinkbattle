import { useEffect, useId, useRef, useState } from 'react';
import { BookOpen, FileUp, GraduationCap, LoaderCircle, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { startLoungeScenario } from '../lib/loungeApi';
import { addLoungeLessonWords, deleteLoungeLessonItem, importLoungeLessonWords, loadLoungeLessonBook, makeLoungeLessonSituation, setLoungeLessonLevel, type LoungeLessonBook } from '../lib/loungeLessonApi';
import { readLoungeLessonFile } from '../lib/loungeLessonFile';
import { getLoungeCharacter, koreanSubject } from '../lib/loungeCharacters';
import { loungeTutorOf, loungeTutors, loungeLessonLevels, loungeLessonStageLabel, type LoungeLessonItem, type LoungeLessonLevel } from '../lib/loungeLesson';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
const shortDay = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '';
const sourceLabel: Record<string, string> = { mine: '내가 넣음', tutor: '튜터 표현', upgrade: '고친 문장에서', situation: '내 상황' };
type Tab = 'words' | 'situation' | 'notes';
type FileWords = { name: string; words: Array<{ expression: string; meaning: string; situation: string }> };

/** The button of a lesson room, above the composer: the member's expressions and the corrections (2026-11-25). */
export function LoungeLessonBar({ tutorName, roomId }: { tutorName: string; roomId: string }) {
  const [open, setOpen] = useState(false);
  return <div className="lounge-lesson-bar">
    <button type="button" className="lounge-lesson-button" onClick={() => setOpen(true)}><BookOpen size={15} /> 단어장 · 상황</button>
    {open && <LoungeLessonSheet tutorName={tutorName} roomId={roomId} onClose={() => setOpen(false)} />}
  </div>;
}

/**
 * The member's English in a lesson: the expressions they put in (or the tutor gave, or a correction kept), where each
 * stands from "새 표현" to "내 것", the corrections of the last lessons, and the level. The stages move only when the
 * member says the expression in a lesson; they are not edited here.
 */
export function LoungeLessonSheet({ tutorName, roomId, onClose }: { tutorName: string; roomId: string; onClose: () => void }) {
  const [book, setBook] = useState<LoungeLessonBook | null>(null);
  const [tab, setTab] = useState<Tab>('words');
  const [draft, setDraft] = useState('');
  const [fileWords, setFileWords] = useState<FileWords | null>(null);
  const [situation, setSituation] = useState('');
  const [made, setMade] = useState<{ title: string; items: LoungeLessonItem[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const titleId = useId();
  const load = () => loadLoungeLessonBook().then(setBook, err => { setBook({ items: [], notes: [], level: 'B1' }); setError(errorText(err)); });
  useEffect(() => { void load(); }, []);
  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key); setError(''); setNotice('');
    try { await task(); await load(); } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  };
  const add = () => run('add', async () => {
    const added = await addLoungeLessonWords(draft, book?.level ?? 'B1');
    setDraft('');
    setNotice(added ? `${added}개를 넣었어요. 다음 수업에서 ${koreanSubject(tutorName)} 직접 말해 보게 할 거예요.` : '이미 단어장에 있는 표현이에요.');
  });
  // A file is read in the browser first and shown, then added on the member's word.
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setNotice(''); setFileWords(null);
    try { setFileWords({ name: file.name, words: await readLoungeLessonFile(file) }); }
    catch (err) { setError(errorText(err)); }
    finally { if (fileInput.current) fileInput.current.value = ''; }
  };
  const importFile = () => fileWords && run('file', async () => {
    const added = await importLoungeLessonWords(fileWords.words, book?.level ?? 'B1');
    setFileWords(null);
    setNotice(added ? `${fileWords.name}에서 ${added}개를 넣었어요.${fileWords.words.length > added ? ` (${fileWords.words.length - added}개는 이미 있던 표현이에요)` : ''} 수업에서 하나씩 직접 말해 보게 할게요.` : '파일의 표현이 모두 이미 단어장에 있어요.');
  });
  const makeSituation = () => run('situation', async () => {
    const result = await makeLoungeLessonSituation(roomId, situation);
    setMade(result); setSituation('');
  });
  const level = (value: LoungeLessonLevel) => run('level', () => setLoungeLessonLevel(value));
  const items = book?.items ?? [];
  const learning = items.filter(item => item.stage < 5).sort((a, b) => b.stage - a.stage || Date.parse(a.next_review_at ?? '') - Date.parse(b.next_review_at ?? ''));
  const mine = items.filter(item => item.stage >= 5);
  const row = (item: LoungeLessonItem) => <li key={item.id}>
    <div>
      <span className="lounge-memory-kind"><span className={`lounge-lesson-stage stage-${item.stage}`}>{loungeLessonStageLabel(item.stage)}</span> · {sourceLabel[item.source] ?? item.source}</span>
      <p lang="en">{item.expression}</p>
      {item.meaning && <small>{item.meaning}</small>}
      {item.situation && <small className="lounge-lesson-where">상황: {item.situation}</small>}
      {item.next_review_at && item.stage > 0 && <time>다음 확인 {shortDay(item.next_review_at)}</time>}
    </div>
    <div className="lounge-memory-actions"><button type="button" title="지우기" disabled={Boolean(busy)} onClick={() => { if (window.confirm('이 표현을 단어장에서 지울까요?')) void run(item.id, () => deleteLoungeLessonItem(item.id)); }}>{busy === item.id ? <LoaderCircle size={14} className="lounge-spin" /> : <Trash2 size={14} />}</button></div>
  </li>;
  return <>
    <div className="lounge-background-backdrop" onClick={() => { if (!busy) onClose(); }} />
    <section className="lounge-background-sheet lounge-memory-sheet lounge-lesson-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><b id={titleId}>단어장</b><button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="닫기"><X size={18} /></button></header>
      <div className="lounge-lesson-levels" role="radiogroup" aria-label="수업 레벨">
        {loungeLessonLevels.map(item => <button key={item.id} type="button" role="radio" aria-checked={book?.level === item.id} className={book?.level === item.id ? 'active' : ''} disabled={!book || Boolean(busy)} onClick={() => void level(item.id)}>
          <b>{item.label}</b><small>{item.note}</small>
        </button>)}
      </div>
      <div className="lounge-memory-tabs" role="tablist">
        {([['words', `표현 ${items.length ? items.length : ''}`.trim()], ['situation', '상황으로 배우기'], ['notes', '고친 문장']] as Array<[Tab, string]>).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
      {notice && <p className="lounge-memory-note" role="status">{notice}</p>}
      {!book ? <p className="lounge-memory-empty"><LoaderCircle size={15} className="lounge-spin" /> 불러오는 중…</p> : <>
        {tab === 'words' && <div className="lounge-memory-panel">
          <form className="lounge-memory-editor lounge-lesson-add" onSubmit={event => { event.preventDefault(); void add(); }}>
            <label><span>공부한 표현 넣기 <small>한 줄에 하나, 뜻은 선택</small></span>
              <textarea rows={3} maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)} placeholder={'come up with - 생각해 내다\nI see your point, but - 무슨 말인지는 알지만'} lang="en" /></label>
            <div>
              <button type="button" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}><FileUp size={15} /> 파일로 넣기</button>
              <button type="submit" className="primary" disabled={!draft.trim() || Boolean(busy)}>{busy === 'add' ? <LoaderCircle size={15} className="lounge-spin" /> : <Plus size={15} />} 넣기</button>
            </div>
            <input ref={fileInput} type="file" hidden accept=".xlsx,.csv,.txt,.tsv,.xls,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => void pick(event.target.files?.[0])} />
          </form>
          <p className="lounge-memory-fine">엑셀(.xlsx)·CSV·텍스트 파일: 첫 열에 영어 표현, 둘째 열에 뜻, 셋째 열에 쓰는 상황(선택). 첫 줄 제목은 건너뛰어요. 텍스트 파일은 한 줄에 "표현 - 뜻".</p>
          {fileWords && <div className="lounge-lesson-preview">
            <p><b>{fileWords.name}</b>에서 표현 {fileWords.words.length}개를 찾았어요.</p>
            <ul>{fileWords.words.slice(0, 5).map(word => <li key={word.expression}><span lang="en">{word.expression}</span>{word.meaning && <small> · {word.meaning}</small>}</li>)}</ul>
            {fileWords.words.length > 5 && <small>외 {fileWords.words.length - 5}개</small>}
            <div><button type="button" disabled={Boolean(busy)} onClick={() => setFileWords(null)}>취소</button><button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void importFile()}>{busy === 'file' ? <LoaderCircle size={15} className="lounge-spin" /> : <Plus size={15} />} 단어장에 넣기</button></div>
          </div>}
          <p className="lounge-memory-note">{koreanSubject(tutorName)} 수업에서 상황만 주고 직접 말해 보게 해요. 힌트 없이 말하면 '스스로 말함', 다른 날 또 말하면 '다른 날도 말함', 시키지 않았는데 대화에서 먼저 쓰면 '내 것'이 돼요. 넣은 표현이 부족하면 {tutorName}의 표현으로 채워요.</p>
          {learning.length ? <ul className="lounge-memory-list">{learning.map(row)}</ul> : <p className="lounge-memory-empty">아직 표현이 없어요. 공부한 표현을 넣거나, 그냥 수업을 시작하면 {koreanSubject(tutorName)} 레벨에 맞는 표현을 골라 와요.</p>}
          {mine.length > 0 && <><p className="lounge-memory-note">내 것이 된 표현 {mine.length}개</p><ul className="lounge-memory-list">{mine.map(row)}</ul></>}
        </div>}
        {tab === 'situation' && <div className="lounge-memory-panel">
          <form className="lounge-memory-editor lounge-lesson-add" onSubmit={event => { event.preventDefault(); void makeSituation(); }}>
            <label><span>지금 처한 상황이나 영어로 하고 싶은 말</span>
              <textarea rows={4} maxLength={800} value={situation} onChange={event => setSituation(event.target.value)} placeholder={'예: 다음 주 화상 회의에서 미국 거래처에 납기를 2주 미뤄 달라고 정중하게 요청해야 해요.\n예: 외국인 동료가 점심을 같이 먹자는데, 오늘은 바빠서 다음에 먹자고 자연스럽게 거절하고 싶어요.'} /></label>
            <div><button type="submit" className="primary" disabled={situation.trim().length < 6 || Boolean(busy)}>{busy === 'situation' ? <LoaderCircle size={15} className="lounge-spin" /> : <Sparkles size={15} />} 이 상황의 표현 만들기</button></div>
          </form>
          <p className="lounge-memory-note">{koreanSubject(tutorName)} 이 상황에서 쓸 레벨에 맞는 표현을 골라 단어장에 넣고, 수업에서 그 상황으로 먼저 연습해요. 수업 중에 "내일 면접에서 이런 말을 하고 싶어요"처럼 말해도 돼요.</p>
          {made && <div className="lounge-lesson-preview">
            {made.title && <p><b>{made.title}</b></p>}
            <ul className="lounge-memory-list">{made.items.map(item => <li key={item.id}><div>
              <p lang="en">{item.expression}</p>
              {item.meaning && <small>{item.meaning}</small>}
              {item.situation && <small className="lounge-lesson-where">언제: {item.situation}</small>}
              {item.example && <small lang="en">예: {item.example}</small>}
            </div></li>)}</ul>
            <small>단어장에 넣었어요. 수업으로 돌아가서 말을 걸면 이 상황부터 연습해요.</small>
          </div>}
        </div>}
        {tab === 'notes' && <div className="lounge-memory-panel">
          <p className="lounge-memory-note">수업에서 내가 한 말을 더 자연스럽게 고친 문장이에요. 다시 써 볼 만한 표현은 단어장에도 넣어 두었어요.</p>
          {book.notes.length ? <ul className="lounge-memory-list lounge-lesson-notes">{book.notes.map(note => <li key={note.id}><div>
            <small className="lounge-lesson-said" lang="en">{note.said}</small>
            <p lang="en">→ {note.better}</p>
            {note.polished && <small lang="en">더 세련되게: {note.polished}</small>}
            {note.why && <small className="lounge-lesson-why">{note.why}</small>}
            <time>{shortDay(note.created_at)}</time>
          </div></li>)}</ul> : <p className="lounge-memory-empty">아직 고친 문장이 없어요. 수업에서 영어로 말하면 여기에 쌓여요.</p>}
        </div>}
      </>}
    </section>
  </>;
}

/**
 * The lesson's way in, on the story character's page (2026-11-25): apart from the stories, a lesson with the same
 * person as a tutor. It opens (or goes on with) the tutor's own room.
 */
export function LoungeLessonStart({ characterId, user }: { characterId: string; user: AppUser | null }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tutor = loungeTutorOf(characterId);
  if (!tutor) return null;
  const name = getLoungeCharacter(characterId)?.name ?? '튜터';
  const start = async () => {
    if (!user || busy) return;
    setBusy(true); setError('');
    try { navigate(`/lounge/${await startLoungeScenario(loungeTutors[tutor].lesson, user.nickname)}`); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return <div className="lounge-lesson-start">
    <div className="lounge-lesson-start-head"><GraduationCap size={18} /><b>{name}의 1:1 영어 수업</b><span>무료 체험</span></div>
    <ul>
      <li>공부한 단어·표현을 넣으면, 상황만 주고 <b>직접 말해 보게</b> 해요.</li>
      <li>내가 한 문장을 <b>B2 · C1 수준</b>으로 더 자연스럽고 세련되게 고쳐 줘요.</li>
      <li>다른 날 다시 물어봐서, 진짜 <b>내 것</b>이 됐는지 확인해요. 전화로도, 채팅으로도.</li>
    </ul>
    {user ? <button type="button" className="lounge-character-cta" disabled={busy} onClick={() => void start()}>{busy ? <LoaderCircle size={17} className="lounge-spin" /> : <GraduationCap size={17} />}영어 수업 시작하기</button>
      : <Link to="/" className="lounge-character-cta"><GraduationCap size={17} />로그인하고 수업 시작하기</Link>}
    <small>수업은 이야기와 따로 진행돼요. 수업에서는 연애 이야기 없이 영어에만 집중해요.</small>
    {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
  </div>;
}
