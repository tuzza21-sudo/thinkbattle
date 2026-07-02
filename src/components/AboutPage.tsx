import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Brain, Zap, Target } from 'lucide-react';

const SkillBox = ({ title, desc, color }: { title: string, desc: string, color: string }) => (
  <div style={{ background: 'var(--bg-secondary)', padding: '1.2rem', borderRadius: '8px', border: `1px solid ${color}40`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
    <div style={{ fontWeight: 800, color: color, marginBottom: '0.4rem', fontSize: '1.1rem' }}>{title}</div>
    <div style={{ fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
  </div>
);

export const AboutPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="app-container page-scroll" style={{ paddingBottom: '5rem', maxWidth: '800px', margin: '0 auto' }}>
      <header className="flex items-center gap-4" style={{ marginBottom: '3rem' }}>
        <button className="icon-button" onClick={() => navigate(-1)} aria-label="뒤로 가기" style={{ background: 'var(--bg-secondary)' }}>
          <ChevronLeft size={24} color="var(--text-main)" />
        </button>
        <h1 style={{ fontSize: '2rem', color: 'var(--text-light)', margin: 0 }}>
          서비스 소개
        </h1>
      </header>

      <main className="flex flex-col gap-8">
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1rem' }}>
          <h3 style={{ fontSize: '1.8rem', color: 'var(--text-light)', margin: '1rem 0 1.5rem 0', textAlign: 'center' }}>우리의 미션</h3>
          
          <div className="card flex items-start gap-5" style={{ padding: '2rem', borderLeft: '4px solid var(--primary)' }}>
            <div style={{ background: 'rgba(37, 99, 235, 0.1)', padding: '1.2rem', borderRadius: '50%', flexShrink: 0 }}>
              <Brain size={32} color="var(--primary)" />
            </div>
            <div>
              <h4 style={{ fontSize: '1.3rem', color: 'var(--text-light)', marginBottom: '0.8rem' }}>
                1. AI 시대 사고력 특화 훈련
              </h4>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, fontSize: '1.05rem' }}>
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.5rem', fontSize: '1.1rem' }}>AI가 답을 대신해 주는 시대, 중요한 것은 답을 얻는 능력이 아니라 답을 판단하는 능력입니다.</strong>
                ThinkFit은 AI와 함께 토론하고 질문하며, AI에 의존하지 않는 논리적 사고력과 비판적 사고력을 체계적으로 훈련합니다.
              </p>
            </div>
          </div>

          <div className="card flex items-start gap-5" style={{ padding: '2rem', borderLeft: '4px solid var(--accent-amber)' }}>
            <div style={{ background: 'rgba(217, 119, 6, 0.1)', padding: '1.2rem', borderRadius: '50%', flexShrink: 0 }}>
              <Zap size={32} color="var(--accent-amber)" />
            </div>
            <div>
              <h4 style={{ fontSize: '1.3rem', color: 'var(--text-light)', marginBottom: '0.8rem' }}>
                2. 몸을 단련하듯 사고력을 단련하다
              </h4>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, fontSize: '1.05rem' }}>
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.5rem', fontSize: '1.1rem' }}>사고력도 근육처럼 훈련할수록 강해집니다.</strong>
                ThinkFit은 실전 디베이트 프로세스를 기반으로 주장, 질문, 반박, 분석을 반복하며 순발력 있는 논리적 사고와 실전 사고력을 체계적으로 성장시키는 사고력 피트니스를 제공합니다.
              </p>
            </div>
          </div>

          <div className="card flex items-start gap-5" style={{ padding: '2rem', borderLeft: '4px solid #10b981' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '1.2rem', borderRadius: '50%', flexShrink: 0 }}>
              <Target size={32} color="#10b981" />
            </div>
            <div>
              <h4 style={{ fontSize: '1.3rem', color: 'var(--text-light)', marginBottom: '0.8rem' }}>
                3. 레벨 & 경험치로 성장하는 사고력
              </h4>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0, fontSize: '1.05rem' }}>
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '0.5rem', fontSize: '1.1rem' }}>사고력도 성장 과정을 확인할 수 있어야 합니다.</strong>
                토론 미션을 수행할 때마다 경험치(XP)와 레벨을 획득하고, 논리력·근거력·질문력·반박력 등 핵심 사고력을 AI가 분석하여 성장 과정을 시각적으로 확인할 수 있습니다. 레벨이 올라갈수록 더욱 높은 수준의 사고력 훈련에 도전할 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '3rem' }}>
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.8rem', color: 'var(--text-light)', margin: '0 0 0.5rem 0' }}>씽크배틀: 논리적 사고의 진화</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>초급에서 고급으로 나아가며, 8가지 핵심 논리 역량을 날카로운 무기로 진화시킵니다.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Step 1: Beginner */}
            <div className="card" style={{ padding: '2rem', borderLeft: '4px solid #3b82f6', background: 'linear-gradient(to right, rgba(59,130,246,0.05), transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ background: '#3b82f6', color: '#fff', padding: '0.2rem 0.8rem', borderRadius: '20px', fontWeight: 800, fontSize: '0.9rem' }}>STEP 1</span>
                <h4 style={{ fontSize: '1.4rem', color: 'var(--text-light)', margin: 0 }}>초급: 토론의 기본기</h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <SkillBox title="논지파악력" desc="상대의 핵심 주장을 정확히 이해하는 힘" color="#3b82f6" />
                <SkillBox title="논리력" desc="생각을 일관된 논리로 연결하는 힘" color="#3b82f6" />
                <SkillBox title="근거력" desc="주장을 신뢰할 수 있는 증거로 뒷받침하는 힘" color="#3b82f6" />
                <SkillBox title="질문력" desc="핵심을 꿰뚫는 질문으로 논의를 깊게 만드는 힘" color="#3b82f6" />
                <SkillBox title="반박력" desc="논리적 허점을 찾아 설득력 있게 대응하는 힘" color="#3b82f6" />
              </div>
            </div>

            {/* Step 2: Intermediate */}
            <div className="card" style={{ padding: '2rem', borderLeft: '4px solid #10b981', background: 'linear-gradient(to right, rgba(16,185,129,0.05), transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ background: '#10b981', color: '#fff', padding: '0.2rem 0.8rem', borderRadius: '20px', fontWeight: 800, fontSize: '0.9rem' }}>STEP 2</span>
                <h4 style={{ fontSize: '1.4rem', color: 'var(--text-light)', margin: 0 }}>중급: 분석과 판단의 심화</h4>
              </div>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>단순한 반박을 넘어, 눈에 보이지 않는 맥락을 읽어내고 가치의 우위를 점하는 고차원적 분석력을 연마합니다.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <SkillBox title="전제파악능력" desc="숨겨진 가정과 전제를 발견하는 분석력" color="#10b981" />
                <SkillBox title="우선순위 판단력" desc="여러 가치와 근거를 비교해 더 중요한 기준을 제시하는 판단력" color="#10b981" />
              </div>
            </div>

            {/* Step 3: Advanced */}
            <div className="card" style={{ padding: '2rem', borderLeft: '4px solid #f59e0b', background: 'linear-gradient(to right, rgba(245,158,11,0.05), transparent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ background: '#f59e0b', color: '#fff', padding: '0.2rem 0.8rem', borderRadius: '20px', fontWeight: 800, fontSize: '0.9rem' }}>STEP 3</span>
                <h4 style={{ fontSize: '1.4rem', color: 'var(--text-light)', margin: 0 }}>고급: 판을 뒤집는 전략가</h4>
              </div>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>토론의 룰 자체를 지배하는 최상위 논리 전술을 구사합니다. 승패를 가르는 가장 강력한 무기입니다.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                <SkillBox title="프레이밍 능력" desc="문제를 새로운 관점에서 바라보고 논쟁의 기준을 재설정하는 전략적 사고력" color="#f59e0b" />
              </div>
            </div>
          </div>
        </section>
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '3rem' }}>
          <h3 style={{ fontSize: '1.8rem', color: 'var(--text-light)', margin: '0 0 0.5rem 0', textAlign: 'center' }}>이런 분들에게 추천합니다</h3>
          
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '1.2rem', color: 'var(--text-light)', marginBottom: '0.6rem' }}>
                🌍 글로벌 리더 · 사회혁신가
              </h4>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, fontSize: '0.95rem' }}>
                국제 이슈와 사회 문제에 관심을 가지고, 더 나은 사회를 위한 리더십과 설득력, 공론장에서의 사고력을 기르고 싶은 분
              </p>
            </div>

            <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '1.2rem', color: 'var(--text-light)', marginBottom: '0.6rem' }}>
                🎓 수험생 · 학생
              </h4>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, fontSize: '0.95rem' }}>
                논술, 면접, 수행평가, 토론대회 등에서 필요한 논리적 사고력과 설득력을 키우고 싶은 분
              </p>
            </div>

            <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '1.2rem', color: 'var(--text-light)', marginBottom: '0.6rem' }}>
                💼 취업 준비생
              </h4>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, fontSize: '0.95rem' }}>
                AI 면접, PT 면접, 토론 면접, 자기소개에서 논리적으로 말하고 설득하는 능력을 기르고 싶은 분
              </p>
            </div>

            <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '1.2rem', color: 'var(--text-light)', marginBottom: '0.6rem' }}>
                👨‍💼 직장인 · 리더
              </h4>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, fontSize: '0.95rem' }}>
                회의, 보고, 발표, 협상 등에서 생각을 명확하게 전달하고 설득력을 높이고 싶은 분
              </p>
            </div>

            <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '1.2rem', color: 'var(--text-light)', marginBottom: '0.6rem' }}>
                🧑‍🏫 강사 · 교사 · 학부모
              </h4>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, fontSize: '0.95rem' }}>
                학생들의 논리력, 질문력, 비판적 사고력을 체계적으로 지도하고 싶은 분
              </p>
            </div>

            <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '1.2rem', color: 'var(--text-light)', marginBottom: '0.6rem' }}>
                🤖 AI 시대를 준비하는 모든 사람
              </h4>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, fontSize: '0.95rem' }}>
                AI의 답을 그대로 받아들이기보다, 스스로 생각하고 판단하는 사고력을 기르고 싶은 모든 분
              </p>
            </div>
          </div>
        </section>

        <section style={{ textAlign: 'center', marginTop: '2rem', padding: '3rem 2rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '1.6rem', color: 'var(--text-light)', marginBottom: '1rem' }}>
            이제 생각의 근육을 키울 시간입니다.
          </h3>
          <button className="btn btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }} onClick={() => navigate('/')}>
            토론 시작하기
          </button>
        </section>
      </main>
    </div>
  );
};
