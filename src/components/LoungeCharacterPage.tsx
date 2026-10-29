import { useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronDown, Heart, LoaderCircle, MessageCircle, Pencil, Send, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import { getLoungeHost, isLoungeCustomCharacterId, loungeCharacterProfiles, loungeHosts } from '../lib/lounge';
import { getLoungeCharacter, koreanSubject, koreanWith, loungeCharacters } from '../lib/loungeCharacters';
import { defaultEventEffects, metricName, relationshipConfigs, type RelationshipConfig, type RelationshipEventType } from '../lib/relationship';
import { setLoungeCustomStatus, startLoungeCustomChat } from '../lib/loungeApi';
import { useLoungeCustomCharacter } from '../lib/loungeCustomClient';
import type { LoungeCustomCharacterRow } from '../lib/loungeCustomCharacters';
import { LoungeHostPortrait } from './LoungeHostPortrait';
import { LoungeCharacterGallery } from './LoungeCharacterGallery';
import { LoungeScenarioCards } from './LoungeScenarioCards';
import { useLoungeScenarios } from '../lib/useLoungeScenarios';
import './LoungeCharacter.css';

/** The metrics an event moves in this character's configuration, largest first. */
function effectChips(config: RelationshipConfig, event: RelationshipEventType, direction: 1 | -1) {
  const deltas = (config.events[event] ?? defaultEventEffects[event]).deltas;
  return Object.entries(deltas).filter(([, value]) => (value ?? 0) * direction > 0)
    .sort((a, b) => Math.abs(b[1] ?? 0) - Math.abs(a[1] ?? 0)).slice(0, 3)
    .map(([metric, value]) => ({ name: metricName(config, metric), strong: Math.abs(value ?? 0) >= 4 }));
}

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

/**
 * A character's page, opened straight from the home (2026-10-29: the summary sheet in between is gone): their photo at
 * work with the name over it and the card's line under it, then the way into a conversation, a story from their life,
 * their temperament, the stories to start and the gallery. What moves the relationship is folded away at the end.
 */
export function LoungeCharacterPage({ id, user }: { id: string; user: AppUser | null }) {
  const custom = useLoungeCustomCharacter(id);
  const scenarios = useLoungeScenarios(id);
  if (custom.missing) return <main className="lounge-join-gate"><Users size={40} /><h1>찾을 수 없는 인물이에요</h1><p>만든 사람이 지웠거나 공개되지 않은 캐릭터예요.</p><Link to="/lounge">라운지로 돌아가기</Link></main>;
  if (!custom.ready) return <main className="lounge-join-gate"><LoaderCircle size={32} className="lounge-spin" /><h1>인물을 불러오는 중…</h1></main>;
  const character = getLoungeCharacter(id);
  if (!character) return <main className="lounge-join-gate"><Users size={40} /><h1>찾을 수 없는 인물이에요</h1><Link to="/lounge">라운지로 돌아가기</Link></main>;
  const host = getLoungeHost(character.id);
  const night = character.id === 'velvet';
  const made = isLoungeCustomCharacterId(character.id);
  const config = relationshipConfigs[character.id];
  const chips = (event: RelationshipEventType, direction: 1 | -1) => <span className={`lounge-character-effects ${direction > 0 ? 'up' : 'down'}`}>{effectChips(config, event, direction).map(chip => <i key={chip.name} className={chip.strong ? 'strong' : ''}>{chip.name} {direction > 0 ? chip.strong ? '▲▲' : '▲' : chip.strong ? '▼▼' : '▼'}</i>)}</span>;
  const nameOf = (hostId: string) => loungeCharacters.find(item => item.id === hostId)?.name ?? getLoungeHost(hostId).name;
  const profile = made ? undefined : loungeCharacterProfiles[character.id];
  // A conversation with a house character starts from one of its stories, listed further down.
  const toStories = () => document.getElementById('stories')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const moves = config && (character.wins?.length > 0 || character.losses?.length > 0);

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
      <header className="lounge-character-head">
        {!made && <span className="lounge-character-eyebrow">{host.tag}</span>}
        <h1>{character.name}<small>{character.job}{!made && ` · ${character.age}`}</small></h1>
      </header>
      <div className="lounge-character-intro">
        <p className="lounge-character-tagline">{character.tagline}</p>
        {profile && <ul className="lounge-character-chips">{profile.traits.map(trait => <li key={trait}>{trait}</li>)}</ul>}
        {profile && <p className="lounge-character-summary">{profile.summary}</p>}
        <dl className="lounge-character-facts">
          <div><dt>하는 일</dt><dd>{character.role}</dd></div>
          {made && <div><dt>관계</dt><dd>{host.tag}</dd></div>}
        </dl>
        {made ? custom.row && <CustomActions row={custom.row} user={user} />
          : scenarios?.length !== 0 && <div className="lounge-character-actions lounge-character-start">
            <button type="button" className="lounge-character-cta" onClick={toStories}><MessageCircle size={17} />대화 시작하기</button>
            <span className="lounge-character-cta-note">{scenarios ? `함께할 이야기 ${scenarios.length}개 중에서 골라요` : '이야기를 불러오는 중…'}</span>
          </div>}
      </div>
    </section>

    <section className="lounge-character-section lounge-character-story">
      <h2>{made ? '살아온 이야기' : '일화'}</h2>
      {character.story.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </section>

    <section className="lounge-character-section">
      <h2>성격</h2>
      <div className="lounge-character-traits">{character.personality.map(item => <article key={item.label}><h3>{item.label}</h3><p>{item.text}</p></article>)}</div>
    </section>

    {character.tastes && <section className="lounge-character-section">
      <h2>취향</h2>
      <div className="lounge-character-traits">{character.tastes.split('\n').map(line => line.trim()).filter(Boolean).map((line, index) => { const [label, ...rest] = line.split(/[:：]/); return rest.length ? <article key={index}><h3>{label.trim()}</h3><p>{rest.join(':').trim()}</p></article> : <article key={index}><p>{line}</p></article>; })}</div>
    </section>}

    {!made && scenarios && <LoungeScenarioCards scenarios={scenarios} user={user} />}

    <LoungeCharacterGallery characterId={character.id} name={character.name} />

    {moves && <details className="lounge-character-section lounge-character-more">
      <summary><Heart size={18} /> {koreanWith(character.name)} 가까워지는 법<ChevronDown size={18} className="lounge-character-more-arrow" /></summary>
      {config && character.wins?.length > 0 && <section className="lounge-character-subsection">
        <h3 className="lounge-character-subtitle">이렇게 대화하면 마음이 열려요</h3>
        <p className="lounge-character-lead">대화 속에서 이런 모습이 보이면 {koreanSubject(character.name)} 당신을 다르게 보기 시작해요.</p>
        <div className="lounge-character-moves">{character.wins.map(move => <article key={move.event}>
          <header><h3>{move.title}</h3>{chips(move.event, 1)}</header>
          {move.example && <p className="lounge-character-example">{move.example}</p>}
          <p className="lounge-character-why"><b>왜 좋아할까</b>{move.why}</p>
        </article>)}</div>
        {character.gentle && <p className="lounge-character-gentle"><ShieldCheck size={16} />{character.gentle}</p>}
      </section>}
      {config && character.losses?.length > 0 && <section className="lounge-character-subsection">
        <h3 className="lounge-character-subtitle"><X size={16} /> 이런 대화는 통하지 않아요</h3>
        <div className="lounge-character-moves losses">{character.losses.map(move => <article key={move.event}>
          <header><h3>{move.title}</h3>{chips(move.event, -1)}</header>
          <p className="lounge-character-why"><b>왜 싫어할까</b>{move.why}</p>
        </article>)}</div>
      </section>}
    </details>}
  </main>;
}
