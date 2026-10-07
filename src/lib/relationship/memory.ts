// Long-term memory for one-to-one characters. The model proposes memory operations in the same call as the reply;
// this module chooses what the model sees and validates what it proposes. Each character has its own memories.

export const memoryKinds = ['project', 'preference', 'decision', 'event', 'open_thread'] as const;
export type MemoryKind = typeof memoryKinds[number];
export type MemoryRow = {
  id: string; character_id: string; kind: MemoryKind; summary: string; follow_up: string | null; importance: number;
  status?: string; mention_count?: number; updated_at?: string; last_confirmed_at?: string; created_at?: string;
};
export type PromptMemory = { ref: string; kind: MemoryKind; summary: string; follow_up?: string };
export type MemoryOp =
  | { op: 'add'; kind: MemoryKind; summary: string; importance: number; follow_up?: string }
  | { op: 'update'; id: string; summary?: string; importance?: number; follow_up?: string }
  | { op: 'supersede'; id: string; kind?: MemoryKind; summary: string; importance?: number; follow_up?: string }
  | { op: 'close'; id: string };

export const memorySettings = {
  /** Long-term memories shown to the model per reply. */
  promptLimit: 6,
  /** Open threads among them, so follow-ups never crowd out everything else. */
  openThreadLimit: 3,
  /** Proposed memories below this importance are dropped. */
  minImportance: 0.5,
  maxOpsPerTurn: 3,
  /** Rooms whose first AI turns still get the previous conversation's summary. */
  previousSessionTurns: 4,
} as const;

// Never stored, whatever the model proposes: health, self-harm, sexuality, religion, politics, crime and identifiers.
const sensitivePattern = /자살|죽고\s*싶|자해|사라지고\s*싶|우울증|공황|불안장애|정신과|상담\s*치료|진단|질병|암\s*환자|투병|임신|낙태|약\s*(을\s*)?복용|병원에|수술|성적\s*지향|동성애|성생활|성관계|종교|교회|성당|절에\s*다|신앙|정당|지지하는\s*후보|투표|범죄|전과|체포|주소|전화번호|휴대폰\s*번호|계좌|카드\s*번호|주민\s*(등록)?\s*번호|비밀번호|여권/;
export const isSensitiveMemory = (text: string) => sensitivePattern.test(text);

const days = (from: string | undefined, now: Date) => from ? Math.max(0, (now.getTime() - Date.parse(from)) / 86_400_000) : 365;
const normalize = (text: string) => text.replace(/[\s.,!?'"“”‘’·~-]/g, '');
function bigrams(text: string) { const clean = normalize(text); const set = new Set<string>(); for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2)); return set; }
/** Character-bigram overlap; enough to catch the same fact written twice in Korean without embeddings. */
export function similarity(a: string, b: string) {
  const x = bigrams(a), y = bigrams(b);
  if (!x.size || !y.size) return normalize(a) === normalize(b) ? 1 : 0;
  let shared = 0; for (const item of x) if (y.has(item)) shared++;
  return shared / (x.size + y.size - shared);
}

/** Open threads first (most recent), then the rest by importance, recency and how often they came up. */
export function selectMemoriesForPrompt(rows: readonly MemoryRow[], characterId: string, now: Date) {
  const active = rows.filter(row => row.character_id === characterId && (row.status ?? 'active') === 'active');
  const threads = active.filter(row => row.kind === 'open_thread')
    .sort((a, b) => Date.parse(b.updated_at ?? '') - Date.parse(a.updated_at ?? ''))
    .slice(0, memorySettings.openThreadLimit);
  const score = (row: MemoryRow) => Number(row.importance) + 0.3 * Math.exp(-days(row.last_confirmed_at ?? row.updated_at, now) / 30) + 0.05 * Math.log(row.mention_count ?? 1);
  const rest = active.filter(row => !threads.includes(row)).sort((a, b) => score(b) - score(a)).slice(0, memorySettings.promptLimit - threads.length);
  const chosen = [...threads, ...rest];
  const refs = new Map<string, string>();
  const forPrompt: PromptMemory[] = chosen.map((row, index) => {
    const ref = `m${index + 1}`; refs.set(ref, row.id);
    return { ref, kind: row.kind, summary: row.summary, ...(row.follow_up ? { follow_up: row.follow_up } : {}) };
  });
  return { forPrompt, refs, chosen };
}

/** Everything the user can see this character remembers: open threads first, then by importance. */
export function memoriesForView(rows: readonly MemoryRow[], characterId: string) {
  return rows.filter(row => row.character_id === characterId && (row.status ?? 'active') === 'active')
    .sort((a, b) => Number(b.kind === 'open_thread') - Number(a.kind === 'open_thread') || Number(b.importance) - Number(a.importance));
}

const cleanText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

/**
 * Turns the model's proposals into safe operations: known kinds and targets only, nothing sensitive, nothing
 * unimportant, at most three, and a new memory that repeats a shown one becomes an update of it.
 */
export function normalizeMemoryOps(raw: unknown, refs: ReadonlyMap<string, string>, shown: readonly MemoryRow[]): MemoryOp[] {
  if (!Array.isArray(raw)) return [];
  const ops: MemoryOp[] = [];
  const touched = new Set<string>();
  for (const item of raw) {
    if (ops.length >= memorySettings.maxOpsPerTurn) break;
    if (!item || typeof item !== 'object') continue;
    const value = item as Record<string, unknown>;
    const op = value.op, summary = cleanText(value.summary, 160), followUp = cleanText(value.follow_up, 120);
    const kind = memoryKinds.includes(value.kind as MemoryKind) ? value.kind as MemoryKind : undefined;
    const importance = typeof value.importance === 'number' && Number.isFinite(value.importance) ? Math.min(1, Math.max(0, Math.round(value.importance * 100) / 100)) : undefined;
    if (isSensitiveMemory(`${summary} ${followUp}`)) continue;
    const id = typeof value.ref === 'string' ? refs.get(value.ref.trim()) : undefined;
    if (op === 'add') {
      if (!kind || summary.length < 2 || importance === undefined || importance < memorySettings.minImportance) continue;
      if (kind === 'open_thread' && !followUp) continue;
      const duplicate = shown.find(row => row.kind === kind && similarity(row.summary, summary) >= 0.6);
      if (duplicate) { if (!touched.has(duplicate.id)) { touched.add(duplicate.id); ops.push({ op: 'update', id: duplicate.id, summary, importance, ...(followUp ? { follow_up: followUp } : {}) }); } continue; }
      if (ops.some(other => other.op === 'add' && similarity(other.summary, summary) >= 0.6)) continue;
      ops.push({ op: 'add', kind, summary, importance, ...(followUp ? { follow_up: followUp } : {}) });
    } else if ((op === 'update' || op === 'supersede' || op === 'close') && id && !touched.has(id)) {
      if (op === 'supersede' && summary.length < 2) continue;
      touched.add(id);
      if (op === 'close') ops.push({ op, id });
      else if (op === 'update') ops.push({ op, id, ...(summary ? { summary } : {}), ...(importance !== undefined ? { importance } : {}), ...(followUp ? { follow_up: followUp } : {}) });
      else ops.push({ op, id, ...(kind ? { kind } : {}), summary, ...(importance !== undefined ? { importance } : {}), ...(followUp ? { follow_up: followUp } : {}) });
    }
  }
  return ops;
}

/**
 * The one unfinished story a new conversation opens with: the most important open thread shown, and among equals
 * the oldest, since that promise is the most overdue. The model left to choose tends to ask the room topic instead.
 */
export function openingFollowUp(forPrompt: readonly PromptMemory[], chosen: readonly MemoryRow[]) {
  const threads = forPrompt.map((memory, index) => ({ memory, row: chosen[index] })).filter(item => item.memory.kind === 'open_thread' && item.memory.follow_up);
  threads.sort((a, b) => Number(b.row.importance) - Number(a.row.importance) || Date.parse(a.row.created_at ?? a.row.updated_at ?? '') - Date.parse(b.row.created_at ?? b.row.updated_at ?? ''));
  const first = threads[0]?.memory;
  return first ? { ref: first.ref, summary: first.summary, follow_up: first.follow_up as string } : undefined;
}

/** The previous one-to-one conversation with this character, while the new room is still at its start. */
export function previousSessionSummary(rooms: ReadonlyArray<{ host_persona: string; memory?: string | null; created_at?: string }>, characterId: string, aiTurns: number, now: Date) {
  if (aiTurns > memorySettings.previousSessionTurns) return undefined;
  const last = rooms.find(room => room.host_persona === characterId && (room.memory ?? '').trim().length > 0);
  if (!last) return undefined;
  return { summary: String(last.memory).slice(0, 600), days_ago: Math.round(days(last.created_at, now)) };
}

export const memoryOpsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['add', 'update', 'supersede', 'close'] },
      ref: { type: 'string' },
      kind: { type: 'string', enum: [...memoryKinds, ''] },
      summary: { type: 'string' },
      importance: { type: 'number' },
      follow_up: { type: 'string' },
    },
    required: ['op', 'ref', 'kind', 'summary', 'importance', 'follow_up'], additionalProperties: false,
  },
} as const;

/** How to use and propose long-term memories; added to the instructions of one-to-one relationship rooms. */
export const longMemoryInstructions = `user_memories는 이 사용자가 이 캐릭터와의 지난 대화에서 직접 말한 일이다. ref는 내부 표시라 말하지 않는다. 지금 대화와 관련될 때만 자연스럽게 녹여 쓰고, 날짜를 대거나 기억하고 있다고 과시하지 않는다. user_memories와 previous_session에 없는 과거는 지어내지 않으며, 확실하지 않으면 묻는 말로 확인한다. 지금 사용자의 말이 기억과 다르면 지금 말을 따른다. 기억을 쓰는 방식은 memory_style을 따른다.
follow_up이 있는 기억은 아직 결과를 모르는 이야기다. opening_follow_up이 있으면 새 대화의 첫 인사(reason=opening)는 방 주제 질문 대신 그 일이 어떻게 됐는지 가볍게 묻는다. 이 규칙은 첫 인사에서 방 주제를 묻는 규칙보다 우선한다. 그 밖에는 자연스러울 때만 묻고 매번 묻지 않는다.
previous_session은 이 캐릭터와 나눈 직전 대화의 요약이다. 이어 갈 거리가 있을 때만 쓴다.
memory_ops: 사용자의 가장 최근 발언에서 다음 대화에도 쓸모 있는 사실만 0~2개 고른다. 대부분의 턴은 빈 배열이다. 사용자의 새 발언이 없으면 빈 배열이다.
- add: 새 사실. kind는 project(진행 중인 일), preference(선호·원하는 대화 방식), decision(내린 결정), event(성공·실패 같은 일), open_thread(앞으로 결과를 확인할 약속·예정된 일)다. 사용자가 '~해 볼게', '다음 주까지', '~하기로 했어'처럼 앞으로 할 일과 결과가 나올 일을 말하면 project가 아니라 open_thread로 쓰고, follow_up에 다음에 물어볼 것을 짧게 쓴다.
- update: user_memories와 같은 내용이 다시 나오거나 조금 달라졌을 때 그 ref를 적는다.
- supersede: 이전 사실이 바뀌었을 때(예: 퇴사하려다 계속 다니기로 함) 그 ref와 새 summary를 적는다.
- close: follow_up의 결과를 사용자가 알려 줘서 끝난 이야기일 때 그 ref를 적는다. 결과가 남길 만하면 add event를 같이 쓴다.
summary는 사용자에 대한 3인칭 한 문장, 80자 이내로 쓴다. importance는 0~1이고 일회성 잡담은 0.5 미만이다. 쓰지 않는 칸은 빈 문자열로 둔다.
건강·질병·정신건강, 자해·자살 관련 발언, 성적 지향·성생활, 종교, 정치 성향, 범죄 이력, 주소·연락처·계좌·주민번호 같은 식별 정보, 다른 사람의 사적인 정보는 memory_ops에 쓰지 않는다.`;

export const memoryKindLabels: Record<MemoryKind, string> = { project: '진행 중인 일', preference: '선호', decision: '결정', event: '있었던 일', open_thread: '다음에 물어볼 일' };
