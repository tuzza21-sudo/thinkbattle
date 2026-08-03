import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Crown,
  LoaderCircle,
  LogIn,
  Play,
  ShieldCheck,
  Swords,
  UserRound,
  Users,
} from 'lucide-react';
import {
  claimLobbySeat,
  chooseLobbyTeam,
  enterDebateLobby,
  getDebateRoom,
  getLobbyParticipants,
  leaveDebateLobby,
  setLobbyReady,
  startDebateFromLobby,
  subscribeToDebateLobby,
} from '../lib/debateRooms';
import { formatDebateMinutes, getDebatePhaseTimings } from '../lib/debateTiming';
import { buildLiveDebatePath } from '../lib/liveDebate';
import type {
  AppUser,
  DebateParticipantRole,
  DebatePosition,
  LiveDebateLobbyParticipant,
  LiveDebateRoomSummary,
} from '../types';

type DebateLobbyPageProps = {
  user: AppUser | null;
  onLoginRequest: () => void;
};

const roleDetails: Record<DebateParticipantRole, { label: string; description: string }> = {
  debater: { label: '토론자', description: '전체 토론 과정 담당' },
  opening: { label: '입론 담당', description: '핵심 주장과 근거 제시' },
  rebuttal: { label: '질의·반론 담당', description: '교차 질문과 논리 반박' },
  closing: { label: '최종 변론 담당', description: '쟁점 정리와 결론 제시' },
  moderator: { label: '진행자', description: '순서와 시간 진행' },
};

const getRequiredRoles = (teamSize: number): DebateParticipantRole[] => {
  if (teamSize === 1) return ['debater'];
  if (teamSize === 2) return ['opening', 'rebuttal'];
  return ['opening', 'rebuttal', 'closing'];
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
    const pollingId = window.setInterval(() => void refresh(), 2500);
    return () => {
      unsubscribe();
      window.clearInterval(pollingId);
    };
  }, [refresh, roomId]);

  const me = participants.find(participant => participant.userId === user?.id);
  const requiredRoles = useMemo(() => getRequiredRoles(room?.teamSize ?? 1), [room?.teamSize]);
  const requiredSeatCount = (room?.teamSize ?? 1) * 2;
  const affirmativeMembers = participants.filter(participant => participant.position === 'affirmative' && participant.role !== 'moderator');
  const negativeMembers = participants.filter(participant => participant.position === 'negative' && participant.role !== 'moderator');
  const assignedTeamCount = affirmativeMembers.length + negativeMembers.length;
  const teamSelectionComplete = affirmativeMembers.length === room?.teamSize && negativeMembers.length === room?.teamSize;
  const filledRequiredSeats = participants.filter(participant => participant.role !== 'moderator' && participant.position && participant.role).length;
  const allSeatsFilled = filledRequiredSeats === requiredSeatCount;
  const everyoneReady = participants.length >= requiredSeatCount && participants.every(participant => (
    !!participant.role && (participant.role === 'moderator' || !!participant.position) && participant.isReady
  ));
  const canStart = allSeatsFilled && everyoneReady;
  const isHost = !!user && room?.hostId === user.id;

  useEffect(() => {
    if (!room || room.status !== 'in_progress' || !me?.role) return;
    navigate(buildLiveDebatePath({
      roomId: room.roomId,
      topic: room.topic,
      timeLimit: room.timeLimit,
      hostId: room.hostId,
      hostPosition: 'affirmative',
      teamSize: room.teamSize,
      allowModerator: room.allowModerator,
      participantPosition: me.position ?? 'affirmative',
      participantRole: me.role,
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

  const toggleReady = async () => {
    if (!me?.role || (me.role !== 'moderator' && !me.position) || actionLoading) return;
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
        <div className="lobby-team-head-actions"><strong>{teamMembers.length}/{room.teamSize}명</strong><button className={`btn ${isMyTeam ? 'btn-primary' : 'btn-secondary'}`} disabled={actionLoading || me?.isReady || (teamIsFull && !isMyTeam)} onClick={() => void chooseTeam(position)}>{isMyTeam ? '선택됨' : '이 팀 선택'}</button></div>
      </header>
      {!teamSelectionComplete ? (
        <div className="lobby-team-member-list">
          {Array.from({ length: room.teamSize }, (_, index) => {
            const member = teamMembers[index];
            return member
              ? <div key={member.userId} className={member.userId === user.id ? 'mine' : ''}><UserRound size={21} /><span><strong>{member.nickname}</strong><small>{member.userId === user.id ? '나 · 팀 선택 완료' : '역할 협의 대기'}</small></span></div>
              : <div key={`empty-${index}`} className="empty"><span>+</span><span><strong>빈 팀 자리</strong><small>참가자 선택 대기</small></span></div>;
          })}
        </div>
      ) : (
        <div className="lobby-seat-list">
          {requiredRoles.map(role => {
          const occupant = participants.find(participant => participant.position === position && participant.role === role);
          const isMine = occupant?.userId === user.id;
          return (
            <button
              key={`${position}-${role}`}
              type="button"
              className={`lobby-seat ${occupant ? 'occupied' : ''} ${isMine ? 'mine' : ''}`}
              onClick={() => !occupant && isMyTeam && void chooseSeat(position, role)}
              disabled={!!occupant || actionLoading || me?.isReady || !isMyTeam}
            >
              <span className="lobby-seat-icon">{occupant ? <UserRound size={23} /> : <span>+</span>}</span>
              <span><strong>{roleDetails[role].label}</strong><small>{occupant ? occupant.nickname : roleDetails[role].description}</small></span>
              {occupant && <i className={occupant.isReady ? 'ready' : ''}>{occupant.isReady ? '준비 완료' : '선택 완료'}</i>}
            </button>
          );
          })}
        </div>
      )}
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
        <div>
          <span className="debate-modal-eyebrow">{room.audience === 'organization' ? `${room.organizationName || '기관'} 전용 대기실` : '공개 토론 대기실'}</span>
          <h1>{room.topic}</h1>
          <div className="lobby-meta"><span><Users size={16} /> {room.teamSize}:{room.teamSize}</span><span><Clock size={16} /> {room.timeLimit / 60}분</span>{room.allowModerator && <span><ShieldCheck size={16} /> 진행자 선택 가능</span>}</div>
        </div>
        <div className="lobby-host"><Crown size={18} /><span><small>방장</small><strong>{room.hostName}</strong></span></div>
      </header>

      {error && <div className="live-room-alert error" role="alert">{error}</div>}

      <section className="lobby-stepper" aria-label="대기실 준비 단계">
        <div className={!teamSelectionComplete ? 'active' : 'complete'}><span>{teamSelectionComplete ? <Check size={16} /> : '1'}</span><strong>찬성·반대 팀 선택</strong><small>각 참가자가 먼저 입장을 선택합니다.</small></div>
        <i />
        <div className={teamSelectionComplete && !allSeatsFilled ? 'active' : allSeatsFilled ? 'complete' : ''}><span>{allSeatsFilled ? <Check size={16} /> : '2'}</span><strong>팀 역할 협의·선택</strong><small>팀원이 모두 모이면 역할을 정합니다.</small></div>
        <i />
        <div className={allSeatsFilled && !canStart ? 'active' : canStart ? 'complete' : ''}><span>{canStart ? <Check size={16} /> : '3'}</span><strong>전원 준비 완료</strong><small>방장이 토론을 시작합니다.</small></div>
      </section>

      <section className="lobby-progress-card">
        <div><strong>{teamSelectionComplete ? `역할 선택 ${filledRequiredSeats}/${requiredSeatCount}명` : `팀 선택 ${assignedTeamCount}/${requiredSeatCount}명`}</strong><span>{teamSelectionComplete ? allSeatsFilled ? '필수 역할이 모두 정해졌습니다.' : '팀원끼리 협의한 역할을 선택해 주세요.' : '먼저 찬성 또는 반대 팀을 선택해 주세요.'}</span></div>
        <div className="lobby-progress-track"><span style={{ width: `${Math.min(100, (teamSelectionComplete ? filledRequiredSeats : assignedTeamCount) / requiredSeatCount * 100)}%` }} /></div>
        <div className={`lobby-status-pill ${canStart ? 'ready' : ''}`}>{canStart ? <><Check size={16} /> 시작 준비 완료</> : '참가자 대기 중'}</div>
      </section>

      <section className="lobby-team-grid">{renderTeam('affirmative')}<div className="lobby-versus"><Swords size={22} /><strong>VS</strong></div>{renderTeam('negative')}</section>

      {room.allowModerator && (
        <section className="lobby-moderator-section">
          <div><ShieldCheck size={22} /><span><strong>진행자</strong><small>선택 사항 · 팀 정원과 별도로 토론 순서와 시간을 진행합니다.</small></span></div>
          {(() => {
            const moderator = participants.find(participant => participant.role === 'moderator');
            return moderator
              ? <div className="lobby-moderator-user"><UserRound size={20} /><strong>{moderator.nickname}</strong><span className={moderator.isReady ? 'ready' : ''}>{moderator.isReady ? '준비 완료' : '선택 완료'}</span></div>
              : <button className="btn btn-secondary" disabled={actionLoading || me?.isReady} onClick={() => void chooseSeat(null, 'moderator')}>진행자로 참여</button>;
          })()}
        </section>
      )}

      <section className="lobby-bottom-grid">
        <div className="lobby-participants-card">
          <h3><Users size={18} /> 대기실 참가자</h3>
          <div>{participants.map(participant => <span key={participant.userId} className={participant.isReady ? 'ready' : ''}><i />{participant.nickname}{participant.userId === user.id ? ' (나)' : ''}<small>{participant.role ? roleDetails[participant.role].label : '자리 선택 중'}</small></span>)}</div>
        </div>
        <div className="lobby-timing-card">
          <h3><Clock size={18} /> 자동 진행표</h3>
          <div>{getDebatePhaseTimings(room.timeLimit).map(phase => <span key={phase.label}><strong>{phase.label}</strong><small>{formatDebateMinutes(phase.seconds)}</small></span>)}</div>
        </div>
      </section>

      <footer className="lobby-action-bar">
        <div>
          <strong>{me?.role ? `${me.role === 'moderator' ? '' : `${getPositionLabel(me.position)} · `}${roleDetails[me.role].label}` : '아직 역할을 선택하지 않았습니다.'}</strong>
          <span>{me?.isReady ? '준비를 취소하면 자리를 다시 선택할 수 있습니다.' : '역할을 선택한 뒤 준비 완료를 눌러 주세요.'}</span>
        </div>
        <button className={`btn ${me?.isReady ? 'btn-secondary' : 'btn-primary'}`} disabled={!me?.role || actionLoading} onClick={() => void toggleReady()}>{me?.isReady ? '준비 취소' : '준비 완료'}</button>
        {isHost && <button className="btn btn-primary lobby-start-button" disabled={!canStart || actionLoading} onClick={() => void startDebate()}><Play size={18} fill="currentColor" /> 토론 시작하기</button>}
      </footer>
    </main>
  );
};
