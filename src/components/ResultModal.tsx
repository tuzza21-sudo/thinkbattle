import React, { useState, useEffect } from 'react';
import type { FinalReport, Player } from '../types';
import { Trophy, Star, ChevronRight, MessageSquareText, Languages, TrendingUp, Sparkles, ChevronDown, Share2, BookOpen, FileDown, ImageDown } from 'lucide-react';
import { downloadSocialSummaryImage, isKakaoShareConfigured, shareReportToKakao } from '../lib/reportShare';

interface ResultModalProps {
  report: FinalReport | null;
  topic: string;
  playerA: Player;
  playerB: Player;
  debateArguments?: import('../types').Argument[];
  onClose: () => void;
  onStartEnglishReplay?: () => void;
  onShareReport?: () => Promise<string>;
}

const getScoreGrade = (score: number, maxScore: number) => {
  const pct = (score / maxScore) * 100;
  if (pct >= 90) return { label: 'S', color: '#FFB800', glow: 'rgba(255, 184, 0, 0.4)' };
  if (pct >= 75) return { label: 'A', color: '#00E5FF', glow: 'rgba(0, 229, 255, 0.3)' };
  if (pct >= 60) return { label: 'B', color: '#7C4DFF', glow: 'rgba(124, 77, 255, 0.3)' };
  if (pct >= 40) return { label: 'C', color: '#FF9100', glow: 'rgba(255, 145, 0, 0.3)' };
  return { label: 'D', color: '#FF0055', glow: 'rgba(255, 0, 85, 0.3)' };
};

const getBarColor = (score: number, maxScore: number) => {
  const pct = (score / maxScore) * 100;
  if (pct >= 80) return 'var(--primary)';
  if (pct >= 60) return '#7C4DFF';
  if (pct >= 40) return 'var(--accent-amber)';
  return 'var(--accent-coral)';
};

const CategoryCard: React.FC<{ cat: { name: string; score: number; maxScore: number; feedback: string; xpEarned?: number }; index: number; animReady: boolean }> = ({ cat, index, animReady }) => {
  const [expanded, setExpanded] = useState(true);
  const pct = (cat.score / cat.maxScore) * 100;
  const barColor = getBarColor(cat.score, cat.maxScore);

  return (
    <div
      className="report-category-card"
      style={{ animationDelay: `${0.3 + index * 0.08}s`, opacity: animReady ? 1 : 0 }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="report-cat-header">
        <div className="report-cat-name-row">
          <span className="report-cat-name">{cat.name}</span>
          {cat.xpEarned !== undefined && cat.xpEarned > 0 && (
            <span className="report-cat-xp">+{cat.xpEarned} XP</span>
          )}
        </div>
        <div className="report-cat-score-row">
          <span className="report-cat-score" style={{ color: barColor }}>{cat.score}</span>
          <span className="report-cat-max">/{cat.maxScore}</span>
          <ChevronDown size={16} className={`report-cat-chevron ${expanded ? 'open' : ''}`} />
        </div>
      </div>
      <div className="report-cat-bar-track">
        <div
          className="report-cat-bar-fill"
          style={{
            width: animReady ? `${pct}%` : '0%',
            background: barColor,
            boxShadow: `0 0 12px ${barColor}44`,
            transitionDelay: `${0.5 + index * 0.1}s`,
          }}
        />
      </div>
      <div className={`report-cat-feedback ${expanded ? 'open' : ''}`}>
        <p>{cat.feedback}</p>
      </div>
    </div>
  );
};

export const ResultModal: React.FC<ResultModalProps> = ({ report, topic, playerA, playerB, debateArguments, onClose, onStartEnglishReplay, onShareReport }) => {
  const [animReady, setAnimReady] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  if (!report) {
    return (
      <div className="modal-overlay">
        <div className="report-modal report-loading">
          <div className="report-loading-spinner" />
          <h2>AI 심판이 평가 중입니다...</h2>
          <p>토론 내용을 분석하고 있습니다. 잠시만 기다려주세요.</p>
        </div>
      </div>
    );
  }

  const totalMax = report.categories.reduce((acc, cat) => acc + (cat.maxScore || 5), 0) || 1;
  const totalPct = Math.round((report.totalScore / totalMax) * 100);
  const grade = getScoreGrade(report.totalScore, totalMax);
  const missionXp = report.categories.reduce((acc, cat) => acc + (cat.xpEarned || 0), 0);

  const getShareUrl = async () => {
    setIsSharing(true);
    try {
      return onShareReport ? await onShareReport() : window.location.origin;
    } catch (error) {
      console.error('Report share error:', error);
      alert('공유 링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return undefined;
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyLink = async () => {
    const url = await getShareUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    alert('로그인 없이 볼 수 있는 공개 보고서 링크를 복사했습니다.');
  };

  const handleKakaoShare = async () => {
    const url = await getShareUrl();
    if (!url) return;
    try {
      await shareReportToKakao({
        title: 'ThinkFit 토론 결과',
        description: `${playerA.name}의 논리력 점수: ${report.totalScore} / ${totalMax}`,
        url,
      });
    } catch (error) {
      console.error('Kakao share error:', error);
      alert('카카오톡 공유 설정을 확인해 주세요.');
    }
  };

  const handleDownloadPdf = () => {
    const previousTitle = document.title;
    document.title = `ThinkFit 토론 보고서 - ${topic}`;
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 0);
  };

  const handleDownloadSocialSummary = async () => {
    try {
      await downloadSocialSummaryImage({
        topic,
        overallFeedback: report.overallFeedback,
        score: report.totalScore,
        maxScore: totalMax,
        grade: grade.label,
        categories: report.categories,
      });
    } catch (error) {
      console.error('SNS summary image error:', error);
      alert('SNS 요약 이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="report-modal">
        {/* --- Hero Section --- */}
        <div className="report-hero">
          <div className="report-hero-bg" />
          <div className="report-hero-content">
            <div className="report-trophy-ring">
              <svg viewBox="0 0 120 120" className="report-ring-svg">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border-color)" strokeWidth="7" opacity="0.3" />
                <circle
                  cx="60" cy="60" r="52"
                  fill="none"
                  stroke={grade.color}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={animReady ? `${2 * Math.PI * 52 * (1 - totalPct / 100)}` : `${2 * Math.PI * 52}`}
                  className="report-ring-progress"
                  style={{ filter: `drop-shadow(0 0 6px ${grade.glow})` }}
                />
              </svg>
              <div className="report-ring-inner">
                <span className="report-ring-grade" style={{ color: grade.color }}>{grade.label}</span>
                <span className="report-ring-pct">{totalPct}점</span>
              </div>
            </div>
            <h2 className="report-title">최종 토론 평가서</h2>
            <p className="report-subtitle">
              <Trophy size={15} /> {playerA.name} vs {playerB.name}
            </p>
            <div className="report-score-summary">
              <span className="report-score-number" style={{ color: grade.color }}>{report.totalScore}</span>
              <span className="report-score-divider">/</span>
              <span className="report-score-max">{totalMax}</span>
            </div>
          </div>
        </div>

        {/* --- Scrollable Body --- */}
        <div className="report-body">
          {/* Overall Feedback */}
          <section className="report-section">
            <h3 className="report-section-title">
              <MessageSquareText size={18} /> 총평 및 조언
            </h3>
            <div className="report-feedback-card">
              <p>{report.overallFeedback}</p>
            </div>
          </section>

          {/* Category Scores */}
          <section className="report-section">
            <h3 className="report-section-title">
              <TrendingUp size={18} /> 세부 역량 분석
              <span className="report-section-hint">(클릭하면 피드백 확인)</span>
            </h3>
            <div className="report-categories-list">
              {report.categories.map((cat, idx) => (
                <CategoryCard key={idx} cat={cat} index={idx} animReady={animReady} />
              ))}
            </div>
          </section>

          {report.phaseCoaching && report.phaseCoaching.length > 0 && (
            <section className="report-section">
              <h3 className="report-section-title">
                <BookOpen size={18} /> 국면별 보완 코칭
              </h3>
              <div className="report-categories-list">
                {report.phaseCoaching.map((coaching, index) => (
                  <article key={`${coaching.phase}-${index}`} className="report-category-card" style={{ padding: '1rem' }}>
                    <strong className="report-cat-name">{coaching.phase}</strong>
                    <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.8rem', lineHeight: 1.55, fontSize: '0.92rem' }}>
                      <div><strong style={{ color: 'var(--text-muted)' }}>관찰</strong><br />{coaching.observed}</div>
                      <div><strong style={{ color: 'var(--secondary)' }}>잘한 점</strong><br />{coaching.strength}</div>
                      <div><strong style={{ color: 'var(--accent-amber)' }}>보완할 점</strong><br />{coaching.improvement}</div>
                      <div><strong style={{ color: 'var(--primary)' }}>다음 훈련</strong><br />{coaching.nextAction}</div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* XP Breakdown */}
          <section className="report-xp-section">
            <div className="report-xp-card">
              <div className="report-xp-left">
                <Sparkles size={22} color="var(--accent-amber)" />
                <div>
                  <div className="report-xp-label">총 획득 경험치</div>
                  <div className="report-xp-detail">
                    기본 참여 50 + 미션 {missionXp}
                    {report.totalScore >= 75 ? ' + 판정승 50' : ''}
                    {report.categories.filter(c => c.score >= 4.5).length >= 3 ? ' + 퍼펙트 30' : ''}
                  </div>
                </div>
              </div>
              <div className="report-xp-value">
                <Star size={18} color="var(--accent-amber)" />
                +{report.xpEarned} XP
              </div>
            </div>
          </section>

          {/* Debate History */}
          {debateArguments && debateArguments.length > 0 && (
            <section className="report-section report-transcript-section" style={{ marginTop: '2rem' }}>
              <h3 className="report-section-title">
                <MessageSquareText size={18} /> 토론 수행 내역
              </h3>
              <p className="report-transcript-description">각 단계에서 작성한 내 발언과 이에 대한 AI 상대방의 답변입니다.</p>
              <div className="history-transcript report-transcript">
                {debateArguments.map((argument) => {
                  return (
                    <article key={argument.id} className={`report-transcript-entry ${argument.isAi ? 'ai' : 'user'}`}>
                      <div className="report-transcript-meta">
                        <strong>{argument.isAi ? 'AI 상대방' : `${playerA.name} · 내 발언`}</strong>
                        <em>{argument.roundTitle ?? (argument.isAi ? 'AI 답변' : '내 발언')}</em>
                      </div>
                      <p className="report-transcript-content">{argument.content}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* --- Footer Actions --- */}
        <div className="report-footer">
          <button className="btn btn-secondary report-footer-btn" onClick={() => void handleCopyLink()} disabled={isSharing}>
            <Share2 size={20} /> 링크 복사
          </button>
          <button className="btn btn-secondary report-footer-btn" onClick={() => void handleKakaoShare()} disabled={isSharing || !isKakaoShareConfigured()} title={!isKakaoShareConfigured() ? '카카오 JavaScript 키 설정 후 사용할 수 있습니다.' : undefined}>
            카카오톡
          </button>
          <button className="btn btn-secondary report-footer-btn" onClick={handleDownloadPdf}>
            <FileDown size={20} /> PDF로 저장
          </button>
          <button className="btn btn-secondary report-footer-btn" onClick={() => void handleDownloadSocialSummary()}>
            <ImageDown size={20} /> SNS 요약 이미지
          </button>
          {onStartEnglishReplay && (
            <button className="btn btn-secondary report-footer-btn" onClick={onStartEnglishReplay}>
              <Languages size={20} /> 영어 리프레이징
            </button>
          )}
          <button className="btn btn-primary report-footer-btn report-footer-main" onClick={onClose}>
            메인으로 돌아가기 <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
