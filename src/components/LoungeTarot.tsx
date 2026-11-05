import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  loungeSajuCalendars, loungeSajuFocuses, loungeSajuFormText, loungeSajuGenders, loungeTarotDrawForMe, loungeTarotFormText, loungeTarotPickPrefix,
  type LoungeSajuInput,
} from '../lib/loungeConsult';
import type { LoungeTarotDrawn, LoungeTarotSpread } from '../lib/loungeTarot';
import './LoungeTarot.css';

type Send = (text: string) => Promise<void>;
const errorText = (err: unknown) => err instanceof Error ? err.message : '보내지 못했어요. 다시 눌러 주세요.';

/**
 * The 홍실당 button under the conversation (2026-11-05): the consulting room is a conversation, and what needs a form starts
 * here — tarot (the question and how many cards) and 사주 (the birth). It blinks red when it is the moment to use it (a new
 * guest, or tarot or 사주 just mentioned).
 */
export function LoungeHongsilBar({ hint, send, disabled }: { hint: boolean; send: Send; disabled: boolean }) {
  const [view, setView] = useState<'closed' | 'menu' | 'tarot' | 'saju'>('closed');
  const [seen, setSeen] = useState(false);
  const close = () => setView('closed');
  return <div className="lounge-hongsil-bar">
    {view === 'menu' && <div className="lounge-hongsil-menu" role="menu" aria-label="홍실당 상담">
      <button type="button" role="menuitem" onClick={() => setView('tarot')}>🃏 타로 보기<small>궁금한 걸 적고 카드를 직접 골라요</small></button>
      <button type="button" role="menuitem" onClick={() => setView('saju')}>🔮 사주 보기<small>생년월일로 타고난 기질과 올해 흐름</small></button>
    </div>}
    {view === 'tarot' && <LoungeTarotForm send={send} disabled={disabled} onDone={close} />}
    {view === 'saju' && <LoungeSajuForm send={send} disabled={disabled} onDone={close} />}
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

const years = Array.from({ length: 2049 - 1900 + 1 }, (_, i) => 2049 - i);
/** 사주: the birth (solar or lunar date, the time or not, the gender for the luck pillars) and what to look at. */
function LoungeSajuForm({ send, disabled, onDone }: { send: Send; disabled: boolean; onDone: () => void }) {
  const [year, setYear] = useState(1995), [month, setMonth] = useState(1), [day, setDay] = useState(1);
  const [calendar, setCalendar] = useState<LoungeSajuInput['calendar']>('solar');
  const [time, setTime] = useState(''), [noTime, setNoTime] = useState(false);
  const [gender, setGender] = useState<LoungeSajuInput['gender']>('female');
  const [focus, setFocus] = useState<string>('전부');
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const days = calendar === 'solar' ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 30;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    if (!noTime && !/^\d{2}:\d{2}$/.test(time)) { setError('태어난 시간을 적거나 "시간 몰라요"를 눌러 주세요.'); return; }
    setSending(true); setError('');
    const date = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, days)).padStart(2, '0')}`;
    try { await send(loungeSajuFormText({ date, calendar, ...(noTime ? {} : { time }), gender, focus, ...(question.trim() ? { question } : {}) })); onDone(); }
    catch (err) { setError(errorText(err)); } finally { setSending(false); }
  };
  const chips = <T extends string>(options: Record<T, string> | readonly T[], value: T, set: (value: T) => void, label: string) =>
    <div className="lounge-tarot-count" role="radiogroup" aria-label={label}>{(Array.isArray(options) ? options.map(item => [item, item]) : Object.entries(options)).map(([key, text]) =>
      <button key={key} type="button" role="radio" aria-checked={value === key} className={value === key ? 'on' : ''} onClick={() => set(key as T)}>{text as string}</button>)}</div>;
  return <form className="lounge-hongsil-form" onSubmit={event => void submit(event)} aria-label="사주 보기">
    <FormHead title="🔮 사주 보기" onClose={onDone} />
    <div className="lounge-hongsil-field"><span>생년월일</span><div className="lounge-hongsil-date">
      <select value={year} onChange={event => setYear(Number(event.target.value))} aria-label="태어난 해">{years.map(item => <option key={item} value={item}>{item}년</option>)}</select>
      <select value={month} onChange={event => setMonth(Number(event.target.value))} aria-label="태어난 달">{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}월</option>)}</select>
      <select value={Math.min(day, days)} onChange={event => setDay(Number(event.target.value))} aria-label="태어난 날">{Array.from({ length: days }, (_, i) => <option key={i} value={i + 1}>{i + 1}일</option>)}</select>
    </div>{chips(loungeSajuCalendars, calendar, setCalendar, '양력 음력')}</div>
    <div className="lounge-hongsil-field"><span>태어난 시간</span><div className="lounge-hongsil-time">
      <input type="time" value={time} onChange={event => setTime(event.target.value)} disabled={noTime} aria-label="태어난 시간" />
      <label className="lounge-hongsil-check"><input type="checkbox" checked={noTime} onChange={event => setNoTime(event.target.checked)} /> 시간 몰라요</label>
    </div></div>
    <div className="lounge-hongsil-field"><span>성별 (대운 계산에 써요)</span>{chips(loungeSajuGenders, gender, setGender, '성별')}</div>
    <div className="lounge-hongsil-field"><span>무엇을 볼까요?</span>{chips(loungeSajuFocuses, focus, setFocus, '볼 것')}</div>
    <label>더 궁금한 것 (선택)<input value={question} onChange={event => setQuestion(event.target.value)} maxLength={200} placeholder="예: 올해 이직해도 괜찮을까?" /></label>
    <p className="lounge-hongsil-note">입력한 생년월일은 이 상담 대화에만 남아요. 풀이는 재미로 보는 콘텐츠예요.</p>
    <button type="submit" className="lounge-tarot-confirm" disabled={disabled || sending}>{sending ? <LoaderCircle size={15} className="lounge-spin" /> : null} 사주 보기</button>
    {error && <p className="lounge-tarot-error" role="alert">{error}</p>}
  </form>;
}

/** How many face-down cards are laid out to pick from (the server deck is shuffled in full; these are its first places). */
const laidOut = 24;
const shuffleMs = 1100;
// What a laid-out deck has been through, kept outside the component: the room page refreshes every second, and a picker
// that is drawn again must not shuffle again or forget the cards picked (2026-11-05: the shuffle never ended for a member).
const deals = new Map<string, { started: number; picked: number[] }>();

/**
 * 홍실당 타로: the deck is shuffled, then dealt face down, and the member picks `count` cards. What a place holds is the
 * server's (the deck was shuffled there with a cryptographic random number); the page only sends which places were picked.
 */
export function LoungeTarotPicker({ dealKey, count, send, disabled }: { dealKey: string; count: number; send: Send; disabled: boolean }) {
  // What this deck went through before a redraw, or a new deal starting now.
  const [kept] = useState(() => {
    const existing = deals.get(dealKey) ?? { started: Date.now(), picked: [] };
    deals.set(dealKey, existing);
    return { started: existing.started, picked: existing.picked, dealt: Date.now() - existing.started >= shuffleMs };
  });
  const [round, setRound] = useState(0);
  const [dealt, setDealt] = useState(kept.dealt);
  const [picked, setPicked] = useState<number[]>(kept.picked);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const remember = (next: number[]) => { setPicked(next); deals.set(dealKey, { started: deals.get(dealKey)?.started ?? 0, picked: next }); };
  // The shuffle plays (only what is left of it after a redraw), then the cards are dealt; shuffling again plays it again.
  useEffect(() => {
    const left = Math.max(0, shuffleMs - (Date.now() - (deals.get(dealKey)?.started ?? 0)));
    const timer = window.setTimeout(() => setDealt(true), left);
    return () => window.clearTimeout(timer);
  }, [round, dealKey]);
  const reshuffle = () => { deals.set(dealKey, { started: Date.now(), picked: [] }); setPicked([]); setDealt(false); setRound(value => value + 1); };
  const toggle = (place: number) => remember(picked.includes(place) ? picked.filter(item => item !== place) : picked.length < count ? [...picked, place] : picked);
  const submit = async (text: string) => {
    if (sending) return;
    setSending(true); setError('');
    try { await send(text); } catch (err) { setError(errorText(err)); } finally { setSending(false); }
  };
  return <section className="lounge-tarot-picker" aria-label="타로 카드 고르기">
    <div className="lounge-tarot-head">
      <b>{dealt ? `끌리는 카드를 ${count}장 골라 주세요` : '카드를 섞는 중…'}</b>
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
      <button type="button" className="lounge-tarot-confirm" onClick={() => void submit(`${loungeTarotPickPrefix}${picked.map(place => place + 1).join(', ')}`)} disabled={disabled || sending || picked.length !== count}>
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
