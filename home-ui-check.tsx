import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import './src/index.css';
import './src/App.css';
import { TrainingGatewayPage } from './src/components/TrainingGatewayPage';
import { LandingPage } from './src/components/LandingPage';
import { SimulationHubPage } from './src/components/SimulationHubPage';
import { AuthModal } from './src/components/AuthModal';
import { AuthenticatedRoute } from './src/components/AuthenticatedRoute';
import App from './src/App';

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin === location.origin && !url.pathname.startsWith('/api/')) return nativeFetch(input, init);
  const opinions = Array.from({ length: 6 }, (_, index) => ({ id: `opinion-${index}`, position: index % 2 ? 'affirmative' : 'negative', nickname: '토론자', content: '토론을 위한 의견입니다.', key_reason: '검토할 근거', created_at: new Date().toISOString(), likes: 0 }));
  const rooms = [{ id: 'preview-room', room_id: 'preview-room', topic: '학교 수업에서 생성형 AI 활용을 허용해야 하는가?', topic_description: '학생의 학습 자율성과 공정한 평가 기준을 함께 검토합니다.', host_name: '생각하는 학생', created_at: new Date().toISOString(), status: 'open', audience: 'public', time_limit: 900, participant_count: 2, team_size: 3, voice_enabled: true, allow_moderator: true, debate_level: 'intermediate', language: 'ko' }];
  const data = url.pathname.includes('community_opinions') ? opinions : url.pathname.includes('get_homepage_debate_topics') ? { topics: [], managedKinds: [] } : url.pathname.includes('live_debate_rooms') ? rooms : [];
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const user = { id: 'preview-user', email: 'preview@example.test', nickname: '생각하는 학생', isAnonymous: false };
function Preview() {
  const [authOpen, setAuthOpen] = useState(false);
  const query = new URLSearchParams(location.search);
  const page = query.get('page') ?? 'gateway';
  if (page === 'app') return <MemoryRouter initialEntries={[query.get('route') ?? '/']}><App /></MemoryRouter>;
  return <div className="thinkfit-home home-route"><MemoryRouter initialEntries={[page === 'debate' ? '/debate' : page === 'simulation' ? '/simulation' : page === 'gate' ? '/gate' : '/']}>
    <Routes>
      <Route path="/" element={<TrainingGatewayPage user={query.has('member') ? user : null} onLoginRequest={() => setAuthOpen(true)} onGuestRequest={async () => { if (query.has('failGuest')) throw new Error('연결을 확인하고 다시 시도해 주세요.'); }} onLogout={() => {}} />} />
      <Route path="/debate" element={<LandingPage user={user} onLoginRequest={() => setAuthOpen(true)} onLogout={() => {}} onUserUpdate={() => {}} />} />
      <Route path="/simulation" element={<SimulationHubPage user={user} onLoginRequest={() => setAuthOpen(true)} />} />
      <Route path="/gate" element={<AuthenticatedRoute user={null} onLoginRequest={() => setAuthOpen(true)} onGuestRequest={async () => {}}><span>훈련장</span></AuthenticatedRoute>} />
    </Routes>
    {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onAuthenticated={() => {}} language="ko" />}
  </MemoryRouter></div>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
