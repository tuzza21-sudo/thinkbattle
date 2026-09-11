import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Clock,
  ExternalLink,
  FileText,
  Gavel,
  Layers3,
  Lightbulb,
  LogIn,
  LogOut,
  MessageSquare,
  Newspaper,
  Scale,
  Radio,
  Shield,
  Sparkles,
  Swords,
  Users,
  X,
  TrendingUp,
  History,
  ChevronRight,
  Flame,
  Trophy,
  Eye,
  Medal,
  Edit2
} from 'lucide-react';
import { CreateBattleModal } from './CreateBattleModal';
import { JoinDebateModal } from './JoinDebateModal';
import { CommunityPanel } from './CommunityPanel';
import { ProfileModal } from './ProfileModal';
import { weeklyIssues, categorizedTopics, popularTopics, weeklyRankings } from '../data/topics';
import { calculateUserStats } from '../lib/userStats';
import type { UserStats } from '../lib/userStats';
import { getOpinionStats, autoSeedTopicOpinions } from '../lib/communityStore';
import type { AppUser, BattleConfig, DebateLevel, DebatePosition, FeaturedBattle, LiveDebateRoomSummary, OrganizationSummary, PublicDebateTopic, TopicOpinionStats, WeeklyIssue } from '../types';
import { SUPER_ADMIN_EMAIL } from '../lib/superAdmin';
import { getMyMemberOrganizations } from '../lib/admin';
import { getPublicDebateTopics } from '../lib/publicTopics';
import { buildDebateLobbyPath, createLiveRoomId } from '../lib/liveDebate';
import { createDebateRoom } from '../lib/debateRooms';
import { claimDebateTrainingSession } from '../lib/trainingUsage';
import { buildHomepageTopicLibrary, getHomepageDebateTopics, type HomepageTopicCollection } from '../lib/homepageTopics';
import './HomeStudio.css';

interface LandingPageProps {
  user: AppUser | null;
  onLoginRequest: () => void;
  onLogout: () => void;
  onUserUpdate: (updatedUser: AppUser) => void;
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

const AI_DEBATE_TIME_OPTIONS = [600, 900, 1200] as const;

const getClosestAiDebateTime = (seconds: number) => AI_DEBATE_TIME_OPTIONS.reduce((closest, option) => (
  Math.abs(option - seconds) < Math.abs(closest - seconds) ? option : closest
));

export const LandingPage: React.FC<LandingPageProps> = ({ user, onLoginRequest, onLogout, onUserUpdate }) => {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLiveOnly, setCreateLiveOnly] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<DebatePosition>('affirmative');
  const [debateLevel, setDebateLevel] = useState<DebateLevel>('beginner');
  const [selectedTimeLimit, setSelectedTimeLimit] = useState<number>(600);
  const [communityTopicId, setCommunityTopicId] = useState<string | null>(null);
  const [communityTopicTitle, setCommunityTopicTitle] = useState('');
  const [opinionStatsCache, setOpinionStatsCache] = useState<Record<string, TopicOpinionStats>>({});
  const [activeCategory, setActiveCategory] = useState<string>(categorizedTopics[0].category);
  const [publicTopics, setPublicTopics] = useState<PublicDebateTopic[]>([]);
  const [homepageTopics, setHomepageTopics] = useState<HomepageTopicCollection | null>(null);
  const [memberOrganizations, setMemberOrganizations] = useState<OrganizationSummary[]>([]);
  const [trainingStartError, setTrainingStartError] = useState<string | null>(null);

  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const hasOrganizationStaffAccess = memberOrganizations.some(organization =>
    ['owner', 'admin', 'coach'].includes(organization.role),
  );
  const managedTopicLibrary = React.useMemo(
    () => homepageTopics ? buildHomepageTopicLibrary(homepageTopics.topics) : null,
    [homepageTopics],
  );
  const displayWeeklyIssues = React.useMemo(
    () => homepageTopics?.managedKinds.includes('latest_issue')
      ? managedTopicLibrary?.latestIssues ?? []
      : weeklyIssues,
    [homepageTopics, managedTopicLibrary],
  );
  const displayCategorizedTopics = React.useMemo(
    () => homepageTopics?.managedKinds.includes('detail')
      ? managedTopicLibrary?.categorizedTopics ?? []
      : categorizedTopics,
    [homepageTopics, managedTopicLibrary],
  );

  useEffect(() => {
    let cancelled = false;
    const statsPromise = user ? calculateUserStats(user.id) : Promise.resolve(null);
    void statsPromise.then(stats => {
      if (!cancelled) setUserStats(stats);
    });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    void getPublicDebateTopics().then(setPublicTopics);
  }, []);

  useEffect(() => {
    void getHomepageDebateTopics().then(topics => {
      if (topics) setHomepageTopics(topics);
    });
  }, []);

  useEffect(() => {
    const organizationsPromise = user ? getMyMemberOrganizations() : Promise.resolve([]);
    void organizationsPromise.then(setMemberOrganizations);
  }, [user]);

  // Load opinion stats for all topics
  useEffect(() => {
    const fetchStats = async () => {
      const allTopics = [
        ...displayWeeklyIssues.map(w => ({ id: w.id, topic: w.topic })),
        ...displayCategorizedTopics.flatMap(c => c.topics.map(t => ({ id: t.id, topic: t.topic }))),
      ];
      
      const statsList = await Promise.all(allTopics.map(t => getOpinionStats(t.id)));
      
      const stats: Record<string, TopicOpinionStats> = {};
      statsList.forEach((stat, i) => {
        stats[stat.topicId] = stat;
        
        // Auto-seed if less than 5 opinions
        if (stat.totalOpinions < 5) {
          const needed = 5 - stat.totalOpinions;
          autoSeedTopicOpinions(allTopics[i].id, allTopics[i].topic, needed).then(() => {
            // Re-fetch this specific topic's stats after seeding completes
            getOpinionStats(allTopics[i].id).then(newStat => {
              setOpinionStatsCache(prev => ({ ...prev, [newStat.topicId]: newStat }));
            });
          });
        }
      });
      setOpinionStatsCache(stats);
    };
    
    fetchStats();
  }, [communityTopicId, displayCategorizedTopics, displayWeeklyIssues]); // refresh when content changes or community panel closes

  const openCommunity = (topicId: string, topicTitle: string) => {
    setCommunityTopicId(topicId);
    setCommunityTopicTitle(topicTitle);
  };

  // Helper to find selected battle across all data sources
  const findBattle = (id: string): FeaturedBattle | WeeklyIssue | null => {
    const weekly = displayWeeklyIssues.find(w => w.id === id);
    if (weekly) return weekly;
    for (const cat of displayCategorizedTopics) {
      const topic = cat.topics.find(t => t.id === id);
      if (topic) return topic;
    }
    return null;
  };

  const selectedBattle = selectedBattleId ? findBattle(selectedBattleId) : null;
  const currentWeeklyIssue = displayWeeklyIssues[0];

  const resolvedActiveCategory = displayCategorizedTopics.some(category => category.category === activeCategory)
    ? activeCategory
    : displayCategorizedTopics[0]?.category ?? '';
  const activeCategoryData = displayCategorizedTopics.find(c => c.category === resolvedActiveCategory) || displayCategorizedTopics[0];

  const displayRankings = React.useMemo(() => {
    let userRank: (typeof weeklyRankings)[number] | null = null;
    if (user && userStats) {
      let badgeColor = 'var(--secondary)';
      if (userStats.league === '고급' || userStats.league === '마스터') badgeColor = 'var(--primary)';
      else if (userStats.league === '중급') badgeColor = 'var(--accent-amber)';

      userRank = {
        id: user.id,
        rank: 0,
        nickname: user.nickname || '나',
        xp: userStats.xp,
        badge: userStats.league,
        badgeColor,
      };
    }

    // 1. mock 랭킹과 로그인한 유저 결합
    const allParticipants = [...weeklyRankings];
    if (userRank) {
      allParticipants.push(userRank);
    }

    // 2. XP 기준으로 내림차순 정렬
    allParticipants.sort((a, b) => b.xp - a.xp);

    // 3. 실제 순위(rank) 매기기
    const rankedParticipants = allParticipants.map((item, index) => ({
      ...item,
      rank: index + 1,
    }));

    // 4. 상위 5위 추출
    const top5 = rankedParticipants.slice(0, 5);
    const userIndex = userRank ? rankedParticipants.findIndex(p => p.id === userRank.id) : -1;

    // 5. 로그인한 유저가 상위 5위 안에 없다면, 상위 5위 + 본인 순위를 맨 아래에 추가
    if (userRank && userIndex >= 5) {
      return [...top5, rankedParticipants[userIndex]];
    }

    return top5;
  }, [user, userStats]);

  const handleStartBattle = async (config: BattleConfig, position: DebatePosition = userPosition) => {
    if (!user) {
      onLoginRequest();
      return;
    }

    if (config.gameMode === 'pvp') {
      const roomId = createLiveRoomId();
      await claimDebateTrainingSession(roomId);
      await createDebateRoom({
        roomId,
        topic: config.topic,
        topicDescription: config.topicDescription ?? '',
        topicBriefing: config.topicBriefing,
        language: config.language,
        debateLevel: config.debateLevel === 'intermediate' ? 'intermediate' : 'beginner',
        voiceEnabled: config.voiceEnabled ?? false,
        timeLimit: config.timeLimit,
        sessionConfig: config.sessionConfig,
        teamSize: config.teamSize ?? 1,
        allowModerator: config.allowModerator ?? false,
        audience: config.audience ?? 'public',
        organizationId: config.organizationId,
        organizationName: memberOrganizations.find(org => org.id === config.organizationId)?.name,
        hostPosition: config.userPosition ?? position,
        hostRole: config.participantRole ?? 'debater',
      }, user);
      navigate(buildDebateLobbyPath(roomId));
      return;
    }

    const usageSessionId = globalThis.crypto?.randomUUID?.() ?? `debate-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await claimDebateTrainingSession(usageSessionId);
    navigate('/battle/new', {
      state: {
        ...config,
        gameMode: 'debate',
        userPosition: position,
        debateLevel,
        usageSessionId,
      },
    });
  };

  const handleJoinBattle = async (room: LiveDebateRoomSummary) => {
    if (!user) return onLoginRequest();
    await claimDebateTrainingSession(room.roomId);
    navigate(buildDebateLobbyPath(room.roomId));
  };

  const handleOpenBriefing = (battleId: string) => {
    const battle = findBattle(battleId);
    setSelectedBattleId(battleId);
    setUserPosition('affirmative');
    setDebateLevel('beginner');
    setSelectedTimeLimit(getClosestAiDebateTime(battle?.config.timeLimit ?? 600));
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
    <div className="debate-home-page page-scroll thinkfit-home">
      <header className="debate-home-header">
        <button type="button" className="debate-home-brand" onClick={() => navigate('/')} aria-label="훈련 선택으로 돌아가기">
          <span><img src="/brand/thinkfit-mark.svg" alt="" /></span><div><strong>ThinkFit</strong><small>DEBATE STUDIO</small></div>
        </button>
        <nav className="debate-home-nav" aria-label="토론 페이지 메뉴">
          <button type="button" onClick={() => navigate('/about')}><BookOpen size={16} /> 서비스 소개</button>
          {user && <button type="button" onClick={() => navigate('/history')}><FileText size={16} /> 훈련 기록</button>}
          {memberOrganizations.length > 0 && <button type="button" onClick={() => navigate('/institution')}><Users size={16} /> {memberOrganizations[0].name}</button>}
          {(hasOrganizationStaffAccess || user?.email.toLowerCase() === SUPER_ADMIN_EMAIL) && <button type="button" onClick={() => navigate('/admin')}><Shield size={16} /> 기관 관리</button>}
          {user?.email.toLowerCase() === SUPER_ADMIN_EMAIL && <button type="button" onClick={() => navigate('/super-admin')}><Shield size={16} /> 슈퍼 관리</button>}
          {user?.isAnonymous ? (
            <button type="button" className="debate-home-login" onClick={onLoginRequest}><LogIn size={17} /> 회원가입 · 로그인</button>
          ) : user ? (
            <>
              <button type="button" className="debate-home-profile" onClick={() => setShowProfileModal(true)} title="닉네임 변경"><span>{user.nickname.charAt(0)}</span>{user.nickname}<Edit2 size={13} /></button>
              <button type="button" className="debate-home-logout" onClick={onLogout} aria-label="로그아웃" title="로그아웃"><LogOut size={17} /></button>
            </>
          ) : <button type="button" className="debate-home-login" onClick={onLoginRequest}><LogIn size={17} /> 로그인</button>}
        </nav>
      </header>

      <section className="debate-home-hero">
        <div className="debate-home-hero-copy">
          <span className="debate-home-eyebrow"><i /> A SPACE FOR BETTER THINKING</span>
          <h1>생각을 주장으로,<br /><em>주장을 실력으로.</em></h1>
          <p>하나의 논제, 서로 다른 관점. 내 주장을 세우고 상대의 이야기에 응답하며 생각을 넓혀보세요. 막힐 때는 AI 코치가 다음 방향을 함께 찾습니다.</p>
          <div className="debate-home-hero-actions">
            <button type="button" className="debate-home-primary" onClick={() => {
              if (!user) return onLoginRequest();
              setCreateLiveOnly(false);
              setShowCreateModal(true);
            }}><Sparkles size={18} /> 토론 시작하기 <ChevronRight size={18} /></button>
            <button type="button" className="debate-home-secondary" onClick={() => {
              if (!user) return onLoginRequest();
              setCreateLiveOnly(true);
              setShowCreateModal(true);
            }}><Radio size={17} /> 실전 토론방 열기</button>
            <button type="button" className="debate-home-secondary" onClick={() => user ? setShowJoinModal(true) : onLoginRequest()}>
              <LogIn size={17} /> 열린 실전 토론 참여
            </button>
          </div>
          <div className="debate-home-stats">
            <span><strong>{displayCategorizedTopics.reduce((total, category) => total + category.topics.length, 0)}+</strong><small>훈련 주제</small></span>
            <span><strong>Thinking Coach</strong><small>단계별 사고 지원</small></span>
            {userStats ? <><span><strong>Lv.{userStats.level}</strong><small>{userStats.league} 리그</small></span><span><strong>{userStats.xp.toLocaleString()}</strong><small>누적 XP</small></span></> : <span><strong>AI</strong><small>즉시 피드백</small></span>}
          </div>
        </div>

        <div className="debate-home-arena debate-home-latest-issue" aria-label="최신 핵심 이슈">
          <div className="debate-home-arena-top">
            <span><i /> 최신 핵심 이슈</span>
            <small>{currentWeeklyIssue?.issueDate ?? '새로운 이슈 준비 중'}</small>
          </div>
          <div className="debate-home-arena-topic">
            <small>THIS WEEK'S MOTION</small>
            <strong>{currentWeeklyIssue?.topic ?? '곧 새로운 토론 논제가 공개됩니다.'}</strong>
          </div>
          {currentWeeklyIssue && (
            <>
              <p className="debate-home-issue-context">{currentWeeklyIssue.briefing.context}</p>
              <div className="debate-home-issue-meta">
                <span><Users size={15} /> {currentWeeklyIssue.players}명 참여</span>
                <span><Clock size={15} /> 예상 {currentWeeklyIssue.time}분</span>
              </div>
              <div className="debate-home-issue-actions">
                <button type="button" className="debate-home-issue-history" onClick={() => setShowHistoryModal(true)}>
                  <History size={15} /> 지난 논쟁
                </button>
                <button
                  type="button"
                  className="debate-home-issue-community community-entry-button"
                  onClick={() => openCommunity(currentWeeklyIssue.id, currentWeeklyIssue.topic)}
                >
                  <MessageSquare size={15} /> 커뮤니티
                  {opinionStatsCache[currentWeeklyIssue.id]?.totalOpinions > 0 && (
                    <span className="count-badge">
                      <span className="count-aff">{opinionStatsCache[currentWeeklyIssue.id].affirmativeCount}</span>
                      <span>/</span>
                      <span className="count-neg">{opinionStatsCache[currentWeeklyIssue.id].negativeCount}</span>
                    </span>
                  )}
                </button>
                <button type="button" className="debate-home-issue-start" onClick={() => handleOpenBriefing(currentWeeklyIssue.id)}>
                  토론 참여하기 <ChevronRight size={17} />
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="home-coach-strip" aria-label="토론 코칭 안내"><div className="home-coach-strip-icon"><Lightbulb size={21} /></div><div><strong>생각이 막힐 때, AI Thinking Coach</strong><p>입론의 씨앗부터 질문의 방향, 반박의 실마리까지. 선택하고 표현하는 주인공은 나입니다.</p></div><span>입론 <ChevronRight size={13} /> 교차질문 <ChevronRight size={13} /> 반박</span></section>

      <main className="debate-home-layout">
        <div className="debate-home-content">
          <div className="debate-section-heading flex justify-between items-center mb-10" style={{ gap: '1rem', rowGap: '1rem', flexWrap: 'wrap' }}>
            <div className="home-section-heading-copy"><span>EXPLORE THE MOTIONS</span><h2 className="flex items-center gap-2" style={{ fontSize: '1.6rem', margin: 0, color: 'var(--text-light)' }}><Layers3 size={21} color="var(--primary)" /> 어떤 논제로 시작할까요?</h2></div>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.8rem 1.2rem', fontSize: '0.95rem' }}
              onClick={() => {
                if (!user) return onLoginRequest();
                setCreateLiveOnly(false);
                setShowCreateModal(true);
              }}
            >
              <Swords size={18} /> 자유주제 개설
            </button>
          </div>

          {/* Category Tabs */}
          <div 
            className="debate-category-tabs flex gap-3 mb-10"
            style={{ 
              overflowX: 'auto', 
              paddingBottom: '0.8rem',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            {displayCategorizedTopics.map(category => (
              <button
                key={category.category}
                className={resolvedActiveCategory === category.category ? 'active' : ''}
                onClick={() => setActiveCategory(category.category)}
                style={{
                  padding: '0.75rem 1.25rem',
                  background: resolvedActiveCategory === category.category ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                  color: resolvedActiveCategory === category.category ? 'var(--primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderBottom: resolvedActiveCategory === category.category ? '3px solid var(--primary)' : '3px solid transparent',
                  borderRadius: '4px 4px 0 0',
                  fontSize: '1.05rem',
                  fontWeight: resolvedActiveCategory === category.category ? 800 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                {category.category}
                {resolvedActiveCategory === category.category && (
                  <span style={{ fontSize: '0.85rem', fontWeight: 400, opacity: 0.8 }}>
                    - {category.description}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="debate-topic-grid grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(290px, 100%), 1fr))' }}>
            {(activeCategoryData?.topics ?? []).map(battle => {
              const isSelected = selectedBattle?.id === battle.id;

              return (
                <article
                  key={battle.id}
                  className={`card debate-topic-card accent-${battle.accent} ${isSelected ? 'selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenBriefing(battle.id)}
                  onKeyDown={event => handleTopicCardKeyDown(event, battle.id)}
                >
                  <header className="debate-topic-card-top">
                    <span className="debate-topic-card-kicker"><i /> {battle.mode}</span>
                    <span className="debate-topic-card-time">
                      <Clock size={14} /> {battle.time}분
                    </span>
                  </header>
                  <div className="debate-topic-card-motion">
                    <small>DEBATE MOTION</small>
                    <h4>{battle.topic}</h4>
                  </div>
                  <p className="debate-topic-card-context">{battle.briefing.context}</p>
                  <footer className="debate-topic-card-footer">
                    <span className="debate-topic-card-players"><Users size={14} /> {battle.players}명 참여</span>
                    <button
                      className="community-btn-mini community-entry-button"
                      onClick={(e) => { e.stopPropagation(); openCommunity(battle.id, battle.topic); }}
                    >
                      <MessageSquare size={13} />
                      커뮤니티
                      {opinionStatsCache[battle.id] && opinionStatsCache[battle.id].totalOpinions > 0 && (
                        <span className="count-badge">
                          <span className="count-aff">{opinionStatsCache[battle.id].affirmativeCount}</span>
                          <span>/</span>
                          <span className="count-neg">{opinionStatsCache[battle.id].negativeCount}</span>
                        </span>
                      )}
                    </button>
                    <span className="debate-topic-card-detail">
                      {isSelected ? '선택됨' : '상세 보기'} <ChevronRight size={15} />
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>

          {/* Briefing Section */}
          {selectedBattle && selectedAccent && (
            <section
              id="topic-briefing"
              className="debate-briefing-panel"
              style={{
                marginTop: '4rem',
                border: `1px solid ${selectedAccent.border}`,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-card)',
                boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)',
                overflow: 'hidden',
              }}
            >
              <div className="debate-briefing-hero" style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', background: selectedAccent.soft, position: 'relative' }}>
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="badge" style={{ background: 'var(--bg-card)', color: selectedAccent.color, border: `1px solid ${selectedAccent.color}`, marginBottom: '0.8rem' }}>
                      토론 전 브리핑
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.7rem', lineHeight: 1.35, color: 'var(--text-light)', paddingRight: '1.5rem' }}>{selectedBattle.topic}</h2>
                  </div>
                  <div className="flex items-center gap-3" style={{ alignSelf: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      className="community-btn-mini community-entry-button"
                      style={{ padding: '0.6rem 1.1rem', fontSize: '0.9rem' }}
                      onClick={() => openCommunity(selectedBattle.id, selectedBattle.topic)}
                    >
                      <MessageSquare size={16} />
                      토론 커뮤니티
                      {opinionStatsCache[selectedBattle.id] && opinionStatsCache[selectedBattle.id].totalOpinions > 0 && (
                        <span className="count-badge">
                          <span className="count-aff">{opinionStatsCache[selectedBattle.id].affirmativeCount}</span>
                          <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>/</span>
                          <span className="count-neg">{opinionStatsCache[selectedBattle.id].negativeCount}</span>
                        </span>
                      )}
                    </button>
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
                      onClick={() => void handleStartBattle({
                        ...selectedBattle.config,
                        timeLimit: selectedTimeLimit,
                        topicDescription: selectedBattle.briefing.context,
                        topicBriefing: selectedBattle.briefing,
                      }).catch(error => setTrainingStartError(error instanceof Error ? error.message : '토론을 시작하지 못했습니다.'))}
                    >
                      이 주제로 AI 스파링 <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="debate-briefing-grid grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', padding: '1.5rem' }}>
                <div className="debate-briefing-main flex flex-col gap-6">
                  <section className="debate-briefing-section context">
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <BookOpen size={20} color="var(--primary)" /> 배경 지식
                    </h3>
                    <p style={{ color: 'var(--text-main)', lineHeight: 1.75 }}>{selectedBattle.briefing.context}</p>
                  </section>

                  <section className="debate-briefing-section cases">
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <Newspaper size={20} color="var(--accent-amber)" /> 최근 사례로 확인할 포인트
                    </h3>
                    <div className="grid gap-3" style={{ gridTemplateColumns: '1fr' }}>
                      {selectedBattle.briefing.recentCases.map((caseItem, caseIndex) => (
                        <div className="debate-case-card" key={caseItem} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)', lineHeight: 1.6 }}>
                          <span>{String(caseIndex + 1).padStart(2, '0')}</span><p>{caseItem}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="debate-briefing-section clash">
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <Scale size={20} color="var(--secondary)" /> 찬성 vs 반대 쟁점
                    </h3>
                    <div className="grid gap-4" style={{ gridTemplateColumns: '1fr' }}>
                      {[selectedBattle.briefing.affirmative, selectedBattle.briefing.negative].map((side, sideIndex) => (
                        <div className={`debate-clash-card ${sideIndex === 0 ? 'affirmative' : 'negative'}`} key={side.title} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                          <h4 style={{ marginBottom: '0.75rem', color: side.title.includes('찬성') || side.title.includes('허용') ? 'var(--accent-amber)' : 'var(--primary)' }}>
                            {side.title}
                          </h4>
                          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingLeft: '1.1rem', color: 'var(--text-main)', lineHeight: 1.65 }}>
                            {side.points.map(point => (
                              <li key={point}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <aside className="debate-briefing-settings flex flex-col gap-6">
                  <section className="debate-setting-card" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)' }}>
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
                          className={`card debate-setting-option flex items-center justify-center ${userPosition === option.value ? 'active stance' : ''}`}
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
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.85rem', lineHeight: 1.65 }}>
                      선택한 입장으로 AI가 반대편을 맡아 정식 토론을 시작합니다.
                    </p>
                  </section>

                  <section className="debate-setting-card" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)' }}>
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
                          className={`card debate-setting-option flex items-center justify-center ${debateLevel === option.value ? 'active' : ''}`}
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

                  <section className="debate-setting-card" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)' }}>
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <Clock size={18} color="var(--primary)" /> 토론 시간
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      {AI_DEBATE_TIME_OPTIONS.map(time => (
                        <button
                          key={time}
                          type="button"
                          className={`card debate-setting-option flex items-center justify-center ${selectedTimeLimit === time ? 'active' : ''}`}
                          style={{
                            cursor: 'pointer',
                            minHeight: '48px',
                            padding: '0.7rem 0.35rem',
                            border: selectedTimeLimit === time ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                            color: selectedTimeLimit === time ? 'var(--primary)' : 'var(--text-main)',
                            background: selectedTimeLimit === time ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-card)',
                            fontWeight: 900,
                          }}
                          onClick={() => setSelectedTimeLimit(time)}
                        >
                          {time / 60}분
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="debate-setting-card resources" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)' }}>
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

                  <section className="debate-setting-card prep" style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-card)' }}>
                    <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                      <Sparkles size={18} color="var(--secondary)" /> 토론 전 질문
                    </h3>
                    <ol style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingLeft: '1.2rem', color: 'var(--text-main)', lineHeight: 1.65 }}>
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
        <aside className="debate-home-sidebar" style={{ width: '360px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {/* Popular Topics */}
          <section className="card debate-side-card debate-popular-panel" style={{ padding: '1.5rem', background: 'var(--bg-card)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <header className="debate-side-card-header">
              <span><Flame size={18} /></span><div><small>TRENDING NOW</small><h3>이번 주 화제의 토론</h3></div>
            </header>
            <div className="debate-popular-list flex flex-col gap-4">
              {popularTopics.map((topic, index) => (
                <button
                  type="button"
                  key={topic.id} 
                  className={`debate-popular-item flex items-start gap-3 ${index === 0 ? 'top' : ''}`}
                  style={{ cursor: 'pointer', transition: 'all 0.2s', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}
                  onClick={() => handleOpenBriefing(topic.id)}
                >
                  <span className="debate-popular-rank" style={{ fontSize: '1.2rem', fontWeight: 900, color: index < 3 ? 'var(--primary)' : 'var(--text-muted)', minWidth: '24px', textAlign: 'center' }}>
                    {String(topic.rank).padStart(2, '0')}
                  </span>
                  <div className="debate-popular-copy flex-1 min-w-0" style={{ wordBreak: 'keep-all' }}>
                    <h4 style={{ margin: '0 0 0.3rem 0', fontSize: '0.95rem', lineHeight: 1.4, color: 'var(--text-light)' }}>
                      {topic.title}
                    </h4>
                    <span className="flex items-center gap-1" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      <Eye size={12} /> 조회 {topic.views}
                    </span>
                  </div>
                  <TrendingUp size={15} />
                </button>
              ))}
            </div>
          </section>

          {/* Weekly Debater Rankings */}
          <section className="card debate-side-card debater-ranking-panel" style={{ padding: '1.5rem', background: 'var(--bg-card)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
            <header className="debate-side-card-header ranking">
              <span><Trophy size={18} /></span><div><small>WEEKLY LEAGUE</small><h3>금주 토론자 랭킹</h3></div>
            </header>
            <div className="debater-ranking-list flex flex-col gap-3">
              {displayRankings.map((u, index) => {
                const showDivider = index > 0 && u.rank > 5 && displayRankings[index - 1].rank <= 5;
                return (
                  <React.Fragment key={u.id}>
                    {showDivider && (
                      <div className="debater-ranking-divider flex items-center justify-center py-1 gap-2" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, margin: '0.2rem 0' }}>
                        <div style={{ flex: 1, height: '0.5px', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}></div>
                        <span>내 현재 랭킹</span>
                        <div style={{ flex: 1, height: '0.5px', borderBottom: '1px dashed rgba(255,255,255,0.1)' }}></div>
                      </div>
                    )}
                    <div
                      className={`debater-ranking-item flex items-center gap-3 card ${index === 0 ? 'leader' : ''} ${user && u.id === user.id ? 'current' : ''}`}
                      style={{ 
                        padding: '1rem', 
                        background: index === 0 ? 'var(--accent-amber-light)' : (user && u.id === user.id) ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-elevated)',
                        border: index === 0 ? '1px solid var(--accent-amber)' : (user && u.id === user.id) ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                        boxShadow: index === 0 ? '0 2px 4px var(--accent-amber-light)' : 'none'
                      }}
                    >
                      <div className="debater-ranking-avatar" style={{ position: 'relative', width: '40px', height: '40px', borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--secondary)' }}>{u.nickname.charAt(0)}</span>
                        {u.rank <= 3 && (
                          <div className="debater-ranking-medal" style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--bg-card)', borderRadius: '50%', padding: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                            <Medal size={16} color={u.rank === 1 ? '#F59E0B' : u.rank === 2 ? '#94A3B8' : '#B45309'} />
                          </div>
                        )}
                      </div>
                      <div className="debater-ranking-copy flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span style={{ fontWeight: 700, color: 'var(--text-light)', fontSize: '1rem' }}>{u.nickname}</span>
                          <span className="badge" style={{ background: 'transparent', color: u.badgeColor, border: `1px solid ${u.badgeColor}`, padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}>
                            {u.badge}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {u.xp.toLocaleString()} XP
                        </div>
                        <div className="debater-xp-track"><i style={{ width: `${Math.max(12, Math.round(u.xp / Math.max(1, displayRankings[0]?.xp ?? u.xp) * 100))}%` }} /></div>
                      </div>
                      <div className="debater-ranking-position" style={{ fontSize: '1.2rem', fontWeight: 900, color: u.rank === 1 ? 'var(--accent-amber)' : 'var(--text-muted)', opacity: u.rank === 1 ? 1 : 0.6 }}>
                        #{u.rank}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
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
                {displayWeeklyIssues.map(issue => (
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
                      <p style={{ margin: 0, color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.65, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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

      {trainingStartError && (
        <div className="training-limit-notice" role="alert">
          <span><Shield size={18} /><strong>이용 한도 안내</strong>{trainingStartError}</span>
          <button type="button" onClick={() => setTrainingStartError(null)} aria-label="안내 닫기"><X size={17} /></button>
        </div>
      )}
      {showCreateModal && <CreateBattleModal liveOnly={createLiveOnly} onClose={() => setShowCreateModal(false)} onStart={handleStartBattle} publicTopics={publicTopics} />}
      {showJoinModal && <JoinDebateModal onClose={() => setShowJoinModal(false)} onJoin={handleJoinBattle} />}

      {showProfileModal && user && (
        <ProfileModal 
          user={user} 
          onClose={() => setShowProfileModal(false)} 
          onProfileUpdated={onUserUpdate} 
        />
      )}

      <CommunityPanel
        topicId={communityTopicId || ''}
        topicTitle={communityTopicTitle}
        isOpen={!!communityTopicId}
        onClose={() => setCommunityTopicId(null)}
        user={user}
        onLoginRequest={onLoginRequest}
      />
      <footer className="site-legal-footer"><span>© 2026 ThinkFit</span><button type="button" onClick={() => navigate('/terms')}>이용약관</button><button type="button" onClick={() => navigate('/privacy')}>개인정보 처리 안내</button></footer>
    </div>
  );
};
