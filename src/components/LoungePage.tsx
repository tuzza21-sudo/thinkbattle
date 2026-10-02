import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Coffee, Copy, Headphones, LoaderCircle, LogOut, MessageCircle, Mic, MicOff, Pause, Play, Radio, RefreshCw, Send, Sparkles, UserRound, Users, X } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { AppUser } from '../types';
import { getCurrentUser } from '../lib/auth';
import { getLoungeHost, getLoungeTheme, loungeThemes, loungeHosts, loungeTopics, loungeMinimumParticipants, loungeHostCooldownMs, nextLoungeHostReason, previewHostReply, type LoungeHostId, type LoungeThemeId, type LoungeMember, type LoungeMessage, type LoungeRoom, type LoungeTopicStudy } from '../lib/lounge';
import { LoungeApiError, controlLounge, controlLoungeSession, createLounge, joinLounge, loadLounge, postLoungeMessage, prepareLoungeTopic, requestLoungeHost, transcribeLoungeAudio } from '../lib/loungeApi';
import { newerLoungeSession, type LoungeSession, type LoungeSessionAction } from '../lib/loungeSession';
import { LoungeSessionPanel } from './LoungeSessionPanel';
import { ProfileModal } from './ProfileModal';
import { useLoungeAudio } from '../lib/useLoungeAudio';
import './LoungePage.css';
import './LoungeRoom.css';

type Props = { user: AppUser | null; onGuestRequest: () => Promise<void>; onLoginRequest: () => void; onSignupRequest?: () => void; onUserUpdate?: (user: AppUser) => void; onLogout?: () => Promise<void> };
const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
function LoungeHeader({ user, inRoom, onLoginRequest, onSignupRequest, onProfileRequest, onLogout, loggingOut }: Props & { inRoom: boolean; onProfileRequest: () => void; loggingOut: boolean }) {
  return <header className="lounge-header">
    {inRoom && <Link to="/lounge" className="lounge-back"><ArrowLeft size={17} /> 라운지</Link>}
    <Link to="/lounge" className="lounge-brand"><Coffee size={23} /><strong>수다 라운지<span>CONVERSATIONS & CONNECTIONS</span></strong></Link>
    <div className="lounge-header-end"><span className="lounge-beta">EARLY ACCESS</span>{!inRoom && <nav className="lounge-account" aria-label="내 계정">
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
  const { roomId } = useParams();
  const [showProfile, setShowProfile] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [accountError, setAccountError] = useState('');
  const logout = async () => {
    if (!props.onLogout || loggingOut) return;
    setLoggingOut(true); setAccountError('');
    try { await props.onLogout(); setShowProfile(false); } catch (error) { setAccountError(errorText(error)); } finally { setLoggingOut(false); }
  };
  return <><div className={`lounge-page ${roomId ? 'has-room' : ''}`}><LoungeHeader {...props} inRoom={Boolean(roomId)} onProfileRequest={() => setShowProfile(true)} onLogout={props.onLogout ? logout : undefined} loggingOut={loggingOut} />{accountError && <p className="lounge-account-error" role="alert">{accountError}</p>}{roomId === 'preview' ? <LoungePreview /> : roomId ? <LoungeRoomPage key={roomId} roomId={roomId} {...props} /> : <LoungeLobby {...props} />}</div>{showProfile && !roomId && props.user && !props.user.isAnonymous && props.onUserUpdate && <ProfileModal key={props.user.id} user={props.user} onClose={() => setShowProfile(false)} onProfileUpdated={props.onUserUpdate} serviceName="수다 라운지" />}</>;
}

function LoungeLobby({ user, onGuestRequest, onLoginRequest }: Props) {
  const navigate = useNavigate();
  const [hostId, setHostId] = useState<LoungeHostId>('jaeseok');
  const [themeId, setThemeId] = useState<LoungeThemeId>('rooftop');
  const [topicId, setTopicId] = useState<string>('movie');
  const [capacity, setCapacity] = useState(4);
  const [customTopic, setCustomTopic] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const topic = loungeTopics.find(item => item.id === topicId) ?? loungeTopics[0];
  const title = customTopic.trim() || topic.question;
  const host = getLoungeHost(hostId);
  const openRoom = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (!user) await onGuestRequest();
      const current = user ?? await getCurrentUser();
      if (!current) throw new Error('로그인 후 다시 시작해 주세요.');
      const id = await createLounge(hostId, title, capacity, current.nickname, themeId);
      navigate(`/lounge/${id}`);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  const openInvite = () => {
    const match = invite.trim().match(/(?:^|\/)(lounge-[a-f0-9-]{36})(?:[/?#]|$)/);
    if (!match) { setError('초대 링크 또는 lounge-로 시작하는 방 코드를 넣어 주세요.'); return; }
    navigate(`/lounge/${match[1]}`);
  };
  const themeOptions = <section className="lounge-section">
    <div className="lounge-section-title"><div><span>03 · YOUR VIEW</span><h2>어떤 풍경에서 만날까요?</h2></div><p>함께 들어오는 사람도 같은 뷰를 즐겨요.</p></div>
    <div className="lounge-theme-options" role="group" aria-label="라운지 테마">
      {loungeThemes.map(item => <button type="button" key={item.id} onClick={() => setThemeId(item.id)} aria-pressed={themeId === item.id}>
        <img src={item.image} alt="" loading="lazy" /><span><strong>{item.name}</strong><small>{item.subtitle}</small></span>{themeId === item.id && <i><Check size={15} /></i>}
      </button>)}
    </div>
  </section>;
  return <main className="lounge-lobby">
    <section className="lounge-hero">
      <div className="lounge-hero-copy"><span className="lounge-eyebrow"><span /> GOOD CONVERSATIONS, NEW CONNECTIONS</span><h1>사진보다 먼저,<br /><em>당신의 이야기를.</em></h1><p>좋아하는 영화, 마음에 남은 문장, 조금 다른 생각.<br />목소리와 취향으로, 이야기할수록 서로를 알아가는 라운지.</p><div className="lounge-hero-meta"><span><Users size={16} /> 혼자 또는 친구와 1~6명</span><span><Headphones size={16} /> 실시간 음성</span><span><Coffee size={16} /> 그룹 대화 약 30분</span></div></div>
      <div className="lounge-hero-art" aria-hidden="true"><div className="lounge-orbit orbit-one" /><div className="lounge-orbit orbit-two" /><div className="lounge-art-center">☕<span>취향에서 시작해,<br />서로에게 가까이.</span></div><span className="lounge-art-face face-one"><LoungePortrait index={0} name="가상 참가자" /></span><span className="lounge-art-face face-two"><LoungePortrait index={1} name="가상 참가자" /></span><span className="lounge-art-face face-three"><LoungePortrait index={2} name="가상 참가자" /></span><span className="lounge-art-note note-one">그 장면, 나도 좋아해요.</span><span className="lounge-art-note note-two">조금 더 듣고 싶어요.</span><span className="lounge-art-star">✳</span></div>
    </section>
    <div className="lounge-lobby-layout"><div className="lounge-selections">
      <section className="lounge-section"><div className="lounge-section-title"><div><span>01 · YOUR HOST</span><h2>누구와 이야기할까요?</h2></div><p>호스트마다 질문도, 분위기도 달라요.</p></div><div className="lounge-host-options">{loungeHosts.map(item => <button type="button" key={item.id} className={`lounge-host-option ${hostId === item.id ? 'selected' : ''}`} onClick={() => setHostId(item.id)} aria-pressed={hostId === item.id}><span className="lounge-host-emoji" style={{ background: item.color }}>{item.emoji}</span><span className="lounge-host-tag">{item.tag}</span><strong>{item.name}</strong><small>{item.description}</small><span className="lounge-selection-check">{hostId === item.id ? <Check size={14} /> : '+'}</span></button>)}</div><p className="lounge-persona-note">실제 인물이 아닌, 진행 성격에서 착안한 AI 호스트예요. 목소리는 AI 합성 음성입니다.</p></section>
      <section className="lounge-section"><div className="lounge-section-title"><div><span>02 · TALK ABOUT</span><h2>무슨 이야기로 시작할까요?</h2></div><span className="lounge-soft-label">대화는 어디로 흘러가도 OK</span></div><div className="lounge-topic-options">{loungeTopics.map(item => <button type="button" key={item.id} onClick={() => { setTopicId(item.id); setCustomTopic(''); }} className={topicId === item.id && !customTopic ? 'selected' : ''} aria-pressed={topicId === item.id && !customTopic}><span>{item.emoji}</span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div>{topicId === item.id && !customTopic && <Check size={16} />}</button>)}</div><label className="lounge-custom-topic"><MessageCircle size={18} /><input value={customTopic} onChange={event => setCustomTopic(event.target.value)} maxLength={160} placeholder="직접 고른 이야기도 좋아요. 예: 요즘 빠진 취미" aria-label="직접 입력하는 대화 주제" /></label></section>
      <p className="lounge-study-hint">직접 입력한 주제는 사회자가 자료를 찾아보고 질문을 준비해요. 작품명과 감독·작가를 함께 적으면 더 정확해요.</p>
      {themeOptions}
    </div><aside className="lounge-room-builder"><span className="lounge-eyebrow">MAKE SOME ROOM</span><h2>{capacity === 1 ? '사회자와 둘이서' : '우리의 작은 수다방'}</h2><div className="lounge-builder-host"><span style={{ background: host.color }}>{host.emoji}</span><div><small>오늘의 AI 호스트</small><strong>{host.name}</strong></div><Sparkles size={19} /></div><p className="lounge-builder-topic">“{title}”</p><p className="lounge-builder-theme"><Coffee size={14} />{getLoungeTheme(themeId).name}</p><label className="lounge-capacity-label" htmlFor="lounge-capacity">함께할 인원 <small>AI 호스트는 별도예요</small></label><div className="lounge-capacities" id="lounge-capacity" role="group" aria-label="참여 인원">{[1, 2, 3, 4, 5, 6].map(count => <button type="button" key={count} className={capacity === count ? 'selected' : ''} onClick={() => setCapacity(count)} aria-pressed={capacity === count}>{count === 1 ? '혼자' : `${count}명`}</button>)}</div><div className="lounge-builder-rules"><span><Check size={15} /> {capacity === 1 ? 'AI 사회자와 편안한 1:1 대화' : '초대 링크로 친구와 함께'}</span><span><Check size={15} /> {capacity === 1 ? '이야기를 이어 주는 AI 사회자' : '기본 차례 · 손들기 · 자유로운 패스'}</span><span><Check size={15} /> 점수도, 정답도 없는 대화</span></div><button type="button" className="lounge-primary" disabled={busy} onClick={() => void openRoom()}>{busy ? <LoaderCircle size={18} className="lounge-spin" /> : <Mic size={18} />}{busy ? '수다방 준비 중…' : capacity === 1 ? 'AI와 1:1 대화 시작' : '수다방 만들기'}<ArrowRight size={18} /></button><button type="button" className="lounge-preview-button" onClick={() => navigate(`/lounge/preview?host=${hostId}&topic=${encodeURIComponent(title)}&capacity=${capacity}&theme=${themeId}`)}>먼저 분위기 둘러보기 <ArrowRight size={15} /></button><p className="lounge-builder-footnote">{capacity === 1 ? '입장하면 음성과 마이크를 연결하고 시작해요.' : '2명이 모이면 약 30분의 이야기를 시작해요.'}<br />테스트 기간에는 방장이 나가면 종료됩니다.</p>{!user && <button type="button" className="lounge-signin" onClick={onLoginRequest}>계정으로 로그인하기</button>}</aside></div>
    {error && <p className="lounge-error" role="alert">{error}</p>}
    <section className="lounge-invite"><div><Radio size={21} /><h3>친구가 먼저 방을 열었나요?</h3></div><form onSubmit={event => { event.preventDefault(); openInvite(); }}><input value={invite} onChange={event => setInvite(event.target.value)} placeholder="초대 링크 또는 방 코드 붙여넣기" aria-label="초대 링크 또는 방 코드" /><button type="submit">함께 들어가기 <ArrowRight size={16} /></button></form></section>
    <footer className="lounge-footer"><span>조금 말하고, 많이 웃고. 오늘의 여유를 여기서.</span><span>수다 라운지 · 테스트 오픈</span></footer>
  </main>;
}

type RoomViewProps = { session?: LoungeSession | null; sessionNames?: Record<string, string>; onSessionAction?: (action: LoungeSessionAction) => Promise<void>; study?: LoungeTopicStudy | null; studying?: boolean; theme?: LoungeThemeId; liveHostText?: string; hostId: LoungeHostId; topic: string; capacity: number; messages: LoungeMessage[]; members: Array<{ id: string; name: string; muted: boolean; avatarIndex?: number; avatarUrl?: string }>; speakers: string[]; aiSpeaking: boolean; pending: boolean; status: string; remaining: string; preview?: boolean; micOn: boolean; connected: boolean; connecting?: boolean; audioReady?: boolean; starting?: boolean; isHost: boolean; error: string; onConnect: () => void; onMic: () => void; onAsk: () => void; onStart: () => void; onLeave: () => void; onSend: (text: string) => Promise<void>; inviteUrl?: string; currentUserId?: string; onAvatarChoice?: (index: number) => Promise<void>; demoPlaying?: boolean; onDemoToggle?: () => void };

function LoungeStudyNotes({ study }: { study: LoungeTopicStudy }) {
  return <details className="lounge-study-notes"><summary><Sparkles size={14} />{study.confidence === 'verified' ? '사회자가 준비한 주제 자료' : '주제를 조금 더 확인하고 싶어요'}</summary><div><strong>{study.title}</strong><p>{study.overview}</p>{study.confidence === 'uncertain' && <p>{study.clarification}</p>}{study.facts.length > 0 && <ul>{study.facts.map((fact, index) => <li key={index}>{fact}</li>)}</ul>}{study.sources.length > 0 && <nav aria-label="주제 조사 출처">{study.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title} ↗</a>)}</nav>}<small>자료를 바탕으로 대화해요. 해석에는 여러 관점이 있을 수 있어요.</small></div></details>;
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
function RoomView(props: RoomViewProps) {
  const host = getLoungeHost(props.hostId);
  const theme = getLoungeTheme(props.theme);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [copied, setCopied] = useState(false);
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [choosingAvatar, setChoosingAvatar] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const journalId = useId();
  const journalPanel = useRef<HTMLElement>(null);
  const journalToggle = useRef<HTMLButtonElement>(null);
  const messageInput = useRef<HTMLInputElement>(null);
  const focusMessage = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const latestHost = props.messages.filter(message => message.kind === 'host').at(-1);
  useEffect(() => {
    if (!journalOpen) return;
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'auto' });
  }, [props.messages, journalOpen]);
  useEffect(() => {
    if (!journalOpen) return;
    if (focusMessage.current && !messageInput.current?.disabled) messageInput.current?.focus();
    else journalPanel.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    focusMessage.current = false;
  }, [journalOpen]);
  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true); setSendError('');
    try { await props.onSend(draft.trim()); setDraft(''); } catch (err) { setSendError(errorText(err)); } finally { setSending(false); }
  };
  const ended = props.status === 'ended';
  const solo = props.capacity === 1;
  const liveSpeakers = ended || props.status === 'lobby' ? [] : props.members.filter(member => props.speakers.includes(member.id));
  const hostSpeaking = props.aiSpeaking && !ended;
  const speakingLabel = hostSpeaking ? `${host.name} · 사회자가 이야기하고 있어요` : liveSpeakers.length ? `${liveSpeakers.map(member => member.id === props.currentUserId ? '나' : member.name).join(', ')} · 이야기하는 중` : props.studying ? '사회자가 주제 자료를 찾아보고 질문을 준비해요' : props.pending ? '사회자가 다음 이야기를 준비해요' : ended ? '오늘의 대화가 끝났어요' : '잠깐의 여유, 편하게 말을 건네 보세요';
  const pickAvatar = async (index: number) => {
    if (choosingAvatar || !props.onAvatarChoice) return;
    setChoosingAvatar(true);
    try { await props.onAvatarChoice(index); setAvatarPicker(false); } catch (err) { setSendError(errorText(err)); } finally { setChoosingAvatar(false); }
  };
  const closeJournal = () => { setJournalOpen(false); journalToggle.current?.focus(); };
  const openMessage = () => {
    if (journalOpen) messageInput.current?.focus();
    else { focusMessage.current = true; setJournalOpen(true); }
  };
  return <main className="lounge-room-main" data-theme={theme.id}>
    {props.preview && <div className="lounge-preview-notice"><Sparkles size={17} /><span>실제 참가자·AI 연결 없이 분위기를 둘러보는 화면이에요. 글을 보내면 호스트의 예시 반응을 볼 수 있어요.</span><Link to="/lounge">실제 방 만들기 <ArrowRight size={14} /></Link></div>}
    <div className="lounge-conversation-layout"><section className="lounge-stage" aria-label="풍경과 대화석">
      <div className={`lounge-scene scene-${props.capacity}`}>
        <div className="lounge-room-topline"><div><span className={`lounge-room-status ${props.preview ? 'preview' : ''}`}><span />{props.preview ? '화면 미리보기' : ended ? '오늘의 수다 끝' : props.status === 'lobby' ? solo ? 'AI와 1:1 대화 준비' : '친구를 기다리는 중' : '우리 지금 이야기 중'}</span><h1>{theme.name}</h1></div><div className="lounge-room-top-actions"><span><Coffee size={16} /> {props.remaining}</span><button type="button" ref={journalToggle} className="lounge-journal-toggle" aria-expanded={journalOpen} aria-controls={journalId} onClick={() => journalOpen ? closeJournal() : setJournalOpen(true)}><MessageCircle size={16} /> 대화 기록</button>{props.inviteUrl && !solo && <button type="button" onClick={() => { void navigator.clipboard.writeText(props.inviteUrl!).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => setSendError('주소창의 링크를 복사해 친구에게 보내 주세요.')); }}><Copy size={16} />{copied ? '복사했어요!' : '친구 초대'}</button>}<button type="button" onClick={props.onLeave}><X size={18} /> 나가기</button></div></div>
        <div className="lounge-scene-intro"><span>{theme.tag}</span><p>{theme.caption}</p><div className="lounge-stage-label"><Headphones size={15} /> 함께 머무는 대화석 <span>{solo ? 'AI와 1:1' : `${props.members.length} / ${props.capacity}명`}</span></div></div>
      </div>
      <div className="lounge-conversation-space">
        <div className="lounge-table-topic"><span>오늘의 이야기</span><h2>{props.topic}</h2></div>
        {props.study && <LoungeStudyNotes study={props.study} />}
        {props.session && props.currentUserId && props.onSessionAction && <LoungeSessionPanel session={props.session} userId={props.currentUserId} names={props.sessionNames ?? Object.fromEntries(props.members.map(member => [member.id, member.name]))} questions={props.study?.questions} isHost={props.isHost} blocked={props.pending || props.aiSpeaking} onAction={props.onSessionAction} />}
        <div className={`lounge-seats seats-${props.capacity}`}>{Array.from({ length: props.capacity }, (_, index) => {
          const member = props.members[index];
          const speaking = Boolean(member && liveSpeakers.some(speaker => speaker.id === member.id));
          return <div key={member?.id ?? index} className={`lounge-seat ${member ? 'occupied' : 'empty'} ${speaking ? 'speaking' : ''} ${member?.id === props.session?.speaker_id ? 'has-floor' : ''} ${member?.id === props.currentUserId ? 'self' : ''}`}>
            <span className="lounge-seat-avatar">{member ? <LoungePortrait index={member.avatarIndex} url={member.avatarUrl} name={member.name} /> : <Users size={25} />}{member && <i>{member.muted ? <MicOff size={13} /> : <Mic size={13} />}</i>}</span>
            <strong>{member?.name ?? '빈 자리'}{member?.id === props.currentUserId && <b>나</b>}</strong>
            <span className="lounge-seat-speaking"><VoiceWave active={speaking} />{speaking ? '지금 이야기 중' : member ? member.muted ? '듣고 있어요' : '함께하는 중' : '초대 링크로 함께해요'}</span>
          </div>;
        })}</div>
      <div className={`lounge-moderator ${hostSpeaking ? 'speaking' : ''}`}><span className="lounge-moderator-avatar"><Headphones size={22} /><b>AI</b></span><div className="lounge-moderator-info"><h2>{host.name}</h2><span className="lounge-moderator-caption">{hostSpeaking ? '사회자 · 이야기하는 중' : props.pending ? '사회자 · 이야기를 생각하는 중…' : '사회자 · 이야기를 이어 드려요'}</span></div><VoiceWave active={hostSpeaking} /><div className="lounge-host-bubble">{props.status === 'lobby' ? solo ? '오늘은 둘이 편하게 이야기해요. 음성과 마이크를 준비하고 있어요.' : '친구에게 초대 링크를 보내 주세요. 두 명 이상 음성으로 연결되면 가볍게 인사부터 나눠요.' : ended ? '함께 이야기해 줘서 고마워요. 오늘 남은 시간도 편안하길 바라요.' : props.liveHostText || latestHost?.text || host.greeting}</div></div>
      <div className="lounge-on-air" role="status"><VoiceWave active={hostSpeaking || liveSpeakers.length > 0} /><span>{speakingLabel}</span>{props.preview && <button type="button" onClick={props.onDemoToggle} aria-label={props.demoPlaying ? '발언 효과 미리보기 일시정지' : '발언 효과 미리보기 재생'}>{props.demoPlaying ? <Pause size={13} /> : <Play size={13} />} 발언 효과 예시</button>}</div>
      <div className="lounge-stage-note">{solo ? '편하게 이야기해 주세요. 답하기 어려운 질문은 패스해도 괜찮아요.' : '같은 취향도, 다른 생각도 좋아요. 한 사람씩 서로의 이야기를 들어 주세요.'}</div>
      {props.onAvatarChoice && <div className="lounge-avatar-settings"><button type="button" className="lounge-avatar-toggle" onClick={() => setAvatarPicker(value => !value)} aria-expanded={avatarPicker} disabled={ended}>내 아바타 고르기 <Sparkles size={13} /></button>{avatarPicker && <div className="lounge-avatar-picker"><p>오늘의 나를 표현할 아바타를 골라 주세요.</p><div role="group" aria-label="캐리커처 아바타 선택">{Array.from({ length: 6 }, (_, index) => <button key={index} type="button" disabled={choosingAvatar} onClick={() => void pickAvatar(index)} aria-label={`아바타 ${index + 1} 선택`} aria-pressed={props.members.find(member => member.id === props.currentUserId)?.avatarIndex === index}><LoungePortrait index={index} name={`아바타 ${index + 1}`} /></button>)}</div><small>기본 캐릭터예요. 내 사진으로 만든 아바타는 홈의 프로필에서 관리할 수 있어요.</small></div>}</div>}
      <div className="lounge-room-controls">
        {!props.preview && !ended && (!props.connected || !props.audioReady || (solo && props.status === 'lobby')) ? <button type="button" className="lounge-primary" onClick={props.onConnect} disabled={props.connecting || (props.connected && props.audioReady && props.starting)}>{props.connecting || props.starting ? <LoaderCircle size={18} className="lounge-spin" /> : <Headphones size={18} />}{props.connecting ? '음성 연결 중…' : !props.connected ? '연결 다시 시도' : !props.audioReady ? '소리 켜기' : props.starting ? '대화 준비 중…' : '대화 다시 시작'}</button> : <button type="button" className={`lounge-mic-button ${props.micOn ? 'on' : ''}`} onClick={props.onMic} disabled={props.preview || ended}>{props.micOn ? <Mic size={20} /> : <MicOff size={20} />}{props.preview ? '음성은 실제 방에서' : props.micOn ? '마이크 끄기' : '마이크 켜기'}</button>}
        {props.status === 'lobby' && props.isHost && !solo ? <button type="button" className="lounge-start-button" onClick={props.onStart} disabled={props.members.length < loungeMinimumParticipants(props.capacity) || !props.connected || !props.audioReady}>함께 수다 시작 <ArrowRight size={17} /></button> : props.status !== 'lobby' && !props.session && <button type="button" className="lounge-ask-button" onClick={props.onAsk} disabled={props.pending || props.aiSpeaking || ended || (!props.preview && (!props.isHost || props.status !== 'active' || !props.connected || !props.audioReady))}><Sparkles size={17} /> 화제 하나 던져줘</button>}
        <button type="button" className="lounge-write-button" aria-expanded={journalOpen} aria-controls={journalId} onClick={openMessage}><MessageCircle size={16} /> {ended ? '대화 돌아보기' : '글로 이야기하기'}</button>
      </div>
      </div>
    </section><aside className="lounge-chat-panel" ref={journalPanel} id={journalId} hidden={!journalOpen} aria-label="대화 기록과 글 대화" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeJournal(); } }}><div className="lounge-chat-heading"><MessageCircle size={19} /><h2>우리의 대화</h2><span>{props.preview ? 'PREVIEW' : 'LIVE'}</span><button type="button" className="lounge-journal-close" onClick={closeJournal} aria-label="대화 기록 접기"><X size={18} /></button></div><p className="lounge-chat-intro">목소리에 담긴 생각, 천천히 알아가는 우리.</p><div className="lounge-chat-log" ref={log} role="log" aria-label="대화 내용">{props.messages.length === 0 && <div className="lounge-chat-empty"><Coffee size={32} /><p>아직은 고요한 수다방.<br />첫 이야기를 기다리고 있어요.</p></div>}{props.messages.map(message => <article key={message.id} className={message.kind === 'host' ? 'host' : ''}><span className="lounge-chat-avatar">{message.kind === 'host' ? <Headphones size={16} /> : <LoungePortrait index={props.members.find(member => member.id === message.user_id)?.avatarIndex} url={props.members.find(member => member.id === message.user_id)?.avatarUrl} name={message.nickname} />}</span><div><strong>{message.kind === 'host' ? host.name : message.nickname}{message.kind === 'host' && <b>AI 사회자</b>}</strong><p>{message.text}</p></div></article>)}</div><form className="lounge-chat-form" onSubmit={event => { event.preventDefault(); void send(); }}><input ref={messageInput} value={draft} onChange={event => setDraft(event.target.value)} maxLength={1200} placeholder="말 대신 글로 이야기해도 좋아요" aria-label="수다 메시지" disabled={ended || props.status === 'lobby'} /><button type="submit" aria-label="이야기 보내기" disabled={!draft.trim() || sending || ended || props.status === 'lobby'}><Send size={18} /></button></form><p className="lounge-chat-privacy">음성은 AI 진행을 위해 글로 전사됩니다.<br />원본 음성은 저장하지 않아요.</p></aside></div>
    {(props.error || sendError) && <p className="lounge-error" role="alert">{props.error || sendError}</p>}
    {ended && <div className="lounge-ended"><Coffee size={24} /><span>오늘의 대화가 끝났어요. 다음에 또 만나요.</span><Link to="/lounge">새로운 수다방 <ArrowRight size={16} /></Link></div>}
  </main>;
}

function LoungePreview() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const host = getLoungeHost(params.get('host') ?? 'jaeseok');
  const topic = params.get('topic')?.slice(0, 160) || loungeTopics[0].question;
  const capacity = Math.min(6, Math.max(1, Math.trunc(Number(params.get('capacity'))) || 4));
  const [messages, setMessages] = useState<LoungeMessage[]>(() => [
    { id: 1, room_id: 'preview', user_id: null, nickname: host.name, kind: 'host', text: capacity === 1 ? '오늘은 둘이 편하게 이야기해요. ' + host.greeting : host.greeting, created_at: new Date().toISOString() },
    ...(capacity > 1 ? [{ id: 2, room_id: 'preview', user_id: 'demo-soyeon', nickname: '소연 · 예시', kind: 'human' as const, text: '같은 영화도 누구와 보느냐에 따라 다르게 남더라고요.', created_at: new Date().toISOString() }] : []),
    ...(capacity > 2 ? [{ id: 3, room_id: 'preview', user_id: 'demo-jiwoo', nickname: '지우 · 예시', kind: 'human' as const, text: '맞아요. 전 보고 나서 같이 이야기하는 시간이 더 좋아요.', created_at: new Date().toISOString() }] : []),
  ]);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [demoPlaying, setDemoPlaying] = useState(true);
  const [demoTurn, setDemoTurn] = useState(0);
  const [avatarIndex, setAvatarIndex] = useState(0);
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
      if (action === 'begin') return { ...next, state: 'speaking' };
      if (action === 'pass' && next.speaker_id !== 'me') return { ...next, completed: [...next.completed, 'me'], hand_queue: next.hand_queue.filter(id => id !== 'me') };
      if (['done', 'pass', 'yield'].includes(action)) {
        if (next.turn_kind === 'basic' && next.speaker_id && !next.completed.includes(next.speaker_id)) next.completed.push(next.speaker_id);
        next.speaker_id = null;
      }
      if (action === 'next_stage') {
        if (next.stage === 5) return { ...next, state: 'finished' };
        next.stage++; next.completed = [];
        next.round_order = [...next.round_order.slice(1), next.round_order[0]];
      }
      const basic = next.round_order.find(id => !next.completed.includes(id));
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
  return <RoomView session={session} onSessionAction={previewSessionAction} theme={getLoungeTheme(params.get('theme')).id} hostId={host.id} topic={topic} capacity={capacity} messages={messages} members={demoMembers} speakers={demoPlaying && demoTurn > 0 && demoTurn <= demoMembers.length ? [demoMembers[demoTurn - 1].id] : []} aiSpeaking={demoPlaying && demoTurn === 0} pending={pending} status="active" remaining="60분 · 예시" preview micOn={false} connected={false} isHost error="" currentUserId="me" onAvatarChoice={async index => setAvatarIndex(index)} demoPlaying={demoPlaying} onDemoToggle={() => setDemoPlaying(value => !value)} onConnect={() => {}} onMic={() => {}} onAsk={() => reply(topic)} onStart={() => {}} onLeave={() => navigate('/lounge')} onSend={async text => { setMessages(previous => [...previous, { id: Date.now(), room_id: 'preview', user_id: 'me', nickname: '나', kind: 'human', text, created_at: new Date().toISOString() }]); reply(text); }} />;
}

function LoungeRoomPage({ roomId, user, onGuestRequest, onLoginRequest }: Props & { roomId: string }) {
  const navigate = useNavigate();
  const [room, setRoom] = useState<LoungeRoom | null>(null);
  const [session, setSession] = useState<LoungeSession | null>(null);
  const [members, setMembers] = useState<LoungeMember[]>([]);
  const [messages, setMessages] = useState<LoungeMessage[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [studying, setStudying] = useState(false);
  const [retry, setRetry] = useState(0);
  const [micPrepared, setMicPrepared] = useState(false);
  const [starting, setStarting] = useState(false);
  const autoConnectAttempted = useRef(false);
  const autoMicAttempted = useRef(false);
  const autoStartAttempted = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const lastActivity = useRef(0);
  const lastAttempt = useRef(0);
  const lastHostEnded = useRef(0);
  const inputReadyAt = useRef(0);
  const hostBlocked = useRef(false);
  const nextHostAttempt = useRef(0);
  const audioBlocked = useRef(false);
  const nextAudioAttempt = useRef(0);
  const transcribing = useRef(0);
  const hostRequest = useRef<AbortController | null>(null);
  const refreshAfterInput = useRef<() => Promise<void>>(async () => {});
  const isHost = room?.host_id === user?.id;
  const transcript = useCallback(async (blob: Blob, turnId?: string) => {
    if (!mounted.current || audioBlocked.current || Date.now() < nextAudioAttempt.current) return;
    transcribing.current += 1;
    const started = performance.now();
    try {
      const result = await transcribeLoungeAudio(roomId, blob, undefined, turnId);
      if (result.posted) { await refreshAfterInput.current(); inputReadyAt.current = Date.now(); }
      console.info('[Lounge latency]', { transcriptionMs: Math.round(performance.now() - started) });
    }
    catch (err) {
      if (err instanceof LoungeApiError) {
        audioBlocked.current = !err.retryable;
        nextAudioAttempt.current = Date.now() + err.retryAfterSeconds * 1000;
        if (!err.retryable) hostBlocked.current = true;
      }
      if (mounted.current) setError(errorText(err));
    }
    finally { transcribing.current -= 1; }
  }, [roomId]);
  const audio = useLoungeAudio(roomId, room?.host_id ?? '', transcript, room?.capacity, room?.guided_session ? { allowed: session?.speaker_id === user?.id && session?.state === 'speaking', speakerId: session?.state === 'speaking' ? session.speaker_id : null, turnId: session?.turn_id } : undefined);
  const current = useRef({ room, session, messages, audio, isHost });
  useEffect(() => { current.current = { room, session, messages, audio, isHost }; }, [room, session, messages, audio, isHost]);
  const applySession = useCallback((incoming: LoungeSession | null) => {
    const value = newerLoungeSession(current.current.session, incoming);
    current.current = { ...current.current, session: value }; setSession(value);
  }, []);
  const refreshAfterMessage = useCallback(async () => {
    const state = await loadLounge(roomId);
    if (!mounted.current) return;
    setRoom(state.room); applySession(state.session ?? null); setMembers(state.members); setMessages(state.messages);
    current.current = { ...current.current, room: state.room, messages: state.messages };
  }, [roomId, applySession]);
  useEffect(() => { refreshAfterInput.current = refreshAfterMessage; }, [refreshAfterMessage]);
  useEffect(() => { if (audio.speakers.length && !audio.aiSpeaking) lastActivity.current = Date.now(); }, [audio.speakers, audio.aiSpeaking]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; hostRequest.current?.abort(); };
  }, [roomId]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false, refreshing = false;
    const refresh = async () => {
      if (refreshing) return; refreshing = true;
      try { const state = await loadLounge(roomId); if (!cancelled) { setRoom(state.room); applySession(state.session ?? null); setMembers(state.members); setMessages(state.messages); } }
      catch (err) { if (!cancelled) setError(errorText(err)); }
      finally { refreshing = false; }
    };
    void joinLounge(roomId, user.nickname).then(refresh).catch(err => { if (!cancelled) setError(errorText(err)); });
    const interval = setInterval(() => { void refresh(); }, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [roomId, user, retry, applySession]);
  useEffect(() => {
    if (!audio.connected) return;
    void controlLounge(roomId, 'heartbeat').catch(err => setError(errorText(err)));
    const interval = setInterval(() => { void controlLounge(roomId, 'heartbeat').catch(err => setError(errorText(err))); }, 15_000);
    return () => clearInterval(interval);
  }, [audio.connected, roomId]);
  useEffect(() => { const interval = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(interval); }, []);
  const ended = room?.status === 'ended' || Boolean(room?.expires_at && Date.parse(room.expires_at) <= clock);
  const disconnectAudio = audio.disconnect;
  useEffect(() => { if (ended) disconnectAudio(); }, [ended, disconnectAudio]);
  useEffect(() => { if (ended || !audio.connected) hostRequest.current?.abort(); }, [ended, audio.connected]);
  const connectAudio = audio.connect;
  const prepareMicrophone = audio.startMicrophone;
  const readSpeechActivity = audio.getSpeechActivity;
  const sessionAction = useCallback(async (kind: LoungeSessionAction) => {
    const state = current.current;
    const value = await controlLoungeSession(roomId, kind, state.session?.turn_id);
    if (!mounted.current) return;
    applySession(value);
    await refreshAfterMessage();
  }, [roomId, refreshAfterMessage, applySession]);
  useEffect(() => {
    if (!room?.guided_session || room.status !== 'active' || !isHost) return;
    let running = false;
    const tick = async () => {
      if (running) return; running = true;
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

  const hostTurn = useCallback(async (reason: 'opening' | 'silence' | 'followup' | 'requested') => {
    const state = current.current;
    const speech = state.audio.getSpeechActivity();
    if (busy.current || transcribing.current || !state.isHost || !state.audio.connected || !state.audio.audioReady || state.room?.status !== 'active' || state.audio.aiSpeaking || state.audio.speakers.length || speech.recording) return;
    if (state.room.capacity === 1 && (Date.now() - Math.max(lastActivity.current, speech.lastVoiceAt) < 2000 || Date.now() - inputReadyAt.current < 1000 || Date.now() - lastHostEnded.current < 3000)) return;
    if (state.room.guided_session && state.session?.state !== 'ready') return;
    if (Date.now() - lastAttempt.current < (state.room.guided_session ? 5000 : loungeHostCooldownMs(state.room.capacity))) return;
    if (reason !== 'requested' && (hostBlocked.current || Date.now() < nextHostAttempt.current)) return;
    if (reason === 'requested') { hostBlocked.current = false; audioBlocked.current = false; }
    busy.current = true; lastAttempt.current = Date.now(); setPending(true);
    const controller = new AbortController(); hostRequest.current = controller;
    const started = performance.now();
    let spoke = false;
    try {
      if (state.room.study_required && !state.room.topic_study) {
        setStudying(true);
        const prepared = await prepareLoungeTopic(roomId, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setStudying(false);
        if (!prepared.study) return;
        setRoom(previous => previous ? { ...previous, topic_study: prepared.study } : previous);
        await refreshAfterMessage();
        const latest = current.current, activity = latest.audio.getSpeechActivity();
        if (latest.audio.speakers.length || activity.recording || latest.room?.status !== 'active' || (latest.room.capacity === 1 && Date.now() - Math.max(lastActivity.current, activity.lastVoiceAt) < 2000)) return;
      }
      const response = await requestLoungeHost(roomId, reason, controller.signal);
      if (!mounted.current || controller.signal.aborted) { await response.stream?.cancel(); return; }
      if (!response.skipped) setError('');
      if (response.stream) {
        if (current.current.audio.speakers.length || current.current.room?.status !== 'active' || (state.room.guided_session && (current.current.session?.turn_id !== state.session?.turn_id || current.current.session?.state !== 'ready'))) { await response.stream.cancel(); return; }
        let timings: Record<string, number> = {};
        await current.current.audio.playHostStream(response.stream, () => {
          spoke = true;
          if (mounted.current) setPending(false);
          console.info('[Lounge latency]', { ...timings, firstAudioMs: Math.round(performance.now() - started) });
        }, value => { timings = value; }, () => {
          const latest = current.current, activity = latest.audio.getSpeechActivity();
          return !controller.signal.aborted && !latest.audio.speakers.length && !activity.recording && latest.room?.status === 'active' && (!latest.room.guided_session || (latest.session?.turn_id === state.session?.turn_id && latest.session?.state === 'ready')) && (latest.room.capacity !== 1 || Date.now() - Math.max(lastActivity.current, activity.lastVoiceAt) >= 2000);
        });
        if (mounted.current) await refreshAfterMessage();
      }
      if (response.audioError) setError('사회자 음성을 준비하지 못했어요. 글로 대화를 이어갈게요.');
      if (response.audio && !current.current.audio.speakers.length && current.current.room?.status === 'active') { spoke = true; await current.current.audio.playHost(response.audio); }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof LoungeApiError) {
        hostBlocked.current = !err.retryable;
        nextHostAttempt.current = Date.now() + Math.max(30, err.retryAfterSeconds) * 1000;
      }
      if (mounted.current) setError(errorText(err));
    }
    finally { if (spoke) lastHostEnded.current = Date.now(); if (hostRequest.current === controller) hostRequest.current = null; busy.current = false; if (mounted.current) { setPending(false); setStudying(false); } }
  }, [roomId, refreshAfterMessage]);
  useEffect(() => {
    const interval = setInterval(() => {
      const state = current.current;
      const speech = state.audio.getSpeechActivity();
      if (!state.isHost || !state.room || !state.audio.connected || !state.audio.audioReady || !micPrepared || speech.recording || state.audio.participants.length < loungeMinimumParticipants(state.room.capacity) || state.audio.aiSpeaking || state.audio.speakers.length) return;
      if (state.room.guided_session) {
        if (state.session?.state === 'ready' && state.session.announced_turn !== state.session.turn_id) void hostTurn('opening');
        return;
      }
      const reason = nextLoungeHostReason(state.room, state.messages, Date.now(), Math.max(lastActivity.current, speech.lastVoiceAt), lastAttempt.current, lastHostEnded.current, inputReadyAt.current);
      if (reason) void hostTurn(reason);
    }, room?.capacity === 1 || room?.guided_session ? 500 : 3000);
    return () => clearInterval(interval);
  }, [hostTurn, room?.capacity, room?.guided_session, micPrepared]);
  const action = async (kind: 'start' | 'leave') => {
    try { setError(''); await controlLounge(roomId, kind); if (kind === 'leave') { audio.disconnect(); navigate('/lounge'); } else { const state = await loadLounge(roomId); setRoom(state.room); } }
    catch (err) { setError(errorText(err)); }
  };
  if (!user) return <main className="lounge-join-gate"><span>☕</span><h1>친구들과 가볍게 이야기해요.</h1><p>이름을 준비하고 수다방에 들어갈게요.</p><button className="lounge-primary" type="button" onClick={() => { void onGuestRequest().catch(err => setError(errorText(err))); }}>게스트로 참여하기 <ArrowRight size={17} /></button><button className="lounge-preview-button" type="button" onClick={onLoginRequest}>로그인해서 참여하기</button>{error && <p className="lounge-error" role="alert">{error}</p>}</main>;
  if (!room) return <main className="lounge-join-gate"><Coffee size={42} /><h1>{error ? '수다방을 확인해 주세요' : '친구들의 자리를 준비해요…'}</h1>{error && <><p className="lounge-error" role="alert">{error}</p><button type="button" className="lounge-preview-button" onClick={() => { setError(''); setRetry(value => value + 1); }}><RefreshCw size={16} /> 다시 확인하기</button><Link to="/lounge">라운지로 돌아가기</Link></>}</main>;
  const remaining = room.expires_at ? Math.max(0, Math.ceil((Date.parse(room.expires_at) - clock) / 1000)) : 3600;
  const seats = audio.participants.map(participant => ({ ...participant, name: members.find(member => member.user_id === participant.id)?.nickname ?? participant.name }));
  return <RoomView session={session} sessionNames={Object.fromEntries(members.map(member => [member.user_id, member.nickname]))} onSessionAction={sessionAction} study={room.topic_study} studying={studying} theme={room.theme} hostId={room.host_persona} liveHostText={audio.hostText} currentUserId={user.id} onAvatarChoice={audio.connected ? audio.chooseAvatar : undefined} topic={room.topic} capacity={room.capacity} messages={messages} members={seats} speakers={audio.speakers} aiSpeaking={audio.aiSpeaking} pending={pending} status={ended ? 'ended' : room.status} remaining={room.guided_session ? `약 30분 · ${Math.max(0, Math.floor((clock - Date.parse(room.started_at || new Date(clock).toISOString())) / 60000))}분 함께` : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`} micOn={audio.micOn} connected={audio.connected} connecting={audio.connecting} audioReady={audio.audioReady} starting={starting || (audio.connected && audio.audioReady && !micPrepared)} isHost={isHost} error={error || audio.error} onConnect={() => { if (!audio.connected) void audio.connect(); else if (!audio.audioReady) audio.enableAudio(); else void action('start'); }} onMic={() => { if (audio.micOn) audio.stopMicrophone(); else void audio.startMicrophone(); }} onAsk={() => void hostTurn('requested')} onStart={() => void action('start')} onLeave={() => { if (isHost && !ended && !window.confirm(room.capacity === 1 ? 'AI와의 대화를 마칠까요?' : '나가면 모두의 수다방이 종료돼요. 대화를 마칠까요?')) return; void action('leave'); }} onSend={async text => { await postLoungeMessage(roomId, text); inputReadyAt.current = Date.now(); await refreshAfterMessage(); }} inviteUrl={`${window.location.origin}/lounge/${roomId}`} />;
}
