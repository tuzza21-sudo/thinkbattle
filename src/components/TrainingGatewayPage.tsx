import { ArrowRight, BrainCircuit, BriefcaseBusiness, LogIn, LogOut, MessageSquareText, Sparkles, Swords, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppUser } from '../types';

interface TrainingGatewayPageProps {
  user: AppUser | null;
  onLoginRequest: () => void;
  onLogout: () => void;
}

const trainingOptions = [
  {
    id: 'debate',
    eyebrow: 'THINKING ARENA',
    title: '토론 훈련',
    description: '주장을 세우고 반론을 검증하며, 생각을 논리적으로 끝까지 밀어붙이는 훈련',
    path: '/debate',
    image: '/gateway/debate-training.jpg',
    icon: Swords,
    featureIcon: BrainCircuit,
    feature: 'AI 스파링 · 실시간 토론 · 논증 리포트',
  },
  {
    id: 'persona',
    eyebrow: 'REAL-WORLD SIMULATION',
    title: '페르소나 상황극',
    description: '면접·협상·영업·직장 상황 속 인물과 대화하며, 실제 대응력을 단련하는 훈련',
    path: '/simulation',
    image: '/gateway/persona-training.jpg',
    icon: BriefcaseBusiness,
    featureIcon: Target,
    feature: '맞춤 시나리오 · 음성 대화 · 행동 피드백',
  },
] as const;

export const TrainingGatewayPage = ({ user, onLoginRequest, onLogout }: TrainingGatewayPageProps) => {
  const navigate = useNavigate();

  return (
    <div className="training-gateway">
      <header className="training-gateway-header">
        <div className="training-gateway-brand">
          <span><img src="/brand/thinkfit-mark.svg" alt="" /></span>
          <div><strong>ThinkFit</strong><small>생각과 대응을 단련하는 AI 훈련소</small></div>
        </div>
        <div className="training-gateway-account">
          {user ? (
            <>
              <span><small>반갑습니다</small><strong>{user.nickname}님</strong></span>
              <button type="button" onClick={onLogout} aria-label="로그아웃"><LogOut size={17} /> 로그아웃</button>
            </>
          ) : (
            <button type="button" onClick={onLoginRequest}><LogIn size={17} /> 로그인</button>
          )}
        </div>
      </header>

      <main className="training-gateway-main">
        <section className="training-gateway-intro">
          <span><Sparkles size={15} /> CHOOSE YOUR TRAINING</span>
          <h1>오늘은 어떤 능력을<br /><em>단련하시겠어요?</em></h1>
          <p>논리로 겨루거나, 실제 인물과 마주하세요. 두 훈련은 독립적으로 시작하고 기록할 수 있습니다.</p>
        </section>

        <section className="training-gateway-options" aria-label="훈련 선택">
          {trainingOptions.map(option => {
            const Icon = option.icon;
            const FeatureIcon = option.featureIcon;
            return (
              <button
                type="button"
                key={option.id}
                className={`training-gateway-card ${option.id}`}
                onClick={() => navigate(option.path)}
                aria-label={`${option.title} 시작하기`}
              >
                <img src={option.image} alt="" aria-hidden="true" />
                <span className="training-gateway-card-shade" />
                <span className="training-gateway-card-content">
                  <span className="training-gateway-card-top"><i><Icon size={19} /></i>{option.eyebrow}</span>
                  <span className="training-gateway-card-copy">
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                  <span className="training-gateway-card-bottom">
                    <span><FeatureIcon size={16} /> {option.feature}</span>
                    <b>시작하기 <ArrowRight size={18} /></b>
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        <div className="training-gateway-note"><MessageSquareText size={15} /> 모든 훈련은 한국어로 진행됩니다.</div>
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
