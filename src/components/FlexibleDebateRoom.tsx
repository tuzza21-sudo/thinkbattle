import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mic, Pause, Play, Send, SkipForward, Square, Volume2 } from 'lucide-react';
import type { AppUser, LiveDebateArgument, LiveDebateEvaluation, LiveDebateLobbyParticipant, LiveDebateRoomSummary } from '../types';
import { buildSessionPhases, canSpeakInSession, getSessionRemaining, getSessionTotals, SESSION_STAGES, type SessionSnapshot } from '../lib/liveDebateSession';
import { controlSession, beginSpeech, endSpeech, submitSessionArgument, subscribeSession, saveSessionEvaluation, type SessionAction } from '../lib/liveSessionApi';
import { getLobbyParticipants, getLiveDebateArguments, getLiveDebateEvaluation, getLiveDebateAudioUrl } from '../lib/debateRooms';
import { generateLiveDebateEvaluation } from '../lib/api';
import { useSessionRecordings } from '../lib/useSessionRecordings';
import { useSessionAudio } from '../lib/useSessionAudio';
import { saveSessionHistory } from '../lib/liveSessionHistory';
import { TeamChat } from './TeamChat';
import { ThinkingCoach } from './ThinkingCoach';
import { LiveDebateEvaluationModal } from './LiveDebateEvaluationModal';
import { TopicBriefingDetails } from './TopicBriefingDetails';
import './FlexibleDebateRoom.css';

const clock = (seconds: number) => `${Math.floor(Math.abs(seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.abs(seconds) % 60).toString().padStart(2, '0')}`;
const sideLabel = (position?: string | null) => position === 'affirmative' ? '찬성' : position === 'negative' ? '반대' : '진행자';

export const FlexibleDebateRoom = ({ room, user }: { room: LiveDebateRoomSummary; user: AppUser }) => {
  const navigate = useNavigate();
  const config = room.sessionConfig!;
  const phases = useMemo(() => buildSessionPhases(config), [config]);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [members, setMembers] = useState<LiveDebateLobbyParticipant[]>([]);
  const [argumentsList, setArguments] = useState<LiveDebateArgument[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [evaluation, setEvaluation] = useState<LiveDebateEvaluation | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [now, setNow] = useState(() => performance.now());
  const sync = useRef({ local: 0, server: 0, revision: -1 });
  const [clockSync, setClockSync] = useState({ local: 0, server: 0 });
  const fetching = useRef(false);
  const recordingPhase = useRef('');
  const textAttempt = useRef<{ id: string; content: string; phaseId: string } | null>(null);
  const playing = useRef<HTMLAudioElement | null>(null);
  const lastRecord = useRef<HTMLDivElement>(null);
  const historyKey = useRef('');
  const historySaving = useRef(false);
  const accept = useCallback((state: SessionSnapshot) => {
    if (state.revision < sync.current.revision) return;
    sync.current = { local: performance.now(), server: Date.parse(state.server_now), revision: state.revision };
    setClockSync({ local: sync.current.local, server: sync.current.server });
    setSnapshot(state); setSyncError('');
  }, []);
  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const state = await controlSession(room.roomId);
      accept(state);
      const [roster, records] = await Promise.all([getLobbyParticipants(room.roomId), getLiveDebateArguments(room.roomId)]);
      setMembers(roster); setArguments(records);
      if (state.finished_at) { const saved = await getLiveDebateEvaluation(room.roomId); if (saved) setEvaluation(saved); }
    } catch (err) { setSyncError(err instanceof Error ? err.message : '진행 정보를 동기화하지 못했습니다.'); }
    finally { fetching.current = false; }
  }, [accept, room.roomId]);
  const recordingQueue = useSessionRecordings(room, refresh);
  const pendingRecordings = recordingQueue.recordings;
  useEffect(() => {
    if (room.status === 'open') { navigate(`/battle/lobby/${encodeURIComponent(room.roomId)}`, { replace: true }); return; }
    const initial = window.setTimeout(() => void refresh(), 0);
    const unsubscribe = subscribeSession(room.roomId, () => void refresh());
    const poll = window.setInterval(() => void refresh(), 2000);
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(initial); unsubscribe(); clearInterval(poll); clearInterval(timer); document.removeEventListener('visibilitychange', visible); playing.current?.pause(); };
  }, [navigate, refresh, room.roomId, room.status]);
  useEffect(() => { lastRecord.current?.scrollIntoView({ block: 'nearest' }); }, [argumentsList.length]);
  const me = members.find(member => member.userId === user.id);
  const phase = snapshot ? phases[snapshot.phase_index] : undefined;
  const finished = Boolean(snapshot?.finished_at);
  useEffect(() => {
    if (!snapshot?.finished_at || snapshot.pending_speeches > 0 || !me?.position || !argumentsList.length) return;
    const key = `${argumentsList.length}:${argumentsList.at(-1)?.id}:${evaluation?.generatedAt || ''}`;
    if (historyKey.current === key || historySaving.current) return;
    const timer = window.setTimeout(() => {
      historySaving.current = true;
      void saveSessionHistory(room, user, snapshot, argumentsList, evaluation, me.position!).then(() => { historyKey.current = key; }).catch(() => setError('내 토론 기록을 저장하지 못했습니다. 연결이 복구되면 다시 저장합니다.')).finally(() => { historySaving.current = false; });
    }, 100);
    return () => clearTimeout(timer);
  }, [argumentsList, evaluation, me?.position, room, snapshot, user]);
  const stale = clockSync.local === 0 || now - clockSync.local > 8000;
  const remaining = snapshot ? getSessionRemaining(snapshot, clockSync.server + now - clockSync.local) : 0;
  const running = !!phase && !finished && !snapshot?.paused_at && !stale && (config.progressionMode === 'moderated' || remaining > 0);
  const maySpeak = running && canSpeakInSession(phase, me, config);
  const controller = !!me && (room.hostId === user.id || me.role === 'moderator');
  const audibleIds = useMemo(() => running ? members.filter(member => canSpeakInSession(phase, member, config)).map(member => member.userId) : [], [config, members, phase, running]);
  const audio = useSessionAudio(room.roomId, room.voiceEnabled, audibleIds);
  const { recording, stop: stopRecording } = audio;
  useEffect(() => { if (recording && (!maySpeak || recordingPhase.current !== phase?.id)) stopRecording(); }, [recording, stopRecording, maySpeak, phase?.id]);
  const control = async (action: SessionAction) => {
    if (!snapshot || busy) return;
    setBusy(true); setError('');
    try { accept(await controlSession(room.roomId, action, snapshot.revision)); }
    catch (err) { setError(err instanceof Error ? err.message : '진행을 변경하지 못했습니다.'); await refresh(); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!phase || !maySpeak || busy || !draft.trim()) return;
    setBusy(true); setError('');
    if (textAttempt.current?.content !== draft.trim() || textAttempt.current.phaseId !== phase.id) textAttempt.current = { id: crypto.randomUUID(), content: draft.trim(), phaseId: phase.id };
    try { const attempt = textAttempt.current; await submitSessionArgument(room.roomId, attempt.id, attempt.content, attempt.phaseId); setDraft(''); textAttempt.current = null; await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : '발언을 저장하지 못했습니다. 입력한 내용은 유지됩니다.'); }
    finally { setBusy(false); }
  };
  const startRecording = async () => {
    if (!phase || !maySpeak || voiceBusy) return;
    setVoiceBusy(true); setError(''); let ticket: string | undefined;
    try {
      ticket = await beginSpeech(room.roomId, phase.id);
      recordingPhase.current = phase.id;
      const captured = { id: crypto.randomUUID(), ticket, phaseId: phase.id, label: phase.label };
      await audio.start(blob => {
        void recordingQueue.process({ ...captured, blob });
      });
      // Permission prompts may outlast the original phase. Recheck before keeping the mic open.
      const current = await controlSession(room.roomId); accept(current);
      if (current.finished_at || current.paused_at || phases[current.phase_index]?.id !== captured.phaseId) audio.stop();
    } catch (err) { if (ticket) void endSpeech(ticket, true); audio.stop(); setError(err instanceof Error ? err.message : '마이크를 시작하지 못했습니다.'); }
    finally { setVoiceBusy(false); }
  };
  const evaluate = async () => {
    if (!finished || evaluating || (snapshot?.pending_speeches ?? 0) > 0 || pendingRecordings.length > 0 || voiceBusy) return;
    setEvaluating(true); setShowEvaluation(true); setEvaluationError(null);
    try {
      const existing = await getLiveDebateEvaluation(room.roomId);
      if (existing) { setEvaluation(existing); return; }
      const records = await getLiveDebateArguments(room.roomId);
      if (!records.length) throw new Error('기록된 공식 발언이 없어 평가를 만들 수 없습니다.');
      const participants = members.filter(member => !member.isAi && member.position && member.role !== 'moderator').map(member => ({ userId: member.userId, nickname: member.nickname, position: member.position!, role: member.role || 'debater' as const }));
      const result = await generateLiveDebateEvaluation(room.topic, participants, records, { description: room.topicDescription, level: room.debateLevel, sessionConfig: config, assignments: Object.fromEntries(members.map(member => [member.userId, member.phaseIds])) });
      await saveSessionEvaluation(room.roomId, result);
      // Always read through the participant-scoped report RPC.
      setEvaluation(await getLiveDebateEvaluation(room.roomId));
    } catch (err) { setEvaluationError(err instanceof Error ? err.message : '평가를 만들지 못했습니다.'); }
    finally { setEvaluating(false); }
  };
  const playRecording = async (path: string) => {
    try { playing.current?.pause(); playing.current = new Audio(await getLiveDebateAudioUrl(path)); await playing.current.play(); }
    catch (err) { setError(err instanceof Error ? err.message : '녹음을 재생하지 못했습니다.'); }
  };
  const chatKey = `${me?.position}:${members.filter(member => member.position === me?.position && member.role === 'debater' && !member.isAi).map(member => member.userId).sort().join(',')}`;
  const coachStage = phase?.stageId === 'opening' ? 'opening' as const : phase?.stageId === 'cross-question' ? (phase.position === me?.position ? 'cross_question' as const : 'cross_answer' as const) : 'rebuttal' as const;
  const totals = getSessionTotals(config);
  return <main className="flex-debate">
    <nav><button onClick={() => navigate('/debate')}><ArrowLeft size={16} />토론 목록</button><span>ThinkFit · {room.teamSize}:{room.teamSize} 토론</span><span className={stale ? 'sync-lost' : ''}>{stale ? '연결 확인 중' : '진행 동기화됨'}</span></nav>
    <header className="flex-debate-heading"><div><small>함께 생각하고, 근거로 이야기하기</small><h1>{room.topic}</h1></div><span>{config.progressionMode === 'automatic' ? '자동진행' : '진행자 진행'} · 예정 {clock(totals.totalSeconds)}{totals.strategySeconds ? ' (작전시간 포함)' : ''}</span></header>
    <ol className="flex-stage-track">{SESSION_STAGES.filter(stage => config.stages.some(item => item.id === stage.id && item.enabled)).map((stage, index) => <li key={stage.id} aria-current={phase?.stageId === stage.id ? 'step' : undefined}><span>{index + 1}</span>{stage.label}</li>)}</ol>
    {(error || syncError || audio.error) && <div className="flex-error" role="alert">{error || syncError || audio.error}<button onClick={() => { setError(''); void refresh(); }}>다시 확인</button></div>}
    <section className={`flex-current-session ${phase?.kind === 'strategy' ? 'strategy' : ''}`} aria-label="현재 세션"><div><small>{finished ? '모든 세션 완료' : phase?.kind === 'strategy' ? '팀 작전회의' : `세션 ${(snapshot?.phase_index ?? 0) + 1} / ${phases.length}`}</small><h2>{finished ? '토론이 끝났습니다' : phase?.label || '진행 정보를 불러오는 중…'}</h2><p>{finished ? '공식 발언을 돌아보고 토론 평가를 확인해 보세요.' : phase?.kind === 'strategy' ? '양 팀이 동시에 준비합니다. 우리 팀 채팅에서 다음 발언을 상의하세요.' : phase?.kind === 'cross_examination' ? `${sideLabel(phase.position)} 측이 질문 · ${sideLabel(phase.position === 'affirmative' ? 'negative' : 'affirmative')} 측이 답변 · 횟수 제한 없음` : `${sideLabel(phase?.position)} 측 ${config.assignmentMode === 'free' ? '팀원 누구나' : '담당자'}가 발언합니다.`}</p></div><div className={`flex-timer ${remaining <= 0 ? 'overtime' : ''}`} role="timer"><strong>{finished ? '완료' : clock(remaining)}</strong><span>{finished ? `${argumentsList.length}개 공식 발언` : snapshot?.paused_at ? '일시정지' : remaining <= 0 ? config.progressionMode === 'moderated' ? '시간 초과 · 진행자 전환 대기' : '다음 세션 동기화 중' : '남은 시간'}</span></div></section>
    {controller && !finished && <div className="flex-controls"><span>방장·진행자 제어</span><button disabled={busy || stale} onClick={() => void control(snapshot?.paused_at ? 'resume' : 'pause')}>{snapshot?.paused_at ? <Play size={14} /> : <Pause size={14} />}{snapshot?.paused_at ? '재개' : '일시정지'}</button><button disabled={busy || stale} onClick={() => void control('extend')}>+30초</button><button disabled={busy || stale} onClick={() => void control('next')}><SkipForward size={14} />{snapshot?.phase_index === phases.length - 1 ? '토론 마치기' : '다음 세션'}</button></div>}
    <div className="flex-debate-layout"><div className="flex-discussion">
      <section className="flex-arguments"><header><h2>공식 발언</h2><span>발언 전송 후에도 세션은 계속됩니다</span></header><div className="flex-argument-log" role="log" aria-label="토론 발언">{!argumentsList.length && <div className="flex-empty">첫 발언을 기다리고 있어요.<p>주장과 이유, 근거를 차례로 이야기해 보세요.</p></div>}{argumentsList.map(argument => <article key={argument.id} className={members.find(member => member.userId === argument.senderId)?.position || ''}><header><strong>{argument.senderName}</strong><span>{argument.phaseLabel}</span>{argument.source === 'voice' && <Mic size={12} />}</header><p>{argument.content}</p>{argument.audioPath && argument.senderId === user.id && <button onClick={() => void playRecording(argument.audioPath!)}><Volume2 size={13} /> 내 녹음 듣기</button>}</article>)}<div ref={lastRecord} /></div></section>
      {!finished && <section className="flex-composer"><header><strong>{phase?.kind === 'strategy' ? '팀과 다음 발언을 준비하세요' : maySpeak ? phase?.kind === 'cross_examination' ? (phase.position === me?.position ? '질문을 이어가세요' : '상대의 질문에 답하세요') : '내 발언' : snapshot?.paused_at ? '토론이 잠시 멈췄습니다' : '상대의 발언을 들으며 준비하세요'}</strong><span>{sideLabel(me?.position)} · {config.assignmentMode === 'free' ? '자유 참여' : '담당 세션 참여'}</span></header>
        {me?.position && phase && phase.kind !== 'strategy' && phase.stageId !== 'closing' && <ThinkingCoach context={{ sessionId: room.roomId, topic: room.topic, topicContext: room.topicDescription, position: me.position, level: room.debateLevel, language: room.language, stage: coachStage, stepId: phase.id, turns: argumentsList.flatMap(argument => { const side = members.find(member => member.userId === argument.senderId)?.position; return side ? [{ id: argument.id, side: side === me.position ? 'own' as const : 'opponent' as const, content: argument.content, phase: argument.phaseId || '' }] : []; }) }} draft={draft} disabled={busy} />}
        {room.voiceEnabled && <div className="flex-voice-actions">{!audio.connected ? <button disabled={audio.connecting || stale} onClick={() => void audio.connect()}><Volume2 size={15} />{audio.connecting ? '연결 중…' : '음성 연결'}</button> : <button className={audio.recording ? 'recording' : ''} disabled={!audio.recording && (!maySpeak || voiceBusy)} onClick={() => audio.recording ? audio.stop() : void startRecording()}>{audio.recording ? <Square size={14} /> : <Mic size={14} />}{audio.recording ? '발언 마치기' : '마이크로 발언'}</button>}<small>{audio.recording ? '전체 토론방에 들립니다 · 최대 1분씩 녹음' : pendingRecordings.length ? `음성 ${pendingRecordings.length}개 저장 중 · 다음 발언을 이어갈 수 있습니다` : '한 명씩 발언해 주세요. 발언은 자동 전사됩니다.'}</small></div>}
        <form onSubmit={event => { event.preventDefault(); void send(); }}><textarea aria-label="공식 발언 입력" value={draft} maxLength={1200} placeholder={phase?.kind === 'strategy' ? '작전 대화는 우리 팀 채팅을 이용하세요.' : '발언할 내용을 적어 주세요. 다른 측 세션에서도 초안을 준비할 수 있습니다.'} onChange={event => setDraft(event.target.value)} disabled={busy || audio.recording || phase?.kind === 'strategy'} /><footer><span>{draft.length} / 1,200</span><button type="submit" disabled={!maySpeak || busy || audio.recording || !draft.trim()}><Send size={14} />{busy ? '전송 중…' : '발언 전송'}</button></footer></form>
      </section>}
      {pendingRecordings.map(record => <section className="flex-pending" key={record.id}><strong>{record.label} · 음성 발언 저장</strong>{record.transcript && <textarea aria-label="음성 전사 수정" value={record.transcript} disabled={record.processing} onChange={event => recordingQueue.edit(record.id, event.target.value)} />}<p>{record.processing ? '전사·저장 중입니다. 다음 발언을 이어가도 됩니다.' : '음성 발언은 종료 후 5분 안에 다시 저장할 수 있습니다.'}</p>{record.error && <p role="alert">{record.error}</p>}{!record.processing && <><button onClick={() => void recordingQueue.process(record)}>다시 저장</button><button onClick={() => void recordingQueue.cancel(record)}>녹음 취소</button></>}</section>)}
      {finished && <section className="flex-finished"><h2>서로의 생각을 돌아볼 시간</h2><p>{(snapshot?.pending_speeches ?? 0) > 0 ? `음성 발언 ${snapshot?.pending_speeches}개를 저장하는 중입니다. 저장이 끝나면 평가할 수 있습니다.` : '교차질문의 여러 문답과 각 단계의 공식 발언을 함께 평가합니다.'}</p><button disabled={evaluating || (!evaluation && ((snapshot?.pending_speeches ?? 0) > 0 || voiceBusy || pendingRecordings.length > 0))} onClick={() => evaluation ? setShowEvaluation(true) : void evaluate()}>{evaluation ? '평가 보기' : evaluating ? '평가 생성 중…' : '토론 평가 만들기'}</button></section>}
    </div><aside className="flex-sidebar"><section className="flex-roster"><h2>참가자</h2>{['affirmative', 'negative'].map(side => <div key={side}><strong>{sideLabel(side)}</strong><p>{members.filter(member => member.position === side && member.role !== 'moderator').map(member => member.nickname + (member.userId === user.id ? ' (나)' : '')).join(' · ') || '불러오는 중'}</p></div>)}{members.some(member => member.role === 'moderator') && <p>진행자 · {members.find(member => member.role === 'moderator')?.nickname}</p>}</section>
      {room.teamSize > 1 && me?.position && me.role !== 'moderator' && <TeamChat key={chatKey} roomId={room.roomId} userId={user.id} disabled={finished} />}
      <details className="flex-schedule"><summary>전체 세션과 시간</summary><ol>{phases.map((item, index) => <li key={item.id} aria-current={snapshot?.phase_index === index ? 'step' : undefined}><span>{item.label}</span><small>{clock(item.seconds)}</small></li>)}</ol></details>
      <details className="flex-schedule"><summary>주제 배경과 논점</summary>{room.topicBriefing ? <TopicBriefingDetails briefing={room.topicBriefing} language={room.language} embedded /> : <p>{room.topicDescription}</p>}</details>
    </aside></div>
    {showEvaluation && <LiveDebateEvaluationModal evaluation={evaluation} user={user} topic={room.topic} debateLevel={room.debateLevel} error={evaluationError} onRetry={() => void evaluate()} onClose={() => setShowEvaluation(false)} />}
  </main>;
};
