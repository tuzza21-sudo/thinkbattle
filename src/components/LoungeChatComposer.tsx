import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, Send, Sparkles, Square } from 'lucide-react';
import { splitLoungeActions, splitLoungeInnerVoice } from '../lib/lounge';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
// Phones have no Shift key for a new line, so there Enter writes one and the button sends.
const enterSends = () => typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches;

/** A character's inner voice, below its reply (engine v4, 2026-11-02). */
const LoungeInnerVoice = ({ text }: { text: string }) => <span className="lounge-inner-voice"><b>속마음</b>{text}</span>;

/**
 * Message text with `*actions*` set apart from what is said. A character's reply (`host`) also has its actions on
 * bracketed lines, and its inner voice below unless the member hides it (`innerVoice` false).
 */
export function LoungeMessageText({ text, host = false, innerVoice = true, streaming = false, fresh = 0 }: { text: string; host?: boolean; innerVoice?: boolean; streaming?: boolean; fresh?: number }) {
  const { reply, inner } = host ? splitLoungeInnerVoice(text) : { reply: text, inner: '' };
  const parts = splitLoungeActions(reply, { parens: host, streaming: streaming || host });
  const freshAt = Math.max(0, parts.reduce((sum, part) => sum + part.text.length, 0) - fresh);
  return <>
    {parts.map((part, index) => {
      const offset = parts.slice(0, index).reduce((sum, previous) => sum + previous.text.length, 0);
      const cut = Math.max(0, Math.min(part.text.length, freshAt - offset));
      const content = <>{part.text.slice(0, cut)}{cut < part.text.length && <span className="lounge-type-fresh">{part.text.slice(cut)}</span>}</>;
      return part.action ? <em key={index} className="lounge-action-text">{content}</em> : <span key={index}>{content}</span>;
    })}
    {inner && innerVoice && <LoungeInnerVoice text={inner} />}
  </>;
}

// How far the reply being written has been typed out, so the saved message that replaces the live one goes on from
// there instead of starting over or appearing all at once.
const typing = { text: '', shown: 0 };
const typeStepMs = 28;

/**
 * A reply typed out from left to right as it arrives, a few characters at a time, each new bit landing with a small
 * pop. It speeds up when far behind so it never lags the model by much. `fromStart` types a new reply from its first
 * character; otherwise only text that continues the reply being typed is animated, and older messages show at once.
 */
export function LoungeTypewriterText({ text: message, fromStart = false, innerVoice = true }: { text: string; fromStart?: boolean; innerVoice?: boolean }) {
  // The reply is typed out; its inner voice shows once the reply is all there.
  const { reply: text, inner } = splitLoungeInnerVoice(message);
  const [shown, setShown] = useState(() => {
    const continues = typing.shown > 0 && text.startsWith(typing.text.slice(0, typing.shown));
    return continues ? Math.min(typing.shown, text.length) : fromStart ? 0 : text.length;
  });
  useEffect(() => {
    if (shown >= text.length) return;
    const timer = setInterval(() => setShown(current => {
      const behind = text.length - current;
      if (behind <= 0) return current;
      // About 35 characters a second, faster when a long stretch has already arrived.
      const next = Math.min(text.length, current + Math.max(1, Math.ceil(behind / 24)));
      typing.text = text; typing.shown = next;
      return next;
    }), typeStepMs);
    return () => clearInterval(timer);
  }, [text, shown]);
  const visible = text.slice(0, shown);
  return <>
    <LoungeMessageText text={visible} host innerVoice={false} streaming={shown < text.length} fresh={shown < text.length ? 3 : 0} />
    {shown < text.length && <span className="lounge-type-caret" aria-hidden="true" />}
    {shown >= text.length && inner && innerVoice && <LoungeInnerVoice text={inner} />}
  </>;
}

/**
 * 받아쓰기 (2026-11-28, by the owner): the mic beside *행동*. It records for as long as the member speaks; about every minute
 * (at the next pause, at the latest after a minute and a half) the piece so far is sent to be written down while the next
 * one is already recording, and the words come into the box in order, to be read over and sent. The browser's own speech
 * recognition was not used: it stops at a pause, and the Android app's web view does not have it.
 */
const dictationMime = () => typeof MediaRecorder === 'undefined' ? undefined
  : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type)) ?? '';
type DictationSession = { stream: MediaStream; recorder: MediaRecorder; context: AudioContext; timer: number; began: number; piece: number; quietSince: number };
function useDictation(dictate: ((audio: Blob) => Promise<string>) | undefined, onText: (text: string) => void, onError: (message: string) => void) {
  const [state, setState] = useState<'idle' | 'recording' | 'writing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const live = useRef<DictationSession | null>(null);
  // Pieces are written down at the same time but come into the box in the order they were said.
  const queue = useRef({ chain: Promise.resolve(), pending: 0, recording: 0 });
  const supported = Boolean(dictate) && dictationMime() !== undefined && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  const settle = () => { if (!live.current && queue.current.pending === 0 && queue.current.recording === 0) setState('idle'); };
  const send = (blob: Blob) => {
    queue.current.recording -= 1;
    if (!dictate || blob.size < 1000) { settle(); return; }
    queue.current.pending += 1;
    const job = dictate(blob);
    queue.current.chain = queue.current.chain.then(() => job).then(text => { if (text.trim()) onText(text.trim()); })
      .catch(error => onError(error instanceof Error ? error.message : '받아쓰기에 실패했어요. 다시 해 주세요.'))
      .finally(() => { queue.current.pending -= 1; settle(); });
  };
  const record = (stream: MediaStream) => {
    const mimeType = dictationMime();
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => send(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
    queue.current.recording += 1;
    recorder.start();
    return recorder;
  };
  const stop = () => {
    const current = live.current;
    if (!current) return;
    live.current = null;
    clearInterval(current.timer);
    // The last piece is sent by the recorder's stop event; the button goes back once every piece is written.
    setState('writing');
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    current.stream.getTracks().forEach(track => track.stop());
    void current.context.close().catch(() => {});
  };
  const start = async () => {
    if (!supported || live.current || state !== 'idle') return;
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { onError('마이크를 쓸 수 없어요. 브라우저나 앱 설정에서 마이크 권한을 허용해 주세요.'); return; }
    const context = new AudioContext();
    // Safari starts it suspended after the permission prompt; without it every moment would read as a pause.
    void context.resume().catch(() => {});
    const analyser = context.createAnalyser(); analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const began = Date.now();
    const session: DictationSession = { stream, recorder: record(stream), context, timer: 0, began, piece: began, quietSince: 0 };
    session.timer = window.setInterval(() => {
      const now = Date.now();
      analyser.getFloatTimeDomainData(samples);
      const level = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      session.quietSince = level < 0.012 ? session.quietSince || now : 0;
      setSeconds(Math.floor((now - session.began) / 1000));
      const age = now - session.piece;
      // The next piece starts before this one stops, at a pause, so no word falls between them.
      if ((age > 50_000 && session.quietSince && now - session.quietSince > 350) || age > 90_000) {
        const old = session.recorder;
        session.recorder = record(stream); session.piece = now;
        old.stop();
      }
      // Half an hour is the most one dictation runs.
      if (now - session.began > 30 * 60_000) stop();
    }, 150);
    live.current = session;
    setSeconds(0); setState('recording');
  };
  useEffect(() => () => {
    const current = live.current;
    if (!current) return;
    live.current = null; clearInterval(current.timer);
    current.recorder.onstop = null;
    if (current.recorder.state !== 'inactive') current.recorder.stop();
    current.stream.getTracks().forEach(track => track.stop());
    void current.context.close().catch(() => {});
  }, []);
  return { supported, state, seconds, start, stop };
}

/** The message box of a one-to-one conversation. What is typed stays while the character is answering; it is sent after. */
export function LoungeChatComposer({ onSend, disabled, placeholder, onNext, nextDisabled, onDictate }: { onSend: (text: string) => Promise<void>; disabled: boolean; placeholder: string; /** 받아쓰기: writes a recording down (the mic button shows when given). */ onDictate?: (audio: Blob) => Promise<string>; /** What the send button does when nothing is typed: asks the character to carry the talk on (it was the topic button). */ onNext?: () => void; nextDisabled?: boolean }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }, [text]);
  const appendSpoken = useCallback((spoken: string) => setText(current => current && !/\s$/.test(current) ? `${current} ${spoken}` : `${current}${spoken}`), []);
  const dictation = useDictation(onDictate, appendSpoken, setError);
  const empty = !text.trim();
  const canNext = empty && Boolean(onNext) && !nextDisabled;
  const send = async () => {
    const value = text.trim();
    if (!value || sending || disabled) return;
    setSending(true); setError('');
    try { await onSend(value); setText(''); }
    catch (err) { setError(errorText(err)); }
    finally { setSending(false); area.current?.focus({ preventScroll: true }); }
  };
  // An action goes between two asterisks: the button puts them in (around the selection, if any) with the caret inside.
  const insertAction = () => {
    const element = area.current;
    const start = element?.selectionStart ?? text.length, end = element?.selectionEnd ?? text.length;
    const before = text.slice(0, start), chosen = text.slice(start, end), after = text.slice(end);
    const gap = before && !/\s$/.test(before) ? ' ' : '';
    setText(`${before}${gap}*${chosen}*${after}`);
    const caret = before.length + gap.length + 1 + chosen.length;
    requestAnimationFrame(() => { element?.focus({ preventScroll: true }); element?.setSelectionRange(caret, caret); });
  };
  return <>
    {error && <p className="lounge-chat-composer-error" role="alert">{error}</p>}
    <form className="lounge-chat-composer" onSubmit={event => { event.preventDefault(); if (empty) { if (canNext && !sending) onNext?.(); return; } void send(); }}>
      <button type="button" className="lounge-chat-action" onClick={insertAction} disabled={disabled} title="*행동*을 넣어요" aria-label="행동 넣기">*행동*</button>
      {dictation.supported && <button type="button" className={`lounge-chat-mic${dictation.state === 'recording' ? ' is-recording' : ''}`} disabled={dictation.state === 'writing'}
        onClick={() => { setError(''); if (dictation.state === 'recording') dictation.stop(); else void dictation.start(); }}
        aria-label={dictation.state === 'recording' ? '받아쓰기 멈추기' : dictation.state === 'writing' ? '받아쓰는 중' : '말로 입력하기'} title={dictation.state === 'recording' ? '누르면 멈추고 글로 옮겨요' : '말로 입력해요'}>
        {dictation.state === 'recording' ? <><Square size={12} fill="currentColor" /><span>{Math.floor(dictation.seconds / 60)}:{String(dictation.seconds % 60).padStart(2, '0')}</span></> : dictation.state === 'writing' ? <LoaderCircle size={16} className="lounge-spin" /> : <Mic size={16} />}
      </button>}
      <textarea ref={area} rows={1} value={text} maxLength={1200} placeholder={placeholder} aria-label="메시지 입력"
        onChange={event => setText(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && enterSends()) { event.preventDefault(); void send(); } }} />
      <button type="submit" className={empty && onNext ? 'is-next' : undefined} disabled={sending || (empty ? !canNext : disabled)} aria-label={empty && onNext ? '다음 이야기로 이어가기' : '보내기'} title={empty && onNext ? '다음 이야기로 이어가기' : undefined}>{sending ? <LoaderCircle size={17} className="lounge-spin" /> : empty && onNext ? <Sparkles size={17} /> : <Send size={17} />}</button>
    </form>
  </>;
}
