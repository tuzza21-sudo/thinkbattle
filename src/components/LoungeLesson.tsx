import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookOpen, Check, ChevronDown, ChevronUp, FileUp, GraduationCap, Lightbulb, LoaderCircle, Plus, SkipForward, Sparkles, Star, Target, Trash2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { startLoungeScenario } from '../lib/loungeApi';
import { setLoungeLessonProfile, addLoungeLessonWords, deleteLoungeLessonItem, enrichLoungeLessonBook, importLoungeLessonWords, loadLoungeLessonAttempts, loadLoungeLessonBook, makeLoungeLessonSituation, setLoungeLessonFocus, setLoungeLessonLevel, type LoungeLessonAttempt, type LoungeLessonBook } from '../lib/loungeLessonApi';
import { readLoungeLessonFile } from '../lib/loungeLessonFile';
import { getLoungeCharacter, koreanSubject } from '../lib/loungeCharacters';
import { loungeLessonPurposes, loungeLessonTopics, loungeLessonConfusionTutor, loungeLessonDifficulties, loungeLessonDayOf, loungeLessonLevelLabel, loungeLessonListOrder, loungeLessonPriority, loungeLessonStudied, loungeLessonFeedbackLabels, loungeLessonHintText, loungeLessonSkipText, loungeLessonImportanceOf, loungeLessonLevels, loungeLessonStageLabel, loungeLessonTask, loungeTutorOf, loungeTutors, type LoungeLessonItem, type LoungeLessonLevel, type LoungeLessonTask } from '../lib/loungeLesson';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
const shortDay = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) : '';
const sourceLabel: Record<string, string> = { mine: '내가 넣음', tutor: '튜터 표현', upgrade: '고친 문장에서', situation: '내 상황' };
const plain = (text: string) => text.replace(/\s+/g, ' ').trim();

// ── The lesson of a room: the member's book, the lesson's judgement of their words, and the board's state ─────────

type LessonMessage = { id: number; kind: string; text: string };
export type LoungeLessonRoom = {
  book: LoungeLessonBook | null; attempts: LoungeLessonAttempt[]; error: string; enriching: boolean; /** Expressions still to be rated while it runs. */ enrichLeft?: number;
  reload: () => Promise<void>;
};

/**
 * A lesson room's data (2026-11-26, by the owner: a lesson board like a real English service): the member's book is
 * read when the room opens and again after each reply, with the judgement of what they said; expressions without an
 * importance and difficulty get them once (lesson-enrich, after migration 20270118000000).
 */
export function useLoungeLessonRoom(roomId: string | undefined, enabled: boolean, messages: readonly LessonMessage[]): LoungeLessonRoom {
  const [book, setBook] = useState<LoungeLessonBook | null>(null);
  const [attempts, setAttempts] = useState<LoungeLessonAttempt[]>([]);
  const [error, setError] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [enrichLeft, setEnrichLeft] = useState(0);
  const enriched = useRef(false);
  const reload = useCallback(async () => {
    if (!enabled || !roomId) return;
    const [nextBook, nextAttempts] = await Promise.all([
      loadLoungeLessonBook().catch(err => { setError(errorText(err)); return null; }),
      loadLoungeLessonAttempts(roomId).catch(() => null),
    ]);
    if (nextBook) { setBook(nextBook); setError(''); }
    if (nextAttempts) setAttempts(nextAttempts);
    // Once a room: expressions the board has not rated yet (the column is there only after the migration), twenty a call
    // until none is left (2026-11-26: a file of 150 words had only twenty rated, one call a room).
    const unrated = (list: LoungeLessonItem[]) => list.filter(item => ('importance' in item && item.importance == null) || ('nuance' in item && item.nuance == null)).length;
    if (nextBook && !enriched.current && unrated(nextBook.items)) {
      enriched.current = true; setEnriching(true);
      try {
        for (let round = 0, left = unrated(nextBook.items); round < 20 && left > 0; round++) {
          setEnrichLeft(left);
          if (!(await enrichLoungeLessonBook(roomId))) break;
          const fresh = await loadLoungeLessonBook().catch(() => null);
          if (!fresh) break;
          setBook(fresh); left = unrated(fresh.items);
        }
      } catch { /* the board still works without the ratings */ }
      finally { setEnriching(false); setEnrichLeft(0); }
    }
  }, [enabled, roomId]);
  // Again whenever the tutor answers: the stages, the day's queue and the feedback moved with that turn.
  const lastHost = [...messages].reverse().find(message => message.kind === 'host')?.id ?? 0;
  useEffect(() => { void reload(); }, [reload, lastHost]);
  return { book, attempts, error, enriching, enrichLeft, reload };
}

// ── The bar above the composer: the day's progress and the task being asked ────────────────────────────────────────

/** The lesson's place above the composer: today's progress, the expression asked now, and the learning board. */
export function LoungeLessonBar({ tutorName, tutorId, roomId, lesson, storyState, send, disabled }: { tutorName: string; tutorId?: string; roomId: string; lesson: LoungeLessonRoom; storyState?: unknown; send?: (text: string) => Promise<void>; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState(false);
  const [goal, setGoal] = useState<'auto' | 'open' | 'closed'>('auto');
  const task = useMemo(() => lesson.book ? loungeLessonTask(storyState, lesson.book.items) : undefined, [storyState, lesson.book]);
  // Before the day's lesson starts the goal card shows by itself; later it opens from 수업 목표.
  const goalShown = Boolean(lesson.book) && (goal === 'open' || (goal === 'auto' && !task));
  const progress = task?.progress;
  return <div className="lounge-lesson-bar">
    <div className="lounge-lesson-head">
      <GraduationCap size={16} />
      {progress && progress.total > 0 ? <span className="lounge-lesson-progress" aria-label={`오늘 수업 ${progress.total}개 중 ${progress.done}개`}>
        <b>오늘 {progress.done}/{progress.total}</b><i><span style={{ width: `${Math.round(progress.done / progress.total * 100)}%` }} /></i>
      </span> : <span className="lounge-lesson-progress"><b>1:1 영어 수업</b></span>}
      {task?.phase === 'drill' && <button type="button" className="lounge-lesson-fold" onClick={() => setFolded(value => !value)} aria-expanded={!folded} aria-label={folded ? '과제 펼치기' : '과제 접기'}>{folded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>}
      <button type="button" className="lounge-lesson-button ghost" onClick={() => setGoal(value => value === 'open' ? 'closed' : 'open')} aria-expanded={goalShown}><Target size={15} /> 수업 목표</button>
      <button type="button" className="lounge-lesson-button" onClick={() => setOpen(true)}><BookOpen size={15} /> 학습 보드</button>
    </div>
    {goalShown && <LoungeLessonGoalCard key={goal} lesson={lesson} tutorId={tutorId} start={!task} send={send} disabled={disabled} onDone={() => setGoal('closed')} />}
    {task && !folded && !goalShown && <LoungeLessonTaskCard task={task} send={send} disabled={disabled} confusion={tutorId === loungeLessonConfusionTutor} />}
    {open && <LoungeLessonSheet tutorName={tutorName} roomId={roomId} lesson={lesson} confusion={tutorId === loungeLessonConfusionTutor} onClose={() => setOpen(false)} />}
  </div>;
}

/**
 * The session's goal (2026-11-26, by the owner), asked when a day's lesson has not started yet and open from 수업 목표:
 * the level aimed at (B1 초급, B2 중급, C1 상급, each with what it means), what the member learns for and the topics
 * they want to talk about. The tutor builds the day's situations on it; with none chosen, the tutor's own way.
 */
function LoungeLessonGoalCard({ lesson, tutorId, start, send, disabled, onDone }: { lesson: LoungeLessonRoom; tutorId?: string; start: boolean; send?: (text: string) => Promise<void>; disabled?: boolean; onDone: () => void }) {
  const profile = lesson.book?.profile;
  const [level, setLevel] = useState<LoungeLessonLevel>(profile?.level ?? 'B1');
  const [purpose, setPurpose] = useState(profile?.purpose ?? '');
  const [topics, setTopics] = useState<string[]>(profile?.topics ?? []);
  const [topicDraft, setTopicDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const custom = (purpose && !(loungeLessonPurposes as readonly string[]).includes(purpose)) ? purpose : '';
  const toggle = (topic: string) => setTopics(list => list.includes(topic) ? list.filter(item => item !== topic) : [...list, topic].slice(0, 6));
  const addTopic = () => { const topic = topicDraft.replace(/\s+/g, ' ').trim().slice(0, 30); if (topic && !topics.includes(topic)) setTopics(list => [...list, topic].slice(0, 6)); setTopicDraft(''); };
  const save = async () => {
    setBusy(true); setError('');
    const next = { level, purpose: purpose.trim(), topics };
    let saved = true;
    try { await setLoungeLessonProfile(next); } catch (err) { saved = false; setError(errorText(err)); }
    await lesson.reload().catch(() => undefined);
    setBusy(false);
    if (start) await send?.(`오늘 수업 시작할게요. 목표는 ${loungeLessonLevels.find(item => item.id === level)?.label ?? ''}${next.purpose ? `, ${next.purpose}` : ''}${topics.length ? `, 주제는 ${topics.join(', ')}` : ''}.`);
    if (saved || start) onDone();
  };
  const style = tutorId === 'interpretertutor' ? '주제를 고르지 않으면 회의·협상·발표 같은 격식 있는 자리의 영어로 수업해요.' : '주제를 고르지 않으면 일상 대화에서 내 생각과 느낌을 풍부하게 말하는 연습으로 수업해요.';
  return <section className="lounge-lesson-task lounge-lesson-goal" aria-label="수업 목표">
    <header><b>{start ? '오늘 수업 목표' : '수업 목표 바꾸기'}</b><button type="button" className="lounge-lesson-goal-close" onClick={onDone} aria-label="닫기"><X size={15} /></button></header>
    <div className="lounge-lesson-goal-levels" role="radiogroup" aria-label="목표 레벨">
      {loungeLessonLevels.map(item => <button key={item.id} type="button" role="radio" aria-checked={level === item.id} className={level === item.id ? 'active' : ''} onClick={() => setLevel(item.id)}>
        <b>{item.label}</b><small>{item.note}</small>
      </button>)}
    </div>
    <p className="lounge-lesson-goal-label">학습 목적 <small>하나 고르거나 직접 적어요</small></p>
    <div className="lounge-lesson-chips">
      {loungeLessonPurposes.map(item => <button key={item} type="button" aria-pressed={purpose === item} className={purpose === item ? 'active' : ''} onClick={() => setPurpose(purpose === item ? '' : item)}>{item}</button>)}
    </div>
    <input className="lounge-lesson-goal-input" maxLength={200} value={custom} onChange={event => setPurpose(event.target.value)} placeholder="직접 입력: 예) 다음 달 해외 바이어 미팅, 아이 영어 유치원 상담" />
    <p className="lounge-lesson-goal-label">대화하고 싶은 주제 <small>여러 개 골라도 돼요 (최대 6개)</small></p>
    <div className="lounge-lesson-chips">
      {loungeLessonTopics.map(item => <button key={item} type="button" aria-pressed={topics.includes(item)} className={topics.includes(item) ? 'active' : ''} onClick={() => toggle(item)}>{item}</button>)}
      {topics.filter(item => !(loungeLessonTopics as readonly string[]).includes(item)).map(item => <button key={item} type="button" aria-pressed className="active" onClick={() => toggle(item)}>{item} ×</button>)}
    </div>
    <form className="lounge-lesson-goal-add" onSubmit={event => { event.preventDefault(); addTopic(); }}>
      <input className="lounge-lesson-goal-input" maxLength={30} value={topicDraft} onChange={event => setTopicDraft(event.target.value)} placeholder="직접 입력: 예) 반려견 산책, K-pop, 와인, 캠핑" />
      <button type="submit" disabled={!topicDraft.trim()}><Plus size={14} /> 추가</button>
    </form>
    <p className="lounge-lesson-reveal muted">{style}</p>
    {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
    <div className="lounge-lesson-task-actions">
      <button type="button" className="primary" disabled={busy || disabled} onClick={() => void save()}>{busy ? <LoaderCircle size={14} className="lounge-spin" /> : <GraduationCap size={14} />} {start ? '이대로 수업 시작' : '저장'}</button>
    </div>
  </section>;
}

function Badges({ importance, difficulty, extra }: { importance?: number | null; difficulty?: string | null; extra?: ReactNode }) {
  const rank = loungeLessonImportanceOf(importance);
  const priority = loungeLessonPriority(importance), level = loungeLessonLevelLabel(difficulty);
  return <span className="lounge-lesson-badges">
    {extra}
    {rank && <span className={`lounge-lesson-badge importance-${rank.value}`} title={`중요도: ${rank.label}`}>{priority.label} <b aria-hidden>{rank.stars}</b> {rank.label}</span>}
    {level && <span className={`lounge-lesson-badge level level-${difficulty}`} title="레벨">{level}</span>}
  </span>;
}

/** The expression asked now: its situation, importance and difficulty, and only as much of the English as the tutor may say. */
/** What an expression carries, once it may be seen: its nuance, similar expressions, and (in 문정우's lessons) why Koreans mix it up. */
function ExpressionNotes({ nuance, alternatives, confusion }: { nuance?: string | null; alternatives?: Array<{ expression: string; note: string }> | null; confusion?: string | null }) {
  if (!nuance && !alternatives?.length && !confusion) return null;
  return <div className="lounge-lesson-notes-box">
    {nuance && <p><span>뉘앙스</span>{nuance}</p>}
    {alternatives && alternatives.length > 0 && <p><span>비슷한 표현</span>{alternatives.map((alt, index) => <span key={alt.expression} className="lounge-lesson-alt">{index ? ' · ' : ''}<b lang="en">{alt.expression}</b>{alt.note && <small> ({alt.note})</small>}</span>)}</p>}
    {confusion && <p className="lounge-lesson-confusion"><span>한국인이 헷갈리는 이유</span>{confusion}</p>}
  </div>;
}

function LoungeLessonTaskCard({ task, send, disabled, confusion }: { task: LoungeLessonTask; send?: (text: string) => Promise<void>; disabled?: boolean; confusion?: boolean }) {
  if (task.phase === 'warmup') return <div className="lounge-lesson-task quiet"><p>가볍게 영어로 인사부터 해요. 그다음 오늘의 표현을 하나씩 물어볼게요.</p></div>;
  if (task.phase !== 'drill' || !('item' in task) || !task.item) return <div className="lounge-lesson-task quiet"><p>오늘 연습할 표현을 다 했어요. 이제 자유롭게 영어로 이야기하면서, 배운 표현을 먼저 써 보세요.</p></div>;
  const { item } = task;
  const kind = item.yours ? '내 상황' : item.review ? '복습' : '새 표현';
  return <section className="lounge-lesson-task" aria-label="지금 과제">
    <header><b>지금 과제</b><Badges importance={item.importance} difficulty={item.difficulty} extra={<>
      <span className="lounge-lesson-badge kind">{kind}</span>
      {item.focus && <span className="lounge-lesson-badge focus"><Star size={11} /> 우선</span>}
    </>} /></header>
    {item.situation && <p className="lounge-lesson-scene"><span>상황</span>{item.situation}</p>}
    {item.meaning && <p className="lounge-lesson-meaning"><span>뜻</span>{item.meaning}</p>}
    {'expression' in item && item.expression ? <p className="lounge-lesson-reveal"><span>표현</span><b lang="en">{item.expression}</b>{task.retell ? ' · 새 상황에서 한 번 더' : ' · 이 표현으로 내 문장을 말해 보세요'}</p> : null}
    {'expression' in item && item.expression && <ExpressionNotes nuance={item.nuance} alternatives={item.alternatives} confusion={confusion ? item.confusion : null} />}
    {'expression' in item && item.expression ? null
      : 'first' in item && item.first ? <p className="lounge-lesson-reveal"><span>힌트</span><b lang="en">{item.first} …</b> 로 시작해요</p>
      : <p className="lounge-lesson-reveal muted">영어 표현은 직접 떠올려서 말해 보세요{task.hints ? ` · 힌트 ${task.hints}번 받음` : ''}</p>}
    {send && <div className="lounge-lesson-task-actions">
      {!('expression' in item && item.expression) && <button type="button" disabled={disabled} onClick={() => void send(loungeLessonHintText)}><Lightbulb size={14} /> 힌트 받기</button>}
      <button type="button" disabled={disabled} onClick={() => void send(loungeLessonSkipText)}><SkipForward size={14} /> 넘어가기</button>
    </div>}
  </section>;
}

// ── The feedback under the member's words ──────────────────────────────────────────────────────────────────────────

const verdictText: Record<string, string> = { unprompted: '스스로 말했어요', hinted: '힌트 받고 말했어요', given: '답을 보고 말했어요', missed: '다음에 다시 해요', free: '배운 표현을 먼저 썼어요' };

/** The lesson's judgement of one thing the member said: how the expression went, and the corrections at the member's goal. */
export function LoungeLessonFeedback({ text, attempts, level }: { text: string; attempts: readonly LoungeLessonAttempt[]; level: LoungeLessonLevel }) {
  const [more, setMore] = useState(false);
  const said = plain(text).slice(0, 600);
  // The task card's buttons are words of the lesson, not English to correct (older lessons corrected them).
  const lessonWords = said === loungeLessonHintText || said === loungeLessonSkipText;
  const mine = attempts.filter(attempt => { const words = plain(attempt.said); return words === said || (said.length > 20 && (words.startsWith(said) || said.startsWith(words))); });
  if (!mine.length) return null;
  const note = lessonWords ? undefined : mine.find(attempt => attempt.better || attempt.why);
  const verdicts = [...new Set(mine.map(attempt => attempt.verdict).filter(verdict => verdictText[verdict]))];
  const labels = loungeLessonFeedbackLabels(level);
  const errors = (note?.why ?? '').split('\n').map(line => line.match(/^(.*?) → (.*?): (.*)$/)).filter((match): match is RegExpMatchArray => Boolean(match));
  if (!note && !verdicts.length) return null;
  return <div className="lounge-lesson-feedback" role="note" aria-label="수업 피드백">
    {verdicts.length > 0 && <div className="lounge-lesson-verdicts">{verdicts.map(verdict => <span key={verdict} className={`lounge-lesson-verdict ${verdict}`}>{verdictText[verdict]}</span>)}</div>}
    {note?.better && <div className="lounge-lesson-better"><span>{labels.better}</span><b lang="en">{note.better}</b></div>}
    {note?.polished && (more || !errors.length) && <div className="lounge-lesson-polished"><span>{labels.polished}</span><b lang="en">{note.polished}</b></div>}
    {errors.length > 0 && (more ? <ul className="lounge-lesson-errors">{errors.map(([, wrong, right, why], index) => <li key={index}><s lang="en">{wrong}</s> → <b lang="en">{right}</b><small>{why}</small></li>)}</ul>
      : <button type="button" className="lounge-lesson-more" onClick={() => setMore(true)}>고친 이유{note?.polished ? ' · 더 세련된 표현' : ''} 보기</button>)}
  </div>;
}

// ── The learning board ─────────────────────────────────────────────────────────────────────────────────────────────

type Tab = 'input' | 'list' | 'notes';
type Filter = 'all' | 'focus' | 'due' | 'new' | 'mine';
type FileWords = { name: string; words: Array<{ expression: string; meaning: string; situation: string }> };
const filters: Array<[Filter, string]> = [['all', '전체'], ['focus', '우선 학습'], ['due', '오늘 확인'], ['new', '새 표현'], ['mine', '내 것']];
type GroupBy = 'day' | 'priority' | 'level';
const groupings: Array<[GroupBy, string]> = [['day', '날짜별'], ['priority', '순위별'], ['level', '레벨별']];

/**
 * The member's learning board: 1 what to learn (typed, a file, or a situation of theirs), 2 the list to choose from
 * (marked ones are asked first, with each one's importance, difficulty and stage), and the feedback of past lessons.
 * The stages move only when the member says the expression in a lesson; they are not edited here.
 */
export function LoungeLessonSheet({ tutorName, roomId, lesson, confusion, onClose }: { tutorName: string; roomId: string; lesson: LoungeLessonRoom; confusion?: boolean; onClose: () => void }) {
  const book = lesson.book;
  const [tab, setTab] = useState<Tab>(() => book?.items.length ? 'list' : 'input');
  const [filter, setFilter] = useState<Filter>('all');
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState('');
  const [fileWords, setFileWords] = useState<FileWords | null>(null);
  const [situation, setSituation] = useState('');
  const [made, setMade] = useState<{ title: string; items: LoungeLessonItem[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const titleId = useId();
  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key); setError(''); setNotice('');
    try { await task(); await lesson.reload(); } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  };
  const add = () => run('add', async () => {
    const added = await addLoungeLessonWords(draft, book?.level ?? 'B1');
    setDraft('');
    setNotice(added ? `${added}개를 넣었어요. 학습 목록에서 ★를 누르면 그 표현부터 연습해요.` : '이미 학습 목록에 있는 표현이에요.');
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
    const result = await importLoungeLessonWords(fileWords.words, book?.level ?? 'B1');
    setFileWords(null);
    setNotice(`${fileWords.name}: ${fileWords.words.length}개 중 새로 넣음 ${result.added}개 · 이미 있음 ${result.existing}개${result.failed ? ` · 넣지 못함 ${result.failed}개 (${result.reason})` : ''}.${result.added ? ' 순위·레벨은 곧 매겨져요.' : ''}`);
    if (result.added) setTab('list');
  });
  const makeSituation = () => run('situation', async () => {
    const result = await makeLoungeLessonSituation(roomId, situation);
    setMade(result); setSituation('');
  });
  const level = (value: LoungeLessonLevel) => run('level', () => setLoungeLessonLevel(value));
  const focus = (item: LoungeLessonItem) => run(`focus-${item.id}`, () => setLoungeLessonFocus(item.id, !item.focus));
  const items = useMemo(() => book?.items ?? [], [book]);
  const now = Date.now();
  const due = (item: LoungeLessonItem) => item.stage > 0 && item.stage < 5 && Boolean(item.next_review_at) && Date.parse(item.next_review_at!) <= now;
  const shown = items.filter(item => filter === 'all' ? true : filter === 'focus' ? item.focus : filter === 'due' ? due(item) : filter === 'new' ? item.stage === 0 : item.stage >= 5)
    // The order the lesson takes them in: marked first, then the higher priority, then the easier level.
    .sort(loungeLessonListOrder);
  // Grouped by the day they were put in (the newest first), by priority or by level; each group folds, the first starts open.
  const groupKey = (item: LoungeLessonItem) => groupBy === 'day' ? loungeLessonDayOf(item.created_at)
    : groupBy === 'priority' ? (item.importance == null ? 'none' : String(loungeLessonPriority(item.importance).rank)) : (item.difficulty ?? 'none');
  const groupRank = (key: string) => groupBy === 'priority' ? (key === 'none' ? 9 : Number(key)) : groupBy === 'level' ? (key === 'none' ? 9 : (loungeLessonDifficulties as readonly string[]).indexOf(key)) : 0;
  const days = [...shown.reduce((map, item) => { const key = groupKey(item); map.set(key, [...(map.get(key) ?? []), item]); return map; }, new Map<string, LoungeLessonItem[]>())]
    .sort((a, b) => groupBy === 'day' ? b[0].localeCompare(a[0]) : groupRank(a[0]) - groupRank(b[0]));
  const dayLabel = (key: string) => groupBy === 'priority' ? (key === 'none' ? '아직 안 매김' : `${key}순위 · ${loungeLessonImportanceOf(4 - Number(key))?.label ?? ''}`)
    : groupBy === 'level' ? (key === 'none' ? '레벨 아직 안 매김' : loungeLessonLevelLabel(key))
    : key ? new Date(`${key}T12:00:00+09:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }) : '날짜 없음';
  const dayOpen = (key: string, index: number) => openDays[`${groupBy}:${key}`] ?? index === 0;
  const counts = { focus: items.filter(item => item.focus).length, due: items.filter(due).length, mine: items.filter(item => item.stage >= 5).length };
  const marks = items.length > 0 && 'focus' in items[0];
  const labels = loungeLessonFeedbackLabels(book?.level ?? 'B1');
  // The corrections by the day they were made, the newest first (the newest day starts open).
  const noteDays = [...(book?.notes ?? []).reduce((map, note) => { const day = loungeLessonDayOf(note.created_at); map.set(day, [...(map.get(day) ?? []), note]); return map; }, new Map<string, LoungeLessonBook['notes']>())]
    .sort((a, b) => b[0].localeCompare(a[0]));
  const row = (item: LoungeLessonItem) => <li key={item.id} className={[item.focus ? 'focused' : '', loungeLessonStudied(item) ? 'studied' : ''].filter(Boolean).join(' ') || undefined}>
    {marks && <button type="button" className={`lounge-lesson-star${item.focus ? ' on' : ''}`} aria-pressed={Boolean(item.focus)} title={item.focus ? '우선 학습 해제' : '우선 학습'} disabled={Boolean(busy) || item.stage >= 5} onClick={() => void focus(item)}>
      {busy === `focus-${item.id}` ? <LoaderCircle size={16} className="lounge-spin" /> : <Star size={16} />}</button>}
    <div>
      <p lang="en">{item.expression}</p>
      {item.meaning && <small>{item.meaning}</small>}
      {item.situation && <small className="lounge-lesson-where">상황: {item.situation}</small>}
      <ExpressionNotes nuance={item.nuance} alternatives={item.alternatives} confusion={confusion ? item.confusion : null} />
      <Badges importance={item.importance} difficulty={item.difficulty} extra={<>{loungeLessonStudied(item) ? <span className="lounge-lesson-badge studied"><Check size={11} /> 학습함</span> : <span className="lounge-lesson-badge fresh">아직 안 함</span>}<span className={`lounge-lesson-badge lounge-lesson-stage stage-${item.stage}`}>{loungeLessonStageLabel(item.stage)}</span></>} />
      <span className="lounge-memory-kind">{sourceLabel[item.source] ?? item.source}{item.next_review_at && item.stage > 0 && item.stage < 5 ? ` · 다음 확인 ${shortDay(item.next_review_at)}` : ''}</span>
    </div>
    <div className="lounge-memory-actions"><button type="button" title="지우기" disabled={Boolean(busy)} onClick={() => { if (window.confirm('이 표현을 학습 목록에서 지울까요?')) void run(item.id, () => deleteLoungeLessonItem(item.id)); }}>{busy === item.id ? <LoaderCircle size={14} className="lounge-spin" /> : <Trash2 size={14} />}</button></div>
  </li>;
  return <>
    <div className="lounge-background-backdrop" onClick={() => { if (!busy) onClose(); }} />
    <section className="lounge-background-sheet lounge-memory-sheet lounge-lesson-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><b id={titleId}>학습 보드</b><button type="button" onClick={onClose} disabled={Boolean(busy)} aria-label="닫기"><X size={18} /></button></header>
      <div className="lounge-lesson-levels three" role="radiogroup" aria-label="학습 목표">
        {loungeLessonLevels.map(item => <button key={item.id} type="button" role="radio" aria-checked={book?.level === item.id} className={book?.level === item.id ? 'active' : ''} disabled={!book || Boolean(busy)} onClick={() => void level(item.id)}>
          <b>{item.label}</b><small>{item.note}</small>
        </button>)}
      </div>
      {book && items.length > 0 && <div className="lounge-lesson-summary">
        <span><b>{items.length}</b>전체</span><span><b>{counts.focus}</b>우선 학습</span><span><b>{counts.due}</b>오늘 확인</span><span><b>{counts.mine}</b>내 것</span>
      </div>}
      <div className="lounge-memory-tabs" role="tablist">
        {([['input', '1 학습할 것 넣기'], ['list', `2 학습 목록${items.length ? ` ${items.length}` : ''}`], ['notes', '피드백']] as Array<[Tab, string]>).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {(error || lesson.error) && <p className="lounge-creator-notice error" role="alert">{error || lesson.error}</p>}
      {notice && <p className="lounge-memory-note" role="status">{notice}</p>}
      {!book ? <p className="lounge-memory-empty"><LoaderCircle size={15} className="lounge-spin" /> 불러오는 중…</p> : <>
        {tab === 'input' && <div className="lounge-memory-panel">
          <form className="lounge-memory-editor lounge-lesson-add" onSubmit={event => { event.preventDefault(); void add(); }}>
            <label><span>배우고 싶은 단어·표현 <small>한 줄에 하나, 뜻은 선택</small></span>
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
            <div><button type="button" disabled={Boolean(busy)} onClick={() => setFileWords(null)}>취소</button><button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void importFile()}>{busy === 'file' ? <LoaderCircle size={15} className="lounge-spin" /> : <Plus size={15} />} 학습 목록에 넣기</button></div>
          </div>}
          <form className="lounge-memory-editor lounge-lesson-add" onSubmit={event => { event.preventDefault(); void makeSituation(); }}>
            <label><span>내 상황으로 만들기 <small>지금 처한 상황이나 영어로 하고 싶은 말</small></span>
              <textarea rows={3} maxLength={800} value={situation} onChange={event => setSituation(event.target.value)} placeholder={'예: 다음 주 화상 회의에서 미국 거래처에 납기를 2주 미뤄 달라고 정중하게 요청해야 해요.\n예: 외국인 동료의 점심 제안을 오늘은 바빠서 자연스럽게 거절하고 싶어요.'} /></label>
            <div><button type="submit" className="primary" disabled={situation.trim().length < 6 || Boolean(busy)}>{busy === 'situation' ? <LoaderCircle size={15} className="lounge-spin" /> : <Sparkles size={15} />} 이 상황의 표현 만들기</button></div>
          </form>
          {made && <div className="lounge-lesson-preview">
            {made.title && <p><b>{made.title}</b></p>}
            <ul className="lounge-memory-list">{made.items.map(item => <li key={item.id}><div>
              <p lang="en">{item.expression}</p>
              {item.meaning && <small>{item.meaning}</small>}
              {item.situation && <small className="lounge-lesson-where">언제: {item.situation}</small>}
              {item.example && <small lang="en">예: {item.example}</small>}
            </div></li>)}</ul>
            <small>학습 목록에 넣었어요. 수업으로 돌아가 말을 걸면 이 상황부터 연습해요.</small>
          </div>}
        </div>}
        {tab === 'list' && <div className="lounge-memory-panel">
          <div className="lounge-lesson-filters" role="group" aria-label="보기">
            {filters.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}
          </div>
          <div className="lounge-lesson-filters lounge-lesson-groupby" role="group" aria-label="묶어 보기">
            <span>묶어 보기</span>
            {groupings.map(([id, label]) => <button key={id} type="button" aria-pressed={groupBy === id} className={groupBy === id ? 'active' : ''} onClick={() => setGroupBy(id)}>{label}</button>)}
          </div>
          <p className="lounge-memory-note">수업 순서: {marks ? '★ 우선 학습 → ' : ''}1순위 → 2순위 → 3순위, 같은 순위면 쉬운 레벨(B1 → B2 → C1)부터. {marks ? '★는 연습하고 나면 풀려요.' : ''}{lesson.enriching && <> <LoaderCircle size={12} className="lounge-spin" /> 순위·레벨을 매기는 중{lesson.enrichLeft ? ` (남은 ${lesson.enrichLeft}개)` : ''}…</>}</p>
          {shown.length ? <div className="lounge-lesson-days">{days.map(([day, list], index) => {
            const open = dayOpen(day, index), studied = list.filter(loungeLessonStudied).length, first = groupBy === 'priority' ? 0 : list.filter(item => item.importance === 3 && !loungeLessonStudied(item)).length;
            return <section key={day || 'none'} className={`lounge-lesson-day${open ? ' open' : ''}`}>
              <button type="button" className="lounge-lesson-day-head" aria-expanded={open} onClick={() => setOpenDays(value => ({ ...value, [`${groupBy}:${day}`]: !open }))}>
                <b>{dayLabel(day)}</b><span>{list.length}개{groupBy === 'day' ? ' 입력' : ''}</span><span className="done">학습함 {studied}/{list.length}</span>{first > 0 && <span className="first">1순위 남음 {first}</span>}
                {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {open && <ul className="lounge-memory-list lounge-lesson-list">{list.map(row)}</ul>}
            </section>;
          })}</div>
            : <p className="lounge-memory-empty">{items.length ? '이 보기에 맞는 표현이 없어요.' : `아직 표현이 없어요. '1 학습할 것 넣기'에서 넣거나, 그냥 수업을 시작하면 ${koreanSubject(tutorName)} 레벨에 맞는 표현을 골라 와요.`}</p>}
        </div>}
        {tab === 'notes' && <div className="lounge-memory-panel">
          <p className="lounge-memory-note">수업에서 내가 한 말을 목표 레벨로 고친 문장이에요. 다시 써 볼 만한 표현은 학습 목록에도 넣어 두었어요.</p>
          {book.notes.length ? <div className="lounge-lesson-days">{noteDays.map(([day, list], index) => {
            const open = openNotes[day] ?? index === 0;
            return <section key={day || 'none'} className={`lounge-lesson-day${open ? ' open' : ''}`}>
              <button type="button" className="lounge-lesson-day-head" aria-expanded={open} onClick={() => setOpenNotes(value => ({ ...value, [day]: !open }))}>
                <b>{day ? new Date(`${day}T12:00:00+09:00`).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' }) : '날짜 없음'}</b><span>고친 문장 {list.length}개</span>
                {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {open && <ul className="lounge-memory-list lounge-lesson-notes">{list.map(note => <li key={note.id}><div>
                <small className="lounge-lesson-said" lang="en">{note.said}</small>
                <p lang="en"><span className="lounge-lesson-badge level">{labels.better}</span> {note.better}</p>
                {note.polished && <small lang="en">{labels.polished}: {note.polished}</small>}
                {note.why && <small className="lounge-lesson-why">{note.why}</small>}
                <time>{new Date(note.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' })}</time>
              </div></li>)}</ul>}
            </section>;
          })}</div> : <p className="lounge-memory-empty">아직 고친 문장이 없어요. 수업에서 영어로 말하면 여기에 쌓여요.</p>}
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
      <li>배우고 싶은 단어·표현을 넣고 <b>먼저 할 것</b>을 고르면, 그 표현이 쓰이는 상황을 주고 <b>직접 말해 보게</b> 해요.</li>
      <li>표현마다 <b>중요도와 난이도</b>를 보여 주고, 내 문장을 <b>B2 · C1 수준</b>으로 고쳐 줘요.</li>
      <li>다른 날 다시 물어봐서, 진짜 <b>내 것</b>이 됐는지 확인해요. 전화로도, 채팅으로도.</li>
    </ul>
    {user ? <button type="button" className="lounge-character-cta" disabled={busy} onClick={() => void start()}>{busy ? <LoaderCircle size={17} className="lounge-spin" /> : <GraduationCap size={17} />}영어 수업 시작하기</button>
      : <Link to="/" className="lounge-character-cta"><GraduationCap size={17} />로그인하고 수업 시작하기</Link>}
    <small>수업은 이야기와 따로 진행돼요. 수업에서는 연애 이야기 없이 영어에만 집중해요.</small>
    {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
  </div>;
}
