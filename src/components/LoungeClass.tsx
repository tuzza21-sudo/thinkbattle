import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, Info, Maximize2, Feather, Landmark, LoaderCircle, MapPin, Newspaper, Palette, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { requestLoungeClassPick, requestLoungeClassSpot, startLoungeScenario } from '../lib/loungeApi';
import { getLoungeCharacter } from '../lib/loungeCharacters';
import { isLoungeTravelCompanion, loungeClasses, loungeClassTrip, loungeTravelTrips, loungeClassScene, loungeClassSpots, loungeClassExercises, loungeClassItem, loungeClassOf, loungeClassSites, loungeClassWorks, readLoungeClassState, type LoungeClassKind, type LoungeClassState } from '../lib/loungeClass';
import type { LoungeArtWork, LoungeClassImage, LoungeTravelSite, LoungeTravelSpot, LoungeTravelTripId, LoungeWritingExercise } from '../lib/loungeClassContent';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
const plain = (text: string) => text.replace(/\s+/g, ' ').trim();
const titleOf = (kind: LoungeClassKind, id?: string) => { const item = loungeClassItem(kind, id); return item ? ('name' in item ? item.name : item.title) : ''; };
const boardName = (kind: LoungeClassKind, trip: LoungeTravelTripId = 'italy') => kind === 'travel' ? loungeTravelTrips[trip].board : kind === 'art' ? '작품 갤러리' : '글쓰기 과제';

function Credit({ image }: { image: LoungeClassImage }) {
  return <small className="lounge-class-credit">사진 {image.credit} · <a href={image.source} target="_blank" rel="noopener noreferrer">{image.license} · Wikimedia Commons</a></small>;
}

/**
 * 클래스's place above the composer (2026-11-26, by the owner): what the class is on now, and the board to pick an
 * assignment, a site or a work. Picking one tells the server, then sends the member's line that starts it.
 */
export function LoungeClassBar({ kind, trip = 'italy', roomId, storyState, send, disabled }: { kind: LoungeClassKind; trip?: LoungeTravelTripId; roomId: string; storyState?: unknown; send?: (text: string) => Promise<void>; disabled?: boolean }) {
  const [override, setOverride] = useState<LoungeClassState | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOverride(null); }, [storyState]);
  const state = override ?? readLoungeClassState(storyState, kind);
  const item = loungeClassItem(kind, state.item);
  // A town just picked opens its guide (2026-11-28, by the owner: picking first shows the place with its photos to choose from).
  const [intro, setIntro] = useState(false);
  const picked = async (next: LoungeClassState) => {
    setOverride(next); setOpen(false);
    if (kind === 'travel') setIntro(true);
    const title = titleOf(kind, next.item);
    await send?.(kind === 'travel' ? `${title}에 가 보고 싶어요.` : kind === 'art' ? `${title} 작품을 같이 보고 싶어요.` : `'${title}' 과제로 써 볼게요.`);
  };
  const Icon = kind === 'travel' ? MapPin : kind === 'art' ? Palette : kind === 'logical' ? Newspaper : Feather;
  const image = item && 'image' in item ? item.image : undefined;
  // What the member sees now: the viewing point they went to, the site, or the work (it is also the room's background).
  const spots = kind === 'travel' ? loungeClassSpots(state.item) : [];
  const spot = spots.find(entry => entry.id === state.spot);
  const scene = loungeClassScene(kind, state);
  const sceneName = spot?.name ?? titleOf(kind, state.item);
  const [large, setLarge] = useState<LoungeClassImage | null>(null);
  const [busySpot, setBusySpot] = useState<string | null>(null);
  const setStateOverride = (next: LoungeClassState) => setOverride(next);
  const visit = async (id: string, name: string) => {
    setBusySpot(id);
    try { const { state: next } = await requestLoungeClassSpot(roomId, id); setOverride(readLoungeClassState(next, kind)); setIntro(false); await send?.(`${name} 보러 가요.`); }
    catch { /* the strip stays as it was */ }
    finally { setBusySpot(null); }
  };
  return <div className="lounge-lesson-bar lounge-class-bar">
    <div className="lounge-lesson-head">
      <Icon size={16} />
      <span className="lounge-lesson-progress"><b>{item ? titleOf(kind, state.item) : loungeClassLabel(kind, trip)}</b></span>
      {kind === 'travel' && item && <button type="button" className="lounge-lesson-button" onClick={() => setIntro(true)}><Info size={15} /> {loungeTravelTrips[trip].stop} 안내</button>}
      <button type="button" className="lounge-lesson-button" onClick={() => setOpen(true)}><BookOpen size={15} /> {boardName(kind, trip)}</button>
    </div>
    {item && 'task' in item && <section className="lounge-lesson-task lounge-class-now" aria-label="지금 수업">
      <div><p className="lounge-lesson-scene"><span>과제</span>{item.task}</p><p className="lounge-lesson-meaning"><span>분량</span>{item.length} · {item.focus.join(' · ')}</p></div>
    </section>}
    {item && !('task' in item) && scene && <section className="lounge-lesson-task lounge-class-view" aria-label="지금 보는 곳">
      {/* No large picture over the chat (2026-11-27, by the owner): a small one beside the line, and 크게 보기 next to it. */}
      <div className="lounge-class-view-line">
        {spots.length === 0 && <button type="button" className="lounge-class-view-thumb" onClick={() => setLarge(scene)} aria-label={`${sceneName} 크게 보기`}><img src={scene.src} alt="" /></button>}
        <p className="lounge-lesson-scene"><span>{spot ? '지금 보는 것' : 'city' in item ? item.city : item.year}</span>{spot ? `${spot.name} · ${spot.note}` : 'city' in item ? item.summary : `${item.artist} · ${item.movement}`}</p>
        <button type="button" className="lounge-class-view-zoom" onClick={() => setLarge(scene)}><Maximize2 size={14} /> 크게 보기</button>
      </div>
      {spots.length > 0 && <div className="lounge-class-spots" role="group" aria-label="꼭 봐야 할 곳">
        <button type="button" className={!spot ? 'active' : ''} disabled={busySpot !== null || disabled} onClick={() => setStateOverride({ ...state, spot: undefined })}>
          {image && <img src={image.src} alt="" loading="lazy" />}<small>{titleOf(kind, state.item).split(' (')[0]}</small></button>
        {spots.map(entry => <button key={entry.id} type="button" className={spot?.id === entry.id ? 'active' : ''} disabled={busySpot !== null || disabled} onClick={() => void visit(entry.id, entry.name)}>
          {busySpot === entry.id ? <span className="lounge-class-spot-busy"><LoaderCircle size={16} className="lounge-spin" /></span> : <img src={entry.image.src} alt="" loading="lazy" />}<small>{entry.name}</small>
        </button>)}
      </div>}
    </section>}
    {large && <div className="lounge-class-lightbox" role="dialog" aria-modal="true" aria-label={sceneName} onClick={() => setLarge(null)}>
      <img src={large.src} alt={sceneName} />
      <p><b>{sceneName}</b> · <a href={large.source} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>{large.credit} · {large.license} · Wikimedia Commons</a></p>
      <button type="button" aria-label="닫기" onClick={() => setLarge(null)}><X size={20} /></button>
    </div>}
    {!item && <section className="lounge-lesson-task quiet"><p>{kind === 'travel' ? loungeTravelTrips[trip].empty : kind === 'art' ? '작품 갤러리에서 보고 싶은 작품을 골라요. 선우령이 먼저 무엇이 보이는지 묻고 해설해요.' : '글쓰기 과제를 골라 써 보세요. 쓴 글에는 첨삭 카드가 붙어요.'}</p></section>}
    {open && <LoungeClassBoard kind={kind} trip={trip} roomId={roomId} state={state} onPicked={next => void picked(next)} onClose={() => setOpen(false)} disabled={disabled} />}
    {intro && item && 'city' in item && <TownIntro site={item} trip={trip} spots={spots} current={spot?.id} busy={busySpot !== null} disabled={disabled} onVisit={(id, name) => void visit(id, name)} onClose={() => setIntro(false)} />}
  </div>;
}
const travelLabels: Record<LoungeTravelTripId, string> = { italy: '이탈리아 문화기행', parks: '세계 국립공원 탐험', japan: '일본 소도시 기행' };
export const loungeClassLabel = (kind: LoungeClassKind, trip?: LoungeTravelTripId) => kind === 'travel' && trip ? travelLabels[trip] : Object.values(loungeClasses).find(entry => entry.kind === kind)?.label ?? '클래스';

/** The board: the assignments, the sites of Florence and Venice, or the works; each opens on its own page with the start button. */
function LoungeClassBoard({ kind, trip = 'italy', roomId, state, onPicked, onClose, disabled }: { kind: LoungeClassKind; trip?: LoungeTravelTripId; roomId: string; state: LoungeClassState; onPicked: (state: LoungeClassState) => void; onClose: () => void; disabled?: boolean }) {
  const titleId = useId();
  const travel = loungeTravelTrips[trip];
  const [city, setCity] = useState<string>(travel.tabs[0].name);
  const [view, setView] = useState<string | null>(null);
  const [tab, setTab] = useState<'list' | 'notes'>('list');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (id: string) => {
    setBusy(true); setError('');
    try { const { state: next } = await requestLoungeClassPick(roomId, id); onPicked(readLoungeClassState(next, kind)); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  };
  const seen = new Set(state.done);
  const start = (id: string, label: string) => <button type="button" className="lounge-class-start" disabled={busy || disabled} onClick={() => void pick(id)}>{busy ? <LoaderCircle size={15} className="lounge-spin" /> : <ArrowRight size={15} />} {label}</button>;
  const site = kind === 'travel' && view ? loungeClassSites.find(item => item.id === view) : undefined;
  const work = kind === 'art' && view ? loungeClassWorks.find(item => item.id === view) : undefined;
  const exercise = (kind === 'emotional' || kind === 'logical') && view ? loungeClassExercises(kind).find(item => item.id === view) : undefined;
  return <>
    <div className="lounge-background-backdrop" onClick={() => { if (!busy) onClose(); }} />
    <section className="lounge-background-sheet lounge-memory-sheet lounge-lesson-sheet lounge-class-board" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header>{view ? <button type="button" onClick={() => setView(null)} aria-label="목록으로"><ArrowLeft size={18} /></button> : null}<b id={titleId}>{boardName(kind, trip)}</b><button type="button" onClick={onClose} disabled={busy} aria-label="닫기"><X size={18} /></button></header>
      {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
      {site ? <SiteDetail site={site} start={start(site.id, travel.start)} />
        : work ? <WorkDetail work={work} start={start(work.id, '이 작품 함께 보기')} />
        : exercise ? <ExerciseDetail exercise={exercise} start={start(exercise.id, '이 과제로 쓰기')} />
        : kind === 'travel' ? <div className="lounge-memory-panel">
          <div className="lounge-memory-tabs lounge-class-tabs" role="tablist">{travel.tabs.map(({ name }) => <button key={name} type="button" role="tab" aria-selected={city === name} className={city === name ? 'active' : ''} onClick={() => setCity(name)}>{name}</button>)}</div>
          <p className="lounge-memory-note">{travel.tabs.find(tab => tab.name === city)?.note} {travel.stop}를 눌러 배경과 역사, 꼭 볼 것을 보고 탐험을 시작해요.</p>
          <ul className="lounge-class-grid">{loungeClassSites.filter(item => (item.trip ?? 'italy') === trip && item.city === city).map(item => <li key={item.id}><button type="button" onClick={() => setView(item.id)}>
            {item.image ? <img src={item.image.src} alt="" loading="lazy" /> : <span className="lounge-class-noimage"><Landmark size={22} /></span>}
            <span><b>{item.name}</b><small>{item.era}</small>{seen.has(item.id) && <em>{travel.visited}</em>}</span>
          </button></li>)}</ul>
        </div>
        : kind === 'art' ? <div className="lounge-memory-panel">
          <p className="lounge-memory-note">인상주의에서 팝아트, 한국 추상까지 근현대 대표 작가의 작품이에요. 작품을 눌러 배경과 보는 법을 보고, 선우령과 함께 감상을 시작해요. 저작권이 남아 있는 작품은 이미지 대신 미술관 페이지로 연결해요.</p>
          <ul className="lounge-class-grid">{loungeClassWorks.map(item => <li key={item.id}><button type="button" onClick={() => setView(item.id)}>
            {item.image ? <img src={item.image.src} alt="" loading="lazy" /> : <span className="lounge-class-noimage"><Palette size={22} /><small>이미지는 미술관에서</small></span>}
            <span><b>{item.title}</b><small>{item.artist} · {item.year} · {item.movement}</small>{seen.has(item.id) && <em>봤어요</em>}</span>
          </button></li>)}</ul>
        </div>
        : <div className="lounge-memory-panel">
          <div className="lounge-memory-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>과제</button>
            <button type="button" role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>첨삭 기록 {state.critiques.length || ''}</button>
          </div>
          {tab === 'list' ? <ul className="lounge-memory-list lounge-class-exercises">{loungeClassExercises(kind).map(item => <li key={item.id}><button type="button" onClick={() => setView(item.id)}>
            <b>{item.title}</b><small>{item.goal}</small><small className="lounge-lesson-where">{item.length} · {item.focus.join(' · ')}</small>{seen.has(item.id) && <em>써 봤어요</em>}
          </button></li>)}</ul>
            : state.critiques.length ? <ul className="lounge-memory-list">{[...state.critiques].reverse().map(critique => <li key={critique.at}><div><LoungeClassCritiqueBody critique={critique} kind={kind} /></div></li>)}</ul>
              : <p className="lounge-memory-empty">아직 첨삭받은 글이 없어요. 과제를 골라 써 보세요.</p>}
        </div>}
    </section>
  </>;
}

const heritageTitle = (site: LoungeTravelSite) => site.trip === 'parks' ? '이 땅을 지키는 이유' : site.trip === 'japan' ? '이 마을이 지켜 온 것' : '문화유산으로서의 가치';

/**
 * The guide of a place just picked (2026-11-28, by the owner): the place with its photos, background, what it keeps, what is
 * eaten there and who lives there, and its viewing points as photos to go to. It opens on the pick and from the bar's 안내 button.
 */
function TownIntro({ site, trip, spots, current, busy, disabled, onVisit, onClose }: { site: LoungeTravelSite; trip: LoungeTravelTripId; spots: Array<LoungeTravelSpot & { image: LoungeClassImage }>; current?: string; busy: boolean; disabled?: boolean; onVisit: (id: string, name: string) => void; onClose: () => void }) {
  const titleId = useId();
  const stop = loungeTravelTrips[trip].stop;
  return <>
    <div className="lounge-background-backdrop" onClick={onClose} />
    <section className="lounge-background-sheet lounge-memory-sheet lounge-lesson-sheet lounge-class-board lounge-class-intro" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><b id={titleId}>{stop} 안내 · {site.name}</b><button type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button></header>
      <div className="lounge-memory-panel lounge-class-detail">
        {site.image && <figure><img src={site.image.src} alt={site.name} /><figcaption><Credit image={site.image} /></figcaption></figure>}
        <h3>{site.name}</h3><p className="lounge-class-local">{site.local} · {site.era}</p>
        <p className="lounge-class-lead">{site.summary}</p>
        <h4>배경과 역사</h4><p>{site.history}</p>
        <h4>{heritageTitle(site)}</h4><p>{site.heritage}</p>
        {site.food?.length ? <><h4>여기서 먹는 것</h4><ul>{site.food.map(food => <li key={food}>{food}</li>)}</ul></> : null}
        {site.life && <><h4>여기 사는 사람들</h4><p>{site.life}</p></>}
        {spots.length > 0 && <><h4>꼭 봐야 할 곳 <small>사진을 누르면 그 앞으로 가요</small></h4>
          <ul className="lounge-class-grid">{spots.map(entry => <li key={entry.id}><button type="button" disabled={busy || disabled} onClick={() => onVisit(entry.id, entry.name)}>
            <img src={entry.image.src} alt="" loading="lazy" />
            <span><b>{entry.name}</b><small>{entry.note}</small>{current === entry.id && <em>지금 여기</em>}</span>
          </button></li>)}</ul></>}
        <p className="lounge-class-tip">{site.tip}</p>
        <button type="button" className="lounge-class-start" onClick={onClose}><ArrowRight size={15} /> 걸으며 이야기 듣기</button>
      </div>
    </section>
  </>;
}

function SiteDetail({ site, start }: { site: LoungeTravelSite; start: React.ReactNode }) {
  const spots = loungeClassSpots(site.id);
  return <div className="lounge-memory-panel lounge-class-detail">
    {site.image && <figure><img src={site.image.src} alt={site.name} /><figcaption><Credit image={site.image} /></figcaption></figure>}
    {spots.length > 0 && <div className="lounge-class-spots static" aria-label="꼭 봐야 할 곳 미리 보기">{spots.map(entry => <figure key={entry.id}><img src={entry.image.src} alt={entry.name} loading="lazy" /><small>{entry.name}</small></figure>)}</div>}
    <h3>{site.name}</h3><p className="lounge-class-local">{site.local} · {site.era}</p>
    <p className="lounge-class-lead">{site.summary}</p>
    <h4>배경과 역사</h4><p>{site.history}</p>
    <h4>{heritageTitle(site)}</h4><p>{site.heritage}</p>
    <h4>꼭 봐야 할 것</h4><ul>{site.mustSee.map(item => <li key={item}>{item}</li>)}</ul>
    <h4>해 볼 만한 체험</h4><ul>{site.experience.map(item => <li key={item}>{item}</li>)}</ul>
    {site.food?.length ? <><h4>여기서 먹는 것</h4><ul>{site.food.map(item => <li key={item}>{item}</li>)}</ul></> : null}
    {site.life && <><h4>여기 사는 사람들</h4><p>{site.life}</p></>}
    <p className="lounge-class-tip">{site.tip}</p>
    {start}
  </div>;
}

function WorkDetail({ work, start }: { work: LoungeArtWork; start: React.ReactNode }) {
  return <div className="lounge-memory-panel lounge-class-detail">
    {work.image ? <figure><img src={work.image.src} alt={`${work.artist}, ${work.title}`} /><figcaption><small className="lounge-class-credit">{work.artist}, {work.local}, {work.year} · <a href={work.image.source} target="_blank" rel="noopener noreferrer">{work.image.license} · Wikimedia Commons</a></small></figcaption></figure>
      : work.museum && <a className="lounge-class-museum" href={work.museum} target="_blank" rel="noopener noreferrer"><Palette size={18} /> 저작권이 남아 있는 작품이라 이미지는 미술관 공식 페이지에서 볼 수 있어요 <ExternalLink size={14} /></a>}
    <h3>{work.title}</h3><p className="lounge-class-local">{work.artist} ({work.artistLife}) · {work.year} · {work.movement}<br />{work.place}</p>
    <h4>시대와 배경</h4><p>{work.context}</p>
    <h4>이렇게 보세요</h4><ul>{work.look.map(item => <li key={item}>{item}</li>)}</ul>
    <h4>작품의 의미</h4><p>{work.meaning}</p>
    <p className="lounge-class-tip">생각해 볼 질문: {work.question}</p>
    {start}
  </div>;
}

function ExerciseDetail({ exercise, start }: { exercise: LoungeWritingExercise; start: React.ReactNode }) {
  return <div className="lounge-memory-panel lounge-class-detail">
    <h3>{exercise.title}</h3><p className="lounge-class-lead">{exercise.goal}</p>
    <h4>과제</h4><p>{exercise.task}</p>
    <h4>분량</h4><p>{exercise.length}</p>
    <h4>첨삭에서 보는 것</h4><ul>{exercise.focus.map(item => <li key={item}>{item}</li>)}</ul>
    {start}
  </div>;
}

function LoungeClassCritiqueBody({ critique, kind }: { critique: LoungeClassState['critiques'][number]; kind: LoungeClassKind }) {
  return <>
    <span className="lounge-memory-kind">{titleOf(kind, critique.exercise) || '자유 글쓰기'}</span>
    <div className="lounge-class-scores">{Object.entries(critique.scores).map(([name, value]) => <span key={name}><small>{name}</small><i><b style={{ width: `${value * 20}%` }} /></i></span>)}</div>
    {critique.strengths.map(item => <p key={item} className="lounge-class-good">잘된 점 · {item}</p>)}
    {critique.edits.length > 0 && <ul className="lounge-lesson-errors">{critique.edits.map((edit, index) => <li key={index}><s>{edit.before}</s> → <b>{edit.after}</b><small>{edit.why}</small></li>)}</ul>}
    {critique.rewrite && <p className="lounge-class-rewrite"><span>다시 써 본 예</span>{critique.rewrite}</p>}
    {critique.next && <p className="lounge-class-next">다음 고쳐 쓰기 · {critique.next}</p>}
  </>;
}

/** The critique card under the member's own writing (the class state keeps the last twelve with their words). */
export function LoungeClassCritique({ text, kind, storyState }: { text: string; kind: LoungeClassKind; storyState?: unknown }) {
  const critiques = useMemo(() => readLoungeClassState(storyState, kind).critiques, [storyState, kind]);
  const said = plain(text).slice(0, 300);
  const critique = critiques.find(item => item.said === said || (said.length > 40 && (item.said.startsWith(said.slice(0, 120)) || said.startsWith(item.said.slice(0, 120)))));
  if (!critique) return null;
  return <div className="lounge-lesson-feedback lounge-class-critique" role="note" aria-label="첨삭"><LoungeClassCritiqueBody critique={critique} kind={kind} /></div>;
}

/** The class's way in, on the story character's page: apart from the stories, a class with the same person. */
export function LoungeClassStart({ characterId, user }: { characterId: string; user: AppUser | null }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = loungeClassOf(characterId);
  const name = getLoungeCharacter(characterId)?.name ?? '';
  // A travel companion has no class of its own (2026-11-28): its trip is in its story, started just above.
  if (!id && isLoungeTravelCompanion(characterId)) {
    const trip = loungeTravelTrips[loungeClassTrip(characterId)];
    return <div className="lounge-lesson-start">
      <div className="lounge-lesson-start-head"><MapPin size={18} /><b>{name}와 함께하는 {loungeClassLabel('travel', loungeClassTrip(characterId))}</b><span>이야기 안에서</span></div>
      <ul>{trip.points.map(point => <li key={point}>{point}</li>)}</ul>
      <small>위의 이야기로 시작하면 대화 중에 입력창 위 '{trip.board}'에서 {trip.stop}을 골라 함께 걸어요. 따로 여는 수업이 아니라, 대화와 관계가 그대로 이어지는 여행이에요.</small>
    </div>;
  }
  if (!id) return null;
  const entry = loungeClasses[id];
  const start = async () => {
    if (!user || busy) return;
    setBusy(true); setError('');
    try { navigate(`/lounge/${await startLoungeScenario(entry.scenario, user.nickname)}`); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  };
  const Icon = entry.kind === 'travel' ? MapPin : entry.kind === 'art' ? Palette : entry.kind === 'logical' ? Newspaper : Feather;
  const points = entry.kind === 'travel' ? loungeTravelTrips[loungeClassTrip(id)].points
    : entry.kind === 'art' ? ['인상주의부터 팝아트, 한국 추상까지 근현대 대표 작가의 작품을 골라요.', '작품마다 시대와 배경, 보는 법, 의미를 보여 줘요.', '선우령이 먼저 무엇이 보이는지 묻고, 함께 해석해요.']
    : entry.kind === 'logical' ? ['주장 한 문장, 근거 세 개, 반론 먼저, 칼럼 첫 문단 같은 과제를 골라 써요.', '쓴 글에는 주장·근거·반론·구조를 매긴 첨삭 카드가 붙어요.', '기자의 눈으로 고칠 곳과 다시 쓴 예를 받아요.']
    : ['오감 묘사, 이름 없는 감정, 보내지 않을 편지 같은 과제를 골라 써요.', '쓴 글에는 감각·절제·리듬·여운을 매긴 첨삭 카드가 붙어요.', '편집자의 눈으로 살아 있는 문장과 덜어 낼 곳을 짚어 줘요.'];
  return <div className="lounge-lesson-start">
    <div className="lounge-lesson-start-head"><Icon size={18} /><b>{name}의 {entry.label} 클래스</b><span>무료 체험</span></div>
    <ul>{points.map(point => <li key={point}>{point}</li>)}</ul>
    {user ? <button type="button" className="lounge-character-cta" disabled={busy} onClick={() => void start()}>{busy ? <LoaderCircle size={17} className="lounge-spin" /> : <Icon size={17} />}클래스 시작하기</button>
      : <Link to="/" className="lounge-character-cta"><Icon size={17} />로그인하고 시작하기</Link>}
    <small>클래스는 이야기와 따로 진행돼요. 수업에서는 연애 이야기 없이 배움에만 집중해요.</small>
    {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
  </div>;
}
