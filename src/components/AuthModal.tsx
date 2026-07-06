import React, { useState } from 'react';
import { LogIn, UserPlus, X } from 'lucide-react';
import { signInWithEmail, signUpWithEmail, signInWithKakao } from '../lib/auth';
import type { AppUser } from '../types';

interface AuthModalProps {
  onClose: () => void;
  onAuthenticated: (user: AppUser) => void;
}

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
            className="btn btn-secondary flex items-center justify-center gap-2" 
            onClick={handleKakaoLogin}
            disabled={loading}
            style={{ 
              backgroundColor: '#FEE500', 
              color: '#191919', 
              border: 'none',
              fontWeight: 'bold' 
            }}
          >
            카카오 로그인
          </button>
          <button className="btn btn-secondary" disabled>구글 로그인 준비 중</button>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', padding: '1rem' }} onClick={handleSubmit} disabled={loading}>
          {loading ? '처리 중...' : (isSignup ? '계정 만들기' : '로그인하기')}
        </button>
      </div>
    </div>
  );
};
