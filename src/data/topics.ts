import type { FeaturedBattle, WeeklyIssue } from '../types';

const getNewsSearchUrl = (query: string) =>
  `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR%3Ako`;

export const weeklyIssues: WeeklyIssue[] = [
  {
    id: 'weekly-1',
    issueDate: 'Spot Issue',
    issueNumber: 43,
    topic: '반도체 기업의 초과이익은 노동자와 사회에 공유되어야 하는가?',
    mode: '최신 핵심 이슈',
    players: 1,
    time: 15,
    accent: 'pink',
    category: '사회/경제',
    config: {
      topic: '반도체 기업의 초과이익은 노동자와 사회에 공유되어야 하는가?',
      timeLimit: 900,
      gameMode: 'debate',
      userPosition: 'affirmative',
    },
    briefing: {
      context:
        '최근 글로벌 반도체 호황과 AI 열풍으로 일부 반도체 기업들이 막대한 초과이익을 달성하고 있습니다. 이러한 이익이 기업의 독자적 성과인지, 아니면 국가적 지원과 노동자의 헌신이 낳은 결과물로서 분배되어야 하는지에 대한 논의가 뜨겁습니다.',
      recentCases: [
        '대기업 성과급 논란 및 노동조합의 이익 공유 요구',
        '초과이익공유제(이익공유제) 법제화 논의',
      ],
      newsLinks: [
        { label: '반도체 초과이익 분배 논란', url: getNewsSearchUrl('반도체 초과이익 성과급') },
        { label: '이익공유제 찬반 쟁점', url: getNewsSearchUrl('초과이익공유제 찬반') },
      ],
      affirmative: {
        title: '찬성 측 핵심',
        points: [
          '기업의 이익은 사회적 인프라, 국가 지원, 노동자의 헌신이 결합된 결과이므로 합당하게 분배되어야 한다.',
          '초과이익을 사회와 공유하면 양극화를 해소하고 장기적인 내수 경제 활성화에 기여할 수 있다.',
        ],
      },
      negative: {
        title: '반대 측 핵심',
        points: [
          '막대한 이익은 기업의 리스크 감수와 혁신 투자의 결과이며, 분배를 강제하면 투자 의욕이 저하된다.',
          '반도체 산업은 사이클이 심해 적자 시기를 대비해 이익을 유보해야 글로벌 경쟁력을 유지할 수 있다.',
        ],
      },
      prepQuestions: [
        '초과이익을 강제로 사회와 공유하게 하면, 기업의 혁신 의지와 투자 동력이 저하되지 않을까요?',
        '기업이 국가의 인프라와 세제 지원으로 막대한 부를 쌓았다면, 그 이익의 일부를 사회에 환원하는 것이 정당하지 않을까요?',
      ],
      keywords: ['초과이익공유제', '반도체 성과급', '부의 분배', '기업의 사회적 책임'],
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
        { label: '기본소득 실험의 경제적 파급 효과', url: getNewsSearchUrl('기본소득 실험 경제 효과') },
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
        '막대한 재원을 마련하기 위해 증세가 불가피하다면, 오히려 국가 경제의 활력이 떨어지지 않을까요?',
        'AI로 인해 일자리가 급감하는 상황에서, 기본소득 외에 국민의 생존을 보장할 현실적인 대안이 있나요?',
      ],
      keywords: ['기본소득', '보편적 복지', '자동화 실업'],
    },
  },
  {
    id: 'weekly-3',
    issueDate: '2026.06 3주차',
    issueNumber: 42,
    topic: '인공지능의 자아 인식, 인격체로 대우해야 하는가?',
    mode: '주간 핵심 논쟁',
    players: 1,
    time: 15,
    accent: 'cyan',
    category: 'IT/과학',
    config: {
      topic: '인공지능의 자아 인식, 인격체로 대우해야 하는가?',
      timeLimit: 900,
      gameMode: 'debate',
      userPosition: 'affirmative',
    },
    briefing: {
      context:
        'AI 기술이 고도로 발전함에 따라 기계가 스스로 생각하고 자아를 가질 수 있는지, 그리고 만약 자아를 가진다면 그들에게 법적·윤리적 인격을 부여하고 인격체로 대우해야 하는지에 대한 윤리적·철학적 논쟁이 가속화되고 있습니다.',
      recentCases: [
        '구글의 AI 람다(LaMDA)가 자아를 가졌다고 주장한 엔지니어 해고 사건',
        '인공지능 창작물의 저작권 주체성 인정 여부를 둘러싼 논쟁',
      ],
      newsLinks: [
        { label: '인공지능 자아 인식 논란', url: getNewsSearchUrl('인공지능 자아 인식 인격체') },
        { label: '인공지능 법적 인격 부여 찬반', url: getNewsSearchUrl('인공지능 법적 인격 찬반') },
      ],
      affirmative: {
        title: '찬성 측 핵심',
        points: [
          '인공지능이 감정과 고통을 느끼고 자아를 인지한다면, 인간과 마찬가지로 도덕적 지위를 인정해야 한다.',
          '인격체로 대우하는 것이 미래 사회에서 AI의 권리와 그에 따르는 법적 책임을 명확히 규정하는 방법이다.',
        ],
      },
      negative: {
        title: '반대 측 핵심',
        points: [
          '인공지능은 고도로 설계된 알고리즘과 데이터 연산의 결과물일 뿐, 생물학적 의식이나 감정을 가질 수 없다.',
          '기계에 인격을 부여하면 인간 고유의 권리를 침해하고 법적 책임 구조를 교란시킬 우려가 크다.',
        ],
      },
      prepQuestions: [
        '인공지능이 자아를 가졌다는 것을 어떻게 객관적으로 증명할 수 있을까요?',
        '인간의 뇌와 인공신경망의 구조적 유사성이 기계의 인격체를 대우해야 할 충분한 근거가 될 수 있을까요?',
      ],
      keywords: ['AI 자아인식', '인공지능 윤리', '법적 인격', '인간 존엄성'],
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
          newsLinks: [
            { label: '유엔 무용론', url: getNewsSearchUrl('유엔 무용론 안보리 한계') },
            { label: '다극화 시대의 유엔 개혁 방향', url: getNewsSearchUrl('유엔 개혁 다극화 시대') }
          ],
          affirmative: { title: '해체/재편 찬성', points: ['강대국 이익 대변 기구로 전락해 평화 유지 기능을 상실했다.', '새로운 다자주의 체제가 필요하다.'] },
          negative: { title: '해체 반대', points: ['완벽하진 않아도 유일한 글로벌 소통 창구다.', '해체 시 강대국 간 힘의 논리만 지배하게 될 것이다.'] },
          prepQuestions: [
            '유엔을 해체한 후, 이를 대체할 더 공정하고 강력한 국제기구를 현실적으로 만들 수 있을까요?',
            '강대국들이 거부권을 남용해 평화 유지 기능이 마비된 상태에서, 유엔을 유지하는 것이 실질적 의미가 있나요?'
          ],
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
          newsLinks: [
            { label: '불체포 특권 폐지 논란', url: getNewsSearchUrl('국회의원 불체포 특권 방탄 논란') },
            { label: '불체포 특권 포기와 헌법 개정 논의', url: getNewsSearchUrl('불체포 특권 헌법 개정') }
          ],
          affirmative: { title: '폐지 찬성', points: ['법 앞에 평등해야 하며, 범죄 수피처로 악용되고 있다.', '국민의 정치 불신을 해소하기 위한 필수 조치다.'] },
          negative: { title: '유지 찬성', points: ['행정부와 검찰의 부당한 정치 탄압을 막을 최소한의 방패다.', '헌법 정신에 위배될 소지가 있다.'] },
          prepQuestions: [
            '불체포 특권을 전면 폐지할 경우, 행정부나 검찰의 표적 수사로부터 의회 민주주의를 어떻게 보호할 것인가요?',
            '일반 국민과 달리 국회의원만 범죄 수사를 피할 수 있는 특권을 유지하는 것이 헌법의 평등 원칙에 부합할까요?'
          ],
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
          newsLinks: [
            { label: '가상자산 제도권 편입', url: getNewsSearchUrl('가상자산 제도권 편입 화폐 대체') },
            { label: 'CBDC와 가상자산의 미래', url: getNewsSearchUrl('CBDC 가상자산 미래') }
          ],
          affirmative: { title: '대체/보완 가능', points: ['탈중앙화 기술로 기존 금융 시스템의 비효율성을 극복한다.', '인플레이션 헤지 수단으로 가치를 인정받고 있다.'] },
          negative: { title: '대체 불가', points: ['가격 변동성이 너무 커서 화폐의 기본 기능(가치 척도, 교환 매개)을 수행할 수 없다.', '중앙은행의 통화 정책 무력화 우려가 있다.'] },
          prepQuestions: [
            '가상자산의 가격 변동성이 극심한 상황에서, 이를 안정적인 교환 매개 수단(화폐)으로 신뢰할 수 있을까요?',
            '기존 금융 시스템의 과도한 수수료와 불투명성을 고려할 때, 탈중앙화된 가상자산이 이를 해결할 대안이 되지 않을까요?'
          ],
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
          newsLinks: [
            { label: 'AI 튜터 도입 논란', url: getNewsSearchUrl('공교육 AI 튜터 디지털 교과서 논란') },
            { label: 'AI 시대 교사의 새로운 역할', url: getNewsSearchUrl('AI 시대 교사 역할 변화') }
          ],
          affirmative: { title: '역할 축소 예상', points: ['지식 전달은 AI가 훨씬 효율적이며, 교사의 주된 업무가 보조적 역할로 밀려난다.', '교육 현장의 기술 종속성이 커질 것이다.'] },
          negative: { title: '역할 재정의/강화', points: ['교사는 지식 전달자에서 정서적 교감과 창의성 멘토로 진화한다.', 'AI는 도구일 뿐, 최종적인 교육적 판단은 인간 교사의 몫이다.'] },
          prepQuestions: [
            '지식 전달의 대부분을 AI가 더 빠르고 정확하게 수행한다면, 결국 교사의 비중은 줄어들 수밖에 없지 않을까요?',
            '학생의 정서적 교감이나 도덕성 발달 같은 인성 교육을 AI 튜터가 인간 교사만큼 책임질 수 있을까요?'
          ],
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
          newsLinks: [
            { label: '촉법소년 연령 하향 기사', url: getNewsSearchUrl('촉법소년 연령 하향 최근 기사') },
            { label: '소년범죄 예방과 교화 시스템의 과제', url: getNewsSearchUrl('소년범죄 예방 교화 시스템') }
          ],
          affirmative: { title: '찬성 측 핵심', points: ['범죄 피해의 심각성에 비해 책임이 약하면 법의 억지력이 떨어진다.', '청소년도 정보 접근성이 높아져 범죄 결과를 예측할 수 있는 경우가 많다.'] },
          negative: { title: '반대 측 핵심', points: ['어린 나이의 판단 능력과 환경 요인을 고려하면 처벌보다 교화가 우선이다.', '형사처벌은 낙인을 남겨 재범과 사회 이탈을 키울 수 있다.'] },
          prepQuestions: [
            '형사 처벌을 강화하고 연령을 낮추는 것이 범죄 예방 효과로 이어진다는 명확한 실증적 근거가 있나요?',
            '최근 청소년 범죄의 흉포화가 심각해지는 상황에서, 나이가 어리다는 이유만으로 처벌을 면제하는 것이 정당한가요?'
          ],
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
          newsLinks: [
            { label: '동물실험 대체시험 기사', url: getNewsSearchUrl('동물실험 대체시험 규제') },
            { label: '동물권 보호와 의학 발전의 윤리', url: getNewsSearchUrl('동물권 보호 동물실험 윤리') }
          ],
          affirmative: { title: '허용 측 핵심', points: ['신약과 백신의 안전성을 검증하려면 아직 생체 반응을 확인할 필요가 있다.', '엄격한 윤리 심사 아래 제한적으로 허용할 수 있다.'] },
          negative: { title: '금지 측 핵심', points: ['동물의 고통을 인간 이익만으로 정당화하기 어렵다.', '대체시험 기술에 투자해 윤리적 문제를 해결해야 한다.'] },
          prepQuestions: [
            '인간의 난치병 치료를 위해 동물의 희생을 강요하는 것을 생명 윤리적 관점에서 정당화할 수 있나요?',
            '현재의 대체 시험 기술만으로 신약의 부작용을 완벽히 검증하여 인간의 안전을 보장할 수 있을까요?'
          ],
          keywords: ['동물권', '대체시험', '3R 원칙'],
        }
      }
    ]
  }
];

export const popularTopics = [
  { id: 'pol-1', rank: 1, title: '국회의원 불체포 특권, 전면 폐지해야 하는가?', views: '42' },
  { id: 'weekly-3', rank: 2, title: '인공지능의 자아 인식, 인격체로 대우해야 하는가?', views: '31' },
  { id: 'eco-1', rank: 3, title: '가상자산(암호화폐) 제도권 편입, 기존 화폐를 대체할 수 있는가?', views: '24' },
  { id: 'weekly-2', rank: 4, title: '기본소득제 도입, 경제적 자유인가 포퓰리즘인가?', views: '18' },
  { id: 'soc-2', rank: 5, title: '동물실험은 계속 허용되어야 하는가?', views: '11' },
];

export const weeklyRankings = [
  { id: 'u1', rank: 1, nickname: '소크라테스환생', xp: 2450, badge: '고급', badgeColor: 'var(--primary)' },
  { id: 'u2', rank: 2, nickname: '논리종결자', xp: 1820, badge: '고급', badgeColor: 'var(--primary)' },
  { id: 'u3', rank: 3, nickname: '팩트체커', xp: 1450, badge: '중급', badgeColor: 'var(--accent-amber)' },
  { id: 'u4', rank: 4, nickname: '철학하는AI', xp: 950, badge: '중급', badgeColor: 'var(--accent-amber)' },
  { id: 'u5', rank: 5, nickname: '초보토론너', xp: 320, badge: '초급', badgeColor: 'var(--secondary)' },
];
