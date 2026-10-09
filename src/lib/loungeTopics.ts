/** Topic suggestions from the character hosting a space: prompt, response schema and validation. */
export const loungeTopicLimit = 80;

export const loungeTopicSuggestionSchema = {
  type: 'object',
  properties: { topics: { type: 'array', items: { type: 'string' } } },
  required: ['topics'], additionalProperties: false,
} as const;

export function loungeTopicSuggestionInstructions(hostName: string, spaceName: string | null) {
  return `너는 '${hostName}'이고${spaceName ? ` '${spaceName}'에` : ''} 들른 손님들에게 지금 함께 이야기할 주제 세 가지를 제안한다.
- 누구나 자기 경험이나 생각으로 바로 답할 수 있는 가벼운 주제. 각 8~30자의 짧은 질문이나 명사구.
- 세 개는 결이 서로 다르게: 하나는 네 캐릭터와 공간의 분위기에 어울리는 것, 하나는 일상의 경험, 하나는 recent 대화나 current_topic에서 자연스럽게 이어지는 것(대화가 없으면 자유롭게).
- 말투가 살짝 묻어나도 되지만 주제 자체는 분명하게 쓴다. current_topic과 같은 주제는 내지 않는다.
- 정치·종교 논쟁, 성적인 내용, 외모 평가, 실명·연락처 같은 개인 정보, 위험한 행동은 제외한다.
JSON으로 topics 배열에 세 개만 담는다.`;
}

/** At most three distinct, trimmed topics within the length limit. */
export function readLoungeTopicSuggestions(value: unknown) {
  const topics = value && typeof value === 'object' && Array.isArray((value as { topics?: unknown }).topics) ? (value as { topics: unknown[] }).topics : [];
  const unique = [...new Set(topics.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(item => item.length >= 1 && item.length <= loungeTopicLimit))].slice(0, 3);
  if (!unique.length) throw new Error('no topic suggestions');
  return unique;
}
