import React from 'react';
import type { FinalReport, Player } from '../types';
import { Trophy, Star, ChevronRight, BarChart2, BookOpen, Languages } from 'lucide-react';

interface ResultModalProps {
  report: FinalReport | null;
  playerA: Player;
  playerB: Player;
  onClose: () => void;
  onStartEnglishReplay?: () => void;
}

export const ResultModal: React.FC<ResultModalProps> = ({ report, playerA, playerB, onClose, onStartEnglishReplay }) => {
  if (!report) {
    return (
      <div className="modal-overlay">
        <div className="modal-content" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--primary)' }}>결과를 분석 중입니다...</h2>
          <p style={{ color: 'var(--text-muted)' }}>잠시만 기다려주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ padding: '2rem', maxWidth: '900px', width: '90%' }}>
        <div className="flex flex-col items-center mb-6">
          <Trophy size={48} color="var(--accent-amber)" style={{ marginBottom: '1rem' }} />
          <h2 style={{ fontSize: '2rem', margin: 0, color: 'var(--accent-amber)' }}>
            최종 토론 평가서
          </h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>{playerA.name} vs {playerB.name} 토론 완료</p>
        </div>

        <div className="flex gap-6">
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                <BookOpen size={20} /> 총평 및 조언
              </h3>
              <div className="card" style={{ background: '#F8FAFC', border: '1px solid var(--border-color)', lineHeight: 1.6, padding: '1.5rem' }}>
                {report.overallFeedback}
              </div>
            </div>
            
            <div className="flex items-center justify-between" style={{ padding: '1.5rem', background: 'rgba(255,184,0,0.1)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--accent-amber)', marginTop: 'auto' }}>
              <div className="flex items-center gap-3">
                <Star size={32} color="var(--accent-amber)" />
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--accent-amber)', fontSize: '1.1rem' }}>획득 경험치</div>
                  <div style={{ fontSize: '1.5rem', color: 'var(--text-light)', fontWeight: 900, fontFamily: 'var(--font-game)' }}>+ {report.xpEarned} XP</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-muted)' }}>종합 점수</div>
                <div style={{ fontSize: '2.5rem', color: 'var(--primary)', fontWeight: 900, fontFamily: 'var(--font-game)', lineHeight: 1 }}>{report.totalScore}<span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>/100</span></div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1.2 }}>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--secondary)' }}>
              <BarChart2 size={20} /> 세부 평가 항목
            </h3>
            <div className="flex flex-col gap-4">
              {report.categories.map((cat, idx) => (
                <div key={idx} className="card" style={{ padding: '1.2rem' }}>
                  <div className="flex justify-between items-center mb-3">
                    <span style={{ fontWeight: 800, color: 'var(--text-light)', fontSize: '1.1rem' }}>{cat.name}</span>
                    <span style={{ fontWeight: 900, color: 'var(--primary)', fontFamily: 'var(--font-game)', fontSize: '1.2rem' }}>{cat.score}<span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>/{cat.maxScore}</span></span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', position: 'relative', marginBottom: '1rem' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(cat.score / cat.maxScore) * 100}%`, background: 'var(--primary)', borderRadius: '4px', boxShadow: '0 0 10px var(--primary)' }} />
                  </div>
                  <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{cat.feedback}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-8" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          {onStartEnglishReplay && (
            <button className="btn btn-secondary" style={{ padding: '1rem 1.5rem', fontSize: '1rem' }} onClick={onStartEnglishReplay}>
              <Languages size={22} /> 영어 리프레이징 하기
            </button>
          )}
          <button className="btn btn-primary" style={{ padding: '1rem 2.5rem', fontSize: '1.2rem' }} onClick={onClose}>
            메인 화면으로 돌아가기 <ChevronRight size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};
