import React, { useState } from 'react';
import {
  ArrowLeft,
  Archive,
  BarChart3,
  BookOpenCheck,
  Building2,
  CircleAlert,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Gavel,
  MessageSquareText,
  Presentation,
  Scale,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type ProposalSlide = {
  id: number;
  section: string;
  title: string;
  lead: string;
  icon: React.ElementType;
  leftTitle: string;
  leftItems: string[];
  rightTitle: string;
  rightItems: string[];
  outcomeTitle: string;
  outcomes: { title: string; description: string }[];
  note?: string;
  comparison?: boolean;
};

const slides: ProposalSlide[] = [
  {
    id: 1,
    section: '도입 제안',
    title: '토론을 한 번의 행사에서\n측정 가능한 교육 과정으로',
    lead: 'ThinkFit은 토론의 개설, 참여, 평가, 기록을 하나의 흐름으로 연결합니다. 기관은 토론을 더 자주 운영하고, 참여자의 변화를 같은 기준으로 확인할 수 있습니다.',
    icon: Building2,
    leftTitle: '기관이 겪는 현실적인 어려움',
    leftItems: [
      '인원과 시간을 맞춰 실제 토론을 열기 어렵습니다.',
      '여러 참여자의 발언을 같은 기준으로 평가하기 어렵습니다.',
      '활동이 끝나면 과정과 성과가 남지 않는 경우가 많습니다.',
    ],
    rightTitle: 'ThinkFit이 연결하는 운영 흐름',
    rightItems: [
      '기관 전용 주제 설정과 실시간 토론방 개설',
      '발언 기록을 바탕으로 한 동일 루브릭 평가와 피드백',
      '개인별 결과 누적과 기관 단위 활동 확인',
    ],
    outcomeTitle: '제안의 네 가지 핵심',
    outcomes: [
      { title: '실시간 토론장', description: '실제 상호작용이 일어나는 토론 환경' },
      { title: '평가와 피드백', description: '발언 근거를 남기는 일관된 평가' },
      { title: '성과 측정', description: '개인별 기록을 통한 변화 확인' },
      { title: '기록 자산화', description: '반복 참여가 기관의 교육 자료로 축적' },
    ],
  },
  {
    id: 2,
    section: '핵심 1 · 실시간 토론장',
    title: '토론 교육의 첫 번째 병목은\n실제로 토론할 기회입니다',
    lead: '자료를 읽고 글을 쓰는 것만으로는 질문, 반론, 재반론처럼 상대와 부딪치며 생기는 사고 과정을 충분히 훈련하기 어렵습니다.',
    icon: MessageSquareText,
    leftTitle: '기존 운영의 병목',
    leftItems: [
      '공간, 시간, 진행 인력을 동시에 확보해야 합니다.',
      '일부 참여자에게 발언이 편중되기 쉽습니다.',
      '토론 단계와 역할을 매번 다시 안내해야 합니다.',
    ],
    rightTitle: 'ThinkFit의 실시간 토론 환경',
    rightItems: [
      '음성 또는 텍스트 방식으로 사람 대 사람 토론방 개설',
      '찬성·반대 팀, 역할, 발언 단계와 제한 시간 설정',
      '기관 전용 주제와 기관 구성원 전용 접근 권한 제공',
    ],
    outcomeTitle: '기관이 얻는 운영 변화',
    outcomes: [
      { title: '개설 용이성', description: '정해진 주제와 과정으로 필요한 시점에 토론을 시작합니다.' },
      { title: '구조화된 진행', description: '입론·질문·반론·최종 발언의 흐름을 참가자가 함께 확인합니다.' },
      { title: '참여 기회 확대', description: '수업 밖에서도 반복적으로 실제 토론 경험을 만들 수 있습니다.' },
    ],
    note: '핵심은 AI와 대화하는 기능 자체가 아니라, 참여자 간 실제 토론을 안정적으로 열 수 있는 운영 기반입니다.',
  },
  {
    id: 3,
    section: '핵심 2 · 평가와 피드백',
    title: '사고력은 느낌이 아니라\n발언 과정과 기준으로 평가해야 합니다',
    lead: '누가 말을 잘했는지보다 주장이 명확했는지, 근거가 적절했는지, 상대의 핵심 반론에 답했는지를 발언 기록에 근거해 살펴봅니다.',
    icon: Scale,
    leftTitle: '평가에서 생기는 어려움',
    leftItems: [
      '평가자와 회차에 따라 기준이 달라질 수 있습니다.',
      '여러 명의 전 발언을 기억하고 비교하기 어렵습니다.',
      '총점만 남으면 다음 학습 행동으로 이어지기 어렵습니다.',
    ],
    rightTitle: '평가와 피드백 방식',
    rightItems: [
      '주장, 이유, 근거, 질문, 반론 대응을 공통 기준으로 분석',
      '실제 발언 내용과 토론 단계에 근거한 세부 피드백 제공',
      '강점, 보완점, 다음 토론에서 시도할 행동을 함께 제시',
    ],
    outcomeTitle: '평가 결과의 활용',
    outcomes: [
      { title: '기준의 일관성', description: '참여자와 회차에 동일한 평가 항목을 적용합니다.' },
      { title: '설명 가능한 피드백', description: '어떤 발언에서 무엇을 보완해야 하는지 확인합니다.' },
      { title: '다음 학습 연결', description: '결과를 다음 토론의 개인별 연습 목표로 바꿉니다.' },
    ],
    note: 'AI 평가는 교사의 최종 판단을 대체하지 않습니다. 동일 기준으로 발언을 관찰하고 피드백 초안을 제공하는 보조 도구로 사용합니다.',
  },
  {
    id: 4,
    section: '핵심 3 · 개인별 성과 측정',
    title: '개인별 기록이 쌓여야\n교육의 변화를 확인할 수 있습니다',
    lead: '한 번의 우수한 결과보다 여러 주제와 역할에서 어떤 변화가 나타났는지를 확인할 때 토론 교육의 성과를 더 구체적으로 설명할 수 있습니다.',
    icon: BarChart3,
    leftTitle: '개인에게 남는 기록',
    leftItems: [
      '참여한 주제, 입장, 수준과 토론 일시',
      '단계별 발언 내용과 전체 토론 기록',
      '평가 항목별 점수, 총평과 개선 제안',
    ],
    rightTitle: '기관이 확인할 수 있는 내용',
    rightItems: [
      '구성원별 참여 이력과 완료한 토론',
      '개인별 결과 보고서와 누적 활동',
      '그룹 운영 현황과 후속 지도가 필요한 참여자',
    ],
    outcomeTitle: '성과 측정의 단위',
    outcomes: [
      { title: '개인', description: '지난 피드백과 현재 결과를 연결해 성장 과정을 확인합니다.' },
      { title: '수업·그룹', description: '참여 여부와 결과를 바탕으로 운영 상태를 점검합니다.' },
      { title: '기관', description: '활동 횟수와 결과 기록으로 교육 프로그램의 운영 근거를 남깁니다.' },
    ],
  },
  {
    id: 5,
    section: '핵심 4 · 참여 활성화와 자산화',
    title: '지속적인 참여가\n기관의 토론 자산을 만듭니다',
    lead: '참여하기 쉬운 토론장과 개인에게 돌아오는 피드백이 반복 참여의 이유가 되고, 그 과정에서 축적된 주제와 발언은 다음 교육에 활용할 수 있는 자료가 됩니다.',
    icon: Archive,
    leftTitle: '참여를 이어가는 구조',
    leftItems: [
      '기관이 목적과 수준에 맞는 전용 주제를 제공합니다.',
      '참여자는 토론 후 자신의 결과와 개선점을 확인합니다.',
      '이전 기록을 바탕으로 다음 주제와 목표에 도전합니다.',
    ],
    rightTitle: '기록을 자산으로 전환',
    rightItems: [
      '주제별 배경, 찬반 쟁점과 관련 기사 자료 축적',
      '발언과 평가 기록을 개인별 학습 포트폴리오로 활용',
      '공개에 동의한 우수 논증을 사례 자료로 재사용',
    ],
    outcomeTitle: '선순환 구조',
    outcomes: [
      { title: '주제 제공', description: '기관의 교육 목표에 맞는 토론 기회를 엽니다.' },
      { title: '실제 참여', description: '구성원이 질문과 반론을 주고받으며 기록을 만듭니다.' },
      { title: '피드백 확인', description: '개인에게 다음 참여의 구체적인 목표를 제공합니다.' },
      { title: '자료 축적', description: '다음 수업과 참여자에게 활용할 토론 사례가 쌓입니다.' },
    ],
  },
  {
    id: 6,
    section: '도입 전 판단 · 강점과 한계',
    title: '온라인 반복 훈련의 강점은 키우고\n현장 훈련의 역할은 남겨둡니다',
    lead: 'ThinkFit은 오프라인 실전 교육을 대체하는 제품이 아닙니다. 토론을 자주 열고 같은 기준으로 관리하기 어려웠던 운영의 빈틈을 채우고, 비언어 표현과 현장 긴장감은 대면 훈련으로 완성하는 혼합형 훈련 도구입니다.',
    icon: ShieldCheck,
    leftTitle: 'ThinkFit이 확실히 개선하는 영역',
    leftItems: [
      '시간과 장소의 제약을 낮춰 필요한 순간에 토론을 쉽게 개설합니다.',
      '반·강사·회차가 달라도 동일한 진행 구조와 평가 기준을 적용합니다.',
      '회원, 반 배정, 참여 이력과 결과 보고서를 한곳에서 관리합니다.',
      '개인·그룹별 반복 훈련 기회를 늘리고 변화 과정을 모니터링합니다.',
    ],
    rightTitle: '온라인만으로 대체하기 어려운 영역',
    rightItems: [
      '제스처, 시선 처리와 상대의 표정을 읽는 능력은 충분히 관찰하기 어렵습니다.',
      '자세, 태도, 공간을 장악하는 현장 전달력은 대면 코칭이 필요합니다.',
      '낯선 청중과 예측 불가능한 반응에서 오는 실전 긴장감을 완전히 재현할 수 없습니다.',
      'AI 평가는 지도자의 맥락적 판단과 최종 평가를 대신하지 않습니다.',
    ],
    outcomeTitle: '가장 효과적인 보완 운영 방식',
    outcomes: [
      { title: '1. 사전 반복', description: 'ThinkFit에서 주장·근거·반론 구조를 충분히 연습합니다.' },
      { title: '2. 대면 실전', description: '현장에서 제스처·시선·자세와 긴장 대응을 점검합니다.' },
      { title: '3. 지도자 코칭', description: '기록과 현장 관찰을 함께 보고 최종 피드백을 제공합니다.' },
      { title: '4. 재훈련', description: '확인된 약점을 다음 온라인 훈련 과제로 연결합니다.' },
    ],
    note: '기관이 얻는 핵심 가치는 대면 교육의 제거가 아니라, 귀한 대면 시간을 비언어 표현과 실전 코칭에 집중할 수 있도록 기본기 훈련과 기록 관리를 맡기는 것입니다.',
    comparison: true,
  },
  {
    id: 7,
    section: '도입 방식',
    title: '작게 시작하고\n기록으로 도입 효과를 확인합니다',
    lead: '처음부터 큰 운영 변화를 요구하지 않습니다. 한 그룹과 몇 개의 주제로 시작해 실제 참여와 결과 기록을 검토한 뒤 적용 범위를 결정할 수 있습니다.',
    icon: ClipboardCheck,
    leftTitle: '권장 시범 운영',
    leftItems: [
      '대상 그룹과 운영 기간을 정합니다.',
      '기관 목적에 맞는 토론 주제와 평가 수준을 설정합니다.',
      '정기 토론을 운영하고 개인별 결과를 함께 검토합니다.',
    ],
    rightTitle: '시범 운영에서 확인할 질문',
    rightItems: [
      '기존보다 실제 토론 기회를 더 자주 만들 수 있었는가?',
      '피드백이 참여자의 다음 행동을 구체화했는가?',
      '개인 및 기관 차원의 성과 기록이 남았는가?',
    ],
    outcomeTitle: '도입 절차',
    outcomes: [
      { title: '1. 범위 설정', description: '대상, 기간, 주제와 운영 목표를 합의합니다.' },
      { title: '2. 시범 운영', description: '기관 전용 공간에서 실제 토론을 진행합니다.' },
      { title: '3. 결과 검토', description: '참여 기록과 피드백 활용도를 확인합니다.' },
      { title: '4. 확대 결정', description: '확인된 필요와 효과에 따라 적용 범위를 조정합니다.' },
    ],
    note: '도입 판단의 기준은 기능의 수가 아니라, 실제 토론 기회와 피드백 활용, 성과 기록이 개선되는지 여부입니다.',
  },
];

export const B2BMarketingV2Page = () => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const slide = slides[currentSlide];
  const Icon = slide.icon;

  const goPrevious = () => setCurrentSlide(index => (index - 1 + slides.length) % slides.length);
  const goNext = () => setCurrentSlide(index => (index + 1) % slides.length);

  return (
    <main className="app-container page-scroll" style={{ maxWidth: 1180, padding: '1.5rem 1.25rem 4rem' }}>
      <nav className="flex justify-between items-center" style={{ gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={() => navigate('/institution')}>
          <ArrowLeft size={16} /> 기관 페이지로 돌아가기
        </button>
        <div className="flex items-center gap-2">
          <span className="badge" style={{ background: 'rgba(37,99,235,.12)', color: 'var(--primary)', borderColor: 'rgba(37,99,235,.3)' }}>B2B 제안서 Ver.2</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>기관·학교·교육 그룹용</span>
        </div>
      </nav>

      <article style={{ minHeight: 680, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)', boxShadow: '0 20px 50px -20px rgba(0,0,0,.35)' }}>
        <header className="flex justify-between items-center" style={{ gap: '1rem', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'rgba(37,99,235,.05)', flexWrap: 'wrap' }}>
          <div className="flex items-center gap-3">
            <span style={{ width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, color: '#fff', background: 'var(--primary)' }}><Presentation size={19} /></span>
            <div>
              <strong style={{ display: 'block', color: 'var(--text-light)' }}>ThinkFit 기관 도입 제안</strong>
              <small style={{ color: 'var(--text-muted)' }}>토론 운영부터 평가와 기록까지</small>
            </div>
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '.82rem', fontWeight: 700 }}>{String(currentSlide + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span>
        </header>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '2rem clamp(1.2rem, 4vw, 3rem)' }}>
          <section className="flex justify-between items-start" style={{ gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 600px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.45rem', color: 'var(--primary)', fontSize: '.82rem', fontWeight: 800 }}><Icon size={17} /> {slide.section}</span>
              <h1 style={{ margin: '.65rem 0 .8rem', color: 'var(--text-light)', fontSize: 'clamp(1.8rem, 4vw, 2.65rem)', lineHeight: 1.25, whiteSpace: 'pre-line', letterSpacing: '-.03em' }}>{slide.title}</h1>
              <p style={{ maxWidth: 820, margin: 0, color: 'var(--text-main)', fontSize: '1.02rem', lineHeight: 1.75 }}>{slide.lead}</p>
            </div>
            <div style={{ width: 86, height: 86, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 22, color: 'var(--primary)', background: 'rgba(37,99,235,.09)', border: '1px solid rgba(37,99,235,.18)' }}><Icon size={38} /></div>
          </section>

          <section className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {[
              { title: slide.leftTitle, items: slide.leftItems, icon: slide.comparison ? ShieldCheck : Gavel, tone: slide.comparison ? 'strength' : 'default' },
              { title: slide.rightTitle, items: slide.rightItems, icon: slide.comparison ? CircleAlert : BookOpenCheck, tone: slide.comparison ? 'limitation' : 'default' },
            ].map(column => {
              const ColumnIcon = column.icon;
              const ItemIcon = column.tone === 'limitation' ? CircleAlert : CheckCircle2;
              const accent = column.tone === 'strength' ? '#22c55e' : column.tone === 'limitation' ? 'var(--accent-amber)' : 'var(--primary)';
              const borderColor = column.tone === 'strength' ? 'rgba(34,197,94,.32)' : column.tone === 'limitation' ? 'rgba(217,119,6,.32)' : 'var(--border-color)';
              const surface = column.tone === 'strength' ? 'rgba(34,197,94,.055)' : column.tone === 'limitation' ? 'rgba(217,119,6,.055)' : 'var(--bg-primary)';
              return (
                <div key={column.title} style={{ padding: '1.25rem', border: `1px solid ${borderColor}`, borderTop: `3px solid ${accent}`, borderRadius: 'var(--radius-md)', background: surface }}>
                  <h2 className="flex items-center gap-2" style={{ margin: '0 0 .9rem', color: 'var(--text-light)', fontSize: '1rem' }}><ColumnIcon size={18} color={accent} /> {column.title}</h2>
                  <ul style={{ display: 'grid', gap: '.7rem', margin: 0, padding: 0, listStyle: 'none' }}>
                    {column.items.map(item => <li key={item} className="flex items-start gap-2" style={{ color: 'var(--text-main)', lineHeight: 1.55 }}><ItemIcon size={16} color={accent} style={{ flexShrink: 0, marginTop: 4 }} /> {item}</li>)}
                  </ul>
                </div>
              );
            })}
          </section>

          <section>
            <h2 style={{ margin: '0 0 .8rem', color: 'var(--text-muted)', fontSize: '.82rem', letterSpacing: '.04em' }}>{slide.outcomeTitle}</h2>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              {slide.outcomes.map((outcome, index) => (
                <div key={outcome.title} style={{ minHeight: 105, padding: '1rem', borderTop: `3px solid ${index % 2 ? 'var(--accent-amber)' : 'var(--primary)'}`, borderRadius: '0 0 var(--radius-sm) var(--radius-sm)', background: 'rgba(148,163,184,.045)' }}>
                  <strong style={{ display: 'block', marginBottom: '.4rem', color: 'var(--text-light)' }}>{outcome.title}</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: '.86rem', lineHeight: 1.55 }}>{outcome.description}</span>
                </div>
              ))}
            </div>
          </section>

          {slide.note && <p style={{ margin: 0, padding: '.85rem 1rem', borderLeft: '3px solid var(--accent-amber)', color: 'var(--text-main)', background: 'rgba(217,119,6,.06)', lineHeight: 1.6, fontSize: '.9rem' }}>{slide.note}</p>}
        </div>

        <footer className="flex justify-between items-center" style={{ gap: '1rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-primary)', flexWrap: 'wrap' }}>
          <div className="flex items-center gap-2" aria-label="제안서 페이지 선택">
            {slides.map((item, index) => (
              <button key={item.id} type="button" onClick={() => setCurrentSlide(index)} aria-label={`${index + 1}페이지: ${item.section}`} style={{ width: index === currentSlide ? 28 : 9, height: 9, padding: 0, border: 0, borderRadius: 10, cursor: 'pointer', background: index === currentSlide ? 'var(--primary)' : 'var(--border-color)', transition: 'width .2s' }} />
            ))}
          </div>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={goPrevious}><ChevronLeft size={16} /> 이전</button>
            <button className="btn btn-secondary" onClick={goNext}>다음 <ChevronRight size={16} /></button>
            <button className="btn btn-primary" onClick={() => navigate('/institution')}><Users size={16} /> 기관 서비스 확인</button>
          </div>
        </footer>
      </article>
    </main>
  );
};
