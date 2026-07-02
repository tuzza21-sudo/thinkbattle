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
  const [argumentsList, setArgumentsList] = useState([{ reason: '', evidence: '' }]);

  const isOpeningRound = currentRound?.title === '입론';

  const handleSubmit = () => {
    if (!isPaused) {
      if (isOpeningRound) {
        const validArgs = argumentsList.filter(arg => arg.reason.trim() || arg.evidence.trim());
        if (validArgs.length > 0) {
          const submissionText = validArgs.map((arg, i) => {
            const prefix = validArgs.length > 1 ? `[논거 ${i + 1}]\n` : '';
            return `${prefix}[이유]\n${arg.reason.trim()}\n\n[근거]\n${arg.evidence.trim()}`;
          }).join('\n\n');
          onSubmit(submissionText);
          setArgumentsList([{ reason: '', evidence: '' }]);
        }
      } else {
        if (content.trim()) {
          onSubmit(content);
          setContent('');
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isOpeningRound) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAddArgument = () => {
    if (argumentsList.length < 3) {
      setArgumentsList([...argumentsList, { reason: '', evidence: '' }]);
    }
  };

  const handleRemoveArgument = (index: number) => {
    if (argumentsList.length > 1) {
      setArgumentsList(argumentsList.filter((_, i) => i !== index));
    }
  };

  const handleArgumentChange = (index: number, field: 'reason' | 'evidence', value: string) => {
    const newList = [...argumentsList];
    newList[index][field] = value;
    setArgumentsList(newList);
  };

  const totalLength = isOpeningRound 
    ? argumentsList.reduce((sum, arg) => sum + arg.reason.length + arg.evidence.length, 0)
    : content.length;

  const isSubmitDisabled = isPaused || !isPlayerTurn || (isOpeningRound ? !argumentsList.some(arg => arg.reason.trim() || arg.evidence.trim()) : !content.trim());

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
        
        <div className="composer-row" style={isOpeningRound ? { flexDirection: 'column', gap: '0.8rem' } : undefined}>
          {isOpeningRound ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              {argumentsList.map((arg, index) => (
                <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: argumentsList.length > 1 ? '1rem' : '0', background: argumentsList.length > 1 ? 'var(--bg-elevated)' : 'transparent', borderRadius: '8px', border: argumentsList.length > 1 ? '1px solid var(--border-color)' : 'none', position: 'relative' }}>
                  {argumentsList.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>논거 세트 {index + 1}</span>
                      <button 
                        className="btn" 
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: 'var(--error-color)', background: 'transparent', border: 'none' }}
                        onClick={() => handleRemoveArgument(index)}
                        title="삭제"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', fontWeight: 600 }}>1. 이유 (나의 입장을 뒷받침하는 핵심 진술)</span>
                    <textarea
                      className="input-textarea"
                      style={{ minHeight: '60px' }}
                      placeholder={isPaused ? "진행 버튼을 누르면 이어서 작성할 수 있습니다." : isPlayerTurn ? "주장에 대한 핵심 이유를 작성해주세요..." : isAiThinking ? "상대방이 답변을 준비 중입니다..." : "대기 중..."}
                      value={arg.reason}
                      onChange={(e) => handleArgumentChange(index, 'reason', e.target.value)}
                      disabled={isPaused || !isPlayerTurn || isAiThinking}
                      maxLength={600}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', fontWeight: 600 }}>2. 근거 (이유를 증명하는 구체적 사례나 사실)</span>
                    <textarea
                      className="input-textarea"
                      style={{ minHeight: '60px' }}
                      placeholder={isPaused ? "진행 버튼을 누르면 이어서 작성할 수 있습니다." : isPlayerTurn ? "이유를 뒷받침할 구체적인 근거를 작성해주세요..." : isAiThinking ? "상대방이 답변을 준비 중입니다..." : "대기 중..."}
                      value={arg.evidence}
                      onChange={(e) => handleArgumentChange(index, 'evidence', e.target.value)}
                      disabled={isPaused || !isPlayerTurn || isAiThinking}
                      maxLength={600}
                    />
                  </div>
                </div>
              ))}
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                {argumentsList.length < 3 ? (
                  <button 
                    className="btn btn-secondary" 
                    onClick={handleAddArgument}
                    disabled={isPaused || !isPlayerTurn || isAiThinking}
                    style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                  >
                    + 논거 세트 추가 (최대 3개)
                  </button>
                ) : (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>최대 3개의 논거 세트까지 작성할 수 있습니다.</span>
                )}
                <button 
                  className="btn btn-primary send-button" 
                  style={{ alignSelf: 'flex-end', padding: '0.8rem 2rem' }}
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled}
                  title="보내기"
                >
                  <Send size={24} />
                </button>
              </div>
            </div>
          ) : (
            <textarea
              className="input-textarea"
              placeholder={isPaused ? "진행 버튼을 누르면 이어서 작성할 수 있습니다." : isPlayerTurn ? currentRound?.inputPlaceholder ?? "주장에 대한 반박이나 질문을 입력하세요..." : isAiThinking ? "상대방이 답변을 준비 중입니다..." : "대기 중..."}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isPaused || !isPlayerTurn || isAiThinking}
              maxLength={1200}
            />
          )}
          
          {!isOpeningRound && (
            <button 
              className="btn btn-primary send-button" 
              onClick={handleSubmit}
              disabled={isSubmitDisabled}
              title="보내기"
            >
              <Send size={24} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
