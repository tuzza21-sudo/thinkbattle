import { parseLoungeLessonCsv, parseLoungeLessonRows, parseLoungeLessonText } from './loungeLesson';

/*
 * A member's own word file for the 단어장 (2026-11-25, by the owner): an Excel sheet (.xlsx), a CSV or a text file, read
 * in the browser. An .xlsx is a zip of XML files; it is read with the browser's own deflate (DecompressionStream), so no
 * spreadsheet library is added. The old binary .xls is not read: Excel saves it as .xlsx or CSV.
 */

const maxBytes = 2 * 1024 * 1024;

/** A text file in UTF-8, or in the Korean Windows encoding Excel saves a CSV in (CP949 / EUC-KR). */
function decodeText(buffer: ArrayBuffer) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return new TextDecoder('euc-kr').decode(buffer); }
}

async function inflate(data: Uint8Array) {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files of a zip by name (only those asked for are inflated). */
async function readZip(buffer: ArrayBuffer, wanted: (name: string) => boolean) {
  const view = new DataView(buffer), bytes = new Uint8Array(buffer);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 66_000); at--) if (view.getUint32(at, true) === 0x06054b50) { end = at; break; }
  if (end < 0) throw new Error('엑셀 파일을 읽지 못했어요. .xlsx로 저장한 파일인지 확인해 주세요.');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files = new Map<string, Uint8Array>();
  const names = new TextDecoder();
  for (let index = 0; index < count && view.getUint32(at, true) === 0x02014b50; index++) {
    const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true), extra = view.getUint16(at + 30, true), comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extra + comment;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    files.set(name, method === 0 ? data : method === 8 ? await inflate(data) : new Uint8Array());
  }
  return files;
}

const columnIndex = (reference: string) => [...reference.replace(/\d+/g, '').toUpperCase()].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code: string) => code[0] === '#'
  ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : entities[code.toLowerCase()]);
/** The text runs of a string item (phonetic runs left out). */
const runs = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(match => unescape(match[1])).join('');

/** The first sheet of an .xlsx as rows of text (the XML is read with patterns, so it works in a test too). */
export async function readLoungeXlsxRows(buffer: ArrayBuffer): Promise<string[][]> {
  const files = await readZip(buffer, name => name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  const sheetName = [...files.keys()].filter(name => name.startsWith('xl/worksheets/')).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))[0];
  if (!sheetName) throw new Error('엑셀 파일에서 시트를 찾지 못했어요.');
  const text = (data?: Uint8Array) => new TextDecoder().decode(data ?? new Uint8Array());
  const shared = [...text(files.get('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match => runs(match[1]));
  const rows: string[][] = [];
  for (const row of text(files.get(sheetName)).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1], body = cell[2] ?? '';
      const type = attributes.match(/\bt="([^"]*)"/)?.[1], reference = attributes.match(/\br="([A-Z]+)\d*"/i)?.[1];
      const value = unescape(body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
      const content = type === 's' ? shared[Number(value)] ?? '' : type === 'inlineStr' ? runs(body) : value;
      const at = reference ? columnIndex(reference) : cells.length;
      if (at >= 0 && at < 20) cells[at] = content;
    }
    rows.push(Array.from(cells, cell => cell ?? ''));
  }
  return rows;
}

/** The expressions in a member's file: .xlsx, .csv, .tsv or .txt. */
export async function readLoungeLessonFile(file: File) {
  if (file.size > maxBytes) throw new Error('파일이 너무 커요. 2MB 이하로 올려 주세요.');
  const name = file.name.toLowerCase(), buffer = await file.arrayBuffer();
  if (name.endsWith('.xls')) throw new Error('엑셀 97-2003(.xls) 파일은 읽을 수 없어요. 엑셀에서 .xlsx나 CSV로 저장해서 올려 주세요.');
  const words = name.endsWith('.xlsx') ? parseLoungeLessonRows(await readLoungeXlsxRows(buffer))
    : name.endsWith('.csv') ? parseLoungeLessonRows(parseLoungeLessonCsv(decodeText(buffer)))
      : parseLoungeLessonText(decodeText(buffer));
  if (!words.length) throw new Error('영어 표현을 찾지 못했어요. 첫 열에 영어 표현, 둘째 열에 뜻을 적어 주세요.');
  return words;
}
