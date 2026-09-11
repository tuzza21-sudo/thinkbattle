import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../src/lib/openingDraft.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
}).outputText;
const moduleExports = {};
new Function('exports', compiled)(moduleExports);
const { parseOpeningDraft, serializeOpeningDraft } = moduleExports;

test('switching to structured writing retains free text, including unrecognized labels', () => {
  const free = '내 생각입니다.\n[출처]\n확인한 자료\n';
  assert.equal(parseOpeningDraft(free).claim1, free);
});
test('editing other fields never grows blank lines or truncates existing paragraphs', () => {
  const draft = { ...parseOpeningDraft(''), position: '찬성', claim1: '첫 문장\n\n둘째 문장\n', evidence1: '학생이 작성한 근거 ' };
  for (const language of ['ko', 'en']) {
    let text = serializeOpeningDraft(draft, language);
    for (let i = 0; i < 30; i++) text = serializeOpeningDraft(parseOpeningDraft(text), language);
    assert.equal(text, serializeOpeningDraft(draft, language));
    assert.deepEqual(parseOpeningDraft(text), draft);
  }
});
test('optional fields are omitted and an empty form cannot create a speech', () => {
  assert.equal(serializeOpeningDraft(parseOpeningDraft('')), '');
  assert.equal(serializeOpeningDraft({ ...parseOpeningDraft(''), reason1: '직접 쓴 이유' }), '[이유 1]\n직접 쓴 이유');
});
test('free-writing additions before existing labels are preserved', () => {
  const value = '덧붙인 말\n\n[나의 입장]\n찬성\n\n[핵심 주장 1]\n원래 주장';
  const parsed = parseOpeningDraft(value);
  assert.equal(parsed.claim1, '덧붙인 말\n\n원래 주장');
  assert.equal(parsed.position, '찬성');
});
