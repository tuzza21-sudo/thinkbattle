import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const compile = (path, require = () => ({})) => {
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(exports, require);
  return exports;
};
const knowledge = compile('../src/lib/loungeKnowledge.ts');
const lounge = compile('../src/lib/lounge.ts');
const handler = compile('../api/lounge-knowledge.ts', path => path.endsWith('loungeKnowledge') ? knowledge : lounge).default;
const { readLoungeKnowledgeInput, loungeKnowledgeSensitive, normalizeLoungeEmbedding, loungeKnowledgeQuery, loungeKnowledgePrompt, loungeKnowledgeEmbeddingText } = knowledge;
const characters = ['lawyer', 'diplomat'];
const entry = { character: 'lawyer', kind: 'knowledge', title: '증거능력과 증명력', content: '증거능력은 법정에서 쓸 수 있는 자격이다.', active: true };

test('an entry from the form is cleaned and every problem is explained in Korean', () => {
  const clean = { tags: [], lesson: '', category: '', sourceNote: '', asOf: '', timeSensitive: false };
  assert.deepEqual(readLoungeKnowledgeInput({ ...entry, title: '  증거능력  ', content: ' 내용 ' }, characters), { ok: true, input: { character: 'lawyer', kind: 'knowledge', title: '증거능력', content: '내용', active: true, ...clean } });
  const id = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(readLoungeKnowledgeInput({ ...entry, id, active: false }, characters).input, { id, character: 'lawyer', kind: 'knowledge', title: entry.title, content: entry.content, active: false, ...clean });
  for (const [bad, message] of [[{ ...entry, character: 'nobody' }, /캐릭터/], [{ ...entry, kind: 'rumour' }, /지식인지 경험인지/], [{ ...entry, title: '  ' }, /제목/], [{ ...entry, title: 'x'.repeat(81) }, /제목/],
    [{ ...entry, content: '' }, /내용/], [{ ...entry, content: 'x'.repeat(2001) }, /내용/], [{ ...entry, id: 'not-a-uuid' }, /번호/], [null, /형식/], [[], /형식/]]) {
    const result = readLoungeKnowledgeInput(bad, characters);
    assert.equal(result.ok, false); assert.match(result.error, message);
  }
});

test('an experience is short, has a lesson, a kind and tags; a fact has a source, a date and a time-sensitive mark', () => {
  const story = { ...entry, kind: 'experience', title: '세 번째 질문', content: '같은 질문을 세 번 물었더니 답이 나왔다.', lesson: '질문을 바꿔 한 번 더 묻는다.', category: 'success', tags: '#반대신문, 증인, 반대신문' };
  const read = readLoungeKnowledgeInput(story, characters);
  assert.deepEqual([read.input.lesson, read.input.category, read.input.tags, read.input.sourceNote, read.input.asOf, read.input.timeSensitive], ['질문을 바꿔 한 번 더 묻는다.', 'success', ['반대신문', '증인'], '', '', false], 'tags are cleaned and not repeated');
  assert.match(readLoungeKnowledgeInput({ ...story, content: 'x'.repeat(2001) }, characters).error, /내용은 1~2000자/, 'a story may be as long as a fact: 2000 characters');
  assert.equal(readLoungeKnowledgeInput({ ...story, content: 'x'.repeat(2000) }, characters).ok, true);
  assert.equal(readLoungeKnowledgeInput({ ...story, content: 'x'.repeat(600) }, characters).ok, true, 'and a short one is fine');
  assert.match(readLoungeKnowledgeInput({ ...story, lesson: 'x'.repeat(301) }, characters).error, /교훈/);
  assert.match(readLoungeKnowledgeInput({ ...story, category: 'legend' }, characters).error, /경험의 종류/);
  assert.match(readLoungeKnowledgeInput({ ...story, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }, characters).error, /태그/);
  assert.match(readLoungeKnowledgeInput({ ...story, tags: ['x'.repeat(21)] }, characters).error, /태그/);
  assert.match(readLoungeKnowledgeInput({ ...story, lesson: '문의 010-1234-5678' }, characters).error, /교훈에 전화번호/);
  assert.match(readLoungeKnowledgeInput({ ...story, tags: 'a@b.co' }, characters).error, /태그에 이메일/);
  // Fields of the other kind are dropped rather than carried along.
  const crossed = readLoungeKnowledgeInput({ ...story, sourceNote: '메모', asOf: '2026-01-01', timeSensitive: true }, characters).input;
  assert.deepEqual([crossed.sourceNote, crossed.asOf, crossed.timeSensitive], ['', '', false]);
  const fact = { ...entry, sourceNote: '교과서 요약', asOf: '2026-01-01', timeSensitive: true, lesson: '교훈', category: 'success' };
  const today = new Date('2026-10-09T12:00:00Z');
  const readFact = readLoungeKnowledgeInput(fact, characters, today);
  assert.deepEqual([readFact.input.sourceNote, readFact.input.asOf, readFact.input.timeSensitive, readFact.input.lesson, readFact.input.category], ['교과서 요약', '2026-01-01', true, '', ''], 'a fact keeps its source and date and drops story fields');
  assert.match(readLoungeKnowledgeInput({ ...fact, asOf: '' }, characters, today).error, /기준 날짜가 필요/, 'a time-sensitive fact needs its date');
  assert.equal(readLoungeKnowledgeInput({ ...fact, asOf: '', timeSensitive: false }, characters, today).ok, true, 'a date is optional for other facts');
  for (const asOf of ['2026-13-01', '2026-02-30', '26-01-01', '2026-10-10', 'tomorrow']) assert.match(readLoungeKnowledgeInput({ ...fact, asOf }, characters, today).error, /기준 날짜를 올바른/, asOf);
  assert.equal(readLoungeKnowledgeInput({ ...fact, asOf: '2026-10-09' }, characters, today).ok, true, 'today is allowed');
  assert.match(readLoungeKnowledgeInput({ ...fact, sourceNote: 'x'.repeat(201) }, characters, today).error, /출처 메모/);
});

test('the text that is embedded carries the title, tags, lesson and text, and a long text is cut, never the lesson', () => {
  assert.equal(loungeKnowledgeEmbeddingText({ title: 'T', content: 'C' }), 'T\nC');
  assert.equal(loungeKnowledgeEmbeddingText({ title: 'T', content: 'C', tags: ['a', 'b'], lesson: 'L' }), 'T\na b\nL\nC');
  const long = loungeKnowledgeEmbeddingText({ title: 'T', content: '가'.repeat(2000), tags: ['a'], lesson: '교훈'.repeat(150) });
  assert.ok(long.length <= 3000 && long.includes('교훈'.repeat(150)), 'the lesson survives a long text');
});

test('contact details and identity numbers cannot be saved, ordinary numbers and words can', () => {
  for (const [text, kind] of [['문의는 lawyer@example.com 으로', '이메일'], ['자세한 건 https://example.com/a', '인터넷 주소'], ['www.example.com 참고', '인터넷 주소'], ['연락처 010-1234-5678', '전화번호'], ['02 123 4567로', '전화번호'], ['01012345678', '전화번호'],
    ['901231-1234567', '주민등록번호'], ['9012311234567', '주민등록번호'], ['카드 1234-5678-9012-3456', '카드 번호']]) {
    assert.match(loungeKnowledgeSensitive(text) ?? '', new RegExp(kind), text);
    const result = readLoungeKnowledgeInput({ ...entry, content: text }, characters);
    assert.equal(result.ok, false, text); assert.match(result.error, /내용에 .*저장할 수 없어요/);
    assert.match(readLoungeKnowledgeInput({ ...entry, title: text }, characters).error, /제목에/);
  }
  for (const fine of ['증거능력은 법정에서 쓸 수 있는 자격이다.', '2026년 3월 12일에 있었던 일', '계약금은 총액의 10%, 잔금은 90일 안에', '3번째 질문에서 답이 나왔다', '1억 2,000만 원 규모의 합의', '제123조 제4항']) assert.equal(loungeKnowledgeSensitive(fine), undefined, fine);
});

test('embeddings are scaled to length one and anything unusable is refused', () => {
  const vector = Array.from({ length: 256 }, (_, index) => index === 3 ? 4 : index === 4 ? 3 : 0);
  const normalized = normalizeLoungeEmbedding(vector);
  assert.ok(Math.abs(normalized[3] - 0.8) < 1e-12 && Math.abs(normalized[4] - 0.6) < 1e-12);
  assert.ok(Math.abs(Math.sqrt(normalized.reduce((sum, value) => sum + value * value, 0)) - 1) < 1e-12);
  for (const bad of [undefined, null, 'x', [], new Array(255).fill(1), new Array(256).fill(0), [...new Array(255).fill(1), NaN], [...new Array(255).fill(1), 'a']]) assert.equal(normalizeLoungeEmbedding(bad), undefined);
  assert.ok(loungeKnowledgeEmbeddingText({ title: 'T', content: 'C' }).startsWith('T\nC'));
});

test('knowledge is looked up only when someone has said enough to answer', () => {
  assert.equal(loungeKnowledgeQuery([]), '');
  assert.equal(loungeKnowledgeQuery(['네']), '');
  assert.equal(loungeKnowledgeQuery(['  증거능력이 뭐예요?  ']), '증거능력이 뭐예요?');
  assert.equal(loungeKnowledgeQuery(['첫 말', '두 번째 말', '세 번째 말']), '두 번째 말 세 번째 말', 'the last two things said');
  assert.ok(loungeKnowledgeQuery(['가'.repeat(900)]).length <= 400);
});

test('found entries become one block, split into knowledge and experience, and nothing found adds nothing', () => {
  assert.equal(loungeKnowledgePrompt([]), '');
  const now = Date.parse('2026-10-09T00:00:00Z');
  const text = loungeKnowledgePrompt([{ id: '1', kind: 'knowledge', title: 'A', content: 'a' }, { id: '2', kind: 'experience', title: 'B', content: 'b', lesson: '교훈 하나' }, { id: '3', kind: 'knowledge', title: 'C', content: 'c' }], now);
  assert.ok(text.includes('[전문 지식]\n- A: a\n- C: c') && text.includes('[겪은 일]\n- B: b (교훈: 교훈 하나)'));
  assert.ok(text.includes('낭독하거나 늘어놓지 않는다'));
  assert.ok(text.includes('실제 회사·브랜드·기관·실존 인물·사건의 이름') && text.includes('일반화한다'), 'names and personal details are generalised, not read out');
  assert.ok(!loungeKnowledgePrompt([{ id: '1', kind: 'knowledge', title: 'A', content: 'a' }], now).includes('[겪은 일]'));
});

test('a story is used sparingly: a line or two, then back to the person, never twice, and its figures are not evidence', () => {
  const story = loungeKnowledgePrompt([{ id: '2', kind: 'experience', title: 'B', content: 'b' }]);
  for (const rule of ['한두 문장으로 짧게', '지금 상대의 상황으로 돌아와 질문이나 판단으로 이어간다', '이미 들려준 일화는 다시 꺼내지 않는다', '일반적인 사실이나 현재의 근거로 쓰지 않는다', '정말 도움이 되지 않으면 쓰지 않는다']) assert.ok(story.includes(rule), rule);
  assert.ok(!loungeKnowledgePrompt([{ id: '1', kind: 'knowledge', title: 'A', content: 'a' }]).includes('이미 들려준 일화'), 'the story rules are only added when a story is');
});

test('when some of the people present have already heard a story, the character keeps it short for the others', () => {
  const fresh = loungeKnowledgePrompt([{ id: '2', kind: 'experience', title: 'B', content: 'b', retold: false }]);
  assert.ok(!fresh.includes('이미 들음') && !fresh.includes('아까 말씀드렸듯'), 'nothing is said when nobody has heard it');
  const retold = loungeKnowledgePrompt([{ id: '2', kind: 'experience', title: 'B', content: 'b', lesson: 'L', retold: true }]);
  assert.ok(retold.includes('- B: b (교훈: L) [일부는 이미 들음]'));
  assert.ok(retold.includes('핵심을 한두 문장으로 짧게 다시 말하고') && retold.includes('이미 들은 분을 배려한다'));
});

test('a fact that can go out of date says from when it holds, and says so when it is old', () => {
  const now = Date.parse('2026-10-09T00:00:00Z');
  const fresh = loungeKnowledgePrompt([{ id: '1', kind: 'knowledge', title: '금리', content: '기준금리는 3%대다.', time_sensitive: true, as_of: '2026-03-15' }], now);
  assert.ok(fresh.includes('- 금리: 기준금리는 3%대다. (기준 2026-03, 지금과 다를 수 있음)'));
  assert.ok(fresh.includes('기준 시점이 적힌 전문 지식은 그 시점의 정보라고 밝히고, 지금의 사실이나 투자·법률·의료 판단의 근거로 단정하지 않는다'));
  const old = loungeKnowledgePrompt([{ id: '1', kind: 'knowledge', title: '금리', content: '기준금리는 3%대다.', time_sensitive: true, as_of: '2024-03-15' }], now);
  assert.ok(old.includes('(기준 2024-03, 오래된 정보라 지금과 다를 수 있음)'));
  const timeless = loungeKnowledgePrompt([{ id: '1', kind: 'knowledge', title: '증거능력', content: '자격이다.', time_sensitive: false, as_of: '2020-01-01' }], now);
  assert.ok(!timeless.includes('기준') && !timeless.includes('지금과 다를'), 'a fact that does not go out of date carries no note');
});

const run = async (mock, request = {}, task) => {
  const originalFetch = globalThis.fetch, previous = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', OPENAI_API_KEY: 'key', APP_ORIGIN: 'https://app.test' });
  if (request.noKey) delete process.env.OPENAI_API_KEY;
  globalThis.fetch = mock;
  try { return await task(); } finally { globalThis.fetch = originalFetch; process.env = previous; }
};
const post = (body, headers = {}) => handler(new Request('https://app.test/api/lounge-knowledge', { method: 'POST', headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }));
const ok = body => new Response(JSON.stringify(body), { status: 200 });
const unit = Array.from({ length: 256 }, (_, index) => index === 0 ? 2 : 0);

test('the administrator saves an entry: permission first, then the embedding, then the database', async () => {
  const calls = [];
  await run(async (url, init) => {
    calls.push(url.replace('https://db.test/rest/v1/rpc/', 'rpc:'));
    if (url.endsWith('admin_list_lounge_knowledge')) { assert.equal(init.headers.Authorization, 'Bearer user-token'); assert.equal(JSON.parse(init.body).p_character, ''); return ok([]); }
    if (url.endsWith('/v1/embeddings')) { const body = JSON.parse(init.body); assert.equal(body.dimensions, 256); assert.equal(body.model, 'text-embedding-3-small'); assert.ok(body.input.startsWith('증거능력과 증명력\n') && body.input.includes('증거 재판'), 'the tags are part of what is embedded'); assert.equal(init.headers.Authorization, 'Bearer key'); return ok({ data: [{ embedding: unit }] }); }
    if (url.endsWith('admin_save_lounge_knowledge')) {
      const body = JSON.parse(init.body);
      assert.deepEqual([body.p_id, body.p_character, body.p_kind, body.p_title, body.p_active], [null, 'lawyer', 'knowledge', '증거능력과 증명력', true]);
      assert.deepEqual([body.p_tags, body.p_lesson, body.p_category, body.p_source_note, body.p_as_of, body.p_time_sensitive], [['증거', '재판'], null, null, null, null, false], 'the tags are saved and empty fields are saved as nothing');
      assert.equal(body.p_embedding.length, 256); assert.equal(body.p_embedding[0], 1, 'the stored vector has length one');
      return ok('22222222-2222-4222-8222-222222222222');
    }
    throw new Error(`Unexpected ${url}`);
  }, {}, async () => {
    const response = await post({ entry: { ...entry, tags: ['증거', '재판'] } });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { id: '22222222-2222-4222-8222-222222222222' });
    assert.deepEqual(calls, ['rpc:admin_list_lounge_knowledge', 'https://api.openai.com/v1/embeddings', 'rpc:admin_save_lounge_knowledge']);
  });
});

test('a visitor cannot spend embedding requests, and other requests are refused early', async () => {
  const calls = [];
  const mock = async url => { calls.push(url); return url.endsWith('admin_list_lounge_knowledge') ? new Response(JSON.stringify({ message: 'not authorized' }), { status: 400 }) : ok({}); };
  await run(mock, {}, async () => {
    const response = await post({ entry });
    assert.equal(response.status, 403); assert.match((await response.json()).error, /관리자 권한/);
    assert.deepEqual(calls.filter(url => url.includes('openai')), [], 'no paid request is made for a visitor');
    assert.equal((await handler(new Request('https://app.test/api/lounge-knowledge', { method: 'GET' }))).status, 405);
    assert.equal((await post({ entry }, { Authorization: '' })).status, 401);
    assert.equal((await post({ entry }, { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await post({ entry: { ...entry, title: '' } })).status, 400);
    assert.equal((await post({ entry: { ...entry, character: 'nobody' } })).status, 400);
    assert.equal((await handler(new Request('https://app.test/api/lounge-knowledge', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Length': '99999' }, body: '{}' }))).status, 413);
  });
  await run(mock, { noKey: true }, async () => assert.equal((await post({ entry })).status, 503));
});

test('embedding and database failures are explained and nothing is saved without an embedding', async () => {
  for (const [label, embedding, save, status, message] of [
    ['embedding request fails', new Response('{}', { status: 500 }), null, 502, /임베딩/],
    ['embedding is unreadable', ok({ data: [{ embedding: [1, 2] }] }), null, 502, /임베딩/],
    ['entry to edit is gone', ok({ data: [{ embedding: unit }] }), new Response(JSON.stringify({ message: 'not found' }), { status: 400 }), 404, /찾지 못했/],
    ['database fails', ok({ data: [{ embedding: unit }] }), new Response('{}', { status: 500 }), 502, /저장하지 못했/],
  ]) {
    let saved = 0;
    await run(async url => {
      if (url.endsWith('admin_list_lounge_knowledge')) return ok([]);
      if (url.endsWith('/v1/embeddings')) return embedding;
      if (url.endsWith('admin_save_lounge_knowledge')) { saved++; return save; }
      throw new Error(`Unexpected ${url}`);
    }, {}, async () => {
      const response = await post({ entry: { ...entry, id: '11111111-1111-4111-8111-111111111111' } });
      assert.equal(response.status, status, label); assert.match((await response.json()).error, message, label);
      assert.equal(saved, save ? 1 : 0, label);
    });
  }
});
