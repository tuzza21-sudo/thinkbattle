import { useState } from 'react';
import { LoaderCircle, MessageSquareQuote, RefreshCw, Send, X } from 'lucide-react';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/**
 * "Suggest my reply" in a one-to-one conversation: three things to say next, fitted to what the character just said.
 * Picking one puts it into the conversation as the member's own words; speaking out loud still works as usual.
 */
export function LoungeReplySuggestions({ suggest, send, disabled }: { suggest: () => Promise<string[]>; send: (text: string) => Promise<void>; disabled: boolean }) {
  const [replies, setReplies] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<'suggest' | 'send' | null>(null);
  const [error, setError] = useState('');
  const run = async (kind: 'suggest' | 'send', task: () => Promise<void>) => {
    if (busy || disabled) return;
    setBusy(kind); setError('');
    try { await task(); } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  };
  const load = () => run('suggest', async () => { setReplies(await suggest()); });
  const choose = (text: string) => run('send', async () => { await send(text); setReplies(null); });
  if (!replies) return <div className="lounge-reply-suggest">
    <button type="button" className="lounge-reply-open" disabled={disabled || Boolean(busy)} onClick={() => void load()}>
      {busy === 'suggest' ? <LoaderCircle size={15} className="lounge-spin" /> : <MessageSquareQuote size={15} />}내 답변 추천받기
    </button>
    {error && <p className="lounge-reply-error" role="alert">{error}</p>}
  </div>;
  return <section className="lounge-reply-suggest open" aria-label="내 답변 추천">
    <div className="lounge-reply-head"><b>이렇게 말해 볼까요?</b><button type="button" className="lounge-reply-close" onClick={() => { setReplies(null); setError(''); }} aria-label="추천 닫기"><X size={15} /></button></div>
    <ul>{replies.map(text => <li key={text}><button type="button" disabled={disabled || Boolean(busy)} onClick={() => void choose(text)}><span>{text}</span>{busy === 'send' ? <LoaderCircle size={14} className="lounge-spin" /> : <Send size={14} />}</button></li>)}</ul>
    <div className="lounge-reply-foot"><small>고르면 내 말로 대화에 올라가요. 소리 내어 말해도 돼요.</small><button type="button" disabled={disabled || Boolean(busy)} onClick={() => void load()}>{busy === 'suggest' ? <LoaderCircle size={13} className="lounge-spin" /> : <RefreshCw size={13} />}다시 추천</button></div>
    {error && <p className="lounge-reply-error" role="alert">{error}</p>}
  </section>;
}
