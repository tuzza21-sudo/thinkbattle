import React, { useState } from 'react';
import { Clock, Layers3, Scale, X } from 'lucide-react';
import type { BattleConfig, DebateLevel, DebatePosition } from '../types';

interface CreateBattleModalProps {
  onClose: () => void;
  onStart: (config: BattleConfig) => void;
}

export const CreateBattleModal: React.FC<CreateBattleModalProps> = ({ onClose, onStart }) => {
  const [topic, setTopic] = useState('');
  const [timeLimit, setTimeLimit] = useState<number>(600);
  const [userPosition, setUserPosition] = useState<DebatePosition>('affirmative');
  const [debateLevel, setDebateLevel] = useState<DebateLevel>('beginner');

  const handleStart = () => {
    if (!topic.trim()) return;
    onStart({
      topic: topic.trim(),
      timeLimit,
      gameMode: 'debate',
      userPosition,
      debateLevel,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ padding: '2rem' }}>
        <div className="flex justify-between items-center mb-6">
          <h2 style={{ fontSize: '1.8rem', color: 'var(--primary)', textShadow: '0 0 10px rgba(0,229,255,0.3)', margin: 0 }}>
            정식 토론 배틀 개설
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} aria-label="닫기">
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>토론 형식</label>
            <div
              className="card flex items-center gap-3"
              style={{
                border: '2px solid var(--accent-amber)',
                boxShadow: 'var(--shadow-glow-timer)',
              }}
            >
              <Scale size={22} color="var(--accent-amber)" />
              <div>
                <div style={{ fontWeight: 900, color: 'var(--text-light)' }}>정식 토론</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  라운드테이블과 페르소나 모드는 잠시 비활성화되어 있습니다.
                </div>
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>내 입장</label>
            <div className="grid grid-cols-2 gap-4">
              {[
                { value: 'affirmative' as DebatePosition, label: '찬성' },
                { value: 'negative' as DebatePosition, label: '반대' },
              ].map(option => (
                <button
                  key={option.value}
                  type="button"
                  className="card flex items-center justify-center gap-2"
                  style={{
                    cursor: 'pointer',
                    minHeight: '58px',
                    border: userPosition === option.value ? '2px solid var(--accent-amber)' : '1px solid var(--border-color)',
                    color: userPosition === option.value ? 'var(--accent-amber)' : 'var(--text-muted)',
                    fontWeight: 900,
                  }}
                  onClick={() => setUserPosition(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>토론 수준</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'beginner' as DebateLevel, label: '초급' },
                { value: 'intermediate' as DebateLevel, label: '중급' },
              ].map(option => (
                <button
                  key={option.value}
                  type="button"
                  className="card flex items-center justify-center gap-2"
                  style={{
                    cursor: 'pointer',
                    minHeight: '58px',
                    padding: '0.8rem',
                    border: debateLevel === option.value ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    color: debateLevel === option.value ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: 900,
                  }}
                  onClick={() => setDebateLevel(option.value)}
                >
                  <Layers3 size={17} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>권장 총 시간</label>
            <div className="flex gap-4">
              {[600, 900, 1200].map(time => (
                <button
                  key={time}
                  type="button"
                  className="card flex items-center justify-center gap-2"
                  style={{
                    flex: 1,
                    padding: '1rem',
                    cursor: 'pointer',
                    border: timeLimit === time ? '2px solid var(--accent-amber)' : '1px solid var(--border-color)',
                    boxShadow: timeLimit === time ? 'var(--shadow-glow-timer)' : 'none',
                  }}
                  onClick={() => setTimeLimit(time)}
                >
                  <Clock size={18} color={timeLimit === time ? 'var(--accent-amber)' : 'var(--text-muted)'} />
                  <span style={{ fontWeight: 800, color: timeLimit === time ? 'var(--accent-amber)' : 'var(--text-muted)' }}>{time / 60}분</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>토론 주제</label>
            <input
              type="text"
              className="input-textarea"
              style={{ minHeight: 'auto', padding: '1rem' }}
              placeholder="예: 학생의 AI 사용은 허용되어야 하는가?"
              value={topic}
              onChange={e => setTopic(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '1.2rem', fontSize: '1.2rem', marginTop: '1rem' }}
            disabled={!topic.trim()}
            onClick={handleStart}
          >
            토론 시작
          </button>
        </div>
      </div>
    </div>
  );
};
