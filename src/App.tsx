import { lazy, Suspense, useState, useEffect } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import './App.css';
import { TrainingGatewayPage } from './components/TrainingGatewayPage';
import { AuthModal } from './components/AuthModal';
import { SUPER_ADMIN_EMAIL } from './lib/superAdmin';
import {
  clearOAuthCallbackError,
  getCurrentUser,
  getOAuthCallbackError,
  signOut,
  subscribeToAuthChanges,
} from './lib/auth';
import type { AppUser } from './types';

const LiveDebateRoom = lazy(async () => {
  const module = await import('./components/LiveDebateRoom');
  return { default: module.LiveDebateRoom };
});

const DebateLobbyPage = lazy(async () => {
  const module = await import('./components/DebateLobbyPage');
  return { default: module.DebateLobbyPage };
});

const LandingPage = lazy(async () => ({ default: (await import('./components/LandingPage')).LandingPage }));
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
const PersonalTrainingPage = lazy(async () => ({ default: (await import('./components/PersonalTrainingPage')).PersonalTrainingPage }));
const LegalPage = lazy(async () => ({ default: (await import('./components/LegalPage')).LegalPage }));

function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [oauthError, setOAuthError] = useState<string | null>(() => getOAuthCallbackError());
  const [showAuthModal, setShowAuthModal] = useState(() => Boolean(oauthError));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('app-theme', 'dark');
    localStorage.setItem('app-language', 'ko');
    document.documentElement.lang = 'ko';
  }, []);

  useEffect(() => {
    let active = true;
    let syncSequence = 0;

    const syncCurrentUser = async () => {
      const sequence = ++syncSequence;
      try {
        const currentUser = await getCurrentUser();
        if (active && sequence === syncSequence) setUser(currentUser);
      } catch (error) {
        console.error('Auth synchronization error:', error);
        if (active && sequence === syncSequence) setUser(null);
      } finally {
        if (active && sequence === syncSequence) setAuthLoading(false);
      }
    };

    const subscription = subscribeToAuthChanges((event, session) => {
      if (event === 'SIGNED_OUT') {
        syncSequence += 1;
        setUser(null);
        setAuthLoading(false);
        return;
      }

      if (event === 'INITIAL_SESSION' && !session) {
        setUser(null);
        setAuthLoading(false);
        return;
      }

      if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        // Supabase advises deferring follow-up auth calls outside its state-change callback.
        window.setTimeout(() => {
          if (active) void syncCurrentUser();
        }, 0);
      }
    });

    if (oauthError) clearOAuthCallbackError();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [oauthError]);

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
          element={<TrainingGatewayPage user={user} onLoginRequest={() => setShowAuthModal(true)} onLogout={handleLogout} />}
        />
        <Route
          path="/debate"
          element={<LandingPage user={user} onLoginRequest={() => setShowAuthModal(true)} onLogout={handleLogout} onUserUpdate={setUser} />}
        />
        <Route path="/battle/new" element={user ? <Arena user={user} onLoginRequest={() => setShowAuthModal(true)} /> : <Navigate to="/debate" replace />} />
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
        <Route path="/simulation/personalize" element={user ? <PersonalTrainingPage user={user} /> : <Navigate to="/simulation" replace />} />
        <Route path="/simulation/:missionId" element={user ? <SimulationSessionPage user={user} /> : <Navigate to="/simulation" replace />} />
        <Route path="/admin" element={user ? <AdminDashboard /> : <Navigate to="/" replace />} />
        <Route path="/super-admin" element={user?.email.toLowerCase() === SUPER_ADMIN_EMAIL ? <SuperAdminDashboard /> : <Navigate to="/" replace />} />
      </Routes>
      </Suspense>

      {showAuthModal && (
        <AuthModal
          onClose={() => {
            setShowAuthModal(false);
            setOAuthError(null);
          }}
          onAuthenticated={authenticatedUser => {
            setUser(authenticatedUser);
            setOAuthError(null);
          }}
          initialError={oauthError}
          language="ko"
        />
      )}
    </>
  );
}

export default App;
