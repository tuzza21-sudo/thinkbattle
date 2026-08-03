import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Building2, ChevronRight, Clock, ExternalLink, Gavel, Layers3, LogIn, Newspaper, Presentation, Scale, Sparkles, Swords, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMyMemberOrganizations, getMyOrganizationTopics } from '../lib/admin';
import { buildDebateLobbyPath, createLiveRoomId } from '../lib/liveDebate';
import { createDebateRoom } from '../lib/debateRooms';
import { CreateBattleModal } from './CreateBattleModal';
import { JoinDebateModal } from './JoinDebateModal';
import type { AppUser, BattleConfig, DebateLevel, DebatePosition, LiveDebateRoomSummary, OrganizationSummary, OrganizationTopic } from '../types';

const accentStyles = {
  primary: {
    color: 'var(--primary)',
    soft: 'rgba(37, 99, 235, 0.1)',
    border: 'var(--primary)',
  },
  amber: {
    color: 'var(--accent-amber)',
    soft: 'rgba(217, 119, 6, 0.1)',
    border: 'var(--accent-amber)',
  },
  secondary: {
    color: 'var(--secondary)',
    soft: 'rgba(15, 23, 42, 0.1)',
    border: 'var(--secondary)',
  },
};

const getTopicAccent = (index: number) => {
  const keys = Object.keys(accentStyles) as (keyof typeof accentStyles)[];
  return accentStyles[keys[index % keys.length]];
};

const levelLabels: Record<string, string> = { beginner: '초급', intermediate: '중급', advanced: '고급' };
const timeLimitLabel = (seconds?: number) => seconds ? `${Math.round(seconds / 60)}분` : '10분';

export const InstitutionTopicsPage = ({ user, onLoginRequest }: { user: AppUser | null; onLoginRequest: () => void }) => {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [topics, setTopics] = useState<OrganizationTopic[]>([]);
  const [selected, setSelected] = useState<OrganizationTopic | null>(null);
  const [position, setPosition] = useState<DebatePosition>('affirmative');
  const [level, setLevel] = useState<DebateLevel>('beginner');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  useEffect(() => {
    if (user) void Promise.all([getMyMemberOrganizations(), getMyOrganizationTopics()]).then(([orgs, nextTopics]) => {
      setOrganizations(orgs);
      setTopics(nextTopics);
    });
  }, [user]);

  const handleSelectTopic = (topic: OrganizationTopic) => {
    setSelected(topic);
    setLevel(topic.config?.debateLevel ?? 'beginner');
    setPosition('affirmative');
    window.setTimeout(() => {
      document.getElementById('institution-briefing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const start = () => {
    if (!user) return onLoginRequest();
    if (!selected) return;
    navigate('/battle/new', {
      state: {
        topic: selected.title,
        gameMode: 'debate',
        timeLimit: selected.config?.timeLimit ?? 600,
        userPosition: position,
        debateLevel: level,
      } satisfies BattleConfig,
    });
  };

  const handleCreateLiveDebate = async (config: BattleConfig) => {
    if (!user) return onLoginRequest();
    const organization = organizations[0];
    if (!organization) return;
    const roomId = createLiveRoomId();
    await createDebateRoom({
      roomId,
      topic: config.topic,
      timeLimit: config.timeLimit,
      teamSize: config.teamSize ?? 1,
      allowModerator: config.allowModerator ?? true,
      audience: 'organization',
      organizationId: organization.id,
      organizationName: organization.name,
      hostPosition: config.userPosition ?? 'affirmative',
      hostRole: config.participantRole ?? 'debater',
    }, user);
    navigate(buildDebateLobbyPath(roomId));
  };

  const handleJoinLiveDebate = (room: LiveDebateRoomSummary) => {
    if (!user) return onLoginRequest();
    navigate(buildDebateLobbyPath(room.roomId));
  };

  const briefing = selected?.briefing;
  const selectedIndex = selected ? topics.findIndex(t => t.id === selected.id) : -1;
  const selectedAccent = selectedIndex >= 0 ? getTopicAccent(selectedIndex) : accentStyles.primary;
  const orgNames = organizations.map(org => org.name).join(' · ') || '소속 기관';

  return (
    <main className="app-container page-scroll" style={{ maxWidth: 1180, padding: '0 1.25rem 4rem' }}>

      {/* Navigation */}
      <div className="flex justify-between items-center" style={{ padding: '1.5rem 0 0' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/')} style={{ gap: '0.5rem' }}>
          <ArrowLeft size={16} /> ThinkFit
        </button>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/institution/marketing')}
          style={{
            gap: '0.5rem',
            background: 'linear-gradient(135deg, var(--primary) 0%, #1D4ED8 100%)',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            fontWeight: 800,
          }}
        >
          <Presentation size={18} /> B2B 기관 소개 (PPT)
        </button>
      </div>

      {/* Hero Header */}
      <header style={{
        margin: '2rem 0 2.5rem',
        padding: '2.5rem 2rem',
        borderRadius: 'var(--radius-md)',
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(217, 119, 6, 0.06) 50%, rgba(37, 99, 235, 0.04) 100%)',
        border: '1px solid var(--border-color)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          top: '-50%',
          right: '-10%',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div className="flex items-center gap-3" style={{ marginBottom: '1rem' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
          }}>
            <Building2 size={20} color="#fff" />
          </div>
          <div className="badge" style={{ background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.05em' }}>
            INSTITUTION ONLY
          </div>
        </div>
        <h1 style={{ margin: '0 0 0.6rem', fontSize: '2rem', color: 'var(--text-light)', lineHeight: 1.3 }}>
          기관 전용 토론 주제
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '1.05rem', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--primary)' }}>{orgNames}</strong> 학생 전용 맞춤 토론 주제입니다.
          {topics.length > 0 && <span> · 총 <strong>{topics.length}</strong>개 주제</span>}
        </p>
        <div className="flex gap-3" style={{ marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => user ? setShowCreateModal(true) : onLoginRequest()} disabled={!!user && organizations.length === 0}>
            <Swords size={18} /> 토론 생성
          </button>
          <button className="btn btn-secondary" onClick={() => user ? setShowJoinModal(true) : onLoginRequest()} disabled={!!user && organizations.length === 0}>
            <LogIn size={18} /> 토론 참여하기
          </button>
          <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>학생과 선생님 모두 자유 주제로 개설할 수 있습니다.</span>
        </div>
      </header>

      {/* Topic List */}
      {!user ? (
        <section className="card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <Building2 size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '1.5rem' }}>로그인하면 소속 기관의 전용 주제를 확인할 수 있습니다.</p>
          <button className="btn btn-primary" onClick={onLoginRequest} style={{ padding: '0.85rem 2rem', fontSize: '1.05rem' }}>로그인하기</button>
        </section>
      ) : !topics.length ? (
        <section className="card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
          <Sparkles size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>게시된 기관 전용 주제가 아직 없습니다.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>기관 관리자가 주제를 생성하면 여기에 표시됩니다.</p>
        </section>
      ) : (
        <>
          <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))' }}>
            {topics.map((topic, index) => {
              const accent = getTopicAccent(index);
              const isSelected = selected?.id === topic.id;

              return (
                <article
                  key={topic.id}
                  className="card"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectTopic(topic)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleSelectTopic(topic); }
                  }}
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
                    background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-card)',
                  }}
                >
                  <div className="flex justify-between items-start mb-4" style={{ gap: '1rem' }}>
                    <div className="badge" style={{ background: accent.soft, color: accent.color, border: 'none' }}>
                      {topic.organizationName || '기관 전용'}
                    </div>
                    {topic.config?.timeLimit && (
                      <div className="flex items-center gap-1" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                        <Clock size={14} /> {timeLimitLabel(topic.config.timeLimit)}
                      </div>
                    )}
                  </div>

                  <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', lineHeight: 1.45, color: 'var(--text-light)' }}>
                    {topic.title}
                  </h4>

                  <p style={{ color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.65, marginBottom: '1rem', flex: 1 }}>
                    {topic.briefing
                      ? topic.briefing.context.substring(0, 80) + (topic.briefing.context.length > 80 ? '...' : '')
                      : topic.description
                        ? topic.description.substring(0, 80) + (topic.description.length > 80 ? '...' : '')
                        : '주제를 선택하여 상세 브리핑을 확인하세요.'}
                  </p>

                  <div className="flex items-center gap-2" style={{ marginTop: 'auto' }}>
                    {topic.briefing && (
                      <div className="flex items-center gap-1" style={{ color: accent.color, fontSize: '0.85rem', fontWeight: 600 }}>
                        <Sparkles size={14} /> AI 브리핑
                      </div>
                    )}
                    {topic.config?.debateLevel && (
                      <div className="badge" style={{ marginLeft: 'auto', background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: 'none', fontSize: '0.75rem' }}>
                        {levelLabels[topic.config.debateLevel] ?? topic.config.debateLevel}
                      </div>
                    )}
                    <div className="badge" style={{
                      marginLeft: topic.config?.debateLevel ? '0' : 'auto',
                      width: 'fit-content',
                      background: isSelected ? accent.color : 'var(--bg-secondary)',
                      color: isSelected ? '#FFF' : 'var(--text-muted)',
                      border: 'none',
                    }}>
                      {isSelected ? '선택됨' : '상세 보기'}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Briefing Section — matches LandingPage design */}
          {selected && (
            <section
              id="institution-briefing"
              style={{
                marginTop: '4rem',
                border: `1px solid ${selectedAccent.border}`,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-card)',
                boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)',
                overflow: 'hidden',
              }}
            >
              {/* Briefing Header */}
              <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', background: selectedAccent.soft, position: 'relative' }}>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setSelected(null)}
                  aria-label="상세 배경 설명 닫기"
                  title="닫기"
                  style={{ position: 'absolute', top: '1rem', right: '1rem', color: 'var(--text-muted)', padding: '0.2rem' }}
                >
                  <X size={16} />
                </button>
                <div className="flex justify-between items-end" style={{ gap: '1rem', rowGap: '1rem', flexWrap: 'wrap', paddingRight: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div className="badge" style={{ background: 'var(--bg-card)', color: selectedAccent.color, border: `1px solid ${selectedAccent.color}`, marginBottom: '0.8rem' }}>
                      기관 토론 브리핑
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.7rem', lineHeight: 1.35, color: 'var(--text-light)', paddingRight: '1.5rem' }}>
                      {selected.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-3" style={{ alignSelf: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-primary"
                      style={{
                        padding: '0.9rem 1.6rem',
                        fontSize: '1.1rem',
                        fontWeight: 800,
                        background: selectedAccent.color,
                        borderColor: selectedAccent.color,
                        color: '#fff',
                        boxShadow: `0 4px 12px ${selectedAccent.soft}`,
                      }}
                      onClick={start}
                    >
                      토론 참여하기 <ChevronRight size={20} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Briefing Content */}
              {briefing ? (
                <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', padding: '1.5rem' }}>
                  {/* Left Column — Content */}
                  <div className="flex flex-col gap-6">
                    <section>
                      <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                        <BookOpen size={20} color="var(--primary)" /> 배경 지식
                      </h3>
                      <p style={{ color: 'var(--text-main)', lineHeight: 1.75 }}>{briefing.context}</p>
                    </section>

                    <section>
                      <h3 className="flex items-center gap-2" style={{ fontSize: '1.12rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                        <Newspaper size={20} color="var(--accent-amber)" /> 최근 사례로 확인할 포인트
                      </h3>
                      <div className="grid gap-3" style={{ gridTemplateColumns: '1fr' }}>
                        {briefing.recentCases.map(caseItem => (
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
                        {[briefing.affirmative, briefing.negative].map(side => (
                          <div key={side.title} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
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

                    {/* Keywords */}
                    {briefing.keywords && briefing.keywords.length > 0 && (
                      <section>
                        <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                          🏷️ 핵심 키워드
                        </h3>
                        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                          {briefing.keywords.map(keyword => (
                            <span key={keyword} className="badge" style={{ background: selectedAccent.soft, color: selectedAccent.color, border: `1px solid ${selectedAccent.border}`, fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>

                  {/* Right Column — Controls */}
                  <aside className="flex flex-col gap-6">
                    {/* Position Selection */}
                    <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)' }}>
                      <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                        <Gavel size={18} color="var(--accent-amber)" /> 입장 선택
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          { value: 'affirmative' as DebatePosition, label: '찬성' },
                          { value: 'negative' as DebatePosition, label: '반대' },
                        ]).map(option => (
                          <button
                            key={option.value}
                            type="button"
                            className="card flex items-center justify-center"
                            style={{
                              cursor: 'pointer',
                              minHeight: '54px',
                              padding: '0.85rem',
                              border: position === option.value ? '2px solid var(--accent-amber)' : '1px solid var(--border-color)',
                              color: position === option.value ? 'var(--accent-amber)' : 'var(--text-main)',
                              background: position === option.value ? 'rgba(217, 119, 6, 0.05)' : 'var(--bg-card)',
                              fontWeight: 900,
                              boxShadow: position === option.value ? '0 2px 4px rgba(217, 119, 6, 0.1)' : 'none',
                            }}
                            onClick={() => setPosition(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.85rem', lineHeight: 1.65 }}>
                        선택한 입장으로 AI가 반대편을 맡아 정식 토론을 시작합니다.
                      </p>
                    </section>

                    {/* Debate Level */}
                    <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)' }}>
                      <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                        <Layers3 size={18} color="var(--primary)" /> 토론 수준
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { value: 'beginner' as DebateLevel, label: '초급' },
                          { value: 'intermediate' as DebateLevel, label: '중급' },
                          { value: 'advanced' as DebateLevel, label: '고급' },
                        ]).map(option => (
                          <button
                            key={option.value}
                            type="button"
                            className="card flex items-center justify-center"
                            style={{
                              cursor: 'pointer',
                              minHeight: '48px',
                              padding: '0.7rem 0.45rem',
                              border: level === option.value ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                              color: level === option.value ? 'var(--primary)' : 'var(--text-main)',
                              background: level === option.value ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-card)',
                              fontWeight: 900,
                              boxShadow: level === option.value ? '0 2px 4px rgba(37, 99, 235, 0.1)' : 'none',
                            }}
                            onClick={() => setLevel(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </section>

                    {/* News Links */}
                    <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-primary)' }}>
                      <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                        <ExternalLink size={18} color="var(--primary)" /> 인터넷 기사 보기
                      </h3>
                      <div className="flex flex-col gap-2">
                        {briefing.newsLinks.length ? briefing.newsLinks.map(link => (
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
                        )) : (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                            확인된 관련 기사가 아직 등록되지 않았습니다.
                          </p>
                        )}
                      </div>
                    </section>

                    {/* Prep Questions */}
                    <section style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--bg-card)' }}>
                      <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem', marginBottom: '0.8rem', color: 'var(--text-light)' }}>
                        <Sparkles size={18} color="var(--secondary)" /> 토론 전 질문
                      </h3>
                      <ol style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingLeft: '1.2rem', color: 'var(--text-main)', lineHeight: 1.65 }}>
                        {briefing.prepQuestions.map(question => (
                          <li key={question}>{question}</li>
                        ))}
                      </ol>
                    </section>

                    {/* Start Button */}
                    <button
                      className="btn btn-primary"
                      style={{
                        padding: '0.95rem 1.3rem',
                        fontSize: '1.05rem',
                        fontWeight: 800,
                        background: selectedAccent.color,
                        borderColor: selectedAccent.color,
                        color: '#fff',
                        boxShadow: `0 4px 12px ${selectedAccent.soft}`,
                      }}
                      onClick={start}
                    >
                      토론 참여하기 <ChevronRight size={18} />
                    </button>
                  </aside>
                </div>
              ) : (
                <div style={{ padding: '2rem 1.5rem' }}>
                  <p style={{ color: 'var(--text-main)', lineHeight: 1.75, marginBottom: '1.5rem' }}>
                    {selected.description || '이 주제의 입장을 선택하고 토론을 시작하세요.'}
                  </p>
                  <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
                    <div className="grid grid-cols-2 gap-3" style={{ minWidth: '200px' }}>
                      {([
                        { value: 'affirmative' as DebatePosition, label: '찬성' },
                        { value: 'negative' as DebatePosition, label: '반대' },
                      ]).map(option => (
                        <button
                          key={option.value}
                          type="button"
                          className="card flex items-center justify-center"
                          style={{
                            cursor: 'pointer',
                            minHeight: '48px',
                            border: position === option.value ? '2px solid var(--accent-amber)' : '1px solid var(--border-color)',
                            color: position === option.value ? 'var(--accent-amber)' : 'var(--text-main)',
                            background: position === option.value ? 'rgba(217, 119, 6, 0.05)' : 'var(--bg-card)',
                            fontWeight: 900,
                          }}
                          onClick={() => setPosition(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{
                        padding: '0.85rem 1.6rem',
                        fontSize: '1.05rem',
                        fontWeight: 800,
                        background: selectedAccent.color,
                        borderColor: selectedAccent.color,
                        color: '#fff',
                      }}
                      onClick={start}
                    >
                      토론 시작 <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
      {showCreateModal && organizations[0] && (
        <CreateBattleModal
          liveOnly
          audience="organization"
          organizationId={organizations[0].id}
          organizationTopics={topics}
          onClose={() => setShowCreateModal(false)}
          onStart={handleCreateLiveDebate}
        />
      )}
      {showJoinModal && (
        <JoinDebateModal
          audience="organization"
          organizationIds={organizations.map(org => org.id)}
          onClose={() => setShowJoinModal(false)}
          onJoin={handleJoinLiveDebate}
        />
      )}
    </main>
  );
};
