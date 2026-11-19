// Isolated PostgreSQL; no production database or paid model requests. Every lounge migration in order, then the message
// actions of 20270107000000: going back to before a message restores what the character knew then, and a message's voice is
// kept and counted once.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const users = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const as = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
const relationship = n => ({ scores: { trust: n }, stage: 'FIRST_MEETING', pending: { direction: null, turns: 0 }, recentEvents: [], memories: [], meaningfulTurns: n, turnCount: n, lastInteractionAt: '2026-11-06T00:00:00Z' });
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,created_at timestamptz DEFAULT now(),email text,is_anonymous boolean DEFAULT false,raw_user_meta_data jsonb DEFAULT '{}'::jsonb); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'authenticated' $$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid);
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name,'/') $$;
    CREATE TABLE public.users(id uuid PRIMARY KEY,email text,nickname text,provider text);`);
  // Story data that needs characters registered by the installer is not what this checks; every other migration must apply.
  const storyData = /_(shaman_consult|velvet_cocktail_bar|teacher_winebar|poker_interpreter_prologue)\.sql$/;
  for (const file of (await readdir('supabase/migrations')).sort().filter(name => name.includes('lounge'))) {
    try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')); }
    catch (error) { await db.exec('ROLLBACK').catch(() => {}); if (!storyData.test(file)) throw new Error(`${file}: ${error.message}`); }
  }
  const actions = await readFile('supabase/migrations/20270107000000_lounge_message_actions.sql', 'utf8');
  await db.exec(actions); // applies twice without harm
  for (const id of users) {
    await db.query('insert into auth.users(id) values($1)', [id]);
    await db.query("insert into public.users(id,nickname,gender,age_group) values($1,'나','male','30s')", [id]);
  }
  await as(users[0]);
  const room = (await one("select create_voice_lounge('auditor','대화',1,'나','forest') id")).id;
  assert.equal((await one('select companion_chat from voice_lounge_rooms where id=$1', [room])).companion_chat, true);
  await db.query("update voice_lounge_rooms set status='active',expires_at=now()+interval '1 hour',voice_on=false where id=$1", [room]);
  const say = async (kind, text) => Number((await one("insert into voice_lounge_messages(room_id,nickname,kind,text) values($1,$2,$3,$4) returning id", [room, kind === 'host' ? 'AI' : '나', kind, text])).id);
  const versions = async () => ({
    r: (await one("select version from voice_lounge_relationships where user_id=$1 and character_id='auditor'", [users[0]]))?.version ?? 0,
    s: (await one("select version from voice_lounge_companion_state where user_id=$1 and character_id='auditor'", [users[0]]))?.version ?? 0,
  });
  const turn = async (n, said, replies) => {
    await db.query('update voice_lounge_rooms set ai_turns=$2 where id=$1', [room, n]);
    const ids = { human: await say('human', said), host: [] };
    for (const reply of replies) ids.host.push(await say('host', reply));
    assert.equal((await one('select prepare_voice_lounge_turn($1,$2,$3,$4,$5::jsonb,true) ok', [users[0], 'auditor', room, n, JSON.stringify({ answer: { memory: `요약 ${n}` } })])).ok, true);
    const v = await versions();
    const saved = await one('select commit_voice_lounge_turn($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb) status',
      [users[0], 'auditor', room, n, v.r, v.s, JSON.stringify(relationship(n)), JSON.stringify({ mood: n }), JSON.stringify({ room_id: room, source_turn: n, tag: `t${n}` }), `요약 ${n}`, '[]']);
    assert.equal(saved.status, 'saved', `turn ${n} commits`);
    return ids;
  };
  const t1 = await turn(1, '안녕하세요', ['반가워요']);
  const kept = (await one("insert into voice_lounge_memories(user_id,character_id,kind,summary,importance,source_room,embedding) values($1,'auditor','preference','커피를 좋아한다',0.8,$2,array[0.1,0.2]::real[]) returning id", [users[0], room])).id;
  const t2 = await turn(2, '커피 좋아하세요?', ['좋아해요.', '특히 아침에요.']);
  assert.equal(Number((await one('select message_id from voice_lounge_turn_updates where room_id=$1 and turn=2', [room])).message_id), t2.host[0], 'a turn knows the message its reply starts at');
  // What turn 2 changed after its snapshot: a new memory, and the earlier one rewritten.
  await db.query("insert into voice_lounge_memories(user_id,character_id,kind,summary,importance,source_room) values($1,'auditor','event','아침 커피 약속',0.7,$2)", [users[0], room]);
  await db.query("update voice_lounge_memories set summary='커피를 아주 좋아한다',mention_count=2 where id=$1", [kept]);
  const t3 = await turn(3, '내일 봐요', ['그래요']);
  assert.equal((await one('select memory from voice_lounge_rooms where id=$1', [room])).memory, '요약 3');
  assert.equal((await one('select count(*)::int n from voice_lounge_turn_snapshots where room_id=$1', [room])).n, 3);

  // A voice for a message: kept and counted once, however many times it is asked for.
  const voice = (message, seconds) => one('select record_lounge_message_voice($1,$2,$3,$4,$5,$6) v', [users[0], room, message, `${users[0]}/${room}/${message}.mp3`, '그래요', seconds]);
  assert.equal((await voice(t3.host[0], 4.5)).v.fresh, true);
  const again = (await voice(t3.host[0], 9)).v;
  assert.equal(again.fresh, false, 'the same message is not counted twice');
  assert.equal(Number(again.used), 4.5);
  assert.equal((await voice(t3.human, 3)).v, null, 'only a reply of the character has a voice');
  assert.equal(Number((await one('select lounge_message_voice_status($1) s', [users[0]])).s.seconds), 4.5);

  // Busy while a reply is still being recorded.
  await db.query("update voice_lounge_turn_updates set status='ready',updated_at=now() where room_id=$1 and turn=3", [room]);
  const rewind = (message, user = users[0], consult = false) => one('select rewind_voice_lounge_chat($1,$2,$3,$4) r', [user, room, message, consult]).then(row => row.r);
  assert.equal((await rewind(t2.host[1])).state, 'busy');
  await db.query("update voice_lounge_turn_updates set status='applied',updated_at=now()-interval '5 minutes' where room_id=$1 and turn=3", [room]);
  assert.equal((await rewind(t2.host[1], users[1])).state, 'denied', 'only the chat\'s own member');

  // Back to before the second part of turn 2's reply: the whole reply goes, and the character knows only turn 1.
  const done = await rewind(t2.host[1]);
  assert.equal(done.state, 'done');
  assert.equal(Number(done.from), t2.host[0], 'a split reply goes back from its first message');
  assert.equal(done.removed, 4);
  assert.deepEqual(done.voices, [`${users[0]}/${room}/${t3.host[0]}.mp3`], 'the voices of removed messages are handed back to be deleted');
  assert.deepEqual((await db.query('select id from voice_lounge_messages where room_id=$1 order by id', [room])).rows.map(row => Number(row.id)), [t1.human, t1.host[0], t2.human]);
  const after = await one('select memory,memory_turn,ai_turns,ai_mood from voice_lounge_rooms where id=$1', [room]);
  assert.equal(after.memory, '요약 1'); assert.equal(after.memory_turn, 1); assert.equal(after.ai_turns, 1);
  assert.deepEqual(after.ai_mood, { mood: 1 });
  const relation = await one("select turn_count,version from voice_lounge_relationships where user_id=$1 and character_id='auditor'", [users[0]]);
  assert.equal(relation.turn_count, 1, 'the relationship is as it was after turn 1');
  const companion = await one("select state,version,processed_turn from voice_lounge_companion_state where user_id=$1 and character_id='auditor'", [users[0]]);
  assert.equal(companion.state.tag, 't1'); assert.equal(companion.processed_turn, 1);
  assert.ok(companion.version > 3, 'versions move on, so a late commit of a removed turn conflicts');
  const memories = (await db.query("select summary,mention_count,embedding from voice_lounge_memories where user_id=$1 and character_id='auditor' order by created_at", [users[0]])).rows;
  assert.equal(memories.length, 1, 'the memory made after the turn is gone');
  assert.equal(memories[0].summary, '커피를 좋아한다'); assert.equal(memories[0].mention_count, 1); assert.equal(memories[0].embedding, null, 'a restored memory is embedded again');
  assert.equal((await one('select count(*)::int n from voice_lounge_turn_updates where room_id=$1 and turn>=2', [room])).n, 0);
  assert.equal((await one('select count(*)::int n from voice_lounge_turn_snapshots where room_id=$1 and turn>=2', [room])).n, 0);
  assert.equal((await one('select count(*)::int n from lounge_message_voices where room_id=$1', [room])).n, 0);
  assert.equal(Number((await one('select lounge_message_voice_status($1) s', [users[0]])).s.seconds), 4.5, 'a removed voice stays counted');
  assert.equal((await one('select commit_voice_lounge_turn($1,$2,$3,3,1,1,null,null,null,$4,null) status', [users[0], 'auditor', room, '늦은 턴'])).status, 'missing', 'a removed turn cannot come back');

  // The next reply takes the removed turn's number again.
  const ticket = (await one("select claim_voice_lounge_host($1,'followup') t", [room])).t;
  assert.ok(ticket, 'the character can answer at once');
  assert.equal((await one('select ai_turns from voice_lounge_rooms where id=$1', [room])).ai_turns, 2);
  assert.equal((await one('select finish_voice_lounge_reply($1,$2,$3) ok', [room, ticket, '좋아해요, 커피.'])).ok, true);
  assert.equal((await one('select turn from voice_lounge_turn_updates where room_id=$1 and reply=$2', [room, '좋아해요, 커피.'])).turn, 2);
  assert.equal((await rewind(t2.human)).state, 'busy', 'not while the new reply is being recorded');
  await db.query("update voice_lounge_turn_updates set status='applied',updated_at=now()-interval '5 minutes' where room_id=$1", [room]);

  // Only the last 10 messages can be gone back to.
  for (let n = 0; n < 6; n++) { await say('human', `말 ${n}`); await say('host', `답 ${n}`); }
  assert.equal((await rewind(t1.human)).state, 'denied');
  assert.equal((await one("select has_function_privilege('authenticated','public.rewind_voice_lounge_chat(uuid,text,bigint,boolean)','EXECUTE') ok")).ok, false);
  assert.equal((await one("select has_function_privilege('authenticated','public.record_lounge_message_voice(uuid,text,bigint,text,text,numeric)','EXECUTE') ok")).ok, false);
  console.log('PASS: going back restores what the character knew, split replies go whole, voices count once.');
} catch (error) { console.error(error.stack); process.exitCode = 1; }
finally { await db.close(); }
