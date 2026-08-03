import { ArrowLeft, Gavel, LoaderCircle, RefreshCw, Scale, Target, TrendingUp, Users } from 'lucide-react';
import type { AppUser, LiveDebateEvaluation } from '../types';

type LiveDebateEvaluationModalProps = {
  evaluation: LiveDebateEvaluation | null;
  user: AppUser;
  error: string | null;
  onRetry?: () => void;
  onClose: () => void;
};

const winnerLabel = (winner: LiveDebateEvaluation['winner']) => winner === 'affirmative'
  ? '찬성팀 우세'
  : winner === 'negative'
    ? '반대팀 우세'
    : '균형 판정';

export const LiveDebateEvaluationModal = ({ evaluation, user, error, onRetry, onClose }: LiveDebateEvaluationModalProps) => {
  if (!evaluation) {
    return (
      <div className="modal-overlay">
        <div className="live-evaluation-loading">
          {error ? <Gavel size={34} /> : <LoaderCircle className="spin" size={34} />}
          <h2>{error ? 'AI 심판 평가를 완료하지 못했습니다.' : 'AI 심판이 전체 토론을 분석하고 있습니다.'}</h2>
          <p>{error || '양 팀의 논증과 참가자별 역할 수행을 평가하는 중입니다. 잠시만 기다려 주세요.'}</p>
          <div>{onRetry && <button className="btn btn-primary" onClick={onRetry}><RefreshCw size={17} /> 다시 평가</button>}<button className="btn btn-secondary" onClick={onClose}>메인으로</button></div>
        </div>
      </div>
    );
  }

  const personal = evaluation.participantReports.find(participant => participant.userId === user.id);
  const maxScore = personal?.report.categories.reduce((total, category) => total + category.maxScore, 0) || 25;
  const score = personal?.report.totalScore || 0;
  const scorePercent = Math.round(score / maxScore * 100);

  return (
    <div className="modal-overlay">
      <div className="live-evaluation-modal">
        <header className="live-evaluation-hero">
          <div><span><Gavel size={17} /> AI 심판 최종 판정</span><h2>{winnerLabel(evaluation.winner)}</h2><p>{evaluation.overallVerdict}</p></div>
          <div className="live-evaluation-score"><strong>{scorePercent}</strong><span>개인 점수</span></div>
        </header>

        <div className="live-evaluation-body">
          <section>
            <h3><Scale size={19} /> 양 팀 피드백</h3>
            <div className="live-team-feedback-grid">
              <article className="affirmative"><span>찬성팀</span><p>{evaluation.affirmativeFeedback}</p></article>
              <article className="negative"><span>반대팀</span><p>{evaluation.negativeFeedback}</p></article>
            </div>
          </section>

          {evaluation.keyClashes.length > 0 && (
            <section>
              <h3><Target size={19} /> 핵심 쟁점</h3>
              <ol className="live-clash-list">{evaluation.keyClashes.map((clash, index) => <li key={`${clash}-${index}`}>{clash}</li>)}</ol>
            </section>
          )}

          <section>
            <h3><Users size={19} /> 나의 역할 수행 피드백</h3>
            {personal ? (
              <>
                <div className="live-personal-summary"><strong>{personal.nickname}</strong><span>{personal.role === 'moderator' ? '중립 진행자' : `${personal.position === 'affirmative' ? '찬성팀' : '반대팀'} · ${personal.role === 'opening' ? '입론 담당' : personal.role === 'rebuttal' ? '질의·반론 담당' : personal.role === 'closing' ? '최종 변론 담당' : '토론자'}`}</span><p>{personal.report.overallFeedback}</p></div>
                <div className="live-evaluation-categories">
                  {personal.report.categories.map(category => {
                    const percent = Math.round(category.score / category.maxScore * 100);
                    return <article key={category.name}><header><strong>{category.name}</strong><span>{category.score}/{category.maxScore}</span></header><div><i style={{ width: `${percent}%` }} /></div><p>{category.feedback}</p></article>;
                  })}
                </div>
              </>
            ) : <p className="live-no-personal-feedback">개인 발언 기록을 식별하지 못했습니다. 팀 피드백을 참고해 주세요.</p>}
          </section>
        </div>

        <footer><span><TrendingUp size={16} /> 개인 피드백은 현재 로그인한 참가자 기준으로 표시됩니다.</span><button className="btn btn-primary" onClick={onClose}><ArrowLeft size={18} /> 메인으로 돌아가기</button></footer>
      </div>
    </div>
  );
};
