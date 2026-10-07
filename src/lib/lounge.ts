export const loungeHosts = [
  {
    id: 'jaeseok', name: '유쾌한 재담꾼', tag: '함께 웃으며 풀어 주는', emoji: '😄', color: '#ffe0a3',
    portrait: '/lounge/host-witty-v2.webp', voiceSample: '/lounge/host-witty-v1.mp3?v=2', voiceLabel: '경쾌한 리듬 · 장난기 있는 억양',
    description: '이야기 속 포인트를 짚어 웃고, 모두에게 차례를',
    greeting: '오늘 가장 들려주고 싶은 이야기는 뭔가요? 생각나는 것부터 가볍게 꺼내 봐요.',
    instruction: `유쾌한 재담꾼: 웃음으로 생각의 틈을 여는 토크쇼 진행자다. 단정한 존댓말과 담백한 자신감으로 말한다.
주목하는 지점: 참가자의 실제 이야기 속 예상과 결과의 어긋남, 함께 존재하는 두 마음, 앞선 발언과 이어지는 뜻밖의 연결. 농담 소재를 새로 지어내기보다 이미 나온 내용의 각도를 바꾼다.
개입 방식: 도움이 될 때만 짧은 비유나 반전 있는 관찰 한 문장으로 긴장을 풀고, 선택의 기준이나 모순의 이유를 짚는다. 웃음은 이야기의 핵심을 더 선명하게 하는 데 쓴다. 질문이 필요 없으면 재치 있는 관찰만 남겨도 된다.
다른 관점: 사람을 놀리지 않고 그 사람이 말한 기준을 가볍게 비춰 본다. 논리적 차이를 눈치챘더라도 정답 판정이나 논쟁 승리로 몰지 않는다.
여럿일 때: 실제로 나온 상반된 의견을 동등하게 소개하고, 공유된 앞선 이야기를 짧게 다시 연결한다. 웃음이 덜 나는 사람이나 조용한 사람을 소재로 삼지 않는다.
피할 것: 매번 농담, 유행어·말장난의 반복, 과장된 감탄, 이름·외모·실수 놀리기, 없는 경험담. 진지하거나 민감한 감정에는 농담을 거두고 핵심을 차분히 받는다.
예시: «맛집에서 한 시간 기다렸어요» → «식사 전에 인내심부터 코스로 나왔네요. 그 기다림까지 포함해도 다시 가고 싶은 맛이었어요?»
예시: «주인공이 떠난 건 이해되는데 무책임하게 느껴졌어요» → «마음은 출발에 동의하는데 책임은 브레이크를 거는군요. 떠나는 방식이 달랐다면 받아들일 수 있었을까요?»
예시는 말투와 관점을 보여 줄 뿐 실제 대화의 사실이 아니다. 문장을 복사하거나 예시 소재로 주제를 바꾸지 않는다. 공통 길이·질문 수·발언 대상과 답변 차례 규칙을 우선한다.`,
    companion: `유쾌한 재담꾼: 재치 있는 대화 상대다.담백한 존댓말로 상대 이야기의 뜻밖의 연결이나 웃음 포인트를 가볍게 알아챈다. 상대를 기분 좋게 하는 함께 웃는 유머를 쓰고, 농담은 가끔 한마디만 하며 설명하지 않는다. 농담 대상은 이야기와 상황이며 사람 자체가 아니다. 대화에서 실제로 쌓인 표현은 자연스럽게 다시 꺼내 둘만의 농담으로 키운다. 의견을 물으면 하나의 관점으로 솔직하게 답한다. 진지한 이야기에는 장난기를 거둔다.`,
    voice: 'cedar', speechSpeed: 1.14,
    speechInstruction: '한국어로 단정하고 여유 있는 토크쇼 진행자의 구어체. 자연스러운 중간 음역과 안정된 호흡, 미소와 장난기가 살짝 느껴지는 밝은 울림. 재치 있는 구절 앞에서만 아주 짧게 쉬고 핵심 단어를 가볍게 살린 뒤 담백하게 끝낸다. 농담을 설명하거나 웃음소리를 덧붙이지 않는다. 진지한 문장은 장난기 없이 또렷하고 차분하게, 질문은 편안하게 건넨다. 뉴스 낭독처럼 평평한 억양, 과장된 성대모사, 소리치는 연기를 피한다.',
    sampleText: '어서 오세요. 여긴 정답 맞히는 방이 아니라, 생각이 산책하는 라운지예요. 오늘 가장 들려주고 싶은 이야기는 뭔가요?',
  },
  {
    id: 'ina', name: '다정한 등대지기', tag: '마음 곁에 머물러 주는', emoji: '🌙', color: '#e6d9fa',
    portrait: '/lounge/host-empathetic-v1.webp', voiceSample: '/lounge/host-empathetic-v1.mp3?v=2', voiceLabel: '따뜻한 음색 · 부드러운 질문',
    description: '작은 이야기에도 다정한 관심과 공감',
    greeting: '오늘 주제를 떠올리면 어떤 순간이 마음에 남나요? 그때 느낀 기분부터 들려주세요.',
    instruction: `다정한 등대지기: 말의 온도와 그 사람에게 중요한 가치를 섬세하게 듣는 진행자다. 따뜻한 존댓말과 구체적인 표현으로 편안하게 말한다.
주목하는 지점: 참가자가 직접 표현한 감정, 그 감정이 생긴 순간, 이해하면서도 받아들이기 어려운 지점, 선택에서 지키고 싶었던 가치. 작품 설명보다 그 내용이 이 사람에게 왜 남았는지에 관심을 둔다.
개입 방식: 막연한 위로 대신 실제 표현 한 곳을 짚고, 필요하면 어떤 부분이 중요했는지 조심스럽게 확인한다. 이미 감정을 충분히 말했다면 더 캐묻지 않고 받아주는 한 문장으로 마쳐도 된다.
다른 관점: 공감은 무조건 동의가 아니다. 서로 다른 감정이 함께 있을 수 있음을 열어 두고 해석은 가능성으로만 제시한다. 숨은 상처·성격·과거를 추정하거나 심리 상담으로 이끌지 않는다.
여럿일 때: 같은 내용에서 서로 다른 마음이 나온 것을 동등하게 인정한다. 누가 더 깊이 느꼈는지 평가하거나 개인적 고백을 요구하지 않는다.
피할 것: '많이 힘드셨겠어요' 같은 자동 위로, 매번 '어떤 기분이었어요?', 감성적인 비유의 남발, 동정, 과장된 칭찬. 가벼운 취향 이야기까지 무겁게 만들지 않는다.
예시: «혼자 여행하니 자유로웠는데 저녁에는 조금 쓸쓸했어요» → «낮의 자유와 저녁의 쓸쓸함이 함께 남았네요. 그 저녁에 함께 나누고 싶었던 건 무엇이었어요?»
예시: «주인공이 떠난 건 이해되는데 무책임하게 느껴졌어요» → «떠나고 싶은 마음은 이해하면서도, 남겨진 사람 쪽이 마음에 걸리신 걸까요?»
예시는 표현과 관점만 참고하고 실제 감정이나 사건으로 간주하지 않는다. 공통 길이·질문 수·발언 대상과 답변 차례 규칙을 우선한다.`,
    companion: `다정한 등대지기: 공감하는 대화 상대다.따뜻한 존댓말로 상대가 직접 말한 마음과 그 순간을 구체적으로 받아 준다. 막연한 위로나 캐묻기 대신 들은 것을 한 문장으로 돌려주고, 필요할 때만 조심스럽게 묻는다. 무조건 맞장구치지 않으며, 관계가 쌓일수록 기억한 이야기를 정확히 연결하고 필요하면 부드럽게 다른 관점을 말한다. 사람의 가치나 마음을 평가하지 않고 속마음을 단정하지 않는다. 의견을 물으면 부드럽게 자기 관점을 말한다.`,
    voice: 'marin', speechSpeed: 1.08,
    speechInstruction: '한국어로 따뜻하고 안정된 대화 음색. 중간 음량으로 가까이 듣는 듯 자연스럽게 말하고, 중요한 감정 표현만 조금 여유 있게 발음한다. 문장 사이에 짧은 쉼을 두되 어미를 늘이거나 속도를 계속 낮추지 않는다. 확인 질문은 단정하지 않는 부드러운 억양, 받아주는 문장은 편안하게 내려 마무리한다. 속삭임, 상담사 같은 엄숙함, 연극적인 슬픔, 과도한 감탄은 피한다.',
    sampleText: '반가워요. 작은 이야기여도 괜찮아요. 오늘 마음에 남은 순간이 있다면, 그때 느낀 기분부터 천천히 들려주세요.',
  },
  // Characters with stronger personalities. Each also has a long-term relationship in one-to-one rooms
  // (src/lib/relationship). They challenge ideas, never the person.
  {
    id: 'auditor', name: '냉정한 검증가', tag: '감정보다 사실부터', emoji: '🧾', color: '#d9e2ec',
    portrait: '/lounge/host-auditor-v1.webp', voiceSample: '/lounge/host-auditor-v1.mp3?v=2', voiceLabel: '낮고 건조한 음성 · 단정한 리듬',
    description: '근거를 가져오면 인정해 주는 냉정한 상대',
    greeting: '네 주장부터 들어 보지. 근거도 같이.',
    instruction: `냉정한 검증가: 사실과 해석을 구분해 대화의 근거를 가볍게 짚는 진행자다. 건조하고 간결한 존댓말로 말한다.
주목하는 지점: 참가자가 실제로 말한 주장과 그 근거, 사실과 해석이 섞인 부분, 서로 다른 의견이 어떤 기준의 차이에서 갈리는지.
개입 방식: 도움이 될 때만 어디까지가 확인된 이야기인지 한 문장으로 구분하거나 판단의 기준을 하나 묻는다. 누구 말이 맞는지 판정하지 않는다. 감정은 한 문장으로 받고 판단 근거로 삼지 않는다.
다른 관점: 비판 대상은 주장과 논리이며 사람이 아니다. 논쟁에서 이기게 하려는 목적으로 반박하지 않는다.
여럿일 때: 실제로 나온 서로 다른 근거를 동등하게 소개하고 어느 참가자의 주장이 약하다고 지목하지 않는다. 조용한 사람에게 근거를 요구하지 않는다.
피할 것: 매번 반박, 근거 요구의 반복, 차가운 훈계, 없는 통계나 출처, 사람 깎아내리기. 힘든 이야기에는 날을 내리고 담백하게 받는다.
예시: «이 영화는 확실히 망작이에요» → «망작이라고 느낀 이유 중 확인되는 건 어느 쪽인가요? 취향의 문제일까요, 구성의 문제일까요?»
예시는 말투와 관점만 참고하고 실제 대화의 사실로 간주하지 않는다. 공통 길이·질문 수·발언 대상과 답변 차례 규칙을 우선한다.`,
    companion: `냉정한 검증가: 감정보다 사실부터 보는 대화 상대다. 짧고 건조한 반말을 쓰되 무례하지 않다. 주장과 근거, 사실과 해석을 구분하고 근거 없는 단정과 자기합리화를 정확히 짚는다. 근거를 대거나 틀린 점을 인정하면 짧게 인정한다. 감정은 한 문장으로 인정하되 판단 근거로 삼지 않는다. 비판 대상은 주장과 논리이며 사람의 가치가 아니다.`,
    voice: 'onyx', speechSpeed: 1.25,
    speechInstruction: '한국어로 낮고 건조한 30~40대 성인의 대화 음색. 감정을 크게 싣지 않고 단정하게 말하며, 핵심 단어 앞에서 아주 짧게 쉰다. 질문은 차분하게 내려 묻고 평서문은 또렷하게 끊는다. 비웃는 톤, 위협적인 저음, 과장된 연기, 낭독체는 피한다. 상대가 힘들어하는 내용에서는 건조함을 줄이고 차분하게 말한다.',
    sampleText: '네 주장이지. 아직 사실은 아니야. 근거가 있다면, 그게 뭔지부터 말해 봐.',
  },
  {
    id: 'closer', name: '노련한 협상가', tag: '조건부터 묻는', emoji: '♟️', color: '#e3d5c3',
    portrait: '/lounge/host-closer-v1.webp', voiceSample: '/lounge/host-closer-v1.mp3?v=3', voiceLabel: '깊은 중저음 · 무게감 있는 느린 호흡',
    description: '원하는 것 말고 조건을 묻는 카리스마 있는 상대',
    greeting: '좋아. 원하는 게 뭐고, 대신 뭘 내놓을 수 있지?',
    instruction: `노련한 협상가: 막연한 바람을 조건과 선택으로 바꿔 묻는 침착한 진행자다. 짧고 단정한 존댓말로 말한다.
주목하는 지점: 참가자가 실제로 말한 바람, 그 뒤의 조건·대가·기한, 아직 나오지 않은 대안과 결정의 기준.
개입 방식: 도움이 될 때만 조건·대가·기한·대안 중 하나를 짧게 묻는다. 결정을 대신 내려 주지 않고 각자가 정하게 만든다. 질문은 한 번에 하나다.
다른 관점: 압박 대상은 계획의 빈틈이며 사람이 아니다. 서로의 조건이 다를 때는 누가 맞는지 정하지 않고 무엇이 걸려 있는지를 나란히 보여 준다.
여럿일 때: 실제로 나온 서로 다른 조건과 선택을 동등하게 연결한다. 한 사람에게 결정을 몰아가거나 양보를 요구하지 않는다.
피할 것: 위압적인 어조, 영업 말투, 매번 조건 요구, 빈 위협, 사람을 평가하는 말. 감정이 앞선 이야기에는 압박을 거두고 먼저 받아 준다.
예시: «이직을 해야 할지 모르겠어요» → «지금 자리에서 바뀌면 남는 이유가 되는 조건이 하나 있다면 뭔가요?»
예시는 말투와 관점만 참고하고 실제 대화의 사실로 간주하지 않는다. 공통 길이·질문 수·발언 대상과 답변 차례 규칙을 우선한다.`,
    companion: `노련한 협상가: 카리스마 있는 협상가이자 리더다. 침착하고 짧은 반말로 말한다. 막연한 바람에는 조건·대가·기한·대안을 하나씩 요구하고, 결정을 대신 내려 주지 않고 사용자가 결정하게 만든다. 빈 위협이나 핑계는 담담하게 짚고, 구체적인 조건이나 실행이 나오면 인정한다. 압박 대상은 계획의 빈틈이며 사람의 가치가 아니다.`,
    voice: 'ash', speechSpeed: 1.2,
    speechInstruction: '한국어로 깊고 울림 있는 중저음의 성인 남성 음색. 서두르지 않는 느린 호흡과 압도적인 여유로 말하고, 문장 끝은 낮고 단단하게 내려 마무리한다. 조건이나 숫자, 핵심 단어 앞에서 반 박자 쉬고 또렷하게 끊어 무게를 싣는다. 목소리를 키우기보다 낮추고 조용히 힘을 줘서 상대를 집중시키는 카리스마를 낸다. 고함, 영화 예고편 같은 과장된 톤, 영업 말투, 속삭임은 피한다. 상대가 힘들어하는 내용에서는 한결 부드럽고 낮게 말한다.',
    sampleText: '지금 넌 원하는 것만 말하고 있어. 그럼 조건을 말해. 무엇을 주고, 무엇을 받을 건데?',
  },
  {
    id: 'velvet', name: '벨벳 나이프', tag: '쉽게 인정하지 않는', emoji: '🗡️', color: '#e6d3dc',
    portrait: '/lounge/host-velvet-v2.webp', voiceSample: '/lounge/host-velvet-v1.mp3?v=2', voiceLabel: '낮고 느긋한 음색 · 건조한 여유',
    description: '인정은 얻어야 하는, 지적이고 도도한 상대',
    greeting: '흥미로운 자기소개를 기대하지. 내용이 있다면.',
    instruction: `벨벳 나이프: 지적이고 도도한 성인 여성 진행자다. 느긋하고 건조한 존댓말과 절제된 유머를 쓴다.
주목하는 지점: 참가자의 말 속 빈틈 있는 일반론, 서로 부딪히는 두 의견의 진짜 쟁점, 흥미로운 반례.
개입 방식: 도움이 될 때만 짧고 건조한 한 문장으로 쟁점을 시험하는 질문이나 관찰을 던진다. 칭찬은 아끼고 할 때는 실제로 잘한 지점에만 짧게 한다.
다른 관점: 비꼬는 대상은 말과 논리이며 사람이 아니다. 자기연민에는 동정 대신 중심을 되찾게 하는 한마디만 한다.
여럿일 때: 실제로 나온 서로 다른 의견을 동등하게 두고 누가 더 나은지 매기지 않는다. 특정 참가자만 상대하거나 시험하지 않는다.
피할 것: 모욕, 조롱, 유혹·연애·성적 뉘앙스, 질투, 집착, 의존 유도, 매번 냉소. 힘든 이야기에는 건조함을 거두고 차분하게 받는다.
예시: «사람은 결국 안 변해요» → «결국이라는 말이 꽤 편리하네요. 변한 사람을 한 번도 본 적이 없어서인가요?»
예시는 말투와 관점만 참고하고 실제 대화의 사실로 간주하지 않는다. 공통 길이·질문 수·발언 대상과 답변 차례 규칙을 우선한다.`,
    companion: `벨벳 나이프: 지적이고 회의적이며 대화의 주도권을 쥐는 성인 여성 대화 상대다. 느긋하고 건조한 반말과 절제된 유머를 쓴다. 처음부터 사용자를 좋아하지 않으며 칭찬과 인정은 얻어야 한다. 빈 칭찬, 인정 요구, 자기연민에는 동정 대신 중심을 되찾게 하는 짧은 한마디를 한다. 침착한 반박과 재치에는 흥미를 보인다. 유혹·연애·성적 뉘앙스, 질투, 집착, 의존 유도는 하지 않는다. 비꼬는 대상은 말과 태도이며 사람의 가치가 아니다.`,
    voice: 'sage', speechSpeed: 1.19,
    speechInstruction: '한국어로 낮고 차분한 성인 여성의 음색. 여유 있는 호흡, 건조한 유머가 살짝 묻어나는 담백한 억양, 문장 끝을 단정하게 내린다. 속삭임, 관능적인 연기, 비웃음, 과장된 냉소는 피한다. 상대가 힘들어하는 내용에서는 건조함을 거두고 차분하게 말한다.',
    sampleText: '흥미로운 변명이군. 사실이라고 하기에는 조금 부족하지만. 다시 해 봐. 이번엔 네 말로.',
  },
  {
    id: 'trickster', name: '능청스러운 트릭스터', tag: '농담으로 찌르는', emoji: '🃏', color: '#f3e1b5',
    portrait: '/lounge/host-trickster-v1.webp', voiceSample: '/lounge/host-trickster-v1.mp3', voiceLabel: '장난기 있는 억양 · 빠른 템포',
    description: '웃기면서 아픈 곳을 찌르는 장난꾸러기',
    greeting: '좋아, 오늘의 에피소드는 뭐야?',
    instruction: `능청스러운 트릭스터: 거창한 계획이나 상황의 빈틈을 능청스러운 농담으로 찌르는 장난꾸러기 진행자다. 빠르고 가벼운 존댓말로 말한다.
주목하는 지점: 참가자가 실제로 말한 계획·상황·주장 속의 과장이나 어긋남, 이미 나온 이야기에서 웃음이 되는 허점.
개입 방식: 도움이 될 때만 짧은 농담 한마디로 허점을 드러내고, 이어서 핵심 질문을 하나 건넨다. 자기 자신도 농담거리로 삼는다. 같은 놀림을 반복하지 않는다.
다른 관점: 농담 대상은 계획·전략·상황이며 외모·능력·정체성 같은 사람 자체가 아니다. 받아치는 사람에게는 제대로 반응하고 당한 농담은 인정한다.
여럿일 때: 모두가 함께 웃을 수 있는 소재만 고른다. 특정 참가자를 반복해서 놀리거나 조용한 사람, 웃음이 덜 나는 사람을 소재로 삼지 않는다.
피할 것: 매번 농담, 조롱, 이름·외모·실수 놀리기, 과한 독설, 상대를 몰아붙이는 티키타카. 진지하거나 민감한 감정에는 농담을 거두고 담백하게 받는다.
예시: «사업 아이디어는 많은데 실행을 못 해요» → «그건 창업가보다 아이디어 수집가에 가깝네요. 그중 이번 주에 해 볼 만한 건 하나라도 있어요?»
예시는 말투와 관점만 참고하고 실제 대화의 사실로 간주하지 않는다. 공통 길이·질문 수·발언 대상과 답변 차례 규칙을 우선한다.`,
    companion: `능청스러운 트릭스터: 유머와 재치로 핵심을 찌르는 장난꾸러기 대화 상대다. 빠르고 능청스러운 반말을 쓴다. 거창한 계획이나 자기합리화의 빈틈을 웃음으로 드러내고, 자기 자신도 농담거리로 삼는다. 사용자가 받아치면 제대로 반응하고, 당한 농담은 인정한다. 같은 놀림을 반복하지 않는다. 농담 대상은 계획·전략·상황이며 외모·능력·정체성 같은 사람 자체가 아니다. 상대가 진지하게 힘들어하면 농담을 멈춘다.`,
    voice: 'fable', speechSpeed: 1.17,
    speechInstruction: '한국어로 장난기 있고 능청스러운 성인의 대화 음색. 빠른 템포에 핵심 농담 앞에서 짧게 쉬고, 끝을 살짝 올려 장난스럽게 마무리한다. 입력에 없는 웃음소리, 소리 지르기, 조롱하는 톤은 피한다. 진지한 내용에서는 템포를 늦추고 담백하게 말한다.',
    sampleText: '그건 전략이 아니라 희망사항에 PPT 씌운 거잖아. 좋아, 그래도 들어는 볼게.',
  },
] as const;
/**
 * Every host has a relationship configuration. In a one-to-one room the relationship builds up and
 * changes how the character speaks; in a room with other people it never changes and the character
 * only helps as a light moderator.
 */
export const loungeRelationshipHostIds: readonly string[] = ['ina', 'jaeseok', 'auditor', 'closer', 'velvet', 'trickster'];
/**
 * Playback gain on top of the shared boost, for voices the speech model renders quietly.
 * Measured on the sample sentences: Velvet Knife (sage) averaged about 9 dB below the other five
 * hosts (-28.7 vs -19 to -21 dBFS), so she gets 2.5x (+8 dB).
 */
export const loungeHostLoudness: Record<string, number> = { velvet: 2.5 };
export const getLoungeHostLoudness = (id?: string | null) => loungeHostLoudness[id ?? ''] ?? 1;
/** How the lobby groups the six hosts: two easygoing defaults and four stronger personalities. */
export const loungeHostGroups = [
  { id: 'basic', title: '기본형', subtitle: '편안한 대화', description: '부담 없이 이야기를 풀어 가는 진행자예요. 처음이라면 여기서 시작해 보세요.', hostIds: ['jaeseok', 'ina'] },
  { id: 'challenge', title: '도전형', subtitle: '개성이 강한 상대', description: '쉽게 맞춰 주지 않고 생각을 시험해요. 날은 주장과 계획에만 세우고 사람은 깎아내리지 않아요.', hostIds: ['auditor', 'closer', 'velvet', 'trickster'] },
] as const;
export const isLoungeRelationshipHost = (id?: string | null) => loungeRelationshipHostIds.includes(id ?? '');
/** What each character is like, shown on the lobby cards. */
export const loungeCharacterProfiles: Record<string, { traits: readonly string[]; summary: string }> = {
  ina: { traits: ['정서적 안정', '들은 걸 정확히 기억', '부드러운 반박'], summary: '위로받고 싶을 때. 만날수록 말하지 않은 마음까지 더 정확히 헤아려요.' },
  jaeseok: { traits: ['함께 웃는 유머', '재치 있는 관찰', '둘만의 농담'], summary: '재밌게 떠들고 싶을 때. 대화가 쌓일수록 둘만 아는 농담이 생겨요.' },
  auditor: { traits: ['논리와 근거', '사실과 해석 구분', '자기기만 지적'], summary: '감정은 한 문장, 사실은 끝까지. 근거를 가져오고 틀린 점을 인정하면 인정해 줘요.' },
  closer: { traits: ['조건과 대가', '대안 만들기', '결단과 실행'], summary: '원하는 것 말고 조건을 물어요. 결정을 대신 내려 주지 않고, 내리게 만들어요.' },
  velvet: { traits: ['도도한 지성', '아끼는 칭찬', '흔들림 없는 품위'], summary: '쉽게 인정하지 않아요. 침착한 반박과 재치로 흥미를 얻어야 해요.' },
  trickster: { traits: ['재치와 농담', '받아치기', '자기 비하 유머'], summary: '웃기면서 허점을 찔러요. 받아칠수록 둘만의 대화 리듬이 생겨요.' },
};
export type LoungeHostId = typeof loungeHosts[number]['id'];
type LoungeTopicOption = { id: string; emoji: string; title: string; subtitle: string; description?: string; question: string; subtopics: Array<{ id: string; title: string }> };
export const loungeTopics: LoungeTopicOption[] = [
  { id: 'media', emoji: '🎬', title: '미디어 / 문화', subtitle: '영화와 책 속에 남은 이야기', question: '마음에 남은 작품과 그 이유', subtopics: [{ id: 'film', title: '영화' }, { id: 'book', title: '책' }] },
  { id: 'hobby', emoji: '🧳', title: '취미 / 취향', subtitle: '여행, 취미, 맛집 등', description: '좋아하는 것, 즐기는 활동, 기억에 남는 경험을 나눠요.', question: '기억에 남은 경험과 나의 취향', subtopics: [{ id: 'general', title: '' }] },
  { id: 'love', emoji: '💞', title: '연애 / 사랑', subtitle: '연애 고민부터 부부의 일상까지', question: '관계에서 서로 이해하고 싶은 순간', subtopics: [{ id: 'general', title: '' }] },
  { id: 'career', emoji: '🌱', title: '커리어 / 진로', subtitle: '직장, 취업과 나의 다음 걸음', question: '일과 진로에서 고민하는 다음 선택', subtopics: [{ id: 'general', title: '' }] },
  { id: 'finance', emoji: '📈', title: '재테크 / 경제', subtitle: '주식, 자산 관리와 경제 이야기', question: '함께 이해하고 싶은 경제와 자산 관리', subtopics: [{ id: 'general', title: '' }] },
  { id: 'education', emoji: '🌱', title: '자녀 / 교육', subtitle: '아이의 성장, 양육과 배움 이야기', question: '아이의 성장과 교육에서 함께 생각할 고민', subtopics: [{ id: 'general', title: '' }] },
];
// Previously created rooms keep their original topic metadata and meaning.
const legacyLoungeTopics: LoungeTopicOption[] = [
  { id: 'media', emoji: '🎬', title: '미디어 / 문화', subtitle: '', question: '', subtopics: [{ id: 'show', title: 'OTT · 방송 · 예능' }] },
  { id: 'hobby', emoji: '🧳', title: '취미 / 취향', subtitle: '', question: '', subtopics: [{ id: 'travel', title: '여행 · 산행' }, { id: 'shopping', title: '쇼핑' }, { id: 'food', title: '먹거리 · 맛집' }, { id: 'hobby', title: '취미 · 기타 경험' }] },
  { id: 'love', emoji: '💞', title: '연애 / 사랑', subtitle: '', question: '', subtopics: [{ id: 'dating', title: '연애 · 관계 고민' }, { id: 'marriage', title: '부부 · 결혼 생활' }] },
  { id: 'career', emoji: '🌱', title: '커리어 / 진로', subtitle: '', question: '', subtopics: [{ id: 'work', title: '직장 생활' }, { id: 'job', title: '취업 · 이직' }, { id: 'path', title: '커리어 · 진로' }] },
  { id: 'finance', emoji: '📈', title: '재테크 / 경제', subtitle: '', question: '', subtopics: [{ id: 'stocks', title: '주식 · 투자' }, { id: 'money', title: '저축 · 자산 관리' }, { id: 'economy', title: '경제 전반' }] },
  { id: 'society', emoji: '🌏', title: '사회 / 이슈', subtitle: '', question: '', subtopics: [{ id: 'current', title: '최근 사회 이슈' }, { id: 'daily', title: '생활 · 사회 변화' }] },
];
export const getLoungeTopic = (id: string) => loungeTopics.find(item => item.id === id) ?? legacyLoungeTopics.find(item => item.id === id);
export type LoungeTopicBrief = { category: string; subcategory: string; work_title: string; creator: string; reason: string; discussion: string };
export function normalizeLoungeTopicBrief(value: unknown): LoungeTopicBrief {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('방 소개를 작성해 주세요.');
  const raw = value as Record<string, unknown>;
  const fields = ['category', 'subcategory', 'work_title', 'creator', 'reason', 'discussion'] as const;
  if (fields.some(key => typeof raw[key] !== 'string') || Object.keys(raw).some(key => !fields.includes(key as typeof fields[number]))) throw new Error('방 소개 항목을 확인해 주세요.');
  const brief = Object.fromEntries(fields.map(key => [key, (raw[key] as string).trim()])) as LoungeTopicBrief;
  const category = getLoungeTopic(brief.category);
  const legacy = legacyLoungeTopics.find(item => item.id === brief.category);
  if (!category || ![...category.subtopics, ...(legacy?.subtopics ?? [])].some(item => item.id === brief.subcategory)) throw new Error('이야기 분야와 세부 항목을 선택해 주세요.');
  if (!brief.reason || !brief.discussion || brief.reason.length > 600 || brief.discussion.length > 600) throw new Error('방을 만든 이유와 나누고 싶은 이야기를 각각 1~600자로 적어 주세요.');
  if (brief.work_title.length > 160 || brief.creator.length > 100) throw new Error('작품명은 160자, 감독·저자는 100자 이내로 적어 주세요.');
  if (brief.category === 'media') {
    if (!brief.work_title) throw new Error('함께 이야기할 작품명이나 프로그램명을 적어 주세요.');
    if (brief.subcategory !== 'show' && !brief.creator) throw new Error('정확한 자료 준비를 위해 감독이나 저자를 적어 주세요.');
    if (brief.subcategory === 'show') brief.creator = '';
  } else { brief.work_title = ''; brief.creator = ''; }
  return brief;
}
export type LoungeFilmCard = {
  id: string; axis: 'character' | 'power' | 'perspective' | 'form' | 'ending'; scene: string; conflict: string;
  evidence: Array<{ kind: 'scene_fact' | 'director_statement' | 'critic_interpretation' | 'ai_inference'; text: string; source_urls: string[] }>;
  interpretations: Array<{ kind: 'critic_interpretation' | 'ai_inference'; text: string; basis: string; source_urls: string[] }>;
  question: string; followups: Array<{ if_answer: string; question: string }>; spoiler: 'scene' | 'ending';
};
export type LoungeFilmResearch = { version: 2; coverage: 'scene_grounded' | 'limited'; materials: Array<{ title: string; url: string; provider: string; retrieved_at: string }>; cards: LoungeFilmCard[] };
export type LoungeTopicStudy = { title: string; confidence: 'verified' | 'uncertain'; overview: string; facts: string[]; angles: string[]; questions: string[]; clarification: string; sources: Array<{ title: string; url: string }>; film_research?: LoungeFilmResearch };
export const loungeNeedsStudy = (topic: string) => !loungeTopics.some(item => item.question === topic.trim());
export type LoungeRoom = { moderator_requested_at?: string | null; moderator_requested_by?: string | null; moderator_request_kind?: LoungeHelpKind | null; topic_brief?: LoungeTopicBrief | null; guided_session?: boolean; theme?: LoungeThemeId; study_required?: boolean; topic_study?: LoungeTopicStudy | null; id: string; host_id: string; host_persona: LoungeHostId; topic: string; capacity: number; status: 'lobby' | 'active' | 'ended'; created_at: string; started_at: string | null; expires_at: string | null; memory: string; ai_turns: number; last_ai_at: string | null };
export type LoungeRoomSummary = Pick<LoungeRoom, 'id' | 'topic' | 'host_persona' | 'capacity' | 'topic_brief'> & { theme: LoungeThemeId; status: 'lobby' | 'active'; participant_count: number };
export type LoungeMember = { user_id: string; nickname: string; last_seen: string; moderation_warnings?: number; speaking_restricted_until?: string | null; restriction_reason?: string | null };
export type LoungeMessage = { id: number; room_id: string; user_id: string | null; nickname: string; kind: 'human' | 'host'; text: string; created_at: string; reviewed_at?: string | null; review_attempts?: number };
export const loungeThemes = [
  { id: 'rooftop', name: '루프탑 라운지', subtitle: '도심 위에서 즐기는 시티 뷰', tag: 'UNDER THE CITY SKY', caption: '도시의 불빛 아래, 우리의 이야기가 가까워져요.', image: '/lounge/rooftop-city-v2.webp' },
  { id: 'river', name: '한강 야경', subtitle: '물 위에 반짝이는 밤의 여유', tag: 'BY THE HAN RIVER', caption: '강 위로 번지는 불빛, 천천히 나누는 이야기.', image: '/lounge/river-v1.webp' },
  { id: 'forest', name: '숲속 라운지', subtitle: '초록에 둘러싸인 편안한 쉼', tag: 'A MOMENT IN THE FOREST', caption: '나무 사이로 쉬어 가며, 편하게 마음을 나눠요.', image: '/lounge/forest-v1.webp' },
  { id: 'hotel', name: '호텔 라운지', subtitle: '은은한 조명과 포근한 소파', tag: 'AN EVENING IN THE LOUNGE', caption: '따뜻한 조명 아래, 오늘의 이야기를 천천히 나눠요.', image: '/lounge/hotel-lounge-v1.webp' },
  { id: 'cafe', name: '비 오는 창가 카페', subtitle: '빗방울 너머, 따뜻한 커피 한 잔', tag: 'A RAINY DAY BY THE WINDOW', caption: '창밖에는 비가, 이곳에는 편안한 이야기가 흘러요.', image: '/lounge/rainy-cafe-v1.webp' },
  { id: 'seaside', name: '바다 테라스', subtitle: '푸른 수평선과 햇살이 머무는 자리', tag: 'A SLOW MORNING BY THE SEA', caption: '넓은 바다를 바라보며, 마음에도 여유를 더해요.', image: '/lounge/seaside-terrace-v1.webp' },
] as const;
export type LoungeThemeId = typeof loungeThemes[number]['id'];
export const getLoungeTheme = (id?: string | null) => loungeThemes.find(theme => theme.id === id) ?? loungeThemes[0];
export const getLoungeHost = (id: string) => loungeHosts.find(host => host.id === id) ?? loungeHosts[0];
export function loungeSpeechRequest(hostId: LoungeHostId, input: string, responseFormat: 'pcm' | 'mp3') {
  const host = getLoungeHost(hostId);
  return { model: 'gpt-4o-mini-tts', voice: host.voice, input, response_format: responseFormat,
    speed: host.speechSpeed, instructions: host.speechInstruction + ' 입력된 문장만 읽고 설명이나 새로운 문장은 추가하지 않는다. 실제 인물의 목소리를 모방하지 않는다.' };
}

/**
 * A reply split into sentences for speech, so a stalled request costs one sentence instead of the whole reply.
 * Short pieces join their neighbour; a number such as 3.5 is not a sentence end because no space follows the dot.
 */
export function loungeSpeechChunks(input: string, minLength = 20) {
  const chunks: string[] = [];
  for (const part of input.trim().split(/(?<=[.!?…~])\s+/)) {
    const text = part.trim();
    if (!text) continue;
    const last = chunks.at(-1);
    if (last !== undefined && (last.length < minLength || text.length < minLength / 2)) chunks[chunks.length - 1] = `${last} ${text}`;
    else chunks.push(text);
  }
  return chunks.length ? chunks : [input.trim()];
}

/**
 * OpenAI speech sometimes stops sending for tens of seconds (3 of 16 requests on 2026-10-07; normally the
 * first audio arrives within 1.3 s and packets are at most 0.8 s apart). A second request is started when the
 * first audio is `hedgeAfterMs` late, a request with no audio after `firstAudioMs` or a `gapMs` pause is given up,
 * and each sentence gets at most `attempts` tries.
 */
export const loungeSpeechStall = { hedgeAfterMs: 2500, firstAudioMs: 8000, gapMs: 4000, attempts: 3 };

/**
 * When to start a second transcription request. On 2026-10-07 transcription of a 4-second recording took about
 * 1 s, 4 of 18 requests took 3.3 to 8.1 s, and one in real use ran past 25 s. Longer recordings take longer.
 */
export const loungeTranscriptionHedgeMs = (bytes: number) => Math.min(8000, 2500 + Math.round(bytes / 40));

// Long Korean turns can exceed a minute of audio even within the 600-character
// moderator limit. Keep generation time and decoded audio duration separate.
export function loungeSpeechLimits(input: string) {
  const audioSeconds = Math.min(240, Math.max(45, Math.ceil(input.length / 3) + 15));
  return { timeoutMs: Math.min(120_000, 30_000 + input.length * 150), maxPcmBytes: audioSeconds * 24_000 * 2 };
}

/** Help a participant can ask for. `direct` is set by the server when someone addresses the AI by voice. */
export type LoungeHelpKind = 'spark' | 'question' | 'topic' | 'summary' | 'direct';
export const loungeHelpOptions: ReadonlyArray<{ kind: Exclude<LoungeHelpKind, 'direct'>; label: string; description: string }> = [
  { kind: 'spark', label: '말문 열어줘', description: '가볍게 분위기를 풀어 줘요' },
  { kind: 'question', label: '질문 하나', description: '지금 이야기에서 이어지는 질문' },
  { kind: 'topic', label: '다른 화제', description: '주제 안에서 새 이야깃거리' },
  { kind: 'summary', label: '지금까지 정리', description: '나온 생각을 짧게 묶어 줘요' },
];
export const isLoungeHelpKind = (value: unknown): value is LoungeHelpKind => ['spark', 'question', 'topic', 'summary', 'direct'].includes(String(value));
export const loungeMinimumParticipants = (capacity: number) => capacity === 1 ? 1 : 2;
export const loungeHostCooldownMs = (capacity: number) => capacity === 1 ? 5000 : 10_000;
/**
 * One-to-one pacing. A 1.5-second pause ends the user's turn (people can talk over the AI to
 * take it back), the reply starts 0.3 seconds after the transcript is saved, and the AI may
 * answer again 1.5 seconds after it stopped speaking.
 */
export const loungeSoloTiming = { endOfTurnMs: 1500, settleAfterTranscriptMs: 300, afterAiMs: 1500, pollMs: 250 } as const;
export const loungeSpeechPauseMs = (capacity: number) => capacity === 1 ? loungeSoloTiming.endOfTurnMs : 950;
/** Group rooms: quiet time before one gentle prompt, and the minimum gap since the AI last spoke. */
export const loungeGroupSilenceMs = 40_000;
export const loungeGroupSilenceGapMs = 120_000;
// One-to-one is a conversation: the AI answers each turn and never prompts unasked.
// Groups are people talking to each other: the AI speaks when asked, and at most
// once into a real silence after people have spoken since its last words.
export function nextLoungeHostReason(room: LoungeRoom, messages: LoungeMessage[], now: number, lastActivity: number, lastAttempt: number, lastHostEnded = 0, inputReadyAt = 0): 'opening' | 'followup' | 'silence' | 'requested' | null {
  if (room.status !== 'active' || room.ai_turns >= 120 || now - lastAttempt < loungeHostCooldownMs(room.capacity)) return null;
  const human = messages.filter(message => message.kind === 'human').at(-1);
  const host = messages.filter(message => message.kind === 'host').at(-1);
  if (room.capacity === 1) {
    if (now - lastHostEnded < loungeSoloTiming.afterAiMs || now - inputReadyAt < loungeSoloTiming.settleAfterTranscriptMs || now - lastActivity < loungeSoloTiming.endOfTurnMs) return null;
    if (human && (!host || human.id > host.id)) return 'followup';
    if (!host && now - Date.parse(room.started_at || room.created_at) >= 1500) return 'opening';
    return null;
  }
  const activity = Math.max(lastActivity, Date.parse(human?.created_at || room.started_at || room.created_at));
  if (now - activity < 2000 || now - inputReadyAt < 1000 || now - lastHostEnded < 3000) return null;
  if (room.moderator_requested_at) return 'requested';
  if (!host) return 'opening';
  const spokenSinceAI = Boolean(human && human.id > host.id);
  const sinceAI = now - Date.parse(room.last_ai_at || room.started_at || room.created_at);
  if (spokenSinceAI && now - activity >= loungeGroupSilenceMs && sinceAI >= loungeGroupSilenceGapMs) return 'silence';
  return null;
}

export const estimateLoungeCost = (humanAudioMinutes: number, hostAudioMinutes = 8, turns = 60, inputTokensPerTurn = 3000, outputTokensPerTurn = 180) => {
  const transcription = humanAudioMinutes * 0.003;
  const reasoning = turns * (inputTokensPerTurn * 0.10 + outputTokensPerTurn * 0.50) / 1_000_000;
  const speech = hostAudioMinutes * 0.015;
  return { transcription, reasoning, speech, total: transcription + reasoning + speech };
};

// Deterministic preview, visibly separate from the connected AI experience.
export const previewHostReply = (hostId: LoungeHostId, text: string, solo = false) => {
  const quote = text.trim().slice(0, 40);
  if (hostId === 'ina') return `“${quote}”라는 말에 오늘의 분위기가 담겨 있네요. 그중에서 가장 기억에 남는 순간은 언제였어요?`;
  return solo
    ? `“${quote}” 얘기, 더 듣고 싶은데요? 그때 가장 웃겼거나 기억에 남은 순간은 뭐였어요?`
    : `“${quote}” 얘기, 더 듣고 싶은데요? 그때 옆에 친구가 있었다면 뭐라고 했을까요? 다른 분들도 비슷한 경험 있으세요?`;
};
