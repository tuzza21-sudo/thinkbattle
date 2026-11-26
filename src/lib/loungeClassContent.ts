/*
 * 클래스의 내용 (2026-11-26, by the owner): 윤서연's emotional and literary writing, 윤지안's logical and persuasive
 * writing, 한지오's Italian culture trip (Florence and Venice) and 선우령's art history (modern and contemporary). The
 * class board shows these; the character's reply reads the chosen one's facts from here, so a tour or a talk on a work
 * stands on them and does not make them up. Pictures are from Wikimedia Commons, public domain or CC BY / CC BY-SA, with
 * their credit (public/lounge/class/<id>.jpg); a work still under copyright has no picture, only its museum's page.
 */

export type LoungeClassImage = { src: string; credit: string; license: string; source: string };

// ── Writing ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export type LoungeWritingExercise = { id: string; title: string; goal: string; task: string; length: string; focus: readonly string[] };

/** 윤서연 (출판 편집자): 감성적이고 문학적인 글. */
export const loungeEmotionalExercises: readonly LoungeWritingExercise[] = [
  { id: 'senses', title: '오감으로 쓰는 한 장면', goal: '보이는 것 말고 들리고, 냄새 나고, 만져지는 것으로 장면을 살리기',
    task: '오늘 하루 중 한 순간을 골라, 눈으로 본 것 말고 다른 감각 두 가지 이상으로 써 보세요.', length: '5~8문장', focus: ['감각의 구체성', '장면의 생생함', '문장 리듬'] },
  { id: 'unnamed', title: '이름 없는 감정', goal: '감정을 이름으로 말하지 않고 행동과 사물로 보여 주기',
    task: '"슬프다, 기쁘다, 외롭다" 같은 감정 단어를 한 번도 쓰지 않고, 최근에 느낀 감정 하나를 행동과 사물로만 써 보세요.', length: '5~8문장', focus: ['보여 주기', '감정의 절제', '여운'] },
  { id: 'letter', title: '보내지 않을 편지', goal: '한 사람에게만 하는 말투로 진심을 꺼내기',
    task: '보내지 않을 편지를 한 사람에게 써 보세요. 그 사람만 알아들을 수 있는 기억 하나를 꼭 넣어요.', length: '8~12문장', focus: ['진정성', '구체적인 기억', '마무리의 여운'] },
  { id: 'object', title: '사물에 기대어 쓰는 에세이', goal: '작은 물건 하나로 시간과 마음을 이야기하기',
    task: '오래 가지고 있는 물건 하나를 골라, 그 물건이 거쳐 온 시간과 지금의 나를 이어 짧은 에세이로 써 보세요.', length: '8~12문장', focus: ['사물 묘사', '시간의 연결', '주제의 깊이'] },
  { id: 'opening', title: '첫 문장 다시 쓰기', goal: '읽는 사람을 붙잡는 첫 문장 만들기',
    task: '내가 쓴 글이나 쓰고 싶은 이야기의 첫 문장을 세 가지 다른 방식(장면으로, 대사로, 질문으로)으로 써 보세요.', length: '3문장', focus: ['끌어당기는 힘', '새로움', '이어질 기대'] },
  { id: 'trim', title: '퇴고: 덜어 내기', goal: '같은 마음을 더 적은 말로',
    task: '전에 쓴 글 한 단락을 붙여 넣고, 그 단락을 30% 줄인 버전도 함께 써 보세요. 무엇을 뺐는지 한 줄로 적어요.', length: '원문 + 줄인 글', focus: ['군더더기', '핵심 보존', '문장 리듬'] },
];

/** 윤지안 (사회부 기자): 논리적이고 설득력 있는 글. */
export const loungeLogicalExercises: readonly LoungeWritingExercise[] = [
  { id: 'claim', title: '주장은 한 문장으로', goal: '하고 싶은 말을 반박 가능한 한 문장으로 세우기',
    task: '요즘 관심 있는 문제 하나에 대한 내 주장을 한 문장으로 쓰고, 왜 그 주장이 중요한지 두세 문장 덧붙여 보세요.', length: '3~4문장', focus: ['주장의 명확성', '범위의 구체성', '중요성'] },
  { id: 'evidence', title: '근거 세 개', goal: '주장을 사실, 사례, 숫자로 받치기',
    task: '주장 하나를 쓰고, 그 주장을 받치는 근거를 세 가지 종류(사실, 사례, 숫자)로 하나씩 써 보세요.', length: '5~7문장', focus: ['근거의 종류', '근거와 주장의 연결', '검증 가능성'] },
  { id: 'counter', title: '반론을 먼저', goal: '반대편의 가장 강한 주장을 먼저 인정하고 넘어서기',
    task: '내 주장에 대한 가장 강한 반론을 먼저 공정하게 쓰고, 그다음 그 반론에 답하는 글을 써 보세요.', length: '6~8문장', focus: ['반론의 공정함', '재반박의 논리', '설득력'] },
  { id: 'lead', title: '칼럼의 첫 문단', goal: '첫 문단에 누가, 무엇을, 왜를 세우기',
    task: '관심 있는 사건이나 현상으로 칼럼의 첫 문단을 써 보세요. 첫 두 문장 안에 핵심 주장이 드러나야 해요.', length: '3~5문장', focus: ['핵심의 위치', '구체적인 도입', '간결성'] },
  { id: 'fact', title: '사실과 의견 가르기', goal: '확인된 사실과 내 해석을 섞지 않기',
    task: '최근 본 뉴스 하나를 골라, 확인된 사실만으로 세 문장, 내 의견만으로 세 문장을 따로 써 보세요.', length: '6문장', focus: ['사실의 정확성', '의견의 표시', '구분의 명확성'] },
  { id: 'proposal', title: '설득하는 제안 메일', goal: '읽는 사람이 바로 결정할 수 있게 쓰기',
    task: '상사나 거래처에 무언가를 제안하는 메일을 써 보세요. 요청, 이유, 상대가 얻는 것, 다음 단계가 들어가야 해요.', length: '6~10문장', focus: ['요청의 명확성', '상대 관점', '구조'] },
  { id: 'summary', title: '세 줄 요약', goal: '긴 글의 핵심만 남기기',
    task: '읽은 기사나 글 한 편을 붙여 넣거나 내용을 설명하고, 그 글을 세 줄로 요약해 보세요.', length: '3문장', focus: ['핵심 선별', '정확성', '간결성'] },
];

// ── The Italian culture trip ────────────────────────────────────────────────────────────────────────────────────────

/** A travel class's trip (2026-11-27): 한지오's Italy, and 민서하's national parks (loungeParkContent.ts). */
export type LoungeTravelTripId = 'italy' | 'parks';
export type LoungeTravelSite = {
  /** Its trip (Italy when not given), and its tab on the board: a city of Italy, or a region of the parks. */
  id: string; trip?: LoungeTravelTripId; city: string; name: string; local: string; era: string;
  summary: string; history: string; heritage: string; mustSee: readonly string[]; experience: readonly string[]; tip: string;
  image?: LoungeClassImage;
};

export const loungeTravelSites: readonly LoungeTravelSite[] = [
  { id: 'duomo', city: '피렌체', name: '두오모 (산타 마리아 델 피오레 대성당)', local: 'Cattedrale di Santa Maria del Fiore', era: '1296년 착공 · 돔 1420~1436년',
    summary: '피렌체의 하늘을 정하는 붉은 돔. 르네상스 건축이 시작된 곳이에요.',
    history: '1296년 아르놀포 디 캄비오의 설계로 짓기 시작했지만, 거대한 팔각형 지붕을 덮을 방법이 없어 한 세기 넘게 열려 있었어요. 1420년 필리포 브루넬레스키가 공모에 이겨 1436년 돔을 완성했어요. 성당 옆에는 조토가 설계를 시작한 종탑과, 더 오래된 산 조반니 세례당이 함께 서 있어요.',
    heritage: '브루넬레스키는 거대한 받침 틀 없이 안팎 두 겹의 껍질과 벽돌을 엇갈려 쌓는 방식으로 돔을 올렸어요. 고대 이후 가장 큰 벽돌 돔으로, 르네상스 공학의 상징이자 1982년 유네스코 세계유산 "피렌체 역사지구"의 중심이에요.',
    mustSee: ['돔 꼭대기까지 오르는 463계단과 내부의 "최후의 심판" 프레스코', '조토의 종탑(414계단)에서 보는 돔', '세례당의 황금빛 천장 모자이크', '두오모 오페라 박물관의 기베르티 "천국의 문" 원본'],
    experience: ['돔 계단 중간에서 두 겹 구조 사이를 직접 걸어 보기', '해 질 녘 종탑 위에서 붉은 지붕들 내려다보기'],
    tip: '돔 오르기는 시간 지정 예약이 필요해요. 좁은 계단이라 편한 신발이 좋아요.' },
  { id: 'uffizi', city: '피렌체', name: '우피치 미술관', local: 'Galleria degli Uffizi', era: '1560년 착공 · 1769년 일반 공개',
    summary: '르네상스 회화의 교과서가 한 건물에 모인 미술관.',
    history: '1560년 코시모 1세 데 메디치가 조르조 바사리에게 정부 사무실(uffizi)을 짓게 한 것이 시작이에요. 메디치 가문이 모은 미술품이 이곳에 쌓였고, 1737년 가문의 마지막 상속자 안나 마리아 루이자 데 메디치가 소장품을 피렌체를 떠나지 않는다는 조건으로 도시에 남겼어요.',
    heritage: '보티첼리, 레오나르도, 미켈란젤로, 라파엘로, 티치아노, 카라바조까지 르네상스와 그 이후 이탈리아 회화의 흐름을 원작으로 따라갈 수 있는, 세계에서 가장 오래된 미술관 중 하나예요.',
    mustSee: ['보티첼리 "비너스의 탄생"과 "봄(프리마베라)"', '레오나르도 다 빈치 "수태고지"', '미켈란젤로 "도니 톤도"', '티치아노 "우르비노의 비너스"', '카라바조 "메두사"'],
    experience: ['보티첼리 방에서 "봄"의 인물들이 누구인지 하나씩 찾아보기', '창밖으로 보이는 베키오 다리와 아르노강'],
    tip: '사전 예약을 하면 긴 줄을 피할 수 있어요. 보고 싶은 작품 다섯 점을 정해 두면 덜 지쳐요.' },
  { id: 'pontevecchio', city: '피렌체', name: '베키오 다리', local: 'Ponte Vecchio', era: '1345년 재건',
    summary: '다리 위에 상점이 늘어선, 피렌체에서 가장 오래된 다리.',
    history: '홍수로 무너진 다리를 1345년 지금의 석조 다리로 다시 지었어요. 처음엔 정육점과 가죽 가게가 있었지만 1593년 페르디난도 1세가 냄새나는 가게를 내보내고 금세공 상점만 남겼어요. 1944년 독일군이 후퇴하며 아르노강의 다리를 폭파할 때도 이 다리만은 남았어요.',
    heritage: '중세에서 르네상스로 이어지는 도시의 삶이 다리 위 상점이라는 형태로 지금까지 이어지는 드문 사례예요. 다리 위층으로는 메디치 가문이 궁전 사이를 오가던 바사리 회랑이 지나가요.',
    mustSee: ['다리 가운데의 첼리니 흉상과 아르노강 전망', '다리 위층을 지나는 바사리 회랑의 작은 창들', '대대로 이어 온 금세공 상점들'],
    experience: ['해 질 녘 산타 트리니타 다리에서 베키오 다리 바라보기', '금세공 장인의 진열장 구경하기'],
    tip: '낮에는 무척 붐벼요. 이른 아침이나 저녁이 사진 찍기 좋아요.' },
  { id: 'signoria', city: '피렌체', name: '시뇨리아 광장과 베키오 궁전', local: 'Piazza della Signoria · Palazzo Vecchio', era: '1299년 궁전 착공',
    summary: '피렌체 공화국의 정치가 벌어지던 광장이자 지금도 시청인 궁전.',
    history: '베키오 궁전은 1299년부터 공화국 정부의 청사로 지어졌고, 메디치 가문이 한때 이곳에 살았어요. 광장에서는 1498년 수도사 사보나롤라가 처형되었고, 그 자리를 표시한 동판이 바닥에 있어요.',
    heritage: '공화정의 자치를 상징하는 건축과 광장이 함께 남아 있어, 르네상스 도시가 권력과 예술을 어떻게 드러냈는지 보여 줘요. 광장의 란치 회랑은 야외 조각 미술관이에요.',
    mustSee: ['베키오 궁전의 500인의 방', '궁전 앞 미켈란젤로 "다비드" 복제본(원본은 아카데미아)', '란치 회랑의 첼리니 "메두사의 머리를 든 페르세우스"', '암만나티의 넵투누스 분수'],
    experience: ['궁전 탑에 올라 두오모와 눈높이 맞추기', '광장 바닥의 사보나롤라 동판 찾기'],
    tip: '란치 회랑은 무료로 볼 수 있어요. 궁전 탑은 날씨에 따라 문을 닫기도 해요.' },
  { id: 'accademia', city: '피렌체', name: '아카데미아 미술관', local: 'Galleria dell’Accademia', era: '다비드 1501~1504년',
    summary: '미켈란젤로의 "다비드" 원본이 서 있는 곳.',
    history: '"다비드"는 1501~1504년 미켈란젤로가 다른 조각가들이 포기한 대리석 덩어리로 깎은 작품이에요. 처음엔 시뇨리아 광장에 세워졌다가, 비바람으로부터 보호하려고 1873년 이 미술관으로 옮겼어요.',
    heritage: '거인 골리앗에 맞서는 소년 다윗은 강대국 사이에서 독립을 지키려던 피렌체 공화국의 상징이었어요. 르네상스 인체 조각의 정점으로 꼽혀요.',
    mustSee: ['미켈란젤로 "다비드"', '돌 속에서 몸을 빼내는 듯한 미완성 "포로" 연작'],
    experience: ['"다비드"를 정면, 옆, 뒤에서 차례로 보며 시선과 긴장감 비교하기', '미완성 "포로"에서 조각이 만들어지는 과정 상상하기'],
    tip: '작은 미술관이지만 줄이 길어요. 예약하고 이른 시간에 가는 게 좋아요.' },
  { id: 'santacroce', city: '피렌체', name: '산타 크로체 성당', local: 'Basilica di Santa Croce', era: '1294년 착공',
    summary: '미켈란젤로, 갈릴레이, 마키아벨리가 잠든 "이탈리아 영광의 사원".',
    history: '1294년 프란치스코회 성당으로 짓기 시작했어요. 미켈란젤로, 갈릴레오 갈릴레이, 마키아벨리, 로시니의 무덤이 있고 단테의 기념비도 있어요(단테의 무덤은 라벤나에 있어요). 1966년 아르노강 홍수 때 크게 잠겼어요.',
    heritage: '이탈리아 문화의 거장들이 한곳에 모인 기억의 장소이자, 조토의 프레스코로 서양 회화가 평면에서 사람의 감정으로 넘어가는 순간을 볼 수 있는 곳이에요.',
    mustSee: ['미켈란젤로와 갈릴레이의 무덤', '조토의 바르디 예배당·페루치 예배당 프레스코', '브루넬레스키의 파치 예배당'],
    experience: ['거장들의 무덤 앞에서 그들이 남긴 한 문장 떠올려 보기', '광장에서 젤라토 한 컵'],
    tip: '성당 안 무덤 위치를 미리 알고 가면 찾기 쉬워요.' },
  { id: 'michelangelo', city: '피렌체', name: '미켈란젤로 광장', local: 'Piazzale Michelangelo', era: '1869년 조성',
    summary: '피렌체 전체를 한눈에 내려다보는 언덕 위 광장.',
    history: '피렌체가 이탈리아 왕국의 수도였던 시기에 건축가 주세페 포지가 도시를 정비하며 1869년 이 광장을 만들었어요. 가운데에는 "다비드"의 청동 복제본이 서 있어요.',
    heritage: '두오모, 베키오 궁전, 베키오 다리가 한 장면에 담기는 전망 덕분에 피렌체 역사지구 전체의 모습을 이해하기 가장 좋은 자리예요.',
    mustSee: ['일몰 무렵 아르노강과 두오모가 함께 보이는 전망', '조금 더 올라간 언덕의 산 미니아토 알 몬테 성당'],
    experience: ['해 지기 30분 전에 도착해 도시의 색이 바뀌는 걸 지켜보기'],
    tip: '걸어 오르면 20~30분, 버스로도 갈 수 있어요. 해 질 녘엔 자리가 금방 차요.' },
  { id: 'pitti', city: '피렌체', name: '피티 궁전과 보볼리 정원', local: 'Palazzo Pitti · Giardino di Boboli', era: '15세기 중반 · 1549년 메디치 매입',
    summary: '메디치 대공의 궁전과 이탈리아식 정원의 본보기.',
    history: '15세기 은행가 루카 피티가 지은 궁전을 1549년 코시모 1세의 부인 엘레오노라 디 톨레도가 사들여 메디치 가문의 궁전이 되었어요. 궁전 뒤의 보볼리 정원은 이후 수 세기 동안 넓혀졌어요.',
    heritage: '보볼리 정원은 조각과 분수, 동굴을 배치한 이탈리아식 정원의 대표로, 유럽 왕궁 정원들의 본보기가 되었어요. 궁전 안 팔라티나 미술관에는 라파엘로와 티치아노의 작품이 많아요.',
    mustSee: ['팔라티나 미술관의 라파엘로 "의자의 성모"', '보볼리 정원의 부온탈렌티 동굴', '정원 위쪽에서 보는 피렌체 전망'],
    experience: ['정원 언덕을 천천히 오르며 조각과 분수 찾기'],
    tip: '정원이 넓고 언덕이 있어요. 물과 편한 신발을 챙기세요.' },
  { id: 'sanmarco', city: '베네치아', name: '산 마르코 대성당', local: 'Basilica di San Marco', era: '1063년경 착공 · 1094년 봉헌',
    summary: '황금 모자이크로 빛나는 베네치아의 심장.',
    history: '828년 베네치아 상인들이 알렉산드리아에서 성 마르코의 유해를 가져오면서 그를 모실 성당을 지었어요. 지금의 건물은 11세기에 비잔틴 양식으로 다시 지어졌고, 정면의 청동 말 네 마리는 1204년 콘스탄티노플에서 가져온 것이에요(원본은 성당 박물관에 있어요).',
    heritage: '동방의 비잔틴과 서방의 건축이 만난 결과물로, 동서 교역으로 번성한 베네치아 공화국의 부와 정체성을 그대로 보여 줘요. 1987년 "베네치아와 석호"가 유네스코 세계유산이 되었어요.',
    mustSee: ['천장과 벽을 덮은 황금빛 모자이크', '보석으로 장식한 제단화 "팔라 도로"', '성당 박물관의 청동 말 원본과 테라스 전망'],
    experience: ['테라스에 올라 산 마르코 광장 내려다보기', '해 질 녘 모자이크가 빛을 받는 순간 보기'],
    tip: '어깨와 무릎을 가리는 복장이 필요하고, 큰 가방은 맡겨야 해요.' },
  { id: 'ducale', city: '베네치아', name: '두칼레 궁전', local: 'Palazzo Ducale', era: '14~15세기 고딕 궁전',
    summary: '베네치아를 천 년 가까이 다스린 도제의 궁전.',
    history: '공화국의 최고 지도자 도제가 머물고 정부와 법원이 함께 있던 곳이에요. 대평의회실에는 틴토레토 공방의 거대한 그림 "천국"이 걸려 있어요. 궁전과 감옥은 탄식의 다리로 이어지고, 1756년 카사노바가 이 감옥을 탈출한 이야기로도 유명해요.',
    heritage: '레이스처럼 가벼운 베네치아 고딕 양식의 대표작으로, 한 공화국이 수 세기 동안 권력을 나누고 견제한 방식이 건물 구조에 담겨 있어요.',
    mustSee: ['대평의회실과 틴토레토 "천국"', '황금 계단', '감옥으로 이어지는 탄식의 다리 내부'],
    experience: ['탄식의 다리 창살 너머로 바다 보기(죄수가 마지막으로 본 풍경)', '비밀 통로 투어로 숨은 방 둘러보기'],
    tip: '비밀 통로 투어는 인원이 정해져 있어 미리 예약해야 해요.' },
  { id: 'rialto', city: '베네치아', name: '리알토 다리와 리알토 시장', local: 'Ponte di Rialto', era: '1588~1591년 석조 다리',
    summary: '대운하를 가로지르는 가장 오래된 다리와 천 년 된 시장.',
    history: '처음엔 나무다리였지만 여러 번 무너지거나 불에 탔고, 1588~1591년 안토니오 다 폰테가 지금의 돌다리로 지었어요. 다리 옆 리알토 시장은 베네치아 상업의 중심이었어요.',
    heritage: '아치 하나로 대운하를 건너는 대담한 설계와 다리 위 상점들이 그대로 남아, 교역 도시 베네치아의 일상을 지금까지 보여 줘요.',
    mustSee: ['다리 위에서 보는 대운하 전망', '오전의 리알토 생선·채소 시장'],
    experience: ['아침 시장에서 제철 해산물 구경하기', '골목 바카로에서 치케티(작은 안주) 맛보기'],
    tip: '시장은 오전에, 다리는 이른 아침이나 밤에 가면 한산해요.' },
  { id: 'grandcanal', city: '베네치아', name: '대운하', local: 'Canal Grande', era: '도시의 큰길',
    summary: '도시를 S자로 가로지르는 물의 큰길.',
    history: '베네치아를 S자로 가로지르는 약 3.8km의 운하로, 귀족과 상인들이 이 물길을 따라 궁전을 지었어요. 지금도 수상버스(바포레토)와 곤돌라가 다니는 도시의 큰길이에요.',
    heritage: '물 위에 세운 도시가 어떻게 교통과 상업, 주거를 함께 만들었는지 보여 주는 살아 있는 풍경이에요. 운하 양쪽에 수백 년에 걸친 건축 양식이 이어져요.',
    mustSee: ['금빛 장식으로 유명했던 카도로', '살루테 성당이 보이는 대운하 입구', '아카데미아 다리 위 전망'],
    experience: ['바포레토 1번을 타고 대운하를 처음부터 끝까지 천천히 지나가기', '트라게토(공용 곤돌라)로 운하 건너 보기'],
    tip: '바포레토 1번이 천천히 모든 정류장에 서서 구경하기 좋아요.' },
  { id: 'accademiave', city: '베네치아', name: '베네치아 아카데미아 미술관', local: 'Gallerie dell’Accademia', era: '14~18세기 베네치아 회화',
    summary: '빛과 색으로 그린 베네치아 화파의 보고.',
    history: '벨리니, 조르조네, 티치아노, 틴토레토, 베로네세로 이어지는 베네치아 회화를 모아 둔 미술관이에요. 베로네세의 "레위 가의 향연"은 원래 최후의 만찬을 그린 그림이었지만 1573년 종교재판에 불려 간 뒤 제목을 바꿨다고 해요.',
    heritage: '피렌체가 선과 소묘를 중시했다면, 베네치아 화가들은 색과 빛으로 형태를 만들었어요. 그 차이를 원작으로 직접 비교할 수 있는 곳이에요.',
    mustSee: ['조르조네 "폭풍우"', '베로네세 "레위 가의 향연"', '조반니 벨리니의 성모자 그림들'],
    experience: ['"폭풍우" 앞에서 그림이 무슨 이야기인지 나만의 해석 세워 보기'],
    tip: '레오나르도의 "비트루비우스적 인간" 원본은 보존을 위해 거의 공개되지 않아요.' },
  { id: 'salute', city: '베네치아', name: '산타 마리아 델라 살루테 성당', local: 'Basilica di Santa Maria della Salute', era: '1631년 착공 · 1687년 봉헌',
    summary: '흑사병이 끝나기를 빌며 지은 하얀 돔 성당.',
    history: '1630년 흑사병으로 도시 인구가 크게 줄자 베네치아는 병이 끝나면 성모께 성당을 바치겠다고 서원했어요. 건축가 발다사레 롱게나가 설계해 1687년 봉헌했어요. 지금도 매년 11월 21일 운하에 임시 다리를 놓고 감사 행렬을 해요.',
    heritage: '대운하 입구에 서서 도시의 얼굴이 된 바로크 건축으로, 재앙을 함께 견딘 공동체의 기억이 축제로 이어지는 문화유산이에요.',
    mustSee: ['팔각형 내부와 큰 돔', '성구실의 티치아노와 틴토레토 그림'],
    experience: ['맞은편 산 마르코 쪽에서 살루테 성당이 물에 비치는 모습 보기'],
    tip: '11월 21일 "살루테 축일"에 가면 임시 다리와 행렬을 볼 수 있어요.' },
  { id: 'murano', city: '베네치아', name: '무라노와 부라노', local: 'Murano · Burano', era: '1291년 유리 공방 이전',
    summary: '유리의 섬과 알록달록한 레이스의 섬.',
    history: '1291년 베네치아는 화재를 막기 위해 유리 공방을 무라노섬으로 옮기게 했고, 장인들의 기술은 오랫동안 철저히 지켜졌어요. 부라노는 레이스와 집집마다 다른 색으로 칠한 어부들의 집으로 유명해요.',
    heritage: '수백 년 이어진 유리와 레이스 장인 기술은 섬 공동체가 지켜 온 살아 있는 무형 유산이에요.',
    mustSee: ['무라노 유리 공방의 유리 불기 시연', '무라노 유리 박물관', '부라노의 색색 집이 늘어선 운하'],
    experience: ['유리 장인이 불 속에서 형태를 만드는 순간 지켜보기', '부라노에서 골목마다 다른 색 찾기'],
    tip: '두 섬은 바포레토로 갈 수 있어요. 반나절 이상 잡는 게 좋아요.' },
];

// ── Art history ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type LoungeArtWork = {
  id: string; artist: string; artistLife: string; movement: string; title: string; local: string; year: string; place: string;
  context: string; look: readonly string[]; meaning: string; question: string;
  /** A public domain picture of the work; none for a work still under copyright (link instead). */
  image?: LoungeClassImage; museum?: string;
};

export const loungeArtWorks: readonly LoungeArtWork[] = [
  { id: 'impression', artist: '클로드 모네', artistLife: '1840~1926', movement: '인상주의', title: '인상, 해돋이', local: 'Impression, soleil levant', year: '1872', place: '파리 마르모탕 모네 미술관',
    context: '1874년 첫 전시에서 한 비평가가 이 그림 제목을 비꼬아 "인상주의자들"이라고 부르면서, 운동의 이름이 되었어요.',
    look: ['물 위에 찍힌 주황빛 해와 그 그림자', '빠르고 짧은 붓질로만 그린 배와 안개', '선명한 윤곽 대신 공기와 빛의 순간'],
    meaning: '대상을 정확히 그리는 대신, 그 순간 눈에 닿는 빛의 인상을 그리겠다는 선언 같은 그림이에요.', question: '이 그림에서 가장 먼저 눈이 가는 곳은 어디인가요?' },
  { id: 'waterlilies', artist: '클로드 모네', artistLife: '1840~1926', movement: '인상주의', title: '수련 연작', local: 'Nymphéas', year: '1890년대 말~1926', place: '파리 오랑주리 미술관 외',
    context: '모네는 지베르니 정원의 연못을 30년 가까이 250점 넘게 그렸어요. 말년에는 시력이 나빠지는 중에도 거대한 화폭을 이어 갔어요.',
    look: ['수평선 없이 물 표면만 가득 채운 구도', '물에 비친 하늘과 구름', '시간과 계절에 따라 달라지는 색'],
    meaning: '하나의 대상을 끝없이 다시 보며 시간과 빛 자체를 그린 작업으로, 훗날 추상회화의 선구로도 읽혀요.', question: '같은 연못을 수백 번 그린 이유가 뭐였을 것 같나요?' },
  { id: 'grandejatte', artist: '조르주 쇠라', artistLife: '1859~1891', movement: '신인상주의(점묘주의)', title: '그랑드자트섬의 일요일 오후', local: 'Un dimanche après-midi à l’Île de la Grande Jatte', year: '1884~1886', place: '시카고 미술관',
    context: '쇠라는 색을 섞지 않고 작은 점으로 나란히 찍어, 보는 사람의 눈에서 색이 섞이게 했어요. 이 그림을 2년 가까이 그렸어요.',
    look: ['가까이서 보면 점, 멀리서 보면 하나의 색', '조각상처럼 멈춘 듯한 사람들', '빛과 그림자의 질서 정연한 배치'],
    meaning: '순간의 인상을 과학적인 색채 이론과 엄격한 구성으로 붙잡으려 한 시도로, 인상주의 다음 걸음을 보여 줘요.', question: '사람들이 왜 이렇게 굳어 있는 듯 보일까요?' },
  { id: 'saintevictoire', artist: '폴 세잔', artistLife: '1839~1906', movement: '후기인상주의', title: '생트빅투아르산', local: 'La Montagne Sainte-Victoire', year: '1880년대~1906', place: '여러 미술관(필라델피아 미술관 외)',
    context: '세잔은 고향 엑상프로방스의 이 산을 수십 번 그렸어요. 자연을 원기둥, 구, 원뿔로 다루라는 그의 말은 다음 세대 화가들에게 큰 영향을 줬어요.',
    look: ['색면 조각이 쌓여 만들어진 산과 들', '원근보다 면과 면의 관계', '같은 산이 그림마다 조금씩 다른 구조'],
    meaning: '눈에 보이는 순간보다 대상의 단단한 구조를 그리려 한 작업으로, 피카소와 브라크의 큐비즘으로 이어져 "현대미술의 아버지"라 불려요.', question: '사진과 비교하면 이 산은 무엇이 다르게 보이나요?' },
  { id: 'starrynight', artist: '빈센트 반 고흐', artistLife: '1853~1890', movement: '후기인상주의', title: '별이 빛나는 밤', local: 'De sterrennacht', year: '1889', place: '뉴욕 현대미술관(MoMA)',
    context: '생레미의 요양원에 머물던 1889년, 창밖 풍경과 기억, 상상을 섞어 그렸어요. 마을은 실제와 다르고, 사이프러스 나무는 크게 키웠어요.',
    look: ['소용돌이치는 하늘과 크게 빛나는 별', '불꽃처럼 솟은 사이프러스', '고요한 마을과 요동치는 하늘의 대비'],
    meaning: '보이는 밤하늘이 아니라 느끼는 밤하늘을 그린 그림으로, 감정을 색과 붓질로 드러내는 표현주의의 길을 열었어요.', question: '이 하늘은 불안해 보이나요, 아니면 살아 있어 보이나요?' },
  { id: 'gauguin', artist: '폴 고갱', artistLife: '1848~1903', movement: '후기인상주의 · 종합주의', title: '우리는 어디서 왔는가? 우리는 무엇인가? 우리는 어디로 가는가?', local: 'D’où venons-nous? Que sommes-nous? Où allons-nous?', year: '1897~1898', place: '보스턴 미술관',
    context: '타히티에서 그린 가로 4m에 가까운 대작으로, 고갱은 이 그림을 자신의 유언 같은 작품이라고 여겼어요.',
    look: ['오른쪽 아기에서 왼쪽 노인으로 흐르는 삶의 순서', '평평하고 강렬한 색면', '푸른 우상과 신비로운 분위기'],
    meaning: '삶과 죽음에 대한 질문을 문명 바깥의 세계에서 찾으려 한 그림이에요. 오늘날에는 식민주의적 시선이라는 비판과 함께 읽히기도 해요.', question: '그림의 오른쪽에서 왼쪽으로 따라가면 어떤 이야기가 보이나요?' },
  { id: 'scream', artist: '에드바르 뭉크', artistLife: '1863~1944', movement: '표현주의', title: '절규', local: 'Skrik', year: '1893', place: '오슬로 노르웨이 국립미술관',
    context: '뭉크는 해 질 녘 길을 걷다 "자연을 꿰뚫는 끝없는 비명"을 느꼈다고 적었어요. 같은 주제를 그림, 파스텔, 판화로 여러 번 만들었어요.',
    look: ['귀를 막은 채 해골처럼 굳은 얼굴', '핏빛으로 일렁이는 하늘', '무심히 걸어가는 뒤쪽의 두 사람'],
    meaning: '외부의 풍경이 아니라 내면의 불안을 그린 그림으로, 현대인의 고독과 공포를 상징하는 이미지가 되었어요.', question: '비명을 지르는 건 사람일까요, 풍경일까요?' },
  { id: 'kiss', artist: '구스타프 클림트', artistLife: '1862~1918', movement: '빈 분리파 · 아르누보', title: '키스', local: 'Der Kuss', year: '1907~1908', place: '빈 벨베데레 궁전 미술관',
    context: '클림트의 "황금 시기" 대표작으로, 실제 금박을 써서 비잔틴 모자이크 같은 빛을 냈어요.',
    look: ['금빛 옷에 감싸여 하나가 된 두 사람', '남자의 옷은 사각형, 여자의 옷은 원과 꽃 무늬', '절벽 끝 꽃밭에 선 위태로운 자리'],
    meaning: '사랑의 황홀과 위태로움을 장식과 상징으로 그린 작품으로, 순수미술과 장식미술의 경계를 허문 빈 분리파의 정신을 보여 줘요.', question: '두 사람은 행복해 보이나요, 아니면 어딘가 위태로워 보이나요?' },
  { id: 'dance', artist: '앙리 마티스', artistLife: '1869~1954', movement: '야수파', title: '춤', local: 'La Danse', year: '1910', place: '상트페테르부르크 에르미타주 미술관',
    context: '러시아 수집가 시추킨의 주문으로 그린 대형 장식화예요. 마티스는 빨강, 파랑, 초록 세 가지 색만으로 화면을 채웠어요.',
    look: ['손을 잡고 원을 그리며 도는 다섯 사람', '끊어질 듯 이어진 앞쪽 두 손', '단순한 색면과 리듬감 있는 선'],
    meaning: '색을 대상의 실제 색에서 해방시켜 감정과 리듬을 전하는 데 쓴, 야수파의 정신이 가장 단순한 형태로 드러난 그림이에요.', question: '끊어질 듯한 두 손은 무엇을 말하는 것 같나요?' },
  { id: 'composition7', artist: '바실리 칸딘스키', artistLife: '1866~1944', movement: '추상미술', title: '구성 VII', local: 'Composition VII', year: '1913', place: '모스크바 트레티야코프 미술관',
    context: '칸딘스키는 음악처럼 형태와 색만으로 감정을 울리는 그림을 꿈꿨어요. 이 그림을 위해 30점 넘는 습작을 그렸어요.',
    look: ['알아볼 수 있는 대상이 없는 화면', '소용돌이치는 색과 선의 충돌', '음악의 악장처럼 여러 중심이 있는 구성'],
    meaning: '그림이 무엇을 "그리지" 않아도 감정을 전할 수 있다는 것을 보여 준 초기 추상회화의 대표작이에요.', question: '이 그림을 음악으로 바꾼다면 어떤 소리일까요?' },
  { id: 'mondrian', artist: '피트 몬드리안', artistLife: '1872~1944', movement: '신조형주의(데 스테일)', title: '빨강, 파랑, 노랑의 구성 II', local: 'Compositie II in rood, blauw en geel', year: '1930', place: '취리히 쿤스트하우스',
    context: '몬드리안은 나무 그림에서 출발해 점점 수평선과 수직선, 삼원색만 남겼어요.',
    look: ['검은 수직선과 수평선이 나눈 면', '크게 놓인 빨강과 작은 파랑, 노랑', '좌우가 맞지 않는데도 느껴지는 균형'],
    meaning: '세상의 질서를 가장 단순한 요소로 표현하려 한 작업으로, 건축과 디자인, 패션까지 영향을 줬어요.', question: '빨간 면이 오른쪽에 있었다면 느낌이 어떻게 달라질까요?' },
  { id: 'senecio', artist: '파울 클레', artistLife: '1879~1940', movement: '표현주의 · 바우하우스', title: '세네치오', local: 'Senecio', year: '1922', place: '바젤 미술관',
    context: '바우하우스에서 가르치던 시기의 작품이에요. 클레는 "미술은 보이는 것을 재현하는 것이 아니라 보이게 하는 것"이라고 말했어요.',
    look: ['원과 사각형으로 만든 얼굴', '따뜻한 주황과 노랑의 색면', '아이 그림 같으면서도 정교한 균형'],
    meaning: '얼굴을 기하학적 색면으로 단순하게 바꾸며, 순수한 시선과 치밀한 구성이 함께 갈 수 있다는 것을 보여 줘요.', question: '이 얼굴의 표정은 어떤가요?' },
  { id: 'demoiselles', artist: '파블로 피카소', artistLife: '1881~1973', movement: '큐비즘', title: '아비뇽의 처녀들', local: 'Les Demoiselles d’Avignon', year: '1907', place: '뉴욕 현대미술관(MoMA)', museum: 'https://www.moma.org/collection/works/79766',
    context: '세잔의 구조와 이베리아·아프리카 조각에서 받은 충격을 담아 그렸어요. 처음 본 동료 화가들조차 당황했어요.',
    look: ['여러 방향에서 본 모습을 한 화면에 합친 몸', '가면 같은 얼굴', '깨진 유리처럼 조각난 공간'],
    meaning: '하나의 시점으로 보는 원근법을 깨뜨려 큐비즘의 문을 연 그림으로, 20세기 미술의 출발점으로 꼽혀요.', question: '왜 한 사람의 얼굴을 여러 방향에서 본 것처럼 그렸을까요?' },
  { id: 'guernica', artist: '파블로 피카소', artistLife: '1881~1973', movement: '큐비즘', title: '게르니카', local: 'Guernica', year: '1937', place: '마드리드 레이나 소피아 국립미술관', museum: 'https://www.museoreinasofia.es/en/collection/artwork/guernica',
    context: '스페인 내전 중 1937년 나치 독일 공군이 바스크의 도시 게르니카를 폭격한 뒤, 그해 파리 만국박람회를 위해 그렸어요.',
    look: ['흑백과 회색만 쓴 거대한 화면', '죽은 아이를 안고 울부짖는 어머니', '부서진 말과 전구 모양의 눈'],
    meaning: '특정한 사건을 넘어 전쟁의 폭력 자체를 고발하는 상징이 되었어요.', question: '색을 뺀 것이 그림에 어떤 힘을 줬을까요?' },
  { id: 'persistence', artist: '살바도르 달리', artistLife: '1904~1989', movement: '초현실주의', title: '기억의 지속', local: 'La persistencia de la memoria', year: '1931', place: '뉴욕 현대미술관(MoMA)', museum: 'https://www.moma.org/collection/works/79018',
    context: '달리는 꿈과 무의식을 정밀한 사실적 묘사로 그렸어요. 녹아내리는 시계는 치즈가 녹는 모습에서 떠올렸다고 말했어요.',
    look: ['나뭇가지와 탁자에 늘어진 시계들', '개미가 모인 시계', '고향 카탈루냐의 바닷가 절벽'],
    meaning: '단단해야 할 시간이 녹아내리는 이미지로 꿈과 기억 속 시간의 감각을 보여 주는 초현실주의의 상징이에요.', question: '시계가 녹아내린다면, 그건 시간이 어떻게 된 걸까요?' },
  { id: 'pipe', artist: '르네 마그리트', artistLife: '1898~1967', movement: '초현실주의', title: '이미지의 배반', local: 'La Trahison des images', year: '1929', place: '로스앤젤레스 카운티 미술관(LACMA)', museum: 'https://collections.lacma.org/node/239578',
    context: '파이프 그림 아래에 "이것은 파이프가 아니다"라고 써 넣었어요.',
    look: ['광고처럼 또렷하게 그린 파이프 하나', '그 아래의 손글씨 문장'],
    meaning: '그림은 대상 자체가 아니라 대상의 이미지일 뿐이라는 것을 일깨우며, 말과 이미지의 관계를 묻는 작품이에요.', question: '이것이 파이프가 아니라면 무엇일까요?' },
  { id: 'nighthawks', artist: '에드워드 호퍼', artistLife: '1882~1967', movement: '미국 사실주의', title: '나이트호크스', local: 'Nighthawks', year: '1942', place: '시카고 미술관', museum: 'https://www.artic.edu/artworks/111628/nighthawks',
    context: '진주만 공습 직후의 미국에서 그린 그림으로, 호퍼는 "대도시의 고독을 그렸는지도 모른다"고 말했어요.',
    look: ['밤거리에서 혼자 환한 유리창의 식당', '대화하지 않는 네 사람', '출입문이 보이지 않는 유리 벽'],
    meaning: '함께 있어도 서로 닿지 않는 도시인의 고독을 영화 장면처럼 그려, 수많은 영화와 사진에 영향을 줬어요.', question: '이 사람들은 어떤 밤을 보내고 있을까요?' },
  { id: 'autumnrhythm', artist: '잭슨 폴록', artistLife: '1912~1956', movement: '추상표현주의', title: '가을의 리듬 (넘버 30)', local: 'Autumn Rhythm (Number 30)', year: '1950', place: '뉴욕 메트로폴리탄 미술관', museum: 'https://www.metmuseum.org/art/collection/search/488978',
    context: '바닥에 펼친 캔버스 위를 돌며 물감을 흘리고 뿌리는 "드리핑" 기법으로 그렸어요.',
    look: ['검정, 흰색, 갈색 선이 얽힌 거대한 화면', '중심도 위아래도 없는 구성', '몸의 움직임이 그대로 남은 흔적'],
    meaning: '그림을 무엇을 그린 결과가 아니라 그리는 행위의 기록으로 바꿔, 전후 미국 미술이 세계 미술의 중심이 되는 계기가 되었어요.', question: '이 선들 속에서 리듬이 느껴지나요?' },
  { id: 'rothko', artist: '마크 로스코', artistLife: '1903~1970', movement: '색면추상', title: '로스코 채플', local: 'Rothko Chapel', year: '1971 개관', place: '미국 휴스턴 로스코 채플', museum: 'https://www.rothkochapel.org/',
    context: '로스코가 말년에 이 공간을 위해 그린 14점의 거대한 어두운 그림으로 채운 명상의 공간이에요. 그는 개관을 보지 못했어요.',
    look: ['거의 검게 보이는 보랏빛과 갈색의 큰 색면', '천천히 보면 드러나는 미세한 색의 차이', '그림에 둘러싸이는 팔각형 공간'],
    meaning: '그림을 보는 것이 아니라 그림 앞에 머무는 경험으로, 색만으로 깊은 감정과 명상을 불러일으키려 한 색면추상의 도달점이에요.', question: '아무것도 그려지지 않은 그림 앞에서 무엇을 느낄 수 있을까요?' },
  { id: 'marilyn', artist: '앤디 워홀', artistLife: '1928~1987', movement: '팝아트', title: '마릴린 두 폭', local: 'Marilyn Diptych', year: '1962', place: '런던 테이트 모던', museum: 'https://www.tate.org.uk/art/artworks/warhol-marilyn-diptych-t03093',
    context: '마릴린 먼로가 세상을 떠난 1962년, 그녀의 홍보 사진을 실크스크린으로 50번 반복해 찍었어요.',
    look: ['왼쪽의 화려한 컬러 마릴린 25개', '오른쪽의 점점 흐려지는 흑백 마릴린 25개', '공장에서 찍어 낸 듯한 반복'],
    meaning: '스타의 이미지가 상품처럼 대량 복제되는 대중문화와, 그 뒤의 죽음과 소멸을 함께 보여 주는 팝아트의 대표작이에요.', question: '오른쪽으로 갈수록 흐려지는 얼굴은 무엇을 말할까요?' },
  { id: 'whanki', artist: '김환기', artistLife: '1913~1974', movement: '한국 추상미술', title: '우주 (05-IV-71 #200)', local: 'Universe 05-IV-71 #200', year: '1971', place: '개인 소장',
    context: '뉴욕 시기의 김환기는 캔버스에 수많은 점을 찍고 하나하나 테두리를 둘러, 고향과 그리운 사람들을 떠올렸다고 해요. 2019년 한국 미술품 경매 최고가 기록을 세웠어요.',
    look: ['두 개의 화면이 하나의 우주를 이루는 구성', '푸른 점들이 소용돌이처럼 퍼져 나가는 모습', '가까이서 보면 점마다 다른 번짐'],
    meaning: '한국적인 정서와 서구 추상을 하나로 엮은 전면점화의 대표작으로, 한국 현대미술이 세계와 만나는 장면을 보여 줘요.', question: '점 하나하나가 무엇이라고 생각하면 그림이 달라 보일까요?' },
];

/**
 * Where the guide stops inside each site (2026-11-26, by the owner: the member should see what is talked about). Each
 * spot has its picture in loungeClassImages under the same id; the note is the one line the guide starts from.
 */
export type LoungeTravelSpot = { id: string; name: string; note: string };
export const loungeTravelSpots: Record<string, readonly LoungeTravelSpot[]> = {
  duomo: [
    { id: 'duomo-dome', name: '돔 안쪽 "최후의 심판"', note: '돔 안쪽을 가득 채운 프레스코. 463계단을 오르는 길에 가까이 지나가요.' },
    { id: 'duomo-campanile', name: '조토의 종탑', note: '조토가 설계를 시작한 종탑. 414계단 위에서 돔을 정면으로 봐요.' },
    { id: 'duomo-baptistery', name: '세례당 천장 모자이크', note: '성당보다 오래된 산 조반니 세례당의 황금빛 천장.' },
  ],
  uffizi: [
    { id: 'birth-venus', name: '보티첼리 "비너스의 탄생"', note: '조개를 타고 바다에서 막 태어난 비너스. 보티첼리 방의 주인공.' },
    { id: 'primavera', name: '보티첼리 "봄(프리마베라)"', note: '오렌지 숲에 선 비너스와 신화 속 인물들이 봄을 연다.' },
    { id: 'annunciation', name: '레오나르도 다 빈치 "수태고지"', note: '천사가 마리아에게 소식을 전하는 장면. 젊은 레오나르도의 작품.' },
    { id: 'doni-tondo', name: '미켈란젤로 "도니 톤도"', note: '둥근 화면 속 성가족. 조각가 미켈란젤로의 단단한 인체.' },
    { id: 'venus-urbino', name: '티치아노 "우르비노의 비너스"', note: '베네치아 화가 티치아노의 색과 빛으로 그린 누운 비너스.' },
    { id: 'medusa', name: '카라바조 "메두사"', note: '방패 위에 그린, 비명 지르는 메두사의 머리.' },
  ],
  pontevecchio: [
    { id: 'vasari-corridor', name: '바사리 회랑', note: '다리 위층으로 지나가는, 메디치 가문이 궁전 사이를 오가던 통로.' },
  ],
  signoria: [
    { id: 'perseus', name: '첼리니 "페르세우스"', note: '란치 회랑에 선, 메두사의 머리를 든 청동 페르세우스.' },
    { id: 'neptune', name: '넵투누스 분수', note: '암만나티가 만든 바다의 신 분수.' },
    { id: 'cinquecento', name: '베키오 궁전 500인의 방', note: '공화국 대회의가 열리던 거대한 홀.' },
  ],
  accademia: [
    { id: 'david', name: '"다비드" 원본', note: '1873년 광장에서 옮겨 온 미켈란젤로의 원본 대리석상.' },
    { id: 'prisoners', name: '미완성 "포로"', note: '돌 속에서 몸을 빼내는 듯한 미완성 조각.' },
  ],
  santacroce: [
    { id: 'michelangelo-tomb', name: '미켈란젤로의 무덤', note: '회화·조각·건축을 상징하는 세 여인이 지키는 무덤.' },
    { id: 'galileo-tomb', name: '갈릴레이의 무덤', note: '근대 과학의 아버지가 잠든 자리.' },
    { id: 'bardi-chapel', name: '조토의 바르디 예배당 프레스코', note: '평면에서 사람의 감정으로 넘어가는 조토의 그림.' },
    { id: 'pazzi-chapel', name: '브루넬레스키의 파치 예배당', note: '르네상스 건축의 비례를 보여 주는 작은 예배당.' },
  ],
  michelangelo: [
    { id: 'san-miniato', name: '산 미니아토 알 몬테 성당', note: '광장에서 조금 더 올라간 언덕 위의 성당.' },
  ],
  pitti: [
    { id: 'seggiola', name: '라파엘로 "의자의 성모"', note: '팔라티나 미술관의 둥근 성모자 그림.' },
    { id: 'grotto', name: '부온탈렌티 동굴', note: '보볼리 정원의 조각으로 꾸민 인공 동굴.' },
  ],
  sanmarco: [
    { id: 'pala-doro', name: '팔라 도로', note: '보석으로 장식한 황금 제단화.' },
    { id: 'horses', name: '청동 말 네 마리', note: '1204년 콘스탄티노플에서 가져온 말. 원본은 성당 박물관에 있어요.' },
  ],
  ducale: [
    { id: 'paradise', name: '틴토레토 "천국"', note: '대평의회실 벽을 덮은 거대한 그림.' },
    { id: 'sighs', name: '탄식의 다리', note: '궁전과 감옥을 잇는 다리. 죄수가 마지막으로 본 바다.' },
  ],
  rialto: [
    { id: 'rialto-market', name: '리알토 생선 시장', note: '천 년 이어진 베네치아의 아침 시장.' },
  ],
  grandcanal: [
    { id: 'ca-doro', name: '카도로', note: '금빛 장식으로 유명했던 대운하의 궁전.' },
  ],
  accademiave: [
    { id: 'tempest', name: '조르조네 "폭풍우"', note: '번개 치는 하늘 아래 두 인물. 아직도 해석이 갈리는 그림.' },
    { id: 'levi', name: '베로네세 "레위 가의 향연"', note: '최후의 만찬으로 그렸다가 종교재판 뒤 제목을 바꾼 그림.' },
  ],
  salute: [
    { id: 'salute-interior', name: '팔각형 내부와 큰 돔', note: '흑사병이 끝나길 빌며 지은 성당의 빛나는 안쪽.' },
  ],
  murano: [
    { id: 'glassblowing', name: '무라노 유리 불기', note: '1291년부터 이어진 유리 장인의 불 앞 시연.' },
  ],
};
