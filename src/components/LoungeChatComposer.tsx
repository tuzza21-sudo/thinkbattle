import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LoaderCircle, Send } from 'lucide-react';
import { splitLoungeActions } from '../lib/lounge';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
// Phones have no Shift key for a new line, so there Enter writes one and the button sends.
const enterSends = () => typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches;

/** Message text with `*actions*` set apart from what is said. */
export function LoungeMessageText({ text }: { text: string }) {
  return <>{splitLoungeActions(text).map((part, index) => part.action ? <em key={index} className="lounge-action-text">{part.text}</em> : <span key={index}>{part.text}</span>)}</>;
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
export function LoungeTypewriterText({ text, fromStart = false }: { text: string; fromStart?: boolean }) {
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
  const fresh = Math.min(3, visible.length);
  const settled = visible.slice(0, visible.length - fresh), tail = visible.slice(visible.length - fresh);
  // An action whose closing star has not been typed yet is already shown as an action.
  const open = (settled.match(/\*/g)?.length ?? 0) % 2 === 1;
  const openAt = open ? settled.lastIndexOf('*') : -1;
  return <>
    <LoungeMessageText text={open ? settled.slice(0, openAt) : settled} />
    {open && <em className="lounge-action-text">{settled.slice(openAt + 1)}</em>}
    {tail && <span key={shown} className={`lounge-type-fresh ${open ? 'lounge-action-text' : ''}`}>{tail.replace(/\*/g, '')}</span>}
    {shown < text.length && <span className="lounge-type-caret" aria-hidden="true" />}
  </>;
}

/** The message box of a one-to-one conversation. What is typed stays while the character is answering; it is sent after. */
export function LoungeChatComposer({ onSend, disabled, placeholder }: { onSend: (text: string) => Promise<void>; disabled: boolean; placeholder: string }) {
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
  const send = async () => {
    const value = text.trim();
    if (!value || sending || disabled) return;
    setSending(true); setError('');
    try { await onSend(value); setText(''); }
    catch (err) { setError(errorText(err)); }
    finally { setSending(false); area.current?.focus({ preventScroll: true }); }
  };
  return <>
    {error && <p className="lounge-chat-composer-error" role="alert">{error}</p>}
    <form className="lounge-chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      <textarea ref={area} rows={1} value={text} maxLength={1200} placeholder={placeholder} aria-label="메시지 입력"
        onChange={event => setText(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && enterSends()) { event.preventDefault(); void send(); } }} />
      <button type="submit" disabled={!text.trim() || sending || disabled} aria-label="보내기">{sending ? <LoaderCircle size={17} className="lounge-spin" /> : <Send size={17} />}</button>
    </form>
  </>;
}
