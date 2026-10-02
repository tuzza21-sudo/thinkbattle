import React, { useState } from 'react';
import { ArrowRight, LoaderCircle, LogIn, Mail, UserPlus } from 'lucide-react';
import { signInWithEmail, signUpWithEmail, signInWithKakao, signInWithGoogle, EmailConfirmationRequiredError } from '../lib/auth';
import type { AppUser } from '../types';
import { AvatarPhotoInput, LoungeAvatarEditor } from './LoungeAvatarEditor';
import { LoungeAccountDialog } from './LoungeAccountDialog';

interface AuthModalProps {
  onClose: () => void;
  onAuthenticated: (user: AppUser) => void;
  initialError?: string | null;
  initialMode?: 'login' | 'signup';
  context?: 'lounge' | 'training';
  language?: 'ko' | 'en';
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

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onAuthenticated, initialError = null, initialMode = 'login', context = 'training', language = 'ko' }) => {
  const isEnglish = language === 'en';
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState(initialError || '');

  const [loading, setLoading] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [createdUser, setCreatedUser] = useState<AppUser | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const isSignup = mode === 'signup';

  const handleModeChange = (newMode: 'login' | 'signup') => {
    setMode(newMode);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setNickname('');
    setAcceptedTerms(false);
    setPhoto(null);
    setConfirmationSent(false);
  };

  const handleKakaoLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithKakao();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : isEnglish ? 'Kakao login failed.' : '카카오 로그인에 실패했습니다.');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : isEnglish ? 'Google login failed.' : '구글 로그인에 실패했습니다.');
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (loading) return;
    setError('');

    if (isSignup) {
      if (!nickname.trim()) {
        setError(isEnglish ? 'Please enter a display name.' : '닉네임을 입력해 주세요.');
        return;
      }
      if (password !== confirmPassword) {
        setError(isEnglish ? 'The passwords do not match.' : '비밀번호가 일치하지 않습니다.');
        return;
      }
      if (password.length < 6) {
        setError(isEnglish ? 'The password must contain at least six characters.' : '비밀번호는 최소 6자리 이상이어야 합니다.');
        return;
      }
      if (!acceptedTerms) {
        setError(isEnglish ? 'Please agree to the terms and privacy notice.' : '이용약관과 개인정보 처리 안내에 동의해 주세요.');
        return;
      }
    }

    setLoading(true);

    try {
      const user = isSignup
        ? await signUpWithEmail(email, password, nickname)
        : await signInWithEmail(email, password);
      if (isSignup && photo) setCreatedUser(user);
      else { onAuthenticated(user); onClose(); }
    } catch (authError) {
      if (authError instanceof EmailConfirmationRequiredError) setConfirmationSent(true);
      else setError(authError instanceof Error ? authError.message : isEnglish ? 'Authentication failed.' : '인증에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const finish = (user: AppUser) => { onAuthenticated(user); onClose(); };
  if (createdUser) return <LoungeAccountDialog title={isEnglish ? 'Make this seat yours' : '이제 나만의 얼굴을 더해요'} description={isEnglish ? 'Your account is ready. Review your portrait before joining the conversation.' : '가입이 완료됐어요. 사진으로 아바타를 만들거나, 지금은 가볍게 시작해도 좋아요.'} eyebrow="YOUR FIRST HELLO" onClose={() => finish(createdUser)} language={language} displayName={createdUser.nickname} avatarUrl={createdUser.loungeAvatarUrl}>
    <LoungeAvatarEditor user={createdUser} initialFile={photo} language={language} onSaved={finish} />
    <button type="button" className="avatar-text-button avatar-onboarding-skip" onClick={() => finish(createdUser)}>{isEnglish ? 'Set up later in my profile' : '나중에 프로필에서 만들기'}</button>
  </LoungeAccountDialog>;

  if (confirmationSent) return <LoungeAccountDialog title={isEnglish ? 'Check your email' : '가입 확인 메일을 보냈어요'} description={isEnglish ? 'One small step before your first conversation.' : '이메일을 확인하면, 첫 이야기를 시작할 수 있어요.'} eyebrow="ALMOST THERE" onClose={onClose} language={language}>
    <div className="lounge-account-status"><span className="lounge-account-mail-icon"><Mail size={26} /></span><p><strong>{email}</strong><br />{isEnglish ? 'Follow the link in your email, then log in. You can create your avatar in your profile. Your photo has not been uploaded.' : '메일의 인증 링크를 누른 뒤 로그인해 주세요. 아바타는 프로필에서 만들 수 있어요. 첨부한 사진은 아직 전송하지 않았어요.'}</p>
      <button type="button" className="btn btn-primary lounge-account-submit" onClick={() => handleModeChange('login')}>{isEnglish ? 'Back to login' : '로그인으로 돌아가기'}<ArrowRight size={17} /></button>
      <button type="button" className="avatar-text-button" onClick={onClose}>{isEnglish ? 'Close' : '지금은 닫기'}</button>
    </div>
  </LoungeAccountDialog>;

  return <LoungeAccountDialog
    title={isEnglish ? isSignup ? 'A seat for your story' : 'Good to see you again' : isSignup ? '당신의 이야기를 기다려요' : '다시 만나서 반가워요'}
    description={context === 'lounge' ? isEnglish ? 'Your own profile, your own voice. Make yourself at home.' : isSignup ? '나만의 이름으로, 편안한 대화에 함께해요.' : '내 이름과 목소리로, 이어지는 대화에 들어가요.' : isEnglish ? 'Continue with your account.' : '기존 계정으로 편하게 이어서 이용하세요.'}
    eyebrow={isSignup ? 'JOIN THE LOUNGE' : 'WELCOME BACK'} onClose={onClose} language={language}>
    <div className="segmented-control auth-mode-tabs" aria-label={isEnglish ? 'Account options' : '로그인과 회원가입'}>
      <button type="button" className={mode === 'login' ? 'active' : ''} aria-pressed={mode === 'login'} disabled={loading} onClick={() => handleModeChange('login')}><LogIn size={15} />{isEnglish ? 'Log in' : '로그인'}</button>
      <button type="button" className={mode === 'signup' ? 'active' : ''} aria-pressed={mode === 'signup'} disabled={loading} onClick={() => handleModeChange('signup')}><UserPlus size={15} />{isEnglish ? 'Sign up' : '회원가입'}</button>
    </div>
    <div className="social-login-row">
      <button type="button" className="lounge-social kakao" onClick={() => void handleKakaoLogin()} disabled={loading}><KakaoIcon />{isEnglish ? 'Kakao' : '카카오로 시작'}</button>
      <button type="button" className="lounge-social google" onClick={() => void handleGoogleLogin()} disabled={loading}><GoogleIcon />{isEnglish ? 'Google' : '구글로 시작'}</button>
    </div>
    <p className="social-legal-note">{isEnglish ? <>By continuing with a social account, you agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy notice</a>.</> : <>소셜 계정으로 시작하면 <a href="/terms" target="_blank" rel="noreferrer">이용약관</a>과 <a href="/privacy" target="_blank" rel="noreferrer">개인정보 처리 안내</a>에 동의합니다.</>}</p>
    <div className="lounge-account-divider">{isEnglish ? 'or with email' : '또는 이메일로'}</div>
    <form className="lounge-account-form" onSubmit={event => { event.preventDefault(); void handleSubmit(); }} aria-busy={loading}>
      {isSignup && <label className="form-field"><span>{isEnglish ? 'Display name' : '닉네임'}</span><input data-dialog-autofocus value={nickname} onChange={event => setNickname(event.target.value)} autoComplete="nickname" maxLength={20} required disabled={loading} placeholder={isEnglish ? 'What should we call you?' : '대화에서 불리고 싶은 이름'} /><small className="lounge-account-field-note">{isEnglish ? 'A name you feel comfortable with. Up to 20 characters.' : '실명 대신 편한 이름도 좋아요. 최대 20자.'}</small></label>}
      <label className="form-field"><span>{isEnglish ? 'Email' : '이메일'}</span><input data-dialog-autofocus={!isSignup || undefined} value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" type="email" required disabled={loading} /></label>
      <div className={isSignup ? 'lounge-account-passwords' : undefined}>
        <label className="form-field"><span>{isEnglish ? 'Password' : '비밀번호'}</span><input value={password} onChange={event => setPassword(event.target.value)} autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder={isEnglish ? isSignup ? 'At least 6 characters' : 'Your password' : isSignup ? '6자리 이상' : '비밀번호를 입력해 주세요'} type="password" required disabled={loading} /></label>
        {isSignup && <label className="form-field"><span>{isEnglish ? 'Confirm password' : '비밀번호 확인'}</span><input value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder={isEnglish ? 'Once more' : '한 번 더 입력'} type="password" required disabled={loading} /></label>}
      </div>
      {isSignup && <>
        <details className="lounge-account-photo-details"><summary>{isEnglish ? 'Bring your photo' : '나를 닮은 아바타로 만나기'}<span>{isEnglish ? 'optional' : '선택'}</span></summary><p className="avatar-signup-intro">{isEnglish ? 'Add a photo now and create your illustrated avatar after signup. You can also do this later.' : '사진을 첨부하면 가입 후 나를 닮은 아바타를 만들 수 있어요. 나중에 프로필에서 만들어도 괜찮아요.'}</p><AvatarPhotoInput file={photo} onChange={setPhoto} disabled={loading} language={language} /></details>
        <label className="legal-consent-check"><input type="checkbox" checked={acceptedTerms} disabled={loading} onChange={event => setAcceptedTerms(event.target.checked)} /><span>{isEnglish ? <>I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy notice</a>.</> : <><a href="/terms" target="_blank" rel="noreferrer">이용약관</a>과 <a href="/privacy" target="_blank" rel="noreferrer">개인정보 처리 안내</a>에 동의합니다.</>}</span></label>
      </>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="btn btn-primary lounge-account-submit" disabled={loading}>{loading ? <LoaderCircle size={17} className="lounge-spin" /> : null}{isEnglish ? loading ? 'Please wait…' : isSignup ? 'Create account' : 'Enter the lounge' : loading ? '잠시만 기다려 주세요…' : isSignup ? '내 자리 만들기' : '라운지에 들어가기'}{!loading && <ArrowRight size={17} />}</button>
    </form>
  </LoungeAccountDialog>;
};
