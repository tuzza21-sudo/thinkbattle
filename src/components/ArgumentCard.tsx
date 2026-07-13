import React from 'react';
import type { Argument, Player } from '../types';
import { BookOpen, AlertCircle } from 'lucide-react';

interface ArgumentCardProps {
  argument: Argument;
  player: Player;
  isHighlighted?: boolean;
}

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const ArgumentCard: React.FC<ArgumentCardProps> = ({ argument, player, isHighlighted }) => {
  const isPlayerA = !argument.isAi;
  const hasTiming = !argument.isAi && typeof argument.elapsedSeconds === 'number' && typeof argument.recommendedDurationSeconds === 'number';
  
  return (
    <div className={`argument-card ${isPlayerA ? 'player-a' : 'player-b'} ${isHighlighted ? 'highlight' : ''}`}>
      <img className="argument-avatar" src={player.avatar} alt={player.name} />
      <div className="argument-bubble">
        <div className="argument-meta">
          <span style={{ color: isPlayerA ? 'var(--primary)' : 'var(--secondary)' }}>
            {argument.roundTitle ? `${argument.roundTitle} · ` : ''}{player.name}
          </span>
          <span style={{ opacity: 0.7 }}>{argument.timestamp}</span>
        </div>

        {hasTiming && (
          <div className={`argument-time ${argument.overtimeSeconds ? 'overtime' : ''}`}>
            <span>권장 {formatDuration(argument.recommendedDurationSeconds ?? 0)}</span>
            <span>사용 {formatDuration(argument.elapsedSeconds ?? 0)}</span>
            {(argument.overtimeSeconds ?? 0) > 0 && <strong>+{formatDuration(argument.overtimeSeconds ?? 0)} 초과</strong>}
          </div>
        )}

        <div className="argument-content">
          {argument.content}
        </div>

        {(argument.aiQuestion || argument.aiLesson || argument.turnFeedback) && (
          <div className="argument-insight">
            {argument.turnFeedback && (
              <div style={{ background: 'var(--bg-primary)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent-amber)', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <div className="insight-title" style={{ color: 'var(--accent-amber)', margin: 0 }}>
                    <AlertCircle size={18} /> 실시간 미션 평가
                  </div>
                  {argument.turnXp !== undefined && (
                    <div style={{ background: 'var(--accent-amber)', color: 'var(--bg-primary)', padding: '0.15rem 0.6rem', borderRadius: '12px', fontWeight: 800, fontSize: '0.85rem' }}>
                      +{argument.turnXp} XP
                    </div>
                  )}
                </div>
                <div style={{ color: 'var(--text-light)', fontSize: '0.95rem' }}>{argument.turnFeedback}</div>
                {argument.turnFeedbackDetail && (
                  <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.75rem', fontSize: '0.88rem', lineHeight: 1.55 }}>
                    <div><strong style={{ color: 'var(--primary)' }}>이번 단계 목표</strong><br />{argument.turnFeedbackDetail.phaseGoal}</div>
                    <div><strong style={{ color: 'var(--secondary)' }}>잘한 점</strong><br />{argument.turnFeedbackDetail.completed}</div>
                    <div><strong style={{ color: 'var(--accent-amber)' }}>보완할 점</strong><br />{argument.turnFeedbackDetail.missing}</div>
                    <div><strong>다음 행동</strong><br />{argument.turnFeedbackDetail.nextAction}</div>
                  </div>
                )}
              </div>
            )}
            {argument.aiQuestion && (
              <div>
                <div className="insight-title coral">
                  <AlertCircle size={18} /> 상대측 교차질문
                </div>
                <div className="insight-copy">{argument.aiQuestion}</div>
              </div>
            )}

            {argument.aiLesson && (
              <div className="insight-lesson">
                <div className="insight-title cyan">
                  <BookOpen size={16} /> 철학적 배경
                </div>
                <div>{argument.aiLesson}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
