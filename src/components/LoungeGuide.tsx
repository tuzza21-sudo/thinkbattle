import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookMarked, BookOpen, Briefcase, Check, Feather, GraduationCap, Handshake, Info, Lightbulb, Phone, Target } from 'lucide-react';
import './LoungeGuide.css';

/**
 * 이용 가이드 (rewritten 2026-11-26, by the owner): how to use 사석 as companions for hands-on practice: starting a
 * training, the English lessons and their learning board, the negotiation and the pressure interview, the
 * conversation classes (writing, the Italian culture trip, art history), practising by phone, and the rest.
 * Everything said here is something the service does; numbers that change are left to the pricing page.
 */
type Card = { id: string; nav: string; icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; title: string; hook: string; points: ReadonlyArray<string>; tip: string };

const cards: readonly Card[] = [
  {
    id: 'start', nav: '시작하기', icon: Target,
    title: '실전 훈련, 이렇게 시작해요',
    hook: '홈의 캐릭터 목록 위에서 ‘실전 훈련’을 누르면 연습 상대가 모여 있어요. 고르고, 목표를 정하고, 말하면 돼요.',
    points: [
      '정하린(영어 회화), 문정우(비즈니스 영어), 강무진(실전 협상), 백도하(압박 면접) 중 한 명을 눌러 캐릭터 페이지로 가요.',
      '페이지의 ‘영어 수업 시작하기’ 또는 ‘협상 훈련 시작하기’, ‘면접 훈련 시작하기’를 누르면 훈련 전용 방이 열려요. 같은 캐릭터의 이야기와는 따로 진행돼요.',
      '훈련 방에서는 연애나 플러팅 없이 연습에만 집중해요. 채팅으로도, 전화로도 할 수 있어요.',
      '글쓰기(윤서연·윤지안), 이탈리아 문화기행(한지오), 근현대 미술사(선우령)도 같은 ‘실전 훈련’에서 클래스로 시작해요. 6번 카드를 보세요.',
    ],
    tip: '처음이라면 영어 수업부터 권해요. 10분이면 한 번 돌아볼 수 있어요.',
  },
  {
    id: 'english', nav: '영어 수업', icon: GraduationCap,
    title: '영어 수업: 눈으로 말고 입으로',
    hook: '튜터는 정답을 먼저 알려 주지 않아요. 상황을 주고, 내가 먼저 말하게 해요.',
    points: [
      '수업을 시작하면 ‘오늘 수업 목표’ 카드가 떠요. 목표 레벨(B1 초급 · B2 중급 · C1 상급), 학습 목적(업무·회의, 여행, 이직·면접…), 대화하고 싶은 주제(일상, 연애, 취미, 취업, 여행…)를 고르거나 직접 적어요.',
      '정하린은 일상에서 내 생각과 느낌을 풍부하게 말하는 연습을, 문정우는 회의·협상·발표 같은 격식 있는 자리의 영어를 중심으로 이끌어요. 주제를 고르면 그 주제로 상황을 만들어요.',
      '입력창 위의 ‘지금 과제’ 카드에 상황, 뜻, 중요도와 레벨이 보여요. 막히면 ‘힌트 받기’를 누르세요. 뜻 → 첫 단어 → 정답 순서로 한 단계씩만 열려요.',
      '내가 한 말 아래에는 피드백이 붙어요. 목표 레벨의 고친 문장과 더 세련된 표현, 고친 이유를 보여 줘요. 표현이 공개되면 뉘앙스와 비슷한 표현도 알려 주고, 문정우 수업에서는 한국 사람이 왜 헷갈리는지도 짚어 줘요.',
      '힌트 없이 말하면 ‘스스로 말함’, 다른 날 또 말하면 ‘다른 날도 말함’, 시키지 않았는데 대화에서 먼저 쓰면 ‘내 것’이 돼요. 잊을 즈음 다시 물어봐요.',
      '수업 중에 “내일 면접에서 이런 말을 하고 싶어요”처럼 내 상황을 말하면, 그 상황에 맞는 표현을 만들어 먼저 연습해요.',
    ],
    tip: '수업에 대해 궁금한 건 그냥 물어보세요. 질문은 고치지 않고 답부터 해 줘요.',
  },
  {
    id: 'board', nav: '학습 보드', icon: BookMarked,
    title: '학습 보드: 무엇을, 어떤 순서로',
    hook: '영어 수업 방 위쪽의 ‘학습 보드’에 내가 배울 것과 배운 것이 모두 정리돼요.',
    points: [
      '‘1 학습할 것 넣기’에서 단어·표현을 직접 적거나, 엑셀(.xlsx)·CSV·텍스트 파일로 한꺼번에 넣어요(첫 열 영어, 둘째 열 뜻, 셋째 열 쓰는 상황). 넣고 나면 새로 넣은 수, 이미 있던 수가 보여요.',
      '‘내 상황으로 만들기’에 처한 상황이나 하고 싶은 말을 적으면 그 상황에서 쓸 표현을 만들어 줘요.',
      '‘2 학습 목록’은 날짜별·순위별·레벨별로 묶어 볼 수 있어요. 표현마다 1순위(꼭 필요)·2순위(자주 씀)·3순위(알아 두면 좋음)와 레벨(B1 쉬움 · B2 보통 · C1 어려움), 학습함 여부가 붙어요.',
      '먼저 하고 싶은 표현은 ★를 누르세요. 수업은 ★ → 1순위 → 2순위 → 3순위, 같은 순위면 쉬운 레벨부터 진행해요. 하루 수업 개수는 처음 정한 대로 유지돼요.',
      '‘피드백’ 탭에는 고친 문장이 날짜별로 쌓여요. 기록은 방이 아니라 내 계정에 남아서, 방을 새로 열어도 그대로예요.',
    ],
    tip: '단어장을 한꺼번에 넣었다면 ★로 이번 주에 할 것만 골라 보세요. 수업이 훨씬 가벼워져요.',
  },
  {
    id: 'negotiation', nav: '협상 훈련', icon: Handshake,
    title: '협상 훈련: 봐주지 않는 상대',
    hook: '강무진이 상대편을 맡아요. 상대의 한계선과 숨은 사정은 시작할 때 정해지고, 끝날 때까지 숨겨져요.',
    points: [
      '‘훈련 설정’에서 상황을 골라요. 중고차 사기, 프리랜서 견적, 연봉 협상, 전세 재계약, 거래처 단가 인상 막기, 마지막 필지 매입(고급).',
      '상대 난이도는 입문 · 실전 · 고수 중에서 골라요. 내 목표 금액, 마지노선, 협상이 깨지면 쓸 대안을 적어 두면 결과와 비교해 줘요.',
      '상대는 정해진 규칙대로만 양보해요. 근거 있는 숫자, “…해 주시면 …하겠습니다” 같은 맞바꾸기, 대안 제시에는 더 움직이고, 압박에 바로 물러서면 덜 움직여요. 질문을 잘하면 숨은 사정을 털어놔요.',
      '합의하거나 판이 깨지면 강무진이 코치로 돌아와요. 상대의 실제 한계선과 숨은 사정을 공개하고, 상대가 양보할 수 있던 폭 중 몇 %를 가져왔는지, 잘한 수와 놓친 수를 알려 줘요.',
    ],
    tip: '첫 숫자는 내가 먼저, 근거와 함께. 이것만 해도 결과가 달라져요.',
  },
  {
    id: 'interview', nav: '압박 면접', icon: Briefcase,
    title: '압박 면접: 두 번째 질문까지',
    hook: '백도하가 면접관이 돼요. 준비한 첫 답보다, 꼬리 질문에 어떻게 답하는지를 연습해요.',
    points: [
      '‘훈련 설정’에 지원 직무와 경력을 적어요. 회사·업계, 채용 공고, 이력·자기소개 요약을 붙이면 그 내용으로 질문을 만들어요.',
      '압박 단계를 골라요. 부드럽게(답이 약할 때만 한 번), 보통(빈틈이 있으면 한 번), 압박(두 번까지, 좋은 답도 가끔 반박).',
      '답이 막연하거나 숫자·내 역할·결과가 빠지면 꼬리 질문이 와요. 압박은 답의 내용에만 해요. 사람을 깎아내리지 않아요.',
      '면접이 끝나면 질문별 점수와 가장 약했던 답을 보여 주고, 내가 한 말로 더 나은 답을 다시 써 줘요. 내가 말하지 않은 숫자는 빈칸으로 남겨 채우게 해요.',
    ],
    tip: '결론 → 근거 → 결과, 1분 안에. 꼬리 질문이 줄어드는 게 보일 거예요.',
  },
  {
    id: 'class', nav: '클래스', icon: Feather,
    title: '글쓰기·문화기행·미술사 클래스',
    hook: '캐릭터 페이지의 ‘클래스 시작하기’를 누르면 클래스 방이 열려요. 입력창 위 버튼에서 과제나 명소, 작품을 고르면 시작해요.',
    points: [
      '윤서연 · 감성적·문학적 글쓰기: ‘글쓰기 과제’에서 오감 묘사, 이름 없는 감정, 보내지 않을 편지, 사물 에세이, 첫 문장 다시 쓰기, 덜어 내기 중 하나를 골라 써요.',
      '윤지안 · 논리적·설득적 글쓰기: 주장 한 문장, 근거 세 개, 반론 먼저, 칼럼 첫 문단, 사실과 의견 가르기, 제안 메일, 세 줄 요약 중 하나를 골라 써요.',
      '쓴 글 아래에는 첨삭 카드가 붙어요. 항목별 점수, 잘된 점, 고칠 곳(원문 → 고친 문장과 이유), 다시 쓴 예, 다음에 해 볼 것이 보이고 ‘첨삭 기록’에 쌓여요.',
      '한지오 · 이탈리아 문화기행: ‘문화기행 지도’에서 피렌체·베네치아 명소 15곳 중 하나를 골라요. 사진과 함께 배경과 역사, 문화유산의 가치, 꼭 볼 것, 체험, 팁을 보고 ‘이곳 탐험하기’를 누르면 한지오가 현장에 함께 선 것처럼 안내해요.',
      '선우령 · 근현대 미술사: ‘작품 갤러리’에서 인상주의부터 팝아트, 한국 추상까지 작품을 골라요. 선우령이 먼저 무엇이 보이는지 묻고, 시대와 배경, 보는 법, 의미를 풀어 줘요.',
      '사진과 작품 이미지는 위키미디어 공용의 자유 이용 자료이고, 저작권이 남아 있는 작품은 미술관 공식 페이지로 연결해요.',
    ],
    tip: '운영 시간, 입장료, 예약 방법처럼 바뀔 수 있는 정보는 방문 전에 공식 사이트에서 한 번 더 확인해 주세요.',
  },
  {
    id: 'call', nav: '전화 연습', icon: Phone,
    title: '실전은 말로 하니까, 연습도 전화로',
    hook: '채팅 화면의 음성(전화) 버튼을 누르면 통화로 바뀌어요. 타이핑 없이 바로 말해야 하는 긴장감까지 연습해요.',
    points: [
      '영어 수업에서는 영어로 말해도, 한국어와 섞어 말해도 그대로 알아들어요.',
      '통화 중에도 과제와 진도, 기록이 그대로 이어져요. 끊으면 내용이 채팅으로 돌아와요.',
      '영어 수업과 실전 훈련 통화는 테스트 기간 동안 무료예요. 다른 대화의 통화는 월 이용 시간이 있어요(요금제에서 확인).',
    ],
    tip: '이어폰을 끼면 실제 화상 회의나 전화 면접과 거의 같은 느낌으로 연습할 수 있어요.',
  },
  {
    id: 'etc', nav: '기록·결제·안전', icon: Info,
    title: '알아 두면 마음이 편한 것들',
    hook: '연습한 기록은 남고, 결제와 환불은 투명하게, 캐릭터는 가상의 인물이에요.',
    points: [
      '학습 어휘, 피드백, 훈련 결과는 내 계정에 보관돼요. 설정에서 ‘계정 삭제’를 누르면 모두 지울 수 있어요.',
      '이용권은 신용·체크카드 또는 네이버페이·카카오페이·토스페이로 결제할 수 있어요. 결제는 포트원을 거쳐 KG이니시스에서 처리되고, 자동으로 다시 결제되지 않아요.',
      '결제 후 7일 안에 늘어난 기능을 쓰지 않았다면 계정 관리의 ‘이용권’에서 바로 취소하고 환불받을 수 있어요. 그 밖의 경우는 이용약관을 확인하거나 고객센터(010-8643-4224, ask.saseok@gmail.com)로 문의해 주세요.',
      '캐릭터의 답이 불편하거나 잘못됐다면 답 아래의 ‘신고’를 눌러 알려 주세요.',
      '캐릭터는 AI가 만든 가상의 인물이고, 사진과 목소리도 합성이에요. 협상 결과와 면접 점수는 연습용 지표이며, 전문가의 조언이나 공인 평가를 대신하지 않아요.',
    ],
    tip: '연습은 매일 조금씩이 가장 좋아요. 사석은 잊을 즈음 다시 물어봐 줘요.',
  },
];

export function LoungeGuide() {
  return <main className="lounge-guide">
    <header className="lounge-guide-hero">
      <span className="lounge-guide-kicker"><BookOpen size={14} aria-hidden="true" /> USER GUIDE</span>
      <h1>사석 이용 가이드: 실전처럼 연습하는 법</h1>
      <p>사석은 분야별 전문가 캐릭터와 직접 말하며 연습하는 실전 체험형 AI 컴패니언이에요. 영어 회화, 협상, 면접, 글쓰기, 이탈리아 문화기행, 미술사까지, 카드 여덟 장으로 쓰는 법을 정리했어요.</p>
      <nav className="lounge-guide-index" aria-label="가이드 목차">
        {cards.map((card, index) => <a key={card.id} href={`#guide-${card.id}`}><b>{index + 1}</b>{card.nav}</a>)}
      </nav>
    </header>
    <div className="lounge-guide-grid">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return <article key={card.id} id={`guide-${card.id}`} className="lounge-guide-card" aria-labelledby={`guide-${card.id}-title`}>
          <header>
            <span className="lounge-guide-no">{String(index + 1).padStart(2, '0')}</span>
            <span className="lounge-guide-icon"><Icon size={22} aria-hidden={true} /></span>
          </header>
          <h2 id={`guide-${card.id}-title`}>{card.title}</h2>
          <p className="lounge-guide-hook">{card.hook}</p>
          <ul>{card.points.map(point => <li key={point}><Check size={15} aria-hidden="true" /><span>{point}</span></li>)}</ul>
          <p className="lounge-guide-tip"><Lightbulb size={15} aria-hidden="true" /><span>{card.tip}</span></p>
        </article>;
      })}
    </div>
    <footer className="lounge-guide-end">
      <h2>자, 오늘은 무엇을 연습해 볼까요?</h2>
      <p>처음 말이 막혀도 괜찮아요. 막히는 지점을 찾는 게 연습의 시작이에요.</p>
      <div>
        <Link to="/" className="lounge-guide-cta primary">실전 훈련 시작하기 <ArrowRight size={16} aria-hidden="true" /></Link>
        <Link to="/lounge/pricing" className="lounge-guide-cta">요금제·결제 안내</Link>
      </div>
    </footer>
  </main>;
}
