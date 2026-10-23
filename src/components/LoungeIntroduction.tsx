import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AudioLines, Ban, DoorOpen, Eye, Hand, Headphones, Heart, Lock, Mic, ShieldCheck, Sparkles, UserPlus, Users } from 'lucide-react';
import { getLoungeHost, loungeCharacterProfiles, loungeThemes } from '../lib/lounge';
import { loungeCharacters } from '../lib/loungeCharacters';
import { tricksterRelationship } from '../lib/relationship/configs/trickster';
import './LoungeIntroduction.css';

const bars = [14, 26, 38, 22, 46, 30, 18, 40, 28, 16, 34, 24, 44, 20, 32];
const trustItems = [
  { icon: Eye, title: '가상의 캐릭터예요', text: 'AI 캐릭터와 그 사진은 모두 만들어진 가상의 인물이에요. 실제 사람이나 전문가가 아니라는 걸 화면마다 알려 드려요.' },
  { icon: Lock, title: '사진은 내 선택이에요', text: '프로필 사진은 줄여서 비공개로 저장하고 외부 AI로 보내지 않아요. 본인 얼굴이 아니어도 괜찮아요.' },
  { icon: Users, title: '성별은 인원수로만', text: '대화방에는 참가자의 성별이 이름 없이 인원수로만 보여요. 나이대는 연령대 제한이 있는 방에서만 쓰여요.' },
  { icon: ShieldCheck, title: '가벼운 대화 보호', text: '선을 넘는 말에는 발언을 잠시 제한해요. 힘든 이야기에는 캐릭터가 농담을 거두고 먼저 들어요.' },
  { icon: Ban, title: '차단과 별점', text: '불편한 사람은 차단하고, 좋았던 사람은 별점과 친구로 남길 수 있어요.' },
  { icon: Hand, title: '내 속도로', text: '말하기 어려운 날에는 듣기만 해도 돼요. 마이크는 언제든 끌 수 있어요.' },
];
const steps = [
  { icon: UserPlus, title: '자리를 만들어요', text: '닉네임과 성별, 나이대, 지역, 한 줄 소개만 적으면 끝. 게스트로 먼저 구경해도 돼요.' },
  { icon: DoorOpen, title: '장소와 캐릭터를 골라요', text: '분위기가 다른 공간과 대화 상대를 고르고, 혼자 들어가거나 방을 열어 사람을 기다려요.' },
  { icon: Mic, title: '말을 걸어 보세요', text: '전화 연결 버튼을 누르면 바로 통화가 시작돼요. 타이핑은 필요 없어요.' },
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

export function LoungeIntroduction() {
  const page = useRef<HTMLElement>(null);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
  useReveal(page);
  const stageHost = getLoungeHost('trickster');
  const heroFaces = ['trickster', 'diplomat', 'closer'] as const;
  return <main className="lounge-introduction" ref={page}>
    <section className="lounge-intro-hero" aria-labelledby="lounge-intro-title">
      <img className="lounge-intro-hero-photo" src="/lounge/river-v1.webp" alt="" fetchPriority="high" />
      <div className="lounge-intro-hero-shade" aria-hidden="true" />
      <div className="lounge-intro-hero-copy">
        <span className="lounge-intro-kicker"><AudioLines size={14} /> SASEOK · 목소리로 만나는 대화 라운지</span>
        <h1 id="lounge-intro-title">혼자여도 괜찮아요.<br /><em>오늘 밤, 이야기할 사람이 있으니까.</em></h1>
        <p>마이크를 켜고 말을 걸면 대화가 시작돼요.<br />성격이 뚜렷한 AI 캐릭터와 마주 앉아도 좋고, 사람들과 함께 앉아도 좋아요.</p>
        <div className="lounge-intro-actions">
          <Link className="lounge-intro-button primary" to="/lounge">대화 시작하기 <ArrowRight size={16} /></Link>
          <a className="lounge-intro-button ghost" href="#characters">캐릭터 만나 보기</a>
        </div>
        <div className="lounge-intro-wave" aria-hidden="true">{bars.map((height, index) => <i key={index} style={{ height, animationDelay: `${index * 0.09}s` }} />)}</div>
      </div>
      <div className="lounge-intro-hero-faces" aria-label="가상의 AI 캐릭터 예시">
        {heroFaces.map((id, index) => { const host = getLoungeHost(id); return <figure key={id} className={`face face-${index}`} style={{ background: host.color }}><img src={host.portrait} alt={`${host.name} · 가상의 AI 캐릭터`} /><figcaption>{loungeCharacters.find(character => character.id === id)?.name}</figcaption></figure>; })}
        <span className="lounge-intro-faces-note">가상의 AI 캐릭터 · 합성 이미지</span>
      </div>
    </section>

    <div className="lounge-intro-facts reveal" aria-label="서비스 한눈에 보기">
      <span><strong>{loungeCharacters.length}</strong><small>개성이 다른 AI 캐릭터</small></span>
      <span><strong>{loungeThemes.length}</strong><small>분위기가 다른 공간</small></span>
      <span><strong>1~6명</strong><small>혼자도, 함께도</small></span>
      <span><strong>LIVE</strong><small>목소리로 바로 대화</small></span>
    </div>

    <section className="lounge-intro-split" aria-labelledby="lounge-intro-voice">
      <div className="lounge-intro-split-copy reveal">
        <span className="lounge-intro-number">01 · VOICE FIRST</span>
        <h2 id="lounge-intro-voice">타이핑 대신,<br />그냥 말하세요.</h2>
        <p>들어가면 마이크가 바로 연결돼요. 말을 마치면 캐릭터가 듣고, 목소리로 답해요. 말하는 도중에 끼어들어도 괜찮아요.</p>
        <ul className="lounge-intro-points"><li><Headphones size={16} /> 먼저 만들어진 조각부터 재생해서 응답이 빨라요</li><li><Mic size={16} /> 마이크는 언제든 켜고 끌 수 있어요</li><li><Sparkles size={16} /> 캐릭터마다 목소리와 말투가 달라요</li></ul>
      </div>
      <div className="lounge-intro-phone reveal" aria-label="대화 화면 예시">
        <img src="/lounge/talkshow-stage-v1.webp" alt="" />
        <div className="lounge-intro-phone-shade" aria-hidden="true" />
        <div className="lounge-intro-phone-top"><span><i /> LIVE</span><b>심야 토크쇼 무대</b></div>
        <div className="lounge-intro-chat">
          <div className="bubble host"><img src={stageHost.portrait} alt="" /><div><small>토크쇼 진행자 · 백도하</small><p>{stageHost.greeting}</p></div></div>
          <div className="bubble me"><div><small>나</small><p>요즘 이직할지 계속 고민만 하고 있어요.</p></div></div>
          <div className="bubble host"><img src={stageHost.portrait} alt="" /><div><small>토크쇼 진행자 · 백도하</small><p>고민이 벌써 몇 달 차예요? 이쯤 되면 이직이 아니라 취미죠. 그래도 궁금하네요, 어디서부터 마음이 갈렸어요?</p></div></div>
        </div>
        <span className="lounge-intro-phone-note">화면 구성 예시 · 실제 대화가 아니에요</span>
      </div>
    </section>

    <section className="lounge-intro-characters" id="characters" aria-labelledby="lounge-intro-cast">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">02 · THE CAST</span><h2 id="lounge-intro-cast">대화 상대를 고르는 재미.</h2><p>직업도, 사연도, 말투도, 목소리도 다른 여덟 명.<br />오늘 기분에 맞는 사람과 마주 앉아 보세요.</p></div>
      <div className="lounge-intro-cast-grid">
        {loungeCharacters.map(character => {
          const host = getLoungeHost(character.id), profile = loungeCharacterProfiles[character.id];
          return <article className="lounge-intro-card reveal" key={character.id} style={{ ['--tint' as string]: host.color }}>
            <div className="lounge-intro-card-photo"><img src={host.portrait} alt={`${character.name}, 가상의 AI 캐릭터`} loading="lazy" /></div>
            <div className="lounge-intro-card-body">
              <span className="job">{character.job}</span>
              <h3>{character.name}</h3>
              <p className="quote">“{character.quote}”</p>
              {profile && <ul>{profile.traits.map(trait => <li key={trait}>{trait}</li>)}</ul>}
            </div>
          </article>;
        })}
      </div>
      <p className="lounge-intro-fineprint">모든 캐릭터와 사진은 가상의 인물이에요. 실제 인물이나 전문가의 조언을 대신하지 않아요.</p>
    </section>

    <section className="lounge-intro-bond" aria-labelledby="lounge-intro-bond-title">
      <div className="lounge-intro-bond-copy reveal">
        <span className="lounge-intro-number">03 · IT GROWS</span>
        <h2 id="lounge-intro-bond-title">대화가 쌓이면,<br />그 사람이 나를 대하는 방식이 달라져요.</h2>
        <p>캐릭터마다 좋아하는 대화와 싫어하는 대화가 달라요. 같은 말도 반응이 다르고, 신뢰와 호감이 쌓일수록 말투와 거리감이 한 단계씩 바뀌어요.</p>
        <div className="lounge-intro-bond-who"><img src={stageHost.portrait} alt="" /><span><b>예시 · 백도하</b><small>토크쇼 진행자</small></span></div>
      </div>
      <ol className="lounge-intro-ladder reveal" aria-label="관계 단계 예시">
        {tricksterRelationship.stages.map((stage, index) => <li key={stage.id} style={{ ['--i' as string]: index }}><span className="dot">{index + 1}</span><div><b>{stage.label}</b><p>“{stage.line}”</p></div></li>)}
      </ol>
    </section>

    <section className="lounge-intro-places" aria-labelledby="lounge-intro-places-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">04 · THE PLACES</span><h2 id="lounge-intro-places-title">장소가 분위기를 만들어요.</h2><p>야경이 보이는 루프탑부터 비 오는 창가 카페, 토크쇼 무대까지.</p></div>
      <div className="lounge-intro-place-rail" role="list">
        {loungeThemes.map(theme => <figure className="lounge-intro-place" role="listitem" key={theme.id}><img src={theme.image} alt="" loading="lazy" /><figcaption><b>{theme.name}</b><small>{theme.subtitle}</small></figcaption></figure>)}
      </div>
    </section>

    <section className="lounge-intro-together" aria-labelledby="lounge-intro-together-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">05 · SOLO OR TOGETHER</span><h2 id="lounge-intro-together-title">혼자도, 함께도.</h2><p>오늘은 한 사람과 깊게, 내일은 여럿이 가볍게.</p></div>
      <div className="lounge-intro-two">
        <article className="reveal"><span className="chip"><Heart size={13} /> 1:1</span><h3>캐릭터와 둘이서</h3><p>마음에 드는 캐릭터와 단둘이 이야기해요. 대화가 쌓일수록 서로를 알아 가요. 사람이 없어도 바로 시작할 수 있어요.</p></article>
        <article className="reveal"><span className="chip"><Users size={13} /> 최대 6명</span><h3>사람들과 함께</h3><p>방장이 주제와 도와줄 캐릭터, 인원(2~6명), 연령대를 정해 방을 열어요. 캐릭터는 대화를 이끌기보다 답을 이어 주고 침묵을 풀어 줘요.</p><ul><li>대화 주제</li><li>도와줄 캐릭터</li><li>방 인원</li><li>연령대 제한</li></ul></article>
      </div>
    </section>

    <section className="lounge-intro-trust" aria-labelledby="lounge-intro-trust-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">06 · FEEL SAFE</span><h2 id="lounge-intro-trust-title">편하게 머물 수 있도록.</h2></div>
      <div className="lounge-intro-trust-grid">{trustItems.map(item => <article className="reveal" key={item.title}><item.icon size={20} /><h3>{item.title}</h3><p>{item.text}</p></article>)}</div>
    </section>

    <section className="lounge-intro-how" aria-labelledby="lounge-intro-how-title">
      <div className="lounge-intro-section-heading reveal"><span className="lounge-intro-number">07 · GET STARTED</span><h2 id="lounge-intro-how-title">세 걸음이면 첫 대화예요.</h2></div>
      <ol>{steps.map((step, index) => <li className="reveal" key={step.title}><span className="num">0{index + 1}</span><step.icon size={22} /><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
    </section>

    <section className="lounge-intro-invitation" aria-labelledby="lounge-intro-invitation-title">
      <img src="/lounge/rooftop-city-v2.webp" alt="" loading="lazy" />
      <div className="lounge-intro-invitation-shade" aria-hidden="true" />
      <div className="reveal"><span className="lounge-intro-kicker"><AudioLines size={14} /> ONE VOICE IS ENOUGH</span><h2 id="lounge-intro-invitation-title">오늘 밤은,<br />누구와 이야기해 볼까요?</h2><Link className="lounge-intro-button primary" to="/lounge">라운지 입장하기 <ArrowRight size={16} /></Link></div>
    </section>
    <footer className="lounge-intro-footer"><span>사석 · 목소리로 만나는 대화 라운지. AI 캐릭터는 가상의 인물이며 의료·법률·투자 등 전문 조언을 제공하지 않아요.</span><Link to="/lounge">라운지로 돌아가기 <ArrowRight size={14} /></Link></footer>
  </main>;
}
