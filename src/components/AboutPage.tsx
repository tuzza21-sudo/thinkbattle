import type { ElementType } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  Globe2,
  GraduationCap,
  Lightbulb,
  MessageSquareText,
  Repeat2,
  Scale,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FeatureItem {
  icon: ElementType;
  eyebrow: string;
  title: string;
  lead: string;
  description: string;
  tone: 'blue' | 'violet' | 'cyan' | 'amber';
}

const missionItems: FeatureItem[] = [
  {
    icon: BrainCircuit,
    eyebrow: 'THINK',
    title: 'AI 시대 사고력 특화 훈련',
    lead: '답을 얻는 능력보다, 답을 판단하는 능력이 중요합니다.',
    description: '실전 토론의 구조를 따라 논리력·질문력·반박력·설득력을 반복 훈련합니다.',
    tone: 'blue',
  },
  {
    icon: Repeat2,
    eyebrow: 'PRACTICE',
    title: '생각의 근육을 만드는 반복',
    lead: '사고력도 몸처럼 반복할수록 단단해집니다.',
    description: '주장하고 질문하고 설득하는 말하기 경험을 쌓아, 머릿속 생각을 실제 역량으로 바꿉니다.',
    tone: 'violet',
  },
  {
    icon: BarChart3,
    eyebrow: 'GROW',
    title: '기록으로 확인하는 성장',
    lead: '훈련의 결과는 감이 아니라 데이터로 남아야 합니다.',
    description: 'AI 피드백과 훈련 기록을 통해 강점과 개선점을 확인하고 다음 도전을 설계합니다.',
    tone: 'cyan',
  },
  {
    icon: Globe2,
    eyebrow: 'EXPAND',
    title: '현실과 연결되는 커뮤니케이션',
    lead: '좋은 생각은 실제 상황에서 꺼내 쓸 수 있어야 합니다.',
    description: '사회 이슈 토론부터 면접·협상·영업까지, 모국어로 논리적으로 말하고 설득하는 힘을 기릅니다.',
    tone: 'amber',
  },
];

const growthSteps = [
  {
    step: '01',
    level: 'FOUNDATION',
    title: '주장을 세우는 기본기',
    description: '상대의 핵심을 이해하고 내 생각을 논리와 근거로 분명하게 표현합니다.',
    skills: ['논지 파악', '논리력', '근거력', '질문력', '반박력'],
    tone: 'blue',
  },
  {
    step: '02',
    level: 'ANALYSIS',
    title: '맥락을 읽는 분석력',
    description: '표면적인 말 너머의 전제와 이해관계를 읽고 무엇이 더 중요한지 판단합니다.',
    skills: ['전제 파악', '우선순위 판단', '이해관계 분석'],
    tone: 'cyan',
  },
  {
    step: '03',
    level: 'STRATEGY',
    title: '판을 바꾸는 설득력',
    description: '문제를 새로운 관점으로 재구성하고 상대가 움직일 수 있는 언어로 제안합니다.',
    skills: ['프레이밍', '대안 제시', '설득 전략'],
    tone: 'violet',
  },
] as const;

const audiences = [
  { icon: GraduationCap, title: '학생 · 취업 준비생', text: '논술, 발표, 토론 면접과 자기소개에서 생각을 분명하게 말하고 싶은 분' },
  { icon: BriefcaseBusiness, title: '직장인 · 리더', text: '회의, 보고, 피치, 협상에서 상대를 이해시키고 움직여야 하는 분' },
  { icon: Target, title: '영업 · 제안 실무자', text: '고객의 반론과 압박 속에서도 논리를 유지하며 수주 가능성을 높이고 싶은 분' },
  { icon: Users, title: '교육기관 · 동아리', text: '구성원에게 표준화된 말하기 기회와 개인별 훈련 기록을 제공하고 싶은 조직' },
  { icon: Lightbulb, title: '비판적 사고 학습자', text: 'AI의 답을 그대로 소비하지 않고 스스로 질문하고 판단하는 습관을 만들고 싶은 분' },
  { icon: Globe2, title: '글로벌 커뮤니케이터', text: '내 생각을 먼저 정리한 뒤 한국어와 영어로 설득력 있게 확장하고 싶은 분' },
] as const;

export const AboutPage = () => {
  const navigate = useNavigate();

  return (
    <div className="about-page">
      <header className="about-header">
        <button type="button" className="about-back" onClick={() => navigate(-1)} aria-label="이전 화면으로 돌아가기">
          <ArrowLeft size={19} />
        </button>
        <button type="button" className="about-brand" onClick={() => navigate('/')}>
          <span><img src="/brand/thinkfit-mark.svg" alt="" /></span>
          <div><strong>ThinkFit</strong><small>SERVICE INTRODUCTION</small></div>
        </button>
        <button type="button" className="about-header-cta" onClick={() => navigate('/')}>
          훈련 선택 <ArrowRight size={17} />
        </button>
      </header>

      <main>
        <section className="about-hero">
          <div className="about-hero-copy">
            <span className="about-kicker"><Sparkles size={15} /> WHY THINKFIT</span>
            <h1>생각할 기회가 줄어든 시대,<br /><em>말하고 설득하는 힘</em>을 훈련합니다.</h1>
            <p>
              ThinkFit은 정답을 보여주는 서비스가 아닙니다. 토론과 현실적인 페르소나 상황 속에서
              사용자가 직접 생각하고, 말하고, 반응하도록 만드는 AI 커뮤니케이션 훈련 플랫폼입니다.
            </p>
            <div className="about-hero-actions">
              <button type="button" className="about-primary-button" onClick={() => navigate('/debate')}>
                토론 훈련 시작 <ArrowRight size={18} />
              </button>
              <button type="button" className="about-secondary-button" onClick={() => navigate('/simulation')}>
                페르소나 훈련 보기
              </button>
            </div>
            <div className="about-proof">
              <span><Check size={14} /> 모국어 실전 훈련</span>
              <span><Check size={14} /> 개인별 AI 피드백</span>
              <span><Check size={14} /> 반복 가능한 시나리오</span>
            </div>
          </div>

          <div className="about-hero-visual" aria-label="ThinkFit 훈련 방식">
            <div className="about-visual-top">
              <span><i /> TRAINING IN PROGRESS</span>
              <small>THINKFIT LAB</small>
            </div>
            <div className="about-dialogue">
              <div className="about-dialogue-avatar"><MessageSquareText size={24} /></div>
              <div>
                <small>AI COUNTERPART</small>
                <strong>“그 주장이 상대방에게도<br />중요한 이유는 무엇인가요?”</strong>
              </div>
            </div>
            <div className="about-response">
              <small>YOUR RESPONSE</small>
              <p>생각을 정리하고, 내 목소리로 답합니다.</p>
              <div><span /><span /><span /><span /><span /></div>
            </div>
            <div className="about-training-flow">
              <span className="active"><b>01</b>생각</span><i />
              <span className="active"><b>02</b>발화</span><i />
              <span><b>03</b>피드백</span><i />
              <span><b>04</b>성장</span>
            </div>
          </div>
        </section>

        <section className="about-section about-mission">
          <div className="about-section-heading">
            <span>OUR MISSION</span>
            <h2>왜 ThinkFit이 필요한가</h2>
            <p>짧게 소비하는 정보는 넘치지만, 자신의 생각을 끝까지 말해볼 기회는 부족합니다.</p>
          </div>
          <div className="about-mission-grid">
            {missionItems.map(item => {
              const Icon = item.icon;
              return (
                <article key={item.title} className={`about-mission-card ${item.tone}`}>
                  <div className="about-mission-icon"><Icon size={22} /></div>
                  <span>{item.eyebrow}</span>
                  <h3>{item.title}</h3>
                  <strong>{item.lead}</strong>
                  <p>{item.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="about-section about-growth">
          <div className="about-growth-intro">
            <span>SKILL PROGRESSION</span>
            <h2>생각에서 설득까지,<br />단계적으로 성장합니다.</h2>
            <p>한 번의 평가로 끝나지 않습니다. 기본기부터 전략적 설득까지 반복 훈련하며 실력을 쌓습니다.</p>
            <div className="about-growth-note">
              <Zap size={18} />
              <span><strong>8+ 핵심 역량</strong>을 훈련 기록과 AI 피드백으로 추적합니다.</span>
            </div>
          </div>
          <div className="about-growth-list">
            {growthSteps.map(item => (
              <article key={item.step} className={`about-growth-card ${item.tone}`}>
                <div className="about-growth-number">{item.step}</div>
                <div className="about-growth-copy">
                  <span>{item.level}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div>{item.skills.map(skill => <small key={skill}>{skill}</small>)}</div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="about-section about-audience">
          <div className="about-section-heading">
            <span>BUILT FOR REAL LIFE</span>
            <h2>실제로 말하고 설득해야 하는 사람들</h2>
            <p>시험을 위한 지식이 아니라, 현실에서 꺼내 쓰는 커뮤니케이션 역량을 만듭니다.</p>
          </div>
          <div className="about-audience-grid">
            {audiences.map(item => {
              const Icon = item.icon;
              return (
                <article key={item.title}>
                  <span><Icon size={21} /></span>
                  <div><h3>{item.title}</h3><p>{item.text}</p></div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="about-cta">
          <div>
            <span><Scale size={18} /> THINK · SPEAK · PERSUADE</span>
            <h2>생각은 훈련할수록<br />더 강한 실력이 됩니다.</h2>
            <p>오늘 한 번 더 말하고, 질문하고, 설득해보세요.</p>
          </div>
          <div className="about-cta-actions">
            <button type="button" onClick={() => navigate('/debate')}>토론 훈련 <ArrowRight size={18} /></button>
            <button type="button" onClick={() => navigate('/simulation')}>페르소나 상황극</button>
          </div>
        </section>
      </main>
    </div>
  );
};
