// Isolated PostgreSQL; no production database or paid model requests.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const migration = await readFile('supabase/migrations/20261208000000_lounge_room_state.sql', 'utf8');
const followUp = await readFile('supabase/migrations/20261208000100_lounge_retention_and_turn_retry.sql', 'utf8');
const historyMigration = await readFile('supabase/migrations/20261208000200_lounge_chat_history.sql', 'utf8');
const users = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const as = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
const create = async character => (await one("select create_voice_lounge($1,'대화',1,'나','forest') id", [character])).id;
const relationship = n => ({ scores: { trust: n }, stage: 'FIRST_MEETING', pending: { direction: null, turns: 0 }, recentEvents: [], memories: [], meaningfulTurns: n, turnCount: n, lastInteractionAt: '2026-11-06T00:00:00Z' });
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,created_at timestamptz DEFAULT now(),email text); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid);
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name,'/') $$;
    CREATE TABLE public.users(id uuid PRIMARY KEY,email text,nickname text,provider text);`);
  const all = (await readdir('supabase/migrations')).sort();
  const files = [...all.filter(file => file.includes('voice_lounge')), ...all.filter(file => !file.includes('voice_lounge') && file.includes('lounge') && file >= '20261029' && file < '20261208')];
  for (const file of files) {
    try {
      if (file.startsWith('20261207')) await db.exec("INSERT INTO lounge_house_characters(id) VALUES('shaman') ON CONFLICT DO NOTHING"); // Registered by the character installer in the service.
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    }
    catch (error) { throw new Error(`${file}: ${error.message}`); }
  }
  for (const id of users) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query("insert into public.users(id,nickname,gender,age_group) values($1,'나','male','30s')", [id]);
  }
  await as(users[0]);
  const old = await create('auditor');
  const current = await create('auditor');
  await db.query("update voice_lounge_rooms set created_at=now()-interval '1 day' where id=$1", [old]);
  await db.query('select save_voice_lounge_relationship($1,$2,$3,0,$4::jsonb,null)', [users[0], 'auditor', current, JSON.stringify(relationship(15))]);
  await db.query("insert into voice_lounge_memories(user_id,character_id,kind,summary,importance,source_room) values($1,'auditor','preference','커피를 좋아한다',0.8,$2)", [users[0], old]);
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(followUp);
  await db.exec(followUp);
  await db.exec(historyMigration);
  await db.exec(historyMigration);
  assert.equal(await create('auditor'), current, 'every entry point reuses the canonical chat');
  assert.equal((await one('select room_id from voice_lounge_relationships where user_id=$1', [users[0]])).room_id, current);
  assert.equal((await one('select source_room from voice_lounge_memories where user_id=$1', [users[0]])).source_room, current);
  await db.query("update voice_lounge_rooms set ai_turns=500,status='active',expires_at=now()+interval '1 hour',last_ai_at=null,ai_ticket_at=null where id=$1", [current]);
  assert.equal((await one('select resume_lounge_chat($1) id', [old])).id, current, 'historical URLs resume the continuing chat');
  assert.ok((await one("select claim_voice_lounge_host($1,'opening') ticket", [current])).ticket, 'no turn limit or rollover for a companion');
  const other = await create('velvet');
  assert.notEqual(other, current);
  assert.equal((await one('select count(*)::int n from list_my_lounge_chats()')).n, 2);
  await assert.rejects(db.query("select start_lounge_scenario('auditor-vip-match','나',null,true)"), /기존 채팅을 삭제/);
  assert.equal((await one("select start_lounge_scenario('auditor-vip-match','나',null,false) id")).id, current);
  // The app (PostgREST) calls it by name with only these two arguments; a second overload made that call ambiguous.
  assert.equal((await one("select start_lounge_scenario(p_scenario => 'auditor-vip-match', p_nickname => '나') id")).id, current);
  assert.equal((await one("select count(*)::int n from pg_proc where proname='start_lounge_scenario'")).n, 1, 'one overload only');
  assert.equal((await one('select count(*)::int n from voice_lounge_rooms where companion_chat and host_id=$1 and host_persona=$2', [users[0], 'auditor'])).n, 1);
  // Pending jobs appear in the same transaction as each saved reply. Claimed turn gaps are allowed.
  for (const turn of [502, 504]) {
    await db.query('update voice_lounge_rooms set ai_turns=$2 where id=$1', [current, turn]);
    await db.query("insert into voice_lounge_messages(room_id,nickname,kind,text) values($1,'나','human','약속해요')", [current]);
    await db.query("insert into voice_lounge_messages(room_id,nickname,kind,text) values($1,'AI','host','약속하죠')", [current]);
  }
  const prepare = (turn, payload, ready) => one('select prepare_voice_lounge_turn($1,$2,$3,$4,$5::jsonb,$6) ok', [users[0], 'auditor', current, turn, JSON.stringify(payload), ready]);
  const commit = (turn, rv, sv, n, state = {}) => one('select commit_voice_lounge_turn($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb) status',
    [users[0], 'auditor', current, turn, rv, sv, JSON.stringify(relationship(n)), '{}', JSON.stringify({ room_id: current, source_turn: turn, ...state }), `요약 ${turn}`, '[]']);
  await prepare(504, { answer: { memory: '나중 턴' } }, true);
  assert.equal((await commit(504, 1, 0, 17)).status, 'blocked');
  await prepare(502, { answer: { memory: '먼저 턴' } }, true);
  assert.equal((await commit(502, 1, 0, 16, { room_memory: [{ id: 'a', kind: 'agreement', summary: '서로 반말', status: 'active' }] })).status, 'saved');
  assert.equal((await commit(502, 1, 0, 99)).status, 'applied', 'retries do not apply events twice');
  assert.equal((await commit(504, 1, 0, 17)).status, 'conflict');
  assert.equal((await commit(504, 2, 1, 17)).status, 'saved');
  assert.equal((await one('select memory from voice_lounge_rooms where id=$1', [current])).memory, '요약 504');
  assert.equal((await one('select processed_turn from voice_lounge_companion_state where room_id=$1', [current])).processed_turn, 504);
  // A turn whose update keeps failing is closed after three tries and no longer holds back the turns after it.
  await db.query('update voice_lounge_rooms set ai_turns=506 where id=$1', [current]);
  await db.query("insert into voice_lounge_messages(room_id,nickname,kind,text) values($1,'나','human','그건 어땠어요')", [current]);
  await db.query("insert into voice_lounge_messages(room_id,nickname,kind,text) values($1,'AI','host','괜찮았어요')", [current]);
  const fail = turn => one('select fail_voice_lounge_turn($1,$2,$3,$4) outcome', [users[0], 'auditor', current, turn]);
  assert.equal((await fail(506)).outcome, 'retry');
  assert.equal((await fail(506)).outcome, 'retry');
  assert.equal((await fail(506)).outcome, 'skipped');
  assert.equal((await fail(506)).outcome, 'missing', 'a closed turn is not failed again');
  assert.equal((await one("select status from voice_lounge_turn_updates where room_id=$1 and turn=506", [current])).status, 'applied');
  await db.query('update voice_lounge_rooms set ai_turns=508 where id=$1', [current]);
  await db.query("insert into voice_lounge_messages(room_id,nickname,kind,text) values($1,'나','human','다음에 또 봐요')", [current]);
  await db.query("insert into voice_lounge_messages(room_id,nickname,kind,text) values($1,'AI','host','그래요')", [current]);
  await prepare(508, { answer: { memory: '이후 턴' } }, true);
  const versions = { r: (await one("select version from voice_lounge_relationships where user_id=$1 and character_id='auditor'", [users[0]])).version, s: (await one('select version from voice_lounge_companion_state where room_id=$1', [current])).version };
  assert.equal((await commit(508, versions.r, versions.s, 18)).status, 'saved', 'a skipped turn does not block the next one');
  // The hourly cleanup removes old ordinary rooms and never the continuing chat, however long it was left alone.
  const ordinary = (await one("select create_voice_lounge('auditor','대화',3,'나') id")).id;
  await db.query("update voice_lounge_rooms set expires_at=now()-interval '90 days' where id in($1,$2)", [current, ordinary]);
  await db.query('select cleanup_voice_lounges()');
  assert.equal((await one('select count(*)::int n from voice_lounge_rooms where id=$1', [current])).n, 1, 'the continuing chat is kept');
  assert.equal((await one('select count(*)::int n from voice_lounge_rooms where id=$1', [ordinary])).n, 0, 'an ordinary old room is cleaned');
  assert.equal((await one("select count(*)::int n from voice_lounge_relationships where user_id=$1 and character_id='auditor'", [users[0]])).n, 1, 'its relationship stays');
  // Foreign members cannot remove a chat, nor invoke private persistence RPCs.
  await as(users[1]);
  assert.equal((await one('select delete_lounge_chat($1) ok', [current])).ok, false);
  assert.equal((await one("select has_function_privilege('authenticated','public.commit_voice_lounge_turn(uuid,text,text,integer,integer,integer,jsonb,jsonb,jsonb,text,jsonb)','EXECUTE') ok")).ok, false);
  assert.equal((await one("select has_table_privilege('authenticated','voice_lounge_turn_updates','SELECT') ok")).ok, false);
  await as(users[0]);
  // The record of a chat reads back through the member's earlier rooms with the same character, newest first, and only for the owner.
  await db.query("insert into voice_lounge_messages(room_id,nickname,kind,text) values($1,'나','human','예전 방의 말')", [old]);
  const history = (await db.query('select * from get_my_lounge_history($1, null, 100)', [current])).rows;
  assert.ok(history.some(row => row.room_id === old && row.text === '예전 방의 말'), 'an earlier room of the same chat is included');
  assert.ok(history.every((row, index) => index === 0 || Number(history[index - 1].id) > Number(row.id)), 'newest first');
  const oldestId = history.at(-1).id;
  assert.equal((await db.query('select * from get_my_lounge_history($1, $2, 100)', [current, oldestId])).rows.length, 0, 'nothing is left before the oldest');
  assert.equal((await db.query('select * from get_my_lounge_history($1, null, 2)', [current])).rows.length, 2, 'the page size is respected');
  assert.ok(!history.some(row => row.room_id === other), 'another character is not mixed in');
  await as(users[1]);
  await assert.rejects(db.query('select * from get_my_lounge_history($1, null, 10)', [current]), /볼 수 없는 대화/);
  await as(users[0]);
  // Deletion removes current and old duplicate rooms and all persisted context.
  assert.equal((await one('select delete_lounge_chat($1) ok', [current])).ok, true);
  for (const table of ['voice_lounge_relationships', 'voice_lounge_memories', 'voice_lounge_companion_state', 'voice_lounge_relationship_milestones']) {
    assert.equal((await one(`select count(*)::int n from ${table} where user_id=$1 and character_id='auditor'`, [users[0]])).n, 0, table);
  }
  assert.equal((await one('select count(*)::int n from voice_lounge_turn_updates where room_id=$1', [current])).n, 0);
  assert.equal((await commit(504, 3, 2, 99)).status, 'missing', 'late jobs cannot resurrect a deleted relationship');
  assert.equal((await one('select count(*)::int n from voice_lounge_rooms where id=$1', [other])).n, 1);
  const fresh = await create('auditor');
  assert.notEqual(fresh, current);
  await assert.rejects(db.query('insert into voice_lounge_companion_state(user_id,character_id,state) values($1,$2,$3::jsonb)',
    [users[0], 'auditor', JSON.stringify({ room_id: current })]), /stale companion room/, 'legacy late upserts cannot attach old state to the new room');
  assert.equal((await one("select count(*)::int n from voice_lounge_relationships where user_id=$1 and character_id='auditor'", [users[0]])).n, 0);
  // Direct retention/admin deletion has the same lifecycle, even for manually added memories.
  await db.query("select add_my_lounge_memory('auditor','preference','차를 좋아한다',null)");
  await db.query('delete from voice_lounge_rooms where id=$1', [fresh]);
  assert.equal((await one("select count(*)::int n from voice_lounge_memories where user_id=$1 and character_id='auditor'", [users[0]])).n, 0);
  // Expression migration is idempotent and only private text replies get the expanded budget.
  const expression = await readFile('supabase/migrations/20261219000000_lounge_companion_expression.sql', 'utf8');
  await db.exec(expression); await db.exec(expression);
  const expanded = await create('auditor');
  const ticketFor = async room => (await one("update voice_lounge_rooms set status='active',expires_at=now()+interval '1 hour',ai_ticket=gen_random_uuid(),ai_ticket_at=now(),ai_turns=ai_turns+1,ai_host_reason='followup' where id=$1 returning ai_ticket ticket", [room])).ticket;
  await db.query('update voice_lounge_rooms set voice_on=false where id=$1', [expanded]);
  let expandedTicket = await ticketFor(expanded);
  assert.equal((await one('select finish_voice_lounge_reply($1,$2,$3) ok', [expanded, expandedTicket, '가'.repeat(3000)])).ok, true);
  expandedTicket = await ticketFor(expanded);
  assert.equal((await one('select finish_voice_lounge_host($1,$2,$3,$4) ok', [expanded, expandedTicket, '나'.repeat(3000), '긴 장면의 요약'])).ok, true);
  expandedTicket = await ticketFor(expanded);
  await assert.rejects(db.query('select finish_voice_lounge_reply($1,$2,$3)', [expanded, expandedTicket, '가'.repeat(3001)]), /invalid host response/);
  await assert.rejects(db.query("insert into voice_lounge_messages(room_id,nickname,kind,text) values($1,'나','human',$2)", [expanded, '가'.repeat(1201)]), /check constraint/);
  await db.query('update voice_lounge_rooms set voice_on=true where id=$1', [expanded]);
  expandedTicket = await ticketFor(expanded);
  await assert.rejects(db.query('select finish_voice_lounge_reply($1,$2,$3)', [expanded, expandedTicket, '가'.repeat(2000)]), /invalid host response/);
  const groupRoom = (await one("select create_voice_lounge('auditor','대화',3,'나') id")).id;
  await db.query('update voice_lounge_rooms set voice_on=false where id=$1', [groupRoom]);
  const groupTicket = await ticketFor(groupRoom);
  await assert.rejects(db.query('select finish_voice_lounge_reply($1,$2,$3)', [groupRoom, groupTicket, '가'.repeat(2000)]), /invalid host response/);
  const previousScenario = await one("select hook,prologue,relationship,place from lounge_scenarios where id='auditor-vip-match'");
  assert.ok(previousScenario);
  const otherStories = (await db.query("select id,hook,prologue,relationship,place from lounge_scenarios where character_id<>'auditor' order by id")).rows;
  await db.query('update voice_lounge_rooms set scenario=$2 where id=$1', [expanded, { id: 'auditor-vip-match', ...previousScenario }]);
  const personaMigration = await readFile('supabase/migrations/20261220000000_lounge_dohyun_casanova.sql', 'utf8');
  await db.exec(personaMigration); await db.exec(personaMigration);
  const newScenario = await one("select hook,prologue,relationship,place from lounge_scenarios where id='auditor-vip-match'");
  assert.match(newScenario.relationship, /연애에 능숙한/);
  assert.match(newScenario.prologue, /넥타이는 오다가 풀었어요/);
  assert.equal(newScenario.prologue.length <= 12000, true);
  assert.deepEqual((await one('select scenario from voice_lounge_rooms where id=$1', [expanded])).scenario, { id: 'auditor-vip-match', ...previousScenario });
  assert.deepEqual((await db.query("select id,hook,prologue,relationship,place from lounge_scenarios where character_id<>'auditor' order by id")).rows, otherStories);
  const searchMigration = await readFile('supabase/migrations/20261221000000_lounge_scene_search.sql', 'utf8');
  await db.exec(searchMigration); await db.exec(searchMigration);
  await db.exec("insert into lounge_scene_backgrounds(description,image_path,uses) select '일반 배경 '||n,'scenes/test-'||n||'.webp',1000 from generate_series(1,450) n");
  const rareScene = await one("insert into lounge_scene_backgrounds(name,description,image_path,tags) values('산악회버스','아침의 버스 안 뒷자리','scenes/rare-bus.webp',array['산악회','버스','아침']) returning id");
  assert.equal((await one("select * from search_lounge_scene_backgrounds('산악회 버스',1)")).id, rareScene.id, 'indexed relevance can find a scene below the first 400 popular rows');
  await db.query("update lounge_scene_backgrounds set name=null,tags=array['밤','텐트'] where id=$1", [rareScene.id]);
  assert.equal((await one("select * from search_lounge_scene_backgrounds('텐트',1)")).id, rareScene.id);
  assert.equal((await one("select * from search_lounge_scene_backgrounds('밤',1)")).id, rareScene.id);
  assert.equal((await db.query("select * from search_lounge_scene_backgrounds('',999)")).rows.length, 60);
  const customId = 'c_ba586cab127802ac2eddebf308c507e0';
  await db.query("insert into lounge_custom_characters(id,owner_id,name,sheet,portrait_path,template,flirtation,voice,theme) values($1,$2,'강혜인',$3,$4,'slow_burn',true,'low_female','forest')", [customId, users[0], { prologue: '버스 앞에서 기다리던 옛 프롤로그입니다. 서로 커피를 건넵니다.', tastes: '등산', userRole: '후미 대장' }, `${customId}/portrait.webp`]);
  const starts = await readFile('supabase/migrations/20261222000000_lounge_arrived_story_starts.sql', 'utf8');
  await db.exec(starts); await db.exec(starts);
  const negotiation = await readFile('supabase/migrations/20261223000000_lounge_closer_negotiation_start.sql', 'utf8');
  await db.exec(negotiation); await db.exec(negotiation);
  const closerStart = await one("select place,relationship,prologue,theme from lounge_scenarios where id='closer-contract-love'");
  assert.match(closerStart.place, /회의실/);
  assert.match(closerStart.relationship, /아직 합의하지 않았다/);
  assert.match(closerStart.prologue, /서명은 조건부터 맞춘 뒤/);
  assert.equal(closerStart.theme, 'boardroom');
  assert.match((await one("select place from lounge_scenarios where id='auditor-vip-match'")).place, /식사 테이블/);
  assert.equal((await one('select sheet from lounge_custom_characters where id=$1', [customId])).sheet.tastes, '등산');
  const customRoom = (await one("select start_lounge_custom_chat($1,'가상 사용자') id", [customId])).id;
  assert.match((await one('select scenario from voice_lounge_rooms where id=$1', [customRoom])).scenario.place, /버스 안/);
  assert.deepEqual((await one('select scenario from voice_lounge_rooms where id=$1', [expanded])).scenario, { id: 'auditor-vip-match', ...previousScenario });
  console.log('PASS: canonical state, indexed shared backgrounds, arrived story starts and existing-room preservation.');
} catch (error) { console.error(error.stack); process.exitCode = 1; }
finally { await db.close(); }
