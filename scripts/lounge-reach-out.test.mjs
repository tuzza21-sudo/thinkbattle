import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTs } from './lounge-ts-loader.mjs';

const rules = loadTs(fileURLToPath(new URL('../src/lib/loungeReachOut.ts', import.meta.url)));
const api = loadTs(fileURLToPath(new URL('../api/lounge-reach-out.ts', import.meta.url)));
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const account = { project_id: 'demo', client_email: 'push@demo.iam.gserviceaccount.com', private_key: privateKey };
const hour = 3_600_000;
const noonKst = Date.parse('2026-11-10T03:00:00Z'); // 12:00 in Korea
const result = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });

test('the hours: from 9 until before 22 in Korea', () => {
  assert.equal(rules.reachOutHourAllowed(Date.parse('2026-11-10T00:00:00Z')), true, '9:00');
  assert.equal(rules.reachOutHourAllowed(Date.parse('2026-11-10T12:59:00Z')), true, '21:59');
  assert.equal(rules.reachOutHourAllowed(Date.parse('2026-11-10T13:00:00Z')), false, '22:00');
  assert.equal(rules.reachOutHourAllowed(Date.parse('2026-11-09T23:59:00Z')), false, '8:59');
});

test('a chat qualifies after a day of silence, within two weeks, with enough said', () => {
  const policy = rules.reachOutPolicyFor('guide');
  const q = (silentHours, humanMessages = 10) => rules.reachOutQualifies({ policy, lastHumanAt: noonKst - silentHours * hour, humanMessages }, noonKst);
  assert.equal(q(23), false); assert.equal(q(24), true); assert.equal(q(14 * 24), true); assert.equal(q(14 * 24 + 1), false);
  assert.equal(q(48, 5), false, 'too little was said');
  assert.equal(rules.reachOutQualifies({ policy, lastHumanAt: undefined, humanMessages: 9 }, noonKst), false);
});

test('one a day by the Korean date, and a character can have a policy of its own', () => {
  assert.equal(rules.reachedOutToday('2026-11-10T00:30:00Z', noonKst), true);
  assert.equal(rules.reachedOutToday('2026-11-09T14:59:00Z', noonKst), false, '23:59 the day before in Korea is yesterday');
  assert.equal(rules.reachedOutToday(null, noonKst), false);
  rules.reachOutPolicies.guide = { minSilenceHours: 48 };
  assert.equal(rules.reachOutPolicyFor('guide').minSilenceHours, 48); assert.equal(rules.reachOutPolicyFor('guide').maxSilenceDays, 14);
  delete rules.reachOutPolicies.guide;
});

test('the line is one short line of speech: no quotes, no stage directions', () => {
  assert.equal(rules.cleanReachOutLine('"오늘은 길 안 잃었어요?"'), '오늘은 길 안 잃었어요?');
  assert.equal(rules.cleanReachOutLine('*웃으며*\n어제 하던 얘기, 아직 생각 중이에요.'), '어제 하던 얘기, 아직 생각 중이에요.');
  assert.equal(rules.cleanReachOutLine('안녕 *손을 흔든다* 오랜만이야').includes('*'), false);
  assert.ok(rules.cleanReachOutLine('가'.repeat(300)).length <= 110);
  assert.equal(rules.cleanReachOutLine(undefined), '');
});

async function run(world = {}, options = {}) {
  const calls = { messages: [], pushes: [], states: [], openai: 0, humanQueries: [] };
  const w = { reach: true, on: true, enabled: true, lastSent: null, lastHuman: new Date(noonKst - 30 * hour).toISOString(), count: 12, line: '어제 얘기하던 거, 아직 생각 중이에요.', persona: 'guide', ...world };
  const previous = { ...process.env }, fetch = globalThis.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'private-service', OPENAI_API_KEY: 'sk-test', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(account) });
  if (w.on) process.env.LOUNGE_REACH_OUT = 'on'; else delete process.env.LOUNGE_REACH_OUT;
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    if (url.includes('/rest/v1/lounge_push_tokens') && (init.method ?? 'GET') === 'GET') return result([{ user_id: 'user-1', token: 'token-aaaaaaaaaaaaaaaaaaaa' }]);
    if (url.includes('/rest/v1/lounge_reach_out?select=user_id')) return w.table === false ? result({ message: 'no table' }, 404) : result([]);
    if (url.includes('/rest/v1/lounge_reach_out?user_id=')) return result(w.state === undefined ? [{ enabled: w.enabled, last_sent_at: w.lastSent }] : w.state);
    if (url.includes('/rest/v1/lounge_reach_out?on_conflict')) { calls.states.push(JSON.parse(init.body)); return result([], 201); }
    if (url.includes('/rest/v1/voice_lounge_rooms')) return result(w.rooms ?? [{ id: 'room-1', host_persona: w.persona, memory: '피렌체 여행 이야기', status: 'active', created_at: '2026-11-01T00:00:00Z' }]);
    if (url.includes('/rest/v1/voice_lounge_messages') && init.method === 'POST') { calls.messages.push(JSON.parse(init.body)); return result([], 201); }
    if (url.includes('/rest/v1/voice_lounge_messages') && url.includes('kind=eq.human')) { calls.humanQueries.push(decodeURIComponent(url)); return result(w.lastHuman ? Array.from({ length: w.count }, () => ({ created_at: w.lastHuman })) : []); }
    if (url.includes('/rest/v1/voice_lounge_messages')) return result([{ kind: 'human', text: '안녕', created_at: w.lastHuman }, { kind: 'host', text: '어서 와요', created_at: w.lastHuman }]);
    if (url.includes('api.openai.com')) { calls.openai += 1; return result({ output_text: w.line }); }
    if (url.includes('oauth2.googleapis.com')) return result({ access_token: 'access-1', expires_in: 3600 });
    if (url.includes('fcm.googleapis.com')) { calls.pushes.push(JSON.parse(init.body).message); return result({ name: 'x' }); }
    throw new Error('Unexpected call ' + url);
  };
  try { return { out: await api.runReachOut({ now: noonKst, ...options }), ...calls }; }
  finally { globalThis.fetch = fetch; for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'FIREBASE_SERVICE_ACCOUNT', 'LOUNGE_REACH_OUT']) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
}

test('off until LOUNGE_REACH_OUT=on, and not outside the hours', async () => {
  assert.equal((await run({ on: false })).out.skipped, 'off');
  assert.equal((await run({}, { now: Date.parse('2026-11-10T16:00:00Z') })).out.skipped, 'outside_hours');
});

test('a member who qualifies gets the line in the chat and as a push that opens the chat; the day is recorded', async () => {
  const done = await run();
  assert.equal(done.out.reached.length, 1);
  assert.equal(done.messages.length, 1); assert.equal(done.messages[0].kind, 'host'); assert.equal(done.messages[0].room_id, 'room-1'); assert.equal(done.messages[0].text, '어제 얘기하던 거, 아직 생각 중이에요.');
  assert.equal(done.pushes.length, 1); assert.equal(done.pushes[0].data.url, '/lounge/room-1'); assert.equal(done.pushes[0].notification.body, done.messages[0].text);
  assert.equal(done.states[0].last_character, 'guide'); assert.equal(done.states[0].user_id, 'user-1');
});

test('nothing is sent to a member who turned it off, was reached today, is not silent long enough or said too little', async () => {
  for (const world of [{ enabled: false }, { lastSent: new Date(noonKst - 2 * hour).toISOString() }, { lastHuman: new Date(noonKst - 3 * hour).toISOString() }, { count: 3 }, { persona: 'a-members-own' }]) {
    const skipped = await run(world);
    assert.equal(skipped.out.reached.length, 0, JSON.stringify(world)); assert.equal(skipped.messages.length, 0); assert.equal(skipped.pushes.length, 0);
  }
});

test('the line goes to the current (active) room, and what was said counts across the older rooms of the same character', async () => {
  const rooms = [
    { id: 'room-new', host_persona: 'guide', memory: '', status: 'active', created_at: '2026-11-05T00:00:00Z' },
    { id: 'room-old', host_persona: 'guide', memory: '', status: 'ended', created_at: '2026-10-20T00:00:00Z' },
  ];
  // The messages of both rooms come back from one query (the member said 8 things in all, more than the 6 asked).
  const done = await run({ rooms, count: 8 });
  assert.equal(done.out.reached.length, 1);
  assert.equal(done.messages[0].room_id, 'room-new'); assert.equal(done.pushes[0].data.url, '/lounge/room-new');
  assert.ok(done.humanQueries[0].includes('room-new') && done.humanQueries[0].includes('room-old'));
});

test('a character whose rooms are all ended is not reached out from', async () => {
  const ended = await run({ rooms: [{ id: 'room-old', host_persona: 'guide', memory: '', status: 'ended', created_at: '2026-10-20T00:00:00Z' }] });
  assert.equal(ended.out.reached.length, 0); assert.equal(ended.messages.length, 0); assert.equal(ended.pushes.length, 0);
});

test('without the table nothing is sent', async () => {
  const early = await run({ table: false });
  assert.equal(early.out.skipped, 'not_ready'); assert.equal(early.messages.length, 0); assert.equal(early.pushes.length, 0);
});

test('a dry run writes and sends nothing; an empty line from the model sends nothing', async () => {
  const dry = await run({}, { dry: true });
  assert.equal(dry.out.reached.length, 1); assert.equal(dry.openai, 0); assert.equal(dry.messages.length, 0); assert.equal(dry.pushes.length, 0);
  const empty = await run({ line: '*웃는다*' });
  assert.equal(empty.out.failed, 1); assert.equal(empty.messages.length, 0); assert.equal(empty.pushes.length, 0);
});

test('only the cron can start it', async () => {
  const handler = api.default;
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'cron-secret';
  try {
    assert.equal((await handler(new Request('https://app.test/api/lounge-reach-out'))).status, 401);
    assert.equal((await handler(new Request('https://app.test/api/lounge-reach-out', { headers: { authorization: 'Bearer wrong' } }))).status, 401);
    assert.equal((await handler(new Request('https://app.test/api/lounge-reach-out', { method: 'POST', headers: { authorization: 'Bearer cron-secret' } }))).status, 405);
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});
