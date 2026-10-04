// Synthetic scene and article, not factual claims about an existing film.
export const filmSource = { title: '가상 영화의 마지막 장면 분석', url: 'https://www.criterion.com/current/posts/99999-lounge-test' };
export const filmCard = {
  id: 'last-letter', axis: 'ending', scene: '가상 영화의 마지막 장면에서 주인공은 편지를 읽고 창밖을 바라본다.', conflict: '남고 싶은 마음과 떠나야 한다는 생각 사이에서 선택한다.',
  evidence: [{ kind: 'scene_fact', text: '원문은 편지를 읽은 뒤 창밖을 바라보는 마지막 장면을 설명한다.', source_urls: [filmSource.url] }, { kind: 'critic_interpretation', text: '평론가는 창밖을 바라보는 행동을 새 출발의 가능성으로 해석한다.', source_urls: [filmSource.url] }],
  interpretations: [{ kind: 'critic_interpretation', text: '새 출발의 가능성으로 볼 수 있다.', basis: '마지막에 시선이 닫힌 방에서 바깥으로 옮겨간다.', source_urls: [filmSource.url] }, { kind: 'ai_inference', text: '아직 선택하지 못한 망설임으로도 볼 수 있다.', basis: '실제로 방을 나가는 행동까지 보여 주지는 않는다.', source_urls: [] }],
  question: '그 마지막 시선은 새 출발로 느껴졌어요, 망설임으로 느껴졌어요?',
  followups: [{ if_answer: '새 출발로 느꼈다고 말할 때', question: '앞선 장면 중 어떤 선택이 그 느낌과 이어졌어요?' }, { if_answer: '망설임으로 느꼈다고 말할 때', question: '그 사람이 끝내 놓지 못한 것은 무엇이었다고 봤어요?' }], spoiler: 'ending',
};
export const filmMaterial = { ...filmSource, provider: 'Criterion', retrieved_at: '2026-10-04T00:00:00.000Z', excerpt: '가상 영화 테스트의 마지막 장면을 다룬 분석. 주인공은 편지를 읽고 창밖을 바라본다. '.repeat(15) };
export const filmStudyFixture = { title: '가상 영화 테스트', confidence: 'verified', overview: '편지와 마지막 선택의 결말을 함께 이야기한다.', facts: ['주인공은 마지막에 창밖을 바라본다.'], angles: ['새 출발과 망설임이라는 다른 해석'], questions: [filmCard.question], clarification: '', sources: [filmSource], film_research: { version: 2, coverage: 'scene_grounded', materials: [{ ...filmSource, provider: 'Criterion', retrieved_at: filmMaterial.retrieved_at }], cards: [filmCard] } };
