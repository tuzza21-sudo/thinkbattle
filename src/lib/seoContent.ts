import { loungeCharacters, type LoungeCharacter } from './loungeCharacters';
import { loungeHosts } from './lounge';
import { loungeCallMinutes, loungeFreePlan, loungePhotoMonthly, loungePlans } from './loungePlans';

/**
 * What search engines and AI answer engines read about the service (2026-11-14): the keyword pages (AI companion, AI call,
 * voice chat, character chat), the home page and one page per character. The browser pages (SeoGuidePage), the tags in
 * the document head (seo.ts) and the static HTML written at build time (scripts/prerender-seo.mjs) all read this file, so
 * the three never say different things. Every figure comes from the code that enforces it (plans, call minutes, photos).
 */
export const SEO_ORIGIN = 'https://saseok.kr';
export const SEO_BRAND = '사석';
export const SEO_COMPANY = '대치레드';
export const SEO_EMAIL = 'ask.saseok@gmail.com';

export type SeoFaq = { question: string; answer: string };
export type SeoSection = { heading: string; paragraphs: readonly string[]; bullets?: readonly string[] };
export type SeoGuide = {
  slug: string; path: string; label: string; title: string; description: string; h1: string; lead: string; keywords: readonly string[];
  sections: readonly SeoSection[]; faq: readonly SeoFaq[]; related: readonly string[]; showCast?: boolean;
};

const pro = loungePlans.find(plan => plan.key === 'pro-month')!;
const proYear = loungePlans.find(plan => plan.key === 'pro-year')!;
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const castCount = loungeCharacters.length;
const callMinutes = loungeCallMinutes.pro;

/** The line every page says about what the characters are. */
export const seoVirtualNotice = '모든 캐릭터와 사진, 목소리는 AI로 만든 가상의 인물이며 실제 사람이 아닙니다. 사석은 만 18세 이상을 위한 서비스이고, 의학·법률·투자 상담을 대신하지 않습니다.';

export const seoGuides: readonly SeoGuide[] = [
  {
    slug: 'ai-companion', path: '/ai-companion', label: 'AI 컴패니언',
    title: 'AI 컴패니언 사석 — 나를 기억하고 가까워지는 AI 캐릭터 대화',
    description: '나를 기억하고 함께한 시간만큼 가까워지는 AI 컴패니언 사석. 캐릭터와 채팅하고 전화로 목소리를 나눠 보세요.',
    h1: 'AI 컴패니언 사석: 어제의 나를 기억하는 대화 상대',
    lead: `사석은 개성과 자기만의 삶을 가진 AI 캐릭터와 이야기하는 AI 컴패니언 서비스입니다. 질문에 답만 하는 챗봇이 아니라, 지난 대화를 기억하고 함께한 시간만큼 가까워지는 ${castCount}명의 캐릭터가 기다리고 있어요.`,
    keywords: ['AI 컴패니언', 'AI 친구', 'AI 캐릭터', '나를 기억하는 AI'],
    sections: [
      {
        heading: 'AI 컴패니언이란 무엇인가요',
        paragraphs: [
          'AI 컴패니언은 정보를 찾아 주는 AI 비서와 달리, 대화 상대가 되어 주는 AI입니다. 하루 이야기를 나누고, 고민을 들어 주고, 때로는 설레는 이야기의 주인공이 되게 해 주는 것이 목적이에요.',
          '사석의 컴패니언은 직업과 과거, 말투와 버릇이 있는 캐릭터입니다. 영화감독, 편집자, 반도체 엔지니어, 협상가, 기자, 무속인처럼 각자 사는 세계가 달라서 대화의 결도 매번 다릅니다.',
        ],
      },
      {
        heading: '사석 컴패니언이 다른 점',
        paragraphs: ['같은 AI 대화라도 오래 이어 갈수록 차이가 드러나도록 만들었습니다.'],
        bullets: [
          '기억: 취향, 약속, 고민, 함께 쓴 이야기를 기억하고 다음 대화에서 먼저 꺼냅니다. 캐릭터가 기억한 내용은 설정에서 보고 고칠 수 있고, 한 캐릭터의 기억은 다른 캐릭터에게 전해지지 않아요.',
          '관계: 어색한 첫 만남에서 시작해 친구, 설렘, 로맨스로 천천히 가까워집니다. 무엇을 말하고 어떻게 대하느냐에 따라 캐릭터의 반응이 달라져요.',
          '채팅과 통화: 글로 이야기하다 목소리가 듣고 싶으면 전화로 바꾸고, 통화가 끝나면 그 이야기가 다시 채팅으로 이어집니다.',
          `사진: 대화 중에 캐릭터가 지금 있는 곳의 모습을 사진으로 보내 줘요(무료 월 ${loungePhotoMonthly.free}장, Pro 월 ${loungePhotoMonthly.pro}장).`,
          '나만의 캐릭터: 이름과 직업만 적어도 AI가 성격과 말투를 채워 주고, 직접 시나리오를 써서 오늘 밤의 무대를 정할 수 있어요(Pro).',
        ],
      },
      {
        heading: '안전하게 이용하세요',
        paragraphs: [
          seoVirtualNotice,
          '힘든 이야기를 꺼내면 캐릭터는 장난과 설렘을 내려놓고 먼저 들어 주며, 위험한 순간에는 도움받을 수 있는 곳을 안내합니다. 불편한 답변은 답변 아래 ‘신고’로 알려 주세요. 계정과 모든 기록은 설정에서 직접 삭제할 수 있습니다.',
        ],
      },
    ],
    faq: [
      { question: 'AI 컴패니언이 뭔가요?', answer: '대화 상대가 되어 주는 AI입니다. 정보를 찾아 주는 비서가 아니라, 나를 기억하고 이야기를 이어 가며 가까워지는 캐릭터와 대화하는 서비스예요. 사석은 한국어 AI 컴패니언 서비스입니다.' },
      { question: '사석은 무료로 쓸 수 있나요?', answer: `가입하면 무료로 시작할 수 있고, ${loungeFreePlan.features.join(', ')}가 제공됩니다. 음성 통화 월 ${callMinutes}분, 채팅 무제한, 장기 기억, 나만의 캐릭터 제작은 Pro 이용권(월 ${won(pro.price)}, 연 ${won(proYear.price)})에서 쓸 수 있어요.` },
      { question: '캐릭터가 나를 정말 기억하나요?', answer: '네. 취향과 약속, 고민, 함께 쓴 이야기를 기억해 다음 대화에서 이어 갑니다. 기억한 내용은 직접 확인하고 고칠 수 있고, 건강이나 연락처 같은 민감한 이야기는 기억하지 않아요.' },
      { question: '실제 사람과 대화하는 건가요?', answer: '아니요. 캐릭터와 사진, 목소리는 모두 AI로 만든 가상의 인물이며 실제 사람이 아닙니다.' },
      { question: '몇 살부터 이용할 수 있나요?', answer: '사석은 만 18세 이상을 위한 서비스입니다.' },
    ],
    related: ['/ai-call', '/voice-chat', '/character-chat'], showCast: true,
  },
  {
    slug: 'ai-call', path: '/ai-call', label: 'AI 전화·AI 통화',
    title: 'AI 전화 · AI 통화 — 캐릭터에게 전화 걸어 목소리로 대화 | 사석',
    description: '캐릭터에게 전화를 걸어 목소리로 대화하는 AI 통화. 타이핑 없이 말하면 바로 대답하고, 끊으면 채팅으로 이어져요.',
    h1: 'AI 전화·AI 통화: 캐릭터에게 전화를 걸어 보세요',
    lead: '사석의 AI 통화는 대화방 안의 ‘전화 연결’ 버튼 하나로 시작합니다. 마이크에 대고 말하면 캐릭터가 실시간으로 대답하고, 목소리는 캐릭터마다 달라요.',
    keywords: ['AI 전화', 'AI 통화', 'AI 전화 통화', '캐릭터에게 전화'],
    sections: [
      {
        heading: 'AI 전화는 이렇게 진행돼요',
        paragraphs: ['글자를 입력할 필요가 없습니다. 전화를 걸고 말하면 말한 내용이 글로 바뀌어 캐릭터에게 전해지고, 캐릭터의 대답은 합성 목소리로 바로 들려요.'],
        bullets: [
          '채팅 화면에서 ‘전화 연결’을 누르면 통화가 시작됩니다. 처음 한 번 마이크 사용을 허용해 주세요.',
          '통화 중에도 캐릭터는 지난 대화와 기억을 알고 있어서 “어제 말한 면접은 어땠어요?”처럼 이어서 이야기해요.',
          '통화를 끊으면 오간 이야기가 채팅 기록으로 남고, 그대로 글로 이어 갈 수 있습니다.',
          '안드로이드 앱에서는 화면이 꺼지거나 잠겨도 통화가 끊기지 않아요.',
        ],
      },
      {
        heading: '캐릭터마다 다른 목소리',
        paragraphs: [
          '낮고 단단한 중저음, 느긋하고 건조한 여유, 맑고 단정한 말투처럼 캐릭터마다 어울리는 목소리와 말투가 있습니다. 통화 전에 캐릭터 소개 화면에서 샘플 목소리를 들어 볼 수 있어요.',
          '나만의 캐릭터를 만들 때는 여섯 가지 목소리 중에서 어울리는 목소리를 골라 입힐 수 있습니다.',
        ],
      },
      {
        heading: '통화 시간과 요금',
        paragraphs: [
          `통화 시간은 통화한 시간을 초 단위로 세어 한 달 기준으로 계산합니다. Pro 이용권은 월 ${callMinutes}분이고, 이용권별 시간은 요금제 화면에서 확인할 수 있어요. 통화 시간을 다 써도 채팅은 계속 이어 갈 수 있습니다.`,
          '목소리 부담이 있거나 조용한 곳에서는 언제든 ‘채팅으로 대화’로 바꿀 수 있어요.',
        ],
      },
      {
        heading: '개인정보와 안전',
        paragraphs: [
          '말한 내용은 대화를 위해 글로 전사되며, 원본 음성은 저장하지 않습니다. 전화 속 캐릭터의 목소리는 AI가 만든 합성 음성이고 실제 사람이 아닙니다.',
        ],
      },
    ],
    faq: [
      { question: 'AI 전화는 어떻게 거나요?', answer: '사석에서 캐릭터를 골라 대화방에 들어간 뒤 ‘전화 연결’ 버튼을 누르고 마이크를 허용하면 됩니다. 말하면 캐릭터가 실시간으로 대답해요.' },
      { question: 'AI 통화는 무료인가요?', answer: `통화 시간은 이용권에 따라 달라요. Pro 이용권(월 ${won(pro.price)})은 월 ${callMinutes}분 통화할 수 있고, 무료 이용 범위의 통화 시간은 베타 기간에 바뀔 수 있어 요금제 화면에서 확인해 주세요.` },
      { question: '통화 내용이 저장되나요?', answer: '말한 내용은 대화를 위해 글로 전사되어 대화 기록에 남지만, 원본 음성은 저장하지 않습니다. 기록과 계정은 설정에서 직접 삭제할 수 있어요.' },
      { question: '전화 상대는 실제 사람인가요?', answer: '아니요. 목소리까지 모두 AI가 합성한 가상의 인물입니다.' },
      { question: '통화 중에 앱을 닫아도 되나요?', answer: '안드로이드 앱에서는 화면이 꺼지거나 잠겨도 통화가 이어집니다. 웹에서는 통화 화면을 열어 둔 동안 통화가 유지돼요.' },
    ],
    related: ['/voice-chat', '/ai-companion', '/character-chat'],
  },
  {
    slug: 'voice-chat', path: '/voice-chat', label: '음성 채팅·음성 컴패니언',
    title: '음성 채팅 AI · 음성 컴패니언 — 말로 나누는 대화 | 사석',
    description: '타이핑 대신 말로 이야기하는 음성 컴패니언. 채팅과 음성을 오가며 나를 기억하는 AI와 대화해 보세요.',
    h1: '음성 채팅 AI, 말로 나누는 음성 컴패니언',
    lead: '키보드를 두드리지 않고 말로 하는 대화. 사석의 음성 컴패니언은 채팅과 음성을 끊김 없이 오가며, 하루 이야기를 나만의 속도로 들어 줍니다.',
    keywords: ['음성 채팅', '음성 컴패니언', 'AI 음성 대화', '목소리로 대화'],
    sections: [
      {
        heading: '음성 컴패니언이란',
        paragraphs: [
          '음성 컴패니언은 글이 아니라 목소리로 대화하는 AI 대화 상대입니다. 퇴근길에 혼잣말처럼 하루를 풀어놓거나, 잠들기 전에 가볍게 수다를 떨고 싶을 때처럼 손이 자유롭지 않은 순간에 잘 어울려요.',
          '사석은 목소리가 중심에 있는 서비스입니다. 캐릭터마다 목소리와 말투, 말의 속도가 다르고, 같은 이야기도 어떤 목소리로 듣느냐에 따라 전혀 다른 분위기가 돼요.',
        ],
      },
      {
        heading: '음성 채팅과 글 채팅을 자유롭게',
        paragraphs: ['대화는 한 가지 방식에 묶이지 않습니다.'],
        bullets: [
          '글로 천천히 이야기하다가 ‘전화 연결’로 바꾸면 곧바로 음성 대화가 됩니다.',
          '음성 대화 중에도 ‘채팅으로 대화’를 누르면 같은 대화가 글로 이어져요.',
          '음성으로 나눈 이야기는 대화 기록에 글로 남아 나중에 다시 볼 수 있습니다.',
          '대사뿐 아니라 *창밖을 보며 웃는다* 같은 행동까지 쓰는 롤플레이도 글 채팅에서 할 수 있어요.',
        ],
      },
      {
        heading: '이럴 때 써 보세요',
        paragraphs: [
          '말하다 보면 정리되는 고민, 소리 내어 연습하고 싶은 이야기, 누군가의 목소리가 그리운 밤. 음성 컴패니언은 그런 순간의 말 상대입니다. 다만 의학·법률·투자 상담이나 위기 상황의 전문적인 도움을 대신하지는 않아요. 힘들 때는 가까운 사람이나 전문 기관의 도움을 받으세요.',
        ],
      },
    ],
    faq: [
      { question: '음성 컴패니언은 어떻게 시작하나요?', answer: '사석에 가입하고 캐릭터를 고른 뒤 대화방에서 ‘전화 연결’을 누르면 됩니다. 마이크 사용을 허용하면 말로 바로 대화할 수 있어요.' },
      { question: '음성 채팅과 글 채팅을 섞어 쓸 수 있나요?', answer: '네. 같은 대화 안에서 언제든 음성과 글을 오갈 수 있고, 음성으로 한 이야기도 대화 기록에 글로 남습니다.' },
      { question: '목소리는 실제 사람인가요?', answer: '캐릭터의 목소리는 AI가 합성한 음성입니다. 실제 성우나 사람의 통화가 아니에요.' },
      { question: '한국어로 대화할 수 있나요?', answer: '사석은 한국어 서비스이고, 캐릭터는 자연스러운 한국어 말투로 대화합니다.' },
      { question: '음성 대화에 요금이 드나요?', answer: `음성 통화는 Pro 이용권(월 ${won(pro.price)}, 월 ${callMinutes}분)에서 본격적으로 쓸 수 있고, 채팅은 가입하면 무료로 시작할 수 있어요.` },
    ],
    related: ['/ai-call', '/ai-companion', '/character-chat'],
  },
  {
    slug: 'character-chat', path: '/character-chat', label: 'AI 캐릭터 채팅',
    title: 'AI 캐릭터 채팅 — 롤플레이와 나만의 캐릭터 만들기 | 사석',
    description: '개성 있는 AI 캐릭터와 채팅하고 롤플레이를 즐겨 보세요. 캐릭터와 시나리오를 직접 만들 수도 있어요.',
    h1: 'AI 캐릭터 채팅: 이야기의 주인공이 되어 보세요',
    lead: `직업과 과거, 말투와 비밀을 가진 ${castCount}명의 AI 캐릭터와 채팅하고, 준비된 시나리오로 롤플레이를 시작하거나 캐릭터와 장면을 직접 만들어 보세요.`,
    keywords: ['AI 캐릭터 채팅', '캐릭터 챗', 'AI 롤플레이', '캐릭터 만들기'],
    sections: [
      {
        heading: '살아 있는 캐릭터',
        paragraphs: [
          '사석의 캐릭터는 한 줄 설정이 아니라 살아온 이야기와 일화, 직업의 전문 지식을 가진 인물입니다. 그래서 같은 질문에도 직업과 성격에 따라 대답이 다르고, 대화가 깊어질수록 새로운 면이 드러나요.',
          '캐릭터는 친한 정도에 따라 다르게 반응합니다. 내가 한 말과 행동이 쌓이면서 처음의 경계는 풀리고, 때로는 서운해하기도 해요.',
        ],
      },
      {
        heading: '롤플레이와 시나리오',
        paragraphs: ['대사와 행동을 함께 쓰는 롤플레이로 장면을 같이 만들어 갑니다.'],
        bullets: [
          '준비된 시나리오: 계약 연애, 미스터리, 여행, 썸과 서스펜스 같은 이야기를 골라 첫 장면부터 시작해요.',
          '배경 바꾸기: 카페, 루프탑, 바다 테라스처럼 대화의 분위기에 맞게 장면을 바꿀 수 있어요.',
          '답장 추천: 말문이 막히면 대화 흐름에 맞는 한 줄을 추천받을 수 있어요.',
        ],
      },
      {
        heading: '나만의 캐릭터 만들기',
        paragraphs: [
          '이름과 나이, 직업만 적어도 AI가 살아온 이야기와 성격, 말투를 채워 줍니다. 나를 소개하는 페르소나와 첫 장면을 적으면 캐릭터가 그것을 알고 다가와요. 목소리까지 골라 입힌 뒤 검수를 거쳐 공개하면 다른 사람도 내 캐릭터와 이야기할 수 있습니다. 나만의 캐릭터 제작은 Pro 이용권에서 제공돼요.',
        ],
      },
    ],
    faq: [
      { question: 'AI 캐릭터 채팅은 무료인가요?', answer: `가입하면 ${loungeFreePlan.features[0]}로 무료로 시작할 수 있어요. 채팅 무제한은 Pro 이용권(월 ${won(pro.price)})에서 제공됩니다.` },
      { question: '캐릭터를 직접 만들 수 있나요?', answer: '네. 이름, 나이, 직업만 적어도 AI가 성격과 말투를 채우고, 시나리오와 목소리까지 정할 수 있습니다(Pro). 검수를 거쳐 공개하면 다른 사람도 이용할 수 있어요.' },
      { question: '롤플레이도 되나요?', answer: '네. 대사와 *행동*을 함께 쓰는 롤플레이를 지원하고, 준비된 시나리오로 시작하거나 직접 첫 장면을 쓸 수 있어요.' },
      { question: '캐릭터와 계속 이야기하면 달라지나요?', answer: '네. 지난 대화를 기억하고, 함께한 시간과 대화에 따라 관계가 천천히 깊어지며 반응도 달라집니다.' },
      { question: '캐릭터는 실제 인물인가요?', answer: '아니요. 모든 캐릭터는 AI로 만든 가상의 인물이고, 사진도 AI가 만든 이미지입니다.' },
    ],
    related: ['/ai-companion', '/ai-call', '/voice-chat'], showCast: true,
  },
];

export const seoGuideByPath = (path: string) => seoGuides.find(guide => guide.path === path);

export const seoHomeFaq: readonly SeoFaq[] = [
  { question: '사석은 어떤 서비스인가요?', answer: '사석은 나를 기억하고 함께한 시간만큼 가까워지는 AI 컴패니언 서비스입니다. AI 캐릭터와 채팅하고, 전화를 걸어 목소리로 대화하고, 나만의 캐릭터와 시나리오를 만들 수 있어요.' },
  { question: 'AI 전화나 AI 통화도 할 수 있나요?', answer: `네. 대화방에서 ‘전화 연결’을 누르면 캐릭터와 실시간으로 목소리 대화를 합니다. Pro 이용권은 월 ${callMinutes}분 통화할 수 있어요.` },
  { question: '무료로 쓸 수 있나요?', answer: `가입하면 무료로 시작할 수 있고, ${loungeFreePlan.features.join(', ')}가 제공됩니다. Pro 이용권은 월 ${won(pro.price)}, 연 ${won(proYear.price)}이고 자동으로 다시 결제되지 않아요.` },
  { question: '캐릭터는 실제 사람인가요?', answer: '아니요. 캐릭터와 사진, 목소리는 모두 AI로 만든 가상의 인물입니다. 사석은 만 18세 이상을 위한 서비스예요.' },
  { question: '어디서 이용하나요?', answer: '웹 브라우저에서 saseok.kr로 접속해 이용합니다. PC와 모바일 모두 쓸 수 있어요.' },
];

export const seoHome = {
  path: '/lounge',
  title: '사석 — 목소리로 대화하는 AI 컴패니언 · AI 전화 · 캐릭터 채팅',
  description: '나를 기억하고 가까워지는 AI 컴패니언 사석. 캐릭터와 채팅하고, 전화를 걸어 목소리로 대화해 보세요.',
  h1: '사석 — 나를 기억하는 AI 컴패니언',
  lead: '어제의 나를 기억하는 사람. 사석은 AI 캐릭터와 채팅하고, 전화로 목소리를 나누며, 함께한 시간만큼 가까워지는 AI 컴패니언 서비스입니다.',
  sections: [
    { heading: '사석에서 할 수 있는 일', paragraphs: ['목소리와 글, 기억과 이야기로 이어지는 네 가지 약속입니다.'], bullets: [
      'AI 컴패니언: 취향과 약속, 함께 쓴 이야기를 기억하고 천천히 가까워지는 캐릭터',
      'AI 전화·AI 통화: ‘전화 연결’ 한 번으로 캐릭터와 목소리로 대화하고, 끊으면 채팅으로 이어져요',
      '캐릭터 채팅·롤플레이: 대사와 행동을 함께 쓰는 롤플레이, 준비된 시나리오와 배경',
      '나만의 캐릭터: 이름과 직업만 적어도 AI가 성격과 말투를 채우는 캐릭터와 시나리오 만들기',
    ] },
    { heading: '이용 방법과 요금', paragraphs: [
      `1) 가입하고 마음이 가는 캐릭터를 고릅니다. 2) 준비된 이야기로 시작하거나 나를 소개하고 나만의 이야기를 엽니다. 3) 채팅으로 천천히, 또는 전화로 목소리를 들으며 대화합니다.`,
      `무료로 시작할 수 있고(${loungeFreePlan.features.join(', ')}), Pro 이용권은 월 ${won(pro.price)} 또는 연 ${won(proYear.price)}입니다. Pro는 음성 통화 월 ${callMinutes}분, 채팅 무제한, 장기 기억, 나만의 캐릭터 제작을 포함해요.`,
    ] },
    { heading: '안심하고 이용하세요', paragraphs: [seoVirtualNotice] },
  ] as readonly SeoSection[],
};

const portraitOf = (character: LoungeCharacter) => (loungeHosts as readonly { id: string; portrait: string; voiceLabel: string }[]).find(host => host.id === character.id);
export const seoCharacterPortrait = (character: LoungeCharacter) => portraitOf(character)?.portrait ?? character.fullBody ?? '/og-saseok.jpg';
export const seoCharacterVoice = (character: LoungeCharacter) => portraitOf(character)?.voiceLabel ?? '';

const firstSentences = (text: string, max: number) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('다.'), cut.lastIndexOf('요.'));
  return end > max * 0.4 ? cut.slice(0, end + (cut[end] === '.' ? 1 : 2)) : `${cut.trimEnd()}…`;
};

/** The sentences a character page and its static copy say about one character. */
export function seoCharacterPage(character: LoungeCharacter) {
  const voice = seoCharacterVoice(character);
  return {
    path: `/lounge/characters/${character.id}`,
    title: `${character.name} — ${character.job} AI 캐릭터와 목소리로 대화 · 사석`,
    description: `${character.name}(${character.job}). ${character.role}. AI로 만든 가상의 인물과 목소리로 직접 이야기해 보세요.`,
    h1: `${character.name} — ${character.job}`,
    lead: character.tagline,
    quote: character.quote,
    about: character.story[0] ? firstSentences(character.story[0], 260) : character.role,
    traits: character.personality.slice(0, 4).map(item => `${item.label}: ${firstSentences(item.text, 90)}`),
    voice,
    faq: [
      { question: `${character.name}는 실제 인물인가요?`, answer: `아니요. ${character.name}는 사석이 AI로 만든 가상의 캐릭터이고, 사진과 목소리도 AI가 만든 것입니다.` },
      { question: `${character.name}와 전화로 대화할 수 있나요?`, answer: `네. 대화방에서 ‘전화 연결’을 누르면 ${character.name}${voice ? `의 목소리(${voice})` : ''}로 실시간 대화를 할 수 있어요. 통화 시간은 이용권에 따라 달라요(Pro 월 ${callMinutes}분).` },
      { question: `${character.name}는 저를 기억하나요?`, answer: '네. 지난 대화에서 나눈 취향과 약속, 이야기를 기억하고 다음 대화에서 이어 갑니다. 기억은 설정에서 보고 고칠 수 있어요.' },
    ] as readonly SeoFaq[],
  };
}
