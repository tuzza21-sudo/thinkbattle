import { useState } from 'react';
import { Check, Hand, Mic, SkipForward } from 'lucide-react';
import { loungeSessionPrompt, loungeSessionStages, type LoungeSession, type LoungeSessionAction } from '../lib/loungeSession';

type Props = { session: LoungeSession; userId: string; names: Record<string, string>; questions?: string[]; isHost: boolean; blocked: boolean; onAction: (action: LoungeSessionAction) => Promise<void> };
export function LoungeSessionPanel({ session, userId, names, questions, isHost, blocked, onAction }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = session.speaker_id === userId;
  const raised = session.hand_queue.includes(userId);
  const finished = session.state === 'finished';
  const act = async (action: LoungeSessionAction) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onAction(action); } catch (err) { setError(err instanceof Error ? err.message : '차례를 다시 확인해 주세요.'); } finally { setBusy(false); }
  };
  const base = session.round_order.filter(id => id !== session.speaker_id && !session.completed.includes(id));
  return <section className="lounge-session-panel" aria-label="대화 순서와 손들기">
    <div className="lounge-session-heading"><span>함께 나누는 시간 · 약 30분</span><small>{session.stage >= 4 ? session.stage : session.stage + 1} / 5 단계</small></div>
    <h3>{finished ? '함께 이야기해 줘서 고마워요' : loungeSessionStages[session.stage].title}</h3>
    <p className="lounge-session-question">{finished ? '오늘 나눈 서로 다른 생각을 천천히 돌아보세요.' : loungeSessionPrompt(session, questions)}</p>
    {!finished && <>
      <p className="lounge-session-current" role="status">{session.speaker_id ? <><Mic size={15} /><strong>{mine ? '내 차례' : `${names[session.speaker_id] || '참가자'}님의 차례`}</strong><span>{session.turn_kind === 'extra' ? '손들기로 이어가는 이야기' : session.state === 'speaking' ? '편하게 이야기하는 중' : '준비되면 말하기를 눌러 주세요'}</span></> : '추가로 나눌 이야기가 있으면 손을 들어 주세요.'}</p>
      <div className="lounge-session-actions">
        {mine && session.state === 'ready' && <button type="button" className="primary" disabled={busy || blocked} onClick={() => void act('begin')}><Mic size={16} />말하기</button>}
        {mine && session.state === 'speaking' && <button type="button" className="primary" disabled={busy} onClick={() => void act('done')}><Check size={16} />이야기 마쳤어요</button>}
        <button type="button" disabled={busy} aria-pressed={raised} onClick={() => void act(raised ? 'lower' : 'raise')}><Hand size={16} />{raised ? '손 내리기' : '추가로 이야기할게요'}</button>
        {(mine || !session.completed.includes(userId)) && <button type="button" disabled={busy || (mine && blocked)} onClick={() => void act('pass')}><SkipForward size={16} />이번에는 패스</button>}
        {isHost && session.speaker_id && <button type="button" className="host-control" disabled={busy || blocked} onClick={() => void act('yield')}>다음 분께 차례 넘기기</button>}
        {isHost && session.state === 'between' && !base.length && !session.hand_queue.length && <button type="button" disabled={busy || blocked} onClick={() => void act('next_stage')}>{session.stage === 5 ? '대화 마무리하기' : '다음 이야기로'}</button>}
      </div>
      {mine && session.nudged && <p className="lounge-session-nudge" role="status">다른 분의 생각도 들어볼까요? 지금 이야기를 천천히 마무리해 주세요. 이어서 나눌 말은 손들기로 다시 기다릴 수 있어요.</p>}
      {(base.length > 0 || session.hand_queue.length > 0) && <div className="lounge-session-queues">
        {base.length > 0 && <div><span>다음 기본 차례</span><ol>{base.map(id => <li key={id}>{id === userId ? '나' : names[id] || '참가자'}</li>)}</ol></div>}
        {session.hand_queue.length > 0 && <div><span><Hand size={13} /> 추가 이야기 대기</span><ol>{session.hand_queue.map(id => <li key={id}>{id === userId ? '나' : names[id] || '참가자'}</li>)}</ol></div>}
      </div>}
      <small className="lounge-session-note">모두의 기본 차례 후 손든 순서로 이어가요. 짧게 말하거나 패스해도 괜찮아요. 준비한 마이크는 내 발언 중에만 전달돼요.</small>
    </>}
    {error && <p className="lounge-session-error" role="alert">{error}</p>}
  </section>;
}
