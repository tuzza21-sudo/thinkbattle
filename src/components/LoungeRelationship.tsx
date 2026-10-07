import type { RelationshipView } from '../lib/relationship/types';

// Players see the relationship stage and qualitative labels. Raw scores, mood and
// the event log appear only when the API returns developer debug data.
export function LoungeRelationship({ view }: { view: RelationshipView }) {
  const debug = view.debug;
  return <details className="lounge-relationship">
    <summary><span>관계</span><strong>{view.macroState.label}</strong></summary>
    <dl>{Object.entries(view.metrics).map(([id, metric]) => <div key={id}>
      <dt>{metric.name}</dt>
      <dd>{metric.label}{metric.score !== undefined && <b>{metric.score}</b>}</dd>
    </div>)}</dl>
    <section className="lounge-relationship-memory" aria-label="기억하는 이야기">
      <h3>기억하는 이야기</h3>
      {view.remembered?.length
        ? <ul>{view.remembered.map((item, index) => <li key={`${item.kind}-${index}`}><span>{item.label}</span>{item.summary}{item.followUp && <small>다음에 물어볼 것: {item.followUp}</small>}</li>)}</ul>
        : <p>아직 기억하는 이야기가 없어요. 다음에도 이어 갈 만한 이야기를 나누면 여기에 남아요.</p>}
      <p className="lounge-relationship-memory-note">건강, 종교, 연락처 같은 민감한 이야기는 기억하지 않아요.</p>
    </section>
    {debug && <div className="lounge-relationship-debug" aria-label="개발자용 관계 상태">
      <p>{view.macroState.id} · {debug.turnCount}턴(의미 {debug.meaningfulTurns}) · v{debug.version}{debug.pending.direction ? ` · ${debug.pending.direction === 'up' ? '승급' : '강등'} 대기 ${debug.pending.turns}` : ''}</p>
      {view.styleExamples !== undefined && <p>말투 예문 {view.styleExamples ? '사용' : '미사용'}</p>}
      <p>기분 {Object.entries(debug.mood).map(([key, value]) => `${key} ${value}`).join(' · ')}</p>
      {debug.recentEvents.length > 0 && <p>최근 이벤트 {debug.recentEvents.slice(-6).map(event => `${event.turn}:${event.type}`).join(', ')}</p>}
      {debug.memories.length > 0 && <ul>{debug.memories.slice(0, 5).map(memory => <li key={`${memory.turn}-${memory.type}`}>{memory.summary} <small>({memory.importance})</small></li>)}</ul>}
    </div>}
  </details>;
}
