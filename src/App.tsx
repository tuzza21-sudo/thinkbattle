import { lazy, Suspense, useState, useEffect } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import './App.css';
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { SUPER_ADMIN_EMAIL } from './lib/superAdmin';
import { getCurrentUser, signOut } from './lib/auth';
import type { AppLanguage, AppUser } from './types';

const LiveDebateRoom = lazy(async () => {
  const module = await import('./components/LiveDebateRoom');
  return { default: module.LiveDebateRoom };
});

const DebateLobbyPage = lazy(async () => {
  const module = await import('./components/DebateLobbyPage');
  return { default: module.DebateLobbyPage };
});

const EnglishLandingPage = lazy(async () => ({ default: (await import('./components/EnglishLandingPage')).EnglishLandingPage }));
const Arena = lazy(async () => ({ default: (await import('./components/Arena')).Arena }));
const HistoryPage = lazy(async () => ({ default: (await import('./components/HistoryPage')).HistoryPage }));
const AboutPage = lazy(async () => ({ default: (await import('./components/AboutPage')).AboutPage }));
const SharedReportPage = lazy(async () => ({ default: (await import('./components/SharedReportPage')).SharedReportPage }));
const ArgumentLibraryPage = lazy(async () => ({ default: (await import('./components/ArgumentLibraryPage')).ArgumentLibraryPage }));
const AdminDashboard = lazy(async () => ({ default: (await import('./components/AdminDashboard')).AdminDashboard }));
const SuperAdminDashboard = lazy(async () => ({ default: (await import('./components/SuperAdminDashboard')).SuperAdminDashboard }));
const InstitutionTopicsPage = lazy(async () => ({ default: (await import('./components/InstitutionTopicsPage')).InstitutionTopicsPage }));
const B2BMarketingPage = lazy(async () => ({ default: (await import('./components/B2BMarketingPage')).B2BMarketingPage }));
const B2BMarketingV2Page = lazy(async () => ({ default: (await import('./components/B2BMarketingV2Page')).B2BMarketingV2Page }));
const SimulationHubPage = lazy(async () => ({ default: (await import('./components/SimulationHubPage')).SimulationHubPage }));
const SimulationSessionPage = lazy(async () => ({ default: (await import('./components/SimulationSessionPage')).SimulationSessionPage }));
const LegalPage = lazy(async () => ({ default: (await import('./components/LegalPage')).LegalPage }));

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>(() => localStorage.getItem('app-language') === 'en' ? 'en' : 'ko');

  const changeLanguage = (nextLanguage: AppLanguage) => {
    setLanguage(nextLanguage);
    localStorage.setItem('app-language', nextLanguage);
    document.documentElement.lang = nextLanguage;
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('app-theme', 'dark');
    document.documentElement.lang = language;
  }, [language]);

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
      <Suspense fallback={<div className="app-container live-login-gate">화면을 준비하고 있습니다...</div>}>
      <Routes>
        <Route
          path="/"
          element={(
            language === 'en' ? (
              <EnglishLandingPage
                user={user}
                onLoginRequest={() => setShowAuthModal(true)}
                onLogout={handleLogout}
                onLanguageChange={changeLanguage}
              />
            ) : (
              <LandingPage
                user={user}
                onLoginRequest={() => setShowAuthModal(true)}
                onLogout={handleLogout}
                onUserUpdate={setUser}
                onLanguageChange={changeLanguage}
              />
            )
          )}
        />
        <Route path="/battle/new" element={user ? <Arena user={user} onLoginRequest={() => setShowAuthModal(true)} /> : <Navigate to="/" replace />} />
        <Route
          path="/battle/lobby/:roomId"
          element={(
            <DebateLobbyPage user={user} onLoginRequest={() => setShowAuthModal(true)} />
          )}
        />
        <Route
          path="/battle/live/:roomId"
          element={(
            <LiveDebateRoom user={user} onLoginRequest={() => setShowAuthModal(true)} />
          )}
        />
        <Route path="/history" element={<HistoryPage user={user} onLoginRequest={() => setShowAuthModal(true)} />} />
        <Route path="/report/:shareId" element={<SharedReportPage />} />
        <Route path="/argument-library" element={<ArgumentLibraryPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/institution" element={<InstitutionTopicsPage user={user} onLoginRequest={() => setShowAuthModal(true)} />} />
        <Route path="/institution/marketing" element={<B2BMarketingPage />} />
        <Route path="/institution/marketing-v2" element={<B2BMarketingV2Page />} />
        <Route path="/simulation" element={<SimulationHubPage user={user} onLoginRequest={() => setShowAuthModal(true)} />} />
        <Route path="/simulation/:missionId" element={user ? <SimulationSessionPage user={user} /> : <Navigate to="/simulation" replace />} />
        <Route path="/admin" element={user ? <AdminDashboard /> : <Navigate to="/" replace />} />
        <Route path="/super-admin" element={user?.email.toLowerCase() === SUPER_ADMIN_EMAIL ? <SuperAdminDashboard /> : <Navigate to="/" replace />} />
      </Routes>
      </Suspense>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={setUser}
          language={language}
        />
      )}
    </>
  );
}

export default App;
