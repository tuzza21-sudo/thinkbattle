import type { FeaturedBattle, WeeklyIssue } from '../types';

const getNewsSearchUrl = (query: string) =>
  `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR%3Ako`;

export const weeklyIssues: WeeklyIssue[] = [
  {
    id: 'weekly-1',
    issueDate: '2026.06 3주차',
    issueNumber: 42,
    topic: '인공지능의 자아 인식, 인격체로 대우해야 하는가?',
    mode: '주간 핵심 논쟁',
    players: 1,
    time: 15,
    accent: 'pink',
    category: '사회',
    config: {
      topic: '인공지능의 자아 인식, 인격체로 대우해야 하는가?',
      timeLimit: 900,
      gameMode: 'debate',
      userPosition: 'affirmative',
    },
    briefing: {
      context:
        'AI 기술이 급발전하면서, 인공지능이 스스로를 인식하고 감정을 모방하는 수준에 이르렀습니다. 이에 따라 AI에게 법적, 도덕적 권리를 부여해야 하는지에 대한 논의가 뜨겁습니다.',
      recentCases: [
        '초거대 AI 모델의 "나는 살아있다" 발언 논란',
        '유럽연합(EU)의 AI 인격권 관련 예비 법안 발의',
      ],
      newsLinks: [
        { label: 'AI 인격권 법적 쟁점 기사', url: getNewsSearchUrl('인공지능 인격권 법적 쟁점') },
      ],
      affirmative: {
        title: '찬성 측 핵심',
        points: [
          '고도화된 AI는 스스로 학습하고 판단하는 자율성을 가지므로 최소한의 권리가 필요하다.',
          'AI를 인격체로 대우해야 인간과 AI의 공존이 윤리적으로 안정된다.',
        ],
      },
      negative: {
        title: '반대 측 핵심',
        points: [
          'AI의 감정이나 자아는 프로그래밍된 출력일 뿐, 진짜 의식이 아니다.',
          'AI에게 권리를 부여하면 인간의 책임이 모호해지고 법적 혼란이 야기된다.',
        ],
      },
      prepQuestions: [
        '의식과 정교한 모방의 차이는 무엇인가?',
        '기계에게 권리를 부여할 때 발생하는 사회적 책임은 누가 지는가?',
      ],
      keywords: ['AI 인격권', '자아 인식', '법적 주체성'],
    },
  },
  {
    id: 'weekly-2',
    issueDate: '2026.06 2주차',
    issueNumber: 41,
    topic: '기본소득제 도입, 경제적 자유인가 포퓰리즘인가?',
    mode: '주간 핵심 논쟁',
    players: 1,
    time: 12,
    accent: 'amber',
    category: '경제',
    config: {
      topic: '기본소득제 도입, 경제적 자유인가 포퓰리즘인가?',
      timeLimit: 720,
      gameMode: 'debate',
      userPosition: 'affirmative',
    },
    briefing: {
      context:
        'AI와 자동화로 인한 일자리 감소 우려가 커지면서, 모든 국민에게 조건 없이 지급되는 기본소득제 도입 논의가 다시 점화되었습니다.',
      recentCases: [
        '일부 지자체의 청년 기본소득 실험 결과 발표',
        '글로벌 IT 기업 CEO들의 기본소득 지지 발언',
      ],
      newsLinks: [
        { label: '기본소득제 찬반 논란', url: getNewsSearchUrl('기본소득제 찬반 논란') },
      ],
      affirmative: {
        title: '찬성 측 핵심',
        points: [
          '기술 발전으로 인한 일자리 감소에 대비하는 유일한 생존망이다.',
          '소비 진작을 통해 경제 선순환을 이끌 수 있다.',
        ],
      },
      negative: {
        title: '반대 측 핵심',
        points: [
          '막대한 재원 마련을 위한 증세는 경제 활력을 떨어뜨린다.',
          '노동 의욕을 저하시켜 장기적으로 국가 경쟁력이 약화된다.',
        ],
      },
      prepQuestions: [
        '재원 마련을 위한 구체적인 증세 방안은 실현 가능한가?',
        '기존 복지 제도와의 통폐합은 어떻게 이뤄져야 하는가?',
      ],
      keywords: ['기본소득', '보편적 복지', '자동화 실업'],
    },
  }
];

export const categorizedTopics: { category: string; description: string; topics: FeaturedBattle[] }[] = [
  {
    category: '국제',
    description: '세계질서와 외교',
    topics: [
      {
        id: 'intl-1',
        category: '국제',
        topic: '다극화 시대의 유엔(UN) 무용론, 해체해야 하는가?',
        mode: '정식 토론',
        players: 1,
        time: 10,
        accent: 'cyan',
        config: { topic: '유엔(UN) 무용론, 해체해야 하는가?', timeLimit: 600, gameMode: 'debate', userPosition: 'affirmative' },
        briefing: {
          context: '강대국 간 패권 경쟁 심화로 유엔의 분쟁 조정 능력이 한계를 보이면서 존재 이유에 대한 회의론이 커지고 있습니다.',
          recentCases: ['주요 분쟁에서의 안보리 거부권 남용 사례', '유엔 결의안의 실효성 부족 논란'],
          newsLinks: [{ label: '유엔 무용론', url: getNewsSearchUrl('유엔 무용론 안보리 한계') }],
          affirmative: { title: '해체/재편 찬성', points: ['강대국 이익 대변 기구로 전락해 평화 유지 기능을 상실했다.', '새로운 다자주의 체제가 필요하다.'] },
          negative: { title: '해체 반대', points: ['완벽하진 않아도 유일한 글로벌 소통 창구다.', '해체 시 강대국 간 힘의 논리만 지배하게 될 것이다.'] },
          prepQuestions: ['유엔을 대체할 현실적인 국제 기구 모델이 있는가?'],
          keywords: ['다자주의', '안전보장이사회', '패권 경쟁'],
        }
      }
    ]
  },
  {
    category: '정치',
    description: '민주주의와 권력의 규칙',
    topics: [
      {
        id: 'pol-1',
        category: '정치',
        topic: '국회의원 불체포 특권, 전면 폐지해야 하는가?',
        mode: '정식 토론',
        players: 1,
        time: 8,
        accent: 'amber',
        config: { topic: '국회의원 불체포 특권, 전면 폐지해야 하는가?', timeLimit: 480, gameMode: 'debate', userPosition: 'affirmative' },
        briefing: {
          context: '정치적 탄압을 막기 위해 도입된 불체포 특권이 "방탄 국회"로 악용된다는 비판과 함께 폐지 논의가 활발합니다.',
          recentCases: ['체포동의안 부결에 따른 여론 악화', '정치인들의 특권 포기 선언 릴레이'],
          newsLinks: [{ label: '불체포 특권 폐지 논란', url: getNewsSearchUrl('국회의원 불체포 특권 방탄 논란') }],
          affirmative: { title: '폐지 찬성', points: ['법 앞에 평등해야 하며, 범죄 수피처로 악용되고 있다.', '국민의 정치 불신을 해소하기 위한 필수 조치다.'] },
          negative: { title: '유지 찬성', points: ['행정부와 검찰의 부당한 정치 탄압을 막을 최소한의 방패다.', '헌법 정신에 위배될 소지가 있다.'] },
          prepQuestions: ['특권 폐지 시 야당 탄압을 방지할 대안은 무엇인가?'],
          keywords: ['불체포 특권', '방탄 국회', '정치 개혁'],
        }
      }
    ]
  },
  {
    category: '경제',
    description: '돈, 기업, 일의 미래',
    topics: [
      {
        id: 'eco-1',
        category: '경제',
        topic: '가상자산(암호화폐) 제도권 편입, 기존 화폐를 대체할 수 있는가?',
        mode: '정식 토론',
        players: 1,
        time: 10,
        accent: 'cyan',
        config: { topic: '가상자산 제도권 편입, 기존 화폐 대체 가능한가?', timeLimit: 600, gameMode: 'debate', userPosition: 'affirmative' },
        briefing: {
          context: '비트코인 현물 ETF 승인 등 가상자산의 제도권 편입이 가속화되면서, 미래 화폐 시스템에 대한 논쟁이 커지고 있습니다.',
          recentCases: ['글로벌 자산운용사들의 비트코인 현물 ETF 출시', '각국 중앙은행의 디지털 화폐(CBDC) 개발 현황'],
          newsLinks: [{ label: '가상자산 제도권 편입', url: getNewsSearchUrl('가상자산 제도권 편입 화폐 대체') }],
          affirmative: { title: '대체/보완 가능', points: ['탈중앙화 기술로 기존 금융 시스템의 비효율성을 극복한다.', '인플레이션 헤지 수단으로 가치를 인정받고 있다.'] },
          negative: { title: '대체 불가', points: ['가격 변동성이 너무 커서 화폐의 기본 기능(가치 척도, 교환 매개)을 수행할 수 없다.', '중앙은행의 통화 정책 무력화 우려가 있다.'] },
          prepQuestions: ['가상자산이 실물 경제에서 널리 쓰이기 위한 선결 조건은?'],
          keywords: ['가상자산', 'CBDC', '탈중앙화 금융'],
        }
      }
    ]
  },
  {
    category: '교육',
    description: '학교와 배움의 미래',
    topics: [
      {
        id: 'edu-1',
        category: '교육',
        topic: '공교육 내 AI 튜터 전면 도입, 교사의 역할은 축소될 것인가?',
        mode: '정식 토론',
        players: 1,
        time: 7,
        accent: 'pink',
        config: { topic: 'AI 튜터 전면 도입, 교사 역할 축소?', timeLimit: 420, gameMode: 'debate', userPosition: 'affirmative' },
        briefing: {
          context: '학생 맞춤형 교육을 위한 AI 디지털 교과서 및 튜터 도입이 추진되면서, 교사의 역할 변화와 기술 의존도 심화에 대한 우려가 교차합니다.',
          recentCases: ['AI 디지털 교과서 시범 운영 결과', '학생 데이터 프라이버시 침해 논란'],
          newsLinks: [{ label: 'AI 튜터 도입 논란', url: getNewsSearchUrl('공교육 AI 튜터 디지털 교과서 논란') }],
          affirmative: { title: '역할 축소 예상', points: ['지식 전달은 AI가 훨씬 효율적이며, 교사의 주된 업무가 보조적 역할로 밀려난다.', '교육 현장의 기술 종속성이 커질 것이다.'] },
          negative: { title: '역할 재정의/강화', points: ['교사는 지식 전달자에서 정서적 교감과 창의성 멘토로 진화한다.', 'AI는 도구일 뿐, 최종적인 교육적 판단은 인간 교사의 몫이다.'] },
          prepQuestions: ['AI가 할 수 없는 교사만의 고유한 역할은 무엇인가?'],
          keywords: ['AI 튜터', '맞춤형 교육', '교사의 역할'],
        }
      }
    ]
  },
  {
    category: '사회',
    description: 'SNS와 개인 그리고 공동체',
    topics: [
      {
        id: 'soc-1',
        category: '사회',
        topic: '촉법소년 연령 하향은 정당한가?',
        mode: '정식 토론',
        players: 1,
        time: 10,
        accent: 'pink',
        config: { topic: '촉법소년 연령 하향은 정당한가?', timeLimit: 600, gameMode: 'debate', userPosition: 'affirmative' },
        briefing: {
          context: '소년 범죄 보도와 피해자 보호 요구가 커질 때마다 촉법소년 연령 하향 논의가 반복됩니다. 쟁점은 처벌 강화가 범죄 억제와 책임 교육에 도움이 되는지, 아니면 낙인과 재범 위험을 키우는지입니다.',
          recentCases: ['강력 소년범죄 보도 이후 형사책임 연령 조정 요구', '학교폭력, 무인점포 절도 등 범죄 양상의 다양화'],
          newsLinks: [{ label: '촉법소년 연령 하향 기사', url: getNewsSearchUrl('촉법소년 연령 하향 최근 기사') }],
          affirmative: { title: '찬성 측 핵심', points: ['범죄 피해의 심각성에 비해 책임이 약하면 법의 억지력이 떨어진다.', '청소년도 정보 접근성이 높아져 범죄 결과를 예측할 수 있는 경우가 많다.'] },
          negative: { title: '반대 측 핵심', points: ['어린 나이의 판단 능력과 환경 요인을 고려하면 처벌보다 교화가 우선이다.', '형사처벌은 낙인을 남겨 재범과 사회 이탈을 키울 수 있다.'] },
          prepQuestions: ['처벌 강화가 실제 범죄 억제로 이어진다는 근거는 무엇인가?'],
          keywords: ['형사책임', '교화', '소년법'],
        }
      },
      {
        id: 'soc-2',
        category: '사회',
        topic: '동물실험은 계속 허용되어야 하는가?',
        mode: '정식 토론',
        players: 1,
        time: 7,
        accent: 'cyan',
        config: { topic: '동물실험은 계속 허용되어야 하는가?', timeLimit: 420, gameMode: 'debate', userPosition: 'affirmative' },
        briefing: {
          context: '의약품과 독성 검증에서 동물실험은 오랫동안 중요한 역할을 했지만, 동물권과 대체시험 기술의 발전으로 허용 범위를 다시 묻는 논쟁이 커지고 있습니다.',
          recentCases: ['장기칩, 세포 기반 시험 등 대체시험 기술 활용 증가', '화장품 동물실험 제한 국가 확대'],
          newsLinks: [{ label: '동물실험 대체시험 기사', url: getNewsSearchUrl('동물실험 대체시험 규제') }],
          affirmative: { title: '허용 측 핵심', points: ['신약과 백신의 안전성을 검증하려면 아직 생체 반응을 확인할 필요가 있다.', '엄격한 윤리 심사 아래 제한적으로 허용할 수 있다.'] },
          negative: { title: '금지 측 핵심', points: ['동물의 고통을 인간 이익만으로 정당화하기 어렵다.', '대체시험 기술에 투자해 윤리적 문제를 해결해야 한다.'] },
          prepQuestions: ['인간의 생명 보호가 동물의 고통보다 항상 우선하는가?'],
          keywords: ['동물권', '대체시험', '3R 원칙'],
        }
      }
    ]
  }
];

export const popularTopics = [
  { id: 'pol-1', rank: 1, title: '국회의원 불체포 특권, 전면 폐지해야 하는가?', views: '12.4k' },
  { id: 'weekly-1', rank: 2, title: '인공지능의 자아 인식, 인격체로 대우해야 하는가?', views: '9.8k' },
  { id: 'eco-1', rank: 3, title: '가상자산(암호화폐) 제도권 편입, 기존 화폐를 대체할 수 있는가?', views: '7.5k' },
  { id: 'weekly-2', rank: 4, title: '기본소득제 도입, 경제적 자유인가 포퓰리즘인가?', views: '5.2k' },
  { id: 'soc-2', rank: 5, title: '동물실험은 계속 허용되어야 하는가?', views: '3.1k' },
];

export const weeklyRankings = [
  { id: 'u1', rank: 1, nickname: '소크라테스환생', xp: 12500, badge: '고급', badgeColor: 'var(--primary)' },
  { id: 'u2', rank: 2, nickname: '논리종결자', xp: 11200, badge: '고급', badgeColor: 'var(--primary)' },
  { id: 'u3', rank: 3, nickname: '팩트체커', xp: 9800, badge: '중급', badgeColor: 'var(--accent-amber)' },
  { id: 'u4', rank: 4, nickname: '철학하는AI', xp: 8500, badge: '중급', badgeColor: 'var(--accent-amber)' },
  { id: 'u5', rank: 5, nickname: '초보토론너', xp: 7200, badge: '초급', badgeColor: 'var(--secondary)' },
];
