import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookOpen, FileText, Share2, Trophy, TrendingUp } from 'lucide-react';
import { getSharedDebateRecord } from '../lib/history';
import type { DebateRecord } from '../types';

const formatDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(new Date(value));

export const SharedReportPage: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [record, setRecord] = useState<DebateRecord>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shareId) return;
    getSharedDebateRecord(shareId).then(nextRecord => {
      setRecord(nextRecord);
      setLoading(false);
    });
  }, [shareId]);

  if (loading) {
    return <main className="app-container page-scroll" style={{ padding: '4rem 1.25rem', textAlign: 'center' }}>공유 보고서를 불러오는 중입니다.</main>;
  }

  if (!record) {
    return <main className="app-container page-scroll" style={{ padding: '4rem 1.25rem', textAlign: 'center' }}>유효하지 않거나 공유가 중단된 보고서입니다.</main>;
  }

  const totalMax = record.report.categories.reduce((sum, category) => sum + (category.maxScore || 5), 0) || 1;
  const userArguments = record.arguments.filter(argument => !argument.isAi);

  return (
    <main className="app-container page-scroll" style={{ padding: '2rem 1rem 4rem' }}>
      <article style={{ maxWidth: '900px', margin: '0 auto', display: 'grid', gap: '1rem' }}>
        <header className="report-hero" style={{ borderRadius: '20px', overflow: 'hidden', padding: '2.25rem 1.5rem' }}>
          <div className="report-hero-bg" />
          <div className="report-hero-content" style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center', color: 'var(--primary)' }}>
              <Trophy size={20} /> ThinkFit 공개 토론 리포트
            </div>
            <h1 className="report-title" style={{ marginTop: '1rem' }}>{record.topic}</h1>
            <p className="report-subtitle">{formatDate(record.completedAt)} · 정식 토론 결과</p>
            <div className="report-score-summary" style={{ marginTop: '1.25rem' }}>
              <span className="report-score-number">{record.report.totalScore}</span>
              <span className="report-score-divider">/</span>
              <span className="report-score-max">{totalMax}</span>
            </div>
          </div>
        </header>

        <section className="report-panel">
          <h2><BookOpen size={19} /> 총평</h2>
          <p>{record.report.overallFeedback}</p>
        </section>

        <section className="report-panel">
          <h2><TrendingUp size={19} /> 평가 항목별 피드백</h2>
          <div className="flex flex-col gap-3">
            {record.report.categories.map(category => (
              <article key={category.name} className="history-category">
                <div className="flex justify-between gap-3">
                  <strong>{category.name}</strong>
                  <span>{category.score}/{category.maxScore}</span>
                </div>
                <p>{category.feedback}</p>
              </article>
            ))}
          </div>
        </section>

        {record.report.phaseCoaching && record.report.phaseCoaching.length > 0 && (
          <section className="report-panel">
            <h2><BookOpen size={19} /> 국면별 보완 코칭</h2>
            <div className="flex flex-col gap-3">
              {record.report.phaseCoaching.map((coaching, index) => (
                <article key={`${coaching.phase}-${index}`} className="history-category">
                  <strong>{coaching.phase}</strong>
                  <p><b>관찰:</b> {coaching.observed}</p>
                  <p><b>잘한 점:</b> {coaching.strength}</p>
                  <p><b>보완할 점:</b> {coaching.improvement}</p>
                  <p><b>다음 훈련:</b> {coaching.nextAction}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="report-panel">
          <h2><FileText size={19} /> 실제 수행 내역</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>사용자가 각 국면에서 작성한 발언입니다.</p>
          <div className="history-transcript">
            {userArguments.map(argument => (
              <article key={argument.id} className="user">
                <strong>{argument.roundTitle ?? '발언'}</strong>
                <span>{argument.content}</span>
              </article>
            ))}
          </div>
        </section>

        <footer style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem', padding: '1rem' }}>
          <Share2 size={15} style={{ verticalAlign: 'middle' }} /> ThinkFit에서 나의 설득력과 논리력을 훈련해 보세요.
        </footer>
      </article>
    </main>
  );
};
