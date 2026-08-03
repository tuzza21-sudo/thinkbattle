import React, { useState } from 'react';
import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  LineChart,
  Presentation,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SlideData {
  id: number;
  badge: string;
  tagline: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  highlights: string[];
  metrics: { label: string; value: string; desc: string }[];
  features: { title: string; desc: string; detail: string }[];
}

const slides: SlideData[] = [
  {
    id: 1,
    badge: 'SLIDE 01 / 06',
    tagline: 'AI DEBATE AUTOMATION',
    title: 'AI 토론 진행 및 운영 자동화',
    subtitle: '사회자와 심사자 없이도 24시간 완벽하고 체계적인 토론 세션 가동',
    icon: Bot,
    highlights: [
      '별도 진행 인력 0명으로 운영 비용 혁신적 절감',
      '시간 관리, 입론·반론, 쟁점 정리, 종합 요약 자동 수행',
      '온·오프라인 블렌디드 환경에서 표준화된 세션 유지',
    ],
    metrics: [
      { label: '진행 인력 절감', value: '100%', desc: '사회자 없이 AI가 자동 진행' },
      { label: '세션 일관성', value: '99.9%', desc: '표준화된 시간 및 규칙 준수' },
      { label: '운영 준비 시간', value: '-85%', desc: '논제 설정만으로 즉시 시작' },
    ],
    features: [
      {
        title: '실시간 타임키핑 & 스텝 조율',
        desc: '발언 시간 제한 및 순서 제어',
        detail: '입론, 반론, 교차조사, 재반론, 최종발언 단계별 시간을 AI가 초 단위로 정확히 조율합니다.',
      },
      {
        title: '핵심 쟁점 실시간 캡처',
        desc: '대화 흐름 속 주요 대립점 추출',
        detail: '토론 중간중간 맴도는 이슈를 자동 감지해 쟁점을 명확히 짚어주어 삼천포 빠짐을 방지합니다.',
      },
      {
        title: '세션 자동 요약 리포트',
        desc: '종료 직후 즉시 제공되는 요약본',
        detail: '토론이 끝나는 즉시 찬반 핵심 논거와 쟁점 종합 리포트를 자동 발행합니다.',
      },
    ],
  },
  {
    id: 2,
    badge: 'SLIDE 02 / 06',
    tagline: 'AUTOMATIC ARCHIVING',
    title: '모든 발언 자동 기록 & 토론 아카이브',
    subtitle: '휘발되던 토론 발언을 데이터화하여 기관의 영구적인 자산으로 축적',
    icon: Database,
    highlights: [
      '발언자별·주제별·회차별 모든 논증 데이터 100% 자동 저장',
      '반복되는 논리적 약점 파악 및 개인 포트폴리오 활용',
      '신규 회원을 위한 동아리/기관 전용 토론 사례집 자동 구축',
    ],
    metrics: [
      { label: '발언 기록률', value: '100%', desc: '음성/텍스트 전 발언 텍스트화' },
      { label: '학습 복기 효과', value: '3.4x', desc: '자신의 논리 약점 재확인' },
      { label: '자산화 속도', value: '즉시', desc: '종료 즉시DB에 자동 분류 보관' },
    ],
    features: [
      {
        title: '3차원 검색 가능한 DB',
        desc: '회차, 주제, 참가자 기반 필터링',
        detail: '과거 진행된 토론 데이터를 날짜, 키워드, 학생 닉네임으로 1초만에 조회할 수 있습니다.',
      },
      {
        title: '성장 포트폴리오 생성',
        desc: '활동 증빙 및 대회 제출용',
        detail: '참여했던 입론서, 반론 기록, 종합 평가서가 모여 개인 및 기관용 포트폴리오가 됩니다.',
      },
      {
        title: '우수 사례 교육자료화',
        desc: '신입 회원 멘토링 템플릿',
        detail: '높은 점수를 받은 모범 토론을 템플릿으로 저장해 신규 회원의 교육 가이드로 사용합니다.',
      },
    ],
  },
  {
    id: 3,
    badge: 'SLIDE 03 / 06',
    tagline: 'AI DIAGNOSTICS & FEEDBACK',
    title: '개인별 논증력 분석 & 맞춤 피드백',
    subtitle: '승패를 넘어 주장의 명확성, 근거 적절성, 논리적 오류를 다각도 정밀 진단',
    icon: LineChart,
    highlights: [
      '명확성·근거력·논리성·반론대응·질문정확도 5대 루브릭 정밀 분석',
      '막연한 칭찬 대신 발언 문장에 근거한 즉각적 교정 가이드',
      '초보자부터 대회 준비반까지 단계별 성장 궤적 추적',
    ],
    metrics: [
      { label: '평가 루브릭 항목', value: '5대 축', desc: '주장·근거·논리·반론·오류' },
      { label: '피드백 정밀도', value: '문장단위', desc: '실제 발언 텍스트 인용 진단' },
      { label: '실력 향상 속도', value: '+42%', desc: '약점 교정 피드백 반복 적용' },
    ],
    features: [
      {
        title: '논리적 오류 자동 탐지',
        desc: '성급한 일반화, 흑백논리 차단',
        detail: '발언 중 발생한 논리적 비약이나 허수아비 공격 등의 오류를 AI가 즉시 감지하여 지적합니다.',
      },
      {
        title: '방어 & 반론 대응력 평가',
        desc: '상대 공격에 대한 정곡 응수 분석',
        detail: '상대방의 핵심 반론을 회피했는지, 정확한 논거로 받아쳤는지 대응 성공률을 측정합니다.',
      },
      {
        title: '개인 맞춤 훈련 과제 제안',
        desc: '다음 토론을 위한 처방전',
        detail: '"근거의 구체성을 보완하세요" 등 개인별 다음 목표 스킬을 AI가 자동 부여합니다.',
      },
    ],
  },
  {
    id: 4,
    badge: 'SLIDE 04 / 06',
    tagline: 'PARTICIPATION & GROUP MANAGEMENT',
    title: '구성원 참여도 & 활동 관리 데이터',
    subtitle: '특정 회원 독점이나 소외 없이 모두가 균등하게 성장하는 데이터 기반 관리',
    icon: Users,
    highlights: [
      '발언 횟수, 발언 시간, 질문/반론 참여 비율 실시간 대시보드',
      '소극적 회원 대상 참여 유도 및 편중 현상 객관적 개선',
      '출석, 종합 점수, 우수 회원 선발 및 인수인계 데이터 제공',
    ],
    metrics: [
      { label: '참여 편중 개선', value: '-78%', desc: '특정인 독점 현상 방지' },
      { label: '소극 회원 발언율', value: '+2.5배', desc: 'AI가 균등한 발언권 부여' },
      { label: '관리공수 절감', value: '-90%', desc: '대시보드로 한눈에 현황 확인' },
    ],
    features: [
      {
        title: '실시간 참여 지표 대시보드',
        desc: '발언량/시간 분포 시각화',
        detail: '반별·그룹별 회원들의 발언 기여도와 시간을 그래프로 한눈에 파악할 수 있습니다.',
      },
      {
        title: '발언 균형 AI 가이드',
        desc: '소외 회원 발언 기회 배정',
        detail: 'AI 사회자가 발언량이 적은 회원에게 우선적으로 의견을 물어 100% 참여를 유도합니다.',
      },
      {
        title: '기관/동아리 활동 성과표',
        desc: '운영진 인수인계 및 시상 자료',
        detail: '월별/학기별 누적 데이터로 우수 활동자를 자동 선정하고 운영진 이관 자료를 출력합니다.',
      },
    ],
  },
  {
    id: 5,
    badge: 'SLIDE 05 / 06',
    tagline: 'AI TOPIC GENERATION & MANAGEMENT',
    title: '시의성 높은 맞춤형 토론 주제 생성',
    subtitle: '최신 사회 이슈부터 기관 특화 배경지식까지 AI가 완성형 논제 세트 구축',
    icon: BrainCircuit,
    highlights: [
      '시사·경제·기술·문화 등 최신 트렌드 반영 주제 즉시 생성',
      '기관 고유의 수업 맥락과 학습 목표를 반영한 가이드라인 맞춤화',
      '초급·중급·고급 등 구성원 수준에 맞춘 난이도 자동 세팅',
    ],
    metrics: [
      { label: '주제 출제 시간', value: '10초', desc: '키워드 입력 시 전체 셋 완성' },
      { label: '배경지식 완성도', value: '100%', desc: '사례·쟁점·기사·질문 패키지' },
      { label: '수준별 맞춤', value: '3단계', desc: '초급/중급/고급 자동 가공' },
    ],
    features: [
      {
        title: '기관 맥락 반영 AI 주제 엔진',
        desc: '수업 배경 입력 시 100% 맞춤화',
        detail: '관리자가 "중학생 대상 스마트폰 규제" 등 한 줄만 입력해도 완벽한 논제 세트가 완성됩니다.',
      },
      {
        title: '찬반 대립 구조 자동 설계',
        desc: '팽팽한 50:50 대립점 확보',
        detail: '어느 한쪽으로 기울지 않는 정밀한 찬성/반대 논점 및 핵심 이슈 3가지씩을 자동 생성합니다.',
      },
      {
        title: '최신 시사 이슈 연동',
        desc: '트렌디한 사회적 논제 공급',
        detail: 'AI 및 ESG, 정책 이슈 등 가장 핫한 사회적 안건을 주기적으로 토론 주제로 제공합니다.',
      },
    ],
  },
  {
    id: 6,
    badge: 'SLIDE 06 / 06',
    tagline: 'PRE-RESEARCH & ISSUE ANALYSIS',
    title: '사전 리서치 & 쟁점 구조화 지원',
    subtitle: '감정적 주장을 넘어 팩트와 논리에 기반한 입론서 작성을 돕는 리서치 패키지',
    icon: Target,
    highlights: [
      '토론 전 필수 확인 배경지식 및 최근 핵심 사례 3선 제공',
      '연관 뉴스와 검증된 팩트 기반의 검색 링크 자동 연결',
      '토론 전 생각할 질문으로 깊이 있는 입론서 작성 역량 강화',
    ],
    metrics: [
      { label: '자료 조사 시간', value: '-70%', desc: '구조화된 핵심 정보 사전 제공' },
      { label: '논거 구체성', value: '2.8배', desc: '실제 사례 기반 논증 구축' },
      { label: '입론서 완성도', value: 'UP', desc: '사전 준비 질문으로 차원 제고' },
    ],
    features: [
      {
        title: '구조화된 배경 브리핑',
        desc: '2~4문장 핵심 배경 요약',
        detail: '복잡한 사회적 맥락을 학생들이 1분 만에 이해할 수 있도록 명쾌하게 요약해 제공합니다.',
      },
      {
        title: '연관 뉴스 & 키워드 링크',
        desc: '네이버 뉴스 검색 자동 결합',
        detail: '주제와 관련된 최신 기사 검색 키워드 및 링크를 제공하여 팩트 기반 토론을 보장합니다.',
      },
      {
        title: '토론전 생각거리 질문 3선',
        desc: '메타인지 자극 사전 퀴즈',
        detail: '토론장에 들어서기 전 자신의 논리를 다듬을 수 있는 핵심 리플렉션 질문을 던집니다.',
      },
    ],
  },
];

export const B2BMarketingPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);

  const slide = slides[currentSlide];
  const IconComponent = slide.icon;

  const nextSlide = () => setCurrentSlide(prev => (prev + 1) % slides.length);
  const prevSlide = () => setCurrentSlide(prev => (prev - 1 + slides.length) % slides.length);

  return (
    <main className="app-container page-scroll" style={{ maxWidth: 1200, padding: '1.5rem 1.25rem 4rem' }}>
      {/* Top Bar */}
      <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/institution')} style={{ gap: '0.5rem' }}>
          <ArrowLeft size={16} /> 기관 페이지로 돌아가기
        </button>
        <div className="flex items-center gap-2">
          <span className="badge" style={{ background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800 }}>
            THINKFIT B2B
          </span>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>기관/학교/동아리 도입 안내 자료</span>
        </div>
      </div>

      {/* PPT Slide Outer Container */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 20px 50px -15px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        position: 'relative',
        minHeight: '680px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Slide Header Header Bar */}
        <div style={{
          padding: '1.25rem 2rem',
          background: 'linear-gradient(90deg, rgba(37,99,235,0.12) 0%, rgba(15,23,42,0.4) 100%)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div className="flex items-center gap-3">
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 900,
            }}>
              <Presentation size={18} />
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 800, letterSpacing: '0.08em' }}>
                {slide.tagline}
              </span>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-light)' }}>
                ThinkFit B2B 기관 솔루션 프리젠테이션
              </h4>
            </div>
          </div>
          <div className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
            {slide.badge}
          </div>
        </div>

        {/* Slide Main Body */}
        <div style={{ padding: '2.5rem 2.5rem 2rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem' }}>

          {/* Title Area */}
          <div className="flex justify-between items-start" style={{ gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '300px' }}>
              <div className="flex items-center gap-3 mb-2">
                <div style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: 6,
                  background: 'rgba(37,99,235,0.15)',
                  color: 'var(--primary)',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}>
                  <IconComponent size={16} /> Key Value 0{slide.id}
                </div>
              </div>
              <h1 style={{ fontSize: '2.1rem', margin: '0.4rem 0 0.6rem', color: 'var(--text-light)', lineHeight: 1.25, fontWeight: 900 }}>
                {slide.title}
              </h1>
              <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                {slide.subtitle}
              </p>
            </div>

            {/* Metrics Showcase */}
            <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
              {slide.metrics.map(m => (
                <div key={m.label} style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.9rem 1.2rem',
                  minWidth: 125,
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>{m.label}</span>
                  <strong style={{ fontSize: '1.6rem', color: 'var(--primary)', fontWeight: 900, display: 'block', margin: '0.1rem 0' }}>{m.value}</strong>
                  <small style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', whiteSpace: 'nowrap' }}>{m.desc}</small>
                </div>
              ))}
            </div>
          </div>

          {/* Core Highlights Box */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(37,99,235,0.06) 0%, rgba(217,119,6,0.04) 100%)',
            border: '1px solid rgba(37,99,235,0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem 1.5rem',
          }}>
            <h5 style={{ margin: '0 0 0.8rem', fontSize: '0.9rem', color: 'var(--accent-amber)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={16} /> 핵심 기대 효과 & 혁신 포인트
            </h5>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {slide.highlights.map(item => (
                <div key={item} className="flex items-start gap-2.5" style={{ fontSize: '0.95rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                  <CheckCircle2 size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3 Detailed Features Cards Grid */}
          <div>
            <h5 style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>
              SYSTEM SPECIFICATIONS & FEATURES
            </h5>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {slide.features.map(f => (
                <div key={f.title} className="card" style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}>
                  <div className="flex items-center gap-2">
                    <Zap size={16} color="var(--primary)" />
                    <strong style={{ color: 'var(--text-light)', fontSize: '1.05rem' }}>{f.title}</strong>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--accent-amber)', fontWeight: 700 }}>{f.desc}</span>
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', margin: 0, lineHeight: 1.6 }}>
                    {f.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Navigation Controls */}
        <div style={{
          padding: '1rem 2rem',
          background: 'var(--bg-primary)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          {/* Slide Indicator Dots */}
          <div className="flex items-center gap-2">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setCurrentSlide(idx)}
                style={{
                  width: idx === currentSlide ? 28 : 10,
                  height: 10,
                  borderRadius: 5,
                  background: idx === currentSlide ? 'var(--primary)' : 'var(--border-color)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                }}
                title={`Slide ${idx + 1}: ${s.title}`}
              />
            ))}
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem', fontWeight: 600 }}>
              {currentSlide + 1} / {slides.length}
            </span>
          </div>

          {/* Action & Slide Nav Buttons */}
          <div className="flex items-center gap-3">
            <button className="btn btn-secondary" onClick={prevSlide} style={{ padding: '0.6rem 1rem', fontSize: '0.9rem' }}>
              <ChevronLeft size={16} /> 이전 슬라이드
            </button>
            <button className="btn btn-secondary" onClick={nextSlide} style={{ padding: '0.6rem 1rem', fontSize: '0.9rem' }}>
              다음 슬라이드 <ChevronRight size={16} />
            </button>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/institution')}
              style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem', fontWeight: 800, gap: '0.4rem' }}
            >
              <Building2 size={16} /> 기관 서비스 이용하기
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
