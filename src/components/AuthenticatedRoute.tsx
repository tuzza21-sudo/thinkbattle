import { useState, type ReactNode } from 'react';
import { LockKeyhole, LogIn, UserRound } from 'lucide-react';
import type { AppUser } from '../types';

interface AuthenticatedRouteProps {
  user: AppUser | null;
  onLoginRequest: () => void;
  onGuestRequest: () => Promise<void>;
  allowGuest?: boolean;
  children: ReactNode;
}

export const AuthenticatedRoute = ({ user, onLoginRequest, onGuestRequest, allowGuest = true, children }: AuthenticatedRouteProps) => {
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState('');

  const startGuestExperience = async () => {
    if (guestLoading) return;
    setGuestLoading(true);
    setGuestError('');
    try {
      await onGuestRequest();
    } catch (error) {
      setGuestError(error instanceof Error ? error.message : '게스트 체험을 시작하지 못했습니다.');
    } finally {
      setGuestLoading(false);
    }
  };

  if (user && (allowGuest || !user.isAnonymous)) return children;

  return (
    <div className="app-container live-login-gate">
      <div className="live-gate-card">
        <LockKeyhole size={38} />
        <h1>{allowGuest ? '로그인하거나 무료로 체험해 보세요' : '회원 계정이 필요한 서비스입니다'}</h1>
        <p>{allowGuest ? '게스트는 토론과 페르소나 훈련을 각각 하루 1회 이용할 수 있습니다.' : '회원가입 또는 로그인 후 이 서비스를 이용할 수 있습니다.'}</p>
        {allowGuest && guestError && <div className="form-error">{guestError}</div>}
        {allowGuest && (
          <button type="button" className="btn btn-primary" onClick={() => void startGuestExperience()} disabled={guestLoading}>
            <UserRound size={18} /> {guestLoading ? '게스트 준비 중...' : '게스트로 하루 1회 체험'}
          </button>
        )}
        <button type="button" className={allowGuest ? 'btn btn-secondary' : 'btn btn-primary'} onClick={onLoginRequest}>
          <LogIn size={18} /> 회원가입 · 로그인
        </button>
      </div>
    </div>
  );
};
