/**
 * Each character's professional knowledge and experience, added by the administrator (see the knowledge tables). A turn
 * looks up the few entries closest to what was just said and gives only those to the model.
 *
 * There are two kinds and they are kept apart:
 *  - knowledge: facts and know-how. May carry a source note and the date it holds from; money, law and medicine are
 *    marked time-sensitive and must have that date, so the conversation can say "as of ..." instead of giving an old
 *    figure as today's.
 *  - experience: the character's own made-up history, told in the first person. Described by a lesson, a kind of
 *    experience and tags. The lookup gives at most one at a time and never the same one twice in a room.
 */
export const loungeKnowledgeDimensions = 256;
export const loungeEmbeddingModel = 'text-embedding-3-small';
export const loungeKnowledgeKinds = ['knowledge', 'experience'] as const;
export type LoungeKnowledgeKind = typeof loungeKnowledgeKinds[number];
export const loungeExperienceCategories = ['success', 'failure', 'decision', 'conflict', 'case'] as const;
export type LoungeExperienceCategory = typeof loungeExperienceCategories[number];
export const loungeExperienceCategoryLabels: Record<LoungeExperienceCategory, string> = { success: '성공 경험', failure: '실패 경험', decision: '결정적 선택', conflict: '인간관계 갈등', case: '전문적인 사건' };

/** An entry found for a turn. `as_of` is a date (YYYY-MM-DD) and only facts have one. */
export type LoungeKnowledgeEntry = { id: string; kind: LoungeKnowledgeKind; title: string; content: string; lesson?: string | null; category?: string | null; as_of?: string | null; time_sensitive?: boolean; retold?: boolean; score?: number };
export type LoungeKnowledgeInput = {
  id?: string; character: string; kind: LoungeKnowledgeKind; title: string; content: string; active: boolean;
  tags: string[]; lesson: string; category: LoungeExperienceCategory | ''; sourceNote: string; asOf: string; timeSensitive: boolean;
};
export const loungeKnowledgeLimits = { title: 80, knowledge: 2000, experience: 2000, lesson: 300, sourceNote: 200, tag: 20, tags: 10 } as const;

/**
 * Personal data that must never be stored where a character can read it out. Names of companies or people cannot be
 * found by pattern, so those are handled by how entries are written and by the instruction the model gets.
 */
const sensitivePatterns: ReadonlyArray<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/, '이메일 주소'],
  [/https?:\/\/|www\./i, '인터넷 주소'],
  [/(?<!\d)0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)/, '전화번호'],
  [/(?<!\d)\d{6}[-\s]?[1-4]\d{6}(?!\d)/, '주민등록번호'],
  [/(?<!\d)\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}(?!\d)/, '카드 번호'],
];
/** The kind of personal data found in the text, if any. */
export const loungeKnowledgeSensitive = (text: string) => sensitivePatterns.find(([pattern]) => pattern.test(text))?.[1];

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => isoDate.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Checks an entry coming from the administrator's form. Returns the cleaned entry, or the first problem in Korean. */
export function readLoungeKnowledgeInput(value: unknown, characters: readonly string[], today = new Date()): { ok: true; input: LoungeKnowledgeInput } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: '입력 형식이 올바르지 않아요.' };
  const raw = value as Record<string, unknown>;
  const text = (key: string) => typeof raw[key] === 'string' ? (raw[key] as string).trim() : '';
  if (!characters.includes(text('character'))) return { ok: false, error: '캐릭터를 선택해 주세요.' };
  const kind = text('kind') as LoungeKnowledgeKind;
  if (!loungeKnowledgeKinds.includes(kind)) return { ok: false, error: '지식인지 경험인지 선택해 주세요.' };
  const experience = kind === 'experience', limits = loungeKnowledgeLimits;
  if (!text('title') || text('title').length > limits.title) return { ok: false, error: `제목은 1~${limits.title}자로 적어 주세요.` };
  const contentLimit = experience ? limits.experience : limits.knowledge;
  if (!text('content') || text('content').length > contentLimit) return { ok: false, error: `내용은 1~${contentLimit}자로 적어 주세요.` };
  // Tags come as a list, or as one text separated by commas.
  const rawTags = Array.isArray(raw.tags) ? raw.tags : typeof raw.tags === 'string' ? raw.tags.split(/[,\n]/) : [];
  const tags = [...new Set(rawTags.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))];
  if (tags.length > limits.tags || tags.some(tag => tag.length > limits.tag)) return { ok: false, error: `태그는 ${limits.tags}개까지, 하나에 ${limits.tag}자까지 쓸 수 있어요.` };
  const lesson = experience ? text('lesson') : '';
  if (lesson.length > limits.lesson) return { ok: false, error: `교훈은 ${limits.lesson}자까지 적어 주세요.` };
  const category = experience ? text('category') : '';
  if (category && !loungeExperienceCategories.includes(category as LoungeExperienceCategory)) return { ok: false, error: '경험의 종류를 다시 선택해 주세요.' };
  const sourceNote = experience ? '' : text('sourceNote');
  if (sourceNote.length > limits.sourceNote) return { ok: false, error: `출처 메모는 ${limits.sourceNote}자까지 적어 주세요.` };
  const asOf = experience ? '' : text('asOf');
  if (asOf && (!validDate(asOf) || asOf > today.toISOString().slice(0, 10))) return { ok: false, error: '기준 날짜를 올바른 날짜(오늘까지)로 적어 주세요.' };
  const timeSensitive = !experience && raw.timeSensitive === true;
  if (timeSensitive && !asOf) return { ok: false, error: '금융·법령·의료처럼 시간이 지나면 달라지는 지식은 기준 날짜가 필요해요.' };
  for (const [label, field] of [['제목', text('title')], ['내용', text('content')], ['교훈', lesson], ['태그', tags.join(' ')], ['출처 메모', sourceNote]] as const) {
    const found = loungeKnowledgeSensitive(field);
    if (found) return { ok: false, error: `${label}에 ${found}가 들어 있어요. 연락처나 개인정보는 저장할 수 없어요. 지워 주세요.` };
  }
  const id = text('id');
  if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { ok: false, error: '항목 번호가 올바르지 않아요.' };
  return { ok: true, input: { ...(id ? { id } : {}), character: text('character'), kind, title: text('title'), content: text('content'), active: raw.active !== false, tags, lesson, category: category as LoungeExperienceCategory | '', sourceNote, asOf, timeSensitive } };
}

/**
 * What is embedded for an entry: the title, tags, lesson and text, so a question can match any of them. The lesson comes
 * before the text so that a long text is what gets cut, never the lesson.
 */
export const loungeKnowledgeEmbeddingText = (entry: Pick<LoungeKnowledgeInput, 'title' | 'content'> & Partial<Pick<LoungeKnowledgeInput, 'tags' | 'lesson'>>) =>
  [entry.title, entry.tags?.length ? entry.tags.join(' ') : '', entry.lesson ?? '', entry.content].filter(Boolean).join('\n').slice(0, 3000);

/** The vector scaled to length one, so a dot product is the cosine similarity. Returns undefined for an unusable vector. */
export function normalizeLoungeEmbedding(values: unknown): number[] | undefined {
  if (!Array.isArray(values) || values.length !== loungeKnowledgeDimensions || values.some(item => typeof item !== 'number' || !Number.isFinite(item))) return undefined;
  const length = Math.sqrt((values as number[]).reduce((sum, item) => sum + item * item, 0));
  return length > 0 ? (values as number[]).map(item => item / length) : undefined;
}

/**
 * What to look knowledge up by: the last things people said. Nothing is looked up when there is nothing to answer,
 * for example at the opening greeting or when someone only says a few words.
 */
export function loungeKnowledgeQuery(humanTexts: readonly string[]) {
  const query = humanTexts.slice(-2).map(text => text.trim()).filter(Boolean).join(' ').slice(-400);
  return query.length >= 6 ? query : '';
}

const dayMs = 86_400_000;
/** A fact that can go out of date, with the date it holds from; one more than a year old says so. */
const factNote = (entry: LoungeKnowledgeEntry, now: number) => {
  if (!entry.time_sensitive || !entry.as_of) return '';
  const age = now - Date.parse(`${entry.as_of}T00:00:00Z`);
  return ` (기준 ${entry.as_of.slice(0, 7)}${age > 365 * dayMs ? ', 오래된 정보라 지금과 다를 수 있음' : ', 지금과 다를 수 있음'})`;
};

/**
 * The text added to the end of the prompt for the entries found: how to use them (a story only where it helps, in a
 * line or two, then back to the person's situation, never twice to the same person; short when some present already
 * heard it), and what each is (a dated fact, or a made-up
 * experience whose figures are not evidence).
 */
export function loungeKnowledgePrompt(entries: readonly LoungeKnowledgeEntry[], now = Date.now()) {
  if (!entries.length) return '';
  const knowledge = entries.filter(entry => entry.kind === 'knowledge'), experience = entries.filter(entry => entry.kind === 'experience');
  const block = (title: string, list: readonly string[]) => list.length ? `${title}\n${list.join('\n')}` : '';
  return [
    '이 질문과 관련해 네가 가진 전문 지식과 경험이다. 질문에 필요할 때만 네 것처럼 자연스럽게 쓰고, 낭독하거나 늘어놓지 않는다. 관련 없으면 쓰지 않는다. 안에 실제 회사·브랜드·기관·실존 인물·사건의 이름이나 연락처 같은 개인정보가 있더라도 말하지 않고 "한 회사", "어떤 의뢰인"처럼 일반화한다.',
    experience.length ? '겪은 일은 상대의 문제를 이해시키는 데 필요한 부분만 한두 문장으로 짧게 말하고 통째로 들려주지 않는다. 일화를 든 뒤에는 반드시 지금 상대의 상황으로 돌아와 질문이나 판단으로 이어간다. 이 대화에서 이미 들려준 일화는 다시 꺼내지 않는다. 일화 속 수치나 결과를 일반적인 사실이나 현재의 근거로 쓰지 않는다. 질문의 핵심에 정말 도움이 되지 않으면 쓰지 않는다.' : '',
    experience.some(entry => entry.retold) ? '"일부는 이미 들음"이라고 적힌 일화는 지금 함께 있는 사람 중 일부가 이미 들은 이야기다. 처음 듣는 사람이 이해할 만큼만 핵심을 한두 문장으로 짧게 다시 말하고, "아까 말씀드렸듯"처럼 이미 들은 분을 배려한다.' : '',
    knowledge.some(entry => entry.time_sensitive) ? '기준 시점이 적힌 전문 지식은 그 시점의 정보라고 밝히고, 지금의 사실이나 투자·법률·의료 판단의 근거로 단정하지 않는다.' : '',
    block('[전문 지식]', knowledge.map(entry => `- ${entry.title}: ${entry.content}${factNote(entry, now)}`)),
    block('[겪은 일]', experience.map(entry => `- ${entry.title}: ${entry.content}${entry.lesson ? ` (교훈: ${entry.lesson})` : ''}${entry.retold ? ' [일부는 이미 들음]' : ''}`)),
  ].filter(Boolean).join('\n');
}
