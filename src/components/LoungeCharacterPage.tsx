import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, DoorOpen, Headphones, Heart, ShieldCheck, Sparkles, Square, Swords, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getLoungeHost, getLoungeTheme, loungeHostGroups, loungeHosts, type LoungeSpace } from '../lib/lounge';
import { listLoungeSpaces } from '../lib/loungeApi';
import { getLoungeCharacter, koreanSubject, koreanWith, loungeCharacters } from '../lib/loungeCharacters';
import { defaultEventEffects, metricName, relationshipConfigs, type RelationshipConfig, type RelationshipEventType } from '../lib/relationship';
import { useLoungeVoicePreview } from '../lib/useLoungeVoicePreview';
import { LoungeHostPortrait } from './LoungeHostPortrait';
import './LoungeCharacter.css';

const subject = koreanSubject, together = koreanWith;
/** The metrics an event moves in this character's configuration, largest first. */
function effectChips(config: RelationshipConfig, event: RelationshipEventType, direction: 1 | -1) {
  const deltas = (config.events[event] ?? defaultEventEffects[event]).deltas;
  return Object.entries(deltas).filter(([, value]) => (value ?? 0) * direction > 0)
    .sort((a, b) => Math.abs(b[1] ?? 0) - Math.abs(a[1] ?? 0)).slice(0, 3)
    .map(([metric, value]) => ({ name: metricName(config, metric), strong: Math.abs(value ?? 0) >= 4 }));
}

export function LoungeCharacterPage({ id }: { id: string }) {
  const character = getLoungeCharacter(id);
  const { playing, error, listen, stop } = useLoungeVoicePreview();
  // The character's space, so the page leads straight into a conversation there.
  const [spaces, setSpaces] = useState<LoungeSpace[] | null>(null);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [id]);
  useEffect(() => { let active = true; void listLoungeSpaces().then(value => { if (active) setSpaces(value); }, () => { /* The button then leads to the house. */ }); return () => { active = false; }; }, []);
  if (!character) return <main className="lounge-join-gate"><Users size={40} /><h1>찾을 수 없는 인물이에요</h1><Link to="/lounge">라운지로 돌아가기</Link></main>;
  const host = getLoungeHost(character.id), theme = getLoungeTheme(character.place), config = relationshipConfigs[character.id];
  const group = loungeHostGroups.find(item => (item.hostIds as readonly string[]).includes(character.id));
  const stages = config.stages.filter(stage => stage.enabled !== false);
  const night = character.id === 'velvet';
  const chips = (event: RelationshipEventType, direction: 1 | -1) => <span className={`lounge-character-effects ${direction > 0 ? 'up' : 'down'}`}>{effectChips(config, event, direction).map(chip => <i key={chip.name} className={chip.strong ? 'strong' : ''}>{chip.name} {direction > 0 ? chip.strong ? '▲▲' : '▲' : chip.strong ? '▼▼' : '▼'}</i>)}</span>;
  const space = spaces?.find(item => item.host_persona === character.id);
  const soloLink = space ? `/lounge/spaces/${space.id}/solo` : '/lounge?mode=solo';
  const soloLabel = `${together(character.name)} 둘이서 이야기하기`;
  const nameOf = (hostId: string) => loungeCharacters.find(item => item.id === hostId)?.name ?? getLoungeHost(hostId).name;

  return <main className={`lounge-character ${night ? 'night' : ''}`} style={{ '--character-accent': host.color } as CSSProperties}>
    <nav className="lounge-character-nav" aria-label="라운지의 인물들">
      <Link to="/lounge" className="lounge-character-back"><ArrowLeft size={15} /> 상상의 집</Link>
      <div>{loungeHosts.map(item => <Link key={item.id} to={`/lounge/characters/${item.id}`} onClick={stop} aria-current={item.id === character.id ? 'page' : undefined} aria-label={`${nameOf(item.id)} · ${item.name}`} title={`${nameOf(item.id)} · ${item.name}`}><LoungeHostPortrait hostId={item.id} /></Link>)}</div>
    </nav>

    <section className="lounge-character-hero">
      <figure className={`lounge-character-photo ${character.fullBody ? '' : 'portrait'}`}>
        <img src={character.fullBody ?? host.portrait} alt={`${character.name}(${host.name})의 ${character.fullBody ? '전신 ' : ''}사진`} />
        <figcaption>AI로 만든 가상의 인물 사진</figcaption>
      </figure>
      <div className="lounge-character-intro">
        <span className="lounge-character-eyebrow">{space ? `${space.name}의 주인` : group ? `${group.title} · ${group.subtitle}` : '상상의 집'}</span>
        <h1>{character.name}<small>{host.name}</small></h1>
        <p className="lounge-character-tagline">{character.tagline}</p>
        <blockquote>“{character.quote}”</blockquote>
        <dl className="lounge-character-facts">
          <div><dt>나이</dt><dd>{character.age}</dd></div>
          <div><dt>하는 일</dt><dd>{character.role}</dd></div>
          <div><dt>자주 머무는 곳</dt><dd>{theme.name}</dd></div>
          <div><dt>인상</dt><dd>{character.look}</dd></div>
          <div><dt>목소리</dt><dd>{host.voiceLabel}</dd></div>
        </dl>
        <div className="lounge-character-actions">
          <Link className="lounge-character-cta" to={soloLink} onClick={stop}><Swords size={17} /> {soloLabel} <ArrowRight size={16} /></Link>
          {space && <Link className="lounge-character-secondary" to={`/lounge/spaces/${space.id}`} onClick={stop}><DoorOpen size={15} /> {space.name}에서 여럿이</Link>}
          <button type="button" className="lounge-character-secondary" onClick={() => void listen(host.id)} aria-pressed={playing === host.id}>{playing === host.id ? <Square size={14} /> : <Headphones size={15} />}{playing === host.id ? '듣기 중지' : '목소리 듣기'}</button>
        </div>
        {error && <p className="lounge-error" role="alert">{error}</p>}
      </div>
    </section>

    <section className="lounge-character-section lounge-character-story">
      <h2>이야기</h2>
      {character.story.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </section>

    {character.mystery && <section className="lounge-character-section">
      <h2>그녀에 대해 알려진 것</h2>
      <div className="lounge-character-mystery">{character.mystery.map(block => <article key={block.title}><h3>{block.title}</h3><ul>{block.items.map(item => <li key={item}>{item}</li>)}</ul></article>)}</div>
    </section>}

    <section className="lounge-character-section">
      <h2>성격</h2>
      <div className="lounge-character-traits">{character.personality.map(item => <article key={item.label}><h3>{item.label}</h3><p>{item.text}</p></article>)}</div>
      <h3 className="lounge-character-subtitle">말버릇과 습관</h3>
      <ul className="lounge-character-habits">{character.habits.map(habit => <li key={habit}>{habit}</li>)}</ul>
    </section>

    <section className="lounge-character-section">
      <h2>{subject(character.name)} 대화에서 보는 것</h2>
      <p className="lounge-character-lead">혼자 찾아와 둘이 이야기할 때는 누구에게나 쌓이는 신뢰·존중·흥미·편안함·마음 열기에 더해, {subject(character.name)} 특히 눈여겨보는 두 가지가 있어요.</p>
      <div className="lounge-character-lens">{config.uniqueMetrics.map(metric => <article key={metric.id}><h3><Sparkles size={15} />{metric.name}</h3><p>{metric.description}</p><ol>{metric.labels.map(label => <li key={label}>{label}</li>)}</ol></article>)}</div>
    </section>

    <section className="lounge-character-section">
      <h2><Heart size={19} /> 이렇게 대화하면 마음이 열려요</h2>
      <p className="lounge-character-lead">대화 속에서 이런 모습이 보이면 {subject(character.name)} 당신을 다르게 보기 시작해요. 그 이유는 위의 이야기 안에 있어요.</p>
      <div className="lounge-character-moves">{character.wins.map(move => <article key={move.event}>
        <header><h3>{move.title}</h3>{chips(move.event, 1)}</header>
        {move.example && <p className="lounge-character-example">{move.example}</p>}
        <p className="lounge-character-why"><b>왜 좋아할까</b>{move.why}</p>
      </article>)}</div>
      {character.gentle && <p className="lounge-character-gentle"><ShieldCheck size={16} />{character.gentle}</p>}
    </section>

    <section className="lounge-character-section">
      <h2><X size={19} /> 이런 대화는 통하지 않아요</h2>
      <div className="lounge-character-moves losses">{character.losses.map(move => <article key={move.event}>
        <header><h3>{move.title}</h3>{chips(move.event, -1)}</header>
        <p className="lounge-character-why"><b>왜 싫어할까</b>{move.why}</p>
      </article>)}</div>
    </section>

    <section className="lounge-character-section">
      <h2>관계가 깊어지는 단계</h2>
      <p className="lounge-character-lead">둘이 이야기할 때마다 쌓이고, 다른 손님과 함께일 때는 그대로 유지돼요. 점수나 단계 이름은 대화에서 말하지 않고, 말투와 태도로만 달라져요.</p>
      <ol className="lounge-character-stages">
        {stages.map((stage, index) => {
          const needs = Object.keys(stage.enter.min ?? {}).map(metric => metricName(config, metric));
          return <li key={stage.id}><span className="lounge-character-step">{index + 1}</span><div><h3>{stage.label}</h3><blockquote>“{stage.line}”</blockquote><p>{needs.length ? `필요한 것 · ${needs.join(' · ')}` : '처음 만났을 때'}</p></div></li>;
        })}
        {character.beyond && <li className="beyond"><span className="lounge-character-step">?</span><div><h3>그 너머</h3><p>{character.beyond}</p></div></li>}
      </ol>
    </section>

    <section className="lounge-character-section">
      <h2>{subject(character.name)} 하지 않는 것</h2>
      <ul className="lounge-character-boundaries">{character.boundaries.map(item => <li key={item}><ShieldCheck size={15} />{item}</li>)}</ul>
    </section>

    <section className="lounge-character-section">
      <h2>라운지의 다른 사람들</h2>
      <div className="lounge-character-relations">{character.relations.map(relation => <Link key={relation.with} to={`/lounge/characters/${relation.with}`} onClick={stop}><LoungeHostPortrait hostId={relation.with} /><div><strong>{nameOf(relation.with)} <small>{getLoungeHost(relation.with).name}</small></strong><p>{relation.text}</p></div><ArrowRight size={15} /></Link>)}</div>
    </section>

    <section className="lounge-character-closing">
      <p>{character.tagline}</p>
      <Link className="lounge-character-cta" to={soloLink} onClick={stop}><Swords size={17} /> {soloLabel} <ArrowRight size={16} /></Link>
      <small>가상의 인물 설정이에요. 이 이야기는 인물 소개를 위한 것이고, 대화 중에 캐릭터가 이 이야기를 그대로 들려주지는 않아요.</small>
    </section>
  </main>;
}
