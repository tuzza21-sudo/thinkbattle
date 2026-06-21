import React, { useState } from 'react';
import { Send, Lock, Zap } from 'lucide-react';
import type { DebateStep } from '../types';

interface ActionZoneProps {
  currentRound?: DebateStep;
  roundProgress?: {
    current: number;
    total: number;
  };
  timing?: {
    recommendedSeconds: number;
    elapsedSeconds: number;
    remainingSeconds: number;
    overtimeSeconds: number;
  };
  isPlayerTurn: boolean;
  isAiThinking: boolean;
  isPaused?: boolean;
  onSubmit: (content: string) => void;
}

const formatTimer = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const m = Math.floor(safeSeconds / 60);
  const s = safeSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const ActionZone: React.FC<ActionZoneProps> = ({ currentRound, roundProgress, timing, isPlayerTurn, isAiThinking, isPaused = false, onSubmit }) => {
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (!isPaused && content.trim()) {
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
        <div className="composer-head">
          <span>
            {isPlayerTurn ? (
              <><Zap size={18} /> 내 차례</>
            ) : isPaused ? (
              <><Lock size={16} /> 일시정지 중입니다</>
            ) : isAiThinking ? (
              <><Lock size={16} /> 상대방이 생각 중입니다...</>
            ) : (
              <><Lock size={16} /> 상대방 응답 대기 중...</>
            )}
          </span>
          {isPlayerTurn && (
            <small>
              {content.length}/1200
            </small>
          )}
        </div>
        {currentRound && (
          <div className="composer-round">
            <strong>
              {roundProgress ? `${roundProgress.current}/${roundProgress.total} · ` : ''}{currentRound.title}
            </strong>
            <span>{currentRound.instruction}</span>
            {timing && (
              <span className={`stage-timer-chip ${timing.overtimeSeconds > 0 ? 'overtime' : timing.remainingSeconds <= 30 ? 'warning' : ''}`}>
                {timing.overtimeSeconds > 0
                  ? `권장 시간 +${formatTimer(timing.overtimeSeconds)} 초과`
                  : `남은 권장 시간 ${formatTimer(timing.remainingSeconds)}`}
              </span>
            )}
          </div>
        )}
        
        <div className="composer-row">
          <textarea
            className="input-textarea"
            placeholder={isPaused ? "진행 버튼을 누르면 이어서 작성할 수 있습니다." : isPlayerTurn ? currentRound?.inputPlaceholder ?? "주장에 대한 반박이나 질문을 입력하세요..." : isAiThinking ? "상대방이 답변을 준비 중입니다..." : "대기 중..."}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPaused || !isPlayerTurn || isAiThinking}
            maxLength={1200}
          />
          <button 
            className="btn btn-primary send-button" 
            onClick={handleSubmit}
            disabled={isPaused || !isPlayerTurn || !content.trim()}
            title="보내기"
          >
            <Send size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};
