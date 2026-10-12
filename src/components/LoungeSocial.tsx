import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ArrowRight, Ban, Heart, LoaderCircle, MapPin, MessageSquare, RefreshCw, Send, Star, UserMinus, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AppUser } from '../types';
import {
  blockLoungeUser, listLoungeFriends, listLoungeNotes, listLoungeRoomPeople, loadLoungeProfile, loungeAgeLabel, loungeNoteLimit, loungeSince,
  markLoungeNotesRead, rateLoungeMember, sendLoungeNote, setLoungeFriend,
  type LoungeFriend, type LoungeNote, type LoungePerson, type LoungeProfile,
} from '../lib/loungeSocial';
import { useDialog } from '../lib/useDialog';
import './LoungeSocial.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';

export function SocialAvatar({ url, name, className = '' }: { url?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={`lounge-social-avatar ${className}`}>{url && !failed ? <img src={url} alt="" onError={() => setFailed(true)} /> : <span aria-hidden="true">{name.slice(0, 1)}</span>}</span>;
}

/** Five stars. Picking one saves a rating; the value shows the person's current choice. */
export function LoungeStars({ value, onChange, disabled, label }: { value: number | null; onChange: (score: number) => void; disabled?: boolean; label: string }) {
  return <div className="lounge-stars" role="radiogroup" aria-label={label}>{[1, 2, 3, 4, 5].map(score => <button key={score} type="button" role="radio" aria-checked={value === score} aria-label={`${score}점`} disabled={disabled}
    className={score <= (value ?? 0) ? 'on' : ''} onClick={() => onChange(score)}><Star size={22} fill={score <= (value ?? 0) ? 'currentColor' : 'none'} aria-hidden="true" /></button>)}</div>;
}

/** A note (쪽지) written in place. */
export function LoungeNoteComposer({ toId, onSent, onCancel, autoFocus }: { toId: string; onSent: () => void; onCancel?: () => void; autoFocus?: boolean }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true); setError('');
    try { await sendLoungeNote(toId, text); setBody(''); onSent(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return <form className="lounge-note-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
    <textarea value={body} onChange={event => setBody(event.target.value)} maxLength={loungeNoteLimit} rows={3} placeholder="쪽지를 적어 주세요. 상대가 나중에 읽어요." aria-label="쪽지 내용" autoFocus={autoFocus} disabled={busy} />
    <div><small>{body.length}/{loungeNoteLimit} · 30일 뒤 사라져요</small>
      {onCancel && <button type="button" className="quiet" onClick={onCancel} disabled={busy}>닫기</button>}
      <button type="submit" disabled={busy || !body.trim()}>{busy ? <LoaderCircle size={15} className="lounge-spin" /> : <Send size={15} />} 보내기</button></div>
    {error && <p className="lounge-social-error" role="alert">{error}</p>}
  </form>;
}

/** A member's profile: photo, age group, region, introduction and rating, with the ways to keep in touch. */
export function LoungeProfileCard({ userId, roomId, fallbackName, fallbackAvatarUrl, viewerIsMember, onClose, onEditProfile }: {
  userId: string; roomId?: string; fallbackName?: string; fallbackAvatarUrl?: string; viewerIsMember: boolean; onClose: () => void; onEditProfile?: () => void;
}) {
  const titleId = useId();
  const closeButton = useDialog(onClose);
  const [profile, setProfile] = useState<LoungeProfile | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [noting, setNoting] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => loadLoungeProfile(userId, roomId).then(next => { setProfile(next); setError(''); }, err => setError(errorText(err))), [userId, roomId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key); setError(''); setNotice('');
    try { await task(); await load(); } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  };
  const name = profile?.nickname ?? fallbackName ?? '참가자';
  const ageLabel = loungeAgeLabel(profile?.ageGroup);
  const social = viewerIsMember && profile && !profile.isSelf && !profile.guest;
  return <div className="lounge-social-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="lounge-social-dialog lounge-profile-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button ref={closeButton} type="button" className="lounge-social-close" onClick={onClose} aria-label="닫기"><X size={18} /></button>
      <SocialAvatar url={profile?.avatarUrl ?? fallbackAvatarUrl} name={name} className="large" />
      <div className="lounge-profile-body">
        <h2 id={titleId}>{name}{profile?.isSelf && <b>나</b>}</h2>
        {!profile && !error && <p className="lounge-social-muted"><LoaderCircle size={15} className="lounge-spin" /> 프로필을 불러오고 있어요.</p>}
        {profile && <>
          <ul className="lounge-profile-facts">
            <li>{ageLabel ?? '나이대 비공개'}</li>
            <li><MapPin size={13} aria-hidden="true" />{profile.region ?? '지역 비공개'}</li>
            {profile.guest && <li>게스트</li>}
          </ul>
          <p className={`lounge-profile-bio ${profile.bio ? '' : 'empty'}`}>{profile.bio ?? '아직 자기소개가 없어요.'}</p>
          <p className="lounge-profile-rating"><Star size={15} fill="currentColor" aria-hidden="true" />{profile.ratingAvg !== null
            ? <><b>{profile.ratingAvg.toFixed(1)}</b> · {profile.ratingCount}명이 평가했어요</>
            : profile.ratingCount ? `${profile.ratingCount}명이 평가했어요 · 3명이 되면 평균이 보여요` : '아직 받은 평가가 없어요'}</p>
          {profile.canRate && <div className="lounge-profile-rate"><span>이 대화는 어땠나요?</span>
            <LoungeStars value={profile.myRating} label={`${name}님 평가`} disabled={busy === 'rate'} onChange={score => void run('rate', () => rateLoungeMember(roomId!, userId, score))} /></div>}
          {profile.isSelf
            ? onEditProfile && <div className="lounge-social-actions"><button type="button" className="primary" onClick={() => { onClose(); onEditProfile(); }}>내 프로필 수정</button></div>
            : social ? <div className="lounge-social-actions">
              <button type="button" className={profile.isFriend ? 'active' : 'primary'} disabled={busy === 'friend' || profile.isBlocked} onClick={() => void run('friend', () => setLoungeFriend(userId, !profile.isFriend))}>
                {busy === 'friend' ? <LoaderCircle size={15} className="lounge-spin" /> : <Heart size={15} fill={profile.isFriend ? 'currentColor' : 'none'} />}{profile.isFriend ? '다음에 또 이야기할 사람' : '다음에 또 이야기하고 싶어요'}</button>
              <button type="button" onClick={() => setNoting(value => !value)} disabled={profile.isBlocked} aria-expanded={noting}><MessageSquare size={15} /> 쪽지 보내기</button>
              <button type="button" className="quiet" disabled={busy === 'block'} onClick={() => {
                if (profile.isBlocked || window.confirm(`${name}님을 차단할까요? 친구에서 빠지고, 서로 쪽지를 주고받을 수 없어요.`)) void run('block', () => blockLoungeUser(userId, !profile.isBlocked));
              }}><Ban size={14} /> {profile.isBlocked ? '차단 해제' : '차단'}</button>
            </div> : !viewerIsMember && <p className="lounge-social-muted">회원으로 로그인하면 친구 추가와 쪽지를 쓸 수 있어요.</p>}
          {noting && social && <LoungeNoteComposer toId={userId} autoFocus onCancel={() => setNoting(false)} onSent={() => { setNoting(false); setNotice('쪽지를 보냈어요.'); }} />}
        </>}
        {notice && <p className="lounge-social-notice" role="status">{notice}</p>}
        {error && <p className="lounge-social-error" role="alert">{error}</p>}
      </div>
    </section>
  </div>;
}

/**
 * After a conversation with people: rate each of them and pick the ones to talk with again. It closes itself when
 * there is nobody to show (a conversation with the AI, or only guests) so it never gets in the way.
 */
export function LoungeAfterTalk({ roomId, onDone }: { roomId: string; onDone: () => void }) {
  const titleId = useId();
  const closeButton = useDialog(onDone);
  const [people, setPeople] = useState<LoungePerson[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    listLoungeRoomPeople(roomId).then(list => { if (!alive) return; if (!list.length) onDone(); else setPeople(list); }, () => { if (alive) onDone(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  const change = async (person: LoungePerson, key: string, apply: () => Promise<void>, update: (item: LoungePerson) => LoungePerson) => {
    setBusy(`${key}:${person.userId}`); setError('');
    try { await apply(); setPeople(previous => previous?.map(item => item.userId === person.userId ? update(item) : item) ?? previous); } catch (err) { setError(errorText(err)); } finally { setBusy(''); }
  };
  if (!people) return null;
  return <div className="lounge-social-backdrop" onClick={event => { if (event.target === event.currentTarget) onDone(); }}>
    <section className="lounge-social-dialog lounge-aftertalk" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button ref={closeButton} type="button" className="lounge-social-close" onClick={onDone} aria-label="닫기"><X size={18} /></button>
      <header><span>오늘의 대화가 끝났어요</span><h2 id={titleId}>함께 이야기한 분들</h2>
        <p>좋았던 분께 별점을 남기고, 다음에 또 이야기하고 싶은 분은 친구로 담아 두세요.</p></header>
      <ul>{people.map(person => <li key={person.userId}>
        <button type="button" className="lounge-aftertalk-who" onClick={() => setOpen(person.userId)} aria-label={`${person.nickname}님 프로필 보기`}><SocialAvatar url={person.avatarUrl} name={person.nickname} /><strong>{person.nickname}</strong></button>
        <LoungeStars value={person.myRating} label={`${person.nickname}님 평가`} disabled={busy === `rate:${person.userId}`}
          onChange={score => void change(person, 'rate', () => rateLoungeMember(roomId, person.userId, score), item => ({ ...item, myRating: score }))} />
        <button type="button" className={`lounge-aftertalk-friend ${person.isFriend ? 'on' : ''}`} aria-pressed={person.isFriend} disabled={busy === `friend:${person.userId}`}
          onClick={() => void change(person, 'friend', () => setLoungeFriend(person.userId, !person.isFriend), item => ({ ...item, isFriend: !item.isFriend }))}>
          <Heart size={15} fill={person.isFriend ? 'currentColor' : 'none'} aria-hidden="true" />{person.isFriend ? '또 이야기할 사람' : '또 이야기하고 싶어요'}</button>
      </li>)}</ul>
      {error && <p className="lounge-social-error" role="alert">{error}</p>}
      <div className="lounge-social-actions"><Link to="/lounge/friends" className="quiet">내 친구 보기 <ArrowRight size={14} /></Link><button type="button" className="primary" onClick={onDone}>마칠게요</button></div>
    </section>
    {open && <LoungeProfileCard userId={open} roomId={roomId} viewerIsMember onClose={() => setOpen(null)} />}
  </div>;
}

type Thread = { otherId: string; name: string; avatarUrl?: string; notes: LoungeNote[]; unread: number; latest: LoungeNote };
const threadsOf = (notes: LoungeNote[]): Thread[] => {
  const map = new Map<string, Thread>();
  for (const note of notes) {
    const found = map.get(note.otherId);
    if (found) { found.notes.push(note); if (!note.mine && !note.readAt) found.unread++; }
    else map.set(note.otherId, { otherId: note.otherId, name: note.otherName, avatarUrl: note.otherAvatarUrl, notes: [note], unread: !note.mine && !note.readAt ? 1 : 0, latest: note });
  }
  return Array.from(map.values());
};

function FriendRow({ friend, onProfile, onNote, onRemove }: { friend: LoungeFriend; onProfile: () => void; onNote: () => void; onRemove: () => void }) {
  const ageLabel = loungeAgeLabel(friend.ageGroup);
  const full = friend.room ? friend.room.count >= friend.room.capacity : false;
  return <li className="lounge-friend-row">
    <button type="button" className="lounge-friend-who" onClick={onProfile} aria-label={`${friend.nickname}님 프로필 보기`}>
      <span className={`lounge-friend-photo ${friend.online ? 'online' : ''}`}><SocialAvatar url={friend.avatarUrl} name={friend.nickname} /><i aria-hidden="true" /></span>
      <span><strong>{friend.nickname}</strong>
        <small>{[ageLabel, friend.region].filter(Boolean).join(' · ') || '소개 없음'}</small></span>
    </button>
    <div className="lounge-friend-status">
      <span className={friend.online ? 'online' : ''}>{friend.online ? '지금 접속 중' : friend.lastSeen ? `마지막 접속 ${loungeSince(friend.lastSeen)}` : '접속 상태 비공개'}</span>
      {friend.room && <p><Users size={13} aria-hidden="true" /> <b>{friend.room.topic}</b><small>{friend.room.spaceName} · {friend.room.count}/{friend.room.capacity}명</small></p>}
    </div>
    <div className="lounge-friend-actions">
      {friend.room && (full ? <span className="lounge-friend-full">가득 찼어요</span> : <Link to={`/lounge/spaces/${friend.room.spaceId}/join?table=${encodeURIComponent(friend.room.id)}`} className="primary">함께 대화하기 <ArrowRight size={14} /></Link>)}
      <button type="button" onClick={onNote} aria-label={`${friend.nickname}님께 쪽지 보내기`}><MessageSquare size={15} /> 쪽지</button>
      <button type="button" className="quiet" onClick={onRemove} aria-label={`${friend.nickname}님을 친구에서 빼기`}><UserMinus size={15} /></button>
    </div>
  </li>;
}

/** 친구 목록 (who is online and which room they are in) and 쪽지함. */
export function LoungeFriendsPage({ user, onLoginRequest, onNotesRead, onProfileRequest }: { user: AppUser | null; onLoginRequest: () => void; onNotesRead: () => void; onProfileRequest: () => void }) {
  const member = Boolean(user && !user.isAnonymous);
  const [tab, setTab] = useState<'friends' | 'notes'>('friends');
  const [friends, setFriends] = useState<LoungeFriend[] | null>(null);
  const [notes, setNotes] = useState<LoungeNote[] | null>(null);
  const [error, setError] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [writeTo, setWriteTo] = useState<{ id: string; name: string } | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => Promise.all([listLoungeFriends(), listLoungeNotes()]).then(([nextFriends, nextNotes]) => { setFriends(nextFriends); setNotes(nextNotes); setError(''); }, err => setError(errorText(err))), []);
  useEffect(() => {
    if (!member) return;
    void load();
    const interval = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 20_000);
    return () => clearInterval(interval);
  }, [member, load]);
  const threads = useMemo(() => threadsOf(notes ?? []), [notes]);
  const unread = threads.reduce((sum, thread) => sum + thread.unread, 0);
  const thread = threads.find(item => item.otherId === threadId) ?? null;
  const online = friends?.filter(friend => friend.online).length ?? 0;
  const openThread = (id: string) => {
    setThreadId(id);
    void markLoungeNotesRead(id).then(() => { onNotesRead(); void listLoungeNotes().then(setNotes, () => {}); }, () => {});
  };
  const remove = async (friend: LoungeFriend) => {
    if (!window.confirm(`${friend.nickname}님을 친구에서 뺄까요?`)) return;
    try { await setLoungeFriend(friend.userId, false); setFriends(previous => previous?.filter(item => item.userId !== friend.userId) ?? previous); } catch (err) { setError(errorText(err)); }
  };
  if (!member) return <main className="lounge-lobby lounge-friends"><div className="lounge-friends-gate"><Heart size={34} /><h1>다음에 또 이야기하고 싶은 사람들</h1>
    <p>회원으로 로그인하면 함께 대화한 분을 친구로 담고, 접속 상태를 보고, 쪽지를 보낼 수 있어요.{user?.isAnonymous ? ' 게스트로는 쓸 수 없어요.' : ''}</p>
    <button type="button" className="lounge-primary" onClick={onLoginRequest}>로그인하기 <ArrowRight size={17} /></button></div></main>;
  return <main className="lounge-lobby lounge-friends">
    <header className="lounge-home-intro lounge-friends-head"><div><h1>친구</h1><p>다음에 또 이야기하고 싶은 사람들이에요.</p></div>
      <button type="button" className="lounge-friends-refresh" onClick={() => void load()}><RefreshCw size={15} /> 새로고침</button></header>
    <div className="lounge-friends-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'friends'} className={tab === 'friends' ? 'active' : ''} onClick={() => setTab('friends')}>친구 {friends ? friends.length : ''}{online > 0 && <small>{online}명 접속 중</small>}</button>
      <button type="button" role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>쪽지함{unread > 0 && <em>{unread}</em>}</button>
    </div>
    {error && <p className="lounge-social-error" role="alert">{error}</p>}
    {notice && <p className="lounge-social-notice" role="status">{notice}</p>}
    {tab === 'friends' && (!friends ? <p className="lounge-social-muted"><LoaderCircle size={15} className="lounge-spin" /> 친구를 불러오고 있어요.</p>
      : !friends.length ? <div className="lounge-friends-empty"><Heart size={26} /><strong>아직 친구가 없어요</strong><p>대화방에서 함께한 분의 프로필 사진을 눌러 보세요. 대화가 끝나면 다음에 또 이야기하고 싶은 분을 고를 수도 있어요.</p><Link to="/lounge">대화방 둘러보기 <ArrowRight size={14} /></Link></div>
        : <>
          <ul className="lounge-friend-list">{friends.map(friend => <FriendRow key={friend.userId} friend={friend} onProfile={() => setProfileId(friend.userId)}
            onNote={() => { setNotice(''); setWriteTo({ id: friend.userId, name: friend.nickname }); }} onRemove={() => void remove(friend)} />)}</ul>
          <p className="lounge-social-muted small">접속 상태와 대화 중인 방은 친구에게만 보여요. 프로필 수정에서 끌 수 있어요.</p></>)}
    {tab === 'notes' && (!notes ? <p className="lounge-social-muted"><LoaderCircle size={15} className="lounge-spin" /> 쪽지를 불러오고 있어요.</p>
      : thread ? <section className="lounge-thread" aria-label={`${thread.name}님과의 쪽지`}>
        <header><button type="button" className="quiet" onClick={() => setThreadId(null)}>← 목록</button>
          <button type="button" className="lounge-thread-who" onClick={() => setProfileId(thread.otherId)}><SocialAvatar url={thread.avatarUrl} name={thread.name} /><strong>{thread.name}</strong></button></header>
        <ol>{[...thread.notes].reverse().map(note => <li key={note.id} className={note.mine ? 'mine' : ''}><p>{note.body}</p><small>{loungeSince(note.createdAt)}{note.mine && note.readAt ? ' · 읽음' : ''}</small></li>)}</ol>
        <LoungeNoteComposer toId={thread.otherId} onSent={() => { void listLoungeNotes().then(setNotes, () => {}); }} />
      </section>
        : !threads.length ? <div className="lounge-friends-empty"><MessageSquare size={26} /><strong>받은 쪽지가 없어요</strong><p>친구 목록이나 프로필에서 쪽지를 보낼 수 있어요. 쪽지는 30일 뒤에 사라져요.</p></div>
          : <ul className="lounge-thread-list">{threads.map(item => <li key={item.otherId}><button type="button" onClick={() => openThread(item.otherId)} className={item.unread ? 'unread' : ''}>
            <SocialAvatar url={item.avatarUrl} name={item.name} /><span><strong>{item.name}</strong><small>{item.latest.mine ? '나: ' : ''}{item.latest.body}</small></span>
            <time>{loungeSince(item.latest.createdAt)}</time>{item.unread > 0 && <em>{item.unread}</em>}</button></li>)}</ul>)}
    {writeTo && <div className="lounge-social-backdrop" onClick={event => { if (event.target === event.currentTarget) setWriteTo(null); }}>
      <NoteSheet to={writeTo} onClose={() => setWriteTo(null)} onSent={() => { setWriteTo(null); setNotice(`${writeTo.name}님께 쪽지를 보냈어요.`); void listLoungeNotes().then(setNotes, () => {}); }} />
    </div>}
    {profileId && <LoungeProfileCard userId={profileId} viewerIsMember onClose={() => { setProfileId(null); void load(); }} onEditProfile={profileId === user?.id ? onProfileRequest : undefined} />}
  </main>;
}

function NoteSheet({ to, onClose, onSent }: { to: { id: string; name: string }; onClose: () => void; onSent: () => void }) {
  const titleId = useId();
  const closeButton = useDialog(onClose);
  return <section className="lounge-social-dialog lounge-note-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <button ref={closeButton} type="button" className="lounge-social-close" onClick={onClose} aria-label="닫기"><X size={18} /></button>
    <h2 id={titleId}>{to.name}님께 쪽지</h2>
    <p className="lounge-social-muted small">쪽지는 상대가 읽을 때까지 보관되고, 30일 뒤에 사라져요.</p>
    <LoungeNoteComposer toId={to.id} autoFocus onCancel={onClose} onSent={onSent} />
  </section>;
}
