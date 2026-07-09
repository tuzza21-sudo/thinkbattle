import React, { useState } from 'react';
import { Send, Lock, Zap, Lightbulb } from 'lucide-react';
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

  const isOpeningRound = currentRound?.title === '입론';

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

  const totalLength = content.length;

  const isSubmitDisabled = isPaused || !isPlayerTurn || !content.trim();

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
              {totalLength}/1200
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
        
        {isOpeningRound && isPlayerTurn && (
          <div className="opening-guide-tip">
            <div className="opening-guide-tip-header">
              <Lightbulb size={15} />
              <span>입론 작성 가이드</span>
            </div>
            <div className="opening-guide-tip-body">
              <p><strong>이유</strong>와 <strong>근거</strong>를 구분하여 작성해 보세요!</p>
              <ul>
                <li><strong>이유</strong> — 나의 입장을 뒷받침하는 <em>핵심 주장</em> (왜 그렇게 생각하는가?)</li>
                <li><strong>근거</strong> — 이유를 증명하는 <em>구체적 사례·통계·사실</em></li>
              </ul>
              <p className="opening-guide-example">예) 이유: "원격 수업은 학습 효율을 높인다" → 근거: "OO 연구에 따르면 자기주도 학습 시간이 30% 증가했다"</p>
            </div>
          </div>
        )}

        <div className="composer-row">
          <textarea
            className="input-textarea"
            style={isOpeningRound ? { minHeight: '120px' } : undefined}
            placeholder={isPaused ? "진행 버튼을 누르면 이어서 작성할 수 있습니다." : isPlayerTurn ? (isOpeningRound ? "이유와 근거를 구분하여 입론을 작성해 주세요...\n\n예)\n[이유] 원격 수업은 학습 효율을 높인다.\n[근거] OO 연구에 따르면 자기주도 학습 시간이 30% 증가했다." : currentRound?.inputPlaceholder ?? "주장에 대한 반박이나 질문을 입력하세요...") : isAiThinking ? "상대방이 답변을 준비 중입니다..." : "대기 중..."}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPaused || !isPlayerTurn || isAiThinking}
            maxLength={1200}
          />
          
          <button 
            className="btn btn-primary send-button" 
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            title="제출"
          >
            <Send size={18} />
            <span>제출</span>
          </button>
        </div>
      </div>
    </div>
  );
};
