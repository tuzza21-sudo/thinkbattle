import { useState } from 'react';
import { getLoungeHost, type LoungeHostId } from '../lib/lounge';
import './LoungeHostStyles.css';

export function LoungeHostPortrait({ hostId }: { hostId: LoungeHostId }) {
  const host = getLoungeHost(hostId);
  const [failed, setFailed] = useState('');
  return <span className="lounge-host-photo" style={{ background: host.color }}>{!host.portrait || failed === host.portrait
    ? <span role="img" aria-label={`${host.name} 기본 아이콘`}>{host.emoji}</span>
    : <img src={host.portrait} alt={`${host.name}의 AI 생성 인물 사진`} onError={() => setFailed(host.portrait)} />}</span>;
}
