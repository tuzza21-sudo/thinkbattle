import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TopicBriefingDetails } from './TopicBriefingDetails';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clock,
  Copy,
  Crown,
  LoaderCircle,
  LogIn,
  Layers3,
  Play,
  ShieldCheck,
  Swords,
  UserRound,
  Users,
  Volume2,
} from 'lucide-react';
import {
  claimLobbySeat,
  chooseLobbyTeam,
  enterDebateLobby,
  getDebateRoom,
  getLobbyParticipants,
  heartbeatDebateLobby,
  leaveDebateLobby,
  setLiveDebateStageAssignment,
  setLobbyReady,
  startDebateFromLobby,
  subscribeToDebateLobby,
} from '../lib/debateRooms';
import { formatDebateMinutes } from '../lib/debateTiming';
import { getLiveDebateCourse, getLiveDebateStageOptions } from '../lib/liveDebateCourse';
import { buildLiveDebatePath } from '../lib/liveDebate';
import type {
  AppUser,
  DebateParticipantRole,
  DebatePosition,
  DebateStageId,
  LiveDebateLobbyParticipant,
  LiveDebateRoomSummary,
} from '../types';

type DebateLobbyPageProps = {
  user: AppUser | null;
  onLoginRequest: () => void;
};

const getPositionLabel = (position?: DebatePosition) => position === 'affirmative' ? '찬성' : position === 'negative' ? '반대' : '미선택';

export const DebateLobbyPage = ({ user, onLoginRequest }: DebateLobbyPageProps) => {
  const navigate = useNavigate();
  const { roomId = '' } = useParams();
  const enteredRoomRef = useRef<string | null>(null);
  const [room, setRoom] = useState<LiveDebateRoomSummary | null>(null);
  const [participants, setParticipants] = useState<LiveDebateLobbyParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [acceptedVoiceNotice, setAcceptedVoiceNotice] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextRoom, nextParticipants] = await Promise.all([
        getDebateRoom(roomId),
        getLobbyParticipants(roomId),
      ]);
      setRoom(nextRoom);
      setParticipants(nextParticipants);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '대기실 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getDebateRoom(roomId), getLobbyParticipants(roomId)]).then(([nextRoom, nextParticipants]) => {
      if (cancelled) return;
      setRoom(nextRoom);
      setParticipants(nextParticipants);
      setLoading(false);
    }).catch(nextError => {
      if (cancelled) return;
      setError(nextError instanceof Error ? nextError.message : '대기실 정보를 불러오지 못했습니다.');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [roomId]);

  useEffect(() => {
    if (!user || !room || enteredRoomRef.current === roomId || room.status !== 'open') return;
    enteredRoomRef.current = roomId;
    void enterDebateLobby(roomId, user).then(refresh).catch(nextError => {
      setError(nextError instanceof Error ? nextError.message : '대기실에 입장하지 못했습니다.');
    });
  }, [refresh, room, roomId, user]);

  useEffect(() => {
    const unsubscribe = subscribeToDebateLobby(roomId, () => void refresh());
    const pollingId = window.setInterval(() => void refresh(), 10_000);
    return () => {
      unsubscribe();
      window.clearInterval(pollingId);
    };
  }, [refresh, roomId]);

  useEffect(() => {
    if (!user || room?.status !== 'open') return;
    const heartbeat = () => {
      void heartbeatDebateLobby(roomId).then(alive => {
        if (!alive) void refresh();
      }).catch(() => undefined);
    };
    heartbeat();
    const heartbeatId = window.setInterval(heartbeat, 15_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') heartbeat();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(heartbeatId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh, room?.status, roomId, user]);

  const me = participants.find(participant => participant.userId === user?.id);
  const requiredStages = useMemo(() => getLiveDebateStageOptions(room?.debateLevel ?? 'beginner'), [room?.debateLevel]);
  const requiredSeatCount = (room?.teamSize ?? 1) * 2;
  const humanParticipants = participants.filter(participant => !participant.isAi);
  const affirmativeMembers = humanParticipants.filter(participant => participant.position === 'affirmative' && participant.role !== 'moderator');
  const negativeMembers = humanParticipants.filter(participant => participant.position === 'negative' && participant.role !== 'moderator');
  const assignedTeamCount = affirmativeMembers.length + negativeMembers.length;
  const teamSelectionComplete = affirmativeMembers.length === room?.teamSize && negativeMembers.length === room?.teamSize;
  const completedStageCount = room?.teamSize === 1
    ? requiredStages.length * 2
    : requiredStages.reduce((count, stage) => count
      + (affirmativeMembers.some(member => member.phaseIds.includes(stage.id)) ? 1 : 0)
      + (negativeMembers.some(member => member.phaseIds.includes(stage.id)) ? 1 : 0), 0);
  const requiredStageCount = requiredStages.length * 2;
  const allStagesAssigned = room?.teamSize === 1 || completedStageCount === requiredStageCount;
  const requiredDebaters = humanParticipants.filter(participant => participant.role !== 'moderator' && participant.position);
  const moderator = humanParticipants.find(participant => participant.role === 'moderator');
  const everyoneReady = requiredDebaters.length === requiredSeatCount
    && requiredDebaters.every(participant => participant.isReady)
    && (!moderator || moderator.isReady);
  const canStart = teamSelectionComplete && allStagesAssigned && everyoneReady;
  const isHost = !!user && room?.hostId === user.id;

  useEffect(() => {
    if (!room || room.status !== 'in_progress' || (!me?.position && me?.role !== 'moderator')) return;
    navigate(buildLiveDebatePath({
      roomId: room.roomId,
      topic: room.topic,
      timeLimit: room.timeLimit,
      hostId: room.hostId,
      hostPosition: 'affirmative',
      teamSize: room.teamSize,
      allowModerator: room.allowModerator,
      debateLevel: room.debateLevel,
      voiceEnabled: room.voiceEnabled,
      participantPosition: me.position ?? 'affirmative',
      participantRole: me.role ?? 'debater',
      audience: room.audience,
      startedAt: room.startedAt,
    }), { replace: true });
  }, [me, navigate, room]);

  const chooseSeat = async (position: DebatePosition | null, role: DebateParticipantRole) => {
    if (!user || actionLoading || room?.status !== 'open') return;
    setActionLoading(true);
    setError(null);
    try {
      await claimLobbySeat(roomId, position, role);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '자리를 선택하지 못했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const chooseTeam = async (position: DebatePosition) => {
    if (!user || actionLoading || room?.status !== 'open' || me?.isReady) return;
    setActionLoading(true);
    setError(null);
    try {
      await chooseLobbyTeam(roomId, position);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '팀을 선택하지 못했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const changeStageAssignment = async (stageId: DebateStageId, assigned: boolean) => {
    if (!me?.position || actionLoading || room?.status !== 'open' || me.isReady || room.teamSize === 1) return;
    setActionLoading(true);
    setError(null);
    try {
      await setLiveDebateStageAssignment(roomId, stageId, assigned);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '단계 담당을 변경하지 못했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleReady = async () => {
    if ((!me?.position && me?.role !== 'moderator') || actionLoading || (!me?.isReady && (!teamSelectionComplete || !allStagesAssigned))) return;
    if (room?.voiceEnabled && !me?.isReady && !acceptedVoiceNotice) {
      setError('음성 전달 및 전사문 저장 안내를 확인해 주세요.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await setLobbyReady(roomId, !me.isReady);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '준비 상태를 변경하지 못했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const startDebate = async () => {
    if (!isHost || !canStart || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      await startDebateFromLobby(roomId);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '토론을 시작하지 못했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const exitLobby = async () => {
    if (user && room?.status === 'open') await leaveDebateLobby(roomId);
    navigate(room?.audience === 'organization' ? '/institution' : '/');
  };

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return <div className="app-container lobby-loading"><LoaderCircle className="spin" size={30} /> 대기실을 준비하고 있습니다.</div>;
  }

  if (!room) {
    return <div className="app-container lobby-loading"><strong>토론방을 찾을 수 없습니다.</strong><button className="btn btn-secondary" onClick={() => navigate('/')}>메인으로</button></div>;
  }

  if (!user) {
    return <div className="app-container live-login-gate"><div className="live-gate-card"><Users size={38} /><h1>{room.topic}</h1><p>로그인하면 이 토론 대기실에서 입장과 역할을 선택할 수 있습니다.</p><button className="btn btn-primary" onClick={onLoginRequest}><LogIn size={18} /> 로그인하고 입장</button></div></div>;
  }

  const renderTeam = (position: DebatePosition) => {
    const teamMembers = position === 'affirmative' ? affirmativeMembers : negativeMembers;
    const isMyTeam = me?.position === position && me.role !== 'moderator';
    const teamIsFull = teamMembers.length >= room.teamSize;
    return (
    <section className={`lobby-team-panel ${position}`}>
      <header>
        <div><span>{position === 'affirmative' ? 'TEAM A' : 'TEAM B'}</span><h2>{getPositionLabel(position)}</h2></div>
        <div className="lobby-team-head-actions"><strong>{teamMembers.length}/{room.teamSize}명</strong><button className={`btn ${isMyTeam ? 'btn-primary' : 'btn-secondary'}`} disabled={actionLoading || me?.isReady || isMyTeam || (teamIsFull && !isMyTeam)} onClick={() => void chooseTeam(position)}>{isMyTeam ? '선택됨' : '이 팀 선택'}</button></div>
      </header>
      <div className="lobby-team-member-list">
        {Array.from({ length: room.teamSize }, (_, index) => {
          const member = teamMembers[index];
          return member
            ? <div key={member.userId} className={member.userId === user.id ? 'mine' : ''}><UserRound size={21} /><span><strong>{member.nickname}</strong><small>{member.userId === user.id ? '나 · 팀 선택 완료' : member.isReady ? '준비 완료' : '단계 협의 중'}</small></span></div>
            : <div key={`empty-${index}`} className="empty"><span>+</span><span><strong>사람 참가자 대기</strong><small>초대 링크를 공유해 팀원을 모아 주세요.</small></span></div>;
        })}
      </div>
      <div className="lobby-seat-list">
        {room.teamSize === 1 ? (
          <div className="lobby-seat occupied">
            <span className="lobby-seat-icon"><Check size={22} /></span>
            <span><strong>전 단계 자동 담당</strong><small>1:1 토론에서는 한 사람이 입론부터 최종발언까지 모두 진행합니다.</small></span>
            <i className="ready">자동 배정</i>
          </div>
        ) : requiredStages.map(stage => {
          const occupant = teamMembers.find(participant => participant.phaseIds.includes(stage.id));
          const isMine = occupant?.userId === user.id;
          return (
            <div
              key={`${position}-${stage.id}`}
              className={`lobby-seat ${occupant ? 'occupied' : ''} ${isMine ? 'mine' : ''}`}
            >
              <span className="lobby-seat-icon">{occupant ? <UserRound size={23} /> : <span>+</span>}</span>
              <span><strong>{stage.label}</strong><small>{occupant ? `${occupant.nickname} · ${stage.description}` : stage.description}</small></span>
              {occupant ? (
                isMine
                  ? <button type="button" className="lobby-seat-action" disabled={actionLoading || me?.isReady} onClick={() => void changeStageAssignment(stage.id, false)}>담당 해제</button>
                  : <span className="lobby-seat-actions">{isMyTeam && !me?.isReady && <button type="button" disabled={actionLoading || occupant.isReady} onClick={() => void changeStageAssignment(stage.id, true)}>내가 맡기</button>}<i className={occupant.isReady ? 'ready' : ''}>{occupant.isReady ? '준비 완료' : '배정됨'}</i></span>
              ) : (
                <span className="lobby-seat-actions">
                  {isMyTeam && <button type="button" disabled={actionLoading || me?.isReady} onClick={() => void changeStageAssignment(stage.id, true)}>내가 맡기</button>}
                  {!isMyTeam && <i>담당자 대기</i>}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
    );
  };

  return (
    <main className="app-container page-scroll debate-lobby-page">
      <nav className="lobby-nav">
        <button className="btn btn-secondary" onClick={() => void exitLobby()}><ArrowLeft size={17} /> 나가기</button>
        <button className="btn btn-secondary" onClick={() => void copyInvite()}><Copy size={17} /> {copied ? '복사됨' : '대기실 초대'}</button>
      </nav>

      <header className="lobby-hero">
        <div className="lobby-hero-topic">
          <span className="debate-modal-eyebrow">{room.audience === 'organization' ? `${room.organizationName || '기관'} 전용 대기실` : '공개 토론 대기실'}</span>
          <h1>{room.topic}</h1>
          <div className="lobby-meta"><span><Users size={16} /> {room.teamSize}:{room.teamSize}</span><span><Clock size={16} /> {room.timeLimit / 60}분</span><span><Layers3 size={16} /> {room.debateLevel === 'intermediate' ? '중급' : '초급'}</span><span><Volume2 size={16} /> {room.voiceEnabled ? 'LiveKit 음성' : '텍스트 전용'}</span>{room.allowModerator && <span><ShieldCheck size={16} /> 진행자 선택 가능</span>}</div>
        </div>
        <div className="lobby-host"><Crown size={18} /><span><small>방장</small><strong>{room.hostName}</strong></span></div>
        {(room.topicDescription || room.topicBriefing) && (
          <div className="lobby-topic-actions" aria-label="토론 주제 참고 정보">
            <button type="button" className={showBriefing ? 'active' : ''} aria-expanded={showBriefing} aria-controls="lobby-topic-detail" onClick={() => setShowBriefing(value => !value)}>
              <BookOpen size={16} /> 토론 배경 및 논점 확인
            </button>
          </div>
        )}
      </header>

      {error && <div className="live-room-alert error" role="alert">{error}</div>}

      {showBriefing && (
        <section id="lobby-topic-detail" className="lobby-topic-detail">
          <header><span><BookOpen size={18} /></span><div><small>TOPIC BRIEF</small><strong>토론 배경 및 논점</strong></div><button type="button" onClick={() => setShowBriefing(false)} aria-label="주제 정보 닫기">닫기</button></header>
          {room.topicBriefing
            ? <TopicBriefingDetails briefing={room.topicBriefing} language={room.language} embedded />
            : <div className="lobby-background-summary"><p>{room.topicDescription}</p></div>}
        </section>
      )}

      <section className="lobby-stepper" aria-label="대기실 준비 단계">
        <div className={!teamSelectionComplete ? 'active' : 'complete'}><span>{teamSelectionComplete ? <Check size={16} /> : '1'}</span><strong>찬성·반대 팀 선택</strong><small>각 참가자가 먼저 입장을 선택합니다.</small></div>
        <i />
        <div className={teamSelectionComplete && !allStagesAssigned ? 'active' : allStagesAssigned ? 'complete' : ''}><span>{allStagesAssigned ? <Check size={16} /> : '2'}</span><strong>단계별 담당 선택</strong><small>{room.teamSize === 1 ? '1:1은 전 단계가 자동 배정됩니다.' : '입론·질문·답변·반박·최종발언을 빠짐없이 정합니다.'}</small></div>
        <i />
        <div className={allStagesAssigned && !canStart ? 'active' : canStart ? 'complete' : ''}><span>{canStart ? <Check size={16} /> : '3'}</span><strong>전원 준비 완료</strong><small>방장이 토론을 시작합니다.</small></div>
      </section>

      <section className="lobby-progress-card">
        <div><strong>{teamSelectionComplete ? `단계 배정 ${completedStageCount}/${requiredStageCount}` : `팀 선택 ${assignedTeamCount}/${requiredSeatCount}명`}</strong><span>{teamSelectionComplete ? allStagesAssigned ? '모든 토론 단계의 담당자가 정해졌습니다.' : '한 사람이 여러 단계를 맡아도 됩니다. 빈 단계를 모두 배정해 주세요.' : '먼저 찬성 또는 반대 팀을 선택해 주세요.'}</span></div>
        <div className="lobby-progress-track"><span style={{ width: `${Math.min(100, (teamSelectionComplete ? completedStageCount / requiredStageCount : assignedTeamCount / requiredSeatCount) * 100)}%` }} /></div>
        <div className={`lobby-status-pill ${canStart ? 'ready' : ''}`}>{canStart ? <><Check size={16} /> 시작 준비 완료</> : '참가자 대기 중'}</div>
      </section>

      <section className="lobby-team-grid">{renderTeam('affirmative')}<div className="lobby-versus"><Swords size={22} /><strong>VS</strong></div>{renderTeam('negative')}</section>

      {room.allowModerator && (
        <section className="lobby-moderator-section">
          <div><ShieldCheck size={22} /><span><strong>진행자</strong><small>선택 사항 · 팀 정원과 별도로 토론 순서와 시간을 진행합니다.</small></span></div>
          {(() => {
            return moderator
              ? <div className="lobby-moderator-user"><UserRound size={20} /><strong>{moderator.nickname}</strong><span className={moderator.isReady ? 'ready' : ''}>{moderator.isReady ? '준비 완료' : '선택 완료'}</span></div>
              : <button className="btn btn-secondary" disabled={actionLoading || me?.isReady} onClick={() => void chooseSeat(null, 'moderator')}>진행자로 참여</button>;
          })()}
        </section>
      )}

      <section className="lobby-bottom-grid">
        <div className="lobby-participants-card">
          <h3><Users size={18} /> 대기실 참가자</h3>
          <div>{humanParticipants.map(participant => <span key={participant.userId} className={participant.isReady ? 'ready' : ''}><i />{participant.nickname}{participant.userId === user.id ? ' (나)' : ''}<small>{participant.role === 'moderator' ? '진행자' : participant.position ? `${getPositionLabel(participant.position)} · ${participant.phaseIds.length ? `${participant.phaseIds.length}개 단계 담당` : room.teamSize === 1 ? '전 단계 담당' : '단계 선택 중'}` : '팀 선택 중'}</small></span>)}</div>
        </div>
        <div className="lobby-timing-card">
          <h3><Clock size={18} /> 자동 진행표</h3>
          <div>{getLiveDebateCourse(room.timeLimit, room.debateLevel).map(phase => <span key={phase.id}><strong>{phase.label}</strong><small>{formatDebateMinutes(phase.seconds)}</small></span>)}</div>
        </div>
      </section>

      <footer className="lobby-action-bar">
        <div>
          <strong>{me?.role === 'moderator' ? '진행자' : me?.position ? `${getPositionLabel(me.position)} · ${room.teamSize === 1 ? '전 단계 담당' : requiredStages.filter(stage => me.phaseIds.includes(stage.id)).map(stage => stage.label).join(' · ') || '단계 선택 전'}` : '아직 팀을 선택하지 않았습니다.'}</strong>
          <span>{me?.isReady ? '준비를 취소하면 담당 단계를 다시 조정할 수 있습니다.' : allStagesAssigned ? '모든 단계가 배정되었습니다. 준비 완료를 눌러 주세요.' : '팀원과 협의해 모든 단계의 담당을 먼저 정해 주세요.'}</span>
        </div>
        {room.voiceEnabled && !me?.isReady && <label className="voice-data-consent compact"><input type="checkbox" checked={acceptedVoiceNotice} onChange={event => setAcceptedVoiceNotice(event.target.checked)} /><span>실시간 음성 전달과 Gemini 전사, 전사문 저장에 동의합니다. <a href="/privacy" target="_blank" rel="noreferrer">자세히</a></span></label>}
        <button className={`btn ${me?.isReady ? 'btn-secondary' : 'btn-primary'}`} disabled={(!me?.position && me?.role !== 'moderator') || (!me?.isReady && (!teamSelectionComplete || !allStagesAssigned)) || (room.voiceEnabled && !me?.isReady && !acceptedVoiceNotice) || actionLoading} onClick={() => void toggleReady()}>{me?.isReady ? '준비 취소' : '준비 완료'}</button>
        {isHost && <button className="btn btn-primary lobby-start-button" disabled={!canStart || actionLoading} onClick={() => void startDebate()}><Play size={18} fill="currentColor" /> 토론 시작하기</button>}
      </footer>
    </main>
  );
};
