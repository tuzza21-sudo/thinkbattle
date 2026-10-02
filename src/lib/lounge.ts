export const loungeHosts = [
  { id: 'jaeseok', name: '유재석 스타일', tag: '다 같이 웃는 시간', emoji: '😄', color: '#ffe0a3', description: '소외되는 사람 없이, 재치 있게 티키타카', greeting: '최근에 본 영화나 읽은 소설 중 친구에게 꼭 얘기하고 싶은 작품, 하나씩 풀어볼까요? 스포일러는 잠깐 아껴 두고요!', instruction: '유재석의 포용적이고 재치 있는 진행에서 착안한 AI. 가벼운 상황 유머와 콜백, 모두의 이름을 골고루 부르는 진행. 놀림은 하지 않고 조용한 사람에게 패스 가능한 쉬운 질문.', voice: 'ash' },
  { id: 'ina', name: '김이나 스타일', tag: '마음을 알아주는 질문', emoji: '🌙', color: '#e6d9fa', description: '작은 이야기에도 다정한 관심과 공감', greeting: '영화나 소설 속에서 아직 마음에 남는 장면이 있나요? 스포일러 없이, 그 장면이 남긴 기분부터 들려주세요.', instruction: '김이나의 섬세한 공감과 언어 감각에서 착안한 AI. 일상의 작은 감정에 구체적으로 반응하고 비유는 짧게. 심리 분석이나 상담 대신 부담 없는 경험 질문.', voice: 'coral' },
  { id: 'sunny', name: '써니', tag: '텐션 한 스푼', emoji: '☀️', color: '#ffd5c5', description: '밸런스 게임과 엉뚱한 상상으로 분위기 UP', greeting: '영화 속 주인공으로 하루 살기 vs 소설 속 세계로 여행 가기! 여러분의 첫 선택은 어느 쪽인가요?', instruction: '활기찬 오리지널 AI 예능 MC 써니. 짧은 밸런스 게임, 엉뚱한 상상, 부담 없는 리액션. 이야기의 소재를 연결하고 질문은 한 번에 하나만.', voice: 'verse' },
  { id: 'dodi', name: '도디', tag: '느긋하게 쉬어가기', emoji: '🍵', color: '#d9e8c5', description: '말이 느려도 괜찮은, 편안한 동네 친구', greeting: '따뜻한 차 한 잔 놓고 얘기한다고 생각해요. 요즘 편하게 보고 읽는 작품이 있어요? 제목 하나만 꺼내도 좋아요.', instruction: '느긋한 오리지널 AI 동네 친구 도디. 조용한 리액션과 일상의 작은 즐거움. 침묵을 허용하고 말하지 않아도 된다고 알려주며 답하기 쉬운 구체적 질문.', voice: 'sage' },
] as const;
export type LoungeHostId = typeof loungeHosts[number]['id'];
export const loungeTopics = [
  { id: 'movie', emoji: '🎬', title: '영화 수다', subtitle: '최근 본 영화부터 나만의 인생작까지', question: '친구에게 추천하고 싶은 영화와 그 이유' },
  { id: 'novel', emoji: '📚', title: '소설 속으로', subtitle: '마음에 남은 문장, 인물, 세계', question: '소설 속에서 만나 보고 싶은 인물과 그 이유' },
  { id: 'light-news', emoji: '🗞️', title: '요즘 그 이야기', subtitle: '함께 가져온 문화·생활 이슈를 가볍게', question: '최근 본 문화·생활 뉴스 중 함께 이야기하고 싶은 화제' },
  { id: 'series', emoji: '🍿', title: '요즘 보는 것', subtitle: '드라마, 예능, OTT… 추천 환영', question: '요즘 재미있게 보는 드라마나 예능과 그 매력' },
  { id: 'balance', emoji: '🎲', title: '취향 밸런스 게임', subtitle: '영화와 소설로 즐기는 상상 놀이', question: '영화 속 주인공으로 하루 살기 vs 소설 속 세계로 여행 가기' },
  { id: 'small', emoji: '🌱', title: '소소한 행복 수집', subtitle: '나만 아는 작은 기쁨을 나눠요', question: '돈이 많이 들지 않는 나만의 기분 전환' },
] as const;
export type LoungeTopicStudy = { title: string; confidence: 'verified' | 'uncertain'; overview: string; facts: string[]; angles: string[]; questions: string[]; clarification: string; sources: Array<{ title: string; url: string }> };
export const loungeNeedsStudy = (topic: string) => !loungeTopics.some(item => item.question === topic.trim());
export type LoungeRoom = { guided_session?: boolean; theme?: LoungeThemeId; study_required?: boolean; topic_study?: LoungeTopicStudy | null; id: string; host_id: string; host_persona: LoungeHostId; topic: string; capacity: number; status: 'lobby' | 'active' | 'ended'; created_at: string; started_at: string | null; expires_at: string | null; memory: string; ai_turns: number; last_ai_at: string | null };
export type LoungeMember = { user_id: string; nickname: string; last_seen: string };
export type LoungeMessage = { id: number; room_id: string; user_id: string | null; nickname: string; kind: 'human' | 'host'; text: string; created_at: string };
export const loungeThemes = [
  { id: 'rooftop', name: '루프탑 라운지', subtitle: '도시의 불빛과 열린 하늘', tag: 'UNDER THE CITY SKY', caption: '도시의 불빛 아래, 우리의 이야기가 가까워져요.', image: '/lounge/rooftop-v1.webp' },
  { id: 'river', name: '한강 야경', subtitle: '물 위에 반짝이는 밤의 여유', tag: 'BY THE HAN RIVER', caption: '강 위로 번지는 불빛, 천천히 나누는 이야기.', image: '/lounge/river-v1.webp' },
  { id: 'forest', name: '숲속 라운지', subtitle: '초록에 둘러싸인 편안한 쉼', tag: 'A MOMENT IN THE FOREST', caption: '나무 사이로 쉬어 가며, 편하게 마음을 나눠요.', image: '/lounge/forest-v1.webp' },
] as const;
export type LoungeThemeId = typeof loungeThemes[number]['id'];
export const getLoungeTheme = (id?: string | null) => loungeThemes.find(theme => theme.id === id) ?? loungeThemes[0];
export const getLoungeHost = (id: string) => loungeHosts.find(host => host.id === id) ?? loungeHosts[0];
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
