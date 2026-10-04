import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Coffee, Copy, Hand, Headphones, LoaderCircle, LogOut, MessageCircle, Mic, MicOff, Pause, Play, RefreshCw, Sparkles, UserRound, Users, X } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { AppUser } from '../types';
import { getCurrentUser } from '../lib/auth';
import { getLoungeHost, getLoungeTheme, getLoungeTopic, loungeThemes, loungeTopics, normalizeLoungeTopicBrief, loungeMinimumParticipants, loungeHostCooldownMs, nextLoungeHostReason, previewHostReply, type LoungeTopicBrief, type LoungeHostId, type LoungeThemeId, type LoungeMember, type LoungeMessage, type LoungeRoom, type LoungeTopicStudy } from '../lib/lounge';
import { LoungeApiError, controlLounge, controlLoungeSession, createLounge, joinLounge, loadLounge, prepareLoungeTopic, requestLoungeHost, requestLoungeModerator, transcribeLoungeAudio, reviewLoungeInteraction, syncLoungeSafety, releaseLoungeRestriction } from '../lib/loungeApi';
import { restrictedLoungeMembers } from '../lib/loungeInteraction';
import { isLoungeFreeStage, loungeStageNeedsOpening, newerLoungeSession, type LoungeSession, type LoungeSessionAction } from '../lib/loungeSession';
import { LoungeSessionPanel } from './LoungeSessionPanel';
import { LoungeOpenRooms } from './LoungeOpenRooms';
import { LoungeHostOptions } from './LoungeHostOptions';
import { LoungeHostPortrait } from './LoungeHostPortrait';
import { ProfileModal } from './ProfileModal';
import { LoungeIntroduction } from './LoungeIntroduction';
import { useLoungeAudio } from '../lib/useLoungeAudio';
import './LoungePage.css';
import './LoungeRoom.css';

type Props = { user: AppUser | null; onGuestRequest: () => Promise<void>; onLoginRequest: () => void; onSignupRequest?: () => void; onUserUpdate?: (user: AppUser) => void; onLogout?: () => Promise<void> };
const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
function LoungeHeader({ user, inRoom, introduction, onLoginRequest, onSignupRequest, onProfileRequest, onLogout, loggingOut }: Props & { inRoom: boolean; introduction: boolean; onProfileRequest: () => void; loggingOut: boolean }) {
  return <header className="lounge-header">
    {inRoom && <Link to="/lounge" className="lounge-back"><ArrowLeft size={17} /> 라운지</Link>}
    <Link to="/lounge" className="lounge-brand"><Coffee size={23} /><strong>대화 라운지<span>CONVERSATIONS & CONNECTIONS</span></strong></Link>
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
  const { roomId } = useParams();
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
  return <><div className={`lounge-page ${inRoom ? 'has-room' : introduction ? 'has-introduction' : ''}`}><LoungeHeader {...props} inRoom={inRoom} introduction={introduction} onProfileRequest={() => setShowProfile(true)} onLogout={props.onLogout ? logout : undefined} loggingOut={loggingOut} />{accountError && <p className="lounge-account-error" role="alert">{accountError}</p>}{introduction ? <LoungeIntroduction /> : roomId === 'preview' ? <LoungePreview /> : roomId ? <LoungeRoomPage key={roomId} roomId={roomId} {...props} /> : <LoungeLobby {...props} />}</div>{showProfile && !inRoom && props.user && !props.user.isAnonymous && props.onUserUpdate && <ProfileModal key={props.user.id} user={props.user} onClose={() => setShowProfile(false)} onProfileUpdated={props.onUserUpdate} serviceName="대화 라운지" />}</>;
}

function LoungeLobby({ user, onGuestRequest, onLoginRequest }: Props) {
  const navigate = useNavigate();
  const [hostId, setHostId] = useState<LoungeHostId>('jaeseok');
  const [themeId, setThemeId] = useState<LoungeThemeId>('rooftop');
  const [topicId, setTopicId] = useState<string>('media');
  const [brief, setBrief] = useState<LoungeTopicBrief>({ category: 'media', subcategory: 'film', work_title: '', creator: '', reason: '', discussion: '' });
  const [capacity, setCapacity] = useState(4);
  const [customTopic, setCustomTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const topicInput = useRef<HTMLInputElement>(null);
  const topic = loungeTopics.find(item => item.id === topicId) ?? loungeTopics[0];
  const title = customTopic.trim();
  const topicExamples: Record<string, string> = { media: '예: 데미안을 읽고 생각한 나다운 삶', hobby: '예: 제주에서 만난 풍경과 기억에 남은 한 끼', love: '예: 연인과 갈등이 생겼을 때 대화하는 방법', career: '예: 이직과 현재 직장 사이에서 고민하는 기준', finance: '예: 처음 시작하는 장기 투자와 나만의 원칙', education: '예: 아이의 독서 습관과 부모가 도울 수 있는 방법' };
  let briefReady = false;
  try { normalizeLoungeTopicBrief(brief); briefReady = true; } catch { /* Show field guidance until the brief is complete. */ }
  const host = getLoungeHost(hostId);
  const openRoom = async () => {
    if (busy) return;
    if (!title) { setError('대화할 주제를 직접 입력해 주세요.'); topicInput.current?.focus(); return; }
    setBusy(true); setError('');
    try {
      const topicBrief = normalizeLoungeTopicBrief(brief);
      if (!user) await onGuestRequest();
      const current = user ?? await getCurrentUser();
      if (!current) throw new Error('로그인 후 다시 시작해 주세요.');
      const id = await createLounge(hostId, title, capacity, current.nickname, themeId, topicBrief);
      navigate(`/lounge/${id}`);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };
  const themeOptions = <section className="lounge-section">
    <div className="lounge-section-title"><div><span>03 · YOUR VIEW</span><h2>어떤 장소에서 대화할까요?</h2></div><p>함께 들어오는 사람도 같은 뷰를 즐겨요.</p></div>
    <div className="lounge-theme-options" role="group" aria-label="라운지 테마">
      {loungeThemes.map(item => <button type="button" key={item.id} onClick={() => setThemeId(item.id)} aria-pressed={themeId === item.id}>
        <img src={item.image} alt="" loading="lazy" /><span><strong>{item.name}</strong><small>{item.subtitle}</small></span>{themeId === item.id && <i><Check size={15} /></i>}
      </button>)}
    </div>
  </section>;
  return <main className="lounge-lobby">
    <section className="lounge-hero">
      <div className="lounge-hero-copy"><span className="lounge-eyebrow"><span /> GOOD CONVERSATIONS, NEW CONNECTIONS</span><h1>문득 사람과의 대화가 하고 싶은 순간이 찾아올 때...</h1><p>좋아하는 영화, 걷다 만난 풍경, 기억에 남는 맛집.<br />목소리와 취향으로, 이야기할수록 서로를 알아가는 라운지.</p><div className="lounge-hero-meta"><span><Users size={16} /> 혼자 또는 친구와 1~6명</span><span><Headphones size={16} /> 실시간 음성</span><span><Coffee size={16} /> 그룹 대화 약 30분</span></div></div>
      <div className="lounge-hero-visual" aria-hidden="true"><img src="/lounge/lounge-club-hero-v1.webp" alt="" fetchPriority="high" /></div>
    </section>
    <LoungeOpenRooms />
    <div className="lounge-lobby-layout" id="lounge-create"><div className="lounge-selections">
      <section className="lounge-section"><div className="lounge-section-title"><div><span>01 · TALK ABOUT</span><h2>무슨 이야기로 시작할까요?</h2></div><span className="lounge-soft-label">대화는 어디로 흘러가도 OK</span></div><div className="lounge-topic-options">{loungeTopics.map(item => <button type="button" key={item.id} onClick={() => { setTopicId(item.id); setBrief(value => ({ ...value, category: item.id, subcategory: item.subtopics[0].id, work_title: '', creator: '' })); if (error) setError(''); }} className={topicId === item.id ? 'selected' : ''} aria-pressed={topicId === item.id}><span>{item.emoji}</span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div>{topicId === item.id && <Check size={16} />}</button>)}</div>{topic.description && <p className="lounge-topic-category-description">{topic.description}</p>}<label className="lounge-topic-required-label" htmlFor="lounge-topic-input">오늘 함께 이야기할 주제 <span>필수 입력</span></label><label className="lounge-custom-topic" htmlFor="lounge-topic-input"><MessageCircle size={18} /><input id="lounge-topic-input" ref={topicInput} value={customTopic} onChange={event => { setCustomTopic(event.target.value); if (error) setError(''); }} maxLength={160} required placeholder={topicExamples[topic.id]} aria-label="직접 입력하는 대화 주제" aria-describedby="lounge-topic-help" /></label><p className="lounge-topic-help" id="lounge-topic-help">참가자가 보고 들어올 대화방 제목이에요. 나누고 싶은 주제를 직접 적어 주세요.</p><LoungeTopicFields brief={brief} onChange={value => { setBrief(value); if (error) setError(''); }} /></section>
      <p className="lounge-study-hint">작품 정보와 방을 만든 이유를 바탕으로 사회자가 자료와 대화 질문을 준비해요. 참가자도 방 소개를 읽고 함께할 수 있어요.</p>
      <section className="lounge-section lounge-style-section"><div className="lounge-section-title"><div><span>02 · CONVERSATION STYLE</span><h2>어떤 분위기의 사회자와 이야기할까요?</h2></div><p>진행 스타일에 따라 질문과 반응이 달라요.</p></div><LoungeHostOptions selected={hostId} onSelect={setHostId} /><p className="lounge-persona-note">AI로 만든 가상의 인물 사진과 합성 음성입니다. 먼저 목소리를 들어 보고 진행 스타일을 골라 주세요.</p></section>
      {themeOptions}
    </div><aside className="lounge-room-builder"><span className="lounge-eyebrow">MAKE SOME ROOM</span><h2>{capacity === 1 ? '사회자와 둘이서' : '우리의 작은 대화방'}</h2><div className="lounge-builder-host"><LoungeHostPortrait hostId={hostId} /><div><small>오늘의 진행 스타일</small><strong>{host.name}</strong></div><Sparkles size={19} /></div><p className={`lounge-builder-topic ${title ? '' : 'needs-topic'}`}>{title ? `“${title}”` : '대화할 주제를 직접 입력해 주세요'}</p><p className="lounge-builder-theme"><Coffee size={14} />{getLoungeTheme(themeId).name}</p><label className="lounge-capacity-label" htmlFor="lounge-capacity">함께할 인원 <small>AI 호스트는 별도예요</small></label><div className="lounge-capacities" id="lounge-capacity" role="group" aria-label="참여 인원">{[1, 2, 3, 4, 5, 6].map(count => <button type="button" key={count} className={capacity === count ? 'selected' : ''} onClick={() => setCapacity(count)} aria-pressed={capacity === count}>{count === 1 ? '혼자' : `${count}명`}</button>)}</div><div className="lounge-builder-rules"><span><Check size={15} /> {capacity === 1 ? 'AI 사회자와 편안한 1:1 대화' : '열린 대화방에서 함께 이야기'}</span><span><Check size={15} /> {capacity === 1 ? '이야기를 이어 주는 AI 사회자' : '기본 차례 · 손들기 · 자유로운 패스'}</span><span><Check size={15} /> 점수도, 정답도 없는 대화</span></div><button type="button" className="lounge-primary" disabled={busy || !title || !briefReady} aria-describedby={!title || !briefReady ? 'lounge-topic-required-hint' : undefined} onClick={() => void openRoom()}>{busy ? <LoaderCircle size={18} className="lounge-spin" /> : <Mic size={18} />}{busy ? '대화방 준비 중…' : capacity === 1 ? 'AI와 1:1 대화 시작' : '대화방 만들기'}<ArrowRight size={18} /></button>{(!title || !briefReady) && <p className="lounge-topic-required-hint" id="lounge-topic-required-hint">주제와 필수 방 소개를 작성하면 대화방을 만들 수 있어요. 분위기 미리보기는 주제만 입력해도 가능해요.</p>}<button type="button" className="lounge-preview-button" disabled={!title || busy} onClick={() => navigate(`/lounge/preview?host=${hostId}&topic=${encodeURIComponent(title)}&capacity=${capacity}&theme=${themeId}`)}>먼저 분위기 둘러보기 <ArrowRight size={15} /></button><p className="lounge-builder-footnote">{capacity === 1 ? '입장하면 음성과 마이크를 연결하고 시작해요.' : '2명이 모이면 약 30분의 이야기를 시작해요.'}<br />테스트 기간에는 방장이 나가면 종료됩니다.</p>{!user && <button type="button" className="lounge-signin" onClick={onLoginRequest}>계정으로 로그인하기</button>}</aside></div>
    {error && <p className="lounge-error" role="alert">{error}</p>}
    <footer className="lounge-footer"><span>조금 말하고, 많이 웃고. 오늘의 여유를 여기서.</span><span>대화 라운지 · 테스트 오픈</span></footer>
  </main>;
}

type RoomViewProps = { topicBrief?: LoungeTopicBrief | null; now?: number; onReleaseRestriction?: (userId: string) => Promise<void>; guidedSession?: boolean; session?: LoungeSession | null; sessionNames?: Record<string, string>; onSessionAction?: (action: LoungeSessionAction) => Promise<void>; study?: LoungeTopicStudy | null; studying?: boolean; theme?: LoungeThemeId; liveHostText?: string; hostId: LoungeHostId; topic: string; capacity: number; messages: LoungeMessage[]; members: Array<{ id: string; name: string; muted: boolean; warnings?: number; restrictedUntil?: string | null; avatarIndex?: number; avatarUrl?: string }>; speakers: string[]; aiSpeaking: boolean; pending: boolean; status: string; remaining: string; preview?: boolean; micOn: boolean; connected: boolean; connecting?: boolean; audioReady?: boolean; starting?: boolean; isHost: boolean; error: string; onConnect: () => void; onMic: () => void; onAsk: () => void; onStart: () => void; onLeave: () => void; inviteUrl?: string; currentUserId?: string; onAvatarChoice?: (index: number) => Promise<void>; demoPlaying?: boolean; onDemoToggle?: () => void };

function LoungeTopicFields({ brief, onChange }: { brief: LoungeTopicBrief; onChange: (value: LoungeTopicBrief) => void }) {
  const media = brief.category === 'media';
  const book = brief.subcategory === 'book';
  const update = (key: keyof LoungeTopicBrief, value: string) => onChange({ ...brief, [key]: value });
  const examples: Record<string, [string, string]> = {
    media: ['어떤 계기로 이 작품을 골랐나요? 마음에 남은 지점을 소개해 주세요.', '인물의 선택, 저자의 생각, 서로 달랐던 감상 등 어떤 이야기를 나누고 싶나요?'],
    hobby: ['어디에서 어떤 경험을 했나요? 여행지·지역·취미 등 배경을 알려 주세요.', '추천하고 싶은 경험, 아쉬웠던 점, 각자의 취향 중 무엇을 나누고 싶나요?'],
    love: ['어떤 관계나 상황에서 떠오른 고민인가요? 공개해도 괜찮은 만큼만 적어 주세요.', '서로 이해하고 싶은 점이나 듣고 싶은 다른 경험을 적어 주세요.'],
    career: ['현재 어떤 일·진로 상황에서 이 주제를 떠올렸나요?', '선택의 기준, 경험, 고민 중 함께 이야기하고 싶은 부분을 적어 주세요.'],
    finance: ['어떤 경제 흐름이나 자산 관리 경험이 궁금했나요?', '알아보고 싶은 개념, 서로 비교할 관점이나 투자 원칙을 적어 주세요.'],
    education: ['아이의 연령대나 교육 단계, 어떤 경험에서 이 고민이 생겼는지 적어 주세요. 이름이나 학교 등 개인 정보는 빼 주세요.', '양육, 부모와의 대화, 학습 습관 등 함께 나누고 싶은 경험과 궁금한 점을 적어 주세요.'],
  };
  return <div className="lounge-topic-fields">
    {media && <div className="lounge-work-fields">
      <div className="lounge-work-type"><span id="lounge-work-type-label">작품 종류</span><div className="lounge-media-toggle" role="group" aria-labelledby="lounge-work-type-label">{[{ id: 'film', title: '영화' }, { id: 'book', title: '책' }].map(item => <button type="button" key={item.id} aria-pressed={brief.subcategory === item.id} onClick={() => onChange({ ...brief, subcategory: item.id, work_title: '', creator: '' })}>{item.title}</button>)}</div></div>
      <label htmlFor="lounge-work-title">{book ? '책 제목' : '작품명'} <span>필수</span><input id="lounge-work-title" required value={brief.work_title} onChange={event => update('work_title', event.target.value)} maxLength={160} placeholder={book ? '예: 데미안' : '영화의 정확한 제목'} /></label>
      <label htmlFor="lounge-creator">{book ? '저자' : '감독'} <span>필수</span><input id="lounge-creator" required value={brief.creator} onChange={event => update('creator', event.target.value)} maxLength={100} placeholder={book ? '예: 헤르만 헤세' : '감독 이름'} /></label>
    </div>}
    <label htmlFor="lounge-topic-reason">{media ? '이 작품을 고른 이유 · 방을 만든 계기' : '방을 만든 이유 · 배경 설명'} <span>필수</span></label>
    <textarea id="lounge-topic-reason" required rows={3} maxLength={600} value={brief.reason} onChange={event => update('reason', event.target.value)} placeholder={examples[brief.category][0]} aria-describedby="lounge-brief-public-help" />
    <label htmlFor="lounge-topic-discussion">함께 나누고 싶은 이야기 <span>필수</span></label>
    <textarea id="lounge-topic-discussion" required rows={3} maxLength={600} value={brief.discussion} onChange={event => update('discussion', event.target.value)} placeholder={examples[brief.category][1]} aria-describedby="lounge-brief-public-help" />
    <p className="lounge-topic-help" id="lounge-brief-public-help">방 소개는 참가자와 AI 사회자에게 전달돼요. 그룹 대화방은 로그인 전 목록에도 공개되니, 실명이나 연락처 등 개인 정보는 빼 주세요.</p>
    {media && <p className="lounge-topic-help">감상 후기를 나누는 공간이에요. 결말과 반전까지 편하게 이야기해요.</p>}
  </div>;
}

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
function RoomView(props: RoomViewProps) {
  const host = getLoungeHost(props.hostId);
  const theme = getLoungeTheme(props.theme);
  const [sendError, setSendError] = useState('');
  const [copied, setCopied] = useState(false);
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [choosingAvatar, setChoosingAvatar] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const journalId = useId();
  const roomElement = useRef<HTMLElement>(null);
  const journalPanel = useRef<HTMLElement>(null);
  const journalToggle = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const ownSafety = props.members.find(member => member.id === props.currentUserId);
  const restricted = Date.parse(ownSafety?.restrictedUntil ?? '') > (props.now ?? 0);
  const latestHost = props.messages.filter(message => message.kind === 'host').at(-1);
  const participantMessages = props.messages.filter(message => message.kind === 'human').slice(-12);
  const participantLog = useRef<HTMLDivElement>(null);
  const followParticipantLog = useRef(true);
  const latestParticipantMessageId = participantMessages.at(-1)?.id;
  useEffect(() => {
    const element = participantLog.current;
    if (element && followParticipantLog.current) element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });
  }, [latestParticipantMessageId]);
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
  const microphoneControl = <button type="button" className={`lounge-mic-button ${props.micOn ? 'on' : ''}`} onClick={props.onMic} aria-pressed={props.micOn} title={restricted ? '발언 제한이 해제되면 마이크를 켤 수 있어요' : props.preview ? '마이크는 실제 방에서 사용할 수 있어요' : undefined} disabled={restricted || props.preview || ended || !props.connected || !props.audioReady}>{props.micOn ? <Mic size={16} /> : <MicOff size={16} />}{props.micOn ? '마이크 끄기' : '마이크 켜기'}</button>;
  const needsConnection = !props.preview && !ended && (!props.connected || !props.audioReady || (solo && props.status === 'lobby'));
  const liveSpeakers = ended || props.status === 'lobby' ? [] : props.members.filter(member => props.speakers.includes(member.id));
  const hostSpeaking = props.aiSpeaking && !ended;
  const speakingLabel = hostSpeaking ? `${host.name} · 사회자가 이야기하고 있어요` : liveSpeakers.length ? `${liveSpeakers.map(member => member.id === props.currentUserId ? '나' : member.name).join(', ')} · 이야기하는 중` : props.studying ? '사회자가 주제 자료를 찾아보고 질문을 준비해요' : props.pending ? '사회자가 다음 이야기를 준비해요' : ended ? '오늘의 대화가 끝났어요' : '잠깐의 여유, 편하게 말을 건네 보세요';
  const pickAvatar = async (index: number) => {
    if (choosingAvatar || !props.onAvatarChoice) return;
    setChoosingAvatar(true);
    try { await props.onAvatarChoice(index); setAvatarPicker(false); } catch (err) { setSendError(errorText(err)); } finally { setChoosingAvatar(false); }
  };
  const closeJournal = () => { setJournalOpen(false); journalToggle.current?.focus(); };
  const toggleJournal = (button: HTMLButtonElement) => {
    journalToggle.current = button;
    if (journalOpen) closeJournal();
    else setJournalOpen(true);
  };
  const sessionProps = props.session && props.currentUserId && props.onSessionAction ? {
    session: props.session, userId: props.currentUserId,
    names: props.sessionNames ?? Object.fromEntries(props.members.map(member => [member.id, member.name])),
    questions: props.study?.questions, topicBrief: props.topicBrief, isHost: props.isHost,
    blocked: props.pending || props.aiSpeaking || restricted, restricted, onAction: props.onSessionAction,
  } : null;
  return <main className="lounge-room-main" data-theme={theme.id} ref={roomElement}>
    {restricted ? <p className="lounge-safety-notice" role="status">대화 보호를 위해 잠시 발언이 제한됐어요. 약 {Math.max(1, Math.ceil((Date.parse(ownSafety!.restrictedUntil!) - (props.now ?? 0)) / 1000))}초 뒤 다시 말할 수 있어요. 다른 분의 이야기는 계속 들을 수 있어요. 오판이라고 생각되면 방장에게 해제를 요청해 주세요.</p> : Boolean(ownSafety?.warnings) && <p className="lounge-safety-notice" role="status">{ownSafety?.warnings === 1 ? '인신공격 1차 경고: 2차 인신공격부터 발언권이 제한됩니다.' : '추가 인신공격이 감지되면 발언권이 다시 제한됩니다.'} 수위가 심한 발언은 경고 없이 즉시 제한됩니다. 서로 존중하며 이야기해 주세요.</p>}
    {props.preview && <div className="lounge-preview-notice"><Sparkles size={17} /><span>실제 참가자·AI 연결 없이 분위기를 둘러보는 화면이에요. 손들기와 대화 순서도 미리 살펴보세요.</span><Link to="/lounge">실제 방 만들기 <ArrowRight size={14} /></Link></div>}
    <div className="lounge-conversation-layout"><section className="lounge-stage" aria-label="풍경 위에서 함께하는 대화">
      <div className={`lounge-scene scene-${props.capacity}`}>
        <div className="lounge-scene-heading">
          <div className="lounge-room-topline"><div><span className={`lounge-room-status ${props.preview ? 'preview' : ''}`}><span />{props.preview ? '화면 미리보기' : ended ? '오늘의 대화 끝' : props.status === 'lobby' ? solo ? 'AI와 1:1 대화 준비' : '친구를 기다리는 중' : '우리 지금 이야기 중'}</span><h1>{theme.name}</h1></div><div className="lounge-room-top-actions"><span><Coffee size={16} /> {props.remaining}</span>
            {needsConnection && <button type="button" className="lounge-connect-button" onClick={props.onConnect} disabled={props.connecting || (props.connected && props.audioReady && props.starting)}>{props.connecting || props.starting ? <LoaderCircle size={14} className="lounge-spin" /> : <Headphones size={14} />}{props.connecting ? '연결 중…' : !props.connected ? '연결 재시도' : !props.audioReady ? '소리 켜기' : props.starting ? '준비 중…' : '대화 다시 시작'}</button>}
            {props.status === 'lobby' && props.isHost && !solo && <button type="button" className="lounge-start-button" onClick={props.onStart} disabled={props.starting || props.members.length < loungeMinimumParticipants(props.capacity) || !props.connected || !props.audioReady}>{props.starting ? <LoaderCircle size={14} className="lounge-spin" /> : <Play size={14} />}함께 시작하기</button>}
            <button type="button" ref={journalToggle} className="lounge-journal-toggle" aria-expanded={journalOpen} aria-controls={journalId} onClick={event => toggleJournal(event.currentTarget)}><MessageCircle size={16} /> 대화 기록</button>{props.inviteUrl && !solo && <button type="button" onClick={() => { void navigator.clipboard.writeText(props.inviteUrl!).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => setSendError('주소창의 링크를 복사해 친구에게 보내 주세요.')); }}><Copy size={16} />{copied ? '복사했어요!' : '친구 초대'}</button>}<button type="button" onClick={props.onLeave}><X size={18} /> 나가기</button></div></div>
          <div className="lounge-table-topic"><span>오늘의 이야기</span><h2>{props.topic}</h2></div>
        </div>
        <div className="lounge-conversation-space">
          <div className="lounge-host-column">
            <div className={`lounge-moderator ${hostSpeaking ? 'speaking' : ''}`}><span className="lounge-moderator-avatar"><LoungeHostPortrait hostId={props.hostId} /><b>AI</b></span><div className="lounge-moderator-info"><h2>{host.name}</h2><span className="lounge-moderator-caption">{hostSpeaking ? '사회자 · 이야기하는 중' : props.pending ? '사회자 · 이야기를 생각하는 중…' : solo ? '대화 상대 · 이야기를 이어 드려요' : '사회자 · 필요할 때 불러 주세요'}</span></div><VoiceWave active={hostSpeaking} /><div className="lounge-host-bubble">{props.status === 'lobby' ? solo ? '오늘은 둘이 편하게 이야기해요. 음성과 마이크를 준비하고 있어요.' : '친구에게 초대 링크를 보내 주세요. 두 명 이상 음성으로 연결되면 가볍게 인사부터 나눠요.' : ended ? '함께 이야기해 줘서 고마워요. 오늘 남은 시간도 편안하길 바라요.' : props.liveHostText || latestHost?.text || host.greeting}</div></div>
            <div className="lounge-guidance">{props.topicBrief && <LoungeTopicDescription brief={props.topicBrief} />}{props.study && <LoungeStudyNotes study={props.study} />}
            {sessionProps && <LoungeSessionPanel {...sessionProps} mode="context" />}</div>
          </div>
          <div className="lounge-place-view" aria-hidden="true"><div className="lounge-scene-intro"><span>{theme.tag}</span><p>{theme.caption}</p><div className="lounge-stage-label"><Headphones size={15} /> 함께 머무는 대화석 <span>{solo ? 'AI와 1:1' : `${props.members.length} / ${props.capacity}명`}</span></div></div></div>
          <aside className="lounge-participant-panel" aria-label="함께하는 참가자">
            <div className="lounge-participant-roster">
            <div className="lounge-participant-heading"><Users size={15} /><span>함께하는 사람들</span><b>{props.members.length} / {props.capacity}</b></div>
            <div className={`lounge-seats seats-${props.capacity}`}>{Array.from({ length: props.capacity }, (_, index) => {
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
            {props.onAvatarChoice && <div className="lounge-avatar-settings"><button type="button" className="lounge-avatar-toggle" onClick={() => setAvatarPicker(value => !value)} aria-expanded={avatarPicker} disabled={ended}>내 아바타 고르기 <Sparkles size={13} /></button>{avatarPicker && <div className="lounge-avatar-picker"><p>오늘의 나를 표현할 아바타를 골라 주세요.</p><div role="group" aria-label="캐리커처 아바타 선택">{Array.from({ length: 6 }, (_, index) => <button key={index} type="button" disabled={choosingAvatar} onClick={() => void pickAvatar(index)} aria-label={`아바타 ${index + 1} 선택`} aria-pressed={props.members.find(member => member.id === props.currentUserId)?.avatarIndex === index}><LoungePortrait index={index} name={`아바타 ${index + 1}`} /></button>)}</div><small>기본 캐릭터예요. 내 사진으로 만든 아바타는 홈의 프로필에서 관리할 수 있어요.</small></div>}</div>}
            </div>
            <section className="lounge-participant-speech" aria-label="참가자들의 발언">
              <h2><MessageCircle size={14} />나누는 이야기</h2>
              <div className="lounge-participant-log" ref={participantLog} role="log" aria-label="나와 참가자의 최근 발언" onScroll={event => { const element = event.currentTarget; followParticipantLog.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48; }}>
                {participantMessages.length ? participantMessages.map(message => <article key={message.id} className={message.user_id === props.currentUserId ? 'self' : ''}><strong>{message.user_id === props.currentUserId ? '나' : message.nickname}</strong><p>{message.text}</p></article>) : <p className="lounge-participant-empty">이야기한 내용이 여기에 남아요.</p>}
              </div>
            </section>
        <div className="lounge-participant-controls">
          <div className="lounge-voice-controls"><div className="lounge-on-air" role="status"><VoiceWave active={hostSpeaking || liveSpeakers.length > 0} /><span>{speakingLabel}</span>{props.preview && <button type="button" onClick={props.onDemoToggle} aria-label={props.demoPlaying ? '발언 효과 미리보기 일시정지' : '발언 효과 미리보기 재생'}>{props.demoPlaying ? <Pause size={13} /> : <Play size={13} />} 발언 효과 예시</button>}</div><div className="lounge-room-controls">
            {!sessionProps && (solo || ended) && microphoneControl}
        {props.status !== 'lobby' && <button type="button" className="lounge-ask-button" onClick={props.onAsk} disabled={props.pending || props.aiSpeaking || ended || restricted || (!props.preview && (props.status !== 'active' || !props.connected || !props.audioReady))}><Sparkles size={17} />{solo ? '화제 하나 던져줘' : '사회자에게 도움 요청'}</button>}
        </div>{sessionProps ? <LoungeSessionPanel {...sessionProps} mode="controls" microphoneControl={microphoneControl} /> : !solo && !ended && <section className="lounge-session-waiting" aria-label="대화 순서와 손들기"><p className="lounge-session-current" role="status">{props.status === 'lobby' ? '대화 시작을 기다리고 있어요' : props.guidedSession ? '발언 순서를 불러오는 중이에요' : '현재는 자유 대화 중이에요'}</p><div className="lounge-session-actions">{microphoneControl}<button type="button" disabled title="순서 대화가 시작되면 사용할 수 있어요"><Hand size={16} />손들기</button></div><p className="lounge-waiting-summary">{props.status === 'lobby' ? '시작하면 내 차례와 발언 대기 명단이 여기에 보여요.' : props.guidedSession ? '순서가 준비되면 손들기와 발언 대기를 사용할 수 있어요.' : '순서 진행이 적용된 새 대화방에서 손들기와 발언 대기를 사용할 수 있어요.'}</p></section>}<div className="lounge-stage-note">{solo ? '편하게 이야기해 주세요. 답하기 어려운 질문은 패스해도 괜찮아요.' : '같은 취향도, 다른 생각도 좋아요. AI의 답을 기다리지 않고 서로 말을 건네세요.'}</div></div>
        </div>
          </aside>
        </div>
        {(props.error || sendError) && <p className="lounge-error" role="alert">{props.error || sendError}</p>}
    {ended && <div className="lounge-ended"><Coffee size={24} /><span>오늘의 대화가 끝났어요. 다음에 또 만나요.</span><Link to="/lounge">새로운 대화방 <ArrowRight size={16} /></Link></div>}
      </div>
    </section><aside className="lounge-chat-panel" ref={journalPanel} id={journalId} tabIndex={-1} hidden={!journalOpen} aria-label="대화 기록" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closeJournal(); } }}><div className="lounge-chat-heading"><MessageCircle size={19} /><h2>우리의 대화</h2><span>{props.preview ? 'PREVIEW' : 'LIVE'}</span><button type="button" className="lounge-journal-close" onClick={closeJournal} aria-label="대화 기록 접기"><X size={18} /></button></div><p className="lounge-chat-intro">목소리에 담긴 생각, 천천히 알아가는 우리.</p><div className="lounge-chat-log" ref={log} role="log" aria-label="대화 내용">{props.messages.length === 0 && <div className="lounge-chat-empty"><Coffee size={32} /><p>아직은 고요한 대화방.<br />첫 이야기를 기다리고 있어요.</p></div>}{props.messages.map(message => <article key={message.id} className={message.kind === 'host' ? 'host' : ''}><span className="lounge-chat-avatar">{message.kind === 'host' ? <LoungeHostPortrait hostId={props.hostId} /> : <LoungePortrait index={props.members.find(member => member.id === message.user_id)?.avatarIndex} url={props.members.find(member => member.id === message.user_id)?.avatarUrl} name={message.nickname} />}</span><div><strong>{message.kind === 'host' ? host.name : message.nickname}{message.kind === 'host' && <b>AI 사회자</b>}</strong><p>{message.text}</p></div></article>)}</div><p className="lounge-chat-privacy">음성은 AI 진행을 위해 글로 전사됩니다.<br />원본 음성은 저장하지 않아요.</p></aside></div>
  </main>;
}

function LoungePreview() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const host = getLoungeHost(params.get('host') ?? 'jaeseok');
  const topic = params.get('topic')?.slice(0, 160) || loungeTopics[0].question;
  const capacity = Math.min(6, Math.max(1, Math.trunc(Number(params.get('capacity'))) || 4));
  const opening = `${capacity === 1 ? '오늘은 둘이 편하게' : '오늘은 함께'} “${topic}” 이야기를 나눠요. 먼저 떠오르는 경험이나 궁금한 점이 있나요? 편하게 패스해도 좋아요.`;
  const [messages, setMessages] = useState<LoungeMessage[]>(() => [
    { id: 1, room_id: 'preview', user_id: null, nickname: host.name, kind: 'host', text: opening, created_at: new Date().toISOString() },
    ...(capacity > 1 ? [{ id: 2, room_id: 'preview', user_id: 'demo-soyeon', nickname: '소연 · 예시', kind: 'human' as const, text: '같은 경험도 누구와 함께하느냐에 따라 다르게 남더라고요.', created_at: new Date().toISOString() }] : []),
    ...(capacity > 2 ? [{ id: 3, room_id: 'preview', user_id: 'demo-jiwoo', nickname: '지우 · 예시', kind: 'human' as const, text: '맞아요. 전 이렇게 같이 이야기하는 시간이 더 좋아요.', created_at: new Date().toISOString() }] : []),
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
        if (next.round_order.length) next.round_order = [...next.round_order.slice(1), next.round_order[0]];
        next.hand_queue = [];
        next.state = 'between';
      }
      if (!next.round_order.length) next.round_order = demoMembers.map(member => member.id);
      const basic = next.round_order.find(id => !next.completed.includes(id));
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
  return <RoomView session={session} onSessionAction={previewSessionAction} theme={getLoungeTheme(params.get('theme')).id} hostId={host.id} topic={topic} capacity={capacity} messages={messages} members={demoMembers} speakers={demoPlaying && demoTurn > 0 && demoTurn <= demoMembers.length ? [demoMembers[demoTurn - 1].id] : []} aiSpeaking={demoPlaying && demoTurn === 0} pending={pending} status="active" remaining="60분 · 예시" preview micOn={false} connected={false} isHost error="" currentUserId="me" onAvatarChoice={async index => setAvatarIndex(index)} demoPlaying={demoPlaying} onDemoToggle={() => setDemoPlaying(value => !value)} onConnect={() => {}} onMic={() => {}} onAsk={() => reply(topic)} onStart={() => {}} onLeave={() => navigate('/lounge')} />;
}

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
  const [studying, setStudying] = useState(false);
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
  const [interactionError, setInteractionError] = useState('');
  const interactionBlockedRoom = useRef<string | null>(null);
  const reportInteractionError = useCallback((err: unknown) => {
    if (!mounted.current || activeRoomId.current !== roomId) return;
    if (err instanceof LoungeApiError && err.code === 'lounge_interaction_not_configured' && !err.retryable) interactionBlockedRoom.current = roomId;
    setInteractionError(errorText(err));
  }, [roomId]);
  const hostRequest = useRef<AbortController | null>(null);
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
  const isHost = room?.host_id === user?.id;
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
  const audio = useLoungeAudio(roomId, room?.host_id ?? '', transcript, room?.capacity, room?.guided_session && !isLoungeFreeStage(session) ? { allowed: session?.speaker_id === user?.id && session?.state === 'speaking', speakerId: session?.state === 'speaking' ? session.speaker_id : null, turnId: session?.turn_id } : undefined, restrictedIds);
  const current = useRef({ room, session, messages, audio, isHost, restrictedIds });
  useEffect(() => { current.current = { room, session, messages, audio, isHost, restrictedIds }; }, [room, session, messages, audio, isHost, restrictedIds]);
  const applySession = useCallback((incoming: LoungeSession | null) => {
    const value = newerLoungeSession(current.current.session, incoming);
    current.current = { ...current.current, session: value }; setSession(value);
  }, []);
  const refreshAfterMessage = useCallback(async () => {
    const state = await loadLounge(roomId);
    if (!mounted.current || activeRoomId.current !== roomId) return;
    setRoom(state.room); applySession(state.session ?? null); setMembers(state.members); setMessages(state.messages);
    current.current = { ...current.current, room: state.room, messages: state.messages };
  }, [roomId, applySession]);
  useEffect(() => { refreshAfterInput.current = refreshAfterMessage; }, [refreshAfterMessage]);
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
      try { const state = await loadLounge(roomId); if (!cancelled) { setRoom(state.room); applySession(state.session ?? null); setMembers(state.members); setMessages(state.messages); } }
      catch (err) { if (!cancelled) setError(errorText(err)); }
      finally { refreshing = false; }
    };
    void joinLounge(roomId, userNickname).then(() => { if (!cancelled) { joined = true; void refresh(); } }).catch(err => { if (!cancelled) setError(errorText(err)); });
    const interval = setInterval(() => { if (joined) void refresh(); }, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [roomId, userId, userNickname, retry, applySession]);
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
    if (kind === 'done' || kind === 'pass') await state.audio.flushUtterance();
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

  const hostTurn = useCallback(async (reason: 'opening' | 'silence' | 'followup' | 'requested') => {
    const state = current.current;
    if (state.room && state.restrictedIds.includes(state.room.host_id)) return;
    const speech = state.audio.getSpeechActivity();
    if (busy.current || transcribing.current || speech.transcribing || !state.isHost || !state.audio.connected || !state.audio.audioReady || state.room?.status !== 'active' || state.audio.aiSpeaking || state.audio.speakers.length || speech.recording) return;
    if (state.room.capacity === 1 && (Date.now() - Math.max(lastActivity.current, speech.lastVoiceAt) < 2000 || Date.now() - inputReadyAt.current < 1000 || Date.now() - lastHostEnded.current < 3000)) return;
    if (state.room.guided_session && !['ready', 'free'].includes(state.session?.state ?? '')) return;
    if (Date.now() - lastAttempt.current < (state.audio.participants.length === 1 ? 5000 : state.room.guided_session ? 10_000 : loungeHostCooldownMs(state.room.capacity))) return;
    const requestAt = state.room.moderator_requested_at;
    const newRequest = reason === 'requested' && (!requestAt || requestAt !== lastModeratorRequest.current);
    if (newRequest) { hostBlocked.current = false; audioBlocked.current = false; nextHostAttempt.current = 0; lastModeratorRequest.current = requestAt ?? null; }
    if (hostBlocked.current || Date.now() < nextHostAttempt.current) return;
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
        if (latest.audio.speakers.length || activity.recording || activity.transcribing || latest.room?.status !== 'active' || (latest.room.capacity === 1 && Date.now() - Math.max(lastActivity.current, activity.lastVoiceAt) < 2000)) return;
      }
      const response = await requestLoungeHost(roomId, reason, controller.signal);
      if (!mounted.current || controller.signal.aborted) { await response.stream?.cancel(); return; }
      if (!response.skipped) setError('');
      if (response.stream) {
        const guided = state.room.guided_session;
        const canWaitForAudio = () => {
          const latest = current.current;
          return mounted.current && !controller.signal.aborted && latest.audio.connected && !latest.restrictedIds.includes(latest.room?.host_id ?? '') && latest.room?.status === 'active'
            && (!guided || (latest.session?.turn_id === state.session?.turn_id && ['ready','free'].includes(latest.session?.state ?? '')));
        };
        if (!canWaitForAudio()) { await response.stream.cancel(); return; }
        let timings: Record<string, number> = {};
        await current.current.audio.playHostStream(response.stream, () => {
          spoke = true;
          if (mounted.current) setPending(false);
          console.info('[Lounge latency]', { ...timings, firstAudioMs: Math.round(performance.now() - started) });
        }, value => { timings = value; }, () => {
          const latest = current.current, activity = latest.audio.getSpeechActivity();
          return !controller.signal.aborted && !latest.audio.speakers.length && !activity.recording && !activity.transcribing && latest.room?.status === 'active' && (!latest.room.guided_session || (latest.session?.turn_id === state.session?.turn_id && ['ready','free'].includes(latest.session?.state ?? ''))) && Date.now() - Math.max(lastActivity.current, activity.lastVoiceAt) >= 2000;
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
      if (mounted.current) setError(errorText(err));
    }
    finally { if (spoke) lastHostEnded.current = Date.now(); if (hostRequest.current === controller) hostRequest.current = null; busy.current = false; if (mounted.current) { setPending(false); setStudying(false); } }
  }, [roomId, refreshAfterMessage]);
  useEffect(() => {
    const interval = setInterval(() => {
      const state = current.current;
      const speech = state.audio.getSpeechActivity();
      if (!state.isHost || !state.room || !state.audio.connected || !state.audio.audioReady || !micPrepared || speech.recording || speech.transcribing || state.audio.participants.length < 1 || state.audio.aiSpeaking || state.audio.speakers.length) return;
      if (state.room.guided_session) {
        if (!state.session || !['ready','free'].includes(state.session.state)) return;
        if (state.room.moderator_requested_at) void hostTurn('requested');
        else if (loungeStageNeedsOpening(state.session)) void hostTurn('opening');
        else if (isLoungeFreeStage(state.session)) {
          const reason = nextLoungeHostReason(state.room, state.messages, Date.now(), Math.max(lastActivity.current, speech.lastVoiceAt), lastAttempt.current, lastHostEnded.current, inputReadyAt.current, state.audio.participants.length);
          if (reason === 'silence' || reason === 'requested' || (reason === 'followup' && state.audio.participants.length === 1)) void hostTurn(reason);
        }
        return;
      }
      const reason = nextLoungeHostReason(state.room, state.messages, Date.now(), Math.max(lastActivity.current, speech.lastVoiceAt), lastAttempt.current, lastHostEnded.current, inputReadyAt.current, state.audio.participants.length);
      if (reason) void hostTurn(reason);
    }, room?.capacity === 1 || room?.guided_session ? 500 : 3000);
    return () => clearInterval(interval);
  }, [hostTurn, room?.capacity, room?.guided_session, micPrepared]);
  const askModerator = async () => {
    if (room?.capacity === 1) { await hostTurn('requested'); return; }
    try { await requestLoungeModerator(roomId); await refreshAfterMessage(); }
    catch (err) { if (mounted.current) setError(errorText(err)); }
  };
  const action = async (kind: 'start' | 'leave') => {
    try { setError(''); await controlLounge(roomId, kind); if (kind === 'leave') { audio.disconnect(); navigate('/lounge'); } else { const state = await loadLounge(roomId); setRoom(state.room); } }
    catch (err) { setError(errorText(err)); }
  };
  if (!user) return <main className="lounge-join-gate"><span>☕</span><h1>친구들과 가볍게 이야기해요.</h1><p>이름을 준비하고 대화방에 들어갈게요.</p><button className="lounge-primary" type="button" onClick={() => { void onGuestRequest().catch(err => setError(errorText(err))); }}>게스트로 참여하기 <ArrowRight size={17} /></button><button className="lounge-preview-button" type="button" onClick={onLoginRequest}>로그인해서 참여하기</button>{error && <p className="lounge-error" role="alert">{error}</p>}</main>;
  if (!room) return <main className="lounge-join-gate"><Coffee size={42} /><h1>{error ? '대화방을 확인해 주세요' : '친구들의 자리를 준비해요…'}</h1>{error && <><p className="lounge-error" role="alert">{error}</p><button type="button" className="lounge-preview-button" onClick={() => { setError(''); setRetry(value => value + 1); }}><RefreshCw size={16} /> 다시 확인하기</button><Link to="/lounge">라운지로 돌아가기</Link></>}</main>;
  const remaining = room.expires_at ? Math.max(0, Math.ceil((Date.parse(room.expires_at) - clock) / 1000)) : 3600;
  const seats = audio.participants.map(participant => ({ ...participant, name: members.find(member => member.user_id === participant.id)?.nickname ?? participant.name }));
  return <RoomView now={clock} guidedSession={room.guided_session} session={session} sessionNames={Object.fromEntries(members.map(member => [member.user_id, member.nickname]))} onSessionAction={sessionAction} study={room.topic_study} studying={studying} theme={room.theme} hostId={room.host_persona} liveHostText={audio.hostText} currentUserId={user.id} onAvatarChoice={audio.connected ? audio.chooseAvatar : undefined} topic={room.topic} topicBrief={room.topic_brief} capacity={room.capacity} messages={messages} onReleaseRestriction={async targetId => { await releaseLoungeRestriction(roomId, targetId); await refreshAfterMessage(); }} members={seats.map(seat => { const safety = members.find(member => member.user_id === seat.id); return { ...seat, warnings: safety?.moderation_warnings, restrictedUntil: safety?.speaking_restricted_until }; })} speakers={audio.speakers} aiSpeaking={audio.aiSpeaking} pending={pending} status={ended ? 'ended' : room.status} remaining={room.guided_session ? `약 30분 · ${Math.max(0, Math.floor((clock - Date.parse(room.started_at || new Date(clock).toISOString())) / 60000))}분 함께` : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`} micOn={audio.micOn} connected={audio.connected} connecting={audio.connecting} audioReady={audio.audioReady} starting={starting || (audio.connected && audio.audioReady && !micPrepared)} isHost={isHost} error={error || transcriptError || interactionError || audio.error} onConnect={() => { if (!audio.connected) void audio.connect(); else if (!audio.audioReady) audio.enableAudio(); else void action('start'); }} onMic={() => { if (audio.micOn) audio.stopMicrophone(); else void audio.startMicrophone(); }} onAsk={() => void askModerator()} onStart={() => void action('start')} onLeave={() => { if (isHost && !ended && !window.confirm(room.capacity === 1 ? 'AI와의 대화를 마칠까요?' : '나가면 모두의 대화방이 종료돼요. 대화를 마칠까요?')) return; void action('leave'); }} inviteUrl={`${window.location.origin}/lounge/${roomId}`} />;
}
