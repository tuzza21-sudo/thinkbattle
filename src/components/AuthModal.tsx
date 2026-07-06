import React, { useState } from 'react';
import { LogIn, UserPlus, X } from 'lucide-react';
import { signInWithEmail, signUpWithEmail, signInWithKakao, signInWithGoogle } from '../lib/auth';
import type { AppUser } from '../types';

interface AuthModalProps {
  onClose: () => void;
  onAuthenticated: (user: AppUser) => void;
}

const KakaoIcon: React.FC = () => (
  <svg 
    width="18" 
    height="18" 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path 
      fillRule="evenodd" 
      clipRule="evenodd" 
      d="M12 3C6.477 3 2 6.48 2 10.77c0 2.51 1.54 4.74 3.91 5.99l-.99 3.63c-.12.44.15.42.24.36.09-.06 1.54-1.02 2.14-1.42.85.22 1.76.34 2.7.34 5.523 0 10-3.48 10-7.77S17.523 3 12 3z" 
      fill="#191919"
    />
  </svg>
);

const GoogleIcon: React.FC = () => (
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path 
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" 
      fill="#4285F4"
    />
    <path 
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" 
      fill="#34A853"
    />
    <path 
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" 
      fill="#FBBC05"
    />
    <path 
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" 
      fill="#EA4335"
    />
  </svg>
);

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');

  const [loading, setLoading] = useState(false);
  const isSignup = mode === 'signup';

  const handleModeChange = (newMode: 'login' | 'signup') => {
    setMode(newMode);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setNickname('');
  };

  const handleKakaoLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithKakao();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : '카카오 로그인에 실패했습니다.');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : '구글 로그인에 실패했습니다.');
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError('');

    if (isSignup) {
      if (!nickname.trim()) {
        setError('닉네임을 입력해 주세요.');
        return;
      }
      if (password !== confirmPassword) {
        setError('비밀번호가 일치하지 않습니다.');
        return;
      }
      if (password.length < 6) {
        setError('비밀번호는 최소 6자리 이상이어야 합니다.');
        return;
      }
    }

    setLoading(true);

    try {
      const user = isSignup
        ? await signUpWithEmail(email, password, nickname)
        : await signInWithEmail(email, password);
      onAuthenticated(user);
      onClose();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : '인증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content auth-modal">
        <div className="flex justify-between items-center">
          <div>
            <h2 style={{ color: 'var(--primary)', fontSize: '1.6rem', margin: 0 }}>
              {isSignup ? '회원가입' : '로그인'}
            </h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              토론 기록과 최종 보고서를 계정에 저장합니다.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="segmented-control">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => handleModeChange('login')}>
            <LogIn size={16} /> 로그인
          </button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => handleModeChange('signup')}>
            <UserPlus size={16} /> 가입
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {isSignup && (
            <label className="form-field">
              <span>닉네임</span>
              <input value={nickname} onChange={event => setNickname(event.target.value)} placeholder="토론자 이름" />
            </label>
          )}
          <label className="form-field">
            <span>이메일</span>
            <input value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" type="email" />
          </label>
          <label className="form-field">
            <span>비밀번호</span>
            <input value={password} onChange={event => setPassword(event.target.value)} placeholder="비밀번호" type="password" />
          </label>
          {isSignup && (
            <label className="form-field">
              <span>비밀번호 확인</span>
              <input value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="비밀번호 확인" type="password" />
            </label>
          )}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="social-login-row">
          <button 
            className="btn btn-secondary" 
            onClick={handleKakaoLogin}
            disabled={loading}
            style={{ 
              backgroundColor: '#FEE500', 
              color: '#191919', 
              border: 'none',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            <KakaoIcon />
            <span>카카오 로그인</span>
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{ 
              backgroundColor: '#FFFFFF', 
              color: '#374151', 
              border: '1px solid #D1D5DB',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
          >
            <GoogleIcon />
            <span>구글 로그인</span>
          </button>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', padding: '1rem' }} onClick={handleSubmit} disabled={loading}>
          {loading ? '처리 중...' : (isSignup ? '계정 만들기' : '로그인하기')}
        </button>
      </div>
    </div>
  );
};
