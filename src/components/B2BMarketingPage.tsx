import React, { useState } from 'react';
import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileUser,
  GraduationCap,
  LineChart,
  MessageSquareMore,
  Presentation,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type ProposalSlide = {
  id: number;
  section: string;
  title: string;
  lead: string;
  icon: React.ElementType;
  signals: { label: string; value: string; description: string }[];
  highlights: string[];
  points: { title: string; eyebrow: string; description: string; icon: React.ElementType }[];
  note?: string;
};

const slides: ProposalSlide[] = [
  {
    id: 1,
    section: 'WHY NOW · 교육의 마지막 1마일',
    title: '교육은 했지만\n실전 질문 앞에서 답이 멈춥니다',
    lead: '자기소개서 첨삭과 강의만으로는 꼬리질문을 듣고, 생각을 정리하고, 자신의 경험으로 설득하는 힘까지 만들기 어렵습니다.',
    icon: Target,
    signals: [
      { label: '실제 대화 기회', value: '부족', description: '말해 보는 훈련의 병목' },
      { label: '지도자 시간', value: '한정', description: '모든 학습자와 반복 실습 불가' },
      { label: '개인별 반복', value: '어려움', description: '한 번의 모의면접으로 종료' },
    ],
    highlights: [
      '학습자마다 이력과 약점이 달라 같은 질문만으로는 부족합니다.',
      '말의 모순과 추상성은 실제로 답해 볼 때 드러납니다.',
      '기존 1:1 모의훈련만으로는 충분한 반복 횟수를 만들기 어렵습니다.',
    ],
    points: [
      { title: '아는 것과 말하는 것의 차이', eyebrow: 'KNOWING ≠ DOING', description: '준비한 내용을 예측하지 못한 질문에 맞춰 꺼내는 훈련이 필요합니다.', icon: BrainCircuit },
      { title: '압박 속에서 무너지는 구조', eyebrow: 'REAL PRESSURE', description: '꼬리질문이 이어지면 근거와 행동이 빠지고 답변이 추상적으로 변합니다.', icon: MessageSquareMore },
      { title: '기관이 채우기 어려운 공백', eyebrow: 'PRACTICE GAP', description: '지도자 수를 늘리지 않고도 실전 대화 횟수를 확대할 방법이 필요합니다.', icon: Building2 },
    ],
  },
  {
    id: 2,
    section: 'SOLUTION · 반응하는 AI 페르소나',
    title: '답변을 외우는 대신\n상대의 반응에 대응합니다',
    lead: 'ThinkFit의 AI 페르소나는 정해진 질문만 읽지 않습니다. 학습자의 답변을 듣고 모호한 지점, 모순, 빠진 근거를 찾아 다음 질문을 이어갑니다.',
    icon: Bot,
    signals: [
      { label: '상대 반응', value: '실시간', description: '답변에 따라 질문 변화' },
      { label: '압박 강도', value: '3단계', description: '학습 수준에 맞춰 선택' },
      { label: '훈련 방식', value: '음성·텍스트', description: '환경에 맞게 연습' },
    ],
    highlights: [
      '면접관·상사·고객의 성격과 의사결정 기준이 대화 내내 유지됩니다.',
      '사용자의 실제 답변을 인용하며 구체적인 꼬리질문을 던집니다.',
      '실패해도 부담 없이 다시 시도하며 더 나은 대응을 만들 수 있습니다.',
    ],
    points: [
      { title: '살아 있는 캐릭터', eyebrow: 'CONSISTENT PERSONA', description: '성격, 말투, 관심사와 양보 조건이 다른 상대를 경험합니다.', icon: Users },
      { title: '답변 기반 꼬리질문', eyebrow: 'ADAPTIVE DIALOGUE', description: '직전 답변과 대화 맥락을 반영해 다음 압박이 달라집니다.', icon: MessageSquareMore },
      { title: '안전한 반복 실전', eyebrow: 'RETRY WITHOUT RISK', description: '실수의 비용 없이 같은 상황을 여러 방식으로 다시 풀어 봅니다.', icon: ClipboardCheck },
    ],
  },
  {
    id: 3,
    section: 'PERSONALIZATION · 내 경험에서 시작',
    title: '이력서 한 장이\n개인 맞춤 훈련 시나리오가 됩니다',
    lead: '취업 준비생의 이력서·전공·프로젝트·특별활동, 경력자의 경력기술서를 바탕으로 각자 검증받아야 할 지점을 질문으로 바꿉니다.',
    icon: FileUser,
    signals: [
      { label: '입력 자료', value: '이력·활동', description: '학생과 경력자 모두 지원' },
      { label: '질문 구성', value: '개인 맞춤', description: '내 경험에서 검증 지점 추출' },
      { label: '예정된 상황', value: '직접 입력', description: '곧 있을 면접·회의 준비' },
    ],
    highlights: [
      'AI가 입력 자료를 항목별로 정리하고 사용자가 저장 전에 확인합니다.',
      '성과, 역할, 실패 경험처럼 개인마다 다른 약점을 집중 검증합니다.',
      '지원 기업 면접이나 예정된 회의 상황을 직접 입력해 즉시 연습합니다.',
    ],
    points: [
      { title: '학생 맞춤 질문', eyebrow: 'STUDENT PROFILE', description: '전공 프로젝트, 동아리, 공모전과 활동 경험을 구체화합니다.', icon: GraduationCap },
      { title: '경력 맞춤 질문', eyebrow: 'CAREER PROFILE', description: '직무 성과, 의사결정과 본인의 기여도를 깊게 검증합니다.', icon: BriefcaseBusiness },
      { title: '나만의 상황 만들기', eyebrow: 'BUILD YOUR OWN', description: '나의 역할과 상대, 목표와 제약을 입력해 훈련을 설계합니다.', icon: Sparkles },
    ],
  },
  {
    id: 4,
    section: 'SCENARIOS · 취업부터 현업까지',
    title: '합격을 위한 면접에서\n입사 후 필요한 대화까지 훈련합니다',
    lead: '취업지원 프로그램과 직업훈련 과정이 면접 합격에서 끝나지 않고, 실제 조직에서 요구되는 협상·조율·설득 역량까지 이어집니다.',
    icon: BriefcaseBusiness,
    signals: [
      { label: '훈련 범위', value: '4개 영역', description: '면접·협상·직장·세일즈' },
      { label: '상대 역할', value: '실무형', description: '면접관·상사·고객' },
      { label: '핵심 행동', value: '설명·조율', description: '질문·반론·설득 대응' },
    ],
    highlights: [
      '압박 면접, 공백기, 실패 경험과 답변 모순을 집중적으로 검증합니다.',
      '연봉 협상, 불가능한 마감, 책임 전가처럼 신입이 어려워하는 장면을 다룹니다.',
      'B2B 피치, 대형 수주, 보험 상담처럼 고객을 설득하는 직무도 훈련합니다.',
    ],
    points: [
      { title: '취업·면접', eyebrow: 'GET THE JOB', description: '경험을 행동과 결과 중심으로 설명하고 꼬리질문을 견딥니다.', icon: GraduationCap },
      { title: '협상·직장 대화', eyebrow: 'WORK WITH OTHERS', description: '관계를 해치지 않으면서 기준과 대안을 분명하게 제시합니다.', icon: Users },
      { title: '세일즈·수주', eyebrow: 'WIN THE DEAL', description: '기능 나열을 넘어 고객의 우려와 결정 기준에 대응합니다.', icon: LineChart },
    ],
  },
  {
    id: 5,
    section: 'OUTCOME · 훈련이 피드백으로 연결',
    title: '지도자는 반복 질문보다\n관찰과 코칭에 집중할 수 있습니다',
    lead: '학습자가 먼저 충분히 말해 보고 결과 보고서를 가져오면, 상담과 수업 시간은 답변 초안 작성이 아니라 가장 중요한 약점을 고치는 데 사용할 수 있습니다.',
    icon: LineChart,
    signals: [
      { label: '결과 확인', value: '종료 즉시', description: '훈련 직후 보고서 제공' },
      { label: '피드백', value: '항목별', description: '근거와 대응 행동 중심' },
      { label: '다음 행동', value: '재도전', description: '같은 상황을 다시 훈련' },
    ],
    highlights: [
      '대응 결과와 강점·보완점, 상대가 사용한 압박 전술을 확인합니다.',
      '다시 도전할 한 가지 행동을 제시해 피드백을 다음 훈련으로 연결합니다.',
      '지도자는 보고서와 대면 관찰을 함께 활용해 더 구체적으로 코칭합니다.',
    ],
    points: [
      { title: '학습자', eyebrow: 'MORE PRACTICE', description: '상담 전에도 스스로 반복하고 달라진 답변을 확인합니다.', icon: GraduationCap },
      { title: '지도자', eyebrow: 'BETTER COACHING', description: '실제 대화에서 드러난 취약점을 중심으로 시간을 사용합니다.', icon: Users },
      { title: '기관', eyebrow: 'SCALABLE PROGRAM', description: '기존 프로그램에 반복 실습 단계를 더해 교육의 밀도를 높입니다.', icon: Building2 },
    ],
  },
  {
    id: 6,
    section: 'ADOPTION · 작게 검증하는 도입',
    title: '한 개 과정에서 시작하고\n대면 코칭으로 완성하십시오',
    lead: 'ThinkFit은 지도자를 대체하지 않습니다. 온라인에서는 말의 구조와 대응을 반복하고, 대면에서는 시선·제스처·자세와 현장 긴장감을 코칭할 때 가장 효과적입니다.',
    icon: Building2,
    signals: [
      { label: '시작 범위', value: '1개 과정', description: '작은 파일럿부터 검증' },
      { label: '운영 방식', value: '혼합형', description: '온라인 반복 + 대면 코칭' },
      { label: '확대 판단', value: '결과 확인', description: '보고서와 현장 반응 검토' },
    ],
    highlights: [
      '취업반 또는 직무 과정 하나에서 핵심 상황을 선정해 시작합니다.',
      '사전 AI 훈련 후 지도자가 결과 보고서와 실제 수행을 함께 코칭합니다.',
      '학습자 결과 보고서와 지도자의 현장 관찰을 확인한 뒤 적용 범위를 결정합니다.',
    ],
    points: [
      { title: '1. 과정 설계', eyebrow: 'SELECT', description: '대상 학습자와 반드시 연습할 상황을 정합니다.', icon: Target },
      { title: '2. 혼합 훈련', eyebrow: 'PRACTICE', description: 'AI 반복 훈련과 지도자의 대면 피드백을 연결합니다.', icon: Bot },
      { title: '3. 효과 검토', eyebrow: 'VALIDATE', description: '결과 보고서와 현장 반응을 보고 확대 여부를 판단합니다.', icon: ClipboardCheck },
    ],
    note: '제스처·시선·자세·태도와 실제 현장의 긴장감은 온라인만으로 충분히 평가하기 어렵습니다. ThinkFit은 이 한계를 숨기지 않고, 귀한 대면 시간을 고차원 코칭에 집중하도록 기본기 반복을 맡습니다.',
  },
];

export const B2BMarketingPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const slide = slides[currentSlide];
  const SlideIcon = slide.icon;

  const nextSlide = () => setCurrentSlide(index => (index + 1) % slides.length);
  const previousSlide = () => setCurrentSlide(index => (index - 1 + slides.length) % slides.length);

  return (
    <main className="app-container page-scroll" style={{ maxWidth: 1200, padding: '1.5rem 1.25rem 4rem' }}>
      <nav className="flex justify-between items-center" style={{ gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/institution')}>
          <ArrowLeft size={16} /> 기관 페이지로 돌아가기
        </button>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <span className="badge" style={{ color: '#fff', background: 'var(--primary)', border: 0, fontWeight: 800 }}>THINKFIT B2B</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '.88rem' }}>대학 취업센터·직업훈련기관 도입 제안</span>
        </div>
      </nav>

      <article style={{ minHeight: 680, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)', boxShadow: '0 24px 60px -24px rgba(0,0,0,.48)' }}>
        <header className="flex justify-between items-center" style={{ gap: '1rem', padding: '1.1rem 1.6rem', borderBottom: '1px solid var(--border-color)', background: 'linear-gradient(90deg, rgba(37,99,235,.12), rgba(15,23,42,.45))', flexWrap: 'wrap' }}>
          <div className="flex items-center gap-3">
            <span style={{ width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'var(--primary)', borderRadius: 9 }}><Presentation size={19} /></span>
            <div>
              <small style={{ display: 'block', color: 'var(--primary)', fontWeight: 850, letterSpacing: '.07em' }}>{slide.section}</small>
              <strong style={{ color: 'var(--text-light)' }}>AI 페르소나 실전훈련 도입 제안</strong>
            </div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '.84rem', fontWeight: 750 }}>{String(currentSlide + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
        </header>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.45rem', padding: '2rem clamp(1.2rem, 4vw, 2.8rem)' }}>
          <section className="flex justify-between items-start" style={{ gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 590px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', padding: '.38rem .72rem', color: 'var(--primary)', background: 'rgba(37,99,235,.1)', borderRadius: 999, fontSize: '.8rem', fontWeight: 850 }}><SlideIcon size={16} /> KEY VALUE {String(slide.id).padStart(2, '0')}</span>
              <h1 style={{ margin: '.65rem 0 .65rem', color: 'var(--text-light)', fontSize: 'clamp(1.85rem, 4vw, 2.55rem)', lineHeight: 1.2, letterSpacing: '-.035em', whiteSpace: 'pre-line' }}>{slide.title}</h1>
              <p style={{ maxWidth: 800, margin: 0, color: 'var(--text-main)', fontSize: '1rem', lineHeight: 1.7 }}>{slide.lead}</p>
            </div>
            <div style={{ width: 82, height: 82, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', background: 'rgba(37,99,235,.09)', border: '1px solid rgba(37,99,235,.2)', borderRadius: 22 }}><SlideIcon size={37} /></div>
          </section>

          <section className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {slide.signals.map(signal => (
              <div key={signal.label} style={{ padding: '.85rem 1rem', textAlign: 'center', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
                <small style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 700 }}>{signal.label}</small>
                <strong style={{ display: 'block', margin: '.12rem 0', color: 'var(--primary)', fontSize: '1.35rem' }}>{signal.value}</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '.74rem' }}>{signal.description}</span>
              </div>
            ))}
          </section>

          <section style={{ padding: '1rem 1.15rem', background: 'linear-gradient(135deg, rgba(37,99,235,.07), rgba(217,119,6,.045))', border: '1px solid rgba(37,99,235,.2)', borderRadius: 'var(--radius-md)' }}>
            <h2 className="flex items-center gap-2" style={{ margin: '0 0 .7rem', color: 'var(--accent-amber)', fontSize: '.86rem' }}><Sparkles size={16} /> 기관 도입 핵심 포인트</h2>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
              {slide.highlights.map(item => <div key={item} className="flex items-start gap-2" style={{ color: 'var(--text-main)', fontSize: '.9rem', lineHeight: 1.5 }}><CheckCircle2 size={17} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} /><span>{item}</span></div>)}
            </div>
          </section>

          <section>
            <h2 style={{ margin: '0 0 .75rem', color: 'var(--text-muted)', fontSize: '.8rem', letterSpacing: '.06em' }}>WHY THINKFIT</h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))' }}>
              {slide.points.map(point => {
                const PointIcon = point.icon;
                return (
                  <article key={point.title} style={{ padding: '1rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderTop: '3px solid var(--primary)', borderRadius: '0 0 var(--radius-sm) var(--radius-sm)' }}>
                    <div className="flex items-center gap-2"><PointIcon size={17} color="var(--primary)" /><strong style={{ color: 'var(--text-light)' }}>{point.title}</strong></div>
                    <small style={{ display: 'block', margin: '.4rem 0 .3rem', color: 'var(--accent-amber)', fontWeight: 800 }}>{point.eyebrow}</small>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '.84rem', lineHeight: 1.55 }}>{point.description}</p>
                  </article>
                );
              })}
            </div>
          </section>

          {slide.note && <p style={{ margin: 0, padding: '.8rem 1rem', color: 'var(--text-main)', background: 'rgba(217,119,6,.06)', borderLeft: '3px solid var(--accent-amber)', fontSize: '.87rem', lineHeight: 1.55 }}>{slide.note}</p>}
        </div>

        <footer className="flex justify-between items-center" style={{ gap: '1rem', padding: '1rem 1.5rem', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" aria-label="제안서 페이지 선택">
            {slides.map((item, index) => <button key={item.id} type="button" onClick={() => setCurrentSlide(index)} aria-label={`${index + 1}페이지: ${item.section}`} style={{ width: index === currentSlide ? 28 : 9, height: 9, padding: 0, border: 0, borderRadius: 10, cursor: 'pointer', background: index === currentSlide ? 'var(--primary)' : 'var(--border-color)', transition: 'width .2s' }} />)}
          </div>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={previousSlide}><ChevronLeft size={16} /> 이전</button>
            <button className="btn btn-secondary" onClick={nextSlide}>다음 <ChevronRight size={16} /></button>
            <button className="btn btn-primary" onClick={() => navigate('/simulation')}><Users size={16} /> 페르소나 훈련 확인</button>
          </div>
        </footer>
      </article>
    </main>
  );
};
