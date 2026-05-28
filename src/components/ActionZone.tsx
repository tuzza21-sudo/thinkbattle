import React, { useState } from 'react';
import { Send, Lock, Zap } from 'lucide-react';
import type { DebateStep } from '../types';

interface ActionZoneProps {
  currentRound?: DebateStep;
  roundProgress?: {
    current: number;
    total: number;
  };
  isPlayerTurn: boolean;
  isAiThinking: boolean;
  onSubmit: (content: string) => void;
}

export const ActionZone: React.FC<ActionZoneProps> = ({ currentRound, roundProgress, isPlayerTurn, isAiThinking, onSubmit }) => {
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (content.trim()) {
      onSubmit(content);
      setContent('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={`input-zone ${isPlayerTurn ? 'my-turn' : ''}`}>
      <div className="input-container">
        <div className="flex justify-between items-center mb-2">
          <span style={{ 
            fontWeight: 800, 
            color: isPlayerTurn ? 'var(--primary)' : 'var(--text-muted)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            textShadow: isPlayerTurn ? '0 0 10px rgba(0, 229, 255, 0.5)' : 'none',
            letterSpacing: '0.05em'
          }}>
            {isPlayerTurn ? (
              <><Zap size={18} /> 내 차례</>
            ) : isAiThinking ? (
              <><Lock size={16} /> 상대방이 생각 중입니다...</>
            ) : (
              <><Lock size={16} /> 상대방 응답 대기 중...</>
            )}
          </span>
          {isPlayerTurn && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-game)' }}>
              {content.length}/1200
            </span>
          )}
        </div>
        {currentRound && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--text-light)' }}>
              {roundProgress ? `${roundProgress.current}/${roundProgress.total} · ` : ''}{currentRound.title}
            </strong> · {currentRound.instruction}
          </div>
        )}
        
        <div className="flex gap-4 items-end">
          <textarea
            className="input-textarea"
            placeholder={isPlayerTurn ? currentRound?.inputPlaceholder ?? "주장에 대한 반박이나 질문을 입력하세요..." : isAiThinking ? "상대방이 답변을 준비 중입니다..." : "대기 중..."}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isPlayerTurn || isAiThinking}
            maxLength={1200}
          />
          <button 
            className="btn btn-primary" 
            style={{ padding: '0 1.5rem', borderRadius: 'var(--radius-sm)', height: '80px' }}
            onClick={handleSubmit}
            disabled={!isPlayerTurn || !content.trim()}
          >
            <Send size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};
