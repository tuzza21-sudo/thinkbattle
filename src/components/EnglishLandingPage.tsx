import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  BarChart3,
  ChevronRight,
  FileText,
  Languages,
  LogIn,
  LogOut,
  MessageSquareText,
  Scale,
  ShieldCheck,
  Sparkles,
  Swords,
  Users,
} from 'lucide-react';
import { getMyMemberOrganizations } from '../lib/admin';
import { createDebateRoom } from '../lib/debateRooms';
import { buildDebateLobbyPath, createLiveRoomId } from '../lib/liveDebate';
import { getPublicDebateTopics } from '../lib/publicTopics';
import type { AppLanguage, AppUser, BattleConfig, LiveDebateRoomSummary, OrganizationSummary, PublicDebateTopic } from '../types';
import { CreateBattleModal } from './CreateBattleModal';
import { JoinDebateModal } from './JoinDebateModal';
import { TopicBriefingDetails } from './TopicBriefingDetails';

type EnglishLandingPageProps = {
  user: AppUser | null;
  onLoginRequest: () => void;
  onLogout: () => void;
  onLanguageChange: (language: AppLanguage) => void;
};

const coreBenefits = [
  { icon: MessageSquareText, title: 'A real-time debate room', description: 'Practise live argument, questioning and rebuttal through AI or person-to-person debate.' },
  { icon: Scale, title: 'Consistent assessment', description: 'Review claims, reasoning, evidence, questions and rebuttal against the same learning criteria.' },
  { icon: BarChart3, title: 'Individual progress records', description: 'Keep each motion, speech, score and feedback report as evidence of development.' },
  { icon: Archive, title: 'A reusable debate archive', description: 'Turn repeated participation into a growing collection of motions and arguments.' },
];

export const EnglishLandingPage = ({ user, onLoginRequest, onLogout, onLanguageChange }: EnglishLandingPageProps) => {
  const navigate = useNavigate();
  const [topics, setTopics] = useState<PublicDebateTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<PublicDebateTopic | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLiveOnly, setCreateLiveOnly] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  useEffect(() => {
    void getPublicDebateTopics('en').then(items => {
      setTopics(items);
      setSelectedTopic(current => current ?? items[0] ?? null);
    });
  }, []);

  useEffect(() => {
    const request = user ? getMyMemberOrganizations() : Promise.resolve([]);
    void request.then(setOrganizations);
  }, [user]);

  const openCreate = (liveOnly: boolean) => {
    if (!user) return onLoginRequest();
    setCreateLiveOnly(liveOnly);
    setShowCreateModal(true);
  };

  const startBattle = async (config: BattleConfig) => {
    if (!user) return onLoginRequest();
    const englishConfig = { ...config, language: 'en' as const };
    if (config.gameMode === 'pvp') {
      const roomId = createLiveRoomId();
      await createDebateRoom({
        roomId,
        topic: config.topic,
        topicDescription: config.topicDescription ?? '',
        topicBriefing: config.topicBriefing,
        language: 'en',
        debateLevel: config.debateLevel === 'intermediate' ? 'intermediate' : 'beginner',
        voiceEnabled: config.voiceEnabled ?? false,
        timeLimit: config.timeLimit,
        teamSize: config.teamSize ?? 1,
        allowModerator: config.allowModerator ?? false,
        audience: 'public',
        hostPosition: config.userPosition ?? 'affirmative',
        hostRole: config.participantRole ?? 'debater',
      }, user);
      navigate(buildDebateLobbyPath(roomId));
      return;
    }
    navigate('/battle/new', { state: englishConfig });
  };

  const startSelectedTopic = () => {
    if (!selectedTopic) return;
    void startBattle({
      topic: selectedTopic.title,
      topicDescription: selectedTopic.description,
      topicBriefing: selectedTopic.briefing,
      timeLimit: selectedTopic.config.timeLimit ?? 600,
      debateLevel: selectedTopic.config.debateLevel ?? 'beginner',
      debateFocus: selectedTopic.config.debateFocus,
      userPosition: 'affirmative',
      gameMode: 'debate',
      language: 'en',
    });
  };

  const joinRoom = (room: LiveDebateRoomSummary) => {
    if (!user) return onLoginRequest();
    navigate(buildDebateLobbyPath(room.roomId));
  };

  return (
    <div className="app-container page-scroll" style={{ paddingBottom: '5rem' }}>
      <header style={{ marginBottom: '2.5rem' }}>
        <div className="flex justify-between items-center" style={{ gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <span style={{ color: 'var(--primary)', fontSize: '.78rem', fontWeight: 900, letterSpacing: '.08em' }}>ENGLISH DEBATE TRAINING</span>
            <h1 style={{ margin: '.25rem 0 0', color: 'var(--primary)', fontSize: '2.35rem' }}>ThinkFit</h1>
          </div>
          <nav className="card flex items-center gap-3" style={{ padding: '.75rem 1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => onLanguageChange('ko')} aria-label="한국어 버전으로 전환">
              <Languages size={16} /> Korean <span style={{ color: 'var(--text-muted)' }}>|</span> English
            </button>
            {organizations[0] && <button className="btn btn-secondary" onClick={() => navigate('/institution')}><ShieldCheck size={16} /> {organizations[0].name}</button>}
            {user && <button className="btn btn-secondary" onClick={() => navigate('/history')}><FileText size={16} /> Records</button>}
            {user ? (
              <><span style={{ color: 'var(--text-light)', fontWeight: 800 }}>{user.nickname}</span><button className="icon-button" onClick={onLogout} aria-label="Log out"><LogOut size={18} /></button></>
            ) : <button className="btn btn-primary" onClick={onLoginRequest}><LogIn size={17} /> Log in</button>}
          </nav>
        </div>

        <section style={{ marginTop: '2rem', padding: 'clamp(1.6rem, 5vw, 3.2rem)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(135deg, rgba(37,99,235,.14), rgba(15,23,42,.35))' }}>
          <span className="badge" style={{ color: 'var(--primary)', background: 'rgba(37,99,235,.1)' }}><Sparkles size={14} /> English version</span>
          <h2 style={{ maxWidth: 760, margin: '1rem 0 .8rem', color: 'var(--text-light)', fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.18 }}>Think clearly.<br />Argue in English.</h2>
          <p style={{ maxWidth: 720, color: 'var(--text-main)', fontSize: '1.08rem', lineHeight: 1.7 }}>Practise structured English debate, receive evidence-based feedback and keep a record of how your reasoning develops over time.</p>
          <div className="flex gap-3" style={{ marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => openCreate(false)}><Swords size={18} /> Start an English debate</button>
            <button className="btn btn-secondary" onClick={() => openCreate(true)}><Users size={18} /> Create a live room</button>
            <button className="btn btn-secondary" onClick={() => user ? setShowJoinModal(true) : onLoginRequest()}><LogIn size={18} /> Join a live room</button>
          </div>
        </section>
      </header>

      <section style={{ marginBottom: '2.8rem' }}>
        <div style={{ marginBottom: '1rem' }}><span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '.8rem' }}>WHY THINKFIT</span><h2 style={{ margin: '.3rem 0 0', color: 'var(--text-light)' }}>From participation to measurable progress</h2></div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {coreBenefits.map(item => {
            const Icon = item.icon;
            return <article key={item.title} className="card" style={{ padding: '1.2rem' }}><Icon size={23} color="var(--primary)" /><h3 style={{ color: 'var(--text-light)', fontSize: '1rem' }}>{item.title}</h3><p style={{ marginBottom: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '.9rem' }}>{item.description}</p></article>;
          })}
        </div>
      </section>

      <main className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', alignItems: 'start' }}>
        <section>
          <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '.8rem' }}>DEBATE MOTIONS</span>
          <h2 style={{ margin: '.3rem 0 1rem', color: 'var(--text-light)' }}>Choose an existing motion</h2>
          <div className="flex flex-col gap-3">
            {topics.map(topic => (
              <button key={topic.id} type="button" className="card" onClick={() => setSelectedTopic(topic)} style={{ padding: '1rem', color: 'var(--text-main)', textAlign: 'left', cursor: 'pointer', borderColor: selectedTopic?.id === topic.id ? 'var(--primary)' : 'var(--border-color)', background: selectedTopic?.id === topic.id ? 'rgba(37,99,235,.08)' : 'var(--bg-card)', font: 'inherit' }}>
                <strong style={{ display: 'block', color: 'var(--text-light)', lineHeight: 1.45 }}>{topic.title}</strong>
                <small style={{ display: 'block', marginTop: '.45rem', color: 'var(--text-muted)' }}>{(topic.config.timeLimit ?? 600) / 60} minutes · {topic.config.debateLevel ?? 'beginner'}</small>
              </button>
            ))}
          </div>
        </section>

        {selectedTopic && (
          <section style={{ minWidth: 0 }}>
            <div className="card" style={{ padding: '1.3rem', borderTop: '4px solid var(--primary)' }}>
              <span className="badge" style={{ color: 'var(--primary)', background: 'rgba(37,99,235,.1)' }}>Selected motion</span>
              <h2 style={{ color: 'var(--text-light)', lineHeight: 1.4 }}>{selectedTopic.title}</h2>
              <p style={{ color: 'var(--text-main)', lineHeight: 1.7 }}>{selectedTopic.description}</p>
              <button className="btn btn-primary" onClick={startSelectedTopic}>Debate this motion <ChevronRight size={18} /></button>
            </div>
            <TopicBriefingDetails briefing={selectedTopic.briefing} language="en" initiallyOpen />
          </section>
        )}
      </main>

      {showCreateModal && <CreateBattleModal language="en" liveOnly={createLiveOnly} publicTopics={topics} onClose={() => setShowCreateModal(false)} onStart={startBattle} />}
      {showJoinModal && <JoinDebateModal language="en" onClose={() => setShowJoinModal(false)} onJoin={joinRoom} />}
      <footer className="site-legal-footer"><span>© 2026 ThinkFit</span><button type="button" onClick={() => navigate('/terms')}>Terms</button><button type="button" onClick={() => navigate('/privacy')}>Privacy</button></footer>
    </div>
  );
};
