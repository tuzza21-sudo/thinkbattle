import { useMemo, useState } from 'react';
import { Bot, Check, Clock, Layers3, Mic2, ShieldCheck, Users, X } from 'lucide-react';
import { formatDebateMinutes, getDebatePhaseTimings } from '../lib/debateTiming';
import type {
  BattleConfig,
  DebateLevel,
  DebateParticipantRole,
  DebatePosition,
  DebateRoomAudience,
  DebateTeamSize,
  OrganizationTopic,
} from '../types';

interface CreateBattleModalProps {
  onClose: () => void;
  onStart: (config: BattleConfig) => void | Promise<void>;
  organizationTopics?: OrganizationTopic[];
  audience?: DebateRoomAudience;
  organizationId?: string;
  liveOnly?: boolean;
}

const teamOptions: { value: DebateTeamSize; title: string; detail: string }[] = [
  { value: 1, title: '1 : 1', detail: '개인 토론' },
  { value: 2, title: '2 : 2', detail: '팀 토론' },
  { value: 3, title: '3 : 3', detail: '확장 팀 토론' },
];

const roleForHost = (teamSize: DebateTeamSize): DebateParticipantRole => teamSize === 1 ? 'debater' : 'opening';

export const CreateBattleModal = ({
  onClose,
  onStart,
  organizationTopics = [],
  audience = 'public',
  organizationId,
  liveOnly = false,
}: CreateBattleModalProps) => {
  const [topic, setTopic] = useState('');
  const [timeLimit, setTimeLimit] = useState(600);
  const [userPosition, setUserPosition] = useState<DebatePosition>('affirmative');
  const [debateLevel, setDebateLevel] = useState<DebateLevel>('beginner');
  const [battleMode, setBattleMode] = useState<'debate' | 'pvp'>(liveOnly ? 'pvp' : 'debate');
  const [teamSize, setTeamSize] = useState<DebateTeamSize>(1);
  const [allowModerator, setAllowModerator] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const phases = useMemo(() => getDebatePhaseTimings(timeLimit), [timeLimit]);

  const handleStart = async () => {
    if (!topic.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onStart({
        topic: topic.trim(),
        timeLimit,
        gameMode: battleMode,
        userPosition,
        debateLevel,
        teamSize: battleMode === 'pvp' ? teamSize : 1,
        allowModerator: battleMode === 'pvp' && allowModerator,
        participantRole: battleMode === 'pvp' ? roleForHost(teamSize) : 'debater',
        audience,
        organizationId,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '토론방을 만들지 못했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="create-debate-title">
      <div className="modal-content debate-setup-modal">
        <div className="debate-modal-head">
          <div>
            <span className="debate-modal-eyebrow">{audience === 'organization' ? '기관 전용 토론' : '자유 토론'}</span>
            <h2 id="create-debate-title">토론방 만들기</h2>
            <p>주제와 방식을 선택하면 바로 대기방이 열립니다.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={22} /></button>
        </div>

        <div className="debate-setup-body">
          {!liveOnly && (
            <section className="setup-section">
              <div className="setup-section-title"><span>1</span><strong>토론 방식</strong></div>
              <div className="setup-choice-grid two">
                <button type="button" className={`setup-choice ${battleMode === 'debate' ? 'selected' : ''}`} onClick={() => setBattleMode('debate')}>
                  <Bot size={22} /><strong>AI 토론</strong><small>AI와 단계별 연습</small>
                </button>
                <button type="button" className={`setup-choice ${battleMode === 'pvp' ? 'selected' : ''}`} onClick={() => setBattleMode('pvp')}>
                  <Users size={22} /><strong>사람과 토론</strong><small>실시간 자유 토론</small>
                </button>
              </div>
            </section>
          )}

          <section className="setup-section">
            <div className="setup-section-title"><span>{liveOnly ? '1' : '2'}</span><strong>토론 주제</strong></div>
            {organizationTopics.length > 0 && (
              <select className="input-field" value="" onChange={event => {
                const selected = organizationTopics.find(item => item.id === event.target.value);
                if (selected) setTopic(selected.title);
              }}>
                <option value="">기관 지정 주제에서 선택</option>
                {organizationTopics.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            )}
            <input
              type="text"
              className="input-field debate-topic-input"
              placeholder="예: 학교에서 생성형 AI 사용을 허용해야 하는가?"
              value={topic}
              maxLength={120}
              onChange={event => setTopic(event.target.value)}
              autoFocus
            />
            <small className="setup-helper">자유 주제를 직접 입력할 수 있습니다. ({topic.length}/120)</small>
          </section>

          {battleMode === 'pvp' && (
            <section className="setup-section">
              <div className="setup-section-title"><span>{liveOnly ? '2' : '3'}</span><strong>토론 인원</strong></div>
              <div className="setup-choice-grid three">
                {teamOptions.map(option => (
                  <button key={option.value} type="button" className={`setup-choice ${teamSize === option.value ? 'selected' : ''}`} onClick={() => setTeamSize(option.value)}>
                    <strong>{option.title}</strong><small>{option.detail}</small>
                    {teamSize === option.value && <Check className="setup-check" size={16} />}
                  </button>
                ))}
              </div>
              <button type="button" className={`moderator-toggle ${allowModerator ? 'selected' : ''}`} onClick={() => setAllowModerator(value => !value)} aria-pressed={allowModerator}>
                <ShieldCheck size={20} />
                <span><strong>진행자 입장 허용</strong><small>팀 정원과 별도로 1명이 관찰·진행할 수 있어요.</small></span>
                <i>{allowModerator ? '허용' : '미허용'}</i>
              </button>
            </section>
          )}

          <section className="setup-section">
            <div className="setup-section-title"><span>{liveOnly ? '3' : '4'}</span><strong>토론 시간</strong></div>
            <div className="setup-choice-grid three">
              {[600, 900, 1200].map(time => (
                <button key={time} type="button" className={`setup-choice time ${timeLimit === time ? 'selected' : ''}`} onClick={() => setTimeLimit(time)}>
                  <Clock size={19} /><strong>{time / 60}분</strong>
                </button>
              ))}
            </div>
            <div className="phase-allocation" aria-label="단계별 자동 시간 배분">
              <div className="phase-allocation-head"><Mic2 size={16} /><strong>{timeLimit / 60}분 자동 진행표</strong></div>
              <div className="phase-track">
                {phases.map(phase => (
                  <div key={phase.label} style={{ flex: phase.seconds }}><span>{phase.label}</span><small>{formatDebateMinutes(phase.seconds)}</small></div>
                ))}
              </div>
            </div>
          </section>

          {battleMode === 'debate' ? (
            <section className="setup-section setup-inline-options">
              <div>
                <strong>내 입장</strong>
                <div className="segmented-control">
                  <button type="button" className={userPosition === 'affirmative' ? 'selected' : ''} onClick={() => setUserPosition('affirmative')}>찬성</button>
                  <button type="button" className={userPosition === 'negative' ? 'selected' : ''} onClick={() => setUserPosition('negative')}>반대</button>
                </div>
              </div>
              <div>
                <strong><Layers3 size={15} /> 난이도</strong>
                <div className="segmented-control">
                  <button type="button" className={debateLevel === 'beginner' ? 'selected' : ''} onClick={() => setDebateLevel('beginner')}>초급</button>
                  <button type="button" className={debateLevel === 'intermediate' ? 'selected' : ''} onClick={() => setDebateLevel('intermediate')}>중급</button>
                </div>
              </div>
            </section>
          ) : (
            <div className="moderator-toggle selected">
              <Users size={20} />
              <span><strong>개설 후 전용 대기실로 이동합니다.</strong><small>모든 참가자가 큰 화면에서 동시에 입장과 역할을 선택하고 준비합니다.</small></span>
              <i>대기실</i>
            </div>
          )}
        </div>

        <div className="debate-modal-footer">
          {submitError && <span style={{ flex: 1, color: 'var(--accent-coral)', fontSize: '0.8rem' }}>{submitError}</span>}
          <button type="button" className="btn btn-secondary" onClick={onClose}>취소</button>
          <button type="button" className="btn btn-primary" disabled={!topic.trim() || isSubmitting} onClick={() => void handleStart()}>
            {isSubmitting ? '토론방 여는 중…' : battleMode === 'pvp' ? '토론방 개설하기' : 'AI 토론 시작하기'}
          </button>
        </div>
      </div>
    </div>
  );
};
