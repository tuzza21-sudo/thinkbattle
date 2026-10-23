import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Coffee, Crown, DoorOpen, Hourglass, LoaderCircle, Plus, RefreshCw, Swords, Users, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { AppUser } from '../types';
import { getLoungeHost, getLoungeTheme, isLoungeAgeGroup, loungeHostThemes, loungeAgeGroups, loungeAgeLimitLabel, loungeCharacterProfiles, loungeTopics, type LoungeAgeGroup, type LoungeHostId, type LoungeOpenTable, type LoungeSpace, type LoungeSpaceTable } from '../lib/lounge';
import { enterLoungeTable, leaveLoungeWait, listLoungeOpenTables, listLoungeSpaces, listLoungeSpaceTables, openLoungeTable, startLoungeSolo, waitLoungeSpace } from '../lib/loungeApi';
import { getLoungeCharacter, koreanSubject, koreanWith, loungeCharacters, type LoungeCharacter } from '../lib/loungeCharacters';
import { useDialog } from '../lib/useDialog';
import { listMyLoungeCharacters, listPublicLoungeCharacters, loungeCustomPortrait } from '../lib/loungeCustomClient';
import type { LoungeCustomCharacterRow } from '../lib/loungeCustomCharacters';
import { loungeTopicLimit } from '../lib/loungeTopics';
import { loungeOneToOneStoriesOnly, loungeStoriesPath } from '../lib/loungeScenarios';
import { currentLoungeWait, setLoungeWaitAhead, startLoungeWait, stopLoungeWait, useLoungeWait } from '../lib/loungeWait';
import './LoungeSpaces.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/** Reloads `load` now and every `ms` while the page is visible. */
function usePolled<T>(load: () => Promise<T>, ms: number) {
  const [value, setValue] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let mounted = true;
    const run = () => { void load().then(next => { if (mounted) { setValue(next); setFailed(false); } }, () => { if (mounted) setFailed(true); }); };
    run();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') run(); }, ms);
    return () => { mounted = false; clearInterval(interval); };
  }, [load, ms, attempt]);
  return { value, failed, retry: () => setAttempt(previous => previous + 1) };
}
/** The open places with live presence. */
function useLoungeSpaces() {
  const { value, failed, retry } = usePolled(listLoungeSpaces, 30_000);
  return { spaces: value, failed, retry };
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

/** How many people are at a room, and how many of them are men and women. */
function RoomHeadcount({ table }: { table: Pick<LoungeSpaceTable, 'present_count' | 'capacity' | 'male_count' | 'female_count' | 'age_groups'> }) {
  const ages = loungeAgeLimitLabel(table.age_groups);
  return <span className="lounge-headcount" aria-label={`${table.present_count}명 참여 중, 정원 ${table.capacity}명, 남성 ${table.male_count}명, 여성 ${table.female_count}명${ages ? `, 연령대 ${ages}` : ''}`}>
    <span><Users size={13} aria-hidden="true" />{table.present_count}/{table.capacity}명</span>
    <span className="male" aria-hidden="true"><i />남 {table.male_count}</span>
    <span className="female" aria-hidden="true"><i />여 {table.female_count}</span>
    {ages && <span className="age" aria-hidden="true">{ages}만</span>}
  </span>;
}

/**
 * A row of cards that scrolls sideways, with arrow buttons on both ends (Netflix style). An arrow shows only when
 * there is more to see on its side; on touch screens the row also swipes.
 */
function LoungeRow({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const measure = useCallback(() => {
    const element = track.current;
    if (!element) return;
    setEdges({ start: element.scrollLeft <= 4, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of Array.from(element.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, children]);
  // One page at a time, landing on a card edge.
  const page = (direction: 1 | -1) => {
    const element = track.current;
    if (!element) return;
    const card = element.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(element).columnGap) || 0;
    const step = card ? card.offsetWidth + gap : element.clientWidth;
    const perPage = Math.max(1, Math.floor((element.clientWidth + gap) / step));
    element.scrollBy({ left: direction * perPage * step, behavior: 'smooth' });
  };
  return <div className={`lounge-row ${className ?? ''}`}>
    <button type="button" className="lounge-row-arrow prev" onClick={() => page(-1)} aria-label={`${label} 이전`} hidden={edges.start}><ChevronLeft size={26} /></button>
    <ul ref={track} className="lounge-row-track" aria-label={label} onScroll={measure}>{children}</ul>
    <button type="button" className="lounge-row-arrow next" onClick={() => page(1)} aria-label={`${label} 다음`} hidden={edges.end}><ChevronRight size={26} /></button>
  </div>;
}

/** A room as a card: the place's photo, then the topic, character and people. A full room cannot be entered. */
function RoomCard({ table }: { table: LoungeOpenTable }) {
  const theme = getLoungeTheme(table.theme), character = getLoungeCharacter(table.host_persona), host = getLoungeHost(table.host_persona);
  const full = !table.mine && table.present_count >= table.capacity;
  const body = <>
    <span className="lounge-room-card-photo">
      <img src={theme.image} alt="" loading="lazy" />
      <span className="lounge-room-card-place">{table.space_name}</span>
      {table.mine ? <span className="lounge-room-card-badge mine">내 대화방</span> : full && <span className="lounge-room-card-badge">가득 찼어요</span>}
    </span>
    <span className="lounge-room-card-body">
      <strong>{table.topic ?? '주제 없이 자유롭게'}</strong>
      <RoomHeadcount table={table} />
      <span className="lounge-room-card-host"><img src={host.portrait} alt="" style={{ background: host.color }} />{koreanWith(character?.name ?? host.name)} 함께{table.owner && <small><Crown size={11} aria-hidden="true" /> {table.owner}</small>}</span>
    </span>
  </>;
  return <li>{full
    ? <div className="lounge-room-card full" aria-disabled="true">{body}</div>
    : <Link className="lounge-room-card" to={`/lounge/spaces/${table.space_id}/join?table=${encodeURIComponent(table.id)}`} aria-label={`${table.topic ?? '자유 대화'} · ${table.space_name} · ${table.present_count}/${table.capacity}명 · ${table.mine ? '내 대화방으로 돌아가기' : '참여하기'}`}>{body}</Link>}</li>;
}

/** 사석 home: open rooms by place on top, the characters who help conversations below. */
export function LoungeHome({ user, onGuestRequest }: { user: AppUser | null; onGuestRequest: () => Promise<void> }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { spaces, failed, retry } = useLoungeSpaces();
  const rooms = usePolled(listLoungeOpenTables, 15_000);
  const tables = rooms.value;
  const [creating, setCreating] = useState<{ space?: string; host?: LoungeHostId } | null>(null);
  const selected = loungeCharacters.find(character => character.id === params.get('character'));
  // Opening a sheet adds a history entry so the back button closes it; a shared link to a sheet closes in place.
  const openSheet = (id: string) => setParams({ character: id }, { state: { sheet: true } });
  const closeSheet = () => { if ((location.state as { sheet?: boolean } | null)?.sheet) navigate(-1); else setParams({}, { replace: true }); };
  // Places with no open room follow the rooms, each inviting the first room there.
  const quietPlaces = spaces?.filter(space => !tables?.some(table => table.space_id === space.id)) ?? [];
  return <main className="lounge-lobby lounge-home">
    <section className="lounge-home-section" aria-labelledby="lounge-rooms-title">
      <header className="lounge-home-intro">
        <div>
          <h1 id="lounge-rooms-title">함께 대화하는 공간</h1>
          <p>혼자 오셔도 돼요. 캐릭터들이 대화를 도와줄 거예요.</p>
        </div>
        <button type="button" className="lounge-home-create" onClick={() => setCreating({})}><Plus size={16} /> 새 대화방 만들기</button>
      </header>
      {!spaces || !tables ? (failed || rooms.failed) ? <SpacesStatus failed retry={() => { retry(); rooms.retry(); }} /> : <SpacesStatus failed={false} retry={retry} />
        : <LoungeRow label="대화방" className="lounge-room-row">
          {tables.map(table => <RoomCard key={table.id} table={table} />)}
          {quietPlaces.map(space => <li key={space.id}><button type="button" className="lounge-room-card quiet" onClick={() => setCreating({ space: space.id })}>
            <span className="lounge-room-card-photo"><img src={getLoungeTheme(space.theme).image} alt="" loading="lazy" /><span className="lounge-room-card-place">{space.name}</span></span>
            <span className="lounge-room-card-body"><strong>아직 열린 대화방이 없어요</strong><small>{getLoungeTheme(space.theme).subtitle}</small><span className="lounge-room-card-open"><Plus size={13} /> 이 장소에서 첫 대화방 열기</span></span>
          </button></li>)}
        </LoungeRow>}
    </section>

    <section className="lounge-home-section" aria-labelledby="lounge-cast-title">
      <header className="lounge-home-subhead with-action">
        <div>
          <h2 id="lounge-cast-title">대화를 도와줄 캐릭터</h2>
          <p>대화방을 만들 때 함께할 캐릭터를 골라요. 둘이서만 이야기할 수도 있어요.</p>
        </div>
        <Link to="/lounge/create" className="lounge-home-create"><Plus size={16} /> 캐릭터 추가하기</Link>
      </header>
      <LoungeRow label="캐릭터" className="lounge-cast-row">
        {loungeCharacters.map(character => {
          const host = getLoungeHost(character.id), count = tables?.filter(table => table.host_persona === character.id).length ?? 0;
          return <li key={character.id}>
            <button type="button" className="lounge-cast-card" aria-haspopup="dialog" onClick={() => openSheet(character.id)}>
              <img src={host.portrait} alt={`${character.name}의 AI 생성 인물 사진`} loading="lazy" style={{ background: host.color }} />
              <span><strong>{character.name}</strong><small>{character.job}</small></span>
            </button>
            <p className="lounge-cast-count"><Users size={13} aria-hidden="true" /> {tables ? count ? `${count}개 방에서 대화 중` : '지금은 쉬는 중' : '확인 중'}</p>
          </li>;
        })}
      </LoungeRow>
    </section>
    <LoungeMemberCast user={user} />
    <footer className="lounge-footer"><span>AI로 만든 가상의 인물 사진과 합성 음성이에요.</span><span>사석 · 테스트 오픈</span></footer>
    {selected && <LoungeCharacterSheet key={selected.id} character={selected} spaces={spaces} tables={tables}
      onCreate={() => { closeSheet(); setCreating({ host: selected.id }); }} onClose={closeSheet} />}
    {creating && spaces && <LoungeCreateRoom spaces={spaces} initialSpace={creating.space} initialHost={creating.host} user={user} onGuestRequest={onGuestRequest} onClose={() => setCreating(null)} />}
  </main>;
}


const memberCastStatus: Record<LoungeCustomCharacterRow['status'], string> = { private: '나만 대화', pending: '공개 검수 중', public: '공개됨', rejected: '공개 반려' };
/** Characters members made: the member's own (with where they stand) and public ones from everyone else. */
function LoungeMemberCast({ user }: { user: AppUser | null }) {
  const member = user && !user.isAnonymous ? user.id : null;
  const [mine, setMine] = useState<LoungeCustomCharacterRow[]>([]);
  const [shared, setShared] = useState<LoungeCustomCharacterRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    listPublicLoungeCharacters().then(rows => { if (!cancelled) setShared(rows); }).catch(() => { /* The section waits for the table. */ });
    if (member) listMyLoungeCharacters(member).then(rows => { if (!cancelled) setMine(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, [member]);
  const shown = [...(member ? mine : []), ...shared.filter(row => row.owner_id !== member)];
  if (!shown.length) return null;
  return <section className="lounge-home-section" aria-labelledby="lounge-member-cast-title">
    <header className="lounge-home-subhead">
      <h2 id="lounge-member-cast-title">회원이 만든 캐릭터</h2>
      <p>내가 만든 캐릭터와, 검수를 거쳐 공개된 다른 회원의 캐릭터예요.</p>
    </header>
    <LoungeRow label="회원이 만든 캐릭터" className="lounge-cast-row">
      {shown.map(row => {
        const portrait = loungeCustomPortrait(row);
        return <li key={row.id}>
          <Link to={`/lounge/characters/${row.id}`} className="lounge-cast-card">
            {portrait ? <img src={portrait} alt={`${row.name}의 대표 사진`} loading="lazy" /> : <span className="lounge-cast-card-empty" aria-hidden="true">✨</span>}
            <span><strong>{row.name}</strong><small>{row.sheet.job}</small></span>
          </Link>
          <p className="lounge-cast-count">{row.owner_id === member ? `내 캐릭터 · ${memberCastStatus[row.status]}` : '회원이 만든 캐릭터'}</p>
        </li>;
      })}
    </LoungeRow>
  </section>;
}

/** A character's sheet over the home: who they are, the rooms they are helping now, and the ways to talk with them. */
function LoungeCharacterSheet({ character, spaces, tables, onCreate, onClose }: {
  character: LoungeCharacter; spaces: LoungeSpace[] | null; tables: LoungeOpenTable[] | null; onCreate: () => void; onClose: () => void;
}) {
  const host = getLoungeHost(character.id), profile = loungeCharacterProfiles[character.id];
  const titleId = useId();
  const closeButton = useDialog(onClose);
  // Solo play can be with any character; it takes the place with the character's own scenery, else the first open one.
  const home = spaces?.find(space => loungeHostThemes[character.id]?.includes(space.theme)) ?? spaces?.find(space => space.host_persona === character.id) ?? spaces?.[0];
  const rooms = tables?.filter(table => table.host_persona === character.id) ?? [];
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
        <div className="lounge-sheet-status"><Users size={14} aria-hidden="true" />
          <span>{!tables ? '대화방을 확인하고 있어요.' : rooms.length ? `지금 ${rooms.length}개 대화방에서 ${koreanSubject(character.name)} 대화를 돕고 있어요.` : `지금은 ${koreanSubject(character.name)} 함께하는 대화방이 없어요.`}
            {rooms.length > 0 && <ul className="lounge-sheet-rooms">{rooms.slice(0, 3).map(table => <li key={table.id}>
              <Link to={`/lounge/spaces/${table.space_id}/join?table=${encodeURIComponent(table.id)}`}><b>{table.topic ?? '주제 없이 자유롭게'}</b><small>{table.space_name} · {table.present_count}/{table.capacity}명 · 남 {table.male_count} · 여 {table.female_count}</small></Link>
            </li>)}</ul>}</span>
        </div>
        <div className="lounge-sheet-actions">
          <button type="button" className="lounge-sheet-enter" onClick={onCreate}><Plus size={16} /> {koreanWith(character.name)} 대화방 만들기</button>
          {loungeOneToOneStoriesOnly ? <Link className="lounge-sheet-solo" to={loungeStoriesPath(character.id)}><BookOpen size={15} /> 둘만의 이야기</Link>
            : home && <Link className="lounge-sheet-solo" to={`/lounge/spaces/${home.id}/solo?host=${character.id}`}><Swords size={15} /> 둘이서 대화</Link>}
        </div>
        <Link className="lounge-sheet-more" to={`/lounge/characters/${character.id}`}>인물 소개 전체 보기 <ArrowRight size={14} /></Link>
      </div>
    </section>
  </div>;
}

/**
 * Opening a room: the place, the topic and the character who helps. The one who opens it is its owner; the room
 * shows on the home with its topic and people once the owner sits down. When the visitor already chose a place
 * (its card or its page), the place is not asked again: only the topic and the character.
 */
function LoungeCreateRoom({ spaces, initialSpace, initialHost, user, onGuestRequest, onClose }: {
  spaces: LoungeSpace[]; initialSpace?: string; initialHost?: LoungeHostId; user: AppUser | null; onGuestRequest: () => Promise<void>; onClose: () => void;
}) {
  const navigate = useNavigate();
  const titleId = useId();
  const closeButton = useDialog(onClose);
  const [spaceId, setSpaceId] = useState(initialSpace ?? '');
  const [topic, setTopic] = useState('');
  const [ages, setAges] = useState<LoungeAgeGroup[]>([]);
  const [capacity, setCapacity] = useState(6);
  const [hostId, setHostId] = useState<LoungeHostId | ''>(initialHost ?? spaces.find(space => space.id === initialSpace)?.host_persona ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fixedSpace = spaces.find(space => space.id === initialSpace);
  // A character picked before opening the form stays picked: the form does not offer the others again.
  const fixedHost = initialHost ? getLoungeCharacter(initialHost) : undefined;
  const maxSeats = Math.min(6, spaces.find(space => space.id === spaceId)?.capacity ?? 6);
  const seatChoices = Array.from({ length: maxSeats - 1 }, (_, index) => index + 2);
  const seats = Math.min(capacity, maxSeats);
  const topicStep = fixedSpace ? 1 : 2, hostStep = topicStep + 1, seatStep = hostStep + (fixedHost ? 0 : 1), ageStep = seatStep + 1;
  const submit = async () => {
    if (!spaceId) { setError('대화할 장소를 골라 주세요.'); return; }
    if (!topic.trim()) { setError('대화 주제를 적어 주세요.'); return; }
    if (!hostId) { setError('대화를 도와줄 캐릭터를 골라 주세요.'); return; }
    setBusy(true); setError('');
    try {
      if (!user) await onGuestRequest();
      navigate(`/lounge/spaces/${spaceId}/open?${new URLSearchParams({ topic: topic.trim(), host: hostId, ...(ages.length ? { ages: ages.join(',') } : {}), ...(seats < maxSeats ? { capacity: String(seats) } : {}) })}`);
    } catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return <div className="lounge-sheet-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form className="lounge-sheet lounge-create" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <button ref={closeButton} type="button" className="lounge-sheet-close" onClick={onClose} aria-label="닫기"><X size={18} /></button>
      <header><span className="lounge-sheet-eyebrow">내가 방장이 돼요</span><h2 id={titleId}>새 대화방 만들기</h2></header>

      {fixedSpace ? <div className="lounge-create-place">
        <img src={getLoungeTheme(fixedSpace.theme).image} alt="" />
        <span><small>선택한 장소</small><b>{fixedSpace.name}</b></span>
      </div> : <fieldset className="lounge-create-field">
        <legend><b>1</b> 어디에서 이야기할까요?</legend>
        <div className="lounge-create-places">{spaces.map(space => {
          const theme = getLoungeTheme(space.theme);
          return <label key={space.id} className={spaceId === space.id ? 'selected' : ''}>
            <input type="radio" name="lounge-place" value={space.id} checked={spaceId === space.id} onChange={() => { setSpaceId(space.id); if (!hostId) setHostId(space.host_persona); }} />
            <img src={theme.image} alt="" loading="lazy" /><span>{space.name}</span>
          </label>;
        })}</div>
      </fieldset>}

      <fieldset className="lounge-create-field">
        <legend><b>{topicStep}</b> 어떤 이야기를 나눌까요?</legend>
        <input className="lounge-create-topic" value={topic} maxLength={loungeTopicLimit} onChange={event => setTopic(event.target.value)} placeholder="예: 요즘 빠져 있는 취미 이야기" aria-label="대화 주제" />
        <div className="lounge-create-ideas" role="group" aria-label="주제 예시">{loungeTopics.map(item => <button type="button" key={item.id} onClick={() => setTopic(item.question)}>{item.emoji} {item.title}</button>)}</div>
        <small>다른 사람들이 방 목록에서 이 주제를 보고 들어와요. 방장은 대화 중에도 주제를 바꿀 수 있어요.</small>
      </fieldset>

      {fixedHost ? <div className="lounge-create-place lounge-create-host-fixed">
        <img src={getLoungeHost(fixedHost.id).portrait} alt="" style={{ background: getLoungeHost(fixedHost.id).color }} />
        <span><small>대화를 도와줄 캐릭터</small><b>{fixedHost.name}</b><small>{fixedHost.job}</small></span>
      </div> : <fieldset className="lounge-create-field">
        <legend><b>{hostStep}</b> 누가 대화를 도와줄까요?</legend>
        <div className="lounge-create-hosts">{loungeCharacters.map(character => {
          const host = getLoungeHost(character.id);
          return <label key={character.id} className={hostId === character.id ? 'selected' : ''}>
            <input type="radio" name="lounge-host" value={character.id} checked={hostId === character.id} onChange={() => setHostId(character.id)} />
            <img src={host.portrait} alt="" loading="lazy" style={{ background: host.color }} /><span><b>{character.name}</b><small>{character.job}</small></span>
          </label>;
        })}</div>
      </fieldset>}

      <fieldset className="lounge-create-field">
        <legend><b>{seatStep}</b> 방 인원</legend>
        <div className="lounge-create-ages lounge-create-seats" role="radiogroup" aria-label="방 인원">{seatChoices.map(count => <label key={count} className={seats === count ? 'selected' : ''}>
          <input type="radio" name="lounge-seats" value={count} checked={seats === count} onChange={() => setCapacity(count)} />{count}명
        </label>)}</div>
        <small>나를 포함해 최대 {seats}명이 앉아요. 캐릭터는 자리를 차지하지 않아요. 자리가 다 차면 더 들어올 수 없어요.</small>
      </fieldset>

      <fieldset className="lounge-create-field">
        <legend><b>{ageStep}</b> 연령대 제한 <em>선택</em></legend>
        <div className="lounge-create-ages" role="group" aria-label="입장할 수 있는 연령대">{loungeAgeGroups.map(group => <label key={group.id} className={ages.includes(group.id) ? 'selected' : ''}>
          <input type="checkbox" checked={ages.includes(group.id)} onChange={() => setAges(previous => previous.includes(group.id) ? previous.filter(item => item !== group.id) : [...previous, group.id])} />{group.label}
        </label>)}</div>
        <small>{ages.length ? `${loungeAgeLimitLabel(ages)}만 들어올 수 있어요.` : '고르지 않으면 누구나 들어올 수 있어요.'} 나이 정보를 입력한 분께 적용돼요.</small>
      </fieldset>

      {error && <p className="lounge-error" role="alert">{error}</p>}
      <button type="submit" className="lounge-primary lounge-create-submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="lounge-spin" /> : <DoorOpen size={16} />} 대화방 열고 들어가기</button>
    </form>
  </div>;
}

/** A place: its rooms with topic, character and people. Visitors choose a room or open one; when every room is full they can wait in line. */
export function LoungeSpacePage({ spaceId, user, onGuestRequest }: { spaceId: string; user: AppUser | null; onGuestRequest: () => Promise<void> }) {
  const { spaces, failed, retry } = useLoungeSpaces();
  const [tables, setTables] = useState<LoungeSpaceTable[] | null>(null);
  const [creating, setCreating] = useState(false);
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
  if (!space) return <main className="lounge-join-gate"><Coffee size={40} /><h1>지금은 열려 있지 않은 장소예요</h1><Link to="/lounge">사석으로 돌아가기</Link></main>;
  const theme = getLoungeTheme(space.theme), soloCharacter = getLoungeCharacter(space.host_persona);
  const soloName = soloCharacter?.name ?? getLoungeHost(space.host_persona).name;
  const open = tables?.filter(table => table.mine || table.present_count < table.capacity) ?? [];
  const allFull = Boolean(tables?.length) && !open.length;
  return <main className="lounge-lobby lounge-space-page">
    <Link to="/lounge" className="lounge-space-back"><ArrowLeft size={15} /> 사석</Link>
    <section className="lounge-space-hero">
      <img src={theme.image} alt="" />
      <div>
        <span className="lounge-home-eyebrow">{theme.tag}</span>
        <h1>{space.name}</h1>
        <p className="lounge-space-quote">{theme.caption}</p>
      </div>
    </section>

    <section className="lounge-space-tables" aria-labelledby="lounge-space-tables-title">
      <div className="lounge-space-tables-head">
        <div><h2 id="lounge-space-tables-title">이 장소의 대화방</h2>
          <p>주제와 함께 있는 사람을 보고 참석할지 정해 보세요. 한 방에는 6명까지 앉아요.</p></div>
        <button type="button" className="lounge-home-create" onClick={() => setCreating(true)}><Plus size={16} /> 새 대화방 만들기</button>
      </div>
      {!tables ? <p className="lounge-space-tables-empty"><LoaderCircle size={15} className="lounge-spin" /> 대화방을 살펴보고 있어요.</p>
        : !tables.length ? <div className="lounge-space-first"><div><strong>아직 열린 대화방이 없어요.</strong><p>주제와 캐릭터를 정해 첫 대화방을 열어 보세요. 혼자여도 캐릭터가 이야기를 이어 줘요.</p></div><button type="button" className="lounge-space-enter" onClick={() => setCreating(true)}><Plus size={16} /> 첫 대화방 열기</button></div>
        : <ul>{tables.map(table => {
          const full = !table.mine && table.present_count >= table.capacity;
          const host = getLoungeHost(table.host_persona), character = getLoungeCharacter(table.host_persona);
          return <li key={table.id}>
            <div>
              <span className="lounge-space-table-label">{table.owner ? <><Crown size={11} aria-hidden="true" /> 방장 {table.owner}</> : '지금 이야기'}</span>
              <strong>{table.topic ?? '주제 없이 자유롭게'}</strong>
              <span className="lounge-room-card-host"><img src={host.portrait} alt="" style={{ background: host.color }} />{koreanWith(character?.name ?? host.name)} 함께</span>
              <People names={table.participants} limit={6} />
              <small><RoomHeadcount table={table} />{table.mine ? ' · 내가 앉은 방' : ''}</small>
            </div>
            {full ? <span className="lounge-space-full">가득 찼어요</span> : <Link className="lounge-space-enter" to={`/lounge/spaces/${space.id}/join?table=${encodeURIComponent(table.id)}`}>{table.mine ? '돌아가기' : '참석하기'} <ArrowRight size={14} /></Link>}
          </li>;
        })}</ul>}
      {allFull && !waiting && <div className="lounge-space-choice" role="group" aria-label="자리가 가득 찼을 때">
        <strong>지금은 자리가 모두 찼어요. 어떻게 할까요?</strong>
        <div>
          <button type="button" onClick={() => void startWaiting(space.name)}><Hourglass size={16} /><span><b>자리가 나면 들어가기</b><small>순서대로 기다렸다가 자리가 나면 바로 앉아요.{space.waiting ? ` 지금 ${space.waiting}명이 기다리고 있어요.` : ''}</small></span></button>
          <button type="button" onClick={() => setCreating(true)}><Plus size={16} /><span><b>새 대화방 열기</b><small>내가 방장이 되어 주제와 캐릭터를 정해요.</small></span></button>
        </div>
      </div>}
      {waiting && <div className="lounge-space-waiting" role="status">
        <LoaderCircle size={18} className="lounge-spin" />
        <span><b>자리를 기다리는 중이에요</b><small>{wait?.ahead === null || wait?.ahead === undefined ? '순서를 확인하고 있어요.' : wait.ahead ? `내 앞에 ${wait.ahead}명이 있어요.` : '다음 차례예요.'} 자리가 나면 바로 앉혀 드릴게요. 사석 안의 다른 화면으로 가도 대기는 유지돼요.</small></span>
        <button type="button" onClick={cancelWaiting}><X size={15} /> 대기 취소</button>
      </div>}
      {error && <p className="lounge-error" role="alert">{error}</p>}
    </section>

    <article className="lounge-space-option solo">
      <Swords size={22} /><h2>{koreanWith(soloName)} 둘이서 <span>솔로 플레이</span></h2>
      {loungeOneToOneStoriesOnly && soloCharacter ? <>
        <p>이야기 하나를 골라 1:1로 시작해요. 함께할수록 {koreanSubject(soloName)} 당신을 다르게 대해요.</p>
        <Link className="lounge-space-enter" to={loungeStoriesPath(soloCharacter.id)}><BookOpen size={15} /> 이야기 고르기</Link>
      </> : <>
        <p>다른 손님 없이 1:1로 이야기해요. 대화할수록 {koreanSubject(soloName)} 당신을 다르게 대해요.</p>
        <Link className="lounge-space-enter" to={`/lounge/spaces/${space.id}/solo`}><Swords size={15} /> 둘이서 시작하기</Link>
      </>}
    </article>
    {creating && <LoungeCreateRoom spaces={spaces} initialSpace={space.id} user={user} onGuestRequest={onGuestRequest} onClose={() => setCreating(false)} />}
  </main>;
}

/** Seats the visitor (a chosen room, a new room with its topic and character, or a solo one-to-one) and opens it. */
export function LoungeSpaceEntry({ spaceId, entry, user, onGuestRequest, onLoginRequest }: { spaceId: string; entry: string; user: AppUser | null; onGuestRequest: () => Promise<void>; onLoginRequest: () => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const table = params.get('table');
  const topic = params.get('topic')?.trim().slice(0, loungeTopicLimit) ?? '';
  const hostParam = params.get('host');
  const host = loungeCharacters.find(character => character.id === hostParam)?.id;
  const solo = entry === 'solo';
  const agesKey = (params.get('ages') ?? '').split(',').filter(isLoungeAgeGroup).join(',');
  const seatParam = Math.trunc(Number(params.get('capacity')));
  const seatCount = seatParam >= 2 && seatParam <= 6 ? seatParam : undefined;
  // A one-to-one starts from a story now (see `loungeOneToOneStoriesOnly`), so an old link to the free one is turned away.
  const storiesOnly = solo && loungeOneToOneStoriesOnly;
  const valid = (solo && !storiesOnly) || (entry === 'open' && Boolean(topic && host)) || (entry === 'join' && Boolean(table));
  const [error, setError] = useState('');
  const nickname = user?.nickname;
  useEffect(() => {
    if (!nickname || !valid) return;
    let cancelled = false;
    const seat = solo ? startLoungeSolo(spaceId, nickname, host) : table && entry === 'join' ? enterLoungeTable(table, nickname) : openLoungeTable(spaceId, nickname, topic, host!, agesKey.split(',').filter(isLoungeAgeGroup), seatCount);
    seat.then(roomId => {
      if (cancelled) return;
      if (!solo) stopLoungeWait();
      navigate(`/lounge/${roomId}`, { replace: true });
    }, err => { if (!cancelled) setError(errorText(err)); });
    return () => { cancelled = true; };
  }, [spaceId, entry, solo, valid, table, topic, host, agesKey, seatCount, nickname, navigate]);
  if (storiesOnly) return <main className="lounge-join-gate"><BookOpen size={40} /><h1>1:1 대화는 이야기로 시작해요</h1><p>캐릭터의 이야기 하나를 고르면 짧은 프롤로그 뒤에 장면 속에서 대화가 시작돼요.</p>
    <Link className="lounge-primary" to={host ? loungeStoriesPath(host) : '/lounge'}>{host ? '이야기 고르러 가기' : '캐릭터 고르러 가기'} <ArrowRight size={17} /></Link></main>;
  if (!valid) return <main className="lounge-join-gate"><Coffee size={40} /><h1>{entry === 'open' ? '대화 주제와 캐릭터를 먼저 정해 주세요' : '어느 대화방에 앉을지 골라 주세요'}</h1><Link className="lounge-primary" to={`/lounge/spaces/${spaceId}`}>장소 둘러보기 <ArrowRight size={17} /></Link></main>;
  if (!user) return <main className="lounge-join-gate"><DoorOpen size={40} /><h1>{solo ? '둘이서 이야기하기 전에' : '들어가기 전에'} 불릴 이름이 필요해요.</h1><p>게스트로 바로 들어가거나, 로그인하면 캐릭터와의 관계가 계정에 이어져요.</p>
    <button className="lounge-primary" type="button" onClick={() => { void onGuestRequest().catch(err => setError(errorText(err))); }}>게스트로 들어가기 <ArrowRight size={17} /></button>
    <button className="lounge-preview-button" type="button" onClick={onLoginRequest}>로그인해서 들어가기</button>
    {error && <p className="lounge-error" role="alert">{error}</p>}</main>;
  if (error) return <main className="lounge-join-gate"><Coffee size={40} /><h1>{solo ? '둘만의 자리를 열지 못했어요' : '자리에 앉지 못했어요'}</h1><p className="lounge-error" role="alert">{error}</p>
    <Link className="lounge-primary" to={`/lounge/spaces/${spaceId}`} replace>장소로 돌아가 다시 고르기 <ArrowRight size={17} /></Link></main>;
  return <main className="lounge-join-gate"><LoaderCircle size={36} className="lounge-spin" /><h1>{solo ? '둘만의 자리를 준비하는 중이에요…' : entry === 'open' ? '대화방을 여는 중이에요…' : '자리로 안내하는 중이에요…'}</h1></main>;
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
