import { useState } from 'react';
import { ArrowRight, BookOpen, BrainCircuit, BriefcaseBusiness, Lightbulb, LogIn, LogOut, MessageSquareText, Sparkles, Swords, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';
import './HomeStudio.css';

interface TrainingGatewayPageProps {
  user: AppUser | null;
  onLoginRequest: () => void;
  onGuestRequest: () => Promise<void>;
  onLogout: () => void;
}

const trainingOptions = [
  {
    id: 'debate',
    eyebrow: 'DEBATE STUDIO',
    title: '토론 훈련',
    description: '내 주장을 세우고, 상대의 반론에 응답하세요. AI 코치와 함께 생각의 방향을 찾아갈 수 있습니다.',
    path: '/debate',
    image: '/gateway/debate-training.jpg',
    icon: Swords,
    featureIcon: BrainCircuit,
    feature: 'AI 스파링 · Thinking Coach · 실시간 토론',
  },
  {
    id: 'persona',
    eyebrow: 'REAL-WORLD SIMULATION',
    title: '페르소나 상황극',
    description: '면접, 협상, 직장 속 대화를 미리 연습하세요. 내 상황에 맞는 상대와 말하며 대응력을 기릅니다.',
    path: '/simulation',
    image: '/gateway/persona-training.jpg',
    icon: BriefcaseBusiness,
    featureIcon: Target,
    feature: '맞춤 시나리오 · 음성 대화 · 행동 피드백',
  },
] as const;

export const TrainingGatewayPage = ({ user, onLoginRequest, onGuestRequest, onLogout }: TrainingGatewayPageProps) => {
  const navigate = useNavigate();
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState('');

  const openTraining = async (path: string) => {
    if (!user) {
      if (guestLoading) return;
      setGuestLoading(true);
      setGuestError('');
      try {
        await onGuestRequest();
        setGuestLoading(false);
      } catch (error) {
        setGuestError(error instanceof Error ? error.message : '게스트 체험을 시작하지 못했습니다.');
        setGuestLoading(false);
        return;
      }
    }
    navigate(path);
  };

  return (
    <div className="training-gateway thinkfit-home">
      <header className="training-gateway-header">
        <div className="training-gateway-brand">
          <span><img src="/brand/thinkfit-mark.svg" alt="" /></span>
          <div><strong>ThinkFit</strong><small>THINK · SPEAK · GROW</small></div>
        </div>
        <nav className="home-gateway-nav" aria-label="메인 메뉴"><a href="#training-options">훈련 둘러보기</a><button type="button" onClick={() => navigate('/about')}>서비스 소개</button>{user && <button type="button" onClick={() => navigate('/history')}>훈련 기록</button>}</nav>
        <div className="training-gateway-account">
          {user ? (
            <>
              <span><small>{user.isAnonymous ? '무료 체험 중' : '반갑습니다'}</small><strong>{user.nickname}님</strong></span>
              {user.isAnonymous && <button type="button" onClick={onLoginRequest}><LogIn size={17} /> 회원가입 · 로그인</button>}
              {!user.isAnonymous && <button type="button" onClick={onLogout} aria-label="로그아웃"><LogOut size={17} /> 로그아웃</button>}
            </>
          ) : (
            <button type="button" onClick={onLoginRequest}><LogIn size={17} /> 로그인</button>
          )}
        </div>
      </header>

      <main className="training-gateway-main">
        <div className="home-welcome">
          <section className="training-gateway-intro">
            <span><Sparkles size={14} /> YOUR DAILY THINKING STUDIO</span>
            <h1>생각의 힘을,<br /><em>매일 조금 더.</em></h1>
            <p>생각을 정리하고, 내 언어로 말하고, 새로운 관점을 만나세요.<br />한 번의 대화가 다음의 나를 조금 더 단단하게 만듭니다.</p>
            <a className="home-explore-link" href="#training-options">나에게 맞는 훈련 찾기 <ArrowRight size={16} /></a>
          </section>
          <aside className="home-thinking-note">
            <div className="home-thinking-note-label"><Lightbulb size={17} /> THINKING STARTS HERE</div>
            <p>“왜 그렇게 생각하나요?”</p>
            <span>좋은 질문 하나에서,<br />더 깊은 생각이 시작됩니다.</span>
            <div className="home-thinking-path"><span><b>01</b>생각하고</span><ArrowRight size={14} /><span><b>02</b>표현하고</span><ArrowRight size={14} /><span><b>03</b>돌아보기</span></div>
          </aside>
        </div>

        <div className="home-section-heading" id="training-options"><div><span>CHOOSE YOUR PRACTICE</span><h2>오늘의 훈련을 골라보세요</h2></div><p>두 가지 방식으로 넓히는 생각과 표현의 힘</p></div>
        {guestError && <p className="home-guest-error" role="alert">{guestError}</p>}
        <section className="training-gateway-options" aria-label="훈련 선택">
          {trainingOptions.map(option => {
            const Icon = option.icon;
            const FeatureIcon = option.featureIcon;
            return (
              <button
                type="button"
                key={option.id}
                className={`training-gateway-card ${option.id}`}
                onClick={() => void openTraining(option.path)}
                disabled={guestLoading}
                aria-label={`${option.title} 시작하기`}
              >
                <img src={option.image} alt="" aria-hidden="true" />
                <span className="training-gateway-card-content">
                  <span className="training-gateway-card-top"><i><Icon size={19} /></i>{option.eyebrow}</span>
                  <span className="training-gateway-card-copy">
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                  <span className="training-gateway-card-bottom">
                    <span><FeatureIcon size={16} /> {option.feature}</span>
                    <b>{!user && guestLoading ? '게스트 준비 중...' : !user ? '게스트 무료 체험' : '시작하기'} <ArrowRight size={18} /></b>
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        <div className="training-gateway-note"><MessageSquareText size={15} /> 모든 훈련은 한국어로 진행됩니다.</div>
        <section className="home-practice-principles" aria-label="ThinkFit의 훈련 방식">
          <article><Lightbulb size={20} /><div><h3>생각할 방향을 발견하고</h3><p>토론의 주장 씨앗과 사고 질문으로 첫 문장의 막막함을 줄여보세요.</p></div></article>
          <article><MessageSquareText size={20} /><div><h3>내 언어로 직접 말하고</h3><p>글이나 목소리로 내 생각을 표현하고, 상대의 관점에 응답하세요.</p></div></article>
          <article><BookOpen size={20} /><div><h3>대화에서 다음을 배우세요</h3><p>훈련 후 피드백을 읽고, 다음 대화에서 시도할 한 가지를 찾아보세요.</p></div></article>
        </section>
      </main>

      <footer className="training-gateway-footer">
        <div className="training-gateway-footer-brand">
          <img src="/brand/thinkfit-mark.svg" alt="" />
          <div><strong>ThinkFit</strong><span>생각과 대응을 단련하는 AI 훈련소</span></div>
        </div>
        <div className="training-gateway-footer-info">
          <p><span>대표</span> 최석빈 <i /> <span>사업자등록번호</span> 218-14-16906</p>
          <p><span>주소</span> 서울시 서초구 사임당로8길 13, 4층 402-331A호</p>
          <p><span>문의</span> <a href="mailto:thinkfit99@gmail.com">thinkfit99@gmail.com</a></p>
        </div>
        <div className="training-gateway-footer-links">
          <button type="button" onClick={() => navigate('/terms')}>이용약관</button>
          <button type="button" onClick={() => navigate('/privacy')}>개인정보 처리 안내</button>
          <span>© 2026 ThinkFit</span>
        </div>
      </footer>
    </div>
  );
};
