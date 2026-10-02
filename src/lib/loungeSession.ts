export const loungeSessionStages = [
  { title: '서로 알아가기', prompt: '이 대화에 참여한 이유나, 오늘 대화를 통해 얻고 싶은 것을 편하게 이야기해 주세요.', minutes: 3 },
  { title: '주제의 첫인상', prompt: '오늘 주제를 떠올리면 가장 먼저 어떤 느낌이 드나요? 아직 경험하지 않았다면 궁금한 점을 나눠 주세요.', minutes: 4 },
  { title: '마음에 남은 순간', prompt: '이 주제와 관련해 기억에 남는 장면, 풍경이나 한 끼가 있나요? 그때 느낀 감정을 나눠 주세요. 작품의 결말과 반전은 아껴 주세요.', minutes: 7 },
  { title: '생각 나누기 · 첫 번째 질문', prompt: '이 주제를 좋아하게 된 이유나, 다른 사람에게 추천하고 싶은 점은 무엇인가요?', minutes: 6 },
  { title: '생각 나누기 · 두 번째 질문', prompt: '다른 분의 이야기를 듣고 새로 떠오른 생각이나 자신의 경험과 연결되는 부분이 있나요?', minutes: 6 },
  { title: '오늘의 이야기 마무리', prompt: '오늘 얻은 생각이나 아직 남아 있는 질문을 한마디씩 나눠 주세요.', minutes: 4 },
] as const;
export type LoungeSession = {
  room_id: string; stage: number; state: 'ready' | 'speaking' | 'between' | 'finished';
  speaker_id: string | null; turn_id: string; turn_kind: 'basic' | 'extra';
  round_order: string[]; completed: string[]; hand_queue: string[];
  started_at: string; stage_started_at: string; turn_started_at: string | null;
  spoken_seconds: number; nudged: boolean; announced_turn: string | null;
  between_since: string | null; updated_at: string;
};
export type LoungeSessionAction = 'tick' | 'raise' | 'lower' | 'pass' | 'begin' | 'done' | 'yield' | 'next_stage' | 'activity';
export function loungeSessionPrompt(session: LoungeSession, questions?: string[]) {
  if (session.stage === 3 || session.stage === 4) return questions?.[session.stage === 3 ? 1 : 3] || loungeSessionStages[session.stage].prompt;
  return loungeSessionStages[session.stage]?.prompt || loungeSessionStages[5].prompt;
}
export function loungeSessionQueue(session: LoungeSession) {
  return [...session.round_order.filter(id => id !== session.speaker_id && !session.completed.includes(id)), ...session.hand_queue];
}
export function newerLoungeSession(previous: LoungeSession | null, incoming: LoungeSession | null) {
  if (!incoming) return previous;
  if (previous && previous.room_id === incoming.room_id && Date.parse(previous.updated_at) > Date.parse(incoming.updated_at)) return previous;
  return incoming;
}
