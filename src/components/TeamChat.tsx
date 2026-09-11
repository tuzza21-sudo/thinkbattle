import { useEffect, useRef, useState } from 'react';
import { getTeamMessages, sendTeamMessage, type TeamMessage } from '../lib/liveSessionApi';
import { supabase } from '../lib/supabase';
import './TeamChat.css';

// Mount with a roster-based key so switching teams never keeps the old chat on screen.
export const TeamChat = ({ roomId, userId, disabled = false }: { roomId: string; userId: string; disabled?: boolean }) => {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const pending = useRef<{ id: string; body: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => void getTeamMessages(roomId).then(value => { if (active) setMessages(value); }).catch(err => { if (active) setError(err.message); });
    refresh();
    const channel = supabase.channel(`team-chat-${roomId}-${crypto.randomUUID()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_debate_team_messages', filter: `room_id=eq.${roomId}` }, refresh).subscribe();
    const timer = window.setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); void supabase.removeChannel(channel); };
  }, [roomId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);
  const send = async () => {
    if (sending || disabled || !draft.trim()) return;
    setSending(true); setError('');
    if (pending.current?.body !== draft.trim()) pending.current = { id: crypto.randomUUID(), body: draft.trim() };
    try {
      await sendTeamMessage(roomId, pending.current.id, pending.current.body);
      pending.current = null; setDraft(''); setMessages(await getTeamMessages(roomId));
    } catch (err) { setError(err instanceof Error ? err.message : '메시지를 보내지 못했습니다. 다시 시도해 주세요.'); }
    finally { setSending(false); }
  };
  return <section className="team-chat" aria-label="팀 채팅"><header><strong>우리 팀 채팅</strong><span>팀원에게만 공개</span></header><p>작전 대화는 공식 발언·AI 평가에 포함되지 않습니다.</p><div className="team-chat-messages" role="log" aria-label="팀 메시지">{!messages.length && <p>팀원과 발언 순서와 전략을 이야기해 보세요.</p>}{messages.map(message => <div key={message.id} className={message.user_id === userId ? 'own' : ''}><small>{message.nickname}</small><p>{message.body}</p></div>)}<div ref={end} /></div><form onSubmit={event => { event.preventDefault(); void send(); }}><input aria-label="팀 메시지 입력" value={draft} maxLength={1000} disabled={disabled || sending} placeholder={disabled ? '토론이 종료되었습니다' : '우리 팀에게 메시지'} onChange={event => setDraft(event.target.value)} /><button type="submit" disabled={disabled || sending || !draft.trim()}>{sending ? '전송 중' : '전송'}</button></form>{error && <p role="alert" className="team-chat-error">{error}</p>}</section>;
};
