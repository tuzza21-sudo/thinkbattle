/** The deployed JSON state can carry a structured copy of the room summary. Keep it through state updates. */
export type LoungeMemoryLedgerEntry = { id: string; text: string; turn: number };
export type LoungeMemoryLedger = {
  scene: string;
  events: LoungeMemoryLedgerEntry[];
  member: LoungeMemoryLedgerEntry[];
  between: LoungeMemoryLedgerEntry[];
  pending: LoungeMemoryLedgerEntry[];
};
const sections = { '있었던 일': 'events', '둘 사이': 'between', '남은 것': 'pending' } as const;
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const comparable = (text: string) => text.replace(/^(?:지금 장면|있었던 일|둘 사이|남은 것|사용자):\s*/, '').replace(/\s+/g, ' ').trim();
export const loungePendingPlansSchema = { type: 'array', maxItems: 4, items: {
  type: 'object', additionalProperties: false,
  properties: { ref: { type: 'string' }, summary: { type: 'string' }, human_quote: { type: 'string' }, character_quote: { type: 'string' } },
  required: ['ref', 'summary', 'human_quote', 'character_quote'],
} } as const;
export const loungeRecordsPendingPlans = (characterId: string) => characterId === 'closer' || characterId === 'diplomat';
export const loungePendingPlansInstructions = `pending_plans는 양쪽이 실제로 수락한 미이행 약속만 중요한 순서로 최대 4개다. 각 항목의 summary는 약속의 주체·행동·확인된 시점을 140자 이내로 쓰고, human_quote와 character_quote에는 그 약속에 대한 양쪽의 실제 제안·수락 원문을 각각 인용한다. 캐릭터 혼자 제안한 이동·메뉴 정하기에 사용자 수락 근거가 없으면 빈 배열이다. 고백·사귀기 수락은 다음 데이트 제안의 수락 근거가 아니다. 캐릭터 혼자 할 일과 하고 싶은 일은 character_life나 next_intent가 맡는다. 이전 memory_ledger.pending에서 그대로 유지하는 약속은 ref에 그 id를 쓰고 summary도 유지하며, 새 약속은 ref를 비운다. 정정된 약속은 새 양쪽 근거로 교체한다. 완료·취소된 약속과 막연한 걱정·확인 질문은 제외한다. 남은 것 항목은 이 목록만 사용한다.`;

/** A new shared plan needs actual evidence from both speakers; an unanswered invitation never becomes question debt. */
type PendingPlanInput = { plans?: unknown; previous?: LoungeMemoryLedger; human: string; reply: string; recent?: readonly { kind: string; text: string }[] };
export function loungeValidatedPendingPlans(input: PendingPlanInput): string[] | undefined {
  if (!Array.isArray(input.plans)) return undefined;
  const norm = (text: string) => text.replace(/\s+/g, ' ').trim();
  const recent = input.recent?.slice(-8) ?? [];
  const humans = norm([input.human, ...recent.filter(m => m.kind === 'human').map(m => m.text)].join('\n'));
  const characters = norm([input.reply, ...recent.filter(m => m.kind === 'host').map(m => m.text)].join('\n'));
  const kept = new Set<string>();
  for (const raw of input.plans.slice(0, 4)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>, summary = clean(item.summary, 160);
    if (!summary) continue;
    const previous = input.previous?.pending.find(plan => plan.id === item.ref && plan.text === summary);
    if (previous) { kept.add(summary); continue; }
    const h = clean(item.human_quote, 160), c = clean(item.character_quote, 160);
    if (!h || !c || !humans.includes(norm(h)) || !characters.includes(norm(c))) continue;
    // A changed plan needs the current reply's acceptance; an earlier, now retracted invitation is not evidence.
    if (!norm(input.reply).includes(norm(c))) continue;
    kept.add(summary);
  }
  return [...kept];
}
export function loungeSummaryWithGroundedPlans(input: PendingPlanInput & { memory: string }) {
  const kept = loungeValidatedPendingPlans(input);
  if (!kept) return input.memory;
  const pending = `남은 것: ${kept.join('; ') || '없음'}`;
  const lines = input.memory.split(/\r?\n/).filter(line => !/^남은 것:/.test(line.trim()));
  return [...lines, pending].join('\n').trim();
}

export function readLoungeMemoryLedger(raw: unknown, forgotten: readonly string[] = []): LoungeMemoryLedger | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const hidden = (text: string) => forgotten.some(item => comparable(item) && comparable(text).startsWith(comparable(item)));
  const rows = (raw: unknown): LoungeMemoryLedgerEntry[] => Array.isArray(raw) ? raw.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Record<string, unknown>, text = clean(value.text, 240), id = clean(value.id, 60);
    if (!id || !text || hidden(text)) return [];
    return [{ id, text, turn: typeof value.turn === 'number' && Number.isSafeInteger(value.turn) ? value.turn : 0 }];
  }).slice(-10) : [];
  const scene = clean(value.scene, 240);
  return { scene: hidden(scene) ? '' : scene, events: rows(value.events), member: rows(value.member), between: rows(value.between), pending: rows(value.pending) };
}

/** A complete summary is a replacement snapshot, so corrected or finished plans cannot survive as old pending rows. */
export function refreshLoungeMemoryLedger(previous: LoungeMemoryLedger | undefined, summary: unknown, turn: number, forgotten: readonly string[] = []) {
  if (typeof summary !== 'string') return readLoungeMemoryLedger(previous, forgotten);
  const seen = new Set<string>();
  const next: LoungeMemoryLedger = { scene: '', events: [], between: [], pending: [], member: previous?.member ?? [] };
  for (const line of summary.split(/\r?\n/)) {
    const match = /^(지금 장면|있었던 일|둘 사이|남은 것):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, label, text] = match;
    seen.add(label);
    if (!text || /^(?:없음|없다|해당 없음|-)\.?$/.test(text)) continue;
    if (label === '지금 장면') { next.scene = `지금 장면: ${text}`; continue; }
    const key = sections[label as keyof typeof sections];
    const existing = previous?.[key].find(item => item.text === text);
    if (!next[key].some(item => item.text === text)) next[key].push(existing ?? { id: `${key}-${turn}-${next[key].length}`, text, turn });
  }
  // An unavailable recorder or a legacy partial summary must not erase a valid ledger.
  return seen.size === 4 ? readLoungeMemoryLedger(next, forgotten) : previous;
}
