import { useState } from 'react';
import { createSessionConfig, getSessionTotals, SESSION_STAGES, validateSessionConfig, type LiveSessionConfig } from '../lib/liveDebateSession';
import './SessionSettings.css';

export const SessionSettings = ({ value, teamSize, onChange, language = 'ko' }: {
  value: LiveSessionConfig; teamSize: number; onChange: (value: LiveSessionConfig) => void; language?: 'ko' | 'en';
}) => {
  const en = language === 'en';
  const [detailed, setDetailed] = useState(false);
  const totals = getSessionTotals(value);
  const error = validateSessionConfig(value, teamSize);
  const duration = (seconds: number) => `${Math.floor(seconds / 60)}${en ? 'm' : '분'}${seconds % 60 ? ` ${seconds % 60}${en ? 's' : '초'}` : ''}`;
  const updateStage = (index: number, patch: Partial<LiveSessionConfig['stages'][number]>) => onChange({ ...value, stages: value.stages.map((stage, i) => i === index ? { ...stage, ...patch } : stage) });
  return <div className="session-settings">
    <div className="session-presets" aria-label={en ? 'Duration presets' : '시간 프리셋'}>{[600, 900, 1200].map(seconds => <button type="button" key={seconds} aria-pressed={totals.debateSeconds === seconds} onClick={() => onChange({ ...createSessionConfig(seconds, teamSize), progressionMode: value.progressionMode, assignmentMode: value.assignmentMode, strategySeconds: value.strategySeconds })}>{seconds / 60}{en ? ' min' : '분'}{seconds === 900 && <small>{en ? 'Standard' : '기본'}</small>}</button>)}</div>
    <p className="session-help">{en ? '10 min: quick practice · 15 min: standard · 20 min: extended discussion' : '10분은 핵심 쟁점 연습 · 15분은 기본 토론 · 20분은 심화 토론'}</p>
    <div className="session-settings-heading"><strong>{en ? 'Time per side' : '단계별 한 팀의 시간'}</strong><label><input type="checkbox" checked={detailed} onChange={event => setDetailed(event.target.checked)} />{en ? 'Set each side separately' : '찬성·반대 따로 설정'}</label></div>
    {value.stages.map((stage, index) => <div className="session-stage-setting" key={stage.id}>
      <label><input type="checkbox" checked={stage.enabled} onChange={event => updateStage(index, { enabled: event.target.checked })} />{en ? ['Opening', 'Cross-examination', 'Rebuttal', 'Closing'][index] : SESSION_STAGES[index].label}</label>
      <div className="session-time-inputs">{(detailed ? ['affirmative', 'negative'] as const : ['affirmative'] as const).map(side => <label key={side}>
        <span>{detailed ? (side === 'affirmative' ? (en ? 'Affirmative' : '찬성') : (en ? 'Negative' : '반대')) : (en ? 'Each side' : '각 팀')}</span>
        <select disabled={!stage.enabled} value={stage[`${side}Seconds`]} aria-label={`${SESSION_STAGES[index].label} ${side === 'affirmative' ? '찬성' : '반대'} 시간`} onChange={event => updateStage(index, detailed ? { [`${side}Seconds`]: Number(event.target.value) } : { affirmativeSeconds: Number(event.target.value), negativeSeconds: Number(event.target.value) })}>{Array.from({ length: 59 }, (_, i) => 30 + i * 15).map(seconds => <option key={seconds} value={seconds}>{duration(seconds)}</option>)}</select>
      </label>)}</div>
      {!detailed && stage.affirmativeSeconds !== stage.negativeSeconds && <small>{en ? 'Negative' : '반대'}: {duration(stage.negativeSeconds)}</small>}
    </div>)}
    <p className="session-help">{en ? 'In each cross-examination session, the leading side asks and the other side answers, with no limit on exchanges.' : '교차질문은 해당 측이 질문하고 상대 측이 답변합니다. 세션 시간 안에서 횟수 제한 없이 이어갑니다.'}</p>
    <fieldset><legend>{en ? 'When time runs out' : '시간 종료 방식'}</legend><label><input type="radio" name="session-progression" checked={value.progressionMode === 'automatic'} onChange={() => onChange({ ...value, progressionMode: 'automatic' })} />{en ? 'Automatic progression' : '자동진행'}<small>{en ? 'Move to the next session at zero.' : '시간이 끝나면 다음 세션으로 이동'}</small></label><label><input type="radio" name="session-progression" checked={value.progressionMode === 'moderated'} onChange={() => onChange({ ...value, progressionMode: 'moderated' })} />{en ? 'Moderator progression' : '진행자 진행'}<small>{en ? 'Show overtime until the host or moderator advances.' : '초과시간을 표시하고 방장·진행자가 다음 세션 시작'}</small></label></fieldset>
    {teamSize > 1 && <><label className="session-strategy-toggle"><input type="checkbox" checked={value.strategySeconds === 60} onChange={event => onChange({ ...value, strategySeconds: event.target.checked ? 60 : 0 })} /><span>{en ? '1-minute team strategy intervals' : '팀 작전시간 각 1분'}<small>{en ? 'Before cross-examination and rebuttal; both teams simultaneously.' : '교차질문 전·반박 전, 양 팀 동시에 진행 · 팀 채팅 사용'}</small></span></label><fieldset><legend>{en ? 'Team participation' : '팀 내 발언 방식'}</legend><label><input type="radio" name="session-assignment" checked={value.assignmentMode === 'free'} onChange={() => onChange({ ...value, assignmentMode: 'free' })} />{en ? 'Anyone on the team' : '자유 참여'}<small>{en ? 'Any teammate may speak in an eligible session.' : '발언 가능한 세션에 팀원 누구나 참여'}</small></label><label><input type="radio" name="session-assignment" checked={value.assignmentMode === 'assigned'} onChange={() => onChange({ ...value, assignmentMode: 'assigned' })} />{en ? 'Assigned speakers' : '단계별 담당자'}<small>{en ? 'Assign each stage in the lobby.' : '로비에서 단계별 담당자를 배정'}</small></label></fieldset></>}
    <div className="session-total"><strong>{en ? 'Total' : '총 예상시간'} {duration(totals.totalSeconds)}</strong><span>{en ? 'Debate' : '토론'} {duration(totals.debateSeconds)}{totals.strategySeconds > 0 && ` + ${en ? 'strategy' : '작전'} ${duration(totals.strategySeconds)}`}</span></div>
    {error && <p role="alert" className="session-error">{error}</p>}
  </div>;
};
