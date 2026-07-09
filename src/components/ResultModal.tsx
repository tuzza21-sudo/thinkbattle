import React, { useState, useEffect } from 'react';
import type { FinalReport, Player } from '../types';
import { Trophy, Star, ChevronRight, MessageSquareText, Languages, TrendingUp, Sparkles, ChevronDown } from 'lucide-react';

interface ResultModalProps {
  report: FinalReport | null;
  playerA: Player;
  playerB: Player;
  onClose: () => void;
  onStartEnglishReplay?: () => void;
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
  const [expanded, setExpanded] = useState(false);
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

export const ResultModal: React.FC<ResultModalProps> = ({ report, playerA, playerB, onClose, onStartEnglishReplay }) => {
  const [animReady, setAnimReady] = useState(false);

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
        </div>

        {/* --- Footer Actions --- */}
        <div className="report-footer">
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
