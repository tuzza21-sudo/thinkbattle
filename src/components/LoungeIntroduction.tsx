import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, AudioLines, BarChart3, BookMarked, BookOpen, Briefcase, Eye, Feather, GraduationCap, Handshake, Landmark, Lock,
  MessageCircle, Mic, Newspaper, Palette, Phone, ShieldCheck, Target, UserRound,
} from 'lucide-react';
import { getLoungeHost, loungeCharacterProfiles } from '../lib/lounge';
import { loungeCharacters } from '../lib/loungeCharacters';
import './LoungeIntroduction.css';

const bars = [14, 26, 38, 22, 46, 30, 18, 40, 28, 16, 34, 24, 44, 20, 32];

/**
 * What can be practised, and with whom (2026-11-26, by the owner: 사석 told apart from companion chat services, as
 * companions for hands-on practice of practical things). `training` ones have their own lesson or training room with
 * steps and results set by code; the others are taught in the character's one-to-one conversation.
 */
const programs = [
  { id: 'teacher', field: '영어 회화 · B1~C1', title: '내 생각과 감정을 영어로', icon: GraduationCap, training: true,
    text: '일상의 장면을 주면 내가 먼저 영어로 말해요. 정답은 먼저 보여 주지 않고, 막히면 뜻 → 첫 단어 → 정답 순서로 힌트를 줘요. 내 문장은 목표 레벨로 고쳐 줘요.' },
  { id: 'interpreter', field: '비즈니스 영어 · 국제회의 동시통역사', title: '회의·협상·발표의 영어', icon: Landmark, training: true,
    text: '격식 있는 자리의 상황과 예문으로 연습해요. 같은 말이 상대에 따라 어떻게 다르게 들리는지, 한국 사람이 왜 그 표현을 헷갈리는지까지 짚어 줘요.' },
  { id: 'closer', field: '실전 협상 · 협상가', title: '상대가 되어 버티는 협상', icon: Handshake, training: true,
    text: '중고차, 연봉, 전세, 견적, 단가, 토지 매입. 협상가가 상대편을 맡고, 상대의 한계선과 숨은 사정은 끝날 때까지 숨겨져요. 끝나면 내가 가져온 몫을 숫자로 보여 줘요.' },
  { id: 'trickster', field: '압박 면접 · 심리 칼럼니스트', title: '두 번째 질문에서 무너지지 않게', icon: Briefcase, training: true,
    text: '지원 직무와 이력에 맞춘 질문을 만들고, 답이 막연하면 꼬리 질문으로 파고들어요. 압박은 답에만 해요. 끝나면 질문별 점수와 더 나은 답을 받아요.' },
  { id: 'ina', field: '감성적·문학적 글쓰기 · 출판 편집자', title: '감정을 보여 주는 문장', icon: Feather, training: true,
    text: '오감 묘사, 이름 없는 감정, 보내지 않을 편지, 덜어 내기 같은 과제를 골라 써요. 쓴 글에는 감각·절제·리듬·여운을 매긴 첨삭 카드와 다시 쓴 예가 붙어요.' },
  { id: 'diplomat', field: '논리적·설득적 글쓰기 · 사회부 기자', title: '주장과 근거로 움직이는 글', icon: Newspaper, training: true,
    text: '주장 한 문장, 근거 세 개, 반론 먼저, 칼럼 첫 문단, 제안 메일 같은 과제를 골라 써요. 기자의 눈으로 주장·근거·반론·구조를 매기고 고칠 곳을 짚어 줘요.' },
  { id: 'guide', field: '이탈리아 문화기행 · 현지 가이드', title: '피렌체·베네치아 명소 탐험', icon: MessageCircle, training: true,
    text: '두오모, 우피치, 산 마르코, 리알토까지 15곳. 명소를 고르면 사진과 함께 배경과 역사, 문화유산의 가치, 꼭 볼 것을 보고, 한지오가 그곳에 함께 선 것처럼 안내해요.' },
  { id: 'velvet', field: '근현대 미술사 · 미술사 전공 아트 디렉터', title: '그림 한 점에 담긴 시대', icon: Palette, training: true,
    text: '모네, 고흐, 클림트, 칸딘스키부터 피카소, 워홀, 김환기까지. 작품을 고르면 선우령이 먼저 무엇이 보이는지 묻고, 시대와 보는 법, 의미를 풀어 줘요.' },
] as const;
const records = [
  { icon: BookMarked, title: '학습 보드', text: '넣은 단어와 표현을 날짜별로, 순위와 레벨(B1 쉬움 · B2 보통 · C1 어려움)별로 정리해요. 무엇부터 할지 한눈에 보여요.' },
  { icon: BarChart3, title: '결과 리포트', text: '협상은 상대의 실제 한계선과 내가 가져온 몫을, 면접은 질문별 점수와 가장 약했던 답을 보여 줘요.' },
  { icon: BookOpen, title: '피드백 기록', text: '내가 한 말을 고친 문장이 날짜별로 쌓여요. 방을 새로 열어도 기록은 내 계정에 남아요.' },
];
const fairness = [
  { title: '정답을 먼저 보여 주지 않아요', text: '영어 표현은 내가 스스로 떠올려 말할 때까지 숨겨요. 힌트를 받고 말하면 "힌트로 말함", 혼자 말하면 "스스로 말함", 다른 날 또 말하면 "내 것"에 가까워져요.' },
  { title: '결과는 규칙이 정해요', text: '협상 상대는 정해진 규칙대로만 양보하고, 말로 구슬려도 한계선을 넘지 않아요. 면접 꼬리 질문도 고른 압박 단계에 따라 정해져요.' },
  { title: '끝나면 코치로 돌아와요', text: '협상가와 면접관은 훈련이 끝나면 역할을 내려놓고 코치가 되어 잘한 수와 놓친 수, 다음에 쓸 팁을 짚어 줘요.' },
  { title: '내 목표에 맞춰요', text: '영어 수업은 시작할 때 목표 레벨, 학습 목적, 대화하고 싶은 주제를 고르면 그에 맞는 상황으로 수업을 이끌어요.' },
];
const trustItems = [
  { icon: Eye, title: '가상의 인물이에요', text: '모든 캐릭터와 사진, 목소리는 AI로 만든 가상의 인물이에요. 실제 전문가의 조언이나 공인 시험·평가를 대신하지 않아요.' },
  { icon: ShieldCheck, title: '훈련은 훈련답게', text: '영어 수업과 실전 훈련에서는 연애나 플러팅을 하지 않아요. 압박 면접도 답의 내용만 파고들고 사람을 깎아내리지 않아요.' },
  { icon: Lock, title: '내 기록은 내 계정에', text: '학습 어휘와 피드백, 훈련 결과는 내 계정에만 보관되고, 계정을 삭제하면 모두 지워져요.' },
  { icon: Target, title: '숫자는 연습용이에요', text: '협상 결과와 면접 점수는 연습을 돕기 위한 지표예요. 실제 협상이나 채용 결과를 보장하지 않아요.' },
];
const startSteps = [
  { icon: Target, title: '실전 훈련을 골라요', text: '홈의 ‘실전 훈련’에서 영어, 협상, 면접, 글쓰기, 문화기행, 미술사 중 오늘 연습할 것을 골라요.' },
  { icon: UserRound, title: '목표와 상황을 정해요', text: '영어는 목표 레벨과 주제를, 협상은 상황과 난이도를, 면접은 직무와 압박 단계를 골라요.' },
  { icon: Mic, title: '직접 말하고 고쳐요', text: '채팅으로, 또는 전화로 직접 말해요. 끝나면 피드백과 결과가 기록으로 남아요.' },
];
/** Two of the stories, for the evenings without practice: the companions are still there. */
const stories = [
  { id: 'guide', title: '장밋빛으로 물드는 시간', hook: '이탈리아 소규모 여행 첫날, 공항에서 차량 배차가 꼬였다. 농담만 하던 가이드가 처음으로 단호해졌다.', genre: '여행 · 이야기' },
  { id: 'diplomat', title: '오래된 친구와의 썸', hook: '3년째 금요일 밤마다 앉는 조수석. 오늘은 회색 세단이 따라오고, 그녀가 말끝을 흐린다.', genre: '서스펜스 · 이야기' },
] as const;

/**
 * Adds the `is-in` class to each `.reveal` element once it is near the viewport. The check runs right away, on scroll and
 * on resize rather than only through an observer, so nothing stays hidden if an observer callback never arrives.
 */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const items = Array.from(root.current?.querySelectorAll<HTMLElement>('.reveal') ?? []);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { items.forEach(item => item.classList.add('is-in')); return; }
    let pending = items.filter(item => !item.classList.contains('is-in'));
    const check = () => {
      const limit = window.innerHeight * 0.92;
      pending = pending.filter(item => { if (item.getBoundingClientRect().top < limit) { item.classList.add('is-in'); return false; } return true; });
      if (!pending.length) { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); }
    };
    check();
    window.addEventListener('scroll', check, { passive: true }); window.addEventListener('resize', check);
    return () => { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, [root]);
}

/**
 * The service introduction (rewritten 2026-11-26, by the owner): 사석 as companions for hands-on practice of practical
 * things (English, negotiation, interviews, writing, an Italian culture trip, art history), not a companion chat
 * service; the stories stay as the evenings' other side. The cast is read from the data.
 */
export function LoungeIntroduction() {
  const page = useRef<HTMLElement>(null);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
  useReveal(page);
  const lessonHost = getLoungeHost('interpreter'), callHost = getLoungeHost('closer');
  const nameOf = (id: string) => loungeCharacters.find(character => character.id === id)?.name ?? getLoungeHost(id).name;
  const heroFaces = ['teacher', 'closer', 'trickster'] as const;
  return <main className="lounge-introduction" ref={page}>
    <section className="lounge-intro-hero" aria-labelledby="lounge-intro-title">
      <img className="lounge-intro-hero-photo" src="/lounge/boardroom-v1.webp" alt="" fetchPriority="high" />
      <div className="lounge-intro-hero-shade" aria-hidden="true" />
      <div className="lounge-intro-hero-copy">
        <span className="lounge-intro-kicker"><Target size={14} /> SASEOK · 실전 체험형 AI 컴패니언</span>
        <h1 id="lounge-intro-title">눈으로 읽고 끝나는 공부 말고,<br /><em>직접 말하고 부딪혀 보는 연습.</em></h1>
        <p>영어 회화, 협상, 면접, 글쓰기, 이탈리아 문화기행, 미술사까지.<br />그 분야의 전문가 캐릭터가 실제 상황의 상대가 되고, 당신이 직접 말하게 해요.<br />끝나면 무엇이 좋았고 무엇을 고칠지 기록으로 남아요.</p>
        <div className="lounge-intro-actions">
          <Link className="lounge-intro-button primary" to="/">실전 훈련 시작하기 <ArrowRight size={16} /></Link>
          <Link className="lounge-intro-button ghost" to="/lounge/guide">이용 가이드 보기</Link>
        </div>
        <div className="lounge-intro-wave" aria-hidden="true">{bars.map((height, index) => <i key={index} style={{ height, animationDelay: `${index * 0.09}s` }} />)}</div>
      </div>
      <div className="lounge-intro-hero-faces" aria-label="가상의 AI 캐릭터 예시">
        {heroFaces.map((id, index) => { const host = getLoungeHost(id); return <figure key={id} className={`face face-${index}`} style={{ background: host.color }}><img src={host.portrait} alt={`${nameOf(id)} · 가상의 AI 캐릭터`} /><figcaption>{nameOf(id)}</figcaption></figure>; })}
        <span className="lounge-intro-faces-note">가상의 AI 캐릭터 · 합성 이미지</span>
      </div>
    </section>

    <div className="lounge-intro-facts reveal" aria-label="서비스 한눈에 보기">
      <span><strong>직접 말하기</strong><small>정답을 먼저 보여 주지 않아요</small></span>
      <span><strong>실전 상황</strong><small>회의·협상·면접·여행</small></span>
      <span><strong>공정한 판정</strong><small>결과는 규칙과 점수로</small></span>
      <span><strong>성장 기록</strong><small>학습 보드와 결과 리포트</small></span>
    </div>

    <section className="lounge-intro-characters lounge-intro-stories" aria-labelledby="lounge-intro-programs-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">01 · PRACTICE</span><h2 id="lounge-intro-programs-title">배우고 싶은 것을,<br />그 분야의 사람과 직접.</h2><p>영어·협상·면접은 단계와 결과가 있는 1:1 실전 훈련으로,<br />글쓰기·문화기행·미술사는 과제와 명소, 작품을 골라 배우는 1:1 클래스로 해요.</p></div>
      <div className="lounge-intro-story-grid">
        {programs.map(program => { const host = getLoungeHost(program.id); return <Link key={program.id} className="lounge-intro-story reveal" to={`/lounge/characters/${program.id}`} style={{ ['--tint' as string]: host.color }}>
          <img src={host.portrait} alt={`${nameOf(program.id)}, 가상의 AI 캐릭터`} loading="lazy" />
          <div><span><program.icon size={12} aria-hidden="true" /> {program.field} · {nameOf(program.id)}</span><h3>{program.title}</h3><p>{program.text}</p><b>{['ina', 'diplomat', 'guide', 'velvet'].includes(program.id) ? '1:1 클래스' : '1:1 실전 훈련'} <ArrowRight size={14} /></b></div>
        </Link>; })}
      </div>
    </section>

    <section className="lounge-intro-split" aria-labelledby="lounge-intro-how-lesson">
      <div className="lounge-intro-split-copy reveal">
        <span className="lounge-intro-number">02 · HOW IT WORKS</span>
        <h2 id="lounge-intro-how-lesson">상황은 캐릭터가,<br />말은 내가.</h2>
        <p>사석의 캐릭터는 정답을 알려 주는 선생님이 아니라, 실제 상황의 상대예요. 회의 자리, 협상 테이블, 면접장을 만들어 주고 내가 먼저 말하게 해요. 막히면 한 단계씩만 힌트를 주고, 말한 뒤에는 내 문장을 목표 레벨로 고쳐 줘요.</p>
        <ul className="lounge-intro-points"><li><MessageCircle size={16} /> 상황 제시 → 직접 말하기 → 힌트 → 교정 → 다른 상황에서 다시</li><li><GraduationCap size={16} /> 목표 레벨 B1 초급 · B2 중급 · C1 상급</li><li><Target size={16} /> 내가 고른 목적과 주제(업무, 여행, 연애, 취업…)에 맞춘 장면</li></ul>
      </div>
      <div className="lounge-intro-phone reveal" aria-label="영어 수업 화면 예시">
        <img src="/lounge/hotel-lounge-night-v1.webp" alt="" />
        <div className="lounge-intro-phone-shade" aria-hidden="true" />
        <div className="lounge-intro-phone-top"><span><i /> LESSON</span><b>비즈니스 영어 · 오늘 2/6</b></div>
        <div className="lounge-intro-chat">
          <div className="bubble host"><img src={lessonHost.portrait} alt="" /><div><small>국제회의 동시통역사 · {nameOf('interpreter')}</small><p>회의에서 상대가 일정 연기를 반대해요. 그 이유는 이해하지만, 그래도 2주가 더 필요하다고 정중하게 말해 볼래요?</p></div></div>
          <div className="bubble me"><div><small>나</small><p>I know your reason, but we need two more weeks.</p></div></div>
          <div className="bubble host"><img src={lessonHost.portrait} alt="" /><div><small>국제회의 동시통역사 · {nameOf('interpreter')}</small><p>뜻은 정확해요. 회의에서는 "I see where you're coming from, but…"이 반대를 훨씬 부드럽게 꺼내 줘요. 이 표현으로 다시 말해 볼까요?</p></div></div>
        </div>
        <span className="lounge-intro-phone-note">화면 구성 예시 · 실제 수업이 아니에요</span>
      </div>
    </section>

    <section className="lounge-intro-bond" aria-labelledby="lounge-intro-fair">
      <div className="lounge-intro-bond-copy reveal">
        <span className="lounge-intro-number">03 · FAIR PRACTICE</span>
        <h2 id="lounge-intro-fair">말로 넘어가 주지 않는,<br />진짜 연습 상대.</h2>
        <p>AI는 보통 사용자 편을 들어요. 그래서 사석의 훈련은 판정과 결과를 AI의 기분이 아니라 규칙과 점수로 정해요. 쉽게 져 주지 않는 상대라서, 연습한 만큼 실전에서 버틸 수 있어요.</p>
        <div className="lounge-intro-remember">{records.map(item => <article key={item.title}><item.icon size={18} /><div><b>{item.title}</b><small>{item.text}</small></div></article>)}</div>
      </div>
      <div className="reveal">
        <div className="lounge-intro-bond-who"><img src={getLoungeHost('closer').portrait} alt="" /><span><b>실전 훈련의 네 가지 약속</b><small>영어 수업 · 협상 · 면접</small></span></div>
        <ol className="lounge-intro-ladder" aria-label="실전 훈련의 원칙">
          {fairness.map((item, index) => <li key={item.title} style={{ ['--i' as string]: index }}><span className="dot">{index + 1}</span><div><b>{item.title}</b><p>{item.text}</p></div></li>)}
        </ol>
      </div>
    </section>

    <section className="lounge-intro-split lounge-intro-voice" aria-labelledby="lounge-intro-voice-title">
      <div className="lounge-intro-call reveal" aria-label="통화 화면 예시">
        <img src={callHost.portrait} alt="" />
        <div className="lounge-intro-call-shade" aria-hidden="true" />
        <div className="lounge-intro-call-body">
          <span className="lounge-intro-call-state"><i /> 협상 훈련 · 라운드 3/12</span>
          <b>{nameOf('closer')}</b><small>협상 훈련 코치</small>
          <div className="lounge-intro-wave" aria-hidden="true">{bars.slice(0, 11).map((height, index) => <i key={index} style={{ height, animationDelay: `${index * 0.11}s` }} />)}</div>
          <div className="lounge-intro-call-buttons" aria-hidden="true"><span><Mic size={20} /></span><span className="end"><Phone size={20} /></span></div>
        </div>
        <span className="lounge-intro-phone-note">화면 구성 예시</span>
      </div>
      <div className="lounge-intro-split-copy reveal">
        <span className="lounge-intro-number">04 · VOICE PRACTICE</span>
        <h2 id="lounge-intro-voice-title">실전은 말로 하니까,<br />연습도 전화로.</h2>
        <p>영어 수업도, 협상도, 면접도 전화로 할 수 있어요. 타이핑할 시간 없이 바로 답해야 하는 긴장감까지 그대로 연습해요. 통화가 끝나면 그 내용이 채팅과 기록으로 이어져요.</p>
        <ul className="lounge-intro-points"><li><Phone size={16} /> 말하면 바로 대답하는 실시간 통화</li><li><AudioLines size={16} /> 영어 수업에서는 영어로 말해도 그대로 알아들어요</li><li><Mic size={16} /> 영어 수업과 실전 훈련 통화는 테스트 기간 동안 무료예요</li></ul>
      </div>
    </section>

    <section className="lounge-intro-characters" id="characters" aria-labelledby="lounge-intro-cast">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">THE EXPERTS</span><h2 id="lounge-intro-cast">분야마다, 그 일을 해 온 사람.</h2><p>통역사, 협상가, 편집자, 기자, 가이드, 아트 디렉터.<br />직업과 경험이 다른 캐릭터들이 각자의 분야로 연습 상대가 되어 줘요.</p></div>
      <div className="lounge-intro-cast-grid">
        {loungeCharacters.map(character => {
          const host = getLoungeHost(character.id), profile = loungeCharacterProfiles[character.id];
          return <Link to={`/lounge/characters/${character.id}`} className="lounge-intro-card reveal" key={character.id} style={{ ['--tint' as string]: host.color }}>
            <div className="lounge-intro-card-photo"><img src={host.portrait} alt={`${character.name}, 가상의 AI 캐릭터`} loading="lazy" /></div>
            <div className="lounge-intro-card-body">
              <span className="job">{character.job}</span>
              <h3>{character.name}</h3>
              <p className="quote">“{character.quote}”</p>
              {profile && <ul>{profile.traits.map(trait => <li key={trait}>{trait}</li>)}</ul>}
            </div>
          </Link>;
        })}
      </div>
      <p className="lounge-intro-fineprint">모든 캐릭터와 사진은 가상의 인물이에요. 실제 인물이나 전문가의 조언을 대신하지 않아요.</p>
    </section>

    <section className="lounge-intro-characters lounge-intro-stories" aria-labelledby="lounge-intro-stories-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">AFTER PRACTICE</span><h2 id="lounge-intro-stories-title">연습이 끝난 저녁엔, 이야기 속으로.</h2><p>같은 캐릭터들과 이야기를 함께 만들어 가는 대화도 있어요. 훈련과는 따로 진행돼요.</p></div>
      <div className="lounge-intro-story-grid">
        {stories.map(story => { const host = getLoungeHost(story.id); return <Link key={story.id} className="lounge-intro-story reveal" to={`/lounge/characters/${story.id}#stories`} style={{ ['--tint' as string]: host.color }}>
          <img src={host.portrait} alt={`${nameOf(story.id)}, 가상의 AI 캐릭터`} loading="lazy" />
          <div><span>{story.genre} · {nameOf(story.id)}</span><h3>{story.title}</h3><p>{story.hook}</p><b>이 이야기로 시작하기 <ArrowRight size={14} /></b></div>
        </Link>; })}
      </div>
    </section>

    <section className="lounge-intro-trust" aria-labelledby="lounge-intro-trust-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">FEEL SAFE</span><h2 id="lounge-intro-trust-title">마음 놓고 연습하도록.</h2></div>
      <div className="lounge-intro-trust-grid two">{trustItems.map(item => <article className="reveal" key={item.title}><item.icon size={20} /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
    </section>

    <section className="lounge-intro-how" aria-labelledby="lounge-intro-how-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">GET STARTED</span><h2 id="lounge-intro-how-title">세 걸음이면 첫 연습이에요.</h2></div>
      <ol>{startSteps.map((step, index) => <li className="reveal" key={step.title}><span className="num">0{index + 1}</span><step.icon size={22} /><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
    </section>

    <section className="lounge-intro-invitation" aria-labelledby="lounge-intro-invitation-title">
      <img src="/lounge/rooftop-v1.webp" alt="" loading="lazy" />
      <div className="lounge-intro-invitation-shade" aria-hidden="true" />
      <div className="reveal"><span className="lounge-intro-kicker"><Target size={14} /> PRACTICE FOR REAL</span><h2 id="lounge-intro-invitation-title">오늘은,<br />어떤 실전을 연습해 볼까요?</h2><Link className="lounge-intro-button primary" to="/">실전 훈련 시작하기 <ArrowRight size={16} /></Link></div>
    </section>
    <footer className="lounge-intro-footer"><span>사석 · 실전 체험형 AI 컴패니언. AI 캐릭터는 가상의 인물이며 의료·법률·투자·채용 등 전문 조언이나 공인 평가를 제공하지 않아요.</span><Link to="/">홈으로 돌아가기 <ArrowRight size={14} /></Link></footer>
  </main>;
}
