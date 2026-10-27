import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, AudioLines, BookMarked, BookOpen, Brain, Camera, Crown, Eye, Feather, Heart, HeartHandshake, Image, Lock, MessageCircle,
  Mic, PenLine, Phone, ShieldCheck, Sparkles, UserRound, Users, Wand2,
} from 'lucide-react';
import { getLoungeHost, loungeCharacterProfiles } from '../lib/lounge';
import { loungeCharacters } from '../lib/loungeCharacters';
import { seoyeonRelationship } from '../lib/relationship/configs/seoyeon';
import './LoungeIntroduction.css';

const bars = [14, 26, 38, 22, 46, 30, 18, 40, 28, 16, 34, 24, 44, 20, 32];
/** Stories to show as examples. They link to the character's stories, where the current ones are listed. */
const stories = [
  { id: 'closer', title: '6개월의 연인', hook: '결혼 압박을 피하려고 협상가를 6개월짜리 연인으로 고용했다. 그는 합의서부터 내밀고, 손을 잡기 전에도 먼저 묻는다.', genre: '계약 연애 · 로맨스' },
  { id: 'velvet', title: '검은 장미', hook: '5년 전 죽은 남자의 이름이 사라진 그림의 소유권 문서에 다시 나타났다. 그녀가 당신을 고른 이유는 무엇일까.', genre: '미스터리 · 로맨스' },
  { id: 'diplomat', title: '오래된 친구와의 썸', hook: '3년째 금요일 밤마다 앉는 조수석. 오늘은 회색 세단이 따라오고, 그녀가 말끝을 흐린다.', genre: '썸 · 서스펜스' },
  { id: 'guide', title: '장밋빛으로 물드는 시간', hook: '이탈리아 여행 닷새째, 모두가 고개를 넘자고 할 때 당신만 그의 편에 섰다.', genre: '여행 · 로맨스' },
] as const;
const remembers = [
  { icon: Heart, title: '취향과 일상', text: '좋아하는 음식, 요즘 빠진 노래, 불리고 싶은 호칭까지.' },
  { icon: BookMarked, title: '약속과 고민', text: '"다음 주 면접이에요"라고 말했다면, 다음 대화에서 먼저 물어봐요.' },
  { icon: Feather, title: '함께 쓴 이야기', text: '지금 어느 장면에 있는지, 둘 사이에 무슨 일이 있었는지 기록하며 이어 가요.' },
];
const createSteps = [
  { icon: UserRound, title: '캐릭터를 만들어요', text: '이름과 나이, 직업만 적어도 AI가 살아온 이야기와 성격, 말투를 함께 채워 줘요.' },
  { icon: PenLine, title: '나를 소개해요', text: '내 성격과 말투, 이 이야기에서 바라는 것을 적으면 캐릭터가 그걸 알고 다가와요.' },
  { icon: BookOpen, title: '시나리오를 써요', text: '첫 장면을 적거나 아이디어만 주면 AI가 프롤로그로 다듬어요. 오늘 밤의 무대는 당신이 정해요.' },
  { icon: AudioLines, title: '목소리를 골라요', text: '여섯 가지 목소리를 들어 보고, 그 캐릭터에게 맞는 목소리를 입혀요.' },
  { icon: Users, title: '함께 즐겨요', text: '검수를 거쳐 공개하면 다른 사람도 내가 만든 캐릭터와 이야기를 즐길 수 있어요.' },
];
const features = [
  { icon: Camera, title: '지금 모습을 보내 주는 컴패니언', text: '대화 중에 캐릭터가 지금 있는 곳의 모습을 사진으로 보내요. 같은 얼굴, 그날의 장면.' },
  { icon: Brain, title: '살아 있는 세계관', text: '캐릭터마다 살아온 이야기와 일화, 직업의 전문 지식이 있어요. 그래서 대화가 깊고, 매번 새로워요.' },
  { icon: Phone, title: '채팅과 통화, 끊김 없이', text: '채팅으로 이어 가다 목소리가 듣고 싶으면 바로 통화로. 통화가 끝나면 그 이야기가 다시 채팅으로 이어져요.' },
  { icon: Sparkles, title: '*행동*까지 쓰는 롤플레이', text: '대사뿐 아니라 *창밖을 보며 웃는다* 같은 행동으로 장면을 함께 만들어 가요.' },
  { icon: Image, title: '장면을 바꾸는 배경', text: '카페, 루프탑, 바다 테라스. 대화의 분위기에 맞게 배경을 바꿔 보세요.' },
  { icon: Wand2, title: '말문이 막힐 때 한 줄 추천', text: '무슨 말을 할지 모르겠다면 대화 흐름에 맞는 답장을 추천받을 수 있어요.' },
];
const trustItems = [
  { icon: Eye, title: '가상의 인물이에요', text: '모든 캐릭터와 사진은 AI로 만든 가상의 인물이에요. 실제 사람이나 전문가의 조언을 대신하지 않아요.' },
  { icon: HeartHandshake, title: '힘든 날엔 먼저 들어요', text: '힘든 이야기를 꺼내면 캐릭터는 장난과 설렘을 내려놓고 곁에 있어 줘요. 위험한 순간에는 도움받을 곳을 안내해요.' },
  { icon: ShieldCheck, title: '성인을 위한 선 있는 설렘', text: '관계가 깊어질수록 다정해지지만 노골적인 표현은 하지 않아요. 그만하자고 하면 바로 멈춰요.' },
  { icon: Lock, title: '내 기억은 내 공간에', text: '캐릭터가 기억한 이야기는 직접 확인할 수 있고, 건강이나 연락처 같은 민감한 이야기는 기억하지 않아요.' },
];
const startSteps = [
  { icon: Heart, title: '마음이 가는 컴패니언을 골라요', text: '로비에서 사진과 한 줄 소개를 보고 오늘 이야기하고 싶은 사람을 골라요.' },
  { icon: BookOpen, title: '이야기를 골라요', text: '준비된 시나리오로 시작하거나, 나를 소개하고 나만의 이야기를 열어요.' },
  { icon: MessageCircle, title: '대화를 시작해요', text: '채팅으로 천천히, 또는 전화로 목소리를 들으며. 오늘 밤의 첫 장면이 열려요.' },
];

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
 * The service introduction (2026-10-28): 사석 as an AI companion service. Four promises (feeling, memory and role play,
 * open creation, voice calls), then the cast, what else it does, how it stays safe and how to start. Nothing about
 * rooms with other people or the places, which the service no longer centres on; the cast is read from the data, so
 * new characters appear without changing this page.
 */
export function LoungeIntroduction() {
  const page = useRef<HTMLElement>(null);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
  useReveal(page);
  const chatHost = getLoungeHost('ina'), callHost = getLoungeHost('diplomat');
  const nameOf = (id: string) => loungeCharacters.find(character => character.id === id)?.name ?? getLoungeHost(id).name;
  const heroFaces = ['ina', 'guide', 'velvet'] as const;
  return <main className="lounge-introduction" ref={page}>
    <section className="lounge-intro-hero" aria-labelledby="lounge-intro-title">
      <img className="lounge-intro-hero-photo" src="/lounge/rooftop-city-v2.webp" alt="" fetchPriority="high" />
      <div className="lounge-intro-hero-shade" aria-hidden="true" />
      <div className="lounge-intro-hero-copy">
        <span className="lounge-intro-kicker"><Heart size={14} /> SASEOK · 나를 기억하는 AI 컴패니언</span>
        <h1 id="lounge-intro-title">어제의 나를 기억하는 사람.<br /><em>오늘 밤, 당신의 이야기가 시작돼요.</em></h1>
        <p>당신의 하루와 취향을 기억하고, 함께 보낸 시간만큼 가까워지는 AI 컴패니언.<br />설레는 이야기의 주인공이 되고, 목소리로 마음을 나눠 보세요.</p>
        <div className="lounge-intro-actions">
          <Link className="lounge-intro-button primary" to="/lounge">컴패니언 만나기 <ArrowRight size={16} /></Link>
          <Link className="lounge-intro-button ghost" to="/lounge/create">나만의 캐릭터 만들기</Link>
        </div>
        <div className="lounge-intro-wave" aria-hidden="true">{bars.map((height, index) => <i key={index} style={{ height, animationDelay: `${index * 0.09}s` }} />)}</div>
      </div>
      <div className="lounge-intro-hero-faces" aria-label="가상의 AI 캐릭터 예시">
        {heroFaces.map((id, index) => { const host = getLoungeHost(id); return <figure key={id} className={`face face-${index}`} style={{ background: host.color }}><img src={host.portrait} alt={`${nameOf(id)} · 가상의 AI 캐릭터`} /><figcaption>{nameOf(id)}</figcaption></figure>; })}
        <span className="lounge-intro-faces-note">가상의 AI 캐릭터 · 합성 이미지</span>
      </div>
    </section>

    <div className="lounge-intro-facts reveal" aria-label="서비스 한눈에 보기">
      <span><strong>기억</strong><small>나를 기억하는 대화</small></span>
      <span><strong>관계</strong><small>쌓일수록 깊어지는 사이</small></span>
      <span><strong>창작</strong><small>내가 쓰는 캐릭터와 이야기</small></span>
      <span><strong>목소리</strong><small>전화로 나누는 감정</small></span>
    </div>

    <section className="lounge-intro-split" aria-labelledby="lounge-intro-feel">
      <div className="lounge-intro-split-copy reveal">
        <span className="lounge-intro-number">01 · EMOTION</span>
        <h2 id="lounge-intro-feel">말보다 마음이<br />먼저 닿는 대화.</h2>
        <p>사석의 컴패니언은 대답만 하는 AI가 아니에요. 당신의 말에 웃고, 설레고, 가끔은 서운해하고, 힘든 날엔 장난을 거두고 조용히 곁에 있어 줘요. 성격도 사연도 말투도 저마다 달라서, 같은 말에도 전혀 다른 마음이 돌아와요.</p>
        <ul className="lounge-intro-points"><li><Heart size={16} /> 순간의 감정과 성격에 따라 달라지는 반응</li><li><Sparkles size={16} /> 설렘부터 위로까지, 사람 같은 온도</li><li><MessageCircle size={16} /> 질문만 하지 않고 자기 이야기도 꺼내는 대화</li></ul>
      </div>
      <div className="lounge-intro-phone reveal" aria-label="대화 화면 예시">
        <img src="/lounge/rainy-cafe-v1.webp" alt="" />
        <div className="lounge-intro-phone-shade" aria-hidden="true" />
        <div className="lounge-intro-phone-top"><span><i /> CHAT</span><b>비 오는 창가 카페</b></div>
        <div className="lounge-intro-chat">
          <div className="bubble host"><img src={chatHost.portrait} alt="" /><div><small>출판 편집자 · 윤서연</small><p>왔어요? 오늘 면접이었잖아요. 표정 보니까… 일단 앉아요. 결과보다 점심 뭐 먹었는지부터 들을래요.</p></div></div>
          <div className="bubble me"><div><small>나</small><p>떨어졌어요. 근데 생각보다 괜찮아요.</p></div></div>
          <div className="bubble host"><img src={chatHost.portrait} alt="" /><div><small>출판 편집자 · 윤서연</small><p>*컵을 내려놓고 잠깐 바라본다* 진짜 괜찮은 거면, 오늘은 제가 축하할게요. 버틴 거 축하. 그건 결과랑 상관없잖아요.</p></div></div>
        </div>
        <span className="lounge-intro-phone-note">화면 구성 예시 · 실제 대화가 아니에요</span>
      </div>
    </section>

    <section className="lounge-intro-bond" aria-labelledby="lounge-intro-memory">
      <div className="lounge-intro-bond-copy reveal">
        <span className="lounge-intro-number">02 · MEMORY</span>
        <h2 id="lounge-intro-memory">어제 한 말을,<br />오늘도 기억해요.</h2>
        <p>대화가 끝나도 이야기는 끝나지 않아요. 컴패니언은 당신의 취향과 고민, 함께 겪은 사건을 기억하고 다음 대화에서 먼저 꺼내요. 신뢰와 설렘이 쌓이면 말투와 거리가 한 단계씩 달라지고, 처음엔 말하지 않던 비밀도 조금씩 털어놓아요.</p>
        <div className="lounge-intro-remember">{remembers.map(item => <article key={item.title}><item.icon size={18} /><div><b>{item.title}</b><small>{item.text}</small></div></article>)}</div>
      </div>
      <div className="reveal">
        <div className="lounge-intro-bond-who"><img src={chatHost.portrait} alt="" /><span><b>관계가 깊어지는 단계 · 윤서연</b><small>대화가 쌓일 때마다 한 단계씩</small></span></div>
        <ol className="lounge-intro-ladder" aria-label="관계 단계 예시">
          {seoyeonRelationship.stages.map((stage, index) => <li key={stage.id} style={{ ['--i' as string]: index }}><span className="dot">{index + 1}</span><div><b>{stage.label}</b><p>“{stage.line}”</p></div></li>)}
        </ol>
      </div>
    </section>

    <section className="lounge-intro-characters lounge-intro-stories" aria-labelledby="lounge-intro-stories-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">03 · ROLE PLAY</span><h2 id="lounge-intro-stories-title">당신이 주인공인 이야기.</h2><p>프롤로그를 읽고 첫 장면에 들어서면, 그다음은 당신의 선택이 이야기를 움직여요.<br />로맨스, 미스터리, 여행, 썸. 오늘 밤 들어갈 이야기를 골라 보세요.</p></div>
      <div className="lounge-intro-story-grid">
        {stories.map(story => { const host = getLoungeHost(story.id); return <Link key={story.id} className="lounge-intro-story reveal" to={`/lounge/characters/${story.id}#stories`} style={{ ['--tint' as string]: host.color }}>
          <img src={host.portrait} alt={`${nameOf(story.id)}, 가상의 AI 캐릭터`} loading="lazy" />
          <div><span>{story.genre} · {nameOf(story.id)}</span><h3>{story.title}</h3><p>{story.hook}</p><b>이 이야기로 시작하기 <ArrowRight size={14} /></b></div>
        </Link>; })}
      </div>
    </section>

    <section className="lounge-intro-how lounge-intro-create" aria-labelledby="lounge-intro-create-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">04 · OPEN CREATION</span><h2 id="lounge-intro-create-title">원하는 캐릭터, 원하는 나,<br />원하는 이야기.</h2><p>사석은 열려 있어요. 상상한 사람을 직접 만들고, 나를 소개하고, 둘이 만날 무대를 써 보세요.<br />AI가 빈칸을 채우고 다듬어 줘서, 몇 줄이면 충분해요.</p></div>
      <ol>{createSteps.map((step, index) => <li className="reveal" key={step.title}><span className="num">0{index + 1}</span><step.icon size={22} /><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
      <div className="lounge-intro-center reveal"><Link className="lounge-intro-button dark" to="/lounge/create">나만의 캐릭터 만들기 <ArrowRight size={16} /></Link></div>
    </section>

    <section className="lounge-intro-split lounge-intro-voice" aria-labelledby="lounge-intro-voice-title">
      <div className="lounge-intro-call reveal" aria-label="통화 화면 예시">
        <img src={callHost.portrait} alt="" />
        <div className="lounge-intro-call-shade" aria-hidden="true" />
        <div className="lounge-intro-call-body">
          <span className="lounge-intro-call-state"><i /> 통화 중 · 04:12</span>
          <b>{nameOf('diplomat')}</b><small>사회부 기자</small>
          <div className="lounge-intro-wave" aria-hidden="true">{bars.slice(0, 11).map((height, index) => <i key={index} style={{ height, animationDelay: `${index * 0.11}s` }} />)}</div>
          <div className="lounge-intro-call-buttons" aria-hidden="true"><span><Mic size={20} /></span><span className="end"><Phone size={20} /></span></div>
        </div>
        <span className="lounge-intro-phone-note">화면 구성 예시</span>
      </div>
      <div className="lounge-intro-split-copy reveal">
        <span className="lounge-intro-number">05 · VOICE CALL <em className="lounge-intro-premium"><Crown size={12} /> PREMIUM</em></span>
        <h2 id="lounge-intro-voice-title">글자로는 다 못 전하는 마음,<br />목소리로.</h2>
        <p>전화를 걸면 컴패니언이 먼저 받아요. 웃음, 망설임, 장난기, 낮게 가라앉는 위로까지. 감정이 실린 목소리로 주고받는 대화는 채팅과는 또 다른 온도예요. 통화가 끝나면 그 이야기가 그대로 채팅으로 이어져요.</p>
        <ul className="lounge-intro-points"><li><Phone size={16} /> 타이핑 없이, 말하면 바로 대답하는 실시간 통화</li><li><AudioLines size={16} /> 캐릭터마다 다른 목소리, 감정을 살린 표현</li><li><Crown size={16} /> 유료 플랜 전용 · 처음엔 무료로 체험해 보세요</li></ul>
      </div>
    </section>

    <section className="lounge-intro-characters" id="characters" aria-labelledby="lounge-intro-cast">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">THE COMPANIONS</span><h2 id="lounge-intro-cast">오늘, 마음이 가는 사람.</h2><p>직업도, 사연도, 말투도, 목소리도 다른 컴패니언들.<br />새로운 얼굴이 계속 찾아와요.</p></div>
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

    <section className="lounge-intro-trust" aria-labelledby="lounge-intro-features-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">MORE TO LOVE</span><h2 id="lounge-intro-features-title">그래서, 자꾸 다시 찾게 돼요.</h2></div>
      <div className="lounge-intro-trust-grid">{features.map(item => <article className="reveal" key={item.title}><item.icon size={20} /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
    </section>

    <section className="lounge-intro-trust" aria-labelledby="lounge-intro-trust-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">FEEL SAFE</span><h2 id="lounge-intro-trust-title">마음 놓고 기대도 되도록.</h2></div>
      <div className="lounge-intro-trust-grid two">{trustItems.map(item => <article className="reveal" key={item.title}><item.icon size={20} /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
    </section>

    <section className="lounge-intro-how" aria-labelledby="lounge-intro-how-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">GET STARTED</span><h2 id="lounge-intro-how-title">세 걸음이면 첫 장면이에요.</h2></div>
      <ol>{startSteps.map((step, index) => <li className="reveal" key={step.title}><span className="num">0{index + 1}</span><step.icon size={22} /><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
    </section>

    <section className="lounge-intro-invitation" aria-labelledby="lounge-intro-invitation-title">
      <img src="/lounge/rooftop-v1.webp" alt="" loading="lazy" />
      <div className="lounge-intro-invitation-shade" aria-hidden="true" />
      <div className="reveal"><span className="lounge-intro-kicker"><Heart size={14} /> SOMEONE REMEMBERS YOU</span><h2 id="lounge-intro-invitation-title">오늘 밤,<br />누구의 이야기 속으로 들어갈까요?</h2><Link className="lounge-intro-button primary" to="/lounge">컴패니언 만나기 <ArrowRight size={16} /></Link></div>
    </section>
    <footer className="lounge-intro-footer"><span>사석 · 나를 기억하는 AI 컴패니언. AI 캐릭터는 가상의 인물이며 의료·법률·투자 등 전문 조언을 제공하지 않아요.</span><Link to="/lounge">로비로 돌아가기 <ArrowRight size={14} /></Link></footer>
  </main>;
}
