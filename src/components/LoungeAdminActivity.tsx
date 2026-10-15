import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { getLoungeAdminActivity, getLoungeAdminConversation, getLoungeAdminUsers } from '../lib/superAdmin';
import { getLoungeCharacter } from '../lib/loungeCharacters';
import type { LoungeAdminActivity as Activity, LoungeAdminConversation, LoungeAdminUser } from '../types';

const errorText = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
const when = (value: string | null) => value ? new Date(value).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const genderLabel = (gender: LoungeAdminUser['gender']) => gender === 'male' ? '남' : gender === 'female' ? '여' : '—';
const ageLabel = (age: string | null) => age ? `${age.replace('s', '')}대` : '—';
const personaName = (id: string) => getLoungeCharacter(id)?.name ?? id;
const statusLabel = { lobby: '대기', active: '진행 중', ended: '종료' } as const;

// Member lookup for the lounge: who they are, which rooms they were in, with whom, and what was said.
// The server writes every opened member and conversation to an access log.
export const LoungeAdminActivity = () => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<LoungeAdminUser[] | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [conversation, setConversation] = useState<LoungeAdminConversation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);   // a slower, older request must not overwrite a newer one

  const search = async (text: string) => {
    const ticket = ++latest.current;
    setBusy(true); setError('');
    try {
      const next = await getLoungeAdminUsers(text);
      if (ticket === latest.current) setUsers(next);
    } catch (reason) {
      if (ticket === latest.current) setError(errorText(reason));
    } finally {
      if (ticket === latest.current) setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    getLoungeAdminUsers('')
      .then(next => { if (!cancelled && latest.current === 0) setUsers(next); })
      .catch(reason => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, []);

  const submit = (event: FormEvent) => { event.preventDefault(); void search(query); };

  const openUser = async (userId: string) => {
    setBusy(true); setError('');
    try { setActivity(await getLoungeAdminActivity(userId)); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  };

  const openConversation = async (roomId: string) => {
    if (!activity) return;
    setBusy(true); setError('');
    try { setConversation(await getLoungeAdminConversation(roomId, activity.profile.userId)); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  };

  return (
    <section className="card admin-panel">
      <div className="super-admin-section-heading">
        <div>
          <span className="admin-eyebrow">LOUNGE MEMBERS</span>
          <h2><ShieldCheck size={20} style={{ verticalAlign: 'middle' }} /> 사석 회원 활동·대화</h2>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', gap: '.5rem' }}>
          <input className="input-field super-admin-search" placeholder="닉네임 · 이메일 검색" value={query} onChange={event => setQuery(event.target.value)} />
          <button className="btn btn-secondary" type="submit" disabled={busy}>검색</button>
        </form>
      </div>
      <p className="admin-lead">
        회원을 열거나 대화를 열 때마다 열람자·시각·대상이 기록됩니다. 대화방의 대화는 방이 끝난 뒤 30일까지 보관되고 이후 자동 삭제됩니다.
        신고 처리나 안전 점검 등 필요한 경우에만 열람하세요.
      </p>
      {error && <div className="super-admin-notice error" role="alert">{error}</div>}

      <div className="super-admin-table-wrap">
        <table className="super-admin-table">
          <thead><tr>{['닉네임', '이메일', '성별·연령·지역', '가입일', '최근 활동', '방', '발언', '경고', ''].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{(users ?? []).map(user => (
            <tr key={user.userId}>
              <td>{user.nickname}</td>
              <td>{user.email}</td>
              <td>{genderLabel(user.gender)} · {ageLabel(user.ageGroup)} · {user.region || '—'}</td>
              <td>{when(user.joinedAt)}</td>
              <td>{when(user.lastActiveAt ?? user.lastSignInAt)}</td>
              <td>{user.roomCount}</td>
              <td>{user.messageCount}</td>
              <td>{user.warnings || '—'}</td>
              <td><button className="btn btn-secondary" style={{ padding: '.4rem .6rem' }} disabled={busy} onClick={() => void openUser(user.userId)}>활동</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {users && !users.length && <p className="super-admin-list-empty">조건에 맞는 회원이 없습니다.</p>}
      {!users && !error && <p className="super-admin-loading">회원 목록을 불러오는 중입니다.</p>}

      {activity && (
        <div role="dialog" aria-modal="true" className="super-admin-modal-backdrop">
          <article className="card super-admin-report-modal" style={{ maxWidth: 860 }}>
            <div className="super-admin-section-heading">
              <div>
                <h2>{activity.profile.nickname}</h2>
                <p>{activity.profile.email} · {genderLabel(activity.profile.gender)} · {ageLabel(activity.profile.ageGroup)} · {activity.profile.region || '지역 없음'} · {activity.profile.provider}</p>
                <p>가입 {when(activity.profile.joinedAt)} · 마지막 로그인 {when(activity.profile.lastSignInAt)}</p>
              </div>
              <button className="icon-button" onClick={() => setActivity(null)} aria-label="닫기">×</button>
            </div>
            <section>
              <h3>참여한 대화방 ({activity.rooms.length}) · 보관 중인 것만 표시</h3>
              {activity.rooms.map(room => (
                <article key={room.roomId}>
                  <strong>{room.topic}</strong>
                  <p>
                    {room.space ?? '장소 없음'} · {personaName(room.persona)} · {statusLabel[room.status]} · {when(room.createdAt)}
                    {room.isHost ? ' · 방장' : ''}
                    {'\n'}함께한 사람: {room.others.length ? room.others.map(other => other.nickname).join(', ') : room.capacity === 1 ? 'AI 캐릭터와 1:1' : '없음'}
                    {'\n'}이 회원의 발언 {room.messageCount}회
                    {room.warnings ? ` · 경고 ${room.warnings}회${room.restrictionReason ? ` (${room.restrictionReason})` : ''}` : ''}
                  </p>
                  <button className="btn btn-secondary" style={{ padding: '.4rem .6rem' }} disabled={busy} onClick={() => void openConversation(room.roomId)}>대화 보기</button>
                </article>
              ))}
              {!activity.rooms.length && <p>보관 중인 대화방 기록이 없습니다. 종료 후 30일이 지난 대화는 삭제됩니다.</p>}
            </section>
          </article>
        </div>
      )}

      {conversation && (
        <div role="dialog" aria-modal="true" className="super-admin-modal-backdrop" style={{ zIndex: 40 }}>
          <article className="card super-admin-report-modal">
            <div className="super-admin-section-heading">
              <div>
                <h2>{conversation.room.topic}</h2>
                <p>
                  {conversation.room.space ?? '장소 없음'} · {personaName(conversation.room.persona)} · {when(conversation.room.createdAt)}
                  {'\n'}참가자: {conversation.members.map(member => member.nickname).join(', ')}
                </p>
              </div>
              <button className="icon-button" onClick={() => setConversation(null)} aria-label="닫기">×</button>
            </div>
            <section>
              {conversation.messages.map(message => (
                <article className={message.kind === 'host' ? 'ai' : ''} key={message.id}>
                  <strong>{message.kind === 'host' ? `${personaName(conversation.room.persona)} (AI)` : message.nickname} · {when(message.createdAt)}</strong>
                  <p>{message.text}</p>
                </article>
              ))}
              {!conversation.messages.length && <p>저장된 발언이 없습니다.</p>}
            </section>
          </article>
        </div>
      )}
    </section>
  );
};
