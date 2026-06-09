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

        {(argument.aiQuestion || argument.aiLesson || argument.nextTask) && (
          <div className="argument-insight">
            {argument.aiQuestion && (
              <div>
                <div className="insight-title coral">
                  <AlertCircle size={18} /> 날카로운 역질문
                </div>
                <div className="insight-copy">{argument.aiQuestion}</div>
              </div>
            )}
            {argument.nextTask && (
              <div>
                <div className="insight-title amber">
                  <AlertCircle size={18} /> 다음 과제
                </div>
                <div className="insight-copy">{argument.nextTask}</div>
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
