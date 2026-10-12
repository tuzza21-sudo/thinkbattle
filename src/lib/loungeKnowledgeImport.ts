import { readLoungeKnowledgeInput, type LoungeKnowledgeInput } from './loungeKnowledge';

/**
 * Reads a file of knowledge and experience entries (.jsonl, one entry per line, or .csv, one per row under a header line)
 * for the administrator's upload and for scripts/import-lounge-knowledge.mjs. Every entry is checked exactly as the
 * single-entry form checks it, so a file can never save what the form would refuse.
 */
export const loungeKnowledgeFileLimits = { entries: 200, bytes: 2_000_000 } as const;

/** Rows of a csv text: quoted fields may hold commas, quotes ("") and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // some spreadsheets start a csv with a byte-order mark
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

const aliases: Record<string, string> = { source_note: 'sourceNote', as_of: 'asOf', time_sensitive: 'timeSensitive' };
const flag = (value: unknown) => typeof value === 'string' ? !['false', '0', 'no', 'n', '아니오'].includes(value.trim().toLowerCase()) : value;
type Item = { line: number; raw?: Record<string, unknown>; error?: string };

/** The entries of a file with the line they came from. */
export function readKnowledgeFile(name: string, text: string): Item[] {
  if (/\.csv$/i.test(name)) {
    const [header = [], ...rows] = parseCsv(text);
    const names = header.map(value => { const clean = value.trim(); return aliases[clean] ?? clean; });
    return rows.map((row, index) => {
      const raw: Record<string, unknown> = Object.fromEntries(names.map((column, position) => [column, (row[position] ?? '').trim()]));
      if (raw.timeSensitive !== undefined) raw.timeSensitive = raw.timeSensitive === '' ? false : flag(raw.timeSensitive);
      if (raw.active !== undefined) raw.active = raw.active === '' ? true : flag(raw.active);
      return { line: index + 2, raw };
    });
  }
  return text.split(/\r?\n/).map((line, index) => ({ line: index + 1, text: line })).filter(item => item.text.trim()).map((item): Item => {
    let parsed: unknown;
    try { parsed = JSON.parse(item.text); } catch { return { line: item.line, error: 'JSON 형식이 아니에요.' }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { line: item.line, error: '한 줄에 항목 하나(JSON 객체)가 있어야 해요.' };
    return { line: item.line, raw: Object.fromEntries(Object.entries(parsed).map(([key, value]) => [aliases[key] ?? key, value])) };
  });
}

export type KnowledgeFileCheck = { entries: LoungeKnowledgeInput[]; problems: string[] };
/**
 * Checks every entry like the form does. `only` restricts the file to one character and fills it in where the file has
 * none (the upload on a character's page); without it each entry must name a character from `characters`.
 */
export function checkKnowledgeFile(name: string, text: string, characters: readonly string[], only?: string): KnowledgeFileCheck {
  const entries: LoungeKnowledgeInput[] = [], problems: string[] = [], seen = new Set<string>();
  if (text.length > loungeKnowledgeFileLimits.bytes) return { entries, problems: ['파일이 너무 커요. 2MB 이하로 나눠 주세요.'] };
  const items = readKnowledgeFile(name, text);
  if (!items.length) return { entries, problems: ['항목이 없어요. .jsonl은 한 줄에 하나, .csv는 첫 줄에 필드 이름이 있어야 해요.'] };
  if (items.length > loungeKnowledgeFileLimits.entries) return { entries, problems: [`한 번에 ${loungeKnowledgeFileLimits.entries}개까지 올릴 수 있어요. 파일을 나눠 주세요.`] };
  for (const item of items) {
    if (!item.raw) { problems.push(`${item.line}번째 줄: ${item.error}`); continue; }
    const named = typeof item.raw.character === 'string' ? item.raw.character.trim() : '';
    if (only && named && named !== only) { problems.push(`${item.line}번째 줄: 캐릭터(${named})가 선택한 캐릭터와 달라요.`); continue; }
    const read = readLoungeKnowledgeInput(only ? { ...item.raw, character: only } : item.raw, characters);
    if (!read.ok) { problems.push(`${item.line}번째 줄 「${String(item.raw.title ?? '').slice(0, 30)}」: ${read.error}`); continue; }
    const key = `${read.input.character}\n${read.input.title}`;
    if (seen.has(key)) { problems.push(`${item.line}번째 줄 「${read.input.title}」: 같은 캐릭터에 같은 제목이 두 번 있어요.`); continue; }
    seen.add(key); entries.push(read.input);
  }
  return { entries, problems };
}
