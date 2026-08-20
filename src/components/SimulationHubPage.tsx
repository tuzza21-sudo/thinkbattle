import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, ArrowRight, BadgeDollarSign, BriefcaseBusiness, Building2, Clock3, FileUser, Handshake, MessageCircle, Mic2, PenLine, ShieldCheck, Sparkles, Star, UsersRound, WandSparkles } from 'lucide-react';
import { getSimulationPersona, simulationCategories, simulationMissions } from '../data/simulations';
import type { AppUser, SimulationCategoryId } from '../types';

interface SimulationHubPageProps {
  user: AppUser | null;
  onLoginRequest: () => void;
}

const categoryIcons = {
  career: BriefcaseBusiness,
  negotiation: Handshake,
  workplace: Building2,
  sales: BadgeDollarSign,
};

const difficultyLabel = (difficulty: number) => ['기초', '실전', '고압'][difficulty - 1] ?? '실전';

export const SimulationHubPage = ({ user, onLoginRequest }: SimulationHubPageProps) => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<SimulationCategoryId>('career');
  const missions = useMemo(
    () => simulationMissions.filter(mission => mission.categoryId === activeCategory),
    [activeCategory],
  );
  const activeCategoryInfo = simulationCategories.find(category => category.id === activeCategory) ?? simulationCategories[0];

  const startMission = (missionId: string) => {
    if (!user) {
      onLoginRequest();
      return;
    }
    navigate(`/simulation/${missionId}`);
  };

  const openPersonalTraining = () => {
    if (!user) {
      onLoginRequest();
      return;
    }
    navigate('/simulation/personalize');
  };

  return (
    <div className="simulation-page">
      <header className="simulation-header">
        <button type="button" className="simulation-back" onClick={() => navigate('/')}>
          <ArrowLeft size={18} /> 메인으로
        </button>
        <div className="simulation-brand"><img src="/brand/thinkfit-mark.svg" alt="" /><span>ThinkFit</span> Stage 2</div>
        <div className="simulation-user">{user ? `${user.nickname}님` : '로그인 후 훈련 가능'}</div>
      </header>

      <section className="simulation-hero">
        <div>
          <div className="simulation-eyebrow"><Sparkles size={16} /> REAL-WORLD SIMULATION</div>
          <h1>생각한 것을<br /><span>실전에서 꺼내 쓰는 훈련</span></h1>
          <p>AI 페르소나의 압박에 직접 대응하고, 발언 기록을 근거로 구체적인 행동 피드백을 받으세요.</p>
        </div>
        <div className="simulation-demo-console" aria-label="AI 상황극 훈련 미리보기">
          <div className="simulation-console-top">
            <span><i /> LIVE SIMULATION</span>
            <small>압박 면접 · LEVEL 2</small>
          </div>
          <div className="simulation-console-persona">
            <div className="simulation-console-avatar"><span>AI</span><i /></div>
            <div><small>오늘의 상대</small><strong>압박 면접관</strong><span>근거와 일관성을 검증합니다</span></div>
            <div className="simulation-console-pressure"><small>PRESSURE</small><b><i /><i /><i /><i /><i /></b></div>
          </div>
          <div className="simulation-console-dialogue">
            <MessageCircle size={17} />
            <p>“프로젝트가 실패했다면, 본인이 직접 책임져야 할 부분은 정확히 무엇이었습니까?”</p>
          </div>
          <div className="simulation-console-wave" aria-hidden="true">
            {[12, 24, 17, 35, 28, 43, 20, 32, 15, 38, 25, 18, 30, 14, 22].map((height, index) => <i key={index} style={{ height }} />)}
          </div>
          <div className="simulation-console-bottom">
            <span><Mic2 size={15} /> 말로 대응</span>
            <span><Activity size={15} /> 실시간 분석</span>
            <b>평가와 재도전까지</b>
          </div>
        </div>
      </section>

      <section className="simulation-personal-launch">
        <div className="simulation-personal-launch-copy"><span><WandSparkles size={16} /> NEW · PERSONAL PRESSURE LAB</span><h2>내 이력과 실제 상황으로<br />새 훈련을 만드세요</h2><p>프로필 기반 맞춤 질문 또는 곧 마주칠 상황을 직접 입력하는 압박훈련을 생성할 수 있습니다.</p><button type="button" onClick={openPersonalTraining}>맞춤 훈련 만들기 <ArrowRight size={18} /></button></div>
        <div className="simulation-personal-options"><article><FileUser size={22} /><div><strong>프로필 기반 생성</strong><span>이력서·경력·전공·활동에서 검증 질문 생성</span></div></article><article><PenLine size={22} /><div><strong>상황 직접 입력</strong><span>면접·회의·협상·영업 상황을 바로 압박훈련으로</span></div></article></div>
      </section>

      <section className="simulation-category-section">
        <div className="simulation-section-heading">
          <div><span>STEP 1</span><h2>훈련할 상황을 선택하세요</h2></div>
          <p>각 카테고리는 실제 대학생·취업준비생이 마주치는 상황을 기반으로 구성됩니다.</p>
        </div>
        <div className="simulation-category-grid">
          {simulationCategories.map((category, index) => {
            const Icon = categoryIcons[category.id];
            const selected = category.id === activeCategory;
            return (
              <button
                type="button"
                key={category.id}
                className={`simulation-category-card ${selected ? 'selected' : ''}`}
                style={{ '--category-color': category.color } as CSSProperties}
                onClick={() => setActiveCategory(category.id)}
              >
                <span className="simulation-category-number">0{index + 1}</span>
                <span className="simulation-category-icon"><Icon size={25} /></span>
                <strong>{category.title}</strong>
                <small>{category.subtitle}</small>
                <p>{category.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="simulation-mission-section">
        <div className="simulation-section-heading">
          <div><span>STEP 2</span><h2>{activeCategoryInfo.title} 미션</h2></div>
          <p>{activeCategoryInfo.description}</p>
        </div>
        <div className="simulation-mission-grid">
          {missions.map(mission => {
            const persona = getSimulationPersona(mission.personaId);
            return (
              <article className="simulation-mission-card" key={mission.id}>
                <div className="simulation-mission-topline">
                  <span className={`simulation-difficulty level-${mission.difficulty}`}>
                    <Star size={13} /> {difficultyLabel(mission.difficulty)}
                  </span>
                  <span><Clock3 size={14} /> 약 {mission.durationMinutes}분</span>
                </div>
                <h3>{mission.title}</h3>
                <p>{mission.summary}</p>
                <div className="simulation-persona-chip">
                  <div className={`simulation-mini-avatar persona-${persona.id}`}><img src={persona.imageUrl} alt={`${persona.name}, ${persona.gender} ${persona.age}세`} loading="lazy" /><i /></div>
                  <span><small>{persona.gender} · {persona.age}세 · {persona.identity}</small><strong>{persona.name} · {persona.role}</strong></span>
                  <UsersRound size={17} />
                </div>
                <div className="simulation-mission-objective">
                  <b>훈련 목표</b>
                  <span>{mission.objective}</span>
                </div>
                <div className="simulation-skill-tags">
                  {mission.coachingFocus.slice(0, 3).map(focus => <span key={focus}>#{focus}</span>)}
                </div>
                <button type="button" className="simulation-start-button" onClick={() => startMission(mission.id)}>
                  미션 시작하기 <ArrowRight size={18} />
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="simulation-safety-note">
        <ShieldCheck size={24} />
        <div><strong>안전한 압박 훈련</strong><p>AI는 주장과 행동만 압박하며 욕설·차별·인격 공격은 하지 않습니다. 훈련은 언제든 종료할 수 있습니다.</p></div>
      </section>
    </div>
  );
};
