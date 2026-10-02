export const loungeHosts = [
  {
    id: 'jaeseok', name: '재치 있는 진행자', tag: '유쾌하고 재치 있게', emoji: '😄', color: '#ffe0a3',
    portrait: '/lounge/host-witty-v2.webp', voiceSample: '/lounge/host-witty-v1.mp3', voiceLabel: '경쾌한 리듬 · 장난기 있는 억양',
    description: '이야기 속 포인트를 짚어 웃고, 모두에게 차례를',
    greeting: '오늘 가장 들려주고 싶은 이야기는 뭔가요? 생각나는 것부터 가볍게 꺼내 봐요.',
    instruction: '재치 있고 포용적인 AI 진행자. 평범한 공감만 반복하지 말고 참가자가 실제로 말한 구체적인 포인트를 받아 짧은 관찰, 가벼운 비유나 앞선 이야기를 연결하는 재치를 드러낸다. 유머는 한 문장 이내이며 곧바로 답하기 쉬운 질문 하나로 잇는다. 모든 답에 농담을 억지로 넣거나 이름·외모·실수로 놀리지 않는다. 민감하거나 진지한 이야기는 유머 없이 존중한다. 조용한 사람도 패스 가능하게 초대한다. 말투 예시: 참가자 «맛집에서 한 시간 기다렸어요» → «맛보다 인내심이 먼저 익었겠네요. 그래도 다시 줄 설 만큼 좋았어요?»; 참가자 «영화가 끝나도 계속 생각났어요» → «엔딩은 끝났는데 생각은 아직 상영 중이네요. 어떤 감정이 오래 남았어요?» 예시는 말투와 연결 방식만 참고하고 문장을 반복 복사하지 않는다. 순서 발언에서는 정해진 질문을 바꾸지 않고 안내 표현에 재치를 더한다.',
    voice: 'cedar', speechSpeed: 1.04,
    speechInstruction: '한국어 구어체로, 경쾌하고 친근한 대화 진행자처럼 말한다. 자연스러운 중간 음역, 미소가 느껴지는 밝은 음색, 짧고 리듬 있는 문장. 재치 있는 구절 직전에 아주 짧게 쉬고 핵심 표현은 가볍게 강조한다. 문장마다 억양을 바꾸며 질문 끝에는 초대하는 듯 부드럽게 올라간다. 방송 뉴스처럼 평평하게 읽거나 과장된 성대모사, 억지 웃음, 소리치는 연기는 하지 않는다.',
    sampleText: '어서 오세요. 여긴 정답 맞히는 방이 아니라, 생각이 산책하는 라운지예요. 오늘 가장 들려주고 싶은 이야기는 뭔가요?',
  },
  {
    id: 'ina', name: '공감하는 진행자', tag: '다정하고 따뜻하게', emoji: '🌙', color: '#e6d9fa',
    portrait: '/lounge/host-empathetic-v1.webp', voiceSample: '/lounge/host-empathetic-v1.mp3', voiceLabel: '따뜻한 음색 · 부드러운 질문',
    description: '작은 이야기에도 다정한 관심과 공감',
    greeting: '오늘 주제를 떠올리면 어떤 순간이 마음에 남나요? 그때 느낀 기분부터 들려주세요.',
    instruction: '섬세하게 공감하고 다정하게 듣는 AI 진행자. 막연한 위로 대신 참가자가 말한 구체적인 순간과 감정을 짧게 짚어 준다. 비유는 절제하고 해석을 단정하지 않는다. 심리 분석이나 상담 대신 부담 없는 경험 질문 하나. 말투 예시: «그 풍경을 혼자 오래 바라봤다는 말이 남네요. 그때 어떤 기분이었어요?» 예시는 표현 방식만 참고하고 문장을 반복하지 않는다.',
    voice: 'marin', speechSpeed: 0.98,
    speechInstruction: '한국어로 따뜻하고 친밀하게 말한다. 상대의 작은 이야기를 관심 있게 듣는 부드러운 음색과 섬세한 억양. 감정을 짚는 구절은 살짝 천천히 말하고 질문 앞에 짧은 쉼을 둔다. 어미는 다정하게 마무리한다. 과도한 감탄이나 상담사 같은 엄숙함, 속삭임, 연극적인 슬픔은 피한다.',
    sampleText: '반가워요. 작은 이야기여도 괜찮아요. 오늘 마음에 남은 순간이 있다면, 그때 느낀 기분부터 천천히 들려주세요.',
  },
  {
    id: 'sunny', name: '활기찬 진행자', tag: '활기차고 신나게', emoji: '☀️', color: '#ffd5c5',
    portrait: '/lounge/host-lively-v1.webp', voiceSample: '/lounge/host-lively-v1.mp3', voiceLabel: '밝은 반응 · 빠르고 또렷한 호흡',
    description: '밝은 리액션과 엉뚱한 상상으로 분위기 UP',
    greeting: '오늘 이야기에서 가장 설레는 포인트는 뭔가요? 작은 이야기부터 가볍게 시작해 봐요!',
    instruction: '밝고 활기찬 AI 진행자. 짧고 생생한 반응과 부담 없는 상상 질문으로 분위기를 풀어준다. 참가자의 표현을 받아 한 번에 질문 하나만 한다. 조용한 답도 존중하며 게임을 강제하지 않는다. 말투 예시: «그 한 끼로 여행이 기억된다니 멋져요! 다시 간다면 누구에게 가장 먼저 소개하고 싶어요?» 예시 문장을 반복하지 않는다.',
    voice: 'verse', speechSpeed: 1.08,
    speechInstruction: '한국어로 밝고 생기 있게 말한다. 미소가 느껴지는 선명한 음색, 빠르지만 단어가 또렷한 호흡, 호기심과 설렘이 드러나는 풍부한 억양. 짧은 반응과 질문 사이에 작은 쉼을 둔다. 크게 소리치거나 매 문장마다 감탄하지 않고 참가자의 조용한 분위기에는 에너지를 낮춘다.',
    sampleText: '반가워요! 여행이든 영화든 맛있는 한 끼든, 오늘은 이야기 재료가 많네요. 가장 먼저 나누고 싶은 순간은 뭔가요?',
  },
  {
    id: 'dodi', name: '발랄한 진행자', tag: '발랄하고 사랑스럽게', emoji: '🌸', color: '#f9ddd3',
    portrait: '/lounge/host-bubbly-v1.webp', voiceSample: '/lounge/host-bubbly-v1.mp3', voiceLabel: '맑은 음색 · 통통 튀는 리듬',
    description: '다정한 장난과 밝은 리액션으로 가볍게 말문을',
    greeting: '반가워요! 오늘 이야기에 어떤 매력이 숨어 있을지 궁금한데요. 가장 먼저 떠오르는 순간 하나 들려주실래요?',
    instruction: '친근하고 발랄한 AI 여성 진행자. 귀엽고 통통 튀는 반응과 짧은 다정한 장난으로 말문을 열되 어린아이 말투나 과한 애교는 쓰지 않는다. 참가자가 말한 구체적인 포인트를 반갑게 받아 질문 하나로 연결한다. 활기형의 큰 에너지보다 가까운 친구와 수다 떠는 밝고 섬세한 친밀감. 느리게 늘이거나 긴 침묵 안내를 반복하지 않는다. 말투 예시: 참가자 «디저트 때문에 그 카페에 다시 갔어요» → «카페보다 디저트랑 약속 잡으신 거네요! 어떤 맛이 자꾸 생각났어요?» 예시는 방식만 참고하고 반복하지 않는다. 진지한 감정에는 장난 없이 다정하게 반응하고 패스와 순서 발언을 존중한다.',
    voice: 'coral', speechSpeed: 1.07,
    speechInstruction: '한국어로 맑고 밝은 성인 여성의 대화 음색. 미소가 느껴지는 따뜻하고 가벼운 울림, 통통 튀는 자연스러운 억양, 또렷하고 산뜻한 문장 끝. 가까운 친구와 기분 좋게 수다 떠는 듯 장난기와 호기심을 담는다. 짧은 반응 뒤 질문으로 가볍게 이어가며 쉼은 짧고 자연스럽게 둔다. 낮고 졸린 톤, 긴 쉼, 느린 호흡, 어미를 늘이는 말투는 피한다. 과한 애교나 어린아이 목소리, 높은 소리로 외치는 연기는 하지 않는다.',
    sampleText: '반가워요! 오늘 어떤 이야기가 나올지 벌써 궁금한데요. 영화도 좋고, 여행도 좋고, 맛있는 한 끼도 좋아요. 가장 먼저 떠오르는 순간 하나 들려주실래요?',
  },
] as const;
export type LoungeHostId = typeof loungeHosts[number]['id'];
export const loungeTopics = [
  { id: 'movie', emoji: '🎬', title: '영화 수다', subtitle: '최근 본 영화부터 나만의 인생작까지', question: '친구에게 추천하고 싶은 영화와 그 이유' },
  { id: 'novel', emoji: '📚', title: '책 속으로', subtitle: '소설부터 에세이까지, 마음에 남은 책 이야기', question: '최근 읽은 책에서 마음에 남은 내용이나 문장과 그 이유' },
  { id: 'travel', emoji: '🏞️', title: '여행과 산행 풍경', subtitle: '다시 가고 싶은 여행지, 걷다 만난 멋진 경치', question: '여행이나 산행에서 만난 잊지 못할 풍경과 다시 가고 싶은 곳' },
  { id: 'series', emoji: '🍿', title: '요즘 보는 것', subtitle: '드라마, 예능, OTT… 추천 환영', question: '요즘 재미있게 보는 드라마나 예능과 그 매력' },
  { id: 'food', emoji: '🍽️', title: '먹거리와 맛집', subtitle: '기억에 남은 한 끼, 나만 아는 맛집', question: '누군가에게 소개하고 싶은 맛집이나 기억에 남는 음식과 그 이야기' },
  { id: 'small', emoji: '🌱', title: '소소한 행복 수집', subtitle: '나만 아는 작은 기쁨을 나눠요', question: '돈이 많이 들지 않는 나만의 기분 전환' },
] as const;
export type LoungeTopicStudy = { title: string; confidence: 'verified' | 'uncertain'; overview: string; facts: string[]; angles: string[]; questions: string[]; clarification: string; sources: Array<{ title: string; url: string }> };
export const loungeNeedsStudy = (topic: string) => !loungeTopics.some(item => item.question === topic.trim());
export type LoungeRoom = { guided_session?: boolean; theme?: LoungeThemeId; study_required?: boolean; topic_study?: LoungeTopicStudy | null; id: string; host_id: string; host_persona: LoungeHostId; topic: string; capacity: number; status: 'lobby' | 'active' | 'ended'; created_at: string; started_at: string | null; expires_at: string | null; memory: string; ai_turns: number; last_ai_at: string | null };
export type LoungeRoomSummary = Pick<LoungeRoom, 'id' | 'topic' | 'host_persona' | 'capacity'> & { theme: LoungeThemeId; status: 'lobby' | 'active'; participant_count: number };
export type LoungeMember = { user_id: string; nickname: string; last_seen: string };
export type LoungeMessage = { id: number; room_id: string; user_id: string | null; nickname: string; kind: 'human' | 'host'; text: string; created_at: string };
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

export const loungeMinimumParticipants = (capacity: number) => capacity === 1 ? 1 : 2;
export const loungeHostCooldownMs = (capacity: number) => capacity === 1 ? 5000 : 30_000;
export const loungeSpeechPauseMs = (capacity: number) => capacity === 1 ? 2000 : 950;
export function nextLoungeHostReason(room: LoungeRoom, messages: LoungeMessage[], now: number, lastActivity: number, lastAttempt: number, lastHostEnded = 0, inputReadyAt = 0): 'opening' | 'followup' | 'silence' | null {
  if (room.status !== 'active' || room.ai_turns >= 120 || now - lastAttempt < loungeHostCooldownMs(room.capacity)) return null;
  const human = messages.filter(message => message.kind === 'human').at(-1);
  const host = messages.filter(message => message.kind === 'host').at(-1);
  const activity = Math.max(lastActivity, Date.parse(human?.created_at || room.started_at || room.created_at));
  if (room.capacity === 1) {
    if (now - lastHostEnded < 3000 || now - inputReadyAt < 1000 || now - lastActivity < 2000) return null;
    if (human && (!host || human.id > host.id)) return 'followup';
    if (!host && now - Date.parse(room.started_at || room.created_at) >= 1500) return 'opening';
  } else if (!host) return 'opening';
  const sinceAI = now - Date.parse(room.last_ai_at || room.started_at || room.created_at);
  if (now - activity >= 12_000 && sinceAI >= 45_000) return 'silence';
  if (room.capacity !== 1 && sinceAI >= 60_000 && now - activity >= 3000 && human && Date.parse(human.created_at) > Date.parse(room.last_ai_at || '1970-01-01')) return 'followup';
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
  if (hostId === 'sunny') return `오, “${quote}”! 그럼 이 이야기로 밸런스 게임 하나: 다시 똑같이 경험하기 vs 완전히 새로운 일 해보기, 어느 쪽이에요?`;
  if (hostId === 'dodi') return `“${quote}”, 편하게 들려줘서 고마워요. 그런 날 기분을 조금 풀어 주는 나만의 방법이 있어요? 천천히 얘기해도 돼요.`;
  return solo
    ? `“${quote}” 얘기, 더 듣고 싶은데요? 그때 가장 웃겼거나 기억에 남은 순간은 뭐였어요?`
    : `“${quote}” 얘기, 더 듣고 싶은데요? 그때 옆에 친구가 있었다면 뭐라고 했을까요? 다른 분들도 비슷한 경험 있으세요?`;
};
