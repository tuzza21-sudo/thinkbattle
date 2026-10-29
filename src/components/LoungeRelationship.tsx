import { useEffect, useState } from 'react';
import { Heart, Sparkles } from 'lucide-react';
import type { RelationshipChange, RelationshipView } from '../lib/relationship/types';

/** A turn's change as the page keeps it; `id` tells one change from the next. */
export type LoungeRelationshipChange = RelationshipChange & { id: number };

/** How long what one message changed stays on the card. */
const changeShownMs = 6500;

// The relationship's status card in the chat: the stage, how close the next one is, and, for a moment after each reply,
// what the member's message did and the scores it moved (a stage change gets its own line). Opened, it shows every
// score as a bar and what the character remembers. Mood and the event log appear only for developers.
export function LoungeRelationship({ view, change }: { view: RelationshipView; change?: LoungeRelationshipChange | null }) {
  const [shown, setShown] = useState<LoungeRelationshipChange | null>(null);
  useEffect(() => {
    if (!change || (!change.events.length && !Object.keys(change.delta).length && !change.stage)) return;
    setShown(change);
    const timer = window.setTimeout(() => setShown(current => current?.id === change.id ? null : current), changeShownMs);
    return () => window.clearTimeout(timer);
  }, [change]);
  const debug = view.debug;
  const stage = view.stage;
  const progress = Math.round((stage?.progress ?? 0) * 100);
  const deltas = shown ? Object.entries(shown.delta).filter(([metric]) => view.metrics[metric]) : [];
  // Against what the next stage asks: the scores already there (closest to done first) and the ones still short (furthest first).
  const asked = Object.values(view.metrics).filter(metric => metric.need);
  const ready = asked.filter(metric => (metric.score ?? 0) >= metric.need!).sort((a, b) => (b.score ?? 0) / b.need! - (a.score ?? 0) / a.need!).slice(0, 2);
  const short = asked.filter(metric => (metric.score ?? 0) < metric.need!).sort((a, b) => (b.need! - (b.score ?? 0)) - (a.need! - (a.score ?? 0))).slice(0, 2);
  return <div className={`lounge-relationship ${shown?.stage === 'promoted' ? 'celebrating' : ''}`}>
    <details>
      <summary>
        <Heart size={13} aria-hidden="true" className="lounge-relationship-heart" />
        {stage && <span className="lounge-relationship-steps" aria-label={`${stage.total}단계 중 ${stage.index + 1}단계`}>
          {Array.from({ length: stage.total }, (_, index) => <i key={index} className={index <= stage.index ? 'on' : ''} />)}
        </span>}
        <strong>{view.macroState.label}</strong>
        {stage?.next && <span className="lounge-relationship-meter" role="progressbar" aria-label={`다음 단계 ${stage.next}까지`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <i style={{ width: `${progress}%` }} />
        </span>}
      </summary>
      <div className="lounge-relationship-panel">
        {stage && <p className="lounge-relationship-line">“{stage.line}”</p>}
        <p className="lounge-relationship-next">{stage?.next ? <>다음 단계 <b>{stage.next}</b> · {progress}%</> : '가장 가까운 사이예요.'}</p>
        {(ready.length > 0 || short.length > 0) && <p className="lounge-relationship-focus">
          {ready.length > 0 && <span className="met">잘 쌓이고 있어요 · <b>{ready.map(metric => metric.name).join(', ')}</b></span>}
          {short.length > 0 && <span className="short">더 필요해요 · <b>{short.map(metric => metric.name).join(', ')}</b></span>}
        </p>}
        <ul className="lounge-relationship-bars">{Object.entries(view.metrics).map(([id, metric]) => {
          const state = !metric.need ? '' : (metric.score ?? 0) >= metric.need ? 'met' : 'short';
          return <li key={id} className={state}>
            <span>{metric.name}</span>
            <span className="lounge-relationship-bar"><i style={{ width: `${metric.score ?? 0}%` }} />{metric.need && <em style={{ left: `${metric.need}%` }} title={`다음 단계에 필요한 만큼 (${metric.need})`} />}</span>
            <small>{metric.label}{state && <b>{state === 'met' ? '충분' : `${metric.need! - (metric.score ?? 0)} 부족`}</b>}</small>
          </li>;
        })}</ul>
        {asked.length > 0 && <p className="lounge-relationship-legend">막대의 세로선은 다음 단계에 필요한 만큼이에요.</p>}
        <section className="lounge-relationship-memory" aria-label="기억하는 이야기">
          <h3>기억하는 이야기</h3>
          {view.remembered?.length
            ? <ul>{view.remembered.map((item, index) => <li key={`${item.kind}-${index}`}><span>{item.label}</span>{item.summary}{item.followUp && <small>다음에 물어볼 것: {item.followUp}</small>}</li>)}</ul>
            : <p>아직 기억하는 이야기가 없어요. 다음에도 이어 갈 만한 이야기를 나누면 여기에 남아요.</p>}
          <p className="lounge-relationship-memory-note">건강, 종교, 연락처 같은 민감한 이야기는 기억하지 않아요.</p>
        </section>
        {debug && <div className="lounge-relationship-debug" aria-label="개발자용 관계 상태">
          <p>{view.macroState.id} · {debug.turnCount}턴(의미 {debug.meaningfulTurns}) · v{debug.version}{debug.pending.direction ? ` · ${debug.pending.direction === 'up' ? '승급' : '강등'} 대기 ${debug.pending.turns}` : ''}</p>
          <p>점수 {Object.entries(debug.scores).map(([key, value]) => `${key} ${value}`).join(' · ')}</p>
          <p>기분 {Object.entries(debug.mood).map(([key, value]) => `${key} ${value}`).join(' · ')}</p>
          {debug.recentEvents.length > 0 && <p>최근 이벤트 {debug.recentEvents.slice(-6).map(event => `${event.turn}:${event.type}`).join(', ')}</p>}
          {debug.memories.length > 0 && <ul>{debug.memories.slice(0, 5).map(memory => <li key={`${memory.turn}-${memory.type}`}>{memory.summary} <small>({memory.importance})</small></li>)}</ul>}
        </div>}
      </div>
    </details>
    <div className="lounge-relationship-change" aria-live="polite">
      {shown && <div key={shown.id}>
        {shown.stage === 'promoted' && <p className="lounge-relationship-stage up"><Sparkles size={13} aria-hidden="true" /> 한 걸음 가까워졌어요 · <b>{view.macroState.label}</b></p>}
        {shown.stage === 'demoted' && <p className="lounge-relationship-stage down">거리가 조금 멀어졌어요 · <b>{view.macroState.label}</b></p>}
        <ul>
          {shown.events.map((event, index) => <li key={`e-${event.type}`} className={event.up ? 'up' : 'down'} style={{ animationDelay: `${index * 90}ms` }}>{event.label}</li>)}
          {deltas.map(([metric, value], index) => <li key={`d-${metric}`} className={`delta ${value > 0 ? 'up' : 'down'}`} style={{ animationDelay: `${(shown.events.length + index) * 90}ms` }}>
            {view.metrics[metric].name} {value > 0 ? `+${value}` : value}
          </li>)}
        </ul>
      </div>}
    </div>
  </div>;
}
