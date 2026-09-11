import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { TopicBriefingDetails } from './TopicBriefingDetails';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Crown,
  LoaderCircle,
  LogIn,
  Play,
  Plus,
  Settings2,
  ShieldCheck,
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
import './DebateLobbyPage.css';
import { buildSessionPhases, SESSION_STAGES } from '../lib/liveDebateSession';
import { SessionSettings } from './SessionSettings';
import { updateSessionSettings } from '../lib/liveSessionApi';
import { TeamChat } from './TeamChat';

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
  const [showBriefing, setShowBriefing] = useState(false);
  const [showAssignments, setShowAssignments] = useState(false);

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
  const requiredStages = useMemo(() => room?.sessionConfig ? SESSION_STAGES.filter(stage => room.sessionConfig!.stages.some(item => item.id === stage.id && item.enabled)) : getLiveDebateStageOptions(room?.debateLevel ?? 'beginner'), [room]);
  const freeParticipation = room?.sessionConfig?.assignmentMode === 'free';
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
  const allStagesAssigned = freeParticipation || room?.teamSize === 1 || completedStageCount === requiredStageCount;
  const requiredDebaters = humanParticipants.filter(participant => participant.role !== 'moderator' && participant.position);
  const moderator = humanParticipants.find(participant => participant.role === 'moderator');
  const everyoneReady = requiredDebaters.length === requiredSeatCount
    && requiredDebaters.every(participant => participant.isReady)
    && (!moderator || moderator.isReady);
  const isRoomOpen = room?.status === 'open';
  const canStart = isRoomOpen && teamSelectionComplete && allStagesAssigned && everyoneReady;
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
    if (!isRoomOpen || (!me?.position && me?.role !== 'moderator') || actionLoading || (!me?.isReady && (!teamSelectionComplete || !allStagesAssigned))) return;
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
    setActionLoading(true);
    try {
      if (user && room?.status === 'open') await leaveDebateLobby(roomId);
      navigate(room?.audience === 'organization' ? '/institution' : '/debate');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '대기실을 나가지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setActionLoading(false);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('초대 링크를 복사하지 못했습니다. 주소창의 링크를 복사해 주세요.');
    }
  };

  if (loading) {
    return <div className="app-container lobby-loading"><LoaderCircle className="spin" size={30} /> 대기실을 준비하고 있습니다.</div>;
  }

  if (!room) {
    return <div className="app-container lobby-loading"><strong>토론방을 찾을 수 없습니다.</strong><button className="btn btn-secondary" onClick={() => navigate('/debate')}>토론 메인으로</button></div>;
  }

  if (!user) {
    return <div className="app-container live-login-gate"><div className="live-gate-card"><Users size={38} /><h1>{room.topic}</h1><p>로그인하면 이 토론 대기실에서 입장과 역할을 선택할 수 있습니다.</p><button className="btn btn-primary" onClick={onLoginRequest}><LogIn size={18} /> 로그인하고 입장</button></div></div>;
  }

  const waitingMembers = humanParticipants.filter(participant => !participant.position && participant.role !== 'moderator');
  const readyCount = requiredDebaters.filter(participant => participant.isReady).length;
  const canReady = isRoomOpen && !actionLoading && (!!me?.position || me?.role === 'moderator')
    && (!!me?.isReady || (teamSelectionComplete && allStagesAssigned));
  const myStageLabels = requiredStages.filter(stage => me?.phaseIds.includes(stage.id)).map(stage => stage.label);
  const nextAction = !isRoomOpen
    ? room.status === 'in_progress' ? '토론이 시작되었습니다.' : '종료된 토론방입니다.'
    : !me ? '대기실에 입장하고 있습니다.'
    : !me.position && me.role !== 'moderator' ? '참여할 팀을 선택해 주세요.'
    : !teamSelectionComplete ? `참가자 ${requiredSeatCount - assignedTeamCount}명을 기다리고 있습니다.`
    : !allStagesAssigned ? '팀별 발언 역할을 정해 주세요.'
    : !me.isReady ? '준비가 끝났다면 준비 완료를 눌러 주세요.'
    : !everyoneReady ? '다른 참가자의 준비를 기다리고 있습니다.'
    : isHost ? '모두 준비됐습니다. 토론을 시작해 주세요.' : '방장이 토론을 시작하면 자동으로 입장합니다.';

  const renderTeam = (position: DebatePosition) => {
    const members = position === 'affirmative' ? affirmativeMembers : negativeMembers;
    const isMyTeam = me?.position === position && me.role !== 'moderator';
    const isFull = members.length >= room.teamSize;
    return (
      <section className={`match-team ${position}`} aria-label={`${getPositionLabel(position)} 팀`}>
        <header>
          <div className="match-team-title"><span>{position === 'affirmative' ? 'A' : 'B'}</span><h2>{getPositionLabel(position)}</h2><small>{members.length} / {room.teamSize}</small></div>
          <button type="button" className={`match-team-join ${isMyTeam ? 'selected' : ''}`} disabled={!isRoomOpen || actionLoading || !me || me.isReady || isMyTeam || isFull} onClick={() => void chooseTeam(position)}>
            {isMyTeam ? <><Check size={14} /> 내 팀</> : isFull ? '정원 마감' : '팀 선택'}
          </button>
        </header>
        <div className="match-player-list">
          {Array.from({ length: room.teamSize }, (_, index) => {
            const member = members[index];
            const labels = member ? requiredStages.filter(stage => member.phaseIds.includes(stage.id)).map(stage => stage.label) : [];
            return member ? (
              <div key={member.userId} className={`match-player ${member.userId === user.id ? 'mine' : ''}`}>
                <span className="match-player-avatar"><UserRound size={20} /></span>
                <div className="match-player-info">
                  <strong>{member.nickname}{member.userId === user.id && <small>나</small>}{member.userId === room.hostId && <Crown size={13} aria-label="방장" />}</strong>
                  <span title={labels.join(' · ')}>{freeParticipation ? '팀 내 자유 참여' : room.teamSize === 1 ? '전 단계 담당' : labels.length ? labels.join(' · ') : '발언 역할 미선택'}</span>
                </div>
                <span className={`match-ready-state ${member.isReady ? 'ready' : ''}`}>{member.isReady && <Check size={12} />}{member.isReady ? '준비 완료' : '준비 중'}</span>
              </div>
            ) : (
              <div key={`empty-${index}`} className="match-player empty">
                <span className="match-player-avatar"><Plus size={18} /></span>
                <div className="match-player-info"><strong>빈 자리</strong><span>참가자를 기다리고 있어요</span></div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const renderAssignments = (position: DebatePosition) => {
    const members = position === 'affirmative' ? affirmativeMembers : negativeMembers;
    const isMyTeam = me?.position === position && me.role !== 'moderator';
    return (
      <section key={position} className={`match-assignment-team ${position}`}>
        <h3>{getPositionLabel(position)} <span>{requiredStages.filter(stage => members.some(member => member.phaseIds.includes(stage.id))).length}/{requiredStages.length} 배정</span></h3>
        {requiredStages.map(stage => {
          const owner = members.find(member => member.phaseIds.includes(stage.id));
          const isMine = owner?.userId === user.id;
          return (
            <div key={stage.id} className={isMine ? 'mine' : ''}>
              <span title={stage.description}>{stage.label}</span>
              <strong>{owner?.nickname || '미배정'}</strong>
              {isMyTeam && <button type="button" aria-label={`${stage.label} ${isMine ? '담당 해제' : '내가 맡기'}`} disabled={!isRoomOpen || actionLoading || me?.isReady || owner?.isReady} onClick={() => void changeStageAssignment(stage.id, !isMine)}>{isMine ? '해제' : '맡기'}</button>}
            </div>
          );
        })}
      </section>
    );
  };

  return (
    <main className="match-lobby">
      <nav className="match-lobby-nav" aria-label="대기실 메뉴">
        <button type="button" className="match-back" disabled={actionLoading} onClick={() => void exitLobby()}><ArrowLeft size={17} /> 토론 목록</button>
        <span>ThinkFit <i /> 토론 대기실</span>
        <button type="button" className="match-invite" onClick={() => void copyInvite()}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '복사했어요' : '초대 링크 복사'}</button>
      </nav>

      <header className="match-lobby-heading">
        <div>
          <span className="match-room-label">{room.audience === 'organization' ? `${room.organizationName || '기관'} 전용` : '공개 토론'} <i /> {room.teamSize}:{room.teamSize} {room.teamSize === 1 ? '개인전' : '팀전'}</span>
          <h1>{room.topic}</h1>
        </div>
        <span className={`match-room-status ${canStart ? 'ready' : ''}`} role="status"><i />{!isRoomOpen ? room.status === 'in_progress' ? '토론 진행 중' : '종료됨' : canStart ? '시작 가능' : '참가자 준비 중'}</span>
      </header>

      {error && <div className="match-error" role="alert">{error}<button type="button" onClick={() => setError(null)} aria-label="오류 알림 닫기">닫기</button></div>}

      <div className="match-lobby-layout">
        <section className="match-room-board" aria-label="참가자와 준비 상태">
          <header className="match-board-heading"><h2><Users size={17} /> 참가자</h2><span>{assignedTeamCount} / {requiredSeatCount}명</span></header>
          <div className="match-teams">{renderTeam('affirmative')}{renderTeam('negative')}</div>

          {waitingMembers.length > 0 && <div className="match-waiting"><span>팀 선택 중</span><div>{waitingMembers.map(member => <span key={member.userId}>{member.nickname}{member.userId === user.id ? ' (나)' : ''}</span>)}</div></div>}

          {room.allowModerator && (
            <div className="match-moderator">
              <span><ShieldCheck size={16} /> 진행자 <small>선택 사항</small></span>
              {moderator ? <div><strong>{moderator.nickname}{moderator.userId === user.id ? ' (나)' : ''}</strong><span className={`match-ready-state ${moderator.isReady ? 'ready' : ''}`}>{moderator.isReady ? '준비 완료' : '준비 중'}</span></div>
                : <button type="button" disabled={!isRoomOpen || !me || actionLoading || me.isReady} onClick={() => void chooseSeat(null, 'moderator')}>진행자로 참여</button>}
            </div>
          )}

          {room.teamSize > 1 && !freeParticipation && (
            <div className="match-role-settings">
              <button type="button" className="match-disclosure" aria-expanded={showAssignments} aria-controls="match-assignments" onClick={() => setShowAssignments(value => !value)}>
                <span><Settings2 size={16} /> 발언 역할 설정 <small>{allStagesAssigned ? '배정 완료' : `${requiredStageCount - completedStageCount}개 미배정`}</small></span><ChevronDown size={16} />
              </button>
              {showAssignments && <div id="match-assignments"><p>담당할 역할의 ‘맡기’를 눌러 주세요. 한 사람이 여러 역할을 맡을 수 있습니다.</p><div className="match-assignment-grid">{renderAssignments('affirmative')}{renderAssignments('negative')}</div></div>}
            </div>
          )}

          <footer className="match-room-actions">
            <div className="match-next-action" aria-live="polite"><strong>{nextAction}</strong><span>{readyCount} / {requiredSeatCount}명 준비 완료{moderator ? ` · 진행자 ${moderator.isReady ? '준비 완료' : '준비 중'}` : ''}</span></div>
            <div className="match-action-buttons">
              {isRoomOpen && room.teamSize > 1 && !!me?.position && !allStagesAssigned && !showAssignments && <button type="button" className="btn btn-secondary" onClick={() => setShowAssignments(true)}>역할 설정</button>}
              <button type="button" className={`btn ${me?.isReady ? 'btn-secondary' : 'btn-primary'}`} disabled={!canReady} onClick={() => void toggleReady()}><Check size={17} />{me?.isReady ? '준비 취소' : '준비 완료'}</button>
              {isHost && <button type="button" className="btn btn-primary match-start" disabled={!canStart || actionLoading} onClick={() => void startDebate()}>{actionLoading ? <LoaderCircle className="spin" size={17} /> : <Play size={17} fill="currentColor" />} 토론 시작</button>}
            </div>
          </footer>
        </section>

        <aside className="match-room-sidebar" aria-label="토론방 정보">
          <section className="match-settings">
            <h2>방 정보</h2>
            <dl>
              <div><dt>방장</dt><dd><Crown size={14} />{room.hostName}</dd></div>
              <div><dt>토론 시간</dt><dd><Clock size={14} />{formatDebateMinutes(room.timeLimit)}</dd></div>
              <div><dt>진행 방식</dt><dd><Volume2 size={14} />{room.voiceEnabled ? '음성 토론' : '텍스트 토론'}</dd></div>
              {room.sessionConfig ? <div><dt>시간 종료</dt><dd>{room.sessionConfig.progressionMode === 'automatic' ? '자동진행' : '방장·진행자 진행'}</dd></div> : <div><dt>훈련 수준</dt><dd>{room.debateLevel === 'intermediate' ? '중급' : '초급'}</dd></div>}
            </dl>
            {(room.topicDescription || room.topicBriefing) && <button type="button" className="match-briefing-toggle" aria-expanded={showBriefing} aria-controls="match-topic-briefing" onClick={() => setShowBriefing(value => !value)}><BookOpen size={15} /> 주제 배경과 논점 <ChevronDown size={15} /></button>}
            <details className="match-schedule">
              <summary>진행 순서와 시간 <ChevronDown size={15} /></summary>
              <p>{room.sessionConfig ? '교차질문은 질문 측과 답변 측이 시간 안에서 자유롭게 주고받습니다. 작전시간은 총 시간에 포함됩니다.' : '각 시간은 권장 시간입니다. 발언을 마치면 다음 순서로 넘어갑니다.'}</p>
              <ol>{(room.sessionConfig ? buildSessionPhases(room.sessionConfig) : getLiveDebateCourse(room.timeLimit, room.debateLevel)).map(phase => <li key={phase.id}><span>{phase.label}</span><small>{formatDebateMinutes(phase.seconds)}</small></li>)}</ol>
            </details>
          </section>
          <section className="match-my-seat">
            <span>내 참여 정보</span>
            <strong>{me?.role === 'moderator' ? '진행자' : me?.position ? `${getPositionLabel(me.position)} 팀` : '팀을 선택해 주세요'}</strong>
            <p>{me?.role === 'moderator' ? '토론 순서와 시간을 진행합니다.' : me?.position ? room.teamSize === 1 ? '입론부터 최종발언까지 직접 진행합니다.' : freeParticipation ? '발언 가능한 세션에 팀원 누구나 참여합니다.' : myStageLabels.length ? myStageLabels.join(' · ') : '팀원과 발언 역할을 나눠 주세요.' : '참여할 팀의 ‘팀 선택’을 눌러 입장하세요.'}</p>
          </section>
          {room.sessionConfig && room.teamSize > 1 && me?.position && me.role !== 'moderator' && <TeamChat key={`${me.position}:${participants.filter(p => p.position === me.position && p.role !== 'moderator' && !p.isAi).map(p => p.userId).sort().join(',')}`} roomId={roomId} userId={user.id} disabled={!isRoomOpen} />}
        </aside>
      </div>
      {isHost && isRoomOpen && room.sessionConfig && <details className="match-settings" style={{ marginTop: 20 }}><summary>방 진행 설정 수정</summary><p>설정을 바꾸면 모든 참가자의 준비 완료가 해제됩니다.</p><SessionSettings value={room.sessionConfig} teamSize={room.teamSize} onChange={config => { if (actionLoading) return; setActionLoading(true); void updateSessionSettings(roomId, config).then(refresh).catch(err => setError(err.message)).finally(() => setActionLoading(false)); }} /></details>}

      {showBriefing && <section id="match-topic-briefing" className="match-topic-briefing"><header><h2><BookOpen size={18} /> 주제 배경과 논점</h2><button type="button" onClick={() => setShowBriefing(false)}>접기</button></header>{room.topicBriefing ? <TopicBriefingDetails briefing={room.topicBriefing} language={room.language} embedded /> : <p>{room.topicDescription}</p>}</section>}
    </main>
  );
};
