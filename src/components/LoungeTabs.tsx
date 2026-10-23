import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, FileText, Heart, House, Info, LogIn, LogOut, MessageCircle, Plus, RefreshCw, Settings, Shield, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { getLoungeHost, isLoungeCustomCharacterId, loungeSpokenText, type LoungeHostId } from '../lib/lounge';
import { getLoungeCharacter } from '../lib/loungeCharacters';
import { listLoungeChats, type LoungeChatSummary } from '../lib/loungeApi';
import { loungeCustomPortrait } from '../lib/loungeCustomClient';
import { LoungeHostPortrait } from './LoungeHostPortrait';
import './LoungeTabs.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

/** The bar at the bottom of the lounge outside a conversation, as in a messenger: home, chats and settings. */
export function LoungeTabBar({ unread }: { unread: number }) {
  const { pathname } = useLocation();
  const tab = pathname.startsWith('/lounge/chats') ? 'chats' : pathname.startsWith('/lounge/settings') || pathname.startsWith('/lounge/friends') ? 'settings' : 'home';
  const item = (id: string, to: string, label: string, icon: ReactNode, badge?: number) =>
    <Link to={to} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined}><span>{icon}{badge ? <em aria-label={`안 읽은 쪽지 ${badge}개`}>{badge > 99 ? '99+' : badge}</em> : null}</span>{label}</Link>;
  return <nav className="lounge-tabbar" aria-label="라운지 메뉴">
    {item('home', '/lounge', '홈', <House size={22} />)}
    {item('chats', '/lounge/chats', '채팅', <MessageCircle size={22} />)}
    {item('settings', '/lounge/settings', '설정', <Settings size={22} />, unread)}
  </nav>;
}

/** When a message was sent, as a chat list shows it: the time today, "어제", or the date. */
function chatTime(at: string) {
  const date = new Date(at), now = new Date();
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return '어제';
  return date.getFullYear() === now.getFullYear() ? `${date.getMonth() + 1}월 ${date.getDate()}일` : `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

function ChatPortrait({ chat }: { chat: LoungeChatSummary }) {
  if (isLoungeCustomCharacterId(chat.character_id)) {
    const url = loungeCustomPortrait({ portrait_path: chat.character_portrait });
    return <span className="lounge-chat-portrait">{url ? <img src={url} alt="" /> : <b>{(chat.character_name ?? '?').slice(0, 1)}</b>}</span>;
  }
  return <span className="lounge-chat-portrait"><LoungeHostPortrait hostId={chat.character_id as LoungeHostId} /></span>;
}

/**
 * The chat list: every character the member has talked with, newest first, with the last thing said. Opening one
 * continues that conversation where it was left (the room page opens it again).
 */
export function LoungeChatsPage({ user, onLoginRequest }: { user: AppUser | null; onLoginRequest: () => void }) {
  const navigate = useNavigate();
  const [chats, setChats] = useState<LoungeChatSummary[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => listLoungeChats().then(rows => { setChats(rows); setError(''); }, err => setError(errorText(err))), []);
  useEffect(() => {
    if (!user) return;
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [user, load]);
  if (!user) return <main className="lounge-lobby lounge-tab-page"><div className="lounge-tab-empty"><MessageCircle size={34} /><h1>채팅</h1><p>로그인하면 캐릭터와 나눈 대화가 여기에 모여요. 언제든 이어서 이야기할 수 있어요.</p><button type="button" className="lounge-primary" onClick={onLoginRequest}><LogIn size={16} />로그인</button></div></main>;
  return <main className="lounge-lobby lounge-tab-page">
    <div className="lounge-tab-head"><h1>채팅</h1><button type="button" className="lounge-tab-refresh" onClick={() => void load()} aria-label="새로고침"><RefreshCw size={16} /></button></div>
    {error && <p className="lounge-error" role="alert">{error}</p>}
    {chats === null && !error && <p className="lounge-tab-loading" role="status">대화를 불러오는 중…</p>}
    {chats?.length === 0 && <div className="lounge-tab-empty"><MessageCircle size={34} /><h2>아직 나눈 대화가 없어요</h2><p>캐릭터를 골라 이야기를 시작하면 여기에서 이어갈 수 있어요.</p><Link to="/lounge" className="lounge-primary"><Plus size={16} />캐릭터 고르기</Link></div>}
    {chats && chats.length > 0 && <ul className="lounge-chat-list">
      {chats.map(chat => {
        const custom = isLoungeCustomCharacterId(chat.character_id);
        const house = custom ? undefined : getLoungeCharacter(chat.character_id);
        const name = custom ? chat.character_name ?? '캐릭터' : house?.name ?? getLoungeHost(chat.character_id).name;
        const said = chat.last_kind === 'host' ? loungeSpokenText(chat.last_text) || chat.last_text.replace(/\*/g, '') : chat.last_text;
        return <li key={chat.room_id}><button type="button" onClick={() => navigate(`/lounge/${chat.room_id}`)}>
          <ChatPortrait chat={chat} />
          <span className="lounge-chat-text"><span className="lounge-chat-name"><strong>{name}</strong>{chat.story && <small>{chat.story}</small>}</span><span className="lounge-chat-last">{chat.last_kind === 'human' ? `나: ${said}` : said}</span></span>
          <time dateTime={chat.last_at}>{chatTime(chat.last_at)}</time>
        </button></li>;
      })}
    </ul>}
  </main>;
}

/** Settings: the member's profile, friends and notes, their characters, the service's pages, and signing out. */
export function LoungeSettingsPage({ user, unread, onProfileRequest, onLoginRequest, onSignupRequest, onLogout, loggingOut }: { user: AppUser | null; unread: number; onProfileRequest: () => void; onLoginRequest: () => void; onSignupRequest?: () => void; onLogout?: () => void; loggingOut: boolean }) {
  const member = Boolean(user && !user.isAnonymous);
  const row = (to: string, icon: ReactNode, label: string, extra?: ReactNode) => <li><Link to={to}>{icon}<span>{label}</span>{extra}<ChevronRight size={17} className="lounge-settings-chevron" /></Link></li>;
  return <main className="lounge-lobby lounge-tab-page">
    <div className="lounge-tab-head"><h1>설정</h1></div>
    <section className="lounge-settings-profile">
      {member ? <button type="button" onClick={onProfileRequest}>
        <span className="lounge-settings-avatar">{user!.loungeAvatarUrl ? <img src={user!.loungeAvatarUrl} alt="" /> : <UserRound size={26} />}</span>
        <span><strong>{user!.nickname}</strong><small>프로필 수정</small></span><ChevronRight size={18} className="lounge-settings-chevron" />
      </button> : <div className="lounge-settings-guest">
        <span className="lounge-settings-avatar"><UserRound size={26} /></span>
        <span><strong>{user?.isAnonymous ? '게스트로 이용 중' : '로그인하지 않았어요'}</strong><small>회원이 되면 대화와 친구가 계정에 남아요.</small></span>
        <div><button type="button" className="lounge-primary" onClick={onLoginRequest}>로그인</button>{onSignupRequest && <button type="button" className="lounge-settings-signup" onClick={onSignupRequest}>회원가입</button>}</div>
      </div>}
    </section>
    <ul className="lounge-settings-list">
      {member && row('/lounge/friends', <Heart size={18} />, '친구 · 쪽지', unread ? <em>{unread > 99 ? '99+' : unread}</em> : null)}
      {member && row('/lounge/create', <Plus size={18} />, '내 캐릭터 만들기')}
      {row('/lounge/about', <Info size={18} />, '서비스 소개')}
      {row('/terms', <FileText size={18} />, '이용약관')}
      {row('/privacy', <Shield size={18} />, '개인정보 처리방침')}
    </ul>
    {member && onLogout && <button type="button" className="lounge-settings-logout" disabled={loggingOut} onClick={onLogout}><LogOut size={17} />{loggingOut ? '로그아웃 중…' : '로그아웃'}</button>}
  </main>;
}
