import { useEffect, useRef, useState, type RefObject } from 'react';
import { LoaderCircle, MessageSquareQuote, RefreshCw, Send, X } from 'lucide-react';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

export type LoungeReplyApi = { suggest: () => Promise<string[]>; send: (text: string) => Promise<void> };

/**
 * "Suggest my reply" in a one-to-one conversation: three things to say next, fitted to what the character just said.
 * Picking one puts it into the conversation as the member's own words; speaking out loud still works as usual.
 * The button lives in the room's bottom bar and the panel opens right above it, so both share this state.
 */
export function useLoungeReplies(api: LoungeReplyApi | undefined, disabled: boolean) {
  const [replies, setReplies] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<'suggest' | 'send' | null>(null);
  const [error, setError] = useState('');
  const run = async (kind: 'suggest' | 'send', task: () => Promise<void>) => {
    if (!api || busy || disabled) return;
    setBusy(kind); setError('');
    try { await task(); } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  };
  return {
    replies, busy, error, disabled: disabled || !api,
    load: () => run('suggest', async () => { setReplies(await api!.suggest()); }),
    choose: (text: string) => run('send', async () => { await api!.send(text); setReplies(null); }),
    close: () => { setReplies(null); setError(''); },
  };
}
export type LoungeReplies = ReturnType<typeof useLoungeReplies>;

/** Same look as the other buttons of the bottom bar. */
export function LoungeReplyButton({ state }: { state: LoungeReplies }) {
  return <button type="button" className="lounge-ask-button lounge-reply-trigger" disabled={state.disabled || Boolean(state.busy)} aria-expanded={Boolean(state.replies)} onClick={() => void (state.replies ? state.close() : state.load())}>
    {state.busy === 'suggest' && !state.replies ? <LoaderCircle size={17} className="lounge-spin" /> : <MessageSquareQuote size={17} />}내 답변 추천받기
  </button>;
}

/** Full-width panel above the bottom bar. Opening it scrolls the conversation to its newest message so nothing is hidden behind it. */
export function LoungeReplyPanel({ state, logRef, followRef }: { state: LoungeReplies; logRef: RefObject<HTMLDivElement | null>; followRef: RefObject<boolean> }) {
  const panel = useRef<HTMLElement>(null);
  const shown = Boolean(state.replies);
  useEffect(() => {
    if (!shown) return;
    followRef.current = true;
    const frame = requestAnimationFrame(() => {
      const log = logRef.current;
      if (log) log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
      panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [shown, logRef, followRef]);
  if (!state.replies) return state.error ? <p className="lounge-reply-error" role="alert">{state.error}</p> : null;
  return <section className="lounge-reply-panel" ref={panel} aria-label="내 답변 추천">
    <div className="lounge-reply-head"><b>이렇게 말해 볼까요?</b><button type="button" className="lounge-reply-close" onClick={state.close} aria-label="추천 닫기"><X size={16} /></button></div>
    <ul>{state.replies.map(text => <li key={text}><button type="button" disabled={state.disabled || Boolean(state.busy)} onClick={() => void state.choose(text)}><span>{text}</span>{state.busy === 'send' ? <LoaderCircle size={15} className="lounge-spin" /> : <Send size={15} />}</button></li>)}</ul>
    <div className="lounge-reply-foot"><small>고르면 내 말로 대화에 올라가요. 소리 내어 말해도 돼요.</small><button type="button" disabled={state.disabled || Boolean(state.busy)} onClick={() => void state.load()}>{state.busy === 'suggest' ? <LoaderCircle size={13} className="lounge-spin" /> : <RefreshCw size={13} />}다시 추천</button></div>
    {state.error && <p className="lounge-reply-error" role="alert">{state.error}</p>}
  </section>;
}
