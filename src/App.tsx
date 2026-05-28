import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { LandingPage } from './components/LandingPage';
import { Arena } from './components/Arena';
import { AuthModal } from './components/AuthModal';
import { HistoryPage } from './components/HistoryPage';
import { getCurrentUser, signOut } from './lib/auth';
import type { AppUser } from './types';

function App() {
  const [user, setUser] = useState<AppUser | null>(() => getCurrentUser());
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleLogout = () => {
    signOut();
    setUser(null);
  };

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
