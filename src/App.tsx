import { lazy, Suspense, useCallback, useState, useEffect, type ReactNode } from 'react';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import './App.css';
import './components/HomeStudio.css';
import './components/ServiceStudio.css';
import { TrainingGatewayPage } from './components/TrainingGatewayPage';
import { AuthModal } from './components/AuthModal';
import { AuthenticatedRoute } from './components/AuthenticatedRoute';
import { SUPER_ADMIN_EMAIL } from './lib/superAdmin';
import {
  clearOAuthCallbackError,
  getCurrentUser,
  getOAuthCallbackError,
  signInAsGuest,
  signOut,
  subscribeToAuthChanges,
} from './lib/auth';
import type { AppUser } from './types';

const LiveDebateRoom = lazy(async () => {
  const module = await import('./components/LiveDebateRouter');
  return { default: module.LiveDebateRouter };
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
  const { pathname } = useLocation();
  const normalizedPath = pathname.replace(/\/$/, '') || '/';
  const isHomeRoute = ['/', '/debate', '/about', '/simulation'].includes(normalizedPath)
    || normalizedPath.startsWith('/simulation/')
    || normalizedPath.startsWith('/battle/lobby/');
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

  const requestLogin = useCallback(() => setShowAuthModal(true), []);
  const requestGuest = useCallback(async () => {
    const guestUser = await signInAsGuest();
    setUser(guestUser);
  }, []);
  const requireAuth = (content: ReactNode, allowGuest = true) => (
    <AuthenticatedRoute user={user} onLoginRequest={requestLogin} onGuestRequest={requestGuest} allowGuest={allowGuest}>
      {content}
    </AuthenticatedRoute>
  );

  if (authLoading) {
    return <div className={isHomeRoute ? 'thinkfit-home home-route' : undefined} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--text-muted)' }}>화면을 준비하고 있습니다...</div>;
  }

  return (
    <div className={isHomeRoute ? 'thinkfit-home home-route' : undefined} style={isHomeRoute ? undefined : { display: 'contents' }}>
      <Suspense fallback={<div className="app-container live-login-gate">화면을 준비하고 있습니다...</div>}>
      <Routes>
        <Route
          path="/"
          element={<TrainingGatewayPage user={user} onLoginRequest={requestLogin} onGuestRequest={requestGuest} onLogout={handleLogout} />}
        />
        <Route
          path="/debate"
          element={requireAuth(<LandingPage user={user} onLoginRequest={requestLogin} onLogout={handleLogout} onUserUpdate={setUser} />)}
        />
        <Route path="/battle/new" element={requireAuth(user ? <Arena user={user} onLoginRequest={requestLogin} /> : null)} />
        <Route
          path="/battle/lobby/:roomId"
          element={requireAuth(<DebateLobbyPage user={user} onLoginRequest={requestLogin} />)}
        />
        <Route
          path="/battle/live/:roomId"
          element={requireAuth(<LiveDebateRoom user={user} onLoginRequest={requestLogin} />)}
        />
        <Route path="/history" element={requireAuth(<HistoryPage user={user} onLoginRequest={requestLogin} />)} />
        <Route path="/report/:shareId" element={<SharedReportPage />} />
        <Route path="/argument-library" element={requireAuth(<ArgumentLibraryPage />)} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/institution" element={requireAuth(<InstitutionTopicsPage user={user} onLoginRequest={requestLogin} />, false)} />
        <Route path="/institution/marketing" element={<B2BMarketingPage />} />
        <Route path="/institution/marketing-v2" element={<B2BMarketingV2Page />} />
        <Route path="/simulation" element={requireAuth(<SimulationHubPage user={user} onLoginRequest={requestLogin} />)} />
        <Route path="/simulation/personalize" element={requireAuth(user ? <PersonalTrainingPage user={user} /> : null)} />
        <Route path="/simulation/:missionId" element={requireAuth(user ? <SimulationSessionPage user={user} /> : null)} />
        <Route path="/admin" element={requireAuth(<AdminDashboard />, false)} />
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
    </div>
  );
}

export default App;
