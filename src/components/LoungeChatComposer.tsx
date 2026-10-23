import { useLayoutEffect, useRef, useState } from 'react';
import { LoaderCircle, Send } from 'lucide-react';
import { splitLoungeActions } from '../lib/lounge';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
// Phones have no Shift key for a new line, so there Enter writes one and the button sends.
const enterSends = () => typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches;

/** Message text with `*actions*` set apart from what is said. */
export function LoungeMessageText({ text }: { text: string }) {
  return <>{splitLoungeActions(text).map((part, index) => part.action ? <em key={index} className="lounge-action-text">{part.text}</em> : <span key={index}>{part.text}</span>)}</>;
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
