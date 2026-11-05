import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  loungeCompatFormText, loungeCompatRelations, loungeCounselCategories, loungeCounselFormText, loungeFortuneFormText, loungeFortunePeriods, loungeSajuCalendars, loungeSajuFocuses,
  loungeSajuFormText, loungeSajuGenders, loungeTarotDrawForMe, loungeTarotFormText, loungeTarotPickPrefix, loungeZodiacFormText,
  type LoungeBirth, type LoungeCounselCategory, type LoungeCounselField, type LoungeFortunePeriod, type LoungeSajuDisplay, type LoungeSajuInput, type LoungeZodiacDisplay,
} from '../lib/loungeConsult';
import type { LoungeTarotDrawn, LoungeTarotSpread } from '../lib/loungeTarot';
import './LoungeTarot.css';

type Send = (text: string) => Promise<void>;
const errorText = (err: unknown) => err instanceof Error ? err.message : '보내지 못했어요. 다시 눌러 주세요.';

/**
 * The 홍실당 button under the conversation (2026-11-05): the consulting room is a conversation, and what needs a form starts
 * here — tarot, 사주, 궁합, 운세, 별자리 and 기타 상담. It blinks red when it is the moment to use it (a new guest, or a
 * reading just mentioned). `birth` is the member's birth from the last form, so the next one starts filled in.
 */
export function LoungeHongsilBar({ hint, send, disabled, birth }: { hint: boolean; send: Send; disabled: boolean; birth?: LoungeBirth }) {
  const [view, setView] = useState<'closed' | 'menu' | 'tarot' | 'saju' | 'compat' | 'fortune' | 'zodiac' | 'counsel'>('closed');
  const [seen, setSeen] = useState(false);
  const close = () => setView('closed');
  const props = { send, disabled, onDone: close, birth };
  return <div className="lounge-hongsil-bar">
    {view === 'menu' && <div className="lounge-hongsil-menu" role="menu" aria-label="홍실당 상담">
      <button type="button" role="menuitem" onClick={() => setView('tarot')}>🃏 타로<small>궁금한 걸 적고 카드를 직접 골라요</small></button>
      <button type="button" role="menuitem" onClick={() => setView('saju')}>🔮 사주<small>타고난 기질과 올해 흐름</small></button>
      <button type="button" role="menuitem" onClick={() => setView('compat')}>💞 궁합<small>두 사람의 생년월일로</small></button>
      <button type="button" role="menuitem" onClick={() => setView('fortune')}>🗓️ 운세<small>오늘 · 이번 달 · 올해</small></button>
      <button type="button" role="menuitem" onClick={() => setView('zodiac')}>⭐ 별자리<small>내 별자리와 이달 흐름</small></button>
      <button type="button" role="menuitem" onClick={() => setView('counsel')}>📝 기타 상담<small>꿈해몽 · 연애 · 금전 · 관계 · 진로</small></button>
    </div>}
    {view === 'tarot' && <LoungeTarotForm send={send} disabled={disabled} onDone={close} />}
    {view === 'saju' && <LoungeSajuForm {...props} />}
    {view === 'compat' && <LoungeCompatForm {...props} />}
    {view === 'fortune' && <LoungeFortuneForm {...props} />}
    {view === 'zodiac' && <LoungeZodiacForm {...props} />}
    {view === 'counsel' && <LoungeCounselForm send={send} disabled={disabled} onDone={close} />}
    <button type="button" className={`lounge-hongsil-button${hint && !seen ? ' blinking' : ''}`} aria-expanded={view !== 'closed'}
      onClick={() => { setView(current => current === 'closed' ? 'menu' : 'closed'); setSeen(true); }}><Sparkles size={15} /> 홍실당</button>
  </div>;
}

function FormHead({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="lounge-tarot-head"><b>{title}</b><button type="button" className="lounge-hongsil-close" onClick={onClose} aria-label="닫기"><X size={16} /></button></div>;
}

/** Tarot: what the member wants to know and how many cards; the deck is laid out for them once it is sent. */
function LoungeTarotForm({ send, disabled, onDone }: { send: Send; disabled: boolean; onDone: () => void }) {
  const [question, setQuestion] = useState('');
  const [spread, setSpread] = useState<LoungeTarotSpread>('three');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim() || sending) return;
    setSending(true); setError('');
    try { await send(loungeTarotFormText(spread, question)); onDone(); } catch (err) { setError(errorText(err)); } finally { setSending(false); }
  };
  return <form className="lounge-hongsil-form" onSubmit={event => void submit(event)} aria-label="타로 보기">
    <FormHead title="🃏 타로 보기" onClose={onDone} />
    <label>무엇이 궁금해요?<textarea value={question} onChange={event => setQuestion(event.target.value)} maxLength={300} rows={2} placeholder="예: 그 사람과 다시 잘 지낼 수 있을까?" /></label>
    <div className="lounge-hongsil-field"><span>몇 장 뽑을까요?</span><div className="lounge-tarot-count" role="radiogroup" aria-label="뽑을 장수">
      {(['one', 'three'] as const).map(value => <button key={value} type="button" role="radio" aria-checked={spread === value} className={spread === value ? 'on' : ''} onClick={() => setSpread(value)}>
        {value === 'one' ? '한 장 · 오늘의 답' : '세 장 · 과거·현재·미래'}
      </button>)}
    </div></div>
    <button type="submit" className="lounge-tarot-confirm" disabled={disabled || sending || !question.trim()}>{sending ? <LoaderCircle size={15} className="lounge-spin" /> : null} 카드 섞기</button>
    {error && <p className="lounge-tarot-error" role="alert">{error}</p>}
  </form>;
}

const chips = <T extends string>(options: Record<T, string> | readonly T[], value: T, set: (value: T) => void, label: string) =>
  <div className="lounge-tarot-count" role="radiogroup" aria-label={label}>{(Array.isArray(options) ? options.map(item => [item, item]) : Object.entries(options)).map(([key, text]) =>
    <button key={key} type="button" role="radio" aria-checked={value === key} className={value === key ? 'on' : ''} onClick={() => set(key as T)}>{text as string}</button>)}</div>;

const years = Array.from({ length: 2049 - 1900 + 1 }, (_, i) => 2049 - i);
type BirthDraft = { year: number; month: number; day: number; calendar: LoungeSajuInput['calendar']; time: string; noTime: boolean; gender: LoungeSajuInput['gender'] };
const birthDraft = (birth?: LoungeBirth): BirthDraft => {
  const [year, month, day] = birth ? birth.date.split('-').map(Number) : [1995, 1, 1];
  return { year, month, day, calendar: birth?.calendar ?? 'solar', time: birth?.time ?? '', noTime: Boolean(birth && !birth.time), gender: birth?.gender ?? 'female' };
};
const birthDays = (draft: BirthDraft) => draft.calendar === 'solar' ? new Date(Date.UTC(draft.year, draft.month, 0)).getUTCDate() : 30;
/** The birth the member filled in, or the reason it cannot be sent yet. */
const birthOf = (draft: BirthDraft, who = ''): LoungeBirth | string => {
  if (!draft.noTime && !/^\d{2}:\d{2}$/.test(draft.time)) return `${who}태어난 시간을 적거나 "시간 몰라요"를 눌러 주세요.`;
  const date = `${draft.year}-${String(draft.month).padStart(2, '0')}-${String(Math.min(draft.day, birthDays(draft))).padStart(2, '0')}`;
  return { date, calendar: draft.calendar, ...(draft.noTime ? {} : { time: draft.time }), gender: draft.gender };
};
/** The birth fields every chart form shares: the date in either calendar, the time (or not), and the gender when it is used. */
function BirthFields({ draft, set, title = '생년월일', gender }: { draft: BirthDraft; set: (draft: BirthDraft) => void; title?: string; gender?: string }) {
  const days = birthDays(draft);
  const change = (patch: Partial<BirthDraft>) => set({ ...draft, ...patch });
  return <>
    <div className="lounge-hongsil-field"><span>{title}</span><div className="lounge-hongsil-date">
      <select value={draft.year} onChange={event => change({ year: Number(event.target.value) })} aria-label={`${title} 해`}>{years.map(item => <option key={item} value={item}>{item}년</option>)}</select>
      <select value={draft.month} onChange={event => change({ month: Number(event.target.value) })} aria-label={`${title} 달`}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}</select>
      <select value={Math.min(draft.day, days)} onChange={event => change({ day: Number(event.target.value) })} aria-label={`${title} 날`}>{Array.from({ length: days }, (_, i) => <option key={i} value={i + 1}>{i + 1}일</option>)}</select>
    </div>{chips(loungeSajuCalendars, draft.calendar, calendar => change({ calendar }), `${title} 양력 음력`)}</div>
    <div className="lounge-hongsil-field"><span>태어난 시간</span><div className="lounge-hongsil-time">
      <input type="time" value={draft.time} onChange={event => change({ time: event.target.value })} disabled={draft.noTime} aria-label={`${title} 시간`} />
      <label className="lounge-hongsil-check"><input type="checkbox" checked={draft.noTime} onChange={event => change({ noTime: event.target.checked })} /> 시간 몰라요</label>
    </div></div>
    {gender && <div className="lounge-hongsil-field"><span>{gender}</span>{chips(loungeSajuGenders, draft.gender, value => change({ gender: value }), `${title} 성별`)}</div>}
  </>;
}

type ChartFormProps = { send: Send; disabled: boolean; onDone: () => void; birth?: LoungeBirth };
/** Sends a form's text once its births are in; shows why not otherwise. */
function useFormSend(send: Send, onDone: () => void) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent, make: () => string) => {
    event.preventDefault();
    if (sending) return;
    let text: string;
    try { text = make(); } catch (err) { setError(errorText(err)); return; }
    setSending(true); setError('');
    try { await send(text); onDone(); } catch (err) { setError(errorText(err)); } finally { setSending(false); }
  };
  return { sending, error, submit };
}
const must = (birth: LoungeBirth | string) => { if (typeof birth === 'string') throw new Error(birth); return birth; };
const SubmitRow = ({ label, sending, disabled, error }: { label: string; sending: boolean; disabled: boolean; error: string }) => <>
  <button type="submit" className="lounge-tarot-confirm" disabled={disabled || sending}>{sending ? <LoaderCircle size={15} className="lounge-spin" /> : null} {label}</button>
  {error && <p className="lounge-tarot-error" role="alert">{error}</p>}
</>;

/** 사주: the birth (solar or lunar date, the time or not, the gender for the luck pillars) and what to look at. */
function LoungeSajuForm({ send, disabled, onDone, birth }: ChartFormProps) {
  const [draft, setDraft] = useState(() => birthDraft(birth));
  const [focus, setFocus] = useState<string>('전부');
  const [question, setQuestion] = useState('');
  const { sending, error, submit } = useFormSend(send, onDone);
  return <form className="lounge-hongsil-form" onSubmit={event => void submit(event, () => loungeSajuFormText({ ...must(birthOf(draft)), focus, ...(question.trim() ? { question } : {}) }))} aria-label="사주 보기">
    <FormHead title="🔮 사주 보기" onClose={onDone} />
    <BirthFields draft={draft} set={setDraft} gender="성별 (대운 계산에 써요)" />
    <div className="lounge-hongsil-field"><span>무엇을 볼까요?</span>{chips(loungeSajuFocuses, focus, setFocus, '볼 것')}</div>
    <label>더 궁금한 것 (선택)<input value={question} onChange={event => setQuestion(event.target.value)} maxLength={200} placeholder="예: 올해 이직해도 괜찮을까?" /></label>
    <p className="lounge-hongsil-note">입력한 생년월일은 이 상담 대화에만 남아요. 풀이는 재미로 보는 콘텐츠예요.</p>
    <SubmitRow label="사주 보기" sending={sending} disabled={disabled} error={error} />
  </form>;
}

/** 궁합: the member's birth and the other person's, what they are to each other, and what to know. */
function LoungeCompatForm({ send, disabled, onDone, birth }: ChartFormProps) {
  const [me, setMe] = useState(() => birthDraft(birth));
  const [partner, setPartner] = useState<BirthDraft>(() => ({ ...birthDraft(), gender: 'male' }));
  const [relation, setRelation] = useState<string>('연인');
  const [question, setQuestion] = useState('');
  const { sending, error, submit } = useFormSend(send, onDone);
  return <form className="lounge-hongsil-form" onSubmit={event => void submit(event, () => loungeCompatFormText({ me: must(birthOf(me, '내 ')), partner: must(birthOf(partner, '상대의 ')), relation, ...(question.trim() ? { question } : {}) }))} aria-label="궁합 보기">
    <FormHead title="💞 궁합 보기" onClose={onDone} />
    <BirthFields draft={me} set={setMe} title="내 생년월일" gender="내 성별" />
    <BirthFields draft={partner} set={setPartner} title="상대 생년월일" gender="상대 성별" />
    <div className="lounge-hongsil-field"><span>어떤 사이예요?</span>{chips(loungeCompatRelations, relation, setRelation, '사이')}</div>
    <label>더 궁금한 것 (선택)<input value={question} onChange={event => setQuestion(event.target.value)} maxLength={200} placeholder="예: 우리 자주 싸우는 이유가 뭘까?" /></label>
    <p className="lounge-hongsil-note">상대의 생년월일도 이 상담 대화에만 남아요. 궁합은 맞춰 가는 힌트로 봐 주세요.</p>
    <SubmitRow label="궁합 보기" sending={sending} disabled={disabled} error={error} />
  </form>;
}

/** 운세: today, this month or this year, against the member's chart. */
function LoungeFortuneForm({ send, disabled, onDone, birth }: ChartFormProps) {
  const [draft, setDraft] = useState(() => birthDraft(birth));
  const [period, setPeriod] = useState<LoungeFortunePeriod>('today');
  const [question, setQuestion] = useState('');
  const { sending, error, submit } = useFormSend(send, onDone);
  return <form className="lounge-hongsil-form" onSubmit={event => void submit(event, () => loungeFortuneFormText({ me: must(birthOf(draft)), period, ...(question.trim() ? { question } : {}) }))} aria-label="운세 보기">
    <FormHead title="🗓️ 운세 보기" onClose={onDone} />
    <div className="lounge-hongsil-field"><span>언제의 운세를 볼까요?</span>{chips(loungeFortunePeriods, period, setPeriod, '기간')}</div>
    <BirthFields draft={draft} set={setDraft} />
    <label>더 궁금한 것 (선택)<input value={question} onChange={event => setQuestion(event.target.value)} maxLength={200} placeholder="예: 오늘 고백해도 될까?" /></label>
    <p className="lounge-hongsil-note">입력한 생년월일은 이 상담 대화에만 남아요. 풀이는 재미로 보는 콘텐츠예요.</p>
    <SubmitRow label="운세 보기" sending={sending} disabled={disabled} error={error} />
  </form>;
}

/** 별자리: the birth date (the time only matters on a boundary day) and what to know. */
function LoungeZodiacForm({ send, disabled, onDone, birth }: ChartFormProps) {
  const [draft, setDraft] = useState(() => ({ ...birthDraft(birth), noTime: birth ? !birth.time : true }));
  const [question, setQuestion] = useState('');
  const { sending, error, submit } = useFormSend(send, onDone);
  return <form className="lounge-hongsil-form" onSubmit={event => void submit(event, () => loungeZodiacFormText({ me: must(birthOf(draft)), ...(question.trim() ? { question } : {}) }))} aria-label="별자리 운세">
    <FormHead title="⭐ 별자리 운세" onClose={onDone} />
    <BirthFields draft={draft} set={setDraft} />
    <label>더 궁금한 것 (선택)<input value={question} onChange={event => setQuestion(event.target.value)} maxLength={200} placeholder="예: 이번 달 연애운은?" /></label>
    <p className="lounge-hongsil-note">태어난 시간은 별자리가 바뀌는 날에만 필요해요. 풀이는 재미로 보는 콘텐츠예요.</p>
    <SubmitRow label="별자리 보기" sending={sending} disabled={disabled} error={error} />
  </form>;
}

/** 기타 상담: the kind of worry first, then what it asks (a dream and the question about it, or what happened and what to know). */
function LoungeCounselForm({ send, disabled, onDone }: { send: Send; disabled: boolean; onDone: () => void }) {
  const [category, setCategory] = useState<LoungeCounselCategory>('dream');
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const fields = loungeCounselCategories[category].fields as readonly LoungeCounselField[];
  const missing = fields.some(field => field.required && !values[field.id]?.trim());
  const set = (id: string, value: string) => setValues(current => ({ ...current, [id]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (missing || sending) return;
    setSending(true); setError('');
    try { await send(loungeCounselFormText(category, values)); onDone(); } catch (err) { setError(errorText(err)); } finally { setSending(false); }
  };
  return <form className="lounge-hongsil-form" onSubmit={event => void submit(event)} aria-label="기타 상담">
    <FormHead title="📝 기타 상담" onClose={onDone} />
    <div className="lounge-tarot-count" role="radiogroup" aria-label="상담 종류">
      {(Object.keys(loungeCounselCategories) as LoungeCounselCategory[]).map(key => <button key={key} type="button" role="radio" aria-checked={category === key} className={category === key ? 'on' : ''}
        onClick={() => { setCategory(key); setValues({}); }}>{loungeCounselCategories[key].icon} {loungeCounselCategories[key].name}</button>)}
    </div>
    {fields.map(field => field.kind === 'chips'
      ? <div key={field.id} className="lounge-hongsil-field"><span>{field.label}</span><div className="lounge-tarot-count" role="radiogroup" aria-label={field.label}>
        {(field.options ?? []).map(option => <button key={option} type="button" role="radio" aria-checked={values[field.id] === option} className={values[field.id] === option ? 'on' : ''}
          onClick={() => set(field.id, values[field.id] === option ? '' : option)}>{option}</button>)}
      </div></div>
      : <label key={field.id}>{field.label}{field.required ? '' : ' (선택)'}{field.kind === 'text'
        ? <textarea value={values[field.id] ?? ''} onChange={event => set(field.id, event.target.value)} maxLength={600} rows={3} placeholder={field.placeholder} />
        : <input value={values[field.id] ?? ''} onChange={event => set(field.id, event.target.value)} maxLength={200} placeholder={field.placeholder} />}</label>)}
    <p className="lounge-hongsil-note">풀이는 재미로 보는 콘텐츠예요. 중요한 결정은 스스로, 필요하면 전문가와 함께 내려 주세요.</p>
    <button type="submit" className="lounge-tarot-confirm" disabled={disabled || sending || missing}>{sending ? <LoaderCircle size={15} className="lounge-spin" /> : null} 한결에게 보여 주기</button>
    {error && <p className="lounge-tarot-error" role="alert">{error}</p>}
  </form>;
}

const elementOrder = ['목', '화', '토', '금', '수'] as const;
const elementLabel: Record<string, string> = { 목: '목(木) 나무', 화: '화(火) 불', 토: '토(土) 흙', 금: '금(金) 쇠', 수: '수(水) 물' };
/** The 사주 chart under its reading: the four pillars in Hanja and Hangul, coloured by element, and the count of each element. */
export function LoungeSajuChart({ chart }: { chart: LoungeSajuDisplay }) {
  const most = Math.max(1, ...Object.values(chart.elements));
  return <section className="lounge-saju-chart" aria-label="사주 원국">
    <div className="lounge-tarot-head"><b>{chart.title ? `${chart.title}의 사주 원국` : '사주 원국'}</b><small>일간 {chart.dayMaster} · {chart.thisYear}</small></div>
    {chart.extra && <div className="lounge-saju-extra"><span>{chart.extra.label}</span>
      {[0, 1].map(index => <b key={index} className={`lounge-saju-char el-${chart.extra!.elements[index]}`}>{chart.extra!.hanja[index]}<small>{chart.extra!.hangul[index]} · {chart.extra!.elements[index]}</small></b>)}
    </div>}
    <div className="lounge-saju-pillars">
      {chart.pillars.map(pillar => <div key={pillar.label} className="lounge-saju-pillar">
        <span className="lounge-saju-label">{pillar.label}</span>
        {pillar.hanja ? [0, 1].map(index => <b key={index} className={`lounge-saju-char el-${pillar.elements[index]}`}>{pillar.hanja[index]}<small>{pillar.hangul[index]} · {pillar.elements[index]}</small></b>)
          : <><b className="lounge-saju-char unknown">?<small>시간 모름</small></b><b className="lounge-saju-char unknown">?<small>&nbsp;</small></b></>}
      </div>)}
    </div>
    <ul className="lounge-saju-elements">
      {elementOrder.map(name => <li key={name}><span className={`el-${name}`}>{elementLabel[name]}</span><i style={{ '--w': `${(chart.elements[name] / most) * 100}%` } as CSSProperties} className={`el-${name}`} /><b>{chart.elements[name]}</b></li>)}
    </ul>
  </section>;
}

/** The 별자리 card under its reading: the sign, its element, mode and ruler, and the house the sun walks through now. */
export function LoungeZodiacCard({ card }: { card: LoungeZodiacDisplay }) {
  return <section className="lounge-saju-chart lounge-zodiac-card" aria-label="별자리">
    <div className="lounge-tarot-head"><b>{card.symbol} {card.sign}</b><small>지금 태양 {card.now}</small></div>
    <dl>
      <div><dt>원소</dt><dd>{card.element}</dd></div><div><dt>성질</dt><dd>{card.mode}</dd></div><div><dt>지배 행성</dt><dd>{card.ruler}</dd></div>
      <div className="wide"><dt>키워드</dt><dd>{card.keywords}</dd></div>
      <div className="wide"><dt>이달 {card.house}하우스</dt><dd>{card.houseMeaning}</dd></div>
    </dl>
  </section>;
}

/** How many face-down cards are laid out to pick from (the server deck is shuffled in full; these are its first places). */
const laidOut = 24;
const shuffleMs = 1100;
// The last card picked sends the cards after this long, so a slip can still be taken back (2026-11-05: a member picked
// three cards and waited, not seeing the button).
const autoSendMs = 700;
// What a laid-out deck has been through, kept outside the component: the room page refreshes every second, and a picker
// that is drawn again must not shuffle again or forget the cards picked (2026-11-05: the shuffle never ended for a member).
const deals = new Map<string, { started: number; picked: number[]; sent?: boolean }>();

/**
 * 홍실당 타로: the deck is shuffled, then dealt face down, and the member picks `count` cards. What a place holds is the
 * server's (the deck was shuffled there with a cryptographic random number); the page only sends which places were picked.
 */
export function LoungeTarotPicker({ dealKey, count, send, disabled }: { dealKey: string; count: number; send: Send; disabled: boolean }) {
  // What this deck went through before a redraw, or a new deal starting now.
  const [kept] = useState(() => {
    const existing = deals.get(dealKey) ?? { started: Date.now(), picked: [] };
    deals.set(dealKey, existing);
    return { started: existing.started, picked: existing.picked, sent: Boolean(existing.sent), dealt: Date.now() - existing.started >= shuffleMs };
  });
  const [round, setRound] = useState(0);
  const [dealt, setDealt] = useState(kept.dealt);
  const [picked, setPicked] = useState<number[]>(kept.picked);
  const [sending, setSending] = useState(false);
  // Sent once: the cards are with 한결 and nothing can be sent again (2026-11-05: 그냥 뽑아 줘 went three times).
  const [sent, setSent] = useState(kept.sent);
  const [error, setError] = useState('');
  const autoSend = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(autoSend.current), []);
  const remember = (next: number[]) => { setPicked(next); deals.set(dealKey, { started: deals.get(dealKey)?.started ?? 0, picked: next }); };
  const pickText = (places: number[]) => `${loungeTarotPickPrefix}${places.map(place => place + 1).join(', ')}`;
  // The shuffle plays (only what is left of it after a redraw), then the cards are dealt; shuffling again plays it again.
  useEffect(() => {
    const left = Math.max(0, shuffleMs - (Date.now() - (deals.get(dealKey)?.started ?? 0)));
    const timer = window.setTimeout(() => setDealt(true), left);
    return () => window.clearTimeout(timer);
  }, [round, dealKey]);
  const reshuffle = () => { deals.set(dealKey, { started: Date.now(), picked: [] }); setPicked([]); setDealt(false); setRound(value => value + 1); };
  const toggle = (place: number) => {
    const next = picked.includes(place) ? picked.filter(item => item !== place) : picked.length < count ? [...picked, place] : picked;
    remember(next);
    window.clearTimeout(autoSend.current);
    if (next.length === count) autoSend.current = window.setTimeout(() => void submit(pickText(next)), autoSendMs);
  };
  const submit = async (text: string) => {
    if (sending || sent) return;
    window.clearTimeout(autoSend.current);
    setSending(true); setSent(true); setError('');
    deals.set(dealKey, { ...(deals.get(dealKey) ?? { started: 0, picked }), sent: true });
    try { await send(text); }
    catch (err) { setSent(false); deals.set(dealKey, { ...(deals.get(dealKey) ?? { started: 0, picked }), sent: false }); setError(errorText(err)); }
    finally { setSending(false); }
  };
  if (sent) return <section className="lounge-tarot-picker sent" aria-label="타로 카드 고르기" role="status">
    <div className="lounge-tarot-head"><b><LoaderCircle size={15} className="lounge-spin" /> 고른 카드를 한결에게 건넸어요</b></div>
  </section>;
  return <section className="lounge-tarot-picker" aria-label="타로 카드 고르기">
    <div className="lounge-tarot-head">
      <b>{dealt ? picked.length === count ? '이 카드로 볼게요…' : `끌리는 카드를 ${count}장 골라 주세요` : '카드를 섞는 중…'}</b>
      {dealt && <small>{picked.length} / {count}</small>}
    </div>
    {!dealt ? <div className="lounge-tarot-shuffle" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => <span key={`${round}-${i}`} className="lounge-tarot-back" style={{ '--i': i } as CSSProperties} />)}
    </div> : <div className="lounge-tarot-table">
      {Array.from({ length: laidOut }, (_, place) => {
        const order = picked.indexOf(place);
        return <button key={`${round}-${place}`} type="button" className={`lounge-tarot-back${order >= 0 ? ' picked' : ''}`} style={{ '--i': place } as CSSProperties}
          disabled={disabled || sending || (order < 0 && picked.length >= count)} aria-pressed={order >= 0} aria-label={`${place + 1}번째 카드`} onClick={() => toggle(place)}>
          {order >= 0 && count > 1 && <span className="lounge-tarot-order">{order + 1}</span>}
        </button>;
      })}
    </div>}
    <div className="lounge-tarot-actions">
      <button type="button" className="lounge-tarot-reshuffle" onClick={reshuffle} disabled={sending || !dealt}><RotateCcw size={14} /> 다시 섞기</button>
      <button type="button" className="lounge-tarot-reshuffle" onClick={() => void submit(loungeTarotDrawForMe)} disabled={disabled || sending}>그냥 뽑아 줘</button>
      <button type="button" className="lounge-tarot-confirm" onClick={() => void submit(pickText(picked))} disabled={disabled || sending || picked.length !== count}>
        {sending ? <LoaderCircle size={15} className="lounge-spin" /> : null} 이 카드로 볼게요
      </button>
    </div>
    {error && <p className="lounge-tarot-error" role="alert">{error}</p>}
  </section>;
}

const numerals = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

/**
 * The cards drawn for a reading, turned face up one after another, in the 1909 Rider-Waite-Smith art (Pamela Colman
 * Smith, public domain; public/lounge/tarot). A reversed card is shown upside down; a missing picture shows its name.
 */
export function LoungeTarotSpread({ cards }: { cards: readonly LoungeTarotDrawn[] }) {
  const [missing, setMissing] = useState<string[]>([]);
  return <section className="lounge-tarot-spread" aria-label="뽑힌 카드">
    {cards.map((card, index) => {
      const [kind, number] = card.id.split('-');
      return <figure key={card.id} className="lounge-tarot-card" style={{ '--i': index } as CSSProperties}>
        <figcaption>{card.position}</figcaption>
        <div className="lounge-tarot-flip"><div className={`lounge-tarot-front${card.reversed ? ' reversed' : ''}${kind === 'major' ? ' major' : ''}`}>
          {missing.includes(card.id) ? <>
            <span className="lounge-tarot-mark">{kind === 'major' ? numerals[Number(number)] ?? '' : '✶'}</span>
            <strong>{card.ko}</strong>
            <small>{card.name}</small>
          </> : <img src={`/lounge/tarot/${card.id}.webp`} alt={`${card.ko} (${card.name})${card.reversed ? ', 역방향' : ''}`} onError={() => setMissing(current => [...current, card.id])} />}
        </div><span className="lounge-tarot-back" aria-hidden="true" /></div>
        <p><b>{card.ko}</b> · {card.reversed ? '역방향' : '정방향'}</p>
      </figure>;
    })}
  </section>;
}
