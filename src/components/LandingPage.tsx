import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Clock,
  ExternalLink,
  FileText,
  Gavel,
  Layers3,
  LogIn,
  LogOut,
  Newspaper,
  Scale,
  Shield,
  Sparkles,
  Swords,
  Users,
  X,
  Zap,
  TrendingUp,
  History,
  ChevronRight,
  Flame,
  Trophy,
  Eye,
  Medal,
  Moon,
  Sun
} from 'lucide-react';
import { CreateBattleModal } from './CreateBattleModal';
import { weeklyIssues, categorizedTopics, popularTopics, weeklyRankings } from '../data/topics';
import { calculateUserStats } from '../lib/userStats';
import type { AppUser, BattleConfig, DebateLevel, DebatePosition, FeaturedBattle, WeeklyIssue } from '../types';

interface LandingPageProps {
  user: AppUser | null;
  onLoginRequest: () => void;
  onLogout: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const accentStyles = {
  cyan: {
    color: 'var(--primary)',
    soft: 'rgba(37, 99, 235, 0.1)',
    border: 'var(--primary)',
  },
  amber: {
    color: 'var(--accent-amber)',
    soft: 'rgba(217, 119, 6, 0.1)',
    border: 'var(--accent-amber)',
  },
  pink: {
    color: 'var(--secondary)',
    soft: 'rgba(15, 23, 42, 0.1)',
    border: 'var(--secondary)',
  },
};

export const LandingPage: React.FC<LandingPageProps> = ({ user, onLoginRequest, onLogout, theme, toggleTheme }) => {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<DebatePosition>('affirmative');
  const [debateLevel, setDebateLevel] = useState<DebateLevel>('beginner');
  const [activeCategory, setActiveCategory] = useState<string>(categorizedTopics[0].category);

  const [userStats, setUserStats] = useState<any>(null);

  useEffect(() => {
    if (user) {
      calculateUserStats(user.id).then(stats => setUserStats(stats));
    } else {
      setUserStats(null);
    }
  }, [user]);

  // Helper to find selected battle across all data sources
  const findBattle = (id: string): FeaturedBattle | WeeklyIssue | null => {
    const weekly = weeklyIssues.find(w => w.id === id);
    if (weekly) return weekly;
    for (const cat of categorizedTopics) {
      const topic = cat.topics.find(t => t.id === id);
      if (topic) return topic;
    }
    return null;
  };

  const selectedBattle = selectedBattleId ? findBattle(selectedBattleId) : null;
  const currentWeeklyIssue = weeklyIssues[0]; // Assume first is current

  const activeCategoryData = categorizedTopics.find(c => c.category === activeCategory) || categorizedTopics[0];

  const displayRankings = React.useMemo(() => {
    if (!user || !userStats) return weeklyRankings;

    let badgeColor = 'var(--secondary)';
    if (userStats.league === '고급' || userStats.league === '마스터') badgeColor = 'var(--primary)';
    else if (userStats.league === '중급') badgeColor = 'var(--accent-amber)';

    const merged = [
      ...weeklyRankings.filter(r => r.nickname !== user.nickname),
      {
        id: user.id,
        rank: 0,
        nickname: user.nickname,
        xp: userStats.xp,
        badge: userStats.league,
        badgeColor,
        isCurrentUser: true
      }
    ];

    merged.sort((a, b) => b.xp - a.xp);
    merged.forEach((item, index) => {
      item.rank = index + 1;
    });

    return merged.slice(0, 5);
  }, [user, userStats]);

  const handleStartBattle = (config: BattleConfig, position: DebatePosition = userPosition) => {
    navigate('/battle/new', {
      state: {
        ...config,
        gameMode: 'debate',
        userPosition: position,
        debateLevel,
      },
    });
  };

  const handleOpenBriefing = (battleId: string) => {
    setSelectedBattleId(battleId);
    setUserPosition('affirmative');
    setDebateLevel('beginner');
    setShowHistoryModal(false); // Close modal if open
    window.setTimeout(() => {
      document.getElementById('topic-briefing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const handleTopicCardKeyDown = (event: React.KeyboardEvent<HTMLElement>, battleId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpenBriefing(battleId);
    }
  };

  const selectedAccent = selectedBattle ? accentStyles[selectedBattle.accent] : null;

  return (
    <div className="app-container page-scroll" style={{ paddingBottom: '5rem' }}>
      <header style={{ marginBottom: '3.5rem' }}>
        <div className="flex justify-between items-center" style={{ gap: '1rem', rowGap: '1.25rem', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '2.5rem', color: 'var(--primary)', margin: 0, letterSpacing: '-0.5px' }}>
            생각근육 ThinkFit
          </h1>

          <div className="card flex items-center gap-6" style={{ padding: '1rem 1.4rem', borderRadius: 'var(--radius-md)', flexWrap: 'wrap', rowGap: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-main)' }} onClick={() => navigate('/about')}>
              <BookOpen size={16} /> 서비스 소개
            </button>
            <button className="icon-button" onClick={toggleTheme} aria-label="테마 변경" title="테마 변경" style={{ color: 'var(--text-muted)' }}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div style={{ width: '1px', height: '40px', background: 'var(--border-color)' }} />
            {userStats && (
              <>
                <div className="flex items-center gap-3">
                  <div style={{ background: 'rgba(217, 119, 6, 0.1)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(217, 119, 6, 0.2)' }}>
                    <Shield size={24} color="var(--accent-amber)" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>MY LEAGUE</div>
                    <div style={{ fontSize: '1.1rem', color: 'var(--accent-amber)', fontWeight: 900 }}>{userStats.league} 리그</div>
                  </div>
                </div>
                <div style={{ width: '1px', height: '40px', background: 'var(--border-color)' }} />
                <div className="flex items-center gap-3">
                  <div style={{ background: 'rgba(37, 99, 235, 0.1)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                    <Zap size={24} color="var(--primary)" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>경험치 XP</div>
                    <div style={{ fontSize: '1.1rem', color: 'var(--text-light)', fontWeight: 900 }}>{userStats.xp.toLocaleString()} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lv.{userStats.level}</span></div>
                  </div>
                </div>
                <div style={{ width: '1px', height: '40px', background: 'var(--border-color)' }} />
              </>
            )}
            {user ? (
              <div className="flex items-center gap-3">
                <button className="btn btn-secondary" style={{ padding: '0.7rem 1rem' }} onClick={() => navigate('/history')}>
                  <FileText size={18} /> 기록
                </button>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>USER</div>
                  <div style={{ fontSize: '1.05rem', color: 'var(--text-light)', fontWeight: 900 }}>{user.nickname}</div>
                </div>
                <button className="icon-button" onClick={onLogout} aria-label="로그아웃" title="로그아웃" style={{ color: 'var(--text-muted)' }}>
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" style={{ padding: '0.8rem 1.2rem' }} onClick={onLoginRequest}>
                <LogIn size={18} /> 로그인
              </button>
            )}
          </div>
        </div>
        <p style={{ color: 'var(--text-light)', margin: '1.8rem 0 0 0', fontWeight: 800, fontSize: '1.35rem', maxWidth: '700px', lineHeight: 1.5, letterSpacing: '-0.3px' }}>
          AI가 생각을 대신하는 시대,<br/>
          <span style={{ color: 'var(--primary)' }}>ThinkFit</span>은 생각에도 꾸준한 운동이 필요하다고 믿습니다.
        </p>
      </header>

      <main style={{ paddingBottom: '3rem', display: 'flex', gap: '3rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 0%', minWidth: 'min(100%, 600px)' }}>
          {/* Weekly Issue Banner */}
          {currentWeeklyIssue && (
            <div 
              className="card" 
              style={{ 
                marginBottom: '2.5rem',
                padding: '2.5rem', 
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-banner)',
                background: 'var(--bg-banner)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem'
              }}
            >
              <div style={{ position: 'absolute', top: '-20px', right: '-20px', opacity: 0.05, transform: 'rotate(15deg)' }}>
                <TrendingUp size={200} color="var(--primary)" />
              </div>
              
              <div className="flex justify-between items-start relative z-10" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <div className="flex items-center gap-3">
                  <div className="badge" style={{ background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, padding: '0.5rem 1rem', fontSize: '1rem' }}>
                    <Sparkles size={18} style={{ marginRight: '6px', display: 'inline' }} /> 최신 핵심 이슈
                  </div>
                  <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 600 }}>{currentWeeklyIssue.issueDate}</span>
                </div>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.6rem 1rem', fontSize: '0.9rem' }}
                  onClick={() => setShowHistoryModal(true)}
                >
                  <History size={16} /> 지난 논쟁 보기
                </button>
              </div>
              
              <div className="relative z-10" style={{ maxWidth: '800px' }}>
                <h2 style={{ fontSize: '2rem', lineHeight: 1.4, margin: '0 0 1rem 0', color: 'var(--text-light)' }}>
                  {currentWeeklyIssue.topic}
                </h2>
                <p style={{ color: 'var(--text-main)', fontSize: '1.05rem', lineHeight: 1.6, margin: 0 }}>
                  {currentWeeklyIssue.briefing.context}
                </p>
              </div>
              
              <div className="flex justify-between items-center relative z-10" style={{ marginTop: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div className="flex items-center gap-4" style={{ fontSize: '0.95rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <span className="flex items-center gap-1.5"><Users size={16} /> {currentWeeklyIssue.players}명 참여</span>
                  <span className="flex items-center gap-1.5"><Clock size={16} /> 예상 소요시간 {currentWeeklyIssue.time}분</span>
                </div>
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '0.8rem 1.5rem', fontSize: '1.05rem', background: 'var(--primary)', borderColor: 'var(--primary)', color: '#fff' }}
                  onClick={() => handleOpenBriefing(currentWeeklyIssue.id)}
                >
                  토론 참여하기 <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mb-10" style={{ gap: '1rem', rowGap: '1rem', flexWrap: 'wrap' }}>
            <h2 className="flex items-center gap-2" style={{ fontSize: '1.6rem', margin: 0, color: 'var(--text-light)' }}>
              <Layers3 color="var(--primary)" /> 세부 토론 주제
            </h2>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.8rem 1.2rem', fontSize: '0.95rem' }}
              onClick={() => setShowCreateModal(true)}
            >
              <Swords size={18} /> 직접 개설
            </button>
          </div>

          {/* Category Tabs */}
          <div 
            className="flex gap-3 mb-10" 
            style={{ 
              overflowX: 'auto', 
              paddingBottom: '0.8rem',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            {categorizedTopics.map(category => (
              <button
                key={category.category}
                onClick={() => setActiveCategory(category.category)}
                style={{
                  padding: '0.75rem 1.25rem',
                  background: activeCategory === category.category ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                  color: activeCategory === category.category ? 'var(--primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderBottom: activeCategory === category.category ? '3px solid var(--primary)' : '3px solid transparent',
                  borderRadius: '4px 4px 0 0',
                  fontSize: '1.05rem',
                  fontWeight: activeCategory === category.category ? 800 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {category.category}
                {activeCategory === category.category && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 400, opacity: 0.8 }}>
                    - {category.description}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))' }}>
            {activeCategoryData.topics.map(battle => {
              const accent = accentStyles[battle.accent];
              const isSelected = selectedBattle?.id === battle.id;

              return (
                <article
                  key={battle.id}
                  className="card"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenBriefing(battle.id)}
                  onKeyDown={event => handleTopicCardKeyDown(event, battle.id)}
                  style={{
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    borderTop: `4px solid ${accent.border}`,
                    borderColor: isSelected ? accent.border : 'var(--border-color)',
                    boxShadow: isSelected ? `0 10px 20px -5px ${accent.soft}` : '0 1px 3px rgba(0,0,0,0.05)',
                    cursor: 'pointer',
                    minHeight: '220px',
                    display: 'flex',
                    flexDirection: 'column',
                    background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-card)'
                  }}
                >
                  <div className="flex justify-between items-start mb-4" style={{ gap: '1rem' }}>
                    <div className="badge" style={{ background: accent.soft, color: accent.color, border: 'none' }}>
                      {battle.mode}
                    </div>
                    <div className="flex items-center gap-1" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      <Clock size={14} /> {battle.time}분
                    </div>
                  </div>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', lineHeight: 1.45, color: 'var(--text-light)' }}>{battle.topic}</h4>
                  <p style={{ color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.55, marginBottom: '1rem', flex: 1 }}>
                    {battle.briefing.context.substring(0, 80)}...
                  </p>
                  <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 600 }}>
                    <Users size={14} /> {battle.players}명 참여 가능
                  </div>
                  <div className="badge" style={{ marginTop: 'auto', width: 'fit-content', background: isSelected ? accent.color : 'var(--bg-secondary)', color: isSelected ? '#FFF' : 'var(--text-muted)', border: 'none' }}>
                    {isSelected ? '선택됨' : '상세 보기'}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Briefing Section */}
          {selectedBattle && selectedAccent && (
            <section
              id="topic-briefing"
              style={{
                marginTop: '4rem',
                border: `1px solid ${selectedAccent.border}`,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-card)',
                boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', background: selectedAccent.soft, position: 'relative' }}>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setSelectedBattleId(null)}
                  aria-label="상세 배경 설명 닫기"
                  title="닫기"
                  style={{ position: 'absolute', top: '1rem', right: '1rem', color: 'var(--text-muted)', padding: '0.2rem' }}
                >
                  <X size={16} />
                </button>
                <div className="flex justify-between items-end" style={{ gap: '1rem', rowGap: '1rem', flexWrap: 'wrap', paddingRight: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div className="badge" style={{ background: 'var(--bg-card)', color: selectedAccent.color, border: `1px solid ${selectedAccent.color}`, marginBottom: '0.8rem' }}>
                      토론 전 브리핑
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.7rem', lineHeight: 1.35, color: 'var(--text-light)', paddingRight: '1.5rem' }}>{selectedBattle.topic}</h2>
                  </div>
                  <div className="flex justify-end" style={{ alignSelf: 'flex-end' }}>
                    <button
                      className="btn btn-primary"
                      style={{ 
                        padding: '0.9rem 1.6rem', 
                        fontSize: '1.1rem', 
                        fontWeight: 800,
                        background: selectedAccent.color, 
                        borderColor: selectedAccent.color, 
                        color: '#fff',
                        boxShadow: `0 4px 12px ${selectedAccent.soft}`
                      }}
                      onClick={() => handleStartBattle(selectedBattle.config)}
                    >
                      토론 참여하기 <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', padding: '1.5rem' }}>
                <div className="flex flex-col gap-6">
                  <section>
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <BookOpen size={20} color="var(--primary)" /> 배경 지식
                    </h3>
                    <p style={{ color: 'var(--text-main)', lineHeight: 1.75 }}>{selectedBattle.briefing.context}</p>
                  </section>

                  <section>
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <Newspaper size={20} color="var(--accent-amber)" /> 최근 사례로 확인할 포인트
                    </h3>
                    <div className="grid gap-3" style={{ gridTemplateColumns: '1fr' }}>
                      {selectedBattle.briefing.recentCases.map(caseItem => (
                      <div key={caseItem} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)', lineHeight: 1.6 }}>
                          {caseItem}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <Scale size={20} color="var(--secondary)" /> 찬성 vs 반대 쟁점
                    </h3>
                    <div className="grid gap-4" style={{ gridTemplateColumns: '1fr' }}>
                      {[selectedBattle.briefing.affirmative, selectedBattle.briefing.negative].map(side => (
                        <div key={side.title} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                          <h4 style={{ marginBottom: '0.75rem', color: side.title.includes('찬성') || side.title.includes('허용') ? 'var(--accent-amber)' : 'var(--primary)' }}>
                            {side.title}
                          </h4>
                          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingLeft: '1.1rem', color: 'var(--text-main)', lineHeight: 1.55 }}>
                            {side.points.map(point => (
                              <li key={point}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <aside className="flex flex-col gap-6">
                  <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)' }}>
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <Gavel size={18} color="var(--accent-amber)" /> 입장 선택
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'affirmative' as DebatePosition, label: '찬성' },
                        { value: 'negative' as DebatePosition, label: '반대' },
                      ].map(option => (
                        <button
                          key={option.value}
                          type="button"
                          className="card flex items-center justify-center"
                          style={{
                            cursor: 'pointer',
                            minHeight: '54px',
                            padding: '0.85rem',
                            border: userPosition === option.value ? '2px solid var(--accent-amber)' : '1px solid var(--border-color)',
                            color: userPosition === option.value ? 'var(--accent-amber)' : 'var(--text-main)',
                            background: userPosition === option.value ? 'rgba(217, 119, 6, 0.05)' : 'var(--bg-card)',
                            fontWeight: 900,
                            boxShadow: userPosition === option.value ? '0 2px 4px rgba(217, 119, 6, 0.1)' : 'none'
                          }}
                          onClick={() => setUserPosition(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.85rem', lineHeight: 1.55 }}>
                      선택한 입장으로 AI가 반대편을 맡아 정식 토론을 시작합니다.
                    </p>
                  </section>

                  <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)' }}>
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <Layers3 size={18} color="var(--primary)" /> 토론 수준
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'beginner' as DebateLevel, label: '초급' },
                        { value: 'intermediate' as DebateLevel, label: '중급' },
                      ].map(option => (
                        <button
                          key={option.value}
                          type="button"
                          className="card flex items-center justify-center"
                          style={{
                            cursor: 'pointer',
                            minHeight: '48px',
                            padding: '0.7rem 0.45rem',
                            border: debateLevel === option.value ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                            color: debateLevel === option.value ? 'var(--primary)' : 'var(--text-main)',
                            background: debateLevel === option.value ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-card)',
                            fontWeight: 900,
                            boxShadow: debateLevel === option.value ? '0 2px 4px rgba(37, 99, 235, 0.1)' : 'none'
                          }}
                          onClick={() => setDebateLevel(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)' }}>
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <ExternalLink size={18} color="var(--primary)" /> 인터넷 기사 보기
                    </h3>
                    <div className="flex flex-col gap-2">
                      {selectedBattle.briefing.newsLinks.map(link => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary"
                          style={{ justifyContent: 'space-between', textDecoration: 'none', padding: '0.8rem 1rem', textTransform: 'none', letterSpacing: 0, background: 'var(--bg-card)' }}
                        >
                          {link.label}
                          <ExternalLink size={16} />
                        </a>
                      ))}
                    </div>
                  </section>

                  <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-card)' }}>
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <Sparkles size={18} color="var(--secondary)" /> 토론 전 질문
                    </h3>
                    <ol style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingLeft: '1.2rem', color: 'var(--text-main)', lineHeight: 1.55 }}>
                      {selectedBattle.briefing.prepQuestions.map(question => (
                        <li key={question}>{question}</li>
                      ))}
                    </ol>
                  </section>

                </aside>
              </div>
            </section>
          )}
        </div>

        {/* Right Sidebar */}
        <aside style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {/* Popular Topics */}
          <section className="card" style={{ padding: '1.5rem', background: 'var(--bg-card)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <h3 className="flex items-center gap-2" style={{ fontSize: '1.2rem', margin: '0 0 1.5rem 0', color: 'var(--secondary)' }}>
              <Flame size={20} /> 이번 주 화제의 토론
            </h3>
            <div className="flex flex-col gap-4">
              {popularTopics.map((topic, index) => (
                <div 
                  key={topic.id} 
                  className="flex items-start gap-3" 
                  style={{ cursor: 'pointer', transition: 'all 0.2s', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(37, 99, 235, 0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => handleOpenBriefing(topic.id)}
                >
                  <span style={{ fontSize: '1.2rem', fontWeight: 900, color: index < 3 ? 'var(--primary)' : 'var(--text-muted)', minWidth: '24px', textAlign: 'center' }}>
                    {topic.rank}
                  </span>
                  <div className="flex-1 min-w-0" style={{ wordBreak: 'keep-all' }}>
                    <h4 style={{ margin: '0 0 0.3rem 0', fontSize: '0.95rem', lineHeight: 1.4, color: 'var(--text-light)' }}>
                      {topic.title}
                    </h4>
                    <span className="flex items-center gap-1" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      <Eye size={12} /> {topic.views} views
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Weekly Debater Rankings */}
          <section className="card" style={{ padding: '1.5rem', background: 'var(--bg-card)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <h3 className="flex items-center gap-2" style={{ fontSize: '1.2rem', margin: '0 0 1.5rem 0', color: 'var(--accent-amber)' }}>
              <Trophy size={20} /> 금주 토론자 랭킹
            </h3>
            <div className="flex flex-col gap-3">
              {displayRankings.map((u, index) => (
                <div 
                  key={u.id} 
                  className="flex items-center gap-3 card" 
                  style={{ 
                    padding: '1rem', 
                    background: index === 0 ? 'var(--accent-amber-light)' : (u as any).isCurrentUser ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-elevated)',
                    border: index === 0 ? '1px solid var(--accent-amber)' : (u as any).isCurrentUser ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                    boxShadow: index === 0 ? '0 2px 4px var(--accent-amber-light)' : 'none'
                  }}
                >
                  <div style={{ position: 'relative', width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--secondary)' }}>{u.nickname.charAt(0)}</span>
                    {index < 3 && (
                      <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--bg-card)', borderRadius: '50%', padding: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                        <Medal size={16} color={index === 0 ? '#F59E0B' : index === 1 ? '#94A3B8' : '#B45309'} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontWeight: 700, color: 'var(--text-light)', fontSize: '1rem' }}>{u.nickname}</span>
                      <span className="badge" style={{ background: 'transparent', color: u.badgeColor, border: `1px solid ${u.badgeColor}`, padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}>
                        {u.badge}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {u.xp.toLocaleString()} XP
                    </div>
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: index === 0 ? 'var(--accent-amber)' : 'var(--text-muted)', opacity: index === 0 ? 1 : 0.6 }}>
                    #{u.rank}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>

      {/* History Modal */}
      {showHistoryModal && (
        <div 
          className="modal-overlay" 
          style={{ position: 'fixed', inset: 0, background: 'var(--modal-overlay)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowHistoryModal(false)}
        >
          <div 
            className="modal-content card" 
            style={{ width: '90%', maxWidth: '800px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0, background: 'var(--bg-card)', boxShadow: '0 20px 40px rgba(0,0,0,0.1)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
              <h2 className="flex items-center gap-2" style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-light)' }}>
                <History color="var(--primary)" /> 지난 주간 핵심 논쟁
              </h2>
              <button className="icon-button" onClick={() => setShowHistoryModal(false)} style={{ color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            
            <div style={{ padding: '1.5rem', overflowY: 'auto', background: 'var(--bg-card)' }}>
              <div className="flex flex-col gap-4">
                {weeklyIssues.map(issue => (
                  <div 
                    key={issue.id}
                    className="card flex flex-col md:flex-row gap-4"
                    style={{ padding: '1.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                    onClick={() => handleOpenBriefing(issue.id)}
                  >
                    <div style={{ flex: '1' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="badge" style={{ background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary)', border: 'none' }}>{issue.issueDate}</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>제 {issue.issueNumber}호</span>
                      </div>
                      <h3 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem 0', color: 'var(--text-light)' }}>{issue.topic}</h3>
                      <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {issue.briefing.context}
                      </p>
                    </div>
                    <div className="flex items-center justify-end" style={{ minWidth: '120px' }}>
                      <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', background: 'var(--bg-card)' }}>
                        자세히 보기 <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && <CreateBattleModal onClose={() => setShowCreateModal(false)} onStart={handleStartBattle} />}
    </div>
  );
};
