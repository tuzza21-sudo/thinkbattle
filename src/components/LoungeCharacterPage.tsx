import { useState, type CSSProperties } from 'react';
import { ArrowLeft, LoaderCircle, MessageCircle, Pencil, Send, Trash2, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { getLoungeHost, isLoungeCustomCharacterId, loungeHosts } from '../lib/lounge';
import { getLoungeCharacter, koreanWith, loungeCharacters } from '../lib/loungeCharacters';
import { setLoungeCustomStatus, startLoungeCustomChat } from '../lib/loungeApi';
import { useLoungeCustomCharacter } from '../lib/loungeCustomClient';
import type { LoungeCustomCharacterRow } from '../lib/loungeCustomCharacters';
import { LoungeHostPortrait } from './LoungeHostPortrait';
import { LoungeCharacterGallery } from './LoungeCharacterGallery';
import { LoungeScenarioCards } from './LoungeScenarioCards';
import './LoungeCharacter.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : '잠시 연결이 어려워요. 다시 시도해 주세요.';
const statusLabels: Record<LoungeCustomCharacterRow['status'], string> = { private: '나만 대화할 수 있어요', pending: '공개 검수 중이에요', public: '모두가 대화할 수 있어요', rejected: '공개가 반려됐어요' };

/** What a member can do with a character someone made: talk, and for its creator edit, publish or delete. */
function CustomActions({ row, user }: { row: LoungeCustomCharacterRow; user: AppUser | null }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState(row.status);
  const [error, setError] = useState('');
  const mine = user?.id === row.owner_id;
  const run = async (kind: string, task: () => Promise<void>) => {
    setBusy(kind); setError('');
    try { await task(); } catch (err) { setError(errorText(err)); } finally { setBusy(null); }
  };
  return <>
    <div className="lounge-character-actions">
      {user ? <button type="button" className="lounge-character-cta" disabled={Boolean(busy)} onClick={() => void run('chat', async () => navigate(`/lounge/${await startLoungeCustomChat(row.id, user.nickname)}`))}>{busy === 'chat' ? <LoaderCircle size={16} className="lounge-spin" /> : <MessageCircle size={16} />}{koreanWith(row.name)} 대화하기</button>
        : <Link to="/lounge" className="lounge-character-cta"><MessageCircle size={16} />로그인하고 대화하기</Link>}
      {mine && <Link to={`/lounge/create/${row.id}`} className="lounge-character-secondary"><Pencil size={15} />고치기</Link>}
      {mine && (status === 'private' || status === 'rejected') && <button type="button" className="lounge-character-secondary" disabled={Boolean(busy)} onClick={() => void run('submit', async () => setStatus(await setLoungeCustomStatus(row.id, 'submit') as LoungeCustomCharacterRow['status']))}><Send size={15} />공개 신청</button>}
      {mine && (status === 'public' || status === 'pending') && <button type="button" className="lounge-character-secondary" disabled={Boolean(busy)} onClick={() => void run('private', async () => setStatus(await setLoungeCustomStatus(row.id, 'private') as LoungeCustomCharacterRow['status']))}>나만 보기로 바꾸기</button>}
      {mine && <button type="button" className="lounge-character-secondary" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`${row.name}을(를) 지울까요? 대화 기록과 관계는 다시 되돌릴 수 없어요.`)) void run('delete', async () => { await setLoungeCustomStatus(row.id, 'delete'); navigate('/lounge'); }); }}><Trash2 size={15} />지우기</button>}
    </div>
    {mine && <p className="lounge-character-lead">{statusLabels[status]}{status === 'rejected' && row.review_note ? ` · ${row.review_note}` : ''}</p>}
    {error && <p className="lounge-creator-notice error" role="alert">{error}</p>}
  </>;
}

/** A character's page: what they do, a story from their life and their temperament. The rest of the profile only feeds the conversation. */
export function LoungeCharacterPage({ id, user }: { id: string; user: AppUser | null }) {
  const custom = useLoungeCustomCharacter(id);
  if (custom.missing) return <main className="lounge-join-gate"><Users size={40} /><h1>찾을 수 없는 인물이에요</h1><p>만든 사람이 지웠거나 공개되지 않은 캐릭터예요.</p><Link to="/lounge">라운지로 돌아가기</Link></main>;
  if (!custom.ready) return <main className="lounge-join-gate"><LoaderCircle size={32} className="lounge-spin" /><h1>인물을 불러오는 중…</h1></main>;
  const character = getLoungeCharacter(id);
  if (!character) return <main className="lounge-join-gate"><Users size={40} /><h1>찾을 수 없는 인물이에요</h1><Link to="/lounge">라운지로 돌아가기</Link></main>;
  const host = getLoungeHost(character.id);
  const night = character.id === 'velvet';
  const made = isLoungeCustomCharacterId(character.id);
  const nameOf = (hostId: string) => loungeCharacters.find(item => item.id === hostId)?.name ?? getLoungeHost(hostId).name;

  return <main className={`lounge-character ${night ? 'night' : ''}`} style={{ '--character-accent': host.color } as CSSProperties}>
    <nav className="lounge-character-nav" aria-label="라운지의 인물들">
      <Link to="/lounge" className="lounge-character-back"><ArrowLeft size={15} /> 사석</Link>
      {!made && <div>{loungeHosts.map(item => <Link key={item.id} to={`/lounge/characters/${item.id}`} aria-current={item.id === character.id ? 'page' : undefined} aria-label={`${nameOf(item.id)} · ${item.name}`} title={`${nameOf(item.id)} · ${item.name}`}><LoungeHostPortrait hostId={item.id} /></Link>)}</div>}
    </nav>

    <section className="lounge-character-hero">
      <figure className={`lounge-character-photo ${character.fullBody || made ? '' : 'portrait'}`}>
        {character.fullBody ?? host.portrait ? <img src={character.fullBody ?? host.portrait} alt={`${character.name}의 ${character.fullBody ? '일하는 모습 ' : ''}사진`} /> : <span className="lounge-character-photo-empty">{host.emoji}</span>}
        <figcaption>{made ? '회원이 만든 가상의 인물' : 'AI로 만든 가상의 인물 사진'}</figcaption>
      </figure>
      <div className="lounge-character-intro">
        <h1>{character.name}<small>{character.job}</small></h1>
        {made && <p className="lounge-character-tagline">{character.tagline}</p>}
        <dl className="lounge-character-facts">
          <div><dt>하는 일</dt><dd>{character.role}</dd></div>
          {made && <div><dt>관계</dt><dd>{host.tag}</dd></div>}
        </dl>
        {made && custom.row && <CustomActions row={custom.row} user={user} />}
        <section className="lounge-character-section lounge-character-story">
          <h2>{made ? '살아온 이야기' : '일화'}</h2>
          {character.story.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </section>
      </div>
    </section>

    <section className="lounge-character-section">
      <h2>성격</h2>
      <div className="lounge-character-traits">{character.personality.map(item => <article key={item.label}><h3>{item.label}</h3><p>{item.text}</p></article>)}</div>
    </section>

    {character.tastes && <section className="lounge-character-section">
      <h2>취향</h2>
      <div className="lounge-character-traits">{character.tastes.split('\n').map(line => line.trim()).filter(Boolean).map((line, index) => { const [label, ...rest] = line.split(/[:：]/); return rest.length ? <article key={index}><h3>{label.trim()}</h3><p>{rest.join(':').trim()}</p></article> : <article key={index}><p>{line}</p></article>; })}</div>
    </section>}

    {!made && <LoungeScenarioCards characterId={character.id} user={user} />}

    <LoungeCharacterGallery characterId={character.id} name={character.name} />
  </main>;
}
