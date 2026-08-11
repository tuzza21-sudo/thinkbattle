import { useMemo, useState } from 'react';
import { BookOpen, Bot, Check, Clock, Layers3, Mic2, ShieldCheck, Users, Volume2, X } from 'lucide-react';
import { formatDebateMinutes, getDebatePhaseTimings } from '../lib/debateTiming';
import { getLiveDebateCourse } from '../lib/liveDebateCourse';
import { generateOrganizationTopic } from '../lib/api';
import { savePublicDebateTopic } from '../lib/publicTopics';
import type {
  BattleConfig,
  AppLanguage,
  DebateLevel,
  DebateParticipantRole,
  DebatePosition,
  DebateRoomAudience,
  DebateTeamSize,
  OrganizationTopic,
  PublicDebateTopic,
  TopicBriefing,
} from '../types';

interface CreateBattleModalProps {
  onClose: () => void;
  onStart: (config: BattleConfig) => void | Promise<void>;
  organizationTopics?: OrganizationTopic[];
  publicTopics?: PublicDebateTopic[];
  audience?: DebateRoomAudience;
  organizationId?: string;
  liveOnly?: boolean;
  language?: AppLanguage;
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
  publicTopics = [],
  audience = 'public',
  organizationId,
  liveOnly = false,
  language = 'ko',
}: CreateBattleModalProps) => {
  const isEnglish = language === 'en';
  const [topic, setTopic] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [topicBriefing, setTopicBriefing] = useState<TopicBriefing | undefined>();
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(organizationId);
  const [timeLimit, setTimeLimit] = useState(600);
  const [userPosition, setUserPosition] = useState<DebatePosition>('affirmative');
  const [debateLevel, setDebateLevel] = useState<DebateLevel>('beginner');
  const [battleMode, setBattleMode] = useState<'debate' | 'pvp'>(liveOnly ? 'pvp' : 'debate');
  const [teamSize, setTeamSize] = useState<DebateTeamSize>(1);
  const [allowModerator, setAllowModerator] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const phases = useMemo(() => battleMode === 'pvp'
    ? getLiveDebateCourse(timeLimit, debateLevel)
    : getDebatePhaseTimings(timeLimit), [battleMode, debateLevel, timeLimit]);
  const availableTopics = audience === 'organization' ? organizationTopics : publicTopics;
  const formatPhaseDuration = (seconds: number) => {
    if (!isEnglish) return formatDebateMinutes(seconds);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  };

  const handleStart = async () => {
    if (!topic.trim() || isSubmitting) return;
    if (!topicDescription.trim()) {
      setSubmitError(isEnglish ? 'A new motion requires background information for participants.' : '새 주제에는 참가자가 읽을 상세 배경 설명이 필요합니다.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      let finalTopic = topic.trim();
      let finalDescription = topicDescription.trim();
      let finalBriefing = topicBriefing;

      if (!selectedTopicId || !finalBriefing) {
        const generated = await generateOrganizationTopic(
          `${finalTopic}\n${isEnglish ? 'Background and scope' : '상세 배경과 토론 범위'}: ${finalDescription}`,
          audience === 'public' ? 'public' : 'organization',
          language,
        );
        finalTopic = generated.title;
        finalDescription = generated.description;
        finalBriefing = generated.briefing;
        if (audience === 'public') await savePublicDebateTopic(generated, language);
      }

      await onStart({
        topic: finalTopic,
        language,
        topicDescription: finalDescription,
        topicBriefing: finalBriefing,
        timeLimit,
        gameMode: battleMode,
        userPosition,
        debateLevel,
        teamSize: battleMode === 'pvp' ? teamSize : 1,
        allowModerator: battleMode === 'pvp' && allowModerator,
        voiceEnabled: battleMode === 'pvp' && voiceEnabled,
        participantRole: battleMode === 'pvp' ? roleForHost(teamSize) : 'debater',
        audience,
        organizationId: audience === 'organization' ? selectedOrganizationId : undefined,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : isEnglish ? 'The debate could not be created.' : '토론방을 만들지 못했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="create-debate-title">
      <div className="modal-content debate-setup-modal">
        <div className="debate-modal-head">
          <div>
            <span className="debate-modal-eyebrow">{isEnglish ? (audience === 'organization' ? 'ORGANISATION DEBATE' : 'ENGLISH DEBATE') : (audience === 'organization' ? '기관 전용 토론' : '자유 토론')}</span>
            <h2 id="create-debate-title">{isEnglish ? 'Create a debate' : '토론방 만들기'}</h2>
            <p>{isEnglish ? 'Choose a motion and format to begin.' : '주제와 방식을 선택하면 바로 대기방이 열립니다.'}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={isEnglish ? 'Close' : '닫기'}><X size={22} /></button>
        </div>

        <div className="debate-setup-body">
          {!liveOnly && (
            <section className="setup-section">
              <div className="setup-section-title"><span>1</span><strong>{isEnglish ? 'Debate format' : '토론 방식'}</strong></div>
              <div className="setup-choice-grid two">
                <button type="button" className={`setup-choice ${battleMode === 'debate' ? 'selected' : ''}`} onClick={() => setBattleMode('debate')}>
                  <Bot size={22} /><strong>{isEnglish ? 'AI sparring' : 'AI 스파링'}</strong><small>{isEnglish ? 'Structured practice with pointed challenges' : 'AI 상대와 논리의 빈틈을 검증하는 단계별 훈련'}</small>
                </button>
                <button type="button" className={`setup-choice ${battleMode === 'pvp' ? 'selected' : ''}`} onClick={() => setBattleMode('pvp')}>
                  <Users size={22} /><strong>{isEnglish ? 'Real debate with people' : '사람과 실전 토론'}</strong><small>{isEnglish ? 'Create a human-only real-time debate room' : 'AI 참가자 없는 사람 전용 실시간 토론'}</small>
                </button>
              </div>
            </section>
          )}

          <section className="setup-section">
            <div className="setup-section-title"><span>{liveOnly ? '1' : '2'}</span><strong>{isEnglish ? 'Motion' : '토론 주제'}</strong></div>
            {availableTopics.length > 0 && (
              <select className="input-field" value={selectedTopicId} onChange={event => {
                setSelectedTopicId(event.target.value);
                const selected = availableTopics.find(item => item.id === event.target.value);
                if (selected) {
                  setTopic(selected.title);
                  setTopicDescription(selected.description || selected.briefing?.context || '');
                  setTopicBriefing(selected.briefing);
                  setSelectedOrganizationId('organizationId' in selected ? selected.organizationId : organizationId);
                  if (selected.config?.timeLimit) setTimeLimit(selected.config.timeLimit);
                  if (selected.config?.debateLevel === 'beginner' || selected.config?.debateLevel === 'intermediate') {
                    setDebateLevel(selected.config.debateLevel);
                  }
                }
              }}>
                <option value="">{isEnglish ? 'Choose an existing motion or create a new one' : (audience === 'organization' ? '기관 지정 주제에서 선택 또는 새로 만들기' : '기존 공개 주제에서 선택 또는 새로 만들기')}</option>
                {availableTopics.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            )}
            <input
              type="text"
              className="input-field debate-topic-input"
              placeholder={isEnglish ? 'e.g. This House would allow generative AI in schools.' : '예: 학교에서 생성형 AI 사용을 허용해야 하는가?'}
              value={topic}
              maxLength={120}
              onChange={event => {
                setTopic(event.target.value);
                setSelectedTopicId('');
                setTopicBriefing(undefined);
                setSelectedOrganizationId(organizationId);
              }}
              autoFocus
            />
            <small className="setup-helper">{isEnglish ? 'You may enter a new motion directly.' : '자유 주제를 직접 입력할 수 있습니다.'} ({topic.length}/120)</small>
          </section>

          <section className="setup-section">
            <div className="setup-section-title"><span><BookOpen size={15} /></span><strong>{isEnglish ? 'Motion background' : '토론 주제 상세 배경'}</strong></div>
            <textarea
              className="input-textarea"
              placeholder={isEnglish ? 'Explain the context, key terms, scope and constraints participants should know.' : '참가자가 토론 전에 알아야 할 배경, 핵심 맥락, 다룰 범위와 제약을 입력하세요.'}
              value={topicDescription}
              maxLength={2000}
              onChange={event => {
                setTopicDescription(event.target.value);
                setSelectedTopicId('');
                setTopicBriefing(undefined);
                setSelectedOrganizationId(organizationId);
              }}
              style={{ minHeight: 110 }}
            />
            <small className="setup-helper">{isEnglish ? 'Required · Key arguments and related coverage will be generated from this background.' : '필수 · 새 주제는 이 설명을 바탕으로 찬반 쟁점과 배경 기사 링크가 함께 생성됩니다.'} ({topicDescription.length}/2000)</small>
          </section>

          {battleMode === 'pvp' && (
            <section className="setup-section">
              <div className="setup-section-title"><span>{liveOnly ? '2' : '3'}</span><strong>{isEnglish ? 'Communication' : '진행 방식'}</strong></div>
              <div className="setup-choice-grid two">
                <button type="button" className={`setup-choice ${voiceEnabled ? 'selected' : ''}`} onClick={() => setVoiceEnabled(true)} aria-pressed={voiceEnabled}>
                  <Volume2 size={22} />
                  <strong>{isEnglish ? 'Voice debate' : '음성 토론'}</strong>
                  <small>{isEnglish ? 'Live audio with speech transcription' : 'LiveKit 실시간 음성·마이크 전사'}</small>
                  {voiceEnabled && <Check className="setup-check" size={16} />}
                </button>
                <button type="button" className={`setup-choice ${!voiceEnabled ? 'selected' : ''}`} onClick={() => setVoiceEnabled(false)} aria-pressed={!voiceEnabled}>
                  <Users size={22} />
                  <strong>{isEnglish ? 'Text debate' : '텍스트 토론'}</strong>
                  <small>{isEnglish ? 'Real-time written debate' : 'LiveKit 없이 실시간 글로 진행'}</small>
                  {!voiceEnabled && <Check className="setup-check" size={16} />}
                </button>
              </div>
              <small className="setup-helper">{isEnglish ? 'Voice rooms use LiveKit and automatically transcribe each speech.' : '음성 토론은 LiveKit으로 진행되며 발언 내용은 자동 전사됩니다.'}</small>
            </section>
          )}

          {battleMode === 'pvp' && (
            <section className="setup-section">
              <div className="setup-section-title"><span>{liveOnly ? '3' : '4'}</span><strong>{isEnglish ? 'Team size' : '토론 인원'}</strong></div>
              <div className="setup-choice-grid three">
                {teamOptions.map(option => (
                  <button key={option.value} type="button" className={`setup-choice ${teamSize === option.value ? 'selected' : ''}`} onClick={() => setTeamSize(option.value)}>
                    <strong>{option.title}</strong><small>{isEnglish ? (option.value === 1 ? 'Individual debate' : option.value === 2 ? 'Team debate' : 'Extended team debate') : option.detail}</small>
                    {teamSize === option.value && <Check className="setup-check" size={16} />}
                  </button>
                ))}
              </div>
              <button type="button" className={`moderator-toggle ${allowModerator ? 'selected' : ''}`} onClick={() => setAllowModerator(value => !value)} aria-pressed={allowModerator}>
                <ShieldCheck size={20} />
                <span><strong>{isEnglish ? 'Allow a moderator' : '진행자 입장 허용'}</strong><small>{isEnglish ? 'One additional participant may observe and facilitate the debate.' : '팀 정원과 별도로 1명이 관찰·진행할 수 있어요.'}</small></span>
                <i>{isEnglish ? (allowModerator ? 'Allowed' : 'Disabled') : (allowModerator ? '허용' : '미허용')}</i>
              </button>
            </section>
          )}

          <section className="setup-section">
            <div className="setup-section-title"><span>{battleMode === 'pvp' ? (liveOnly ? '4' : '5') : '4'}</span><strong>{isEnglish ? 'Debate duration' : '토론 시간'}</strong></div>
            <div className="setup-choice-grid three">
              {[600, 900, 1200].map(time => (
                <button key={time} type="button" className={`setup-choice time ${timeLimit === time ? 'selected' : ''}`} onClick={() => setTimeLimit(time)}>
                  <Clock size={19} /><strong>{time / 60} {isEnglish ? 'min' : '분'}</strong>
                </button>
              ))}
            </div>
            <div className="phase-allocation" aria-label={isEnglish ? 'Automatic phase timing' : '단계별 자동 시간 배분'}>
              <div className="phase-allocation-head"><Mic2 size={16} /><strong>{isEnglish ? `${timeLimit / 60}-minute structure` : `${timeLimit / 60}분 자동 진행표`}</strong></div>
              <div className={`phase-track ${battleMode === 'pvp' ? 'detailed' : ''}`}>
                {phases.map((phase, index) => (
                  <div key={phase.label} style={{ flex: phase.seconds }}><span>{isEnglish ? `Phase ${index + 1}` : phase.label}</span><small>{formatPhaseDuration(phase.seconds)}</small></div>
                ))}
              </div>
            </div>
          </section>

          {battleMode === 'debate' ? (
            <section className="setup-section setup-inline-options">
              <div>
                <strong>{isEnglish ? 'My position' : '내 입장'}</strong>
                <div className="segmented-control">
                  <button type="button" className={userPosition === 'affirmative' ? 'selected' : ''} onClick={() => setUserPosition('affirmative')}>{isEnglish ? 'Government' : '찬성'}</button>
                  <button type="button" className={userPosition === 'negative' ? 'selected' : ''} onClick={() => setUserPosition('negative')}>{isEnglish ? 'Opposition' : '반대'}</button>
                </div>
              </div>
              <div>
                <strong><Layers3 size={15} /> {isEnglish ? 'Level' : '난이도'}</strong>
                <div className="segmented-control">
                  <button type="button" className={debateLevel === 'beginner' ? 'selected' : ''} onClick={() => setDebateLevel('beginner')}>{isEnglish ? 'Beginner' : '초급'}</button>
                  <button type="button" className={debateLevel === 'intermediate' ? 'selected' : ''} onClick={() => setDebateLevel('intermediate')}>{isEnglish ? 'Intermediate' : '중급'}</button>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="setup-section setup-inline-options">
                <div>
                  <strong><Layers3 size={15} /> {isEnglish ? 'Level' : '난이도'}</strong>
                  <div className="segmented-control">
                    <button type="button" className={debateLevel === 'beginner' ? 'selected' : ''} onClick={() => setDebateLevel('beginner')}>{isEnglish ? 'Beginner' : '초급'}</button>
                    <button type="button" className={debateLevel === 'intermediate' ? 'selected' : ''} onClick={() => setDebateLevel('intermediate')}>{isEnglish ? 'Intermediate' : '중급'}</button>
                  </div>
                </div>
              </section>
              <div className="moderator-toggle selected">
                <Users size={20} />
                <span><strong>{isEnglish ? 'A dedicated lobby opens after creation.' : '개설 후 전용 대기실로 이동합니다.'}</strong><small>{isEnglish ? 'Participants choose their position and role before the debate begins.' : '모든 참가자가 큰 화면에서 동시에 입장과 역할을 선택하고 준비합니다.'}</small></span>
                <i>{isEnglish ? 'Lobby' : '대기실'}</i>
              </div>
            </>
          )}
        </div>

        <div className="debate-modal-footer">
          {submitError && <span style={{ flex: 1, color: 'var(--accent-coral)', fontSize: '0.8rem' }}>{submitError}</span>}
          <button type="button" className="btn btn-secondary" onClick={onClose}>{isEnglish ? 'Cancel' : '취소'}</button>
          <button type="button" className="btn btn-primary" disabled={!topic.trim() || !topicDescription.trim() || isSubmitting} onClick={() => void handleStart()}>
            {isEnglish ? (isSubmitting ? 'Creating…' : battleMode === 'pvp' ? 'Create real debate room' : 'Start AI sparring') : (isSubmitting ? '토론방 여는 중…' : battleMode === 'pvp' ? '실전 토론방 개설' : 'AI 스파링 시작')}
          </button>
        </div>
      </div>
    </div>
  );
};
