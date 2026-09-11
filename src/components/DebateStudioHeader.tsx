import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Clock3, Mic2, Pause, Play, Sparkles, Volume2, VolumeX } from 'lucide-react';
import type { BattleState, DebateStep } from '../types';
import { getDebateLevelLabel, getPositionLabel } from '../lib/debateEngine';

interface DebateStudioHeaderProps {
  battle: BattleState;
  steps: DebateStep[];
  currentIndex: number;
  remaining: number;
  overtime: number;
  paused: boolean;
  thinking: boolean;
  speaking: boolean;
  voiceMode: 'quality' | 'off';
  onVoiceModeChange: (mode: 'quality' | 'off') => void;
  onPauseToggle: () => void;
}

const timer = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

export function DebateStudioHeader({ battle, steps, currentIndex, remaining, overtime, paused, thinking, speaking, voiceMode, onVoiceModeChange, onPauseToggle }: DebateStudioHeaderProps) {
  const en = battle.language === 'en';
  const status = battle.isFinished ? (en ? 'Completed' : '토론 종료') : paused ? (en ? 'Paused' : '일시정지') : (en ? 'In session' : '토론 진행 중');
  const side = (own: boolean) => en ? ((own ? battle.userPosition : battle.aiPosition) === 'affirmative' ? 'Government' : 'Opposition') : getPositionLabel((own ? battle.userPosition : battle.aiPosition) ?? 'affirmative');
  return <>
    <header className="studio-topbar">
      <div className="studio-brand-group"><Link className="studio-back" to="/debate" aria-label={en ? 'Back to debate lobby' : '토론 로비로 돌아가기'}><ArrowLeft size={18} /></Link><Link className="studio-brand" to="/debate"><img src="/brand/thinkfit-mark.svg" alt="" />ThinkFit<span>DEBATE STUDIO</span></Link></div>
      <span className={`studio-session-status ${paused || battle.isFinished ? 'inactive' : ''}`}><i />{status}</span>
    </header>
    <div className="studio-topic-row">
      <div className="studio-topic"><span className="studio-eyebrow">{en ? 'THE MOTION' : '오늘의 논제'}<span>AI {en ? 'sparring' : '스파링'} · {en ? battle.debateLevel : getDebateLevelLabel(battle.debateLevel ?? 'beginner')}</span></span><h1>{battle.topic}</h1></div>
      <div className="studio-tools">
        <button type="button" className={`studio-tool ${voiceMode !== 'off' ? 'enabled' : ''}`} onClick={() => onVoiceModeChange(voiceMode === 'off' ? 'quality' : 'off')} aria-pressed={voiceMode !== 'off'} title={en ? 'Toggle opponent voice' : '상대 AI 음성 켜기 / 끄기'}>{voiceMode === 'off' ? <VolumeX size={17} /> : <Volume2 size={17} />}<span>{en ? 'AI voice' : 'AI 음성'}</span></button>
        <button type="button" className="studio-tool" onClick={onPauseToggle} disabled={battle.isFinished}>{paused ? <Play size={17} /> : <Pause size={17} />}<span>{paused ? (en ? 'Resume' : '계속하기') : (en ? 'Pause' : '잠시 멈춤')}</span></button>
      </div>
    </div>
    <section className="studio-floor" aria-label={en ? 'Debate participants' : '토론 참여자'}>
      {[true, false].map(own => <div key={String(own)} className={`studio-seat ${own ? 'own' : 'opponent'} ${!battle.isFinished && !paused && (own ? !thinking && !speaking : speaking) ? 'active' : ''}`}>
        <div className="studio-seat-icon">{own ? <Mic2 size={24} /> : <Sparkles size={24} />}</div>
        <div className="studio-seat-copy"><span>{side(own)}<b>{own ? (en ? 'YOU' : '나') : 'AI'}</b></span><strong>{own ? battle.playerA.name.split(' · ')[0] : en ? 'Your debate opponent' : 'AI 토론 상대'}</strong><small>{own ? (en ? 'Build your case in your own words' : '내 생각을 나의 언어로') : (en ? 'Listening, questioning, responding' : '듣고, 질문하고, 논증하는 상대')}</small></div>
        <div className="studio-seat-state">{!battle.isFinished && !paused && (own ? !thinking && !speaking : speaking) ? <><div className={`studio-wave ${!own ? 'speaking' : ''}`} aria-hidden="true"><i /><i /><i /><i /><i /></div><span>{own ? (en ? 'Your turn' : '내 차례') : (en ? 'Speaking' : '발언 중')}</span></> : <><i className="studio-presence" /><span>{battle.isFinished ? (en ? 'Finished' : '완료') : paused ? (en ? 'Paused' : '잠시 멈춤') : !own && thinking ? (en ? 'Preparing' : '응답 준비 중') : (en ? 'Listening' : '경청 중')}</span></>}</div>
      </div>)}
      <div className={`studio-clock ${overtime > 0 ? 'over' : remaining <= 30 ? 'soon' : ''}`}><span><Clock3 size={13} />{en ? 'Suggested time' : '단계 권장 시간'}</span><strong>{overtime > 0 ? `+${timer(overtime)}` : timer(remaining)}</strong><small>{en ? 'Take time to think' : overtime > 0 ? '생각을 마무리해 주세요' : '차분하게 생각해 보세요'}</small></div>
    </section>
    <nav className="studio-progress" aria-label={en ? 'Debate stages' : '토론 단계'}><ol>{steps.map((step, index) => {
      const done = battle.isFinished || index < currentIndex;
      const active = !battle.isFinished && index === currentIndex;
      return <li key={step.id} className={active ? 'active' : done ? 'done' : ''} aria-current={active ? 'step' : undefined}><span>{done ? <Check size={12} /> : String(index + 1).padStart(2, '0')}</span><strong>{step.title.replace('AI 교차질문 답변', en ? 'Answer' : '질문 답변')}</strong></li>;
    })}</ol></nav>
  </>;
}
