import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Award, CircleCheckBig, Focus, Gavel, LoaderCircle, RefreshCw, Route, Scale, Sparkles, Target, TrendingUp, Users } from 'lucide-react';
import type { AppUser, DebateLevel, LiveDebateEvaluation } from '../types';
import { ReportCategoryCard } from './ResultModal';

type LiveDebateEvaluationModalProps = {
  evaluation: LiveDebateEvaluation | null;
  user: AppUser;
  topic: string;
  debateLevel: DebateLevel;
  error: string | null;
  onRetry?: () => void;
  onClose: () => void;
};

const winnerLabel = (winner: LiveDebateEvaluation['winner']) => winner === 'affirmative'
  ? '찬성팀 우세'
  : winner === 'negative'
    ? '반대팀 우세'
    : '균형 판정';

const roleLabel = (role: LiveDebateEvaluation['participantReports'][number]['role']) => role === 'moderator'
  ? '중립 진행자'
  : role === 'opening'
    ? '입론 담당'
    : role === 'rebuttal'
      ? '질의·반론 담당'
      : role === 'closing'
        ? '최종 변론 담당'
        : '토론자';

const levelLabel = (level: DebateLevel) => level === 'advanced' ? '고급' : level === 'intermediate' ? '중급' : '초급';

export const LiveDebateEvaluationModal = ({
  evaluation,
  user,
  topic,
  debateLevel,
  error,
  onRetry,
  onClose,
}: LiveDebateEvaluationModalProps) => {
  const [animReady, setAnimReady] = useState(false);
  const [selectedParticipantId, setSelectedParticipantId] = useState(user.id);

  useEffect(() => {
    const timer = window.setTimeout(() => setAnimReady(true), 100);
    return () => window.clearTimeout(timer);
  }, []);

  const selectedParticipant = useMemo(() => (
    evaluation?.participantReports.find(participant => participant.userId === selectedParticipantId)
    || evaluation?.participantReports.find(participant => participant.userId === user.id)
    || evaluation?.participantReports[0]
  ), [evaluation, selectedParticipantId, user.id]);

  if (!evaluation) {
    return (
      <div className="modal-overlay">
        <div className="live-evaluation-loading">
          {error ? <Gavel size={34} /> : <LoaderCircle className="spin" size={34} />}
          <h2>{error ? 'AI 심판 평가를 완료하지 못했습니다.' : 'AI 심판이 전체 토론을 분석하고 있습니다.'}</h2>
          <p>{error || 'AI 대전과 동일한 레벨별 기준으로 양 팀과 참가자의 발언을 평가하고 있습니다.'}</p>
          <div>{onRetry && <button className="btn btn-primary" onClick={onRetry}><RefreshCw size={17} /> 다시 평가</button>}<button className="btn btn-secondary" onClick={onClose}>메인으로</button></div>
        </div>
      </div>
    );
  }

  const report = selectedParticipant?.report;
  const maxScore = report?.categories.reduce((total, category) => total + category.maxScore, 0) || 1;
  const score = report?.totalScore || 0;
  const scorePercent = Math.round(score / maxScore * 100);
  const rankedCategories = [...(report?.categories ?? [])].sort((a, b) => (b.score / b.maxScore) - (a.score / a.maxScore));
  const strongestCategory = rankedCategories[0];
  const priorityCategory = rankedCategories[rankedCategories.length - 1];
  const nextTraining = report?.phaseCoaching?.find(coaching => coaching.nextAction.trim())?.nextAction
    || priorityCategory?.feedback
    || '다음 토론에서는 핵심 주장과 근거의 연결을 한 문장으로 먼저 정리해 보세요.';

  return (
    <div className="modal-overlay">
      <div className="live-evaluation-modal report-modal-v2">
        <header className="live-evaluation-hero report-live-hero">
          <div className="report-live-verdict">
            <span><Gavel size={17} /> AI 심판 · 사람 대 사람 토론</span>
            <h2>{winnerLabel(evaluation.winner)}</h2>
            <p className="report-live-topic">{topic}</p>
            <p>{evaluation.overallVerdict}</p>
            <div className="report-live-meta"><em>{levelLabel(debateLevel)}</em><em>AI 대전과 동일한 평가 항목</em></div>
          </div>
          <div className="report-live-score-wrap">
            <div className="report-live-score-ring" style={{ '--score-progress': `${scorePercent * 3.6}deg` } as CSSProperties}>
              <div><strong>{scorePercent}</strong><span>점</span></div>
            </div>
            <small>{selectedParticipant?.nickname || '참가자'} 개인 점수</small>
          </div>
        </header>

        <div className="live-evaluation-body report-live-body">
          {evaluation.participantReports.length > 1 && (
            <nav className="report-participant-tabs" aria-label="참가자별 평가 선택">
              {evaluation.participantReports.map(participant => (
                <button
                  key={participant.userId}
                  type="button"
                  className={participant.userId === selectedParticipant?.userId ? 'active' : ''}
                  onClick={() => setSelectedParticipantId(participant.userId)}
                >
                  <span>{participant.nickname}{participant.userId === user.id ? ' · 나' : ''}</span>
                  <small>{participant.role === 'moderator' ? '중립' : participant.position === 'affirmative' ? '찬성팀' : '반대팀'} · {roleLabel(participant.role)}</small>
                </button>
              ))}
            </nav>
          )}

          {selectedParticipant && report ? (
            <>
              <section className="report-section">
                <h3 className="report-section-title"><Award size={19} /> {selectedParticipant.nickname}님의 종합 평가</h3>
                <div className="report-feedback-card report-personal-overview">
                  <div><strong>{selectedParticipant.nickname}</strong><span>{selectedParticipant.role === 'moderator' ? '중립' : selectedParticipant.position === 'affirmative' ? '찬성팀' : '반대팀'} · {roleLabel(selectedParticipant.role)}</span></div>
                  <p>{report.overallFeedback}</p>
                </div>
              </section>

              <section className="report-section">
                <h3 className="report-section-title"><Sparkles size={18} /> 한눈에 보는 성장 포인트</h3>
                <div className="report-highlight-grid">
                  <article className="report-highlight-card strength"><span><CircleCheckBig size={17} /> 가장 강한 역량</span><strong>{strongestCategory?.name || '분석 중'}</strong><p>{strongestCategory?.feedback || '평가 내용을 확인해 주세요.'}</p></article>
                  <article className="report-highlight-card focus"><span><Focus size={17} /> 우선 보완할 역량</span><strong>{priorityCategory?.name || '분석 중'}</strong><p>{priorityCategory?.feedback || '평가 내용을 확인해 주세요.'}</p></article>
                  <article className="report-highlight-card action"><span><Route size={17} /> 다음 토론에서 할 일</span><strong>한 가지에 집중하기</strong><p>{nextTraining}</p></article>
                </div>
              </section>

              <section className="report-section">
                <h3 className="report-section-title"><TrendingUp size={19} /> 세부 역량 분석 <span className="report-section-hint">카드를 눌러 피드백 확인</span></h3>
                <div className="report-categories-list report-category-grid">
                  {report.categories.map((category, index) => <ReportCategoryCard key={category.name} cat={category} index={index} animReady={animReady} />)}
                </div>
              </section>

              {report.phaseCoaching && report.phaseCoaching.length > 0 && (
                <section className="report-section">
                  <h3 className="report-section-title"><Route size={19} /> 단계별 수행 코칭</h3>
                  <div className="report-coaching-timeline">
                    {report.phaseCoaching.map((coaching, index) => (
                      <article key={`${coaching.phase}-${index}`} className="report-coaching-card">
                        <div className="report-coaching-index">{index + 1}</div>
                        <div><header><strong>{coaching.phase}</strong><span>토론 단계 분석</span></header><p><b>관찰</b>{coaching.observed}</p><p className="strength"><b>강점</b>{coaching.strength}</p><p className="improvement"><b>보완</b>{coaching.improvement}</p><p className="action"><b>다음 행동</b>{coaching.nextAction}</p></div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : <p className="live-no-personal-feedback">개인 발언 기록을 식별하지 못했습니다. 팀 피드백을 참고해 주세요.</p>}

          <section className="report-section report-team-section">
            <h3 className="report-section-title"><Scale size={19} /> 양 팀 판정 근거</h3>
            <div className="live-team-feedback-grid">
              <article className="affirmative"><span>찬성팀</span><p>{evaluation.affirmativeFeedback}</p></article>
              <article className="negative"><span>반대팀</span><p>{evaluation.negativeFeedback}</p></article>
            </div>
          </section>

          {evaluation.keyClashes.length > 0 && (
            <section className="report-section">
              <h3 className="report-section-title"><Target size={19} /> 승패를 가른 핵심 쟁점</h3>
              <ol className="live-clash-list report-clash-grid">{evaluation.keyClashes.map((clash, index) => <li key={`${clash}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{clash}</p></li>)}</ol>
            </section>
          )}
        </div>

        <footer><span><Users size={16} /> 참가자 탭을 선택하면 동일한 기준으로 생성된 개인 보고서를 확인할 수 있습니다.</span><button className="btn btn-primary" onClick={onClose}><ArrowLeft size={18} /> 메인으로 돌아가기</button></footer>
      </div>
    </div>
  );
};
