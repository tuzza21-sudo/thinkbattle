import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock, Layers3, LoaderCircle, RefreshCw, Search, ShieldCheck, Users, Volume2, X } from 'lucide-react';
import { listDebateRooms } from '../lib/debateRooms';
import type { DebateRoomAudience, LiveDebateRoomSummary } from '../types';

type JoinDebateModalProps = {
  audience?: DebateRoomAudience;
  organizationIds?: string[];
  onClose: () => void;
  onJoin: (room: LiveDebateRoomSummary) => void | Promise<void>;
};

export const JoinDebateModal = ({ audience = 'public', organizationIds = [], onClose, onJoin }: JoinDebateModalProps) => {
  const [rooms, setRooms] = useState<LiveDebateRoomSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const organizationKey = organizationIds.join(',');

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try { setRooms(await listDebateRooms(audience, organizationIds)); }
    catch (error) { setLoadError(error instanceof Error ? error.message : '토론방 목록을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let cancelled = false;
    void listDebateRooms(audience, organizationKey ? organizationKey.split(',') : []).then(nextRooms => {
      if (!cancelled) setRooms(nextRooms);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    }).catch(error => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : '토론방 목록을 불러오지 못했습니다.');
    });
    return () => { cancelled = true; };
  }, [audience, organizationKey]);

  const filteredRooms = useMemo(() => rooms.filter(room => {
    const query = search.trim().toLowerCase();
    return room.topic.toLowerCase().includes(query) || room.topicDescription.toLowerCase().includes(query);
  }), [rooms, search]);

  const enterLobby = async (room: LiveDebateRoomSummary) => {
    if (joiningRoomId) return;
    setJoiningRoomId(room.roomId);
    try { await onJoin(room); }
    finally { setJoiningRoomId(null); }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="join-debate-title">
      <div className="modal-content debate-setup-modal join-debate-modal">
        <div className="debate-modal-head">
          <div>
            <span className="debate-modal-eyebrow">{audience === 'organization' ? '기관 대기방' : '공개 대기방'}</span>
            <h2 id="join-debate-title">토론 참여하기</h2>
            <p>토론방을 선택하면 넓은 대기실에서 역할과 준비 상태를 정할 수 있습니다.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={22} /></button>
        </div>

        <div className="debate-setup-body">
          <div className="room-search-row">
            <label><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="토론 주제 검색" /></label>
            <button type="button" className="icon-button" onClick={() => void refresh()} aria-label="새로고침"><RefreshCw size={18} /></button>
          </div>
          <div className="debate-room-list">
            {loading ? (
              <div className="room-list-empty"><LoaderCircle className="spin" size={24} /> 토론방을 불러오는 중입니다.</div>
            ) : loadError ? (
              <div className="room-list-empty"><strong>목록을 불러오지 못했습니다.</strong><span>{loadError}</span><button className="btn btn-secondary" onClick={() => void refresh()}>다시 시도</button></div>
            ) : filteredRooms.length === 0 ? (
              <div className="room-list-empty"><Users size={28} /><strong>지금 대기 중인 토론방이 없습니다.</strong><span>먼저 토론방을 개설해 보세요.</span></div>
            ) : filteredRooms.map(room => (
              <button key={room.id} type="button" className="debate-room-card" disabled={!!joiningRoomId} onClick={() => void enterLobby(room)}>
                <div><span className="live-dot" /> 대기실 모집 중</div>
                <strong>{room.topic}</strong>
                {room.topicDescription && <p>{room.topicDescription.slice(0, 140)}{room.topicDescription.length > 140 ? '…' : ''}</p>}
                <p>{room.hostName} 개설 · 현재 {room.participantCount}명 대기 · {new Date(room.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <footer>
                  <span><Users size={14} /> {room.teamSize}:{room.teamSize}</span>
                  <span><Clock size={14} /> {room.timeLimit / 60}분</span>
                  <span><Layers3 size={14} /> {room.debateLevel === 'intermediate' ? '중급' : '초급'}</span>
                  <span><Volume2 size={14} /> {room.voiceEnabled ? '음성' : '텍스트'}</span>
                  {room.allowModerator && <span><ShieldCheck size={14} /> 진행자</span>}
                  {joiningRoomId === room.roomId ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}
                </footer>
              </button>
            ))}
          </div>
        </div>

        <div className="debate-modal-footer"><button type="button" className="btn btn-secondary" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
};
