import type { LoungeTopicBrief } from './lounge';

export const loungeSessionStages = [
  { title: '서로 알아가기', prompt: '이 대화에 참여한 이유나, 오늘 대화를 통해 얻고 싶은 것을 편하게 이야기해 주세요.', minutes: 3 },
  { title: '주제의 첫인상', prompt: '오늘 주제를 떠올리면 가장 먼저 어떤 느낌이 드나요? 아직 경험하지 않았다면 궁금한 점을 나눠 주세요.', minutes: 4 },
  { title: '경험과 궁금한 점 나누기', prompt: '오늘 주제와 관련해 직접 겪은 일이나 궁금한 점이 있나요? 나누고 싶은 만큼 편하게 이야기해 주세요.', minutes: 7 },
  { title: '서로 다른 생각 나누기', prompt: '이 주제에서 함께 더 살펴보고 싶은 점이나, 선택할 때 중요하게 생각하는 기준은 무엇인가요?', minutes: 6 },
  { title: '서로의 경험 이어가기', prompt: '다른 분의 이야기를 듣고 새로 떠오른 생각이나 자신의 경험과 연결되는 부분이 있나요?', minutes: 6 },
  { title: '오늘의 이야기 마무리', prompt: '오늘 얻은 생각이나 아직 남아 있는 질문을 한마디씩 나눠 주세요.', minutes: 4 },
] as const;

type TopicSteps = readonly [
  { title: string; prompt: string }, { title: string; prompt: string },
  { title: string; prompt: string }, { title: string; prompt: string },
];
const topicSteps: Record<string, TopicSteps> = {
  film: [
    { title: '영화를 보고 난 느낌', prompt: '이 영화를 보고 가장 먼저 남은 감정이나 생각은 무엇인가요? 서로의 감상을 편하게 나눠 주세요.' },
    { title: '기억에 남는 장면', prompt: '인상적인 장면이나 대사, 화면·음악이 있나요? 왜 마음에 남았는지 이야기해 주세요. 결말과 반전도 함께 이야기해요.' },
    { title: '인물의 선택과 나의 해석', prompt: '어떤 인물의 선택이 이해되거나 납득하기 어려웠나요? 구체적인 장면을 바탕으로 서로 다르게 읽은 이유를 나눠요.' },
    { title: '결말과 서로 다른 관점', prompt: '결말을 어떻게 받아들였나요? 앞선 장면과 연결하거나 다른 분의 해석을 듣고 달라진 생각을 나눠요.' },
  ],
  book: [
    { title: '책을 읽고 난 느낌', prompt: '이 책을 읽고 어떤 생각이나 감정이 남았나요? 기대했던 점과 읽고 난 느낌을 편하게 나눠요.' },
    { title: '마음에 남은 문장과 대목', prompt: '기억에 남는 문장이나 대목, 새롭게 생각하게 된 내용은 무엇인가요? 정확한 문장이 기억나지 않아도 자신의 말로 이야기해 주세요.' },
    { title: '작품의 생각과 나의 해석', prompt: '소설 속 인물의 선택이나 책에 담긴 주장 중 공감하거나 다른 생각이 든 부분이 있나요? 책의 내용을 근거로 나눠요.' },
    { title: '내 삶과 연결해 보기', prompt: '책의 이야기가 자신의 경험이나 가치관과 만나는 지점이 있나요? 다른 분의 해석을 듣고 새로 떠오른 생각도 좋아요.' },
  ],
  hobby: [
    { title: '취향의 출발점', prompt: '오늘 주제를 좋아하게 된 계기나 즐기는 방식은 무엇인가요? 처음 관심을 갖는 분은 궁금한 점부터 나눠요.' },
    { title: '나의 경험과 발견', prompt: '여행·취미·맛집 등 오늘 주제와 관련해 직접 해보거나 즐겨 본 경험이 있나요? 좋았던 점과 아쉬웠던 점을 나눠요.' },
    { title: '취향이 다른 이유', prompt: '이 활동이나 경험을 고를 때 무엇을 중요하게 보나요? 비용·편안함·새로움 등 서로 다른 취향과 기준을 이야기해요.' },
    { title: '다음에 즐겨 보고 싶은 것', prompt: '다른 분의 이야기를 듣고 해보고 싶은 일이 생겼나요? 누구에게 어떤 경험이 어울릴지도 서로 나눠요.' },
  ],
  love: [
    { title: '지금 마음과 관계', prompt: '오늘 관계 이야기를 나누고 싶은 이유나 요즘 마음은 어떤가요? 사적인 내용은 편한 만큼만 이야기해 주세요.' },
    { title: '마음이 어려웠던 상황', prompt: '오늘 고민과 관련해 어떤 상황이나 대화가 있었나요? 상대의 속마음을 단정하지 않고 자신이 겪고 느낀 것을 나눠요.' },
    { title: '서로의 필요와 경계', prompt: '그 관계에서 자신이 원하는 것과 지키고 싶은 선은 무엇인가요? 서로 다른 입장을 어떻게 이해할 수 있을지 이야기해요.' },
    { title: '내가 원하는 관계', prompt: '어떤 관계를 만들어 가고 싶나요? 경험에서 배운 점이나 시도해 볼 대화 방법을 서로 나누되 조언을 강요하지 않아요.' },
  ],
  career: [
    { title: '현재 상황과 고민', prompt: '직장·취업·진로에서 지금 가장 이야기하고 싶은 고민은 무엇인가요? 회사나 개인을 특정하지 않고 편하게 나눠요.' },
    { title: '일하며 겪은 경험', prompt: '오늘 고민이 생긴 구체적인 경험이나 전환점이 있나요? 어떤 점이 힘들거나 보람 있었는지 이야기해요.' },
    { title: '선택지와 나의 기준', prompt: '생각 중인 선택지에는 어떤 장단점이 있나요? 성장·안정·생활 등 각자 중요하게 보는 기준을 나눠요.' },
    { title: '다음에 시도해 볼 일', prompt: '다른 분의 경험을 듣고 확인하거나 작게 시도해 보고 싶은 일이 있나요? 아직 남은 질문도 함께 나눠요.' },
  ],
  finance: [
    { title: '나의 관심과 목표', prompt: '오늘 경제·재테크 주제에서 궁금한 점이나 목표는 무엇인가요? 자산 규모 등 사적인 정보는 공개하지 않아도 괜찮아요.' },
    { title: '투자·소비 경험 돌아보기', prompt: '오늘 주제와 관련해 어떤 경험이나 배움이 있었나요? 성공담뿐 아니라 예상과 달랐던 일도 편하게 나눠요.' },
    { title: '근거와 위험 따져 보기', prompt: '어떤 정보와 가정을 근거로 생각하고 있나요? 사실·전망·개인 경험을 구분하고 손실 가능성과 다른 관점도 이야기해요.' },
    { title: '나에게 맞는 원칙', prompt: '오늘 이야기를 통해 정리된 기준이나 더 확인하고 싶은 점은 무엇인가요? 특정 상품 매수나 수익을 정답처럼 권하지 않고 각자의 원칙을 나눠요.' },
  ],
  education: [
    { title: '아이와 지금의 궁금한 점', prompt: '아이의 연령대나 교육 단계에서 지금 어떤 점이 궁금한가요? 아이·학교의 신원을 공개하지 않고 필요한 맥락만 나눠요.' },
    { title: '실제 육아·교육 경험', prompt: '어떤 상황에서 고민이 생겼고 어떤 방법을 시도해 봤나요? 아이의 반응과 부모가 느낀 점을 평가 없이 나눠요.' },
    { title: '아이와 부모의 다른 입장', prompt: '아이와 부모가 각각 원하는 것과 어려워하는 것은 무엇일까요? 아이의 성격이나 능력을 단정하지 않고 다른 선택의 장단점을 살펴봐요.' },
    { title: '우리 집에서 시도할 방법', prompt: '우리 가정에서 존중하고 싶은 기준과 작게 시도해 볼 방법은 무엇인가요? 다른 집의 경험이 그대로 정답이 되지는 않으니 각자의 상황에 맞춰 이야기해요.' },
  ],
  society: [
    { title: '이슈를 바라보는 첫 생각', prompt: '오늘 이슈에서 가장 궁금하거나 중요하다고 느끼는 점은 무엇인가요? 각자의 관심과 생각을 나눠요.' },
    { title: '생활에서 느끼는 변화', prompt: '이 이슈와 관련해 직접 겪거나 주변에서 느낀 변화가 있나요? 개인 경험과 확인된 사실을 구분해 이야기해요.' },
    { title: '근거와 서로 다른 시각', prompt: '어떤 근거로 그렇게 생각하나요? 서로 다른 입장과 아직 확인되지 않은 점을 함께 살펴봐요.' },
    { title: '남은 질문과 가능한 대응', prompt: '다른 관점을 듣고 달라진 생각이나 더 확인할 질문이 있나요? 가능하다고 보는 대응도 편하게 나눠요.' },
  ],
};
export function loungeSessionStagesForTopic(brief?: Pick<LoungeTopicBrief, 'category' | 'subcategory'> | null) {
  const key = brief?.category === 'media' ? brief.subcategory : brief?.category;
  const steps = key ? topicSteps[key] : undefined;
  return loungeSessionStages.map((stage, index) => ({ ...stage, ...(index >= 1 && index <= 4 ? steps?.[index - 1] : undefined) }));
}
export type LoungeSession = {
  room_id: string; stage: number; state: 'ready' | 'speaking' | 'between' | 'free' | 'finished';
  speaker_id: string | null; turn_id: string; turn_kind: 'basic' | 'extra' | 'reply';
  reply_queue?: Array<{ target: string; from: string; question: string; source_turn: string; stage: number }>;
  reply_question?: string | null; reply_from?: string | null;
  round_order: string[]; completed: string[]; hand_queue: string[];
  started_at: string; stage_started_at: string; turn_started_at: string | null;
  spoken_seconds: number; nudged: boolean; announced_turn: string | null; announced_stage?: number;
  between_since: string | null; updated_at: string;
  free_started_at?: string | null;
};
export type LoungeSessionAction = 'tick' | 'raise' | 'lower' | 'pass' | 'begin' | 'done' | 'yield' | 'next_stage' | 'activity';
export const isLoungeFreeStage = (session?: LoungeSession | null) => session?.state === 'free';
export const loungeStageNeedsOpening = (session: LoungeSession) => session.state !== 'finished' && session.announced_stage !== session.stage;
export const loungeTurnSilenceMs = 10_000;
export function shouldAutoFinishLoungeTurn(session: LoungeSession, speech: { voicedMs: number; lastVoiceAt: number; recording: boolean }, voicedAtStart: number, now = Date.now()) {
  return session.state === 'speaking' && !isLoungeFreeStage(session) && speech.voicedMs > voicedAtStart
    && speech.lastVoiceAt > 0 && !speech.recording && now - speech.lastVoiceAt >= loungeTurnSilenceMs;
}
export function loungeSessionPrompt(session: LoungeSession, questions?: string[], brief?: Pick<LoungeTopicBrief, 'category' | 'subcategory'> | null) {
  if (session.turn_kind === 'reply' && session.reply_question) return session.reply_question;
  const stages = loungeSessionStagesForTopic(brief);
  if (session.stage === 3 || session.stage === 4) return questions?.[session.stage === 3 ? 1 : 3] || stages[session.stage].prompt;
  return stages[session.stage]?.prompt || stages[5].prompt;
}
export function loungeSessionQueue(session: LoungeSession) {
  return [...(session.reply_queue ?? []).map(reply => reply.target), ...session.round_order.filter(id => (session.turn_kind === 'reply' || id !== session.speaker_id) && !session.completed.includes(id)), ...session.hand_queue];
}
export function newerLoungeSession(previous: LoungeSession | null, incoming: LoungeSession | null) {
  if (!incoming) return previous;
  if (previous && previous.room_id === incoming.room_id && Date.parse(previous.updated_at) > Date.parse(incoming.updated_at)) return previous;
  return incoming;
}
