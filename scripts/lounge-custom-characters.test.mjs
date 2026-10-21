import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const load = path => loadTs(fileURLToPath(new URL(path, import.meta.url)));
const custom = load('../src/lib/loungeCustomCharacters.ts');
const lounge = load('../src/lib/lounge.ts');
const characters = load('../src/lib/loungeCharacters.ts');
const relationship = load('../src/lib/relationship/index.ts');
const handler = load('../api/lounge-characters.ts').default;

const id = `c_${'a'.repeat(32)}`;
const sheet = {
  name: '한지안', age: 31, gender: 'female', job: '새벽 라디오 PD', concept: '겉으로는 무심한데 남의 사연은 끝까지 들어 주는 사람',
  role: '새벽 두 시 음악 방송을 만들고 사연을 고른다', tagline: '무심한 척하지만 사연 하나하나를 끝까지 듣는 새벽 라디오 PD',
  story: ['대학 방송국에서 처음 마이크를 잡았다. 목소리보다 남의 이야기를 고르는 일이 더 좋다는 걸 알고 PD가 됐다.', '첫 생방송에서 사연을 잘못 읽어 청취자를 울린 적이 있다. 그 뒤로는 사연을 세 번 읽고 방송에 올린다.'],
  personality: [{ label: '강점', text: '말을 끝까지 듣고, 상대가 놓친 마음을 한 문장으로 돌려준다.' }, { label: '약점', text: '자기 이야기는 잘 하지 않아서 차갑다는 오해를 산다.' }, { label: '모순', text: '사람을 귀찮아하는 척하면서 새벽마다 사연을 기다린다.' }],
  habits: ['대답하기 전에 짧게 웃고, 문장을 짧게 끊어 말한다.', '좋은 이야기를 들으면 오래된 노래 제목을 하나 붙여 준다.'],
  look: '어깨에 닿는 검은 단발, 헐렁한 회색 니트, 지친 듯 차분한 눈매', boundaries: ['빈말로 칭찬하지 않는다.', '상대를 모욕하거나 놀리지 않는다.'],
  greeting: '이 시간에 깨어 있네요. 무슨 이야기 들고 왔어요?',
};
const row = { id, owner_id: 'owner', name: sheet.name, status: 'private', sheet, template: 'slow_burn', flirtation: false, voice: 'low_female', theme: 'river', portrait_path: `${id}/draft-0123456789abcdef.webp`, portrait_source: 'ai', review_note: '', created_at: '', updated_at: '' };

test('every relationship type is a valid configuration, with and without flirting', () => {
  for (const template of relationship.relationshipTemplateIds) for (const flirtation of [true, false]) {
    const config = relationship.relationshipFromTemplate(template, { characterId: id, displayName: '한지안', core: ['차분하다'], flirtation });
    assert.deepEqual(relationship.validateRelationshipConfig(config), [], `${template} ${flirtation}`);
    assert.equal(Boolean(config.adultFlirtation), flirtation);
  }
});

test('a sheet must be complete and adult; what is written is trimmed to the limits, nothing invented', () => {
  assert.deepEqual(custom.validateLoungeCustomSheet(sheet), []);
  const fields = custom.validateLoungeCustomSheet({ ...sheet, age: 17, story: [sheet.story[0]], habits: [], greeting: '' }).map(problem => problem.field);
  assert.ok(fields.includes('age') && fields.includes('story') && fields.includes('habits') && fields.includes('greeting'));
  assert.deepEqual(custom.validateLoungeCustomBasics({ name: '', age: 40, gender: 'male', job: '요리사', concept: '짧음' }).map(problem => problem.field), ['name', 'concept']);
  const cleaned = custom.normalizeLoungeCustomSheet({ ...sheet, name: '  한   지안  ', gender: 'robot', habits: ['  하나  ', '', 3], personality: [{ label: '강점', text: ' 듣는다 ' }, { label: '기타', text: '무시' }] });
  assert.equal(cleaned.name, '한 지안'); assert.equal(cleaned.gender, 'other');
  assert.deepEqual(cleaned.habits, ['하나']); assert.deepEqual(cleaned.personality, [{ label: '강점', text: '듣는다' }]);
});

test('a registered member character is found everywhere a house character is', () => {
  custom.registerLoungeCustomCharacterRow(row, 'https://db.test/portrait.webp');
  assert.equal(lounge.getLoungeHost(id).name, '한지안');
  assert.equal(lounge.getLoungeHost(id).portrait, 'https://db.test/portrait.webp');
  assert.equal(lounge.getLoungeHost(id).voice, 'sage');
  assert.match(lounge.getLoungeHost(id).speechInstruction, /31세 여성/);
  assert.equal(characters.getLoungeCharacter(id).story.length, 2);
  assert.equal(relationship.getRelationshipConfig(id).stages[0].id, 'DISMISSIVE');
  assert.equal(relationship.getRelationshipConfig(id).adultFlirtation, undefined, 'flirting was turned off');
  assert.equal(lounge.isLoungeRelationshipHost(id), true);
  assert.equal(lounge.loungeRoomTheme(id, 'lounge-room'), 'river');
  assert.match(characters.loungePersonaPrompt(characters.getLoungeCharacter(id)), /너는 한지안이다/);
  // A house character is unchanged and an unknown id still falls back as before.
  assert.equal(lounge.getLoungeHost('velvet').id, 'velvet');
  assert.equal(lounge.getLoungeHost(`c_${'b'.repeat(32)}`).id, lounge.loungeHosts[0].id);
});

const result = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = body => new Request('https://app.test/api/lounge-characters', { method: 'POST', headers: { Authorization: 'Bearer session', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const modelOutput = value => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
const run = async (mock, task) => {
  const previous = { ...process.env }, fetch = globalThis.fetch;
  Object.assign(process.env, { OPENAI_API_KEY: 'test-key', SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'private-service' });
  globalThis.fetch = mock;
  try { await task(); } finally { globalThis.fetch = fetch; for (const name of ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
};
const member = url => url.includes('/auth/') ? result({ id: 'owner' }) : null;

test('the AI drafts the rest of a sheet from a few lines, keeping what the member wrote', async () => {
  await run(async (url, init) => {
    const signed = member(url); if (signed) return signed;
    if (url.endsWith('/responses')) { const body = JSON.parse(init.body); assert.match(body.instructions, /캐릭터 작가/); assert.equal(JSON.parse(body.input).name, '한지안'); return result(modelOutput({ ...sheet, name: '다른 이름' })); }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler(request({ action: 'draft', name: '한지안', age: 31, gender: 'female', job: '새벽 라디오 PD', concept: sheet.concept }));
    assert.equal(response.status, 200);
    const drafted = (await response.json()).sheet;
    assert.equal(drafted.name, '한지안', 'the member\'s name is kept'); assert.equal(drafted.story.length, 2);
  });
  await run(async url => member(url) ?? Promise.reject(new Error('Must not call the model')), async () => {
    const response = await handler(request({ action: 'draft', name: '한지안', age: 16, gender: 'female', job: 'PD', concept: '짧음' }));
    assert.equal(response.status, 400);
    assert.deepEqual((await response.json()).problems.map(problem => problem.field).sort(), ['age', 'concept']);
  });
});

test('saving: incomplete sheets and a failed review are refused with the fields to fix; the fourth character is refused', async () => {
  await run(async url => member(url) ?? Promise.reject(new Error('Must not call the model')), async () => {
    const response = await handler(request({ action: 'save', sheet: { ...sheet, greeting: '' }, template: 'warm', voice: 'calm_female', theme: 'river' }));
    assert.equal(response.status, 400); assert.equal((await response.json()).problems[0].field, 'greeting');
  });
  await run(async url => {
    const signed = member(url); if (signed) return signed;
    if (url.endsWith('/responses')) return result(modelOutput({ allowed: false, problems: [{ field: 'look', message: '실존 인물을 닮게 하지 말아 주세요.' }] }));
    throw new Error('Must not store a refused character');
  }, async () => {
    const response = await handler(request({ action: 'save', sheet, template: 'warm', voice: 'calm_female', theme: 'river' }));
    assert.equal(response.status, 422); assert.equal((await response.json()).problems[0].field, 'look');
  });
  let stored;
  await run(async (url, init) => {
    const signed = member(url); if (signed) return signed;
    if (url.endsWith('/responses')) return result(modelOutput({ allowed: true, problems: [] }));
    if (url.endsWith('/rest/v1/lounge_custom_characters') && init.method === 'POST') { stored = JSON.parse(init.body); return result({ message: '캐릭터는 한 사람당 3개까지 만들 수 있어요.' }, 400); }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler(request({ action: 'save', sheet, template: 'warm', voice: 'calm_female', theme: 'river' }));
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'lounge_character_limit');
  });
  assert.match(stored.id, /^c_[0-9a-f]{32}$/); assert.equal(stored.owner_id, 'owner'); assert.equal(stored.flirtation, true);
});

test('portraits: a daily limit, only the character\'s own drafts can be chosen, uploads need consent and pass the checks', async () => {
  const own = url => url.includes('lounge_custom_characters?id=eq.') ? result([row]) : null;
  await run(async url => member(url) ?? own(url) ?? (url.includes('claim_lounge_custom_portrait') ? result(false) : Promise.reject(new Error('Must not make an image'))), async () => {
    const response = await handler(request({ action: 'portrait', id }));
    assert.equal(response.status, 429);
  });
  await run(async url => member(url) ?? own(url) ?? Promise.reject(new Error('Unexpected')), async () => {
    assert.equal((await handler(request({ action: 'choose', id, path: `c_${'b'.repeat(32)}/draft-0123456789abcdef.webp` }))).status, 400, 'another character\'s draft');
    assert.equal((await handler(request({ action: 'upload', id, image: 'data:image/png;base64,AAAA' }))).status, 400, 'no consent');
  });
  await run(async url => {
    const signed = member(url) ?? own(url); if (signed) return signed;
    if (url.endsWith('/v1/moderations')) return result({ results: [{ flagged: true }] });
    throw new Error('Must not store a flagged image');
  }, async () => {
    const response = await handler(request({ action: 'upload', id, consent: true, image: 'data:image/png;base64,AAAA' }));
    assert.equal(response.status, 422);
  });
});

test('guests cannot make characters', async () => {
  await run(async url => url.includes('/auth/') ? result({ id: 'guest', is_anonymous: true }) : Promise.reject(new Error('Unexpected')), async () => {
    assert.equal((await handler(request({ action: 'draft' }))).status, 403);
  });
});
