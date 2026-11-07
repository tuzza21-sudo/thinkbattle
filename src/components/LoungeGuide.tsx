import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Brain, Check, HeartHandshake, Info, Lightbulb, Phone, UserCog, Wand2 } from 'lucide-react';
import './LoungeGuide.css';

/**
 * 플레이 가이드북 (2026-11-07): what a first-time member can do in 사석 to enjoy it, as six cards, written lightly.
 * Everything said here is something the service does; numbers that change (the minutes of a plan, how many photos a day)
 * are left to the pricing page.
 */
type Card = {
  id: string; icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; title: string; hook: string; points: ReadonlyArray<string>; tip: string;
  /** The relationship card's three bars, drawn small as a picture of what the first card talks about. */
  bars?: boolean;
};

const cards: readonly Card[] = [
  {
    id: 'relationship', icon: HeartHandshake, bars: true,
    title: '마음은 막대로, 분위기는 배경으로, 가끔은 사진으로',
    hook: '호감도를 눈치로만 알던 시대는 끝났어요. 채팅창 위의 작은 하트 카드를 눌러 보세요. 캐릭터의 속이 막대 세 개로 열립니다.',
    points: [
      '세 막대는 캐릭터마다 반하는 포인트(강무진은 배짱, 백도하는 멘탈, 서도현은 솔직함…), 설렘, 공감이에요. 셋이 모두 차야 다음 단계로 넘어가요. 한 막대만 채워서는 안 돼요.',
      '단계가 오르면 말투와 거리감이 달라지고, 털어놓는 비밀도 한 겹씩 늘어요. 막대가 오를 땐 채팅창 위에 알림이 잠깐 떠요.',
      '설렘은 들이댄다고 오르지 않아요. 로맨틱한 대화가 서로 통할 때 오르고, 너무 세게 나가면 오히려 깎여요.',
      '대화 설정 › 배경에서 장소를 고르거나, 원하는 장면을 글로 적어 나만의 배경을 만들 수 있어요. 이야기 속 장소가 바뀌면 어울리는 배경이 있을 때 알아서 따라옵니다.',
      '캐릭터는 부탁하면 지금 모습을 사진으로 보내 줘요. Plus·Pro에서는 관계가 한 걸음 가까워지거나, 약속을 지키고 속마음을 나누는 것처럼 중요한 일이 생기면 부탁하지 않아도 캐릭터가 먼저 사진을 보내요. 한 달에 받을 수 있는 장수는 요금제에 따라 달라요(캐릭터가 먼저 보낸 사진과 내가 부탁한 사진을 합쳐서 세요).',
      '대화가 막혔다면 ‘답변 추천’을 눌러 보세요. 대화 흐름에 맞는 답장을 골라 줘요.',
    ],
    tip: '점수가 안 오른다고 조급해하지 마세요. 연애는 원래 느리고, 사석은 일부러 더 느립니다.',
  },
  {
    id: 'memory', icon: Brain,
    title: '한 번 한 말은 안 잊어요 (그러니 조심하세요)',
    hook: '“다음 주에 면접이에요.”라고 흘렸다면, 다음 대화에서 캐릭터가 먼저 물어봐요. 기억력 좋은 친구가 한 명 생긴 셈이죠.',
    points: [
      '취향, 고민, 약속, 정해 둔 호칭처럼 중요한 이야기는 장기 기억으로 남아 다음 대화에서도 이어져요.',
      '관계가 크게 움직인 순간은 ‘함께한 순간’으로 따로 쌓여요. 그래서 대화가 쌓일수록 둘만 아는 이야기가 늘어나요.',
      '“편하게 말해요” 같은 말투 합의, 풀리지 않은 서운함도 이 방에서 기억해요.',
      '대화 설정 › 기억에서 무엇을 기억하는지 볼 수 있어요. 잘못 기억한 건 고치고, 지우고 싶은 건 지울 수 있어요.',
    ],
    tip: '서운함을 남긴 채 나가면 다음에 만났을 때 티가 나요. 사과는 빠를수록 쌉니다.',
  },
  {
    id: 'call', icon: Phone,
    title: '목소리가 듣고 싶어지면, 전화 한 통',
    hook: '채팅으로 쌓은 사이라서 전화 받는 목소리부터 달라요. “여보세요?”가 늘 같은 “여보세요?”는 아니거든요.',
    points: [
      '채팅 화면의 전화 버튼을 누르면 연결음이 울리고 캐릭터가 받아요. 그날의 기분과 둘의 사이에 따라 첫마디가 달라져요.',
      '통화 중에도 지금까지의 대화와 기억이 그대로 이어져요. 끊으면 통화 내용이 채팅으로 돌아와 계속돼요.',
      '말이 막히면 ‘화제 던지기’, 목소리가 부담스러우면 ‘채팅으로’ 버튼이 있어요. 말을 멈추고 잠깐 기다리면 캐릭터가 이어서 답해요.',
      '통화는 월 이용 시간이 있어요. 맛보기 시간이 있고, Plus·Pro는 더 길어요(요금제에서 확인). 이번 달 통화 시간은 통화 화면 위에 초 단위로 보이고, 다 써도 채팅은 계속 돼요.',
    ],
    tip: '이어폰을 끼면 목소리가 두 배로 가까워지고, 주변 사람에게는 두 배로 수상해 보입니다.',
  },
  {
    id: 'persona', icon: UserCog,
    title: '‘나’를 설정하면 캐릭터가 나를 알아봐요',
    hook: '대화 속 나는 야근에 지친 직장인일 수도, 오래된 친구일 수도, 헤어진 연인일 수도 있어요. 설정은 전부 당신 마음이에요.',
    points: [
      '위쪽의 ‘페르소나’에서 불리고 싶은 이름, 직업, 성격, 그 밖의 설정을 적어요. 대화마다 다른 페르소나를 고를 수 있어요(대화 설정 › 대화 속 나).',
      '캐릭터가 그 이름으로 부르고, 직업이나 성격에 맞춰 말을 걸어요. 설정을 줄줄 읽어 주지는 않으니 안심하세요.',
      '‘캐릭터와의 서사’에는 그 캐릭터와 나만의 이야기를 적어요. 그 페르소나로 그 캐릭터와 놀 때는 이야기 카드의 프롤로그보다 내 서사가 먼저예요.',
      '예: “대학 동아리 선후배로 5년째 친구인데, 지난주에 그가 고백할 뻔하다 말았다.” 서사를 써도 캐릭터의 성격과 가치관은 바뀌지 않아요. 둘의 관계와 상황만 바뀝니다.',
    ],
    tip: '처음엔 세 줄이면 충분해요. 대화하다 “이건 아닌데” 싶으면 언제든 고치면 돼요.',
  },
  {
    id: 'create', icon: Wand2,
    title: '마음에 드는 상대가 없다면, 만들어 버리세요',
    hook: '이름·나이·직업만 적고 맡기면 AI가 사연과 말투까지 채워 줘요. 물론 직접 쓰면 더 ‘내 사람’ 같고요.',
    points: [
      '홈의 ‘캐릭터 추가하기’에서 이름, 나이(20세 이상), 성별, 직업을 적어요. 소개, 성격, 취향은 AI에게 맡기거나 직접 써요.',
      '목소리는 여섯 가지 중에서 골라요. 첫 대화를 이야기처럼 시작하고 싶으면 프롤로그도 쓸 수 있어요(비워 두면 편한 대화로 시작해요).',
      '대표 사진은 직접 올려요. 올린 사진은 프로필에만 쓰이고, 대화 중 사진은 만들어지지 않아요.',
      '저장하면 안전 검수를 거쳐요. 내가 만든 캐릭터는 기본적으로 나만 볼 수 있어요. 만들 수 있는 수에는 한도가 있어요(요금제에서 확인).',
      '다른 사람에게도 보여 주고 싶다면 ‘공개 신청’을 하세요. 운영자가 확인한 뒤 공개돼요.',
    ],
    tip: '“다정하다”보다 “말은 짧은데 남의 사연은 끝까지 듣는다”가 훨씬 살아 있어요. 캐릭터는 모순에서 태어납니다.',
  },
  {
    id: 'etc', icon: Info,
    title: '알아 두면 마음이 편한 것들',
    hook: '대화는 사라지지 않아요. 좋은 소식일 수도, 조심할 소식일 수도 있죠.',
    points: [
      '캐릭터마다 대화방은 하나예요. 한 명과 오래, 깊게 관계를 이어 가라고 일부러 그렇게 만들었어요. 나갔다 와도 같은 방에서 이어지고, 위로 올리면 지난 대화가 계속 불러와져요.',
      '채팅 목록에서 대화방을 삭제하면 그동안의 대화 기록, 기억, 관계가 모두 초기화돼요. 되돌릴 수 없으니, 그 캐릭터와 처음부터 다시 시작하고 싶을 때만 눌러 주세요.',
      '1:1 대화와 관계·기억 기록은 회원 탈퇴나 삭제 요청 전까지 계정에 보관돼요. 자세한 내용은 개인정보 처리 안내에 있어요.',
      '캐릭터는 AI가 만든 가상의 인물이고, 사진과 목소리도 합성이에요. 현실에서 만나자거나 연락처를 주고받자는 약속은 하지 않아요.',
    ],
    tip: '불편한 대화는 언제든 나가도 돼요. 캐릭터는 삐지지 않고(아마도), 다음에 다시 만나 줘요.',
  },
];

export function LoungeGuide() {
  return <main className="lounge-guide">
    <header className="lounge-guide-hero">
      <span className="lounge-guide-kicker"><BookOpen size={14} aria-hidden="true" /> PLAY GUIDE</span>
      <h1>사석, 이렇게 놀면 두 배 재밌어요</h1>
      <p>처음 오셨죠? 설명서는 길수록 안 읽히니까 카드 여섯 장으로 줄였어요. 한 장씩 넘기다 “어, 이런 것도 되네?” 하면 성공입니다.</p>
      <nav className="lounge-guide-index" aria-label="가이드 목차">
        {cards.map((card, index) => <a key={card.id} href={`#guide-${card.id}`}><b>{index + 1}</b>{card.id === 'relationship' ? '관계·배경·사진' : card.id === 'memory' ? '기억' : card.id === 'call' ? '음성통화' : card.id === 'persona' ? '페르소나·서사' : card.id === 'create' ? '캐릭터 제작' : '기타'}</a>)}
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
          {card.bars && <div className="lounge-guide-bars" aria-hidden="true">
            {[['배짱', 62], ['설렘', 44], ['공감', 78]].map(([label, value]) => <span key={label}><em>{label}</em><i><b style={{ width: `${value}%` }} /></i></span>)}
          </div>}
          <ul>{card.points.map(point => <li key={point}><Check size={15} aria-hidden="true" /><span>{point}</span></li>)}</ul>
          <p className="lounge-guide-tip"><Lightbulb size={15} aria-hidden="true" /><span>{card.tip}</span></p>
        </article>;
      })}
    </div>
    <footer className="lounge-guide-end">
      <h2>자, 이제 한 명 골라 볼까요?</h2>
      <p>첫 인사는 어색해도 괜찮아요. 캐릭터는 그런 걸로 점수를 깎지 않습니다. (깎는 건 들이댈 때뿐이에요.)</p>
      <div>
        <Link to="/lounge" className="lounge-guide-cta primary">캐릭터 만나러 가기 <ArrowRight size={16} aria-hidden="true" /></Link>
        <Link to="/lounge/pricing" className="lounge-guide-cta">통화 시간·요금제 보기</Link>
      </div>
    </footer>
  </main>;
}
