import React, { useState } from 'react';
import { X, Clock, User, Cpu, Scale, UsersRound } from 'lucide-react';
import type { BattleConfig, DebatePosition, GameMode, PersonaId } from '../types';

interface CreateBattleModalProps {
  onClose: () => void;
  onStart: (config: BattleConfig) => void;
}

const modeOptions: Array<{
  value: GameMode;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  shadow: string;
}> = [
  { value: 'debate', label: '정식 토론', icon: Scale, color: 'var(--accent-amber)', shadow: 'var(--shadow-glow-timer)' },
  { value: 'persona', label: '개별 페르소나', icon: Cpu, color: 'var(--primary)', shadow: 'var(--shadow-glow-cyan)' },
  { value: 'roundtable', label: '라운드테이블', icon: UsersRound, color: 'var(--accent-coral)', shadow: '0 0 20px rgba(255, 93, 108, 0.35)' },
  { value: 'pvp', label: '사람 vs 사람', icon: User, color: 'var(--secondary)', shadow: 'var(--shadow-glow-pink)' },
];

const personaOptions: Array<{ value: PersonaId; label: string }> = [
  { value: 'socrates', label: '소크라테스' },
  { value: 'jeong_yakyong', label: '정약용' },
  { value: 'kant', label: '칸트' },
  { value: 'nietzsche', label: '니체' },
];

export const CreateBattleModal: React.FC<CreateBattleModalProps> = ({ onClose, onStart }) => {
  const [topic, setTopic] = useState('');
  const [timeLimit, setTimeLimit] = useState<number>(300);
  const [gameMode, setGameMode] = useState<GameMode>('debate');
  const [personaId, setPersonaId] = useState<PersonaId>('socrates');
  const [userPosition, setUserPosition] = useState<DebatePosition>('affirmative');

  const handleStart = () => {
    if (!topic.trim()) return;
    onStart({
      topic,
      timeLimit,
      gameMode,
      personaId: gameMode === 'persona' ? personaId : undefined,
      userPosition: gameMode === 'debate' ? userPosition : undefined,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ padding: '2rem' }}>
        <div className="flex justify-between items-center mb-6">
          <h2 style={{ fontSize: '1.8rem', color: 'var(--primary)', textShadow: '0 0 10px rgba(0,229,255,0.3)', margin: 0 }}>
            토론 배틀 개설
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>게임 모드</label>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {modeOptions.map(option => {
                const Icon = option.icon;
                const isSelected = gameMode === option.value;
                return (
                  <button
                    key={option.value}
                    className={`card flex items-center justify-center gap-2 ${isSelected ? 'highlight' : ''}`}
                    style={{
                      cursor: 'pointer',
                      border: isSelected ? `2px solid ${option.color}` : '1px solid var(--border-color)',
                      boxShadow: isSelected ? option.shadow : 'none',
                    }}
                    onClick={() => setGameMode(option.value)}
                  >
                    <Icon size={20} color={isSelected ? option.color : 'var(--text-muted)'} />
                    <span style={{ fontWeight: 800, color: isSelected ? 'var(--text-light)' : 'var(--text-muted)' }}>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {gameMode === 'debate' && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>내 입장</label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: 'affirmative' as DebatePosition, label: '찬성' },
                  { value: 'negative' as DebatePosition, label: '반대' },
                ].map(option => (
                  <button
                    key={option.value}
                    className="card flex items-center justify-center gap-2"
                    style={{
                      cursor: 'pointer',
                      border: userPosition === option.value ? '2px solid var(--accent-amber)' : '1px solid var(--border-color)',
                      color: userPosition === option.value ? 'var(--accent-amber)' : 'var(--text-muted)',
                      fontWeight: 800,
                    }}
                    onClick={() => setUserPosition(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameMode === 'persona' && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>AI 페르소나</label>
              <div className="flex gap-3 overflow-x-auto" style={{ paddingBottom: '0.5rem' }}>
                {personaOptions.map(option => (
                  <button
                    key={option.value}
                    className="card"
                    style={{
                      flex: '0 0 auto',
                      width: '132px',
                      padding: '1rem',
                      cursor: 'pointer',
                      textAlign: 'center',
                      border: personaId === option.value ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                    }}
                    onClick={() => setPersonaId(option.value)}
                  >
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: personaId === option.value ? 'var(--text-light)' : 'var(--text-muted)' }}>
                      {option.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {gameMode === 'roundtable' && (
            <div className="card" style={{ border: '1px solid rgba(255, 93, 108, 0.45)', boxShadow: '0 0 18px rgba(255, 93, 108, 0.18)' }}>
              <div style={{ fontWeight: 900, color: 'var(--text-light)', marginBottom: '0.4rem' }}>참가자</div>
              <div style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                소크라테스가 개념을 묻고, 칸트가 원칙을 검증하며, 니체가 숨은 가치와 동기를 흔듭니다.
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 700, color: 'var(--text-muted)' }}>제한 시간</label>
            <div className="flex gap-4">
              {[300, 600, 900].map(time => (
                <button
                  key={time}
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
            배틀 시작
          </button>
        </div>
      </div>
    </div>
  );
};
