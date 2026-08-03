import { lazy, Suspense, useState, useEffect } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import { LandingPage } from './components/LandingPage';
import { Arena } from './components/Arena';
import { AuthModal } from './components/AuthModal';
import { HistoryPage } from './components/HistoryPage';
import { AboutPage } from './components/AboutPage';
import { SharedReportPage } from './components/SharedReportPage';
import { ArgumentLibraryPage } from './components/ArgumentLibraryPage';
import { AdminDashboard } from './components/AdminDashboard';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { InstitutionTopicsPage } from './components/InstitutionTopicsPage';
import { B2BMarketingPage } from './components/B2BMarketingPage';
import { SUPER_ADMIN_EMAIL } from './lib/superAdmin';
import { getCurrentUser, signOut } from './lib/auth';
import type { AppUser } from './types';

const LiveDebateRoom = lazy(async () => {
  const module = await import('./components/LiveDebateRoom');
  return { default: module.LiveDebateRoom };
});

const DebateLobbyPage = lazy(async () => {
  const module = await import('./components/DebateLobbyPage');
  return { default: module.DebateLobbyPage };
});

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('app-theme', 'dark');
  }, []);

  useEffect(() => {
    getCurrentUser()
      .then(u => setUser(u))
      .catch(err => {
        console.error('Auth initialization error:', err);
        setUser(null);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogout = async () => {
    await signOut();
    setUser(null);
  };

  if (authLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={(
            <LandingPage
              user={user}
              onLoginRequest={() => setShowAuthModal(true)}
              onLogout={handleLogout}
              onUserUpdate={setUser}
            />
          )}
        />
        <Route path="/battle/new" element={user ? <Arena user={user} onLoginRequest={() => setShowAuthModal(true)} /> : <Navigate to="/" replace />} />
        <Route
          path="/battle/lobby/:roomId"
          element={(
            <Suspense fallback={<div className="app-container live-login-gate">토론 대기실을 준비하고 있습니다...</div>}>
              <DebateLobbyPage user={user} onLoginRequest={() => setShowAuthModal(true)} />
            </Suspense>
          )}
        />
        <Route
          path="/battle/live/:roomId"
          element={(
            <Suspense fallback={<div className="app-container live-login-gate">음성 토론방을 준비하고 있습니다...</div>}>
              <LiveDebateRoom user={user} onLoginRequest={() => setShowAuthModal(true)} />
            </Suspense>
          )}
        />
        <Route path="/history" element={<HistoryPage user={user} onLoginRequest={() => setShowAuthModal(true)} />} />
        <Route path="/report/:shareId" element={<SharedReportPage />} />
        <Route path="/argument-library" element={<ArgumentLibraryPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/institution" element={<InstitutionTopicsPage user={user} onLoginRequest={() => setShowAuthModal(true)} />} />
        <Route path="/institution/marketing" element={<B2BMarketingPage />} />
        <Route path="/admin" element={user ? <AdminDashboard /> : <Navigate to="/" replace />} />
        <Route path="/super-admin" element={user?.email.toLowerCase() === SUPER_ADMIN_EMAIL ? <SuperAdminDashboard /> : <Navigate to="/" replace />} />
      </Routes>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={setUser}
        />
      )}
    </>
  );
}

export default App;
