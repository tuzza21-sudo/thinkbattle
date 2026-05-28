import React from 'react';
import type { Argument, Player } from '../types';
import { BookOpen, AlertCircle } from 'lucide-react';

interface ArgumentCardProps {
  argument: Argument;
  player: Player;
  isHighlighted?: boolean;
}

export const ArgumentCard: React.FC<ArgumentCardProps> = ({ argument, player, isHighlighted }) => {
  const isPlayerA = !argument.isAi;
  
  return (
    <div className={`argument-card ${isPlayerA ? 'player-a' : 'player-b'} ${isHighlighted ? 'highlight' : ''}`}>
      <div className="argument-meta">
        <span style={{ color: isPlayerA ? 'var(--primary)' : 'var(--secondary)' }}>
          {argument.roundTitle ? `${argument.roundTitle} · ` : ''}{player.name}
        </span>
        <span style={{ opacity: 0.7 }}>{argument.timestamp}</span>
      </div>
      
      {/* 본문 (자신의 주장/반박) */}
      <div className="argument-content" style={{ lineHeight: 1.6, marginBottom: (argument.aiQuestion || argument.aiLesson) ? '1rem' : '0' }}>
        {argument.content}
      </div>
      
      {/* 역질문 및 레슨 영역 */}
      {(argument.aiQuestion || argument.aiLesson) && (
        <div style={{ 
          marginTop: '0.5rem', 
          padding: '1rem', 
          background: 'rgba(0,0,0,0.3)', 
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          fontSize: '0.9rem',
          borderTop: '1px solid var(--border-color)',
          borderLeft: '3px solid var(--accent-coral)'
        }}>
          {argument.aiQuestion && (
            <div>
              <div style={{ color: 'var(--accent-coral)', fontWeight: 800, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1rem' }}>
                <AlertCircle size={18} /> 날카로운 역질문
              </div>
              <div style={{ color: 'var(--text-light)', fontWeight: 600, lineHeight: 1.5, fontSize: '0.95rem' }}>{argument.aiQuestion}</div>
            </div>
          )}
          {argument.nextTask && (
            <div>
              <div style={{ color: 'var(--accent-amber)', fontWeight: 800, marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1rem' }}>
                <AlertCircle size={18} /> 다음 과제
              </div>
              <div style={{ color: 'var(--text-light)', fontWeight: 600, lineHeight: 1.5, fontSize: '0.95rem' }}>{argument.nextTask}</div>
            </div>
          )}
          
          {argument.aiLesson && (
            <div style={{ paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
              <div style={{ color: 'var(--primary)', fontWeight: 800, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <BookOpen size={16} /> 철학적 배경
              </div>
              <div style={{ color: 'var(--text-main)' }}>{argument.aiLesson}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
