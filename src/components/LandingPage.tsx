import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Zap, Swords, Users, Clock, LogIn, LogOut, FileText } from 'lucide-react';
import { CreateBattleModal } from './CreateBattleModal';
import type { AppUser, BattleConfig } from '../types';

interface LandingPageProps {
  user: AppUser | null;
  onLoginRequest: () => void;
  onLogout: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ user, onLoginRequest, onLogout }) => {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const mockBattles = [
    { id: '1', topic: '인공지능은 예술을 창작할 수 있는가?', type: 'debate', mode: '정식 토론', players: 1, time: 5 },
    { id: '2', topic: '촉법소년 연령 하향, 정당한가?', type: 'pvp', mode: '1:1 자유토론', players: 2, time: 10 },
    { id: '3', topic: '동물원 폐지에 대한 당신의 생각은?', type: 'persona', mode: '칸트 AI', players: 1, time: 3 },
  ];

  const handleStartBattle = (config: BattleConfig) => {
    // In a real app, you would create the battle in Supabase here and get the ID.
    // For now, we pass the config in the router state.
    navigate('/battle/new', { state: config });
  };

  return (
    <div className="app-container" style={{ padding: '2rem' }}>
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 style={{ fontSize: '2.5rem', color: 'var(--primary)', textShadow: '0 0 15px rgba(0, 229, 255, 0.4)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ThinkBattle
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>논리를 겨루는 궁극의 투기장</p>
        </div>
        
        <div className="card flex items-center gap-6" style={{ padding: '1rem 2rem', borderRadius: 'var(--radius-full)' }}>
          <div className="flex items-center gap-3">
            <div style={{ background: 'rgba(255,184,0,0.1)', padding: '0.5rem', borderRadius: '50%', border: '1px solid var(--accent-amber)' }}>
              <Shield size={24} color="var(--accent-amber)" />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>MY LEAGUE</div>
              <div style={{ fontSize: '1.2rem', color: 'var(--accent-amber)', fontWeight: 900 }}>중급 리그</div>
            </div>
          </div>
          <div style={{ width: '1px', height: '40px', background: 'var(--border-color)' }}></div>
          <div className="flex items-center gap-3">
            <div style={{ background: 'rgba(0,229,255,0.1)', padding: '0.5rem', borderRadius: '50%', border: '1px solid var(--primary)' }}>
              <Zap size={24} color="var(--primary)" />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>경험치 (XP)</div>
              <div style={{ fontSize: '1.2rem', color: 'var(--text-light)', fontWeight: 900 }}>4,250 <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Top 12%</span></div>
            </div>
          </div>
          <div style={{ width: '1px', height: '40px', background: 'var(--border-color)' }}></div>
          {user ? (
            <div className="flex items-center gap-3">
              <button className="btn btn-secondary" style={{ padding: '0.7rem 1rem' }} onClick={() => navigate('/history')}>
                <FileText size={18} /> 기록
              </button>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>USER</div>
                <div style={{ fontSize: '1.05rem', color: 'var(--text-light)', fontWeight: 900 }}>{user.nickname}</div>
              </div>
              <button className="icon-button" onClick={onLogout} aria-label="로그아웃">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button className="btn btn-secondary" style={{ padding: '0.8rem 1.2rem' }} onClick={onLoginRequest}>
              <LogIn size={18} /> 로그인
            </button>
          )}
        </div>
      </header>

      <main>
        <div className="flex justify-between items-center mb-6">
          <h2 className="flex items-center gap-2" style={{ fontSize: '1.5rem', margin: 0 }}>
            <Swords color="var(--secondary)" /> 진행 중인 배틀
          </h2>
          <button 
            className="btn btn-primary" 
            style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
            onClick={() => setShowCreateModal(true)}
          >
            <Swords size={20} /> 배틀 개설하기
          </button>
        </div>

        <div className="grid grid-cols-2 gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))' }}>
          {mockBattles.map(battle => (
            <div key={battle.id} className="card" style={{ cursor: 'pointer', transition: 'all 0.2s', borderLeft: battle.type === 'persona' ? '4px solid var(--primary)' : battle.type === 'debate' ? '4px solid var(--accent-amber)' : '4px solid var(--secondary)' }}>
              <div className="flex justify-between items-start mb-4">
                <div className="badge" style={{ background: battle.type === 'persona' ? 'rgba(0,229,255,0.1)' : battle.type === 'debate' ? 'rgba(255,184,0,0.1)' : 'rgba(255,0,85,0.1)', color: battle.type === 'persona' ? 'var(--primary)' : battle.type === 'debate' ? 'var(--accent-amber)' : 'var(--secondary)', border: 'none' }}>
                  {battle.mode}
                </div>
                <div className="flex items-center gap-1" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <Clock size={14} /> {battle.time}분
                </div>
              </div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', lineHeight: 1.4 }}>{battle.topic}</h3>
              <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                <Users size={16} /> {battle.players}명 참가 중
              </div>
            </div>
          ))}
        </div>
      </main>

      {showCreateModal && <CreateBattleModal onClose={() => setShowCreateModal(false)} onStart={handleStartBattle} />}
    </div>
  );
};
