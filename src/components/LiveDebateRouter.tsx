import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getDebateRoom } from '../lib/debateRooms';
import type { AppUser, LiveDebateRoomSummary } from '../types';
import { LiveDebateRoom } from './LiveDebateRoom';
import { FlexibleDebateRoom } from './FlexibleDebateRoom';

export const LiveDebateRouter = (props: { user: AppUser | null; onLoginRequest: () => void }) => {
  const { roomId = '' } = useParams();
  const [room, setRoom] = useState<LiveDebateRoomSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void getDebateRoom(roomId).then(value => { if (active) { if (value) setRoom(value); else setError('토론방을 찾을 수 없습니다.'); } }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [roomId]);
  if (error) return <main style={{ padding: 40 }} role="alert">{error}<button onClick={() => window.location.reload()}>다시 시도</button></main>;
  if (!room || room.roomId !== roomId) return <main style={{ padding: 40 }}>토론방을 불러오고 있습니다…</main>;
  return room.sessionConfig && props.user ? <FlexibleDebateRoom key={roomId} room={room} user={props.user} /> : <LiveDebateRoom {...props} />;
};
