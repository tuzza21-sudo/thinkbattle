import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  CircleCheckBig,
  FileText,
  Focus,
  MessageSquareText,
  Route,
  Share2,
  Sparkles,
  Trophy,
  TrendingUp,
} from 'lucide-react';
import { getSharedDebateRecord } from '../lib/history';
import type { DebateRecord, ScoreCategory } from '../types';

const formatDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(new Date(value));

const getScoreGrade = (score: number, maxScore: number) => {
  const percentage = (score / Math.max(maxScore, 1)) * 100;
  if (percentage >= 90) return { label: 'S', color: '#FFB800', glow: 'rgba(255, 184, 0, 0.4)' };
  if (percentage >= 75) return { label: 'A', color: '#00E5FF', glow: 'rgba(0, 229, 255, 0.3)' };
  if (percentage >= 60) return { label: 'B', color: '#7C4DFF', glow: 'rgba(124, 77, 255, 0.3)' };
  if (percentage >= 40) return { label: 'C', color: '#FF9100', glow: 'rgba(255, 145, 0, 0.3)' };
  return { label: 'D', color: '#FF0055', glow: 'rgba(255, 0, 85, 0.3)' };
};

const getBarColor = (category: ScoreCategory) => {
  const percentage = (category.score / Math.max(category.maxScore, 1)) * 100;
  if (percentage >= 80) return 'var(--primary)';
  if (percentage >= 60) return '#7C4DFF';
  if (percentage >= 40) return 'var(--accent-amber)';
  return 'var(--accent-coral)';
};

const SharedScoreCard: React.FC<{ category: ScoreCategory }> = ({ category }) => {
  const percentage = Math.max(0, Math.min(100, (category.score / Math.max(category.maxScore, 1)) * 100));
  const color = getBarColor(category);

  return (
    <article className="shared-score-card">
      <div className="shared-score-card-head">
        <strong>{category.name}</strong>
        <span style={{ color }}>{category.score}<small>/{category.maxScore}</small></span>
      </div>
      <div className="shared-score-track" aria-label={`${category.name} ${category.score}점 / ${category.maxScore}점`}>
        <i style={{ width: `${percentage}%`, background: color, boxShadow: `0 0 12px ${color}44` }} />
      </div>
      <p>{category.feedback}</p>
    </article>
  );
};

export const SharedReportPage: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [record, setRecord] = useState<DebateRecord>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shareId) {
      setLoading(false);
      return;
    }
    getSharedDebateRecord(shareId).then(nextRecord => {
      setRecord(nextRecord);
      setLoading(false);
    });
  }, [shareId]);

  if (loading) {
    return <main className="app-container page-scroll shared-report-state">공개 결과 보고서를 불러오는 중입니다.</main>;
  }

  if (!record) {
    return <main className="app-container page-scroll shared-report-state">유효하지 않거나 공유가 중단된 보고서입니다.</main>;
  }

  const totalMax = record.report.categories.reduce((sum, category) => sum + (category.maxScore || 5), 0) || 1;
  const totalPct = Math.round((record.report.totalScore / totalMax) * 100);
  const grade = getScoreGrade(record.report.totalScore, totalMax);
  const ringLength = 2 * Math.PI * 52;
  const rankedCategories = [...record.report.categories].sort(
    (left, right) => (right.score / Math.max(right.maxScore, 1)) - (left.score / Math.max(left.maxScore, 1)),
  );
  const strongestCategory = rankedCategories[0];
  const priorityCategory = rankedCategories[rankedCategories.length - 1];
  const nextAction = record.report.phaseCoaching?.find(item => item.nextAction.trim())?.nextAction
    || priorityCategory?.feedback
    || '다음 토론에서는 주장과 근거가 어떻게 연결되는지 한 문장으로 먼저 정리해 보세요.';

  return (
    <main className="app-container page-scroll shared-report-page">
      <article className="shared-report-sheet">
        <header className="report-hero shared-report-hero">
          <div className="report-hero-bg" />
          <div className="report-hero-content">
            <span className="shared-report-eyebrow"><Trophy size={15} /> THINKFIT · 공개 결과 리포트</span>
            <div className="report-trophy-ring shared-report-ring">
              <svg viewBox="0 0 120 120" className="report-ring-svg" aria-label={`종합 등급 ${grade.label}`}>
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border-color)" strokeWidth="7" opacity="0.35" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke={grade.color}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={ringLength}
                  strokeDashoffset={ringLength * (1 - Math.max(0, Math.min(totalPct, 100)) / 100)}
                  style={{ filter: `drop-shadow(0 0 6px ${grade.glow})` }}
                />
              </svg>
              <div className="report-ring-inner">
                <span className="report-ring-grade" style={{ color: grade.color }}>{grade.label}</span>
                <span className="report-ring-pct">{totalPct}%</span>
              </div>
            </div>
            <h1 className="report-title">최종 토론 평가서</h1>
            <p className="report-topic">{record.topic}</p>
            <p className="report-subtitle">{formatDate(record.completedAt)} · {record.matchType}</p>
            <div className="report-score-summary">
              <span className="report-score-number" style={{ color: grade.color }}>{record.report.totalScore}</span>
              <span className="report-score-divider">/</span>
              <span className="report-score-max">{totalMax}</span>
            </div>
          </div>
        </header>

        <section className="shared-report-section">
          <h2><MessageSquareText size={18} /> 총평과 조언</h2>
          <div className="report-feedback-card"><p>{record.report.overallFeedback}</p></div>
        </section>

        <section className="shared-report-section">
          <h2><Sparkles size={18} /> 한눈에 보는 성장 포인트</h2>
          <div className="report-highlight-grid shared-report-highlights">
            <article className="report-highlight-card strength">
              <span><CircleCheckBig size={17} /> 가장 강한 역량</span>
              <strong>{strongestCategory?.name || '분석 중'}</strong>
              <p>{strongestCategory?.feedback || '평가 내용을 확인해 주세요.'}</p>
            </article>
            <article className="report-highlight-card focus">
              <span><Focus size={17} /> 우선 보완할 역량</span>
              <strong>{priorityCategory?.name || '분석 중'}</strong>
              <p>{priorityCategory?.feedback || '평가 내용을 확인해 주세요.'}</p>
            </article>
            <article className="report-highlight-card action">
              <span><Route size={17} /> 다음 토론에서 할 일</span>
              <strong>한 가지에 집중하기</strong>
              <p>{nextAction}</p>
            </article>
          </div>
        </section>

        <section className="shared-report-section">
          <h2><TrendingUp size={18} /> 역량별 분석</h2>
          <div className="shared-score-list">
            {record.report.categories.map(category => <SharedScoreCard key={category.name} category={category} />)}
          </div>
        </section>

        {record.report.phaseCoaching && record.report.phaseCoaching.length > 0 && (
          <section className="shared-report-section">
            <h2><BookOpen size={18} /> 국면별 보완 코칭</h2>
            <div className="report-coaching-timeline">
              {record.report.phaseCoaching.map((coaching, index) => (
                <article key={`${coaching.phase}-${index}`} className="report-coaching-card">
                  <div className="report-coaching-index">{index + 1}</div>
                  <div>
                    <header><strong>{coaching.phase}</strong><span>토론 단계 분석</span></header>
                    <p><b>관찰</b>{coaching.observed}</p>
                    <p className="strength"><b>강점</b>{coaching.strength}</p>
                    <p className="improvement"><b>보완</b>{coaching.improvement}</p>
                    <p className="action"><b>다음 행동</b>{coaching.nextAction}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {record.arguments.length > 0 && (
          <section className="shared-report-section shared-report-transcript-section">
            <h2><FileText size={18} /> 토론 진행 내역</h2>
            <p>발언 원문은 필요한 경우에만 펼쳐서 확인할 수 있습니다.</p>
            <details className="shared-transcript-details">
              <summary>전체 발언 보기 <ChevronDown size={17} /></summary>
              <div className="history-transcript report-transcript">
                {record.arguments.map(argument => (
                  <article key={argument.id} className={`report-transcript-entry ${argument.isAi ? 'ai' : 'user'}`}>
                    <div className="report-transcript-meta">
                      <strong>{argument.isAi ? 'AI 상대방' : '내 발언'}</strong>
                      <em>{argument.roundTitle ?? (argument.isAi ? 'AI 응답' : '내 발언')}</em>
                    </div>
                    <p className="report-transcript-content">{argument.content}</p>
                  </article>
                ))}
              </div>
            </details>
          </section>
        )}

        <footer className="shared-report-footer"><Share2 size={15} /> ThinkFit에서 나의 토론 역량과 성장을 확인해 보세요.</footer>
      </article>
    </main>
  );
};
