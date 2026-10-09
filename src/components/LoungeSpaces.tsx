import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Coffee, DoorOpen, Hourglass, LoaderCircle, Plus, RefreshCw, Swords, Users, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { AppUser } from '../types';
import { getLoungeHost, getLoungeTheme, loungeCharacterProfiles, type LoungeSpace, type LoungeSpaceTable } from '../lib/lounge';
import { enterLoungeTable, leaveLoungeWait, listLoungeSpaces, listLoungeSpaceTables, openLoungeTable, startLoungeSolo, waitLoungeSpace } from '../lib/loungeApi';
import { getLoungeCharacter, koreanSubject, koreanWith, loungeCharacters, type LoungeCharacter } from '../lib/loungeCharacters';
import { currentLoungeWait, setLoungeWaitAhead, startLoungeWait, stopLoungeWait, useLoungeWait } from '../lib/loungeWait';
import { LoungeHostPortrait } from './LoungeHostPortrait';
import './LoungeSpaces.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/** The open spaces with live presence, refreshed every 30 seconds while the page is visible. */
function useLoungeSpaces() {
  const [spaces, setSpaces] = useState<LoungeSpace[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let mounted = true;
    const load = () => { void listLoungeSpaces().then(next => { if (mounted) { setSpaces(next); setFailed(false); } }, () => { if (mounted) setFailed(true); }); };
    load();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, [attempt]);
  return { spaces, failed, retry: () => setAttempt(value => value + 1) };
}

function SpacesStatus({ failed, retry }: { failed: boolean; retry: () => void }) {
  return failed ? <div className="lounge-rooms-empty" role="alert"><Coffee size={24} /><div><strong>방 목록을 가져오지 못했어요.</strong><p>잠시 뒤 다시 시도해 주세요.</p></div><button type="button" onClick={retry}><RefreshCw size={15} /> 다시 시도</button></div>
    : <div className="lounge-rooms-empty" role="status"><LoaderCircle size={24} className="lounge-spin" /><p>방의 불을 켜고 있어요.</p></div>;
}

/** Nicknames as small chips: the first few, then how many more. */
function People({ names, limit = 4 }: { names?: string[]; limit?: number }) {
  if (!names?.length) return null;
  return <ul className="lounge-people" aria-label="함께 있는 사람">{names.slice(0, limit).map((name, index) => <li key={`${name}-${index}`}><span aria-hidden="true">{name.slice(0, 1)}</span>{name}</li>)}{names.length > limit && <li className="more">외 {names.length - limit}명</li>}</ul>;
}

/** 상상의 집 home: the eight characters as cards. A card opens the character's sheet, with ways to sit down. */
export function LoungeHome({ user, onGuestRequest }: { user: AppUser | null; onGuestRequest: () => Promise<void> }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { spaces, failed, retry } = useLoungeSpaces();
  const selected = loungeCharacters.find(character => character.id === params.get('character'));
  const spaceOf = (id: string) => spaces?.find(space => space.host_persona === id);
  // Opening a sheet adds a history entry so the back button closes it; a shared link to a sheet closes in place.
  const openSheet = (id: string) => setParams({ character: id }, { state: { sheet: true } });
  const closeSheet = () => { if ((location.state as { sheet?: boolean } | null)?.sheet) navigate(-1); else setParams({}, { replace: true }); };
  return <main className="lounge-lobby lounge-home">
    <header className="lounge-home-intro">
      <span>상상의 집</span>
      <h1>오늘은 누구와 이야기할까요?</h1>
    </header>
    <ul className="lounge-cast" aria-label="캐릭터">
      {loungeCharacters.map(character => {
        const host = getLoungeHost(character.id), space = spaceOf(character.id);
        return <li key={character.id}>
          <button type="button" className="lounge-cast-card" aria-haspopup="dialog" onClick={() => openSheet(character.id)}>
            <img src={host.portrait} alt={`${character.name}의 AI 생성 인물 사진`} loading="lazy" style={{ background: host.color }} />
            <span><strong>{character.name}</strong><small>{character.job}</small></span>
          </button>
          <p className="lounge-cast-count"><Users size={13} aria-hidden="true" /> 소셜 대화 · {space ? `${space.present_count}명` : spaces ? '준비 중' : '확인 중'}</p>
        </li>;
      })}
    </ul>
    {failed && !spaces && <SpacesStatus failed retry={retry} />}
    <footer className="lounge-footer"><span>AI로 만든 가상의 인물 사진과 합성 음성이에요.</span><span>상상의 집 · 테스트 오픈</span></footer>
    {selected && <LoungeCharacterSheet key={selected.id} character={selected} space={spaceOf(selected.id)} spacesLoaded={Boolean(spaces)} user={user} onGuestRequest={onGuestRequest} onClose={closeSheet} />}
  </main>;
}

/**
 * A character's sheet over the home: who they are, how many people are talking with them, and the ways in.
 * Entering takes the visitor's own table, else the fullest table with a seat, else opens the first table; when every
 * table is full they can wait in line or open a new table.
 */
function LoungeCharacterSheet({ character, space, spacesLoaded, user, onGuestRequest, onClose }: {
  character: LoungeCharacter; space?: LoungeSpace; spacesLoaded: boolean; user: AppUser | null; onGuestRequest: () => Promise<void>; onClose: () => void;
}) {
  const host = getLoungeHost(character.id), profile = loungeCharacterProfiles[character.id];
  const wait = useLoungeWait();
  const spaceId = space?.id;
  const waiting = Boolean(spaceId) && wait?.spaceId === spaceId;
  const [tables, setTables] = useState<LoungeSpaceTable[] | null>(null);
  const [error, setError] = useState('');
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  useEffect(() => {
    if (!spaceId) return;
    let mounted = true;
    const load = () => { void listLoungeSpaceTables(spaceId).then(next => { if (mounted) setTables(next); }, () => { if (mounted) setTables(previous => previous ?? []); }); };
    load();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') load(); }, waiting ? 5000 : 10_000);
    return () => { mounted = false; clearInterval(interval); };
  }, [spaceId, waiting]);
  const seat = tables?.find(table => table.mine) ?? tables?.filter(table => table.present_count < table.capacity).sort((a, b) => b.present_count - a.present_count)[0];
  const full = Boolean(tables?.length) && !seat;
  const startWaiting = async () => {
    if (!space) return;
    setError('');
    try {
      if (!user) await onGuestRequest();
      // One line at a time: waiting here leaves the line of another space.
      const previous = currentLoungeWait();
      if (previous && previous.spaceId !== space.id) void leaveLoungeWait(previous.spaceId).catch(() => {});
      startLoungeWait(space.id, space.name);
    } catch (err) { setError(errorText(err)); }
  };
  const cancelWaiting = () => { if (!space) return; stopLoungeWait(); void leaveLoungeWait(space.id).catch(() => {}); };
  const present = space?.present_count ?? 0;
  return <div className="lounge-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="lounge-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button ref={closeButton} type="button" className="lounge-sheet-close" onClick={onClose} aria-label="닫기"><X size={18} /></button>
      <img className="lounge-sheet-photo" src={host.portrait} alt={`${character.name}의 AI 생성 인물 사진`} style={{ background: host.color }} />
      <div className="lounge-sheet-body">
        <span className="lounge-sheet-eyebrow">{host.name}</span>
        <h2 id={titleId}>{character.name}<small>{character.job} · {character.age}</small></h2>
        <p className="lounge-sheet-tagline">{character.tagline}</p>
        {profile && <ul className="lounge-sheet-traits">{profile.traits.map(trait => <li key={trait}>{trait}</li>)}</ul>}
        {profile && <p className="lounge-sheet-summary">{profile.summary}</p>}
        <p className="lounge-sheet-status"><Users size={14} aria-hidden="true" />
          <span>{!space ? spacesLoaded ? '지금은 소셜 대화를 열지 않았어요.' : '소셜 대화를 확인하고 있어요.'
            : present ? `지금 ${present}명이 ${koreanWith(character.name)} 이야기하고 있어요.` : '아직 아무도 없어요. 첫 손님이 되어 보세요.'}
          {space?.topic && <small>지금 이야기 · {space.topic}</small>}</span>
        </p>
        {space && <div className="lounge-sheet-actions">
          {!tables ? <span className="lounge-sheet-enter disabled"><LoaderCircle size={16} className="lounge-spin" /> 자리 확인 중</span>
            : <Link className="lounge-sheet-enter" to={seat ? `/lounge/spaces/${space.id}/join?table=${encodeURIComponent(seat.id)}` : `/lounge/spaces/${space.id}/open`}>
              <DoorOpen size={16} /> {seat?.mine ? '내 자리로 돌아가기' : full ? '새 테이블로 입장' : '입장'}</Link>}
          {waiting ? <button type="button" className="lounge-sheet-wait" onClick={cancelWaiting}><X size={15} /> 대기 취소</button>
            : <button type="button" className="lounge-sheet-wait" disabled={!full} onClick={() => void startWaiting()} title={full ? undefined : '자리가 있어서 바로 입장할 수 있어요.'}><Hourglass size={15} /> 대기</button>}
          <Link className="lounge-sheet-solo" to={`/lounge/spaces/${space.id}/solo`}><Swords size={15} /> 둘이서 대화</Link>
        </div>}
        {waiting && <p className="lounge-sheet-note" role="status"><LoaderCircle size={14} className="lounge-spin" /> {wait?.ahead === null || wait?.ahead === undefined ? '순서를 확인하고 있어요.' : wait.ahead ? `내 앞에 ${wait.ahead}명이 있어요.` : '다음 차례예요.'} 자리가 나면 바로 앉혀 드릴게요.</p>}
        {!waiting && full && <p className="lounge-sheet-note">자리가 모두 찼어요. 대기하면 자리가 나는 대로 앉고, 새 테이블로 입장하면 {koreanWith(character.name)} 새 대화를 시작해요.{space?.waiting ? ` 지금 ${space.waiting}명이 기다리고 있어요.` : ''}</p>}
        {error && <p className="lounge-error" role="alert">{error}</p>}
        <Link className="lounge-sheet-more" to={`/lounge/characters/${character.id}`}>인물 소개 전체 보기 <ArrowRight size={14} /></Link>
      </div>
    </section>
  </div>;
}

/** A space: its tables with topic and people. Visitors choose a table; when every table is full they wait in line or open another. */
export function LoungeSpacePage({ spaceId, user, onGuestRequest }: { spaceId: string; user: AppUser | null; onGuestRequest: () => Promise<void> }) {
  const { spaces, failed, retry } = useLoungeSpaces();
  const [tables, setTables] = useState<LoungeSpaceTable[] | null>(null);
  const wait = useLoungeWait();
  const waiting = wait?.spaceId === spaceId;
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const load = () => { void listLoungeSpaceTables(spaceId).then(next => { if (mounted) setTables(next); }, () => { if (mounted) setTables(previous => previous ?? []); }); };
    load();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') load(); }, waiting ? 5000 : 10_000);
    return () => { mounted = false; clearInterval(interval); };
  }, [spaceId, waiting]);
  const startWaiting = async (name: string) => {
    setError('');
    try {
      if (!user) await onGuestRequest();
      // One line at a time: waiting here leaves the line of another space.
      const previous = currentLoungeWait();
      if (previous && previous.spaceId !== spaceId) void leaveLoungeWait(previous.spaceId).catch(() => {});
      startLoungeWait(spaceId, name);
    } catch (err) { setError(errorText(err)); }
  };
  const cancelWaiting = () => { stopLoungeWait(); void leaveLoungeWait(spaceId).catch(() => {}); };
  const space = spaces?.find(item => item.id === spaceId);
  if (!spaces) return <main className="lounge-lobby lounge-home"><SpacesStatus failed={failed} retry={retry} /></main>;
  if (!space) return <main className="lounge-join-gate"><Coffee size={40} /><h1>지금은 열려 있지 않은 방이에요</h1><Link to="/lounge">상상의 집으로 돌아가기</Link></main>;
  const host = getLoungeHost(space.host_persona), theme = getLoungeTheme(space.theme), character = getLoungeCharacter(space.host_persona);
  const name = character?.name ?? host.name;
  const open = tables?.filter(table => table.mine || table.present_count < table.capacity) ?? [];
  const allFull = Boolean(tables?.length) && !open.length;
  return <main className="lounge-lobby lounge-space-page">
    <Link to="/lounge" className="lounge-space-back"><ArrowLeft size={15} /> 상상의 집</Link>
    <section className="lounge-space-hero">
      <img src={theme.image} alt="" />
      <div>
        <span className="lounge-home-eyebrow">{name}의 공간</span>
        <h1>{space.name}</h1>
        {character && <p className="lounge-space-quote">“{character.quote}”</p>}
        <div className="lounge-space-hero-meta"><LoungeHostPortrait hostId={host.id} /><span><strong>{name}</strong> · {host.name}</span><Link to={`/lounge/characters/${space.host_persona}`} className="lounge-space-presence-inline">인물 소개</Link></div>
      </div>
    </section>

    <section className="lounge-space-tables" aria-labelledby="lounge-space-tables-title">
      <h2 id="lounge-space-tables-title">지금 이 방에서는</h2>
      <p>나누는 이야기와 함께 있는 사람을 보고 참석할지 정해 보세요. 한 테이블에는 6명까지 앉아요.</p>
      {!tables ? <p className="lounge-space-tables-empty"><LoaderCircle size={15} className="lounge-spin" /> 테이블을 살펴보고 있어요.</p>
        : !tables.length ? <div className="lounge-space-first"><div><strong>아직 아무도 없어요.</strong><p>첫 손님이 되면 {koreanSubject(name)} 먼저 말을 걸고, 다음 손님이 오면 함께 이야기해요.</p></div><Link className="lounge-space-enter" to={`/lounge/spaces/${space.id}/open`}><DoorOpen size={16} /> 참석하기</Link></div>
        : <ul>{tables.map(table => {
          const full = !table.mine && table.present_count >= table.capacity;
          return <li key={table.id}>
            <div>
              <span className="lounge-space-table-label">지금 이야기</span>
              <strong>{table.topic ?? '주제 없이 자유롭게'}</strong>
              <People names={table.participants} limit={6} />
              <small><Users size={12} /> {table.present_count} / {table.capacity}명{table.mine ? ' · 내가 앉은 테이블' : ''}</small>
            </div>
            {full ? <span className="lounge-space-full">가득 찼어요</span> : <Link className="lounge-space-enter" to={`/lounge/spaces/${space.id}/join?table=${encodeURIComponent(table.id)}`}>{table.mine ? '돌아가기' : '참석하기'} <ArrowRight size={14} /></Link>}
          </li>;
        })}</ul>}
      {allFull && !waiting && <div className="lounge-space-choice" role="group" aria-label="자리가 가득 찼을 때">
        <strong>지금은 자리가 모두 찼어요. 어떻게 할까요?</strong>
        <div>
          <button type="button" onClick={() => void startWaiting(space.name)}><Hourglass size={16} /><span><b>자리가 나면 들어가기</b><small>순서대로 기다렸다가 자리가 나면 바로 앉아요.{space.waiting ? ` 지금 ${space.waiting}명이 기다리고 있어요.` : ''}</small></span></button>
          <Link to={`/lounge/spaces/${space.id}/open`}><Plus size={16} /><span><b>새 테이블 열기</b><small>{koreanWith(name)} 새 대화를 시작해요. 다음 손님은 이 테이블에도 앉을 수 있어요.</small></span></Link>
        </div>
      </div>}
      {waiting && <div className="lounge-space-waiting" role="status">
        <LoaderCircle size={18} className="lounge-spin" />
        <span><b>자리를 기다리는 중이에요</b><small>{wait?.ahead === null || wait?.ahead === undefined ? '순서를 확인하고 있어요.' : wait.ahead ? `내 앞에 ${wait.ahead}명이 있어요.` : '다음 차례예요.'} 자리가 나면 바로 앉혀 드릴게요. 상상의 집 안의 다른 화면으로 가도 대기는 유지돼요.</small></span>
        <button type="button" onClick={cancelWaiting}><X size={15} /> 대기 취소</button>
      </div>}
      {error && <p className="lounge-error" role="alert">{error}</p>}
    </section>

    <article className="lounge-space-option solo">
      <Swords size={22} /><h2>{koreanWith(name)} 둘이서 <span>솔로 플레이</span></h2>
      <p>다른 손님 없이 1:1로 이야기해요. 대화할수록 {koreanSubject(name)} 당신을 다르게 대해요.</p>
      <Link className="lounge-space-enter" to={`/lounge/spaces/${space.id}/solo`}><Swords size={15} /> 둘이서 시작하기</Link>
    </article>
  </main>;
}

/** Seats the visitor (a chosen table, a new table, or a solo one-to-one) and opens it. Visitors without a name join as guests first. */
export function LoungeSpaceEntry({ spaceId, entry, user, onGuestRequest, onLoginRequest }: { spaceId: string; entry: string; user: AppUser | null; onGuestRequest: () => Promise<void>; onLoginRequest: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const table = params.get('table');
  const solo = entry === 'solo';
  const valid = solo || entry === 'open' || (entry === 'join' && Boolean(table));
  const [error, setError] = useState('');
  const nickname = user?.nickname;
  useEffect(() => {
    if (!nickname || !valid) return;
    let cancelled = false;
    const seat = solo ? startLoungeSolo(spaceId, nickname) : table && entry === 'join' ? enterLoungeTable(table, nickname) : openLoungeTable(spaceId, nickname);
    seat.then(roomId => {
      if (cancelled) return;
      if (!solo) stopLoungeWait();
      navigate(`/lounge/${roomId}`, { replace: true });
    }, err => { if (!cancelled) setError(errorText(err)); });
    return () => { cancelled = true; };
  }, [spaceId, entry, solo, valid, table, nickname, navigate]);
  if (!valid) return <main className="lounge-join-gate"><Coffee size={40} /><h1>어느 테이블에 앉을지 골라 주세요</h1><Link className="lounge-primary" to={`/lounge/spaces/${spaceId}`}>방 둘러보기 <ArrowRight size={17} /></Link></main>;
  if (!user) return <main className="lounge-join-gate"><DoorOpen size={40} /><h1>{solo ? '둘이서 이야기하기 전에' : '들어가기 전에'} 불릴 이름이 필요해요.</h1><p>게스트로 바로 들어가거나, 로그인하면 캐릭터와의 관계가 계정에 이어져요.</p>
    <button className="lounge-primary" type="button" onClick={() => { void onGuestRequest().catch(err => setError(errorText(err))); }}>게스트로 들어가기 <ArrowRight size={17} /></button>
    <button className="lounge-preview-button" type="button" onClick={onLoginRequest}>로그인해서 들어가기</button>
    {error && <p className="lounge-error" role="alert">{error}</p>}</main>;
  if (error) return <main className="lounge-join-gate"><Coffee size={40} /><h1>{solo ? '둘만의 자리를 열지 못했어요' : '자리에 앉지 못했어요'}</h1><p className="lounge-error" role="alert">{error}</p>
    <Link className="lounge-primary" to={`/lounge/spaces/${spaceId}`} replace>방으로 돌아가 다시 고르기 <ArrowRight size={17} /></Link></main>;
  return <main className="lounge-join-gate"><LoaderCircle size={36} className="lounge-spin" /><h1>{solo ? '둘만의 자리를 준비하는 중이에요…' : '자리로 안내하는 중이에요…'}</h1></main>;
}

/**
 * Keeps a visitor's place in line while they move around the house: checks in every 4 seconds and, when a seat is
 * free for them, seats them. Someone in the middle of another conversation is asked instead of being moved.
 */
export function LoungeWaitWatcher({ user }: { user: AppUser | null }) {
  const wait = useLoungeWait();
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState<{ space: string; room: string } | null>(null);
  const inConversation = /^\/lounge\/lounge-/.test(location.pathname);
  const inConversationRef = useRef(inConversation);
  useEffect(() => { inConversationRef.current = inConversation; }, [inConversation]);
  const userId = user?.id, spaceId = wait?.spaceId;
  useEffect(() => {
    if (!spaceId || !userId) return;
    let active = true;
    const check = () => { void waitLoungeSpace(spaceId).then(result => {
      if (!active) return;
      setLoungeWaitAhead(spaceId, result.ahead);
      if (!result.room) { setReady(null); return; }
      if (inConversationRef.current) { setReady({ space: spaceId, room: result.room }); return; }
      stopLoungeWait();
      navigate(`/lounge/spaces/${spaceId}/join?table=${encodeURIComponent(result.room)}`);
    }, () => { /* The next check-in retries. */ }); };
    check();
    const interval = setInterval(check, 4000);
    return () => { active = false; clearInterval(interval); };
  }, [spaceId, userId, navigate]);
  if (!wait || !user) return null;
  const seat = ready?.space === wait.spaceId ? ready.room : null;
  // The space's own page shows the waiting state in place.
  if (!seat && location.pathname === `/lounge/spaces/${wait.spaceId}`) return null;
  const cancel = () => { stopLoungeWait(); void leaveLoungeWait(wait.spaceId).catch(() => {}); };
  return <div className={`lounge-wait-banner ${seat ? 'ready' : ''}`} role="status">
    {seat ? <><DoorOpen size={16} /><span><b>{wait.spaceName}</b>에 자리가 났어요.</span><button type="button" className="primary" onClick={() => { stopLoungeWait(); navigate(`/lounge/spaces/${wait.spaceId}/join?table=${encodeURIComponent(seat)}`); }}>지금 들어가기</button></>
      : <><Hourglass size={16} /><span><b>{wait.spaceName}</b> 자리를 기다리는 중 · {wait.ahead === null ? '순서 확인 중' : wait.ahead ? `내 앞에 ${wait.ahead}명` : '다음 차례'}</span><Link to={`/lounge/spaces/${wait.spaceId}`}>보기</Link></>}
    <button type="button" onClick={cancel} aria-label="대기 취소"><X size={14} /> 취소</button>
  </div>;
}
