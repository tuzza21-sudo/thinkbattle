import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Coffee, Copy, Hand, Headphones, LoaderCircle, LogOut, MessageCircle, Mic, MicOff, Pause, Play, RefreshCw, Sparkles, UserRound, Users, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { AppUser } from '../types';
import { getLoungeHost, getLoungeHostLoudness, getLoungeTheme, getLoungeTopic, isLoungeRelationshipHost, loungeHelpOptions, loungeIsSolo, loungePresentMembers, loungeRoomTheme, loungeTopics, loungeMinimumParticipants, loungeHostCooldownMs, loungeSoloTiming, nextLoungeHostReason, previewHostReply, type LoungeHelpKind, type LoungeTopicBrief, type LoungeHostId, type LoungeThemeId, type LoungeMember, type LoungeMessage, type LoungeRoom, type LoungeTopicStudy } from '../lib/lounge';
import { LoungeApiError, claimLoungeBroadcaster, controlLounge, controlLoungeSession, joinLounge, loadLounge, loadLoungeRelationship, prepareLoungeTopic, requestLoungeHost, requestLoungeModerator, setLoungeTopic, suggestLoungeTopics, transcribeLoungeAudio, reviewLoungeInteraction, syncLoungeSafety, releaseLoungeRestriction } from '../lib/loungeApi';
import { restrictedLoungeMembers } from '../lib/loungeInteraction';
import { isLoungeFreeStage, loungeSessionHostReason, newerLoungeSession, shouldAutoFinishLoungeTurn, type LoungeHostReason, type LoungeSession, type LoungeSessionAction } from '../lib/loungeSession';
import { LoungeSessionPanel } from './LoungeSessionPanel';
import { LoungeRelationship } from './LoungeRelationship';
import type { RelationshipView } from '../lib/relationship/types';
import { LoungeHome, LoungeSpaceEntry, LoungeSpacePage, LoungeWaitWatcher } from './LoungeSpaces';
import { LoungeTopicPicker, type LoungeTopicPickerProps } from './LoungeTopicPicker';
import { LoungeHostPortrait } from './LoungeHostPortrait';
import { ProfileModal } from './ProfileModal';
import { LoungeIntroduction } from './LoungeIntroduction';
import { LoungeCharacterPage } from './LoungeCharacterPage';
import { useLoungeAudio } from '../lib/useLoungeAudio';
import './LoungePage.css';
import './LoungeRoom.css';

type Props = { user: AppUser | null; onGuestRequest: () => Promise<void>; onLoginRequest: () => void; onSignupRequest?: () => void; onUserUpdate?: (user: AppUser) => void; onLogout?: () => Promise<void> };
const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
function LoungeHeader({ user, inRoom, introduction, onLoginRequest, onSignupRequest, onProfileRequest, onLogout, loggingOut }: Props & { inRoom: boolean; introduction: boolean; onProfileRequest: () => void; loggingOut: boolean }) {
  return <header className="lounge-header">
    {inRoom && <Link to="/lounge" className="lounge-back"><ArrowLeft size={17} /> 상상의 집</Link>}
    <Link to="/lounge" className="lounge-brand"><Coffee size={23} /><strong>상상의 집<span>HOUSE OF IMAGINATION</span></strong></Link>
    <div className="lounge-header-end">{!inRoom && <Link to="/lounge/about" className="lounge-about-link" aria-current={introduction ? 'page' : undefined}><Sparkles size={14} />서비스 소개</Link>}<span className="lounge-beta">EARLY ACCESS</span>{!inRoom && <nav className="lounge-account" aria-label="내 계정">
      {user && !user.isAnonymous ? <>
        <button type="button" className="lounge-profile-button" onClick={onProfileRequest} aria-label={`${user.nickname}님 프로필 수정`}><span className="lounge-account-avatar">{user.loungeAvatarUrl ? <img src={user.loungeAvatarUrl} alt="" /> : <UserRound size={18} />}</span><span className="lounge-account-name"><strong>{user.nickname}</strong><small>프로필 수정</small></span></button>
        {onLogout && <button type="button" className="lounge-account-logout" disabled={loggingOut} onClick={() => void onLogout()} aria-label="로그아웃" title="로그아웃"><LogOut size={17} /></button>}
      </> : <>
        {user?.isAnonymous && <span className="lounge-guest-label">게스트로 참여 중</span>}
        <button type="button" onClick={onLoginRequest}>로그인</button><button type="button" className="lounge-account-signup" onClick={onSignupRequest ?? onLoginRequest}>회원가입</button>
      </>}
    </nav>}</div>
  </header>;
}
export function LoungePage(props: Props) {
  const { roomId, characterId, spaceId, entry } = useParams();
  const location = useLocation();
  const introduction = roomId === 'about';
  const inRoom = Boolean(roomId && !introduction);
  const [showProfile, setShowProfile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountError, setAccountError] = useState('');
  const logout = async () => {
    if (!props.onLogout || loggingOut) return;
    setLoggingOut(true); setAccountError('');
    try { await props.onLogout(); setShowProfile(false); } catch (error) { setAccountError(errorText(error)); } finally { setLoggingOut(false); }
  };
  return <><div className={`lounge-page ${inRoom ? 'has-room' : introduction ? 'has-introduction' : ''}`}><LoungeHeader {...props} inRoom={inRoom} introduction={introduction} onProfileRequest={() => setShowProfile(true)} onLogout={props.onLogout ? logout : undefined} loggingOut={loggingOut} />{accountError && <p className="lounge-account-error" role="alert">{accountError}</p>}{characterId ? <LoungeCharacterPage key={characterId} id={characterId} /> : spaceId && entry ? <LoungeSpaceEntry key={location.key} spaceId={spaceId} entry={entry} user={props.user} onGuestRequest={props.onGuestRequest} onLoginRequest={props.onLoginRequest} /> : spaceId ? <LoungeSpacePage key={spaceId} spaceId={spaceId} user={props.user} onGuestRequest={props.onGuestRequest} /> : introduction ? <LoungeIntroduction /> : roomId === 'preview' ? <LoungePreview /> : roomId ? <LoungeRoomPage key={roomId} roomId={roomId} {...props} /> : <LoungeHome user={props.user} onGuestRequest={props.onGuestRequest} />}</div><LoungeWaitWatcher user={props.user} />{showProfile && !inRoom && props.user && !props.user.isAnonymous && props.onUserUpdate && <ProfileModal key={props.user.id} user={props.user} onClose={() => setShowProfile(false)} onProfileUpdated={props.onUserUpdate} serviceName="상상의 집" />}</>;
}

type RoomViewProps = { place?: string; topicPicker?: LoungeTopicPickerProps; relationship?: RelationshipView | null; topicBrief?: LoungeTopicBrief | null; now?: number; onReleaseRestriction?: (userId: string) => Promise<void>; guidedSession?: boolean; session?: LoungeSession | null; sessionNames?: Record<string, string>; onSessionAction?: (action: LoungeSessionAction) => Promise<void>; study?: LoungeTopicStudy | null; theme?: LoungeThemeId; liveHostText?: string; hostId: LoungeHostId; topic: string; capacity: number; messages: LoungeMessage[]; members: Array<{ id: string; name: string; muted: boolean; warnings?: number; restrictedUntil?: string | null; avatarIndex?: number; avatarUrl?: string }>; speakers: string[]; aiSpeaking: boolean; pending: boolean; status: string; remaining: string; preview?: boolean; micOn: boolean; connected: boolean; connecting?: boolean; audioReady?: boolean; starting?: boolean; isHost: boolean; error: string; onConnect: () => void; onMic: () => void; onAsk: (kind: Exclude<LoungeHelpKind, 'direct'>) => void; helpRequested?: boolean; onStart: () => void; onLeave: () => void; inviteUrl?: string; currentUserId?: string; demoPlaying?: boolean; onDemoToggle?: () => void };

function LoungeTopicDescription({ brief }: { brief: LoungeTopicBrief }) {
  const category = getLoungeTopic(brief.category);
  return <details className="lounge-study-notes lounge-topic-description"><summary><MessageCircle size={14} />방장이 소개하는 오늘의 대화</summary><div>
    <strong>{category?.title}{brief.category === 'media' && ` · ${brief.subcategory === 'film' ? '영화' : brief.subcategory === 'book' ? '책' : '방송'}`}</strong>
    {brief.category === 'media' && <p>감상 후 대화 · 결말과 반전 포함</p>}
    {brief.work_title && <p>{brief.work_title}{brief.creator && ` · ${brief.subcategory === 'book' ? '저자' : '감독'} ${brief.creator}`}</p>}
    <h3>방을 만든 이유</h3><p>{brief.reason}</p><h3>함께 나누고 싶은 이야기</h3><p>{brief.discussion}</p>
  </div></details>;
}

function LoungeStudyNotes({ study }: { study: LoungeTopicStudy }) {
  const labels = { scene_fact: '확인한 장면', director_statement: '감독의 설명', critic_interpretation: '평론가의 해석', ai_inference: 'AI의 해석 가능성' };
  return <details className="lounge-study-notes"><summary><Sparkles size={14} />{study.confidence === 'verified' ? '사회자가 준비한 주제 자료' : '주제를 조금 더 확인하고 싶어요'}</summary><div>
    <strong>{study.title}</strong><p>{study.overview}</p>{study.confidence === 'uncertain' && <p>{study.clarification}</p>}
    {study.facts.length > 0 && <ul>{study.facts.map((fact, index) => <li key={index}>{fact}</li>)}</ul>}
    {study.film_research && <section className="lounge-film-cards" aria-label="장면에 근거한 영화 대화 카드"><p>{study.film_research.coverage === 'limited' ? '장면 분석 원문을 충분히 확보하지 못했어요. 직접 기억하는 장면과 준비된 주제 자료로 이야기해요.' : '원문 자료를 바탕으로 준비한 장면별 이야기예요. 결말과 반전도 함께 다뤄요.'}</p>
      {study.film_research.cards.map(card => <details key={card.id} className="lounge-film-card"><summary>{card.question}{card.spoiler === 'ending' && <span>결말 · 반전</span>}</summary><div>
        <h3>장면과 선택</h3><p>{card.scene}</p><p>{card.conflict}</p>
        <h3>자료에서 확인한 근거</h3>{card.evidence.map((item,index) => <div key={index}><b>{labels[item.kind]}</b><p>{item.text}</p>{item.source_urls.map(url => <a key={url} href={url} target="_blank" rel="noopener noreferrer">{study.film_research?.materials.find(material => material.url === url)?.title || '근거 자료'} ↗</a>)}</div>)}
        <h3>다르게 볼 수 있는 지점</h3>{card.interpretations.map((item,index) => <div key={index}><b>{labels[item.kind]}</b><p>{item.text}</p><p>{item.basis}</p>{item.source_urls.map(url => <a key={url} href={url} target="_blank" rel="noopener noreferrer">{study.film_research?.materials.find(material => material.url === url)?.title || '해석 자료'} ↗</a>)}</div>)}
      </div></details>)}
    </section>}
    {study.sources.length > 0 && <nav aria-label="주제 조사 출처">{study.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>)}</nav>}<small>자료를 바탕으로 대화해요. 해석에는 여러 관점이 있을 수 있어요.</small>
  </div></details>;
}

function LoungePortrait({ index, name, url }: { index?: number; name: string; url?: string }) {
  const valid = Number.isInteger(index) && index! >= 0 && index! < 6;
  const [failed, setFailed] = useState<string>();
  if (url && failed !== url) return <span className="lounge-portrait custom"><img src={url} alt={`${name}의 라운지 아바타`} onError={() => setFailed(url)} /></span>;
  return <span className={`lounge-portrait ${valid ? 'illustrated' : 'initials'}`} role="img" aria-label={valid ? `${name}의 캐리커처 아바타` : `${name}의 기본 프로필`}>{valid ? <img className="lounge-portrait-sprite" src="/lounge/avatar-portraits.png" alt="" style={{ left: `${-(index! % 3) * 100}%`, transform: index! < 3 ? 'none' : 'translateY(-50%)' }} /> : name.slice(0, 1)}</span>;
}
function VoiceWave({ active }: { active: boolean }) {
  return <span className={`lounge-voice-bars ${active ? 'active' : ''}`} aria-hidden="true">{[0, 1, 2, 3, 4].map(bar => <i key={bar} style={{ animationDelay: `${bar * .11}s` }} />)}</span>;
}
// Same breakpoint as the desktop room layout in LoungeRoom.css.
const desktopLayoutQuery = '(min-width: 761px) and (min-height: 501px)';
const desktopLayout = () => typeof window !== 'undefined' && window.matchMedia(desktopLayoutQuery).matches;
const subscribeDesktopLayout = (onChange: () => void) => {
  const query = window.matchMedia(desktopLayoutQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

function RoomView(props: RoomViewProps) {
  const host = getLoungeHost(props.hostId);
  const theme = getLoungeTheme(props.theme);
  const [sendError, setSendError] = useState('');
  const [copied, setCopied] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const journalId = useId();
  const helpMenuId = useId();
  const roomElement = useRef<HTMLElement>(null);
  const journalPanel = useRef<HTMLElement>(null);
  const journalToggle = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const ownSafety = props.members.find(member => member.id === props.currentUserId);
  const restricted = Date.parse(ownSafety?.restrictedUntil ?? '') > (props.now ?? 0);
  const latestHost = props.messages.filter(message => message.kind === 'host').at(-1);
  const participantMessages = props.messages.filter(message => message.kind === 'human').slice(-12);
  const conversationMessages = props.messages.filter(message => message.kind === 'host' || participantMessages.includes(message)).slice(-24);
  const participantLog = useRef<HTMLDivElement>(null);
  const participantSeats = useRef<HTMLDivElement>(null);
  const followParticipantLog = useRef(true);
  // On desktop the newest bubble is held near the top of the log, in every room and with every host. Phones keep it pinned to the bottom.
  const spotlightLatest = useSyncExternalStore(subscribeDesktopLayout, desktopLayout, () => false);
  const spotlightAnchor = useRef(0);
  const latestParticipantMessageId = participantMessages.at(-1)?.id;
  useLayoutEffect(() => {
    const element = participantLog.current;
    if (!element || !followParticipantLog.current) return;
    if (!spotlightLatest) { element.scrollTo({ top: element.scrollHeight, behavior: 'auto' }); return; }
    const newest = Array.from(element.querySelectorAll<HTMLElement>('.lounge-host-message, article')).at(-1);
    spotlightAnchor.current = newest ? Math.max(0, newest.offsetTop - element.clientHeight * 0.18) : 0;
    element.scrollTo({ top: spotlightAnchor.current, behavior: 'auto' });
  }, [latestParticipantMessageId, latestHost?.id, props.liveHostText, spotlightLatest]);
  useEffect(() => {
    const strip = participantSeats.current;
    const seat = strip?.querySelector<HTMLElement>('.has-floor');
    if (!strip || !seat) return;
    const viewport = strip.getBoundingClientRect(), profile = seat.getBoundingClientRect();
    if (profile.left < viewport.left || profile.right > viewport.right) {
      strip.scrollTo({ left: strip.scrollLeft + profile.left - viewport.left - (strip.clientWidth - profile.width) / 2, behavior: 'smooth' });
    }
  }, [props.session?.speaker_id, props.session?.state]);
  useEffect(() => {
    const viewport = window.visualViewport, shell = roomElement.current?.closest<HTMLElement>('.lounge-page');
    if (!viewport || !shell) return;
    const fitViewport = () => {
      if (viewport.scale !== 1) { shell.style.removeProperty('--lounge-viewport-height'); return; }
      shell.style.setProperty('--lounge-viewport-height', `${Math.min(window.innerHeight, viewport.height)}px`);
      shell.toggleAttribute('data-keyboard-open', viewport.height < window.innerHeight - 100);
    };
    fitViewport(); viewport.addEventListener('resize', fitViewport);
    return () => { viewport.removeEventListener('resize', fitViewport); shell.style.removeProperty('--lounge-viewport-height'); shell.removeAttribute('data-keyboard-open'); };
  }, []);
  useEffect(() => {
    if (!journalOpen) return;
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'auto' });
  }, [props.messages, journalOpen]);
  useEffect(() => {
    if (!journalOpen) return;
    journalPanel.current?.focus({ preventScroll: true });
  }, [journalOpen]);
  const ended = props.status === 'ended';
  const solo = props.capacity === 1;
  // A table in a space: no turn order, no owner. Everyone has the microphone and AI help.
  const space = Boolean(props.topicPicker);
  const hostRole = solo ? 'AI 대화 상대' : 'AI 도우미';
  const microphoneControl = <button type="button" className={`lounge-mic-button ${props.micOn ? 'on' : ''}`} onClick={props.onMic} aria-pressed={props.micOn} title={restricted ? '발언 제한이 해제되면 마이크를 켤 수 있어요' : props.preview ? '마이크는 실제 방에서 사용할 수 있어요' : undefined} disabled={restricted || props.preview || ended || !props.connected || !props.audioReady}>{props.micOn ? <Mic size={16} /> : <MicOff size={16} />}{props.micOn ? '마이크 끄기' : '마이크 켜기'}</button>;
  const needsConnection = !props.preview && !ended && (!props.connected || !props.audioReady || (solo && props.status === 'lobby'));
  const liveSpeakers = ended || props.status === 'lobby' ? [] : props.members.filter(member => props.speakers.includes(member.id));
  const hostSpeaking = props.aiSpeaking && !ended;
  const closeJournal = () => { setJournalOpen(false); journalToggle.current?.focus(); };
  const toggleJournal = (button: HTMLButtonElement) => {
    journalToggle.current = button;
    if (journalOpen) closeJournal();
    else setJournalOpen(true);
  };
  const sessionProps = props.session && props.currentUserId && props.onSessionAction ? {
    session: props.session, now: props.now, userId: props.currentUserId,
    names: props.sessionNames ?? Object.fromEntries(props.members.map(member => [member.id, member.name])),
    questions: props.study?.questions, topicBrief: props.topicBrief, isHost: props.isHost,
    blocked: props.pending || props.aiSpeaking || restricted, restricted, onAction: props.onSessionAction,
  } : null;
  const helpDisabled = props.pending || props.aiSpeaking || ended || restricted || (!props.preview && (props.status !== 'active' || !props.connected || !props.audioReady));
  const assistanceControl = props.status !== 'lobby' && (solo
    ? <button type="button" className="lounge-ask-button" onClick={() => props.onAsk('topic')} disabled={helpDisabled}><Sparkles size={17} />화제 하나 던져줘</button>
    : <div className="lounge-help" onKeyDown={event => { if (event.key === 'Escape' && helpOpen) { event.stopPropagation(); setHelpOpen(false); } }}>
      <button type="button" className={`lounge-ask-button ${props.helpRequested ? 'requested' : ''}`} aria-expanded={helpOpen} aria-controls={helpMenuId} onClick={() => setHelpOpen(value => !value)} disabled={helpDisabled && !helpOpen}><Sparkles size={17} />{props.helpRequested ? 'AI 도움 요청됨' : 'AI 도움'}</button>
      {helpOpen && <div className="lounge-help-menu" id={helpMenuId} role="group" aria-label="AI에게 부탁할 도움">
        {loungeHelpOptions.map(option => <button type="button" key={option.kind} disabled={helpDisabled} onClick={() => { setHelpOpen(false); props.onAsk(option.kind); }}><strong>{option.label}</strong><small>{option.description}</small></button>)}
        <p role="status">{props.helpRequested ? '요청했어요. 이야기가 잠깐 멈추면 짧게 도와드릴게요.' : 'AI는 사람들의 대화에 끼어들지 않아요. 필요할 때 불러 주세요.'}</p>
      </div>}
    </div>);
  return <main className="lounge-room-main" data-theme={theme.id} style={{ '--lounge-accent': theme.accent, '--lounge-surface': theme.surface, '--lounge-scene-image': `url('${theme.image}')` } as CSSProperties} ref={roomElement}>
    {restricted ? <p className="lounge-safety-notice" role="status">대화 보호를 위해 잠시 발언이 제한됐어요. 약 {Math.max(1, Math.ceil((Date.parse(ownSafety!.restrictedUntil!) - (props.now ?? 0)) / 1000))}초 뒤 다시 말할 수 있어요. 다른 분의 이야기는 계속 들을 수 있어요. 오판이라고 생각되면 방장에게 해제를 요청해 주세요.</p> : Boolean(ownSafety?.warnings) && <p className="lounge-safety-notice" role="status">{ownSafety?.warnings === 1 ? '인신공격 1차 경고: 2차 인신공격부터 발언권이 제한됩니다.' : '추가 인신공격이 감지되면 발언권이 다시 제한됩니다.'} 수위가 심한 발언은 경고 없이 즉시 제한됩니다. 서로 존중하며 이야기해 주세요.</p>}
    {props.preview && <div className="lounge-preview-notice"><Sparkles size={17} /><span>실제 참가자·AI 연결 없이 분위기를 둘러보는 화면이에요. 손들기와 대화 순서도 미리 살펴보세요.</span><Link to="/lounge">실제 방 만들기 <ArrowRight size={14} /></Link></div>}
    <div className="lounge-conversation-layout"><section className="lounge-stage" aria-label="풍경 위에서 함께하는 대화">
      <div className={`lounge-scene scene-${props.capacity}`}>
        <div className="lounge-scene-heading">
          <div className="lounge-room-topline"><div><span className={`lounge-room-status ${props.preview ? 'preview' : ''}`}><span />{props.preview ? '화면 미리보기' : ended ? '오늘의 대화 끝' : props.status === 'lobby' ? solo ? 'AI와 1:1 대화 준비' : '친구를 기다리는 중' : '우리 지금 이야기 중'}</span><h1>{props.place ?? theme.name}</h1></div><div className="lounge-room-top-actions"><span><Coffee size={16} /> {props.remaining}</span>
            {needsConnection && <button type="button" className="lounge-connect-button" onClick={props.onConnect} disabled={props.connecting || (props.connected && props.audioReady && props.starting)}>{props.connecting || props.starting ? <LoaderCircle size={14} className="lounge-spin" /> : <Headphones size={14} />}{props.connecting ? '연결 중…' : !props.connected ? '연결 재시도' : !props.audioReady ? '소리 켜기' : props.starting ? '준비 중…' : '대화 다시 시작'}</button>}
            {props.status === 'lobby' && props.isHost && !solo && <button type="button" className="lounge-start-button" onClick={props.onStart} disabled={props.starting || props.members.length < loungeMinimumParticipants(props.capacity) || !props.connected || !props.audioReady}>{props.starting ? <LoaderCircle size={14} className="lounge-spin" /> : <Play size={14} />}함께 시작하기</button>}
            <button type="button" ref={journalToggle} className="lounge-journal-toggle" aria-expanded={journalOpen} aria-controls={journalId} onClick={event => toggleJournal(event.currentTarget)}><MessageCircle size={16} /> 대화 기록</button>{props.inviteUrl && !solo && <button type="button" onClick={() => { void navigator.clipboard.writeText(props.inviteUrl!).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => setSendError('주소창의 링크를 복사해 친구에게 보내 주세요.')); }}><Copy size={16} />{copied ? '복사했어요!' : '친구 초대'}</button>}<button type="button" onClick={props.onLeave}><X size={18} /> 나가기</button></div></div>
          <div className="lounge-table-topic"><span>{props.topicPicker ? '지금 이야기' : '오늘의 이야기'}</span><h2>{props.topicPicker ? props.topicPicker.topic ?? '주제 없이 자유롭게' : props.topic}</h2></div>
        </div>
        <div className="lounge-conversation-space">
          <div className="lounge-host-column">
            <div className={`lounge-moderator ${hostSpeaking ? 'speaking' : ''}`}><span className="lounge-moderator-avatar"><LoungeHostPortrait hostId={props.hostId} /><b>AI</b></span><div className="lounge-moderator-info"><h2>{host.name}</h2><span className="lounge-moderator-caption">{hostSpeaking ? solo ? '대화 상대 · 이야기하는 중' : 'AI 도우미 · 이야기하는 중' : props.pending ? solo ? '대화 상대 · 생각하는 중…' : 'AI 도우미 · 생각하는 중…' : solo ? '대화 상대 · 편하게 이야기해요' : 'AI 도우미 · 필요할 때 불러 주세요'}</span>{props.relationship && <LoungeRelationship view={props.relationship} />}</div><VoiceWave active={hostSpeaking} /></div>

            
          </div>
          <div className="lounge-place-view" aria-hidden="true"><div className="lounge-scene-intro"><span>{theme.tag}</span><p>{theme.caption}</p><div className="lounge-stage-label"><Headphones size={15} /> 함께 머무는 대화석 <span>{solo ? 'AI와 1:1' : `${props.members.length} / ${props.capacity}명`}</span></div></div></div>
          <aside className="lounge-participant-panel" aria-label="함께하는 참가자">
            <div className="lounge-participant-roster">
            <div className="lounge-participant-heading"><Users size={15} /><span>함께하는 사람들</span><b>{props.members.length} / {props.capacity}</b></div>
            <div className={`lounge-seats seats-${props.capacity}`} ref={participantSeats}>{Array.from({ length: props.capacity }, (_, index) => {
          const member = props.members[index];
          const speaking = Boolean(member && liveSpeakers.some(speaker => speaker.id === member.id));
          const hasFloor = Boolean(member && !ended && props.session?.state !== 'finished' && !isLoungeFreeStage(props.session) && member.id === props.session?.speaker_id);
          const mine = member?.id === props.currentUserId;
          return <div key={member?.id ?? index} className={`lounge-seat ${member ? 'occupied' : 'empty'} ${speaking ? 'speaking' : ''} ${hasFloor ? 'has-floor' : ''} ${mine ? 'self' : ''}`}>
            <span className="lounge-seat-avatar">{member ? <LoungePortrait index={member.avatarIndex} url={member.avatarUrl} name={member.name} /> : <Users size={25} />}{member && <i>{member.muted ? <MicOff size={13} /> : <Mic size={13} />}</i>}</span>
            <strong>{member?.name ?? '빈 자리'}{mine && <b>나</b>}</strong>
            {hasFloor && <span className="lounge-seat-turn">{mine ? '지금 내 차례' : '지금 발언 차례'}</span>}
            <span className="lounge-seat-speaking"><VoiceWave active={speaking} />{Date.parse(member?.restrictedUntil ?? '') > (props.now ?? 0) ? '잠시 발언 제한 중' : speaking ? '지금 이야기 중' : member ? member.muted ? '듣고 있어요' : '함께하는 중' : '초대 링크로 함께해요'}</span>
            {member && props.isHost && Date.parse(member.restrictedUntil ?? '') > (props.now ?? 0) && props.onReleaseRestriction && <button type="button" className="lounge-release-restriction" onClick={() => { void props.onReleaseRestriction!(member.id).catch(err => setSendError(errorText(err))); }}>발언 제한 해제</button>}
          </div>;
        })}</div>
            {sessionProps && <LoungeSessionPanel {...sessionProps} mode="status" />}
            {props.preview && <button type="button" className="lounge-demo-toggle" onClick={props.onDemoToggle} aria-label={props.demoPlaying ? '발언 효과 미리보기 일시정지' : '발언 효과 미리보기 재생'}>{props.demoPlaying ? <Pause size={13} /> : <Play size={13} />} 발언 효과 예시</button>}
            </div>
            <section className="lounge-participant-speech" aria-label="참가자들의 발언">
              <h2><MessageCircle size={14} />나누는 이야기</h2>
              {props.topicPicker && <LoungeTopicPicker {...props.topicPicker} />}
              <div className={`lounge-participant-log ${spotlightLatest ? 'spotlight' : ''}`} ref={participantLog} role="log" aria-label="라운지 대화" onScroll={event => { const element = event.currentTarget; followParticipantLog.current = spotlightLatest ? element.scrollTop >= spotlightAnchor.current - 24 : element.scrollHeight - element.scrollTop - element.clientHeight < 48; }}>
                {(props.status === 'lobby' || !conversationMessages.length) && <div className="lounge-host-message"><strong>{host.name} <span>{hostRole}</span></strong><div className="lounge-host-bubble">{props.status === 'lobby' ? solo ? '오늘은 둘이 편하게 이야기해요. 음성과 마이크를 준비하고 있어요.' : '친구에게 초대 링크를 보내 주세요. 두 명 이상 음성으로 연결되면 가볍게 인사부터 나눠요.' : host.greeting}</div></div>}
                <div className="lounge-guidance">{props.topicBrief && <LoungeTopicDescription brief={props.topicBrief} />}{props.study && <LoungeStudyNotes study={props.study} />}
            {sessionProps && <LoungeSessionPanel {...sessionProps} mode="context" />}</div>
                {conversationMessages.map(message => message.kind === 'host' ? <div key={message.id} className="lounge-host-message"><strong>{host.name} <span>{hostRole}</span></strong><div className="lounge-host-bubble">{message.text}</div></div> : <article key={message.id} className={message.user_id === props.currentUserId ? 'self' : ''}><strong>{message.user_id === props.currentUserId ? '나' : message.nickname}</strong><p>{message.text}</p></article>)}
                {props.aiSpeaking && props.liveHostText && props.liveHostText !== latestHost?.text && <div className="lounge-host-message"><strong>{host.name} <span>{hostRole}</span></strong><div className="lounge-host-bubble">{props.liveHostText}</div></div>}
                {ended && <p className="lounge-participant-empty">함께 이야기해 줘서 고마워요. 오늘 남은 시간도 편안하길 바라요.</p>}
                {!participantMessages.length && !ended && <p className="lounge-participant-empty">이야기한 내용이 여기에 남아요.</p>}
              </div>
            </section>
        <div className="lounge-participant-controls">
          <div className="lounge-voice-controls"><div className="lounge-room-controls">
            {!sessionProps && (solo || ended || space) && microphoneControl}
        {!sessionProps && assistanceControl}
        </div>{sessionProps ? <LoungeSessionPanel {...sessionProps} mode="controls" microphoneControl={microphoneControl} assistanceControl={assistanceControl} /> : !solo && !ended && !space && <section className="lounge-session-waiting" aria-label="대화 순서와 손들기"><p className="lounge-session-current" role="status">{props.status === 'lobby' ? '대화 시작을 기다리고 있어요' : props.guidedSession ? '발언 순서를 불러오는 중이에요' : '현재는 자유 대화 중이에요'}</p><div className="lounge-session-actions">{microphoneControl}<button type="button" disabled title="순서 대화가 시작되면 사용할 수 있어요"><Hand size={16} />손들기</button></div><p className="lounge-waiting-summary">{props.status === 'lobby' ? '시작하면 내 차례와 발언 대기 명단이 여기에 보여요.' : props.guidedSession ? '순서가 준비되면 손들기와 발언 대기를 사용할 수 있어요.' : '순서 진행이 적용된 새 대화방에서 손들기와 발언 대기를 사용할 수 있어요.'}</p></section>}<div className="lounge-stage-note">{solo ? '편하게 이야기해 주세요.' : '같은 취향도, 다른 생각도 좋아요. AI는 끼어들지 않으니 서로 편하게 말을 건네세요.'}</div></div>
        </div>
          </aside>
        </div>
        {(props.error || sendError) && <p className="lounge-error" role="alert">{props.error || sendError}</p>}
    {ended && <div className="lounge-ended"><Coffee size={24} /><span>오늘의 대화가 끝났어요. 다음에 또 만나요.</span><Link to="/lounge">새로운 대화방 <ArrowRight size={16} /></Link></div>}
      </div>
    </section><aside className="lounge-chat-panel" ref={journalPanel} id={journalId} tabIndex={-1} hidden={!journalOpen} aria-label="대화 기록" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeJournal(); } }}><div className="lounge-chat-heading"><MessageCircle size={19} /><h2>우리의 대화</h2><span>{props.preview ? 'PREVIEW' : 'LIVE'}</span><button type="button" className="lounge-journal-close" onClick={closeJournal} aria-label="대화 기록 접기"><X size={18} /></button></div><p className="lounge-chat-intro">목소리에 담긴 생각, 천천히 알아가는 우리.</p><div className="lounge-chat-log" ref={log} role="log" aria-label="대화 내용">{props.messages.length === 0 && <div className="lounge-chat-empty"><Coffee size={32} /><p>아직은 고요한 대화방.<br />첫 이야기를 기다리고 있어요.</p></div>}{props.messages.map(message => <article key={message.id} className={message.kind === 'host' ? 'host' : ''}><span className="lounge-chat-avatar">{message.kind === 'host' ? <LoungeHostPortrait hostId={props.hostId} /> : <LoungePortrait index={props.members.find(member => member.id === message.user_id)?.avatarIndex} url={props.members.find(member => member.id === message.user_id)?.avatarUrl} name={message.nickname} />}</span><div><strong>{message.kind === 'host' ? host.name : message.nickname}{message.kind === 'host' && <b>{hostRole}</b>}</strong><p>{message.text}</p></div></article>)}</div><p className="lounge-chat-privacy">음성은 AI 진행을 위해 글로 전사됩니다.<br />원본 음성은 저장하지 않아요.</p></aside></div>
  </main>;
}

function LoungePreview() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const host = getLoungeHost(params.get('host') ?? 'jaeseok');
  const topic = params.get('topic')?.slice(0, 160) || loungeTopics[0].question;
  const capacity = Math.min(6, Math.max(1, Math.trunc(Number(params.get('capacity'))) || 4));
  const opening = capacity === 1
    ? `반가워요. “${topic}” 하면 가장 먼저 어떤 생각이 떠올라요?`
    : `반가워요. 오늘은 “${topic}” 이야기를 나눠요. 먼저 불리고 싶은 이름과 이 이야기에 끌린 이유를 한마디씩 들려주세요. 어려우면 패스해도 괜찮아요.`;
  const [messages, setMessages] = useState<LoungeMessage[]>(() => [
    { id: 1, room_id: 'preview', user_id: null, nickname: host.name, kind: 'host', text: opening, created_at: new Date().toISOString() },
    ...(capacity > 1 ? [{ id: 2, room_id: 'preview', user_id: 'demo-soyeon', nickname: '소연 · 예시', kind: 'human' as const, text: '같은 경험도 누구와 함께하느냐에 따라 다르게 남더라고요.', created_at: new Date().toISOString() }] : []),
    ...(capacity > 2 ? [{ id: 3, room_id: 'preview', user_id: 'demo-jiwoo', nickname: '지우 · 예시', kind: 'human' as const, text: '맞아요. 전 이렇게 같이 이야기하는 시간이 더 좋아요.', created_at: new Date().toISOString() }] : []),
  ]);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [demoPlaying, setDemoPlaying] = useState(true);
  const [demoTurn, setDemoTurn] = useState(0);
  const avatarIndex = 0;
  const demoMembers = [{ id: 'me', name: '나 · 미리보기', muted: false, avatarIndex }, { id: 'demo-soyeon', name: '소연 · 예시', muted: false, avatarIndex: 1 }, { id: 'demo-jiwoo', name: '지우 · 예시', muted: false, avatarIndex: 2 }].slice(0, Math.min(capacity, 3));
  const [session, setSession] = useState<LoungeSession | null>(() => capacity === 1 ? null : {
    room_id: 'preview', stage: 0, state: 'ready', speaker_id: 'me', turn_id: 'preview-first', turn_kind: 'basic',
    round_order: demoMembers.map(member => member.id), completed: [], hand_queue: [], started_at: new Date().toISOString(),
    stage_started_at: new Date().toISOString(), turn_started_at: null, spoken_seconds: 0, nudged: false, announced_turn: null,
    between_since: null, updated_at: new Date().toISOString(),
  });
  const previewSessionAction = async (action: LoungeSessionAction) => {
    setSession(previous => {
      if (!previous || previous.state === 'finished') return previous;
      const next = { ...previous, completed: [...previous.completed], hand_queue: [...previous.hand_queue] };
      if (action === 'raise') { if (!next.hand_queue.includes('me')) next.hand_queue.push('me'); return next; }
      if (action === 'lower') { next.hand_queue = next.hand_queue.filter(id => id !== 'me'); return next; }
      if (next.state === 'free') {
        // Topic cards change on screen only; the closing round starts when the host decides.
        if (action === 'next_stage' && next.stage < 4) return { ...next, stage: next.stage + 1 };
        if (action !== 'next_stage' && action !== 'wrap_up') return next;
        return { ...next, stage: 5, state: 'ready', completed: [], hand_queue: [], speaker_id: next.round_order[0] ?? 'me', turn_kind: 'basic', turn_id: crypto.randomUUID() };
      }
      if (action === 'begin') return { ...next, state: 'speaking' };
      if (action === 'pass' && next.speaker_id !== 'me') return { ...next, completed: [...next.completed, 'me'], hand_queue: next.hand_queue.filter(id => id !== 'me') };
      if (['done', 'pass', 'yield'].includes(action)) {
        if (next.turn_kind === 'basic' && next.speaker_id && !next.completed.includes(next.speaker_id)) next.completed.push(next.speaker_id);
        next.speaker_id = null;
      }
      if (action === 'next_stage') {
        if (next.stage === 5) return { ...next, state: 'finished' };
        next.stage++; next.completed = [];
        if (next.round_order.length) next.round_order = [...next.round_order.slice(1), next.round_order[0]];
        next.hand_queue = [];
        next.state = 'between';
      }
      if (!next.round_order.length) next.round_order = demoMembers.map(member => member.id);
      const basic = next.round_order.find(id => !next.completed.includes(id));
      if (next.stage === 1 && next.round_order.length < 3 && !next.completed.length) return { ...next, state: 'free', speaker_id: null, turn_id: crypto.randomUUID(), free_started_at: new Date().toISOString() };
      if (!basic && next.stage >= 1 && next.stage <= 4) return { ...next, state: 'free', speaker_id: null, turn_id: crypto.randomUUID(), free_started_at: new Date().toISOString() };
      next.speaker_id = basic || next.hand_queue.shift() || null;
      next.turn_kind = basic ? 'basic' : 'extra'; next.state = next.speaker_id ? 'ready' : 'between';
      next.turn_id = crypto.randomUUID(); return next;
    });
  };
  useEffect(() => {
    if (!demoPlaying) return;
    const interval = setInterval(() => setDemoTurn(value => (value + 1) % (demoMembers.length + 2)), 2800);
    return () => clearInterval(interval);
  }, [demoPlaying, demoMembers.length]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const reply = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setPending(true);
    timer.current = setTimeout(() => { setMessages(previous => [...previous, { id: Date.now(), room_id: 'preview', user_id: null, nickname: host.name, kind: 'host', text: previewHostReply(host.id, text, capacity === 1), created_at: new Date().toISOString() }]); setPending(false); }, 650);
  };
  return <RoomView session={session} onSessionAction={previewSessionAction} theme={getLoungeTheme(params.get('theme')).id} hostId={host.id} topic={topic} capacity={capacity} messages={messages} members={demoMembers} speakers={demoPlaying && demoTurn > 0 && demoTurn <= demoMembers.length ? [demoMembers[demoTurn - 1].id] : []} aiSpeaking={demoPlaying && demoTurn === 0} pending={pending} status="active" remaining="60분 · 예시" preview micOn={false} connected={false} isHost error="" currentUserId="me" demoPlaying={demoPlaying} onDemoToggle={() => setDemoPlaying(value => !value)} onConnect={() => {}} onMic={() => {}} onAsk={() => reply(topic)} onStart={() => {}} onLeave={() => navigate('/lounge')} />;
}

/** In a space the AI's role follows who is present: one person gets the one-to-one role, two or more the group role. */
const effectiveRoom = (room: LoungeRoom, members: LoungeMember[], now: number): LoungeRoom =>
  room.space_id ? { ...room, capacity: loungeIsSolo(room, members, now) ? 1 : room.capacity } : room;

function LoungeRoomPage({ roomId, user, onGuestRequest, onLoginRequest }: Props & { roomId: string }) {
  const navigate = useNavigate();
  const [room, setRoom] = useState<LoungeRoom | null>(null);
  const [session, setSession] = useState<LoungeSession | null>(null);
  const [members, setMembers] = useState<LoungeMember[]>([]);
  const [messages, setMessages] = useState<LoungeMessage[]>([]);
  const [error, setError] = useState('');
  const [transcriptError, setTranscriptError] = useState('');
  const [pending, setPending] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [retry, setRetry] = useState(0);
  const [micPrepared, setMicPrepared] = useState(false);
  const [starting, setStarting] = useState(false);
  const autoConnectAttempted = useRef(false);
  const autoMicAttempted = useRef(false);
  const autoStartAttempted = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const activeRoomId = useRef(roomId);
  const lastActivity = useRef(0);
  const lastAttempt = useRef(0);
  const lastHostEnded = useRef(0);
  const inputReadyAt = useRef(0);
  const hostBlocked = useRef(false);
  const nextHostAttempt = useRef(0);
  const lastModeratorRequest = useRef<string | null>(null);
  const audioBlocked = useRef(false);
  const nextAudioAttempt = useRef(0);
  const transcribing = useRef(0);
  const roomNetworkError = useRef<string | null>(null);
  const clearRoomNetworkError = useCallback(() => {
    const message = roomNetworkError.current;
    if (!message) return;
    roomNetworkError.current = null;
    setError(previous => previous === message ? '' : previous);
  }, []);
  const [interactionError, setInteractionError] = useState('');
  const interactionBlockedRoom = useRef<string | null>(null);
  const reportInteractionError = useCallback((err: unknown) => {
    if (!mounted.current || activeRoomId.current !== roomId) return;
    if (err instanceof LoungeApiError && err.code === 'lounge_interaction_not_configured' && !err.retryable) interactionBlockedRoom.current = roomId;
    setInteractionError(errorText(err));
  }, [roomId]);
  const hostRequest = useRef<AbortController | null>(null);
  const endingTurn = useRef<string | null>(null);
  const refreshAfterInput = useRef<() => Promise<void>>(async () => {});
  const reviewAfterInput = useCallback(async () => {
    if (!mounted.current || activeRoomId.current !== roomId || interactionBlockedRoom.current === roomId) return;
    const refresh = refreshAfterInput.current;
    const started = performance.now();
    try {
      const checked = await reviewLoungeInteraction(roomId);
      if (!mounted.current || activeRoomId.current !== roomId || interactionBlockedRoom.current === roomId || checked.skipped) return;
      setInteractionError(checked.voiceSyncPending ? '음성 서버에 발언 제한을 적용 중이에요.' : '');
      await refresh();
    } catch (err) { reportInteractionError(err); }
    finally { console.info('[Lounge latency]', { interactionMs: Math.round(performance.now() - started) }); }
  }, [roomId, reportInteractionError]);
  // The browser that drives the AI: the owner of a created room, or in a space whoever holds the AI-voice lease.
  const [broadcaster, setBroadcaster] = useState<string | null>(null);
  const isHost = room?.space_id ? broadcaster === user?.id : room?.host_id === user?.id;
  const viewRoom = room ? effectiveRoom(room, members, clock) : null;
  const relationshipHost = Boolean(viewRoom && (viewRoom.capacity === 1 || viewRoom.space_id) && isLoungeRelationshipHost(viewRoom.host_persona));
  const [relationship, setRelationship] = useState<RelationshipView | null>(null);
  const transcript = useCallback(async (blob: Blob, turnId?: string) => {
    if (!mounted.current || audioBlocked.current) return;
    transcribing.current += 1;
    const started = performance.now();
    try {
      const delay = Math.max(0, nextAudioAttempt.current - Date.now());
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      if (!mounted.current || audioBlocked.current) return;
      let result;
      try { result = await transcribeLoungeAudio(roomId, blob, undefined, turnId); }
      catch (err) {
        if (!(err instanceof LoungeApiError) || err.code !== 'lounge_audio_cooldown') throw err;
        await new Promise(resolve => setTimeout(resolve, err.retryAfterSeconds * 1000));
        if (!mounted.current || audioBlocked.current) return;
        result = await transcribeLoungeAudio(roomId, blob, undefined, turnId);
      }
      if (!mounted.current || activeRoomId.current !== roomId) return;
      setTranscriptError('');
      if (result.posted) {
        // Display committed speech immediately. Neither the display refresh nor
        // protection inference holds the ordered audio queue or the ending button.
        inputReadyAt.current = Date.now();
        void refreshAfterInput.current().catch(err => {
          if (mounted.current && activeRoomId.current === roomId) setTranscriptError(errorText(err));
        });
        void reviewAfterInput();
      }
      console.info('[Lounge latency]', { transcriptionMs: Math.round(performance.now() - started) });
    }
    catch (err) {
      if (err instanceof LoungeApiError) {
        audioBlocked.current = !err.retryable;
        nextAudioAttempt.current = Date.now() + err.retryAfterSeconds * 1000;
        if (!err.retryable && err.code?.startsWith('openai_')) hostBlocked.current = true;
      }
      if (mounted.current) setTranscriptError(errorText(err));
    }
    finally { transcribing.current -= 1; }
  }, [roomId, reviewAfterInput]);
  const restrictedIds = restrictedLoungeMembers(members, clock);
  const audio = useLoungeAudio(roomId, (room?.space_id ? broadcaster : room?.host_id) ?? '', transcript, viewRoom?.capacity, room?.guided_session && !isLoungeFreeStage(session) ? { allowed: session?.speaker_id === user?.id && session?.state === 'speaking', speakerId: session?.state === 'speaking' ? session.speaker_id : null, turnId: session?.turn_id } : undefined, restrictedIds, getLoungeHostLoudness(room?.host_persona));
  const voiceProfiles = useRef(new Map<string, (typeof audio.participants)[number]>());
  useEffect(() => { for (const participant of audio.participants) voiceProfiles.current.set(participant.id, participant); }, [audio.participants]);
  const current = useRef({ room: viewRoom, session, messages, audio, isHost, restrictedIds });
  useEffect(() => { current.current = { room: viewRoom, session, messages, audio, isHost, restrictedIds }; }, [viewRoom, session, messages, audio, isHost, restrictedIds]);
  const applySession = useCallback((incoming: LoungeSession | null) => {
    const value = newerLoungeSession(current.current.session, incoming);
    current.current = { ...current.current, session: value }; setSession(value);
  }, []);
  const disconnectUnavailableRoom = audio.disconnect;
  const reportRoomError = useCallback((err: unknown) => {
    if (!mounted.current || activeRoomId.current !== roomId) return;
    setError(errorText(err));
    if (err instanceof LoungeApiError && err.code === 'lounge_network_error') roomNetworkError.current = err.message;
    if (err instanceof LoungeApiError && err.code === 'lounge_access_denied') {
      current.current = { ...current.current, room: null, session: null };
      setRoom(null); setSession(null);
      hostRequest.current?.abort(); disconnectUnavailableRoom();
    }
  }, [roomId, disconnectUnavailableRoom]);
  const refreshAfterMessage = useCallback(async () => {
    let state;
    try { state = await loadLounge(roomId); }
    catch (err) { reportRoomError(err); throw err; }
    if (!mounted.current || activeRoomId.current !== roomId) return;
    clearRoomNetworkError();
    setRoom(state.room); applySession(state.session ?? null); setMembers(state.members); setMessages(state.messages);
    current.current = { ...current.current, room: effectiveRoom(state.room, state.members, Date.now()), messages: state.messages };
  }, [roomId, applySession, reportRoomError, clearRoomNetworkError]);
  useEffect(() => { refreshAfterInput.current = refreshAfterMessage; }, [refreshAfterMessage]);
  const studyRoomEnded = room?.status === 'ended';
  useEffect(() => {
    if (!isHost || !room?.study_required || room.topic_study || studyRoomEnded) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;
    const prepare = async () => {
      try {
        const result = await prepareLoungeTopic(roomId);
        if (cancelled || !mounted.current || activeRoomId.current !== roomId) return;
        if (result.study) await refreshAfterMessage();
        else retryTimer = setTimeout(() => void prepare(), 10_000);
      } catch (err) {
        if (cancelled || !mounted.current) return;
        setError(errorText(err));
        if (err instanceof LoungeApiError && !err.retryable) { hostBlocked.current = true; return; }
        retryTimer = setTimeout(() => void prepare(), err instanceof LoungeApiError ? err.retryAfterSeconds * 1000 : 60_000);
      }
    };
    void prepare();
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, [roomId, isHost, room?.study_required, room?.topic_study, studyRoomEnded, refreshAfterMessage]);
  useEffect(() => { if (audio.speakers.length && !audio.aiSpeaking) lastActivity.current = Date.now(); }, [audio.speakers, audio.aiSpeaking]);
  const ownRestricted = restrictedIds.includes(user?.id ?? '');
  const stopSafetyMicrophone = audio.stopMicrophone;
  const stopSafetyHost = audio.stopHost;
  useEffect(() => {
    if (!ownRestricted) return;
    stopSafetyMicrophone();
    if (isHost) { hostRequest.current?.abort(); stopSafetyHost(); }
  }, [ownRestricted, isHost, stopSafetyMicrophone, stopSafetyHost]);
  useEffect(() => {
    if (!isHost || room?.status !== 'active') return;
    let cancelled = false, running = false;
    const check = async () => {
      if (running || cancelled || interactionBlockedRoom.current === roomId) return;
      running = true;
      let safetyError = '';
      try {
        try { await syncLoungeSafety(roomId); }
        catch (err) {
          safetyError = errorText(err);
          if (!cancelled) reportInteractionError(err);
        }
        if (cancelled || interactionBlockedRoom.current === roomId) return;
        const message = current.current.messages.find(item => item.kind === 'human' && item.reviewed_at === null
          && (item.review_attempts ?? 0) < 3 && Date.parse(item.created_at) > Date.now() - 120_000);
        if (message) {
          const result = await reviewLoungeInteraction(roomId, message.id);
          if (result.voiceSyncPending) safetyError = '발언 제한의 음성 연결 반영을 다시 시도하고 있어요.';
        }
        if (!cancelled && interactionBlockedRoom.current !== roomId) { setInteractionError(safetyError); await refreshAfterMessage(); }
      } catch (err) { if (!cancelled) reportInteractionError(err); }
      finally { running = false; }
    };
    const kickoff = setTimeout(() => void check(), 1000);
    const interval = setInterval(() => void check(), 5000);
    return () => { cancelled = true; clearTimeout(kickoff); clearInterval(interval); };
  }, [isHost, room?.status, roomId, refreshAfterMessage, reportInteractionError]);

  useEffect(() => {
    activeRoomId.current = roomId;
    mounted.current = true;
    return () => { mounted.current = false; hostRequest.current?.abort(); };
  }, [roomId]);
  const userId = user?.id, userNickname = user?.nickname;
  useEffect(() => {
    if (!userId || !userNickname) return;
    let cancelled = false, refreshing = false, joined = false;
    const refresh = async () => {
      if (refreshing) return; refreshing = true;
      try { const state = await loadLounge(roomId); if (!cancelled) { clearRoomNetworkError(); setRoom(state.room); applySession(state.session ?? null); setMembers(state.members); setMessages(state.messages); } }
      catch (err) {
        if (!cancelled) {
          if (err instanceof LoungeApiError && err.code === 'lounge_access_denied') joined = false;
          reportRoomError(err);
        }
      }
      finally { refreshing = false; }
    };
    void joinLounge(roomId, userNickname).then(() => { if (!cancelled) { joined = true; void refresh(); } }).catch(err => { if (!cancelled) setError(errorText(err)); });
    const interval = setInterval(() => { if (joined) void refresh(); }, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [roomId, userId, userNickname, retry, applySession, reportRoomError, clearRoomNetworkError]);
  useEffect(() => {
    if (!room?.status || room.status === 'ended' || !userId) return;
    let cancelled = false, running = false;
    const heartbeat = async () => {
      if (running || cancelled) return;
      running = true;
      try { await controlLounge(roomId, 'heartbeat'); }
      catch (err) { if (!cancelled) reportRoomError(err); }
      finally { running = false; }
    };
    const resume = async () => {
      if (document.visibilityState === 'hidden' || cancelled) return;
      await heartbeat();
      if (cancelled) return;
      try { await refreshAfterMessage(); }
      catch { return; }
      const latest = current.current;
      if (!cancelled && latest.room?.status !== 'ended' && !latest.audio.connected && !latest.audio.connecting) await latest.audio.connect();
      else if (!cancelled && latest.audio.connected) latest.audio.enableAudio();
    };
    const onResume = () => { void resume(); };
    void heartbeat();
    const interval = setInterval(() => { void heartbeat(); }, 15_000);
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('online', onResume);
    return () => { cancelled = true; clearInterval(interval); document.removeEventListener('visibilitychange', onResume); window.removeEventListener('pageshow', onResume); window.removeEventListener('online', onResume); };
  }, [roomId, room?.status, userId, reportRoomError, refreshAfterMessage]);
  useEffect(() => { const interval = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(interval); }, []);
  const spaceTable = Boolean(room?.space_id) && room?.status === 'active';

  useEffect(() => {
    if (!spaceTable || !userId) return;
    let cancelled = false, running = false;
    const claim = async () => {
      if (running || cancelled) return;
      running = true;
      try { const holder = await claimLoungeBroadcaster(roomId); if (!cancelled) setBroadcaster(holder); }
      catch { /* The next call retries; the room keeps working without AI voice meanwhile. */ }
      finally { running = false; }
    };
    const kickoff = setTimeout(() => void claim(), 0);
    const interval = setInterval(() => void claim(), 4000);
    return () => { cancelled = true; clearTimeout(kickoff); clearInterval(interval); };
  }, [spaceTable, userId, roomId]);
  const ended = room?.status === 'ended' || Boolean(room?.expires_at && Date.parse(room.expires_at) <= clock);
  const disconnectAudio = audio.disconnect;
  useEffect(() => { if (ended) disconnectAudio(); }, [ended, disconnectAudio]);
  useEffect(() => { if (ended || !audio.connected) hostRequest.current?.abort(); }, [ended, audio.connected]);
  const connectAudio = audio.connect;
  const prepareMicrophone = audio.startMicrophone;
  const readSpeechActivity = audio.getSpeechActivity;
  const sessionAction = useCallback(async (kind: LoungeSessionAction) => {
    const state = current.current;
    const finishing = kind === 'done' || kind === 'pass';
    const turn = state.session?.turn_id;
    if (finishing && endingTurn.current === turn) return;
    if (finishing) endingTurn.current = turn ?? null;
    try {
      if (finishing) {
        await state.audio.flushUtterance();
        if (current.current.session?.turn_id !== turn) return;
      }
      const value = await controlLoungeSession(roomId, kind, turn);
      if (!mounted.current || activeRoomId.current !== roomId) return;
      applySession(value);
      await refreshAfterMessage();
    } finally { if (finishing && endingTurn.current === turn) endingTurn.current = null; }
  }, [roomId, refreshAfterMessage, applySession]);
  useEffect(() => {
    if (ended || session?.state !== 'speaking' || session.speaker_id !== user?.id) return;
    const turn = session.turn_id;
    const voicedAtStart = readSpeechActivity().voicedMs ?? 0;
    let running = false;
    const interval = setInterval(() => {
      const state = current.current;
      if (running || state.session?.turn_id !== turn || state.room?.status !== 'active' || state.audio.aiSpeaking) return;
      if (!shouldAutoFinishLoungeTurn(state.session, state.audio.getSpeechActivity(), voicedAtStart)) return;
      running = true;
      void sessionAction('done').catch(reportRoomError).finally(() => { running = false; });
    }, 1000);
    return () => clearInterval(interval);
  }, [ended, session?.turn_id, session?.state, session?.speaker_id, user?.id, readSpeechActivity, sessionAction, reportRoomError]);
  useEffect(() => {
    if (!room?.guided_session || room.status !== 'active' || !isHost) return;
    let running = false;
    const tick = async () => {
      if (running) return; running = true;
      const state = current.current, speech = state.audio.getSpeechActivity();
      if (isLoungeFreeStage(state.session) && (busy.current || state.audio.aiSpeaking || state.audio.speakers.length || speech.recording || speech.transcribing || Date.now() - speech.lastVoiceAt < 1500)) { running = false; return; }
      try { await sessionAction('tick'); } catch (err) { if (mounted.current) setError(errorText(err)); } finally { running = false; }
    };
    const kickoff = setTimeout(() => void tick(), 0);
    const interval = setInterval(() => void tick(), 2000);
    return () => { clearTimeout(kickoff); clearInterval(interval); };
  }, [room?.guided_session, room?.status, isHost, sessionAction]);
  useEffect(() => {
    if (session?.state !== 'speaking' || session.speaker_id !== user?.id) return;
    let previous = readSpeechActivity().voicedMs ?? 0, running = false;
    const turn = session.turn_id;
    const interval = setInterval(() => {
      if (running || current.current.session?.turn_id !== turn) return;
      const voiced = current.current.audio.getSpeechActivity().voicedMs ?? 0;
      const seconds = Math.max(0, Math.min(10, (voiced - previous) / 1000)); previous = voiced;
      running = true;
      void controlLoungeSession(roomId, 'activity', turn, seconds).then(value => {
        if (mounted.current && current.current.session?.turn_id === turn) applySession(value);
      }).catch(err => { if (mounted.current) setError(errorText(err)); }).finally(() => { running = false; });
    }, 5000);
    return () => clearInterval(interval);
  }, [session?.turn_id, session?.state, session?.speaker_id, user?.id, roomId, readSpeechActivity, applySession]);

  // Defer initiation so StrictMode's first effect cleanup never starts a connection.
  useEffect(() => {
    if (!user || !room || ended || autoConnectAttempted.current) return;
    const timer = setTimeout(() => { autoConnectAttempted.current = true; void connectAudio(); }, 0);
    return () => clearTimeout(timer);
  }, [user, room, ended, connectAudio]);
  useEffect(() => {
    if (!audio.connected || ended || autoMicAttempted.current) return;
    const timer = setTimeout(() => {
      autoMicAttempted.current = true;
      void prepareMicrophone().finally(() => { if (mounted.current) setMicPrepared(true); });
    }, 0);
    return () => clearTimeout(timer);
  }, [audio.connected, prepareMicrophone, ended]);
  useEffect(() => {
    if (!room || room.capacity !== 1 || room.status !== 'lobby' || !isHost || !audio.connected || !audio.audioReady || !micPrepared || autoStartAttempted.current || ended) return;
    const timer = setTimeout(() => {
      autoStartAttempted.current = true; setStarting(true);
      void controlLounge(roomId, 'start').then(refreshAfterMessage).catch(err => { if (mounted.current) setError(errorText(err)); }).finally(() => { if (mounted.current) setStarting(false); });
    }, 0);
    return () => clearTimeout(timer);
  }, [room, roomId, isHost, audio.connected, audio.audioReady, micPrepared, ended, refreshAfterMessage]);

  const hostTurn = useCallback(async (reason: LoungeHostReason, requestKind?: LoungeHelpKind) => {
    const state = current.current;
    if (state.room && state.restrictedIds.includes(state.room.host_id)) return;
    const speech = state.audio.getSpeechActivity();
    if (busy.current || transcribing.current || speech.transcribing || !state.isHost || !state.audio.connected || !state.audio.audioReady || state.room?.status !== 'active' || state.audio.aiSpeaking || state.audio.speakers.length || speech.recording) return;
    if (state.room.capacity === 1 && (Date.now() - Math.max(lastActivity.current, speech.lastVoiceAt) < loungeSoloTiming.endOfTurnMs || Date.now() - inputReadyAt.current < loungeSoloTiming.settleAfterTranscriptMs || Date.now() - lastHostEnded.current < loungeSoloTiming.afterAiMs)) return;
    if (state.room.guided_session && !['ready', 'free'].includes(state.session?.state ?? '')) return;
    if (state.room.study_required && !state.room.topic_study) return;
    if (Date.now() - lastAttempt.current < loungeHostCooldownMs(state.room.capacity)) return;
    const requestAt = state.room.moderator_requested_at;
    const newRequest = reason === 'requested' && (!requestAt || requestAt !== lastModeratorRequest.current);
    if (newRequest) { hostBlocked.current = false; audioBlocked.current = false; nextHostAttempt.current = 0; lastModeratorRequest.current = requestAt ?? null; }
    if (hostBlocked.current || Date.now() < nextHostAttempt.current) return;
    busy.current = true; lastAttempt.current = Date.now(); setPending(true);
    const controller = new AbortController(); hostRequest.current = controller;
    const started = performance.now(), requestedAt = Date.now();
    // Unprompted speech yields to people: if anyone starts talking, it is dropped instead of waiting.
    const unprompted = reason === 'silence';
    let spoke = false;
    try {
      const kind = reason === 'requested' ? requestKind ?? state.room.moderator_request_kind ?? undefined : undefined;
      const response = await requestLoungeHost(roomId, reason, controller.signal, kind);
      if (!mounted.current || controller.signal.aborted) { await response.stream?.cancel(); return; }
      if (!response.skipped) setError('');
      if (response.stream) {
        const guided = state.room.guided_session;
        const canWaitForAudio = () => {
          const latest = current.current, activity = latest.audio.getSpeechActivity();
          return mounted.current && !controller.signal.aborted && latest.audio.connected && !latest.restrictedIds.includes(latest.room?.host_id ?? '') && latest.room?.status === 'active'
            && (!guided || (latest.session?.turn_id === state.session?.turn_id && ['ready','free'].includes(latest.session?.state ?? '')))
            && !(unprompted && (latest.audio.speakers.length || activity.recording || Math.max(lastActivity.current, activity.lastVoiceAt) > requestedAt));
        };
        if (!canWaitForAudio()) { await response.stream.cancel(); return; }
        let timings: Record<string, number> = {};
        await current.current.audio.playHostStream(response.stream, () => {
          spoke = true;
          if (mounted.current) setPending(false);
          console.info('[Lounge latency]', { ...timings, firstAudioMs: Math.round(performance.now() - started) });
        }, value => { timings = value; }, () => {
          const latest = current.current, activity = latest.audio.getSpeechActivity();
          return !controller.signal.aborted && !latest.audio.speakers.length && !activity.recording && !activity.transcribing && latest.room?.status === 'active' && (!latest.room.guided_session || (latest.session?.turn_id === state.session?.turn_id && ['ready','free'].includes(latest.session?.state ?? ''))) && Date.now() - Math.max(lastActivity.current, activity.lastVoiceAt) >= (latest.room.capacity === 1 ? loungeSoloTiming.endOfTurnMs : 2000);
        }, canWaitForAudio);
        if (mounted.current) await refreshAfterMessage();
      }
      if (response.audioError) setError('사회자 음성을 준비하지 못했어요. 대화 기록에서 사회자의 말을 확인해 주세요.');
      if (response.audio && !current.current.audio.speakers.length && current.current.room?.status === 'active') { spoke = true; await current.current.audio.playHost(response.audio); }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof LoungeApiError) {
        hostBlocked.current = !err.retryable;
        nextHostAttempt.current = Date.now() + Math.max(30, err.retryAfterSeconds) * 1000;
      }
      // People kept talking, so the AI stayed quiet; only an explicit request needs to hear about it.
      const yielded = err instanceof LoungeApiError && err.code === 'lounge_audio_deferred' && reason !== 'requested';
      if (mounted.current && !yielded) setError(errorText(err));
    }
    finally {
      if (spoke) lastHostEnded.current = Date.now(); if (hostRequest.current === controller) hostRequest.current = null; busy.current = false; if (mounted.current) setPending(false);
    }
  }, [roomId, refreshAfterMessage]);
  useEffect(() => {
    const interval = setInterval(() => {
      const state = current.current;
      const speech = state.audio.getSpeechActivity();
      if (!state.isHost || !state.room || !state.audio.connected || !state.audio.audioReady || !micPrepared || speech.recording || speech.transcribing || state.audio.aiSpeaking || state.audio.speakers.length) return;
      if (state.room.guided_session) {
        if (!state.session || !['ready','free'].includes(state.session.state)) return;
        // Scheduled speech is limited to the greeting, the first topic and the closing.
        const scheduled = loungeSessionHostReason(state.session);
        if (scheduled) void hostTurn(scheduled);
        else if (state.room.moderator_requested_at) void hostTurn('requested');
        else if (isLoungeFreeStage(state.session)) {
          const reason = nextLoungeHostReason(state.room, state.messages, Date.now(), Math.max(lastActivity.current, speech.lastVoiceAt), lastAttempt.current, lastHostEnded.current, inputReadyAt.current);
          if (reason === 'silence') void hostTurn(reason);
        }
        return;
      }
      const reason = nextLoungeHostReason(state.room, state.messages, Date.now(), Math.max(lastActivity.current, speech.lastVoiceAt), lastAttempt.current, lastHostEnded.current, inputReadyAt.current);
      if (reason) void hostTurn(reason);
    }, viewRoom?.capacity === 1 ? loungeSoloTiming.pollMs : room?.guided_session ? 500 : 3000);
    return () => clearInterval(interval);
  }, [hostTurn, viewRoom?.capacity, room?.guided_session, micPrepared]);
  const latestHostMessage = messages.filter(message => message.kind === 'host').at(-1)?.id;
  // In a group the AI rarely speaks; the panel also refreshes after your own words (reviewed and scored in the background).
  const ownMessages = messages.filter(message => message.user_id === user?.id).length;
  const aiSpeaking = audio.aiSpeaking;
  useEffect(() => {
    if (!relationshipHost || aiSpeaking) return;
    let cancelled = false;
    void loadLoungeRelationship(roomId).then(result => { if (!cancelled && mounted.current) setRelationship(result.enabled ? result.relationship ?? null : null); }).catch(() => { /* The relationship panel is optional. */ });
    return () => { cancelled = true; };
  }, [roomId, relationshipHost, latestHostMessage, ownMessages, aiSpeaking]);
  const askModerator = async (kind: Exclude<LoungeHelpKind, 'direct'>) => {
    if (current.current.room?.capacity === 1) { await hostTurn('requested', kind); return; }
    try { await requestLoungeModerator(roomId, kind); await refreshAfterMessage(); }
    catch (err) { if (mounted.current) setError(errorText(err)); }
  };
  const chooseTopic = async (topic: string, source: 'ai' | 'member') => {
    await setLoungeTopic(roomId, topic, source);
    await refreshAfterMessage();
    // The character opens the new topic: at once when alone, at the next pause in a group.
    void askModerator('topic');
  };
  const action = async (kind: 'start' | 'leave') => {
    try { setError(''); await controlLounge(roomId, kind); if (kind === 'leave') { audio.disconnect(); navigate('/lounge'); } else { const state = await loadLounge(roomId); setRoom(state.room); } }
    catch (err) { setError(errorText(err)); }
  };
  if (!user) return <main className="lounge-join-gate"><span>☕</span><h1>친구들과 가볍게 이야기해요.</h1><p>이름을 준비하고 대화방에 들어갈게요.</p><button className="lounge-primary" type="button" onClick={() => { void onGuestRequest().catch(err => setError(errorText(err))); }}>게스트로 참여하기 <ArrowRight size={17} /></button><button className="lounge-preview-button" type="button" onClick={onLoginRequest}>로그인해서 참여하기</button>{error && <p className="lounge-error" role="alert">{error}</p>}</main>;
  if (!room) return <main className="lounge-join-gate"><Coffee size={42} /><h1>{error ? '대화방을 확인해 주세요' : '친구들의 자리를 준비해요…'}</h1>{error && <><p className="lounge-error" role="alert">{error}</p><button type="button" className="lounge-preview-button" onClick={() => { setError(''); setRetry(value => value + 1); }}><RefreshCw size={16} /> 다시 확인하기</button><Link to="/lounge">라운지로 돌아가기</Link></>}</main>;
  const remaining = room.expires_at ? Math.max(0, Math.ceil((Date.parse(room.expires_at) - clock) / 1000)) : 3600;
  const present = loungePresentMembers(members, clock).length;
  const ownRestriction = members.find(member => member.user_id === user.id)?.speaking_restricted_until;
  const topicPicker: LoungeTopicPickerProps | undefined = room.space_id ? {
    topic: room.topic_source ? room.topic : null, source: room.topic_source ?? null, setBy: room.topic_set_by ?? null, suggestions: room.topic_suggestions ?? null,
    hostName: getLoungeHost(room.host_persona).name, disabled: ended || Date.parse(ownRestriction ?? '') > clock,
    onSuggest: async () => { await suggestLoungeTopics(roomId); await refreshAfterMessage(); }, onSet: chooseTopic,
  } : undefined;
  const seats = members.map(member => {
    const voice = audio.participants.find(participant => participant.id === member.user_id);
    return { ...(voice ?? voiceProfiles.current.get(member.user_id)), id: member.user_id, name: member.nickname, muted: voice?.muted ?? true };
  });
  return <RoomView place={room.space?.name} topicPicker={topicPicker} now={clock} guidedSession={room.guided_session} session={session} sessionNames={Object.fromEntries(members.map(member => [member.user_id, member.nickname]))} onSessionAction={sessionAction} study={room.topic_study} theme={loungeRoomTheme(room.host_persona, room.id)} hostId={room.host_persona} liveHostText={audio.hostText} currentUserId={user.id} topic={room.topic} topicBrief={room.topic_brief} capacity={viewRoom!.capacity} messages={messages} onReleaseRestriction={async targetId => { await releaseLoungeRestriction(roomId, targetId); await refreshAfterMessage(); }} members={seats.map(seat => { const safety = members.find(member => member.user_id === seat.id); return { ...seat, warnings: safety?.moderation_warnings, restrictedUntil: safety?.speaking_restricted_until }; })} speakers={audio.speakers} aiSpeaking={audio.aiSpeaking} pending={pending} status={ended ? 'ended' : room.status} remaining={room.space_id ? `${Math.max(1, present)}명 함께` : room.guided_session ? `약 30분 · ${Math.max(0, Math.floor((clock - Date.parse(room.started_at || new Date(clock).toISOString())) / 60000))}분 함께` : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`} micOn={audio.micOn} connected={audio.connected} connecting={audio.connecting} audioReady={audio.audioReady} starting={starting || (audio.connected && audio.audioReady && !micPrepared)} isHost={isHost && !room.space_id} error={error || transcriptError || interactionError || audio.error} onConnect={() => { if (!audio.connected) void audio.connect(); else if (!audio.audioReady) audio.enableAudio(); else void action('start'); }} onMic={() => { if (audio.micOn) audio.stopMicrophone(); else void audio.startMicrophone(); }} onAsk={kind => void askModerator(kind)} helpRequested={Boolean(room.moderator_requested_at)} onStart={() => void action('start')} onLeave={() => { if (isHost && !room.space_id && !ended && !window.confirm(room.capacity === 1 ? 'AI와의 대화를 마칠까요?' : '나가면 모두의 대화방이 종료돼요. 대화를 마칠까요?')) return; void action('leave'); }} inviteUrl={`${window.location.origin}/lounge/${roomId}`} relationship={relationship} />;
}
