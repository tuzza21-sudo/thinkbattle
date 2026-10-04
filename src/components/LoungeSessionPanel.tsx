import { useState, type ReactNode } from 'react';
import { Check, Hand, Mic, SkipForward } from 'lucide-react';
import { isLoungeFreeStage, loungeSessionPrompt, loungeSessionStagesForTopic, type LoungeSession, type LoungeSessionAction } from '../lib/loungeSession';
import type { LoungeTopicBrief } from '../lib/lounge';

type Props = { session: LoungeSession; userId: string; names: Record<string, string>; questions?: string[]; topicBrief?: LoungeTopicBrief | null; isHost: boolean; blocked: boolean; restricted?: boolean; onAction: (action: LoungeSessionAction) => Promise<void>; mode?: 'all' | 'context' | 'controls' | 'status'; microphoneControl?: ReactNode; assistanceControl?: ReactNode };
export function LoungeSessionPanel({ session, userId, names, questions, topicBrief, isHost, blocked, restricted, onAction, mode = 'all', microphoneControl, assistanceControl }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mine = session.speaker_id === userId;
  const raised = session.hand_queue.includes(userId);
  const finished = session.state === 'finished';
  const free = isLoungeFreeStage(session);
  const stages = loungeSessionStagesForTopic(topicBrief);
  const act = async (action: LoungeSessionAction) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onAction(action); } catch (err) { setError(err instanceof Error ? err.message : '차례를 다시 확인해 주세요.'); } finally { setBusy(false); }
  };
  const base = session.round_order.filter(id => (session.turn_kind === 'reply' || id !== session.speaker_id) && !session.completed.includes(id));
  const replies = session.reply_queue ?? [];
  return <section className={`lounge-session-panel session-${mode}`} aria-label={mode === 'context' ? '오늘의 대화 안내' : '대화 순서와 손들기'}>
    {mode !== 'controls' && mode !== 'status' && <>
    <div className="lounge-session-heading"><span>함께 나누는 시간 · 약 30분</span><small>{session.stage + 1} / {stages.length} 단계</small></div>
    <h3>{finished ? '함께 이야기해 줘서 고마워요' : stages[session.stage].title}</h3>
    <p className="lounge-session-question">{finished ? '오늘 나눈 서로 다른 생각을 천천히 돌아보세요.' : loungeSessionPrompt(session, questions, topicBrief)}</p>
    {!finished && session.turn_kind === 'reply' && <p className="lounge-session-reply-context">{names[session.reply_from ?? ''] || '참가자'}님의 질문에 답변</p>}</>}
    {!finished && <>
      {mode !== 'context' && <>
      {mode === 'all' && <div className={`lounge-session-current ${mine && !free ? 'is-my-turn' : ''}`} role="status" aria-atomic="true">
        <small className="lounge-session-progress">{stages[session.stage].title} · {session.stage + 1} / {stages.length} · {free ? '자유 대화' : '순서 발언'}</small>
        {free ? <><strong>지금은 자유 대화</strong><span>AI의 답을 기다리지 않고 서로 이야기해 주세요.</span></> : session.speaker_id ? <><strong><Mic size={18} />{mine ? `지금 내 차례 · ${names[session.speaker_id] || '나'}` : `${names[session.speaker_id] || '참가자'}님의 차례`}</strong><span>{session.turn_kind === 'reply' ? `${names[session.reply_from ?? ''] || '참가자'}님의 질문에 답변 · 패스 가능` : session.turn_kind === 'extra' ? '손들기로 이어가는 이야기' : session.state === 'speaking' ? '편하게 이야기하는 중' : '준비되면 말하기를 눌러 주세요'}</span></> : <><strong>다음 이야기를 기다려요</strong><span>추가로 나눌 이야기가 있으면 손을 들어 주세요.</span></>}
      </div>}
      {mode === 'status' && <small className="lounge-session-progress" role="status">{stages[session.stage].title} · {session.stage + 1} / {stages.length} · {free ? '자유 대화' : '순서 발언'}</small>}
      {mode !== 'status' && <div className="lounge-session-actions">
        {!free && session.state === 'speaking' && mine ? <button type="button" className="primary" disabled={busy} onClick={() => void act('done')} aria-label="이야기 마쳤어요"><Check size={16} /><span className="lounge-action-full">이야기 마쳤어요</span><span className="lounge-action-short" aria-hidden="true">마치기</span></button>
          : !free && <button type="button" className="primary" disabled={!mine || session.state !== 'ready' || busy || blocked} onClick={() => void act('begin')}><Mic size={16} />말하기</button>}
        {microphoneControl}
        <button type="button" disabled={busy || (restricted && !raised)} aria-pressed={raised} onClick={() => void act(raised ? 'lower' : 'raise')} aria-label={raised ? '손 내리기' : '손들기 · 추가로 이야기할게요'}><Hand size={16} /><span className="lounge-action-full">{raised ? '손 내리기' : '손들기'}</span><span className="lounge-action-short" aria-hidden="true">{raised ? '손 내리기' : '손들기'}</span></button>
        {!free && (mine || !session.completed.includes(userId)) && <button type="button" disabled={busy || (mine && blocked)} onClick={() => void act('pass')} aria-label="이번에는 패스"><SkipForward size={16} /><span className="lounge-action-full">이번에는 패스</span><span className="lounge-action-short" aria-hidden="true">패스</span></button>}
        {!free && isHost && session.speaker_id && <button type="button" className="host-control" disabled={busy || blocked} onClick={() => void act('yield')} aria-label="다음 분께 차례 넘기기"><span className="lounge-action-full">다음 분께 차례 넘기기</span><span className="lounge-action-short" aria-hidden="true">다음 차례</span></button>}
        {isHost && (free || (session.state === 'between' && !base.length && !session.hand_queue.length && !replies.length)) && <button type="button" disabled={busy || blocked} onClick={() => void act('next_stage')}>{session.stage === 5 ? '대화 마무리하기' : '다음 이야기로'}</button>}
        {assistanceControl}
      </div>}
      {mode !== 'controls' && <div className="lounge-session-queue-summary" aria-label="발언 대기 명단" aria-live="polite">
        {replies.length > 0 && <div><span>질문 답변 대기</span><p>{replies.map(reply => names[reply.target] || '참가자').join(' → ')}</p></div>}
        <div><span>{free ? '대화 방식' : '다음 차례'}</span><p>{free ? '누구에게든 바로 질문하고 답할 수 있어요' : base.length ? base.map(id => id === userId ? '나' : names[id] || '참가자').join(' → ') : session.stage >= 1 && session.stage <= 4 ? '모두 이야기하면 자유 대화로 이어져요' : '다음 기본 차례는 없어요'}</p></div>
        <div><span><Hand size={12} />손들기 대기</span><p>{session.hand_queue.length ? session.hand_queue.map(id => id === userId ? '나' : names[id] || '참가자').join(' → ') : '아직 손든 사람이 없어요'}</p></div>
      </div>}
      {mode !== 'status' && mine && session.nudged && <p className="lounge-session-nudge" role="status">다른 분의 생각도 들어볼까요? 지금 이야기를 천천히 마무리해 주세요. 이어서 나눌 말은 손들기로 다시 기다릴 수 있어요.</p>}
      </>}
      {mode !== 'controls' && mode !== 'status' && <details className="lounge-session-more"><summary>다음 차례와 대화 안내</summary>{(base.length > 0 || session.hand_queue.length > 0) && <div className="lounge-session-queues">
        {base.length > 0 && <div><span>다음 기본 차례</span><ol>{base.map(id => <li key={id}>{id === userId ? '나' : names[id] || '참가자'}</li>)}</ol></div>}
        {session.hand_queue.length > 0 && <div><span><Hand size={13} /> 추가 이야기 대기</span><ol>{session.hand_queue.map(id => <li key={id}>{id === userId ? '나' : names[id] || '참가자'}</li>)}</ol></div>}
      </div>}
      <small className="lounge-session-note">{free ? '한 차례씩 이야기를 나눈 뒤 자유 대화 중이에요. 모두 마이크를 켜고 바로 질문하거나 답할 수 있어요. 손들기는 이어서 할 말이 있다는 표시예요. 사회자가 필요하면 도움 요청 버튼이나 “사회자, 어떻게 생각해?”로 불러 주세요.' : '각자 화면 순서대로 이야기하거나 패스해 주세요. 주제별 기본 차례가 끝나면 모두 함께 자유롭게 이야기해요. AI의 답변을 기다릴 필요는 없어요.'}</small></details>}
    </>}
    {finished && mode !== 'context' && microphoneControl && <div className="lounge-session-actions">{microphoneControl}</div>}
    {error && <p className="lounge-session-error" role="alert">{error}</p>}
  </section>;
}
