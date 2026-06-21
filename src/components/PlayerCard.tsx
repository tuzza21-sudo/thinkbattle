import React from 'react';
import type { Player } from '../types';
import { Shield, Zap, TrendingUp } from 'lucide-react';

interface PlayerCardProps {
  player: Player;
  isOpponent?: boolean;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({ player, isOpponent = false }) => {
  const glowColor = isOpponent ? 'var(--secondary)' : 'var(--primary)';
  const shadowGlow = isOpponent ? 'var(--shadow-glow-pink)' : 'var(--shadow-glow-cyan)';

  return (
    <div className={`card flex items-center gap-4 ${isOpponent ? 'flex-row-reverse' : ''}`} style={{ 
        width: '400px', 
        border: `1px solid ${glowColor}`,
        boxShadow: shadowGlow,
        background: 'linear-gradient(to bottom right, #FFFFFF, #F8FAFC)',
        clipPath: isOpponent ? 'polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)' : 'polygon(0 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 15px 100%, 0 calc(100% - 15px))'
    }}>
      <img 
        src={player.avatar} 
        alt={player.name} 
        style={{ 
          width: '72px', 
          height: '72px', 
          borderRadius: '8px', 
          objectFit: 'cover',
          border: `2px solid ${glowColor}`,
          boxShadow: `0 0 10px ${glowColor}`,
          transform: isOpponent ? 'skewX(-5deg)' : 'skewX(5deg)'
        }} 
      />
      
      <div className={`flex flex-col ${isOpponent ? 'items-end text-right' : 'text-left'}`} style={{ flex: 1 }}>
        <div className={`flex items-center gap-2 mb-2 ${isOpponent ? 'flex-row-reverse' : ''}`}>
          <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--text-light)', textShadow: `0 0 5px ${glowColor}` }}>{player.name}</h3>
          {player.isAi && <span className="badge" style={{ background: glowColor, color: '#000', border: 'none' }}>AI</span>}
        </div>
        
        <div className={`flex items-center gap-3 ${isOpponent ? 'flex-row-reverse' : ''}`} style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--font-game)', fontWeight: 800 }}>
          <div className="flex items-center gap-1">
            <Shield size={14} color={glowColor} />
            <span>Lv.{player.level}</span>
          </div>
          <div className="flex items-center gap-1">
            <Zap size={14} color="var(--accent-amber)" />
            <span>{player.score} pt</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp size={14} color="var(--accent-coral)" />
            <span>{player.streak}연승</span>
          </div>
        </div>
      </div>
      
      <div className="badge badge-amber" style={{ alignSelf: 'flex-start', transform: isOpponent ? 'skewX(-5deg)' : 'skewX(5deg)', background: 'rgba(255, 184, 0, 0.1)', border: '1px solid var(--accent-amber)' }}>
        {player.rankBadge}
      </div>
    </div>
  );
};
