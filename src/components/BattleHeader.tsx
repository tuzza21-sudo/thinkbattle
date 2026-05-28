import React from 'react';
import { Flag, LayoutDashboard } from 'lucide-react';
import type { BattleState } from '../types';

interface BattleHeaderProps {
  battleState: BattleState;
}

export const BattleHeader: React.FC<BattleHeaderProps> = ({ battleState }) => {
  return (
    <header className="flex justify-between items-center" style={{ padding: '1rem 0', marginBottom: '1rem' }}>
      <div className="flex gap-2" style={{ flex: 1 }}>
        <div className="badge" style={{ background: 'rgba(0, 229, 255, 0.1)', color: 'var(--primary)', border: '1px solid var(--border-cyan)' }}>
          {battleState.matchType}
        </div>
      </div>
      
      <div className="flex flex-col items-center justify-center" style={{ flex: 2 }}>
        <h1 style={{ 
          margin: 0, 
          fontSize: '1.8rem', 
          maxWidth: '800px', 
          whiteSpace: 'nowrap', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          textShadow: '0 0 15px rgba(255,255,255,0.3)', 
          letterSpacing: '0.05em',
          textTransform: 'uppercase'
        }}>
          {battleState.topic}
        </h1>
      </div>
      
      <div className="flex gap-3 justify-end" style={{ flex: 1 }}>
        <button className="btn btn-secondary" style={{ padding: '0.6rem' }} title="배틀 규칙">
          <LayoutDashboard size={18} />
        </button>
        <button className="btn btn-secondary" style={{ padding: '0.6rem', color: 'var(--text-muted)' }} title="항복하기">
          <Flag size={18} />
        </button>
      </div>
    </header>
  );
};
