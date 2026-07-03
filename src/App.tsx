import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LandingPage } from './components/LandingPage';
import { Arena } from './components/Arena';
import { AuthModal } from './components/AuthModal';
import { HistoryPage } from './components/HistoryPage';
import { AboutPage } from './components/AboutPage';
import { getCurrentUser, signOut } from './lib/auth';
import type { AppUser } from './types';

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
            />
          )}
        />
        <Route path="/battle/new" element={<Arena user={user} onLoginRequest={() => setShowAuthModal(true)} />} />
        <Route path="/history" element={<HistoryPage user={user} onLoginRequest={() => setShowAuthModal(true)} />} />
        <Route path="/about" element={<AboutPage />} />
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
