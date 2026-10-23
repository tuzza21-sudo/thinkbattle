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
  intro: '대학 방송국에서 처음 마이크를 잡았다. 목소리보다 남의 이야기를 고르는 일이 더 좋다는 걸 알고 PD가 됐다.\n\n첫 생방송에서 사연을 잘못 읽어 청취자를 울린 뒤로, 한 줄도 끝까지 듣고 고른다.',
  personality: '빈말을 싫어하고 말을 끝까지 듣는다. 자기 이야기는 잘 하지 않아 차갑다는 오해를 받는다. 말은 짧고 차분한 존댓말이고 가끔 마른 농담을 한다.',
  tastes: '관심 분야: 오래된 노래, 새벽 라디오\n좋아하는 것: 따뜻한 보리차, 비 오는 날\n싫어하는 것: 생색내기, 시끄러운 회식',
  tagline: '무심한 척하지만 사연 하나하나를 끝까지 듣는 새벽 라디오 PD',
  look: '어깨에 닿는 검은 단발, 헐렁한 회색 니트, 지친 듯 차분한 눈매',
  greeting: '이 시간에 깨어 있네요. 무슨 이야기 들고 왔어요?',
};
// The shape before the sheet was simplified: characters saved then must keep working.
const oldSheet = {
  name: '오래된', age: 40, gender: 'male', job: '목수', concept: '', role: '오래된 집을 고친다', tagline: '말수 적은 목수',
  story: ['아버지에게 대패질을 배웠다.', '첫 집을 지을 때 기둥을 잘못 세워 다시 지었다.'],
  personality: [{ label: '강점', text: '끝까지 마무리한다.' }, { label: '약점', text: '고집이 세다.' }],
  habits: ['말끝을 흐린다.'], look: '굵은 팔뚝, 먼지 묻은 앞치마', boundaries: ['빈말하지 않는다.'], greeting: '왔어요.',
};
const row = { id, owner_id: 'owner', name: sheet.name, status: 'private', sheet, template: 'slow_burn', flirtation: false, voice: 'low_female', theme: 'river', portrait_path: `${id}/draft-0123456789abcdef.webp`, portrait_source: 'ai', review_note: '', created_at: '', updated_at: '' };

test('every relationship type is a valid configuration, with and without flirting', () => {
  for (const template of relationship.relationshipTemplateIds) for (const flirtation of [true, false]) {
    const config = relationship.relationshipFromTemplate(template, { characterId: id, displayName: '한지안', core: ['차분하다'], flirtation });
    assert.deepEqual(relationship.validateRelationshipConfig(config), [], `${template} ${flirtation}`);
    assert.equal(Boolean(config.adultFlirtation), flirtation);
  }
});

test('a sheet is four things; the tagline, look and greeting may be empty; what is written is trimmed, nothing invented', () => {
  assert.deepEqual(custom.validateLoungeCustomSheet(sheet), []);
  assert.deepEqual(custom.validateLoungeCustomSheet({ ...sheet, tagline: '', look: '', greeting: '' }), [], 'the AI writes these');
  const fields = custom.validateLoungeCustomSheet({ ...sheet, age: 17, intro: '짧음', personality: '', tastes: '', greeting: '짧' }).map(problem => problem.field);
  assert.deepEqual(fields.sort(), ['age', 'greeting', 'intro', 'personality', 'tastes']);
  assert.deepEqual(custom.validateLoungeCustomBasics({ name: '', age: 40, gender: 'male', job: '요리사' }).map(problem => problem.field), ['name']);
  assert.deepEqual(custom.validateLoungeCustomBasics({ name: '한지안', age: 40, gender: 'male', job: '요리사' }), [], 'no idea is needed');
  const cleaned = custom.normalizeLoungeCustomSheet({ ...sheet, name: '  한   지안  ', gender: 'robot', personality: '  듣는다   잘  ', tastes: '관심 분야:  노래\n\n\n\n좋아하는 것: 비' });
  assert.equal(cleaned.name, '한 지안'); assert.equal(cleaned.gender, 'other');
  assert.equal(cleaned.personality, '듣는다 잘'); assert.equal(cleaned.tastes, '관심 분야: 노래\n\n좋아하는 것: 비');
});

test('a sheet saved before the simplification is read into the new shape', () => {
  const read = custom.normalizeLoungeCustomSheet(oldSheet);
  assert.equal(read.intro, '아버지에게 대패질을 배웠다.\n\n첫 집을 지을 때 기둥을 잘못 세워 다시 지었다.');
  assert.equal(read.personality, '끝까지 마무리한다. 고집이 세다. 말끝을 흐린다.', 'strengths, weaknesses and habits become one text');
  assert.equal(read.tastes, ''); assert.equal(read.tagline, '말수 적은 목수');
  const id = `c_${'d'.repeat(32)}`;
  custom.registerLoungeCustomCharacterRow({ ...row, id, name: '오래된', sheet: oldSheet }, null);
  assert.match(characters.loungePersonaPrompt(characters.getLoungeCharacter(id)), /너는 오래된이다/);
  assert.match(lounge.getLoungeHost(id).companion, /성격과 말투: 끝까지 마무리한다/);
  assert.doesNotMatch(lounge.getLoungeHost(id).companion, /취향/, 'no tastes yet, nothing about them is told');
});

test('a registered member character is found everywhere a house character is', () => {
  custom.registerLoungeCustomCharacterRow(row, 'https://db.test/portrait.webp');
  assert.equal(lounge.getLoungeHost(id).name, '한지안');
  assert.equal(lounge.getLoungeHost(id).portrait, 'https://db.test/portrait.webp');
  assert.equal(lounge.getLoungeHost(id).voice, 'sage');
  assert.match(lounge.getLoungeHost(id).speechInstruction, /31세 여성/);
  assert.equal(characters.getLoungeCharacter(id).story.length, 2, 'the introduction in paragraphs');
  assert.equal(relationship.getRelationshipConfig(id).stages[0].id, 'DISMISSIVE');
  assert.equal(relationship.getRelationshipConfig(id).adultFlirtation, undefined, 'flirting was turned off');
  assert.equal(lounge.isLoungeRelationshipHost(id), true);
  assert.equal(lounge.loungeRoomTheme(id, 'lounge-room'), 'river');
  const persona = characters.loungePersonaPrompt(characters.getLoungeCharacter(id));
  assert.match(persona, /너는 한지안이다/);
  assert.match(persona, /성격: 성격과 말투 - 빈말을 싫어하고/); assert.match(persona, /취향: 관심 분야: 오래된 노래/);
  assert.doesNotMatch(persona, /말버릇과 습관/, 'a member\'s character has no habits line');
  assert.match(lounge.getLoungeHost(id).companion, /성격과 말투: 빈말을 싫어하고[\s\S]*취향: 관심 분야/);
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

test('the AI writes the introduction, personality and tastes from a name, age and job, keeping what the member wrote', async () => {
  await run(async (url, init) => {
    const signed = member(url); if (signed) return signed;
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body); assert.match(body.instructions, /캐릭터 작가/); assert.equal(JSON.parse(body.input).name, '한지안');
      assert.match(body.instructions, /장점과 약점으로 나누지 않고/); assert.deepEqual(body.text.format.schema.required, ['intro', 'personality', 'tastes', 'tagline', 'look', 'greeting']);
      return result(modelOutput({ ...sheet, name: '다른 이름' }));
    }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler(request({ action: 'draft', name: '한지안', age: 31, gender: 'female', job: '새벽 라디오 PD' }));
    assert.equal(response.status, 200);
    const drafted = (await response.json()).sheet;
    assert.equal(drafted.name, '한지안', 'the member\'s name is kept'); assert.match(drafted.tastes, /좋아하는 것/); assert.equal(typeof drafted.personality, 'string');
  });
  await run(async url => member(url) ?? Promise.reject(new Error('Must not call the model')), async () => {
    const response = await handler(request({ action: 'draft', name: '한지안', age: 16, gender: 'female', job: 'P' }));
    assert.equal(response.status, 400);
    assert.deepEqual((await response.json()).problems.map(problem => problem.field).sort(), ['age', 'job']);
  });
});

test('saving: incomplete sheets and a failed review are refused with the fields to fix; the fourth character is refused', async () => {
  await run(async url => member(url) ?? Promise.reject(new Error('Must not call the model')), async () => {
    const response = await handler(request({ action: 'save', sheet: { ...sheet, tastes: '' }, template: 'warm', voice: 'calm_female', theme: 'river' }));
    assert.equal(response.status, 400); assert.equal((await response.json()).problems[0].field, 'tastes');
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

test('saving a hand-written sheet: the AI writes the empty tagline, look and greeting first, then the sheet is reviewed and stored', async () => {
  const calls = []; let stored;
  await run(async (url, init) => {
    const signed = member(url); if (signed) return signed;
    if (url.endsWith('/responses')) {
      const body = JSON.parse(init.body); calls.push(body.text.format.name);
      if (body.text.format.name === 'lounge_character_extras') { assert.deepEqual(JSON.parse(body.input).empty, ['tagline', 'look', 'greeting']); return result(modelOutput({ tagline: '끝까지 듣는 새벽 라디오 PD', look: '검은 단발과 회색 니트, 차분한 눈매', greeting: '이 시간에 깨어 있네요.' })); }
      assert.equal(JSON.parse(body.input).look, '검은 단발과 회색 니트, 차분한 눈매', 'the review reads the completed sheet');
      return result(modelOutput({ allowed: true, problems: [] }));
    }
    if (url.endsWith('/rest/v1/lounge_custom_characters')) { stored = JSON.parse(init.body); return result([{ ...row, sheet: stored.sheet }]); }
    throw new Error(`Unexpected ${url}`);
  }, async () => {
    const response = await handler(request({ action: 'save', sheet: { ...sheet, tagline: '', look: '', greeting: '' }, template: 'warm', voice: 'calm_female', theme: 'river' }));
    assert.equal(response.status, 200);
  });
  assert.deepEqual(calls, ['lounge_character_extras', 'lounge_character_review']);
  assert.equal(stored.sheet.tagline, '끝까지 듣는 새벽 라디오 PD'); assert.equal(stored.sheet.intro, sheet.intro);
  // A complete sheet needs no extra call.
  const complete = [];
  await run(async (url, init) => {
    const signed = member(url); if (signed) return signed;
    if (url.endsWith('/responses')) { complete.push(JSON.parse(init.body).text.format.name); return result(modelOutput({ allowed: true, problems: [] })); }
    if (url.endsWith('/rest/v1/lounge_custom_characters')) return result([row]);
    throw new Error(`Unexpected ${url}`);
  }, async () => { assert.equal((await handler(request({ action: 'save', sheet, template: 'warm', voice: 'calm_female', theme: 'river' }))).status, 200); });
  assert.deepEqual(complete, ['lounge_character_review']);
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
