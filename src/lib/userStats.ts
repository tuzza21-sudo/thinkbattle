import { getDebateRecords } from './history';
import type { Player } from '../types';

export interface UserStats {
  xp: number;
  level: number;
  league: '초급' | '중급' | '고급' | '마스터';
  rankBadge: string;
}

export const calculateUserStats = (userId: string): UserStats => {
  const records = getDebateRecords(userId);
  const totalXp = records.reduce((sum, record) => sum + (record.report?.xpEarned || 0), 0);

  let level = 0;
  if (totalXp < 2000) {
    level = Math.floor(totalXp / 200);
  } else if (totalXp < 8000) {
    level = 10 + Math.floor((totalXp - 2000) / 600);
  } else if (totalXp < 20000) {
    level = 20 + Math.floor((totalXp - 8000) / 1200);
  } else {
    level = 30; // Master cap
  }

  // Cap level at 30
  level = Math.min(30, level);

  let league: '초급' | '중급' | '고급' | '마스터' = '초급';
  let rankBadge = '브론즈';

  if (level >= 30) {
    league = '마스터';
    rankBadge = '다이아몬드';
  } else if (level >= 20) {
    league = '고급';
    rankBadge = '플래티넘';
  } else if (level >= 10) {
    league = '중급';
    rankBadge = '골드';
  } else if (level >= 5) {
    league = '초급';
    rankBadge = '실버';
  } else {
    league = '초급';
    rankBadge = '브론즈';
  }

  return {
    xp: totalXp,
    level,
    league,
    rankBadge
  };
};

export const getPlayerFromStats = (userId: string, nickname: string): Player => {
  const stats = calculateUserStats(userId);
  return {
    id: userId,
    name: nickname,
    avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(nickname)}`,
    level: stats.level,
    rankBadge: stats.rankBadge,
    score: stats.xp, // using XP as score
    streak: 0,
    isAi: false,
    league: stats.league === '마스터' ? '고급' : stats.league,
  };
};
