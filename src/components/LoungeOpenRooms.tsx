import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Coffee, LoaderCircle, RefreshCw, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getLoungeHost, getLoungeTheme, getLoungeTopic, type LoungeRoomSummary } from '../lib/lounge';
import { listOpenLounges } from '../lib/loungeApi';
import './LoungeOpenRooms.css';
import { LoungeHostPortrait } from './LoungeHostPortrait';

export function LoungeOpenRooms() {
  const [rooms, setRooms] = useState<LoungeRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    let mounted = true, fetching = false;
    const load = async () => {
      if (fetching) return;
      fetching = true;
      if (mounted) setLoading(true);
      try {
        const next = await listOpenLounges();
        if (mounted) { setRooms(next); setError(false); }
      } catch { if (mounted) setError(true); }
      finally { fetching = false; if (mounted) setLoading(false); }
    };
    refresh.current = () => void load();
    void load();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { mounted = false; clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  return <section className="lounge-open-rooms" aria-labelledby="lounge-open-rooms-title">
    <div className="lounge-open-heading">
      <div><span className="lounge-eyebrow"><span /> CONVERSATIONS ARE OPEN</span><h2 id="lounge-open-rooms-title">지금 열려 있는 대화방</h2><p>마음이 가는 주제를 골라, 함께 이야기해요.</p></div>
      <button type="button" className="lounge-rooms-refresh" disabled={loading} onClick={() => refresh.current()} aria-label="개설된 방 새로고침"><RefreshCw size={16} className={loading ? 'lounge-spin' : ''} /><span>새로고침</span></button>
    </div>
    {error ? <div className="lounge-rooms-empty" role="alert"><Coffee size={24} /><div><strong>대화방 목록을 가져오지 못했어요.</strong><p>잠시 뒤 새로고침해 주세요.</p></div></div>
      : loading && !rooms.length ? <div className="lounge-rooms-empty" role="status"><LoaderCircle size={24} className="lounge-spin" /><p>열려 있는 자리를 찾아보고 있어요.</p></div>
      : !rooms.length ? <div className="lounge-rooms-empty"><Coffee size={28} /><div><strong>아직 열려 있는 대화방이 없어요.</strong><p>아래에서 주제를 골라 첫 이야기를 열어 주세요.</p></div><a href="#lounge-create">대화방 만들기 <ArrowRight size={15} /></a></div>
      : <div className="lounge-open-grid">{rooms.map(room => {
        const theme = getLoungeTheme(room.theme);
        const host = getLoungeHost(room.host_persona);
        const full = room.participant_count >= room.capacity;
        const brief = room.topic_brief;
        const category = brief ? getLoungeTopic(brief.category) : undefined;
        return <article className="lounge-open-card" key={room.id}>
          <div className="lounge-open-cover"><img src={theme.image} alt="" loading="lazy" /><span className={`lounge-open-status ${room.status === 'active' ? 'active' : ''}`}>{full ? '만석' : room.status === 'active' ? '이야기 나누는 중' : '참가자를 기다려요'}</span><span className="lounge-open-view">{theme.name}</span></div>
          <div className="lounge-open-body"><h2>{room.topic}</h2>{brief && <details className="lounge-open-brief"><summary>{category?.title} · 방 소개 보기</summary><div>{brief.work_title && <p className="lounge-open-work">{brief.work_title}{brief.creator && ` · ${brief.subcategory === 'book' ? '저자' : '감독'} ${brief.creator}`}</p>}<strong>방을 만든 이유</strong><p>{brief.reason}</p><strong>함께 나누고 싶은 이야기</strong><p>{brief.discussion}</p></div></details>}<div className="lounge-open-host"><LoungeHostPortrait hostId={host.id} /><span>{host.name}와 함께</span></div><div className="lounge-open-bottom"><span><Users size={15} />{room.participant_count} / {room.capacity}명</span>{full ? <span className="lounge-open-full">자리가 모두 찼어요</span> : <Link to={`/lounge/${room.id}`} aria-label={`${room.topic} 대화방 참여하기`}>참여하기 <ArrowRight size={15} /></Link>}</div></div>
        </article>;
      })}</div>}
  </section>;
}
