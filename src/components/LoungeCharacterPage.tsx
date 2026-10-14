import { type CSSProperties } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getLoungeHost, loungeHosts } from '../lib/lounge';
import { getLoungeCharacter, loungeCharacters } from '../lib/loungeCharacters';
import { LoungeHostPortrait } from './LoungeHostPortrait';
import './LoungeCharacter.css';

/** A character's page: what they do, a story from their life and their temperament. The rest of the profile only feeds the conversation. */
export function LoungeCharacterPage({ id }: { id: string }) {
  const character = getLoungeCharacter(id);
  if (!character) return <main className="lounge-join-gate"><Users size={40} /><h1>찾을 수 없는 인물이에요</h1><Link to="/lounge">라운지로 돌아가기</Link></main>;
  const host = getLoungeHost(character.id);
  const night = character.id === 'velvet';
  const nameOf = (hostId: string) => loungeCharacters.find(item => item.id === hostId)?.name ?? getLoungeHost(hostId).name;

  return <main className={`lounge-character ${night ? 'night' : ''}`} style={{ '--character-accent': host.color } as CSSProperties}>
    <nav className="lounge-character-nav" aria-label="라운지의 인물들">
      <Link to="/lounge" className="lounge-character-back"><ArrowLeft size={15} /> 사석</Link>
      <div>{loungeHosts.map(item => <Link key={item.id} to={`/lounge/characters/${item.id}`} aria-current={item.id === character.id ? 'page' : undefined} aria-label={`${nameOf(item.id)} · ${item.name}`} title={`${nameOf(item.id)} · ${item.name}`}><LoungeHostPortrait hostId={item.id} /></Link>)}</div>
    </nav>

    <section className="lounge-character-hero">
      <figure className={`lounge-character-photo ${character.fullBody ? '' : 'portrait'}`}>
        <img src={character.fullBody ?? host.portrait} alt={`${character.name}(${host.name})의 ${character.fullBody ? '일하는 모습 ' : ''}사진`} />
        <figcaption>AI로 만든 가상의 인물 사진</figcaption>
      </figure>
      <div className="lounge-character-intro">
        <h1>{character.name}<small>{character.job}</small></h1>
        <dl className="lounge-character-facts">
          <div><dt>하는 일</dt><dd>{character.role}</dd></div>
        </dl>
        <section className="lounge-character-section lounge-character-story">
          <h2>일화</h2>
          {character.story.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </section>
      </div>
    </section>

    <section className="lounge-character-section">
      <h2>성격</h2>
      <div className="lounge-character-traits">{character.personality.map(item => <article key={item.label}><h3>{item.label}</h3><p>{item.text}</p></article>)}</div>
    </section>
  </main>;
}
