import React, { useState } from 'react';
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
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { CreateBattleModal } from './CreateBattleModal';
import type { AppUser, BattleConfig, DebateFocus, DebateLevel, DebatePosition } from '../types';

interface LandingPageProps {
  user: AppUser | null;
  onLoginRequest: () => void;
  onLogout: () => void;
}

type DebateSide = {
  title: string;
  points: string[];
};

type NewsLink = {
  label: string;
  url: string;
};

type TopicBriefing = {
  context: string;
  recentCases: string[];
  newsLinks: NewsLink[];
  affirmative: DebateSide;
  negative: DebateSide;
  prepQuestions: string[];
  keywords: string[];
};

type FeaturedBattle = {
  id: string;
  topic: string;
  mode: string;
  players: number;
  time: number;
  accent: 'cyan' | 'amber' | 'pink';
  config: BattleConfig;
  briefing: TopicBriefing;
};

const getNewsSearchUrl = (query: string) =>
  `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR%3Ako`;

const featuredBattles: FeaturedBattle[] = [
  {
    id: 'ai-art',
    topic: '생성형 AI는 예술 창작을 대체할 수 있는가?',
    mode: '정식 토론',
    players: 1,
    time: 5,
    accent: 'amber',
    config: {
      topic: '생성형 AI는 예술 창작을 대체할 수 있는가?',
      timeLimit: 300,
      gameMode: 'debate',
      userPosition: 'affirmative',
    },
    briefing: {
      context:
        'AI 이미지, 음악, 영상 생성 도구가 빠르게 보급되면서 창작의 범위, 저작권, 직업 안정성, 인간 고유성에 대한 논쟁이 커지고 있습니다. 핵심은 "대체"를 결과물 생산의 대체로 볼지, 인간의 의도와 해석까지 포함한 창작 전체의 대체로 볼지입니다.',
      recentCases: [
        'AI 학습 데이터와 저작권 보상을 둘러싼 작가, 언론사, 플랫폼 기업의 분쟁',
        '광고, 게임, 영상 제작 현장에서 AI 생성물을 보조 도구 또는 초안 제작 도구로 활용하는 사례',
        '학교와 공모전에서 AI 생성 작품의 출품 자격, 표기 의무, 평가 기준을 새로 정하는 움직임',
      ],
      newsLinks: [
        { label: 'AI 예술 저작권 기사', url: getNewsSearchUrl('생성형 AI 예술 저작권 최근 사례') },
        { label: 'AI 창작 산업 기사', url: getNewsSearchUrl('AI 창작 산업 예술가 일자리 기사') },
      ],
      affirmative: {
        title: '찬성 측 핵심',
        points: [
          'AI는 이미지, 음악, 글 초안을 빠르고 싸게 만들어 상업 창작의 상당 부분을 대체할 수 있다.',
          '소비자는 창작자의 의도보다 결과물의 품질과 가격을 더 중시할 수 있다.',
          '새 도구가 반복 작업을 자동화하면 창작 노동의 구조가 바뀐다.',
        ],
      },
      negative: {
        title: '반대 측 핵심',
        points: [
          '예술은 경험, 문제의식, 사회적 해석이 결합된 인간적 행위라 단순 산출물과 다르다.',
          'AI는 기존 데이터를 재조합하므로 새로운 미학적 기준을 스스로 세우기 어렵다.',
          '도구는 대체보다 확장을 만들 수 있으며, 인간 창작자의 큐레이션과 책임이 남는다.',
        ],
      },
      prepQuestions: [
        '여기서 "대체"는 직업 대체인가, 작품 생산 대체인가, 창작 의미의 대체인가?',
        'AI 작품이 감동을 준다면 인간 창작 의도는 반드시 필요한가?',
        '저작권과 보상 문제는 기술 발전을 제한해야 할 만큼 중요한가?',
      ],
      keywords: ['저작권', '창작 노동', '오리지널리티', '도구와 대체', '책임'],
    },
  },
  {
    id: 'juvenile-law',
    topic: '촉법소년 연령 하향은 정당한가?',
    mode: '정식 토론',
    players: 1,
    time: 10,
    accent: 'pink',
    config: {
      topic: '촉법소년 연령 하향은 정당한가?',
      timeLimit: 600,
      gameMode: 'debate',
      userPosition: 'affirmative',
    },
    briefing: {
      context:
        '소년 범죄 보도와 피해자 보호 요구가 커질 때마다 촉법소년 연령 하향 논의가 반복됩니다. 쟁점은 처벌 강화가 범죄 억제와 책임 교육에 도움이 되는지, 아니면 낙인과 재범 위험을 키우는지입니다.',
      recentCases: [
        '강력 소년범죄 보도 이후 형사책임 연령 조정과 소년법 개정 요구가 커진 사례',
        '학교폭력, 무인점포 절도, 온라인 범죄 등 청소년 범죄 양상이 다양해진 사례',
        '보호처분, 교화 시설, 피해자 회복 제도 강화가 함께 논의되는 정책 흐름',
      ],
      newsLinks: [
        { label: '촉법소년 연령 하향 기사', url: getNewsSearchUrl('촉법소년 연령 하향 최근 기사') },
        { label: '소년범죄 정책 기사', url: getNewsSearchUrl('소년범죄 처벌 교화 정책 기사') },
      ],
      affirmative: {
        title: '찬성 측 핵심',
        points: [
          '범죄 피해의 심각성에 비해 책임이 약하면 법의 억지력이 떨어진다.',
          '청소년도 정보 접근성이 높아져 범죄 결과를 예측할 수 있는 경우가 많다.',
          '피해자 보호와 사회 안전을 위해 일정한 형사 책임은 필요하다.',
        ],
      },
      negative: {
        title: '반대 측 핵심',
        points: [
          '어린 나이의 판단 능력과 환경 요인을 고려하면 처벌보다 교화가 우선이다.',
          '형사처벌은 낙인을 남겨 재범과 사회 이탈을 키울 수 있다.',
          '강력 사건 중심의 여론이 전체 청소년 정책을 왜곡할 위험이 있다.',
        ],
      },
      prepQuestions: [
        '처벌 강화가 실제 범죄 억제로 이어진다는 근거는 무엇인가?',
        '피해자 회복과 가해 청소년 교화 중 어느 기준을 더 우선해야 하는가?',
        '연령 하향 외에 더 효과적인 대안은 없는가?',
      ],
      keywords: ['형사책임', '교화', '피해자 보호', '재범', '소년법'],
    },
  },
  {
    id: 'animal-testing',
    topic: '동물실험은 계속 허용되어야 하는가?',
    mode: '정식 토론',
    players: 1,
    time: 7,
    accent: 'cyan',
    config: {
      topic: '동물실험은 계속 허용되어야 하는가?',
      timeLimit: 420,
      gameMode: 'debate',
      userPosition: 'affirmative',
    },
    briefing: {
      context:
        '의약품과 독성 검증에서 동물실험은 오랫동안 중요한 역할을 했지만, 동물권과 대체시험 기술의 발전으로 허용 범위를 다시 묻는 논쟁이 커지고 있습니다. 핵심은 인간 안전, 동물 고통, 대체 가능성의 균형입니다.',
      recentCases: [
        '장기칩, 세포 기반 시험, AI 독성 예측 등 대체시험 기술이 연구와 규제에서 활용되는 사례',
        '화장품 동물실험 제한과 의약품 안전성 검증 기준을 둘러싼 국가별 정책 변화',
        '실험동물 복지 기준, 3R 원칙, 실험 공개성에 대한 사회적 요구',
      ],
      newsLinks: [
        { label: '동물실험 대체시험 기사', url: getNewsSearchUrl('동물실험 대체시험 기술 최근 기사') },
        { label: '동물실험 규제 기사', url: getNewsSearchUrl('동물실험 규제 의약품 화장품 기사') },
      ],
      affirmative: {
        title: '허용 측 핵심',
        points: [
          '신약과 백신의 안전성을 검증하려면 아직 생체 반응을 확인할 필요가 있다.',
          '대체 기술이 모든 장기 상호작용과 장기 부작용을 충분히 예측하지 못할 수 있다.',
          '엄격한 윤리 심사와 최소화 원칙 아래 제한적으로 허용할 수 있다.',
        ],
      },
      negative: {
        title: '금지/축소 측 핵심',
        points: [
          '동물의 고통을 인간 이익만으로 정당화하기 어렵다.',
          '동물 모델 결과가 인간에게 항상 잘 맞지 않아 과학적 한계가 있다.',
          '대체시험 기술에 더 투자하면 안전성과 윤리를 함께 개선할 수 있다.',
        ],
      },
      prepQuestions: [
        '인간의 생명 보호가 동물의 고통보다 항상 우선하는가?',
        '대체 기술이 어느 수준까지 발전해야 동물실험을 중단할 수 있는가?',
        '허용한다면 어떤 실험은 절대 금지해야 하는가?',
      ],
      keywords: ['동물권', '3R 원칙', '신약 안전성', '대체시험', '윤리 심사'],
    },
  },
];

const accentStyles = {
  cyan: {
    color: 'var(--primary)',
    soft: 'rgba(0,229,255,0.1)',
    border: 'var(--primary)',
  },
  amber: {
    color: 'var(--accent-amber)',
    soft: 'rgba(255,184,0,0.1)',
    border: 'var(--accent-amber)',
  },
  pink: {
    color: 'var(--secondary)',
    soft: 'rgba(255,0,85,0.1)',
    border: 'var(--secondary)',
  },
};

const getPositionLabel = (position: DebatePosition) => {
  if (position === 'negative') return '반대';
  return '찬성';
};

export const LandingPage: React.FC<LandingPageProps> = ({ user, onLoginRequest, onLogout }) => {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [userPosition, setUserPosition] = useState<DebatePosition>('affirmative');
  const [debateLevel, setDebateLevel] = useState<DebateLevel>('beginner');
  const [debateFocus, setDebateFocus] = useState<DebateFocus>('fact');

  const selectedBattle = selectedBattleId
    ? featuredBattles.find(battle => battle.id === selectedBattleId) ?? null
    : null;

  const handleStartBattle = (config: BattleConfig, position: DebatePosition = userPosition) => {
    navigate('/battle/new', {
      state: {
        ...config,
        gameMode: 'debate',
        userPosition: position,
        debateLevel,
        debateFocus,
      },
    });
  };

  const handleOpenBriefing = (battleId: string) => {
    setSelectedBattleId(battleId);
    setUserPosition('affirmative');
    setDebateLevel('beginner');
    setDebateFocus('fact');
    window.setTimeout(() => {
      document.getElementById('topic-briefing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const selectedAccent = selectedBattle ? accentStyles[selectedBattle.accent] : null;

  return (
    <div className="app-container page-scroll" style={{ padding: '2rem' }}>
      <header className="flex justify-between items-center mb-8" style={{ gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', color: 'var(--primary)', textShadow: '0 0 15px rgba(0, 229, 255, 0.4)', margin: 0, textTransform: 'uppercase' }}>
            ThinkBattle
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>
            배경지식을 검토하고, 입장을 고른 뒤 정식 토론으로 들어갑니다.
          </p>
        </div>

        <div className="card flex items-center gap-6" style={{ padding: '1rem 1.4rem', borderRadius: 'var(--radius-md)', flexWrap: 'wrap' }}>
          <div className="flex items-center gap-3">
            <div style={{ background: 'rgba(255,184,0,0.1)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-amber)' }}>
              <Shield size={24} color="var(--accent-amber)" />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>MY LEAGUE</div>
              <div style={{ fontSize: '1.1rem', color: 'var(--accent-amber)', fontWeight: 900 }}>중급 리그</div>
            </div>
          </div>
          <div style={{ width: '1px', height: '40px', background: 'var(--border-color)' }} />
          <div className="flex items-center gap-3">
            <div style={{ background: 'rgba(0,229,255,0.1)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--primary)' }}>
              <Zap size={24} color="var(--primary)" />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>경험치 XP</div>
              <div style={{ fontSize: '1.1rem', color: 'var(--text-light)', fontWeight: 900 }}>4,250 <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Top 12%</span></div>
            </div>
          </div>
          <div style={{ width: '1px', height: '40px', background: 'var(--border-color)' }} />
          {user ? (
            <div className="flex items-center gap-3">
              <button className="btn btn-secondary" style={{ padding: '0.7rem 1rem' }} onClick={() => navigate('/history')}>
                <FileText size={18} /> 기록
              </button>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>USER</div>
                <div style={{ fontSize: '1.05rem', color: 'var(--text-light)', fontWeight: 900 }}>{user.nickname}</div>
              </div>
              <button className="icon-button" onClick={onLogout} aria-label="로그아웃" title="로그아웃">
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

      <main style={{ paddingBottom: '3rem' }}>
        <div className="flex justify-between items-center mb-6" style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <h2 className="flex items-center gap-2" style={{ fontSize: '1.5rem', margin: 0 }}>
            <Swords color="var(--secondary)" /> 토론 주제 선택
          </h2>
          <button
            className="btn btn-primary"
            style={{ padding: '1rem 1.5rem', fontSize: '1rem' }}
            onClick={() => setShowCreateModal(true)}
          >
            <Swords size={20} /> 직접 배틀 개설
          </button>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))' }}>
          {featuredBattles.map(battle => {
            const accent = accentStyles[battle.accent];
            const isSelected = selectedBattle?.id === battle.id;

            return (
              <article
                key={battle.id}
                className="card"
                style={{
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  borderLeft: `4px solid ${accent.border}`,
                  borderColor: isSelected ? accent.border : 'var(--border-color)',
                  boxShadow: isSelected ? `0 0 22px ${accent.soft}` : 'none',
                  minHeight: '250px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div className="flex justify-between items-start mb-4" style={{ gap: '1rem' }}>
                  <div className="badge" style={{ background: accent.soft, color: accent.color, border: 'none' }}>
                    {battle.mode}
                  </div>
                  <div className="flex items-center gap-1" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    <Clock size={14} /> {battle.time}분
                  </div>
                </div>
                <h3 style={{ fontSize: '1.18rem', marginBottom: '1rem', lineHeight: 1.45 }}>{battle.topic}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.94rem', lineHeight: 1.55, marginBottom: '1rem' }}>
                  주제별 배경지식, 최근 기사 검색, 찬반 논리를 확인한 뒤 입장을 선택합니다.
                </p>
                <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  <Users size={16} /> {battle.players}명 참여 가능
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 'auto', padding: '0.85rem 1rem' }}
                  onClick={() => handleOpenBriefing(battle.id)}
                >
                  <BookOpen size={18} /> 배경지식 상세
                </button>
              </article>
            );
          })}
        </div>

        {selectedBattle && selectedAccent && (
          <section
            id="topic-briefing"
            style={{
              marginTop: '2rem',
              border: `1px solid ${selectedAccent.border}`,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(30, 41, 59, 0.58)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', background: selectedAccent.soft }}>
              <div className="flex justify-between items-start" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <div className="badge" style={{ background: 'rgba(11,17,32,0.65)', color: selectedAccent.color, border: 'none', marginBottom: '0.8rem' }}>
                    토론 전 브리핑
                  </div>
                  <h2 style={{ margin: 0, fontSize: '1.7rem', lineHeight: 1.35 }}>{selectedBattle.topic}</h2>
                </div>
                <button
                  className="btn btn-primary"
                  style={{ padding: '1rem 1.5rem', alignSelf: 'center' }}
                  onClick={() => handleStartBattle(selectedBattle.config)}
                >
                  <Swords size={20} /> {getPositionLabel(userPosition)}로 토론 시작
                </button>
              </div>
            </div>

            <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)', padding: '1.5rem' }}>
              <div className="flex flex-col gap-6">
                <section>
                  <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem' }}>
                    <BookOpen size={20} color="var(--primary)" /> 배경 지식
                  </h3>
                  <p style={{ color: 'var(--text-main)', lineHeight: 1.75 }}>{selectedBattle.briefing.context}</p>
                </section>

                <section>
                  <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem' }}>
                    <Newspaper size={20} color="var(--accent-amber)" /> 최근 사례로 확인할 포인트
                  </h3>
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    {selectedBattle.briefing.recentCases.map(caseItem => (
                      <div key={caseItem} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'rgba(11,17,32,0.35)', lineHeight: 1.6 }}>
                        {caseItem}
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem' }}>
                    <Scale size={20} color="var(--secondary)" /> 찬성 vs 반대 쟁점
                  </h3>
                  <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                    {[selectedBattle.briefing.affirmative, selectedBattle.briefing.negative].map(side => (
                      <div key={side.title} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'rgba(11,17,32,0.35)' }}>
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
                <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'rgba(11,17,32,0.35)' }}>
                  <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem' }}>
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
                          color: userPosition === option.value ? 'var(--accent-amber)' : 'var(--text-muted)',
                          fontWeight: 900,
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

                <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'rgba(11,17,32,0.35)' }}>
                  <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem' }}>
                    <Layers3 size={18} color="var(--primary)" /> 토론 수준
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'beginner' as DebateLevel, label: '초급' },
                      { value: 'intermediate' as DebateLevel, label: '중급' },
                      { value: 'advanced' as DebateLevel, label: '고급' },
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
                          color: debateLevel === option.value ? 'var(--primary)' : 'var(--text-muted)',
                          fontWeight: 900,
                        }}
                        onClick={() => setDebateLevel(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'rgba(11,17,32,0.35)' }}>
                  <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem' }}>
                    <Target size={18} color="var(--secondary)" /> 논제 초점
                  </h3>
                  <div className="grid gap-2">
                    {[
                      { value: 'fact' as DebateFocus, label: '중요 사실확인형' },
                      { value: 'policy' as DebateFocus, label: '정책형' },
                      { value: 'value' as DebateFocus, label: '가치판단형' },
                    ].map(option => (
                      <button
                        key={option.value}
                        type="button"
                        className="card flex items-center justify-center"
                        style={{
                          cursor: 'pointer',
                          minHeight: '46px',
                          padding: '0.7rem',
                          border: debateFocus === option.value ? '2px solid var(--secondary)' : '1px solid var(--border-color)',
                          color: debateFocus === option.value ? 'var(--secondary)' : 'var(--text-muted)',
                          fontWeight: 900,
                        }}
                        onClick={() => setDebateFocus(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'rgba(11,17,32,0.35)' }}>
                  <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem' }}>
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
                        style={{ justifyContent: 'space-between', textDecoration: 'none', padding: '0.8rem 1rem', textTransform: 'none', letterSpacing: 0 }}
                      >
                        {link.label}
                        <ExternalLink size={16} />
                      </a>
                    ))}
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.85rem', lineHeight: 1.55 }}>
                    링크는 최신 기사 검색 결과로 열립니다. 토론 직전 날짜와 출처를 확인해 근거로 사용하세요.
                  </p>
                </section>

                <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'rgba(11,17,32,0.35)' }}>
                  <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem' }}>
                    <Sparkles size={18} color="var(--secondary)" /> 토론 전 질문
                  </h3>
                  <ol style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingLeft: '1.2rem', color: 'var(--text-main)', lineHeight: 1.55 }}>
                    {selectedBattle.briefing.prepQuestions.map(question => (
                      <li key={question}>{question}</li>
                    ))}
                  </ol>
                </section>

                <section>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    {selectedBattle.briefing.keywords.map(keyword => (
                      <span key={keyword} className="badge" style={{ background: 'rgba(148,163,184,0.12)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                        {keyword}
                      </span>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </section>
        )}
      </main>

      {showCreateModal && <CreateBattleModal onClose={() => setShowCreateModal(false)} onStart={handleStartBattle} />}
    </div>
  );
};
