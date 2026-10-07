import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, Clapperboard, Hand, Headphones, MapPin, Mic, Sparkles, Users, Utensils } from 'lucide-react';
import './LoungeIntroduction.css';

function IntroductionAvatar({ index }: { index: number }) {
  return <span className="lounge-intro-avatar" aria-hidden="true"><img src="/lounge/avatar-portraits.png" alt="" loading="lazy" style={{ left: `${-(index % 3) * 100}%`, top: index < 3 ? '0' : '-100%' }} /></span>;
}

function IntroductionScene({ theme, topic, quote, reply }: { theme: 'rooftop' | 'hotel'; topic: string; quote: string; reply: string }) {
  return <div className={`lounge-intro-story-visual lounge-intro-demo-scene intro-${theme}`} aria-label="현재 라운지 화면 구성의 대화 예시">
    <img className="lounge-intro-scene-photo" src={theme === 'hotel' ? '/lounge/hotel-lounge-v1.webp' : '/lounge/rooftop-city-v2.webp'} alt={theme === 'hotel' ? '따뜻한 조명의 호텔 라운지' : '도시의 밤 풍경이 펼쳐진 루프탑 라운지'} loading="lazy" />
    <div className="lounge-intro-demo-heading"><span>오늘의 이야기 · 화면 예시</span><strong>{topic}</strong></div>
    <div className="lounge-intro-demo-conversation">
      <div className="lounge-intro-demo-host"><div className="lounge-intro-demo-host-profile"><img src="/lounge/host-witty-v2.webp" alt="가상의 AI 진행자" loading="lazy" /><div><strong>유쾌한 재담꾼</strong><span>AI 사회자 · 합성 이미지</span></div></div><p>{quote}</p></div>
      <div className="lounge-intro-demo-participants"><span className="lounge-intro-demo-label"><Users size={12} />함께하는 사람들</span><div className="lounge-intro-demo-portraits">{[0, 3, 2].map((index, seat) => <span key={index}><IntroductionAvatar index={index} /><small>{['나', '산책', '여운'][seat]}</small></span>)}</div><div className="lounge-intro-demo-reply"><span>나의 이야기</span><p>{reply}</p></div><div className="lounge-intro-demo-controls"><span><Mic size={11} />마이크</span><span><Hand size={11} />손들기</span><span>패스</span></div></div>
    </div>
  </div>;
}

export function LoungeIntroduction() {
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, []);
  return <main className="lounge-introduction">
    <section className="lounge-intro-hero" aria-labelledby="lounge-intro-title">
      <img className="lounge-intro-hero-photo" src="/lounge/river-v1.webp" alt="한강의 다리와 도시 불빛이 반짝이는 야경 라운지" fetchPriority="high" />
      <div className="lounge-intro-hero-copy">
        <span className="lounge-intro-kicker">A PLACE FOR YOUR VOICE</span>
        <h1 id="lounge-intro-title">가끔은 편하게 이야기 나눌 사람이 있음 좋겠다.</h1>
        <p><span>친한 친구와 가족에게도 터놓지 못했던 나만의 이야기</span><span>내가 좋아했던 그 주제 같이 좋아하는 사람들과 함께</span><span>따뜻한 사람과의 목소리로 소통하는 공간</span></p>
      </div>
      <div className="lounge-intro-hero-note"><span>CONVERSATIONS & CONNECTIONS</span><p>조금 말하고, 천천히 알아가고.<br />오늘의 여유를 함께 나눠요.</p><span className="lounge-intro-wave" aria-hidden="true">{[12, 22, 32, 18, 40, 26, 16, 30, 20].map((height, index) => <i key={index} style={{ height }} />)}</span></div>
    </section>

    <div className="lounge-intro-facts" aria-label="라운지 이용 안내">
      <span><Users size={18} /><strong>참가자 1~6명</strong><small>혼자 또는 함께</small></span>
      <span><Headphones size={18} /><strong>실시간 음성</strong><small>목소리로 나누는 대화</small></span>
      <span><Sparkles size={18} /><strong>AI 사회자</strong><small>첫 질문부터 흐름까지</small></span>
      <span><Hand size={18} /><strong>손들기와 패스</strong><small>그룹에서 내 속도로</small></span>
    </div>

    <section className="lounge-intro-stories" aria-labelledby="lounge-intro-features">
      <div className="lounge-intro-section-heading"><span className="lounge-intro-kicker">THE WAY WE CONNECT</span><h2 id="lounge-intro-features">좋은 대화가 시작되는<br /><em>다섯 가지 작은 이유.</em></h2><p>무슨 말을 할지 고민되는 날에도,<br />가볍게 이야기를 시작할 수 있도록.</p></div>

      <article className="lounge-intro-story">
        <div className="lounge-intro-story-visual intro-topics">
          <img className="lounge-intro-scene-photo" src="/lounge/rainy-cafe-v1.webp" alt="비 오는 창가에서 이야기를 나눌 수 있는 카페 풍경" loading="lazy" />
          <div className="lounge-intro-topic-tags"><span><Clapperboard size={15} />영화의 여운</span><span><BookOpen size={15} />책 속의 한 문장</span><span><MapPin size={15} />여행의 기억</span><span><Utensils size={15} />기억에 남는 한 끼</span></div>
          <div className="lounge-intro-image-caption"><span>오늘은 무슨 이야기를 할까요?</span><p>“그 영화, 당신에게는<br />어떤 장면으로 남았나요?”</p></div>
        </div>
        <div className="lounge-intro-story-copy"><span className="lounge-intro-number">01 / SHARED INTERESTS</span><h3>관심사 하나로<br />시작하는 대화.</h3><p>함께 본 영화의 여운, 책 속의 한 문장,<br />다시 가고 싶은 여행지.<br />좋아하는 주제가 우리의 첫 인사가 됩니다.</p><p>서로 관심 있는 주제에 대해 대화하다 보면<br />낯선 사이라도 금세 친해져요.</p><p>직접 말해 보며 내 생각이 정리되고,<br />들으며 해당 주제에 좀 더 깊이 있는 이야기를 나눠요.</p><span className="lounge-intro-detail"><Sparkles size={14} />영화 · 책 · 여행 · 맛집 · 소소한 일상</span></div>
      </article>

      <article className="lounge-intro-story reverse">
        <IntroductionScene theme="rooftop" topic="책 속으로 · 오래 마음에 남은 한 문장" quote="같은 문장도 다르게 다가오네요. 어떤 생각이 떠올랐나요?" reply="저는 그 문장을 읽고 제 선택을 돌아봤어요." />
        <div className="lounge-intro-story-copy"><span className="lounge-intro-number">02 / REAL CONVERSATIONS</span><h3>목소리와 생각으로<br />서로 알아가기.</h3><p>말투와 웃음, 서로 다른 경험과 생각.<br />이야기를 주고받으며<br />상대를 조금씩 알아갑니다.</p><p>처음부터 많은 것을 소개할 필요는 없어요.<br />오늘 관심 있는 이야기부터 나눠 보세요.</p><span className="lounge-intro-detail"><Mic size={14} />카메라 없이, 목소리로 함께해요</span></div>
      </article>

      <article className="lounge-intro-story">
        <IntroductionScene theme="hotel" topic="영화 호프를 보고 남은 이야기" quote="서로 다른 첫인상이네요. 이번에는 어떤 생각이 남았나요? 듣고 싶다면 패스해도 좋아요." reply="저는 주인공의 선택이 오래 마음에 남았어요." />
        <div className="lounge-intro-story-copy"><span className="lounge-intro-number">03 / ROOM FOR EVERY VOICE</span><h3>누구에게나<br />이야기할 차례.</h3><p>AI 사회자가 질문과 대화의 흐름을 돕고,<br />그룹에서는 시스템이 발언 순서를 안내해요.<br />서로의 이야기를 들을 자리를 마련합니다.</p><p>더 이야기하고 싶으면 손들기.<br />오늘은 듣고 싶으면 패스.<br />각자의 속도로 참여하세요.</p><div className="lounge-intro-upcoming"><span>AI 대화 보호</span><p>인신공격은 1차 경고 후 2차에 발언권을 제한해요.<br />수위가 심한 발언은 경고 없이 즉시 제한해요.<br />음성 전사 후 확인하며, 오판은 방장이 해제할 수 있어요.</p></div><span className="lounge-intro-detail"><Check size={14} />점수도, 정답도 없는 대화</span></div>
      </article>

      <article className="lounge-intro-story reverse">
        <div className="lounge-intro-story-visual intro-profiles">
          <img className="lounge-intro-scene-photo" src="/lounge/forest-v1.webp" alt="초록 풍경에 둘러싸인 숲속 라운지" loading="lazy" />
          <span className="lounge-intro-profile-heading">A LITTLE LESS PRESSURE</span>
          <div className="lounge-intro-avatar-gallery">{[0, 3, 1, 4, 2, 5].map(index => <IntroductionAvatar key={index} index={index} />)}</div>
          <div className="lounge-intro-profile-note"><span>닉네임과 캐리커처로 시작해요</span><p>나를 소개하는 방식도,<br />내가 편한 만큼.</p></div>
        </div>
        <div className="lounge-intro-story-copy"><span className="lounge-intro-number">04 / COME AS YOU ARE</span><h3>얼굴 공개의<br />부담을 줄인 만남.</h3><p>실명과 얼굴 사진을 공개할 필요 없이,<br />닉네임과 캐리커처 프로필로<br />가볍게 이야기를 시작하세요.</p><p>서로 알아가는 데 필요한 만큼,<br />나의 경험과 생각을 나누면 됩니다.</p><span className="lounge-intro-detail"><Users size={14} />프로필을 꾸미고, 내 방식으로 참여해요</span></div>
      </article>

      <article className="lounge-intro-story">
        <div className="lounge-intro-story-visual intro-connections">
          <img className="lounge-intro-scene-photo" src="/lounge/seaside-terrace-v1.webp" alt="다음 대화를 함께 나누고 싶은 바다 테라스" loading="lazy" />
          <span className="lounge-intro-connection-heading">A CONVERSATION WORTH CONTINUING</span>
          <div className="lounge-intro-connection-pair"><div><IntroductionAvatar index={0} /><span>나</span></div><Users size={24} aria-hidden="true" /><div><IntroductionAvatar index={3} /><span>대화 친구</span></div></div>
          <div className="lounge-intro-connection-note"><span>친구 연결 예시 · 준비 중</span><p>다음 이야기도,<br />함께 나누고 싶은 사람.</p></div>
        </div>
        <div className="lounge-intro-story-copy"><span className="lounge-intro-number">05 / FRIENDS THROUGH CONVERSATION</span><span className="lounge-intro-coming-label">친구 연결 · 준비 중</span><h3>대화가 통하는 사람과,<br />친구로 이어지도록.</h3><p>같은 주제를 좋아하다가,<br />서로의 생각까지 궁금해지는 사람.<br />좋았던 대화가 한 번의 만남으로 끝나지 않도록.</p><p>서로 ‘다시 이야기하고 싶어요’를 선택하면<br />대화 친구가 되고, 다음 라운지에 초대해<br />이야기를 이어가는 기능을 준비하고 있어요.</p><span className="lounge-intro-detail"><Users size={14} />서로의 선택으로 연결되는 대화 친구</span></div>
      </article>
    </section>

    <section className="lounge-intro-how" aria-labelledby="lounge-intro-how-title"><div><span className="lounge-intro-kicker">YOUR FIRST CONVERSATION</span><h2 id="lounge-intro-how-title">첫 대화는 가볍게.</h2><p>말할 준비가 안 됐다면,<br />그룹에서 듣고 패스해도 괜찮아요.</p></div><ol><li><span>01</span><div><h3>관심 있는 이야기를 골라요</h3><p>열린 대화방을 둘러보거나, 직접 주제를 정해 방을 만들어요.</p></div></li><li><span>02</span><div><h3>나에게 맞는 분위기로 들어와요</h3><p>진행 스타일과 풍경을 고르고, 닉네임과 프로필을 준비해요.</p></div></li><li><span>03</span><div><h3>마이크로 이야기를 나눠요</h3><p>혼자라면 AI와 둘이서, 그룹이라면 서로의 차례에 함께해요.</p></div></li></ol></section>

    <section className="lounge-intro-invitation" aria-labelledby="lounge-intro-invitation-title"><img src="/lounge/seaside-terrace-v1.webp" alt="햇살과 바다가 펼쳐진 테라스" loading="lazy" /><div><span className="lounge-intro-kicker">MAKE SOME ROOM FOR A CONVERSATION</span><h2 id="lounge-intro-invitation-title">오늘, 어떤 이야기가<br />당신에게 남았나요?</h2><p>그 이야기를 나눌 작은 자리가 여기 있어요.</p><div className="lounge-intro-invitation-actions"><Link className="lounge-intro-secondary" to="/lounge/preview">먼저 분위기 둘러보기 <Headphones size={16} /></Link></div></div></section>
    <footer className="lounge-intro-footer"><span>대화 라운지 · 관심사로 만나, 목소리로 가까워지는 곳.</span><Link to="/lounge">라운지로 돌아가기 <ArrowRight size={14} /></Link></footer>
  </main>;
}
