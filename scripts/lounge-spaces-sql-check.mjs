// Isolated PostgreSQL only; never connects to a production database or paid APIs.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const ids = Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const [u1, u2, u3, u4, u5, u6, u7, u8, u9, u10] = ids;
const nick = user => `손님${ids.indexOf(user)+1}`;
const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
const as = async id => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id ?? '']);
const open = async (user, space = 'hotel-bar') => { await as(user); return (await one('select open_voice_lounge_table($1,$2) as id',[space,nick(user)])).id; };
const sit = async (user, id) => { await as(user); return (await one('select enter_voice_lounge_table($1,$2) as id',[id,nick(user)])).id; };
const wait = async (user, space = 'hotel-bar') => { await as(user); return (await one('select wait_voice_lounge_space($1) as w',[space])).w; };
const spaceRow = async (space = 'hotel-bar') => { await as(null); return (await db.query('select * from list_voice_lounge_spaces()')).rows.find(row => row.id === space); };
const room = id => one('select * from voice_lounge_rooms where id=$1',[id]);
const broadcaster = async (id, user) => { await as(user); return (await one('select claim_voice_lounge_broadcaster($1) as b',[id])).b; };
const claim = async (id, user, reason) => { await as(user); return (await one('select claim_voice_lounge_host($1,$2) as t',[id,reason])).t; };
const finish = async (id, user, ticket) => { await as(user); return (await one("select finish_voice_lounge_host($1,$2,'어서 와요.','') as ok",[id,ticket])).ok; };
const cooldown = id => db.query("update voice_lounge_rooms set last_ai_at=now()-interval '200 seconds',ai_ticket=NULL,ai_ticket_at=NULL where id=$1",[id]);
const control = async (id, user, action) => { await as(user); return db.query('select control_voice_lounge($1,$2)',[id,action]); };
const state = JSON.stringify({ scores: { trust: 10, respect: 20, interest: 40, comfort: 15, openness: 10, intrigue: 35, poise: 50 }, stage: 'DISMISSIVE', pending: { direction: null, turns: 0 }, recentEvents: [], memories: [], turnCount: 1, meaningfulTurns: 0, lastInteractionAt: new Date().toISOString() });
const saveRelationship = (id, user, version = 0) => one("select save_voice_lounge_relationship($1,'velvet',$2,$3,$4::jsonb,'{}'::jsonb) as v",[user,id,version,state]);
const memoryOps = (id, user) => one("select apply_voice_lounge_memory_ops($1,'velvet',$2,'[]'::jsonb) as n",[user,id]);
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;`);
  for (const file of (await readdir('supabase/migrations')).filter(file => file.includes('voice_lounge')).sort()) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
  for (const id of ids) await db.query('insert into auth.users values($1)',[id]);

  // The house is public: one space per character, nobody inside yet, a seat free everywhere.
  await as(null);
  const spaces = (await db.query('select * from list_voice_lounge_spaces()')).rows;
  assert.deepEqual(spaces.map(s => s.host_persona), ['jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer']);
  assert.ok(spaces.every(s => s.present_count === 0 && s.table_count === 0 && s.seat_free && s.participants.length === 0 && s.waiting === 0));

  // The first visitor opens the space's table: active at once, no start, no owner.
  const t1 = await open(u1);
  let r = await room(t1);
  assert.equal(r.status,'active'); assert.equal(r.space_id,'hotel-bar'); assert.equal(r.table_no,1); assert.equal(r.host_persona,'velvet'); assert.equal(r.topic_source,null);
  let row = await spaceRow(); assert.equal(row.present_count,1); assert.equal(row.table_count,1); assert.deepEqual(row.participants,['손님1']); assert.equal(row.topic,null); assert.equal(row.seat_free,true);
  await as(u1); await assert.rejects(db.query("select control_voice_lounge($1,'start')",[t1]),/시작/);

  // Alone: the visitor drives the AI, which answers each turn; the relationship is saved. Long-term memory is solo play only.
  assert.equal(await broadcaster(t1,u1),u1);
  const greet = await claim(t1,u1,'opening'); assert.ok(greet); assert.equal(await finish(t1,u1,greet),true);
  await cooldown(t1); assert.ok(await claim(t1,u1,'followup'),'one person gets one-to-one replies');
  await cooldown(t1);
  assert.equal((await saveRelationship(t1,u1)).v,1);
  assert.equal((await memoryOps(t1,u1)).n,null,'a space table never records memory, even with one person');

  // The next visitor sees the table (its people), cannot open a second table while a seat is free, and sits down.
  await as(u2); const tables = (await db.query("select * from list_voice_lounge_space_tables('hotel-bar')")).rows;
  assert.equal(tables.length,1); assert.deepEqual(tables[0].participants,['손님1']); assert.equal(tables[0].mine,false); assert.equal(Object.hasOwn(tables[0],'table_no'),false);
  await assert.rejects(open(u2),/빈자리가 있는 테이블/);
  assert.equal(await sit(u2,t1),t1);
  assert.equal(await broadcaster(t1,u2),u1,'the lease stays with its holder');
  assert.equal(await claim(t1,u2,'opening'),null,'only the browser driving the AI claims turns');
  assert.equal(await claim(t1,u1,'followup'),null,'two people: no reply to every turn');
  assert.equal(await claim(t1,u1,'requested'),null,'help needs a request');
  await as(u2); await db.query("select request_voice_lounge_moderator($1,'topic')",[t1]);
  const help = await claim(t1,u1,'requested'); assert.ok(help); assert.equal(await finish(t1,u1,help),true); await cooldown(t1);

  // Together: relationships keep building for everyone at the table; long-term memory waits until someone is alone.
  assert.equal((await saveRelationship(t1,u2)).v,1,'a relationship builds in a group too');
  assert.equal((await saveRelationship(t1,u1,1)).v,2);
  assert.equal((await memoryOps(t1,u1)).n,null,'no memory writes with other people present either');
  assert.equal((await saveRelationship(t1,u3)).v,null,'not for someone who is not at the table');
  assert.equal((await one("select save_voice_lounge_relationship($1,'ina',$2,0,$3::jsonb,'{}'::jsonb) as v",[u2,t1,state])).v,null,'only with this space\'s character');

  // The safety review of each utterance also reports the character and whether people are together.
  await as(u2); await db.query("select post_voice_lounge_message($1,'안녕하세요, 처음 왔어요')",[t1]);
  const message = (await one("select id from voice_lounge_messages where room_id=$1 and kind='human' order by id desc limit 1",[t1])).id;
  await as(u1); const review = (await one('select claim_voice_lounge_interaction($1,$2,$3) as c',[t1,u1,message])).c;
  assert.ok(review); assert.equal(review.host_persona,'velvet'); assert.equal(review.group,true); assert.equal(review.speaker_id,u2);

  // The lease moves when its holder goes quiet, never to a restricted person.
  await db.query("update voice_lounge_rooms set broadcaster_seen_at=now()-interval '13 seconds' where id=$1",[t1]);
  await db.query("update voice_lounge_members set speaking_restricted_until=now()+interval '1 minute' where room_id=$1 and user_id=$2",[t1,u2]);
  assert.equal(await broadcaster(t1,u2),u1);
  await db.query('update voice_lounge_members set speaking_restricted_until=NULL where room_id=$1',[t1]);
  assert.equal(await broadcaster(t1,u2),u2);
  assert.equal(await claim(t1,u1,'requested'),null,'the previous holder no longer claims turns');

  // Nobody owns the table: leaving never ends it for others; the last one out closes it.
  await control(t1,u2,'leave');
  r = await room(t1); assert.equal(r.status,'active'); assert.equal(r.broadcaster_id,null);
  await as(u1); await assert.rejects(db.query("select control_voice_lounge($1,'end')",[t1]),/방장만/);
  await control(t1,u1,'leave');
  assert.equal((await room(t1)).status,'ended');

  // A full table: the next people wait in line (first come, first seated) or open another table.
  const t = await open(u1);
  for (const user of [u2,u3,u4,u5,u6]) await sit(user,t);
  await assert.rejects(sit(u7,t),/가득 찼어요/);
  row = await spaceRow(); assert.equal(row.seat_free,false); assert.equal(row.participants.length,6);
  let w8 = await wait(u8); assert.equal(w8.ahead,0); assert.equal(w8.room,null);
  let w7 = await wait(u7); assert.equal(w7.ahead,1); assert.equal(w7.room,null);
  assert.equal((await spaceRow()).waiting,2);
  await control(t,u5,'leave');
  w7 = await wait(u7); assert.equal(w7.room,null,'the one seat goes to the first in line');
  w8 = await wait(u8); assert.equal(w8.room,t);
  await assert.rejects(sit(u9,t),/기다리는 분이 먼저/,'someone not in line cannot take a waiter\'s seat');
  await assert.rejects(sit(u7,t),/기다리는 분이 먼저/);
  assert.equal(await sit(u8,t),t);
  assert.equal((await one('select count(*)::int as n from voice_lounge_waitlist where user_id=$1',[u8])).n,0,'seated waiters leave the line');
  // u7 stops waiting and opens a new table; then a seat elsewhere means no third table.
  const t2 = await open(u7); assert.notEqual(t2,t); assert.equal((await room(t2)).table_no,2);
  assert.equal((await one('select count(*)::int as n from voice_lounge_waitlist where user_id=$1',[u7])).n,0);
  await assert.rejects(open(u9),/빈자리가 있는 테이블/);
  assert.equal(await sit(u9,t2),t2);
  row = await spaceRow(); assert.equal(row.table_count,2); assert.equal(row.present_count,8); assert.equal(row.seat_free,true);
  // A waiter who stops checking in loses the place in line.
  await db.query("insert into voice_lounge_waitlist(space_id,user_id,created_at,last_seen) values('hotel-bar',$1,now()-interval '3 minutes',now()-interval '2 minutes')",[u10]);
  assert.equal((await wait(u5)).ahead,0,'a stale waiter is not ahead of anyone');
  await as(u5); await db.query("select leave_voice_lounge_wait('hotel-bar')");

  // Coming back returns you to your table; moving to another space frees your seat; quiet tables close.
  assert.equal(await open(u3),t);
  const cafe = await open(u7,'rainy-cafe');
  assert.equal((await room(cafe)).host_persona,'trickster');
  assert.equal((await one('select active from voice_lounge_members where room_id=$1 and user_id=$2',[t2,u7])).active,false);
  await db.query("update voice_lounge_members set last_seen=now()-interval '11 minutes' where room_id=$1",[t]);
  await db.query("update voice_lounge_members set last_seen=now()-interval '11 minutes' where room_id=$1",[t2]);
  const fresh = await open(u10);
  assert.equal((await room(t)).status,'ended'); assert.equal((await room(fresh)).table_no,1);

  // Heartbeats keep a table open; an expired table ends.
  await db.query("update voice_lounge_rooms set expires_at=now()+interval '1 minute' where id=$1",[fresh]);
  await control(fresh,u10,'heartbeat'); assert.ok((await room(fresh)).expires_at > new Date(Date.now()+25*60_000));
  await db.query("update voice_lounge_rooms set expires_at=now()-interval '1 second' where id=$1",[fresh]);
  await control(fresh,u10,'heartbeat'); assert.equal((await room(fresh)).status,'ended');

  // Topics: anyone at the table, typed or picked from the character's suggestions; visible before sitting down.
  const tt = await open(u1,'forest-study'); await sit(u2,tt);
  await as(u2); await db.query("select set_voice_lounge_topic($1,'요즘 읽는 책','member')",[tt]);
  r = await room(tt); assert.equal(r.topic,'요즘 읽는 책'); assert.equal(r.topic_source,'member'); assert.equal(r.topic_set_by,'손님2');
  await as(u1); await assert.rejects(db.query("select set_voice_lounge_topic($1,'바로 또 바꾸기','member')",[tt]),/잠시 뒤에/);
  await db.query("update voice_lounge_rooms set topic_set_at=now()-interval '6 seconds' where id=$1",[tt]);
  await assert.rejects(db.query("select set_voice_lounge_topic($1,'추천받은 척','ai')",[tt]),/추천된 주제/);
  const suggest = (await one('select claim_voice_lounge_topic_suggestions($1) as c',[tt])).c;
  assert.ok(suggest.ticket); assert.equal(suggest.space_name,'숲속 서재'); assert.equal(suggest.topic,'요즘 읽는 책');
  await as(u2); assert.equal((await one('select claim_voice_lounge_topic_suggestions($1) as c',[tt])).c,null);
  await as(u1); assert.equal((await one("select finish_voice_lounge_topic_suggestions($1,$2,'[\" 근거 없는 확신 \",\"요즘 믿게 된 뉴스\"]'::jsonb) as ok",[tt,suggest.ticket])).ok,true);
  await as(u2); await db.query("select set_voice_lounge_topic($1,'요즘 믿게 된 뉴스','ai')",[tt]);
  assert.equal((await spaceRow('forest-study')).topic,'요즘 믿게 된 뉴스');
  await as(u9); await assert.rejects(db.query("select set_voice_lounge_topic($1,'남의 테이블','member')",[tt]),/바꿀 수 없어요/);

  // Solo play: a private one-to-one with the space's character, continued if unfinished, not counted in the space.
  await as(u3); const duo = (await one("select start_voice_lounge_solo('hotel-bar',$1) as id",['민수'])).id;
  r = await room(duo); assert.equal(r.capacity,1); assert.equal(r.space_id,null); assert.equal(r.host_persona,'velvet'); assert.equal(r.status,'lobby'); assert.equal(r.study_required,false);
  assert.equal((await one("select start_voice_lounge_solo('hotel-bar',$1) as id",['민수'])).id,duo);
  await db.query("select control_voice_lounge($1,'start')",[duo]);
  assert.ok(await claim(duo,u3,'opening'));
  assert.equal((await memoryOps(duo,u3)).n,0,'solo play records long-term memory');
  await as(u4); await assert.rejects(db.query('select join_voice_lounge($1,$2)',[duo,'끼어들기']),/가득/);
  assert.equal((await spaceRow()).present_count,0);
  await control(duo,u3,'leave');
  await as(u3); assert.notEqual((await one("select start_voice_lounge_solo('hotel-bar',$1) as id",['민수'])).id,duo);

  // Rooms made the old way keep their rules.
  await as(u3); const legacy = (await one("select create_voice_lounge('ina','서로의 경험',4,'민수','river',false) as id")).id;
  await as(u4); await db.query('select join_voice_lounge($1,$2)',[legacy,'지우']);
  await as(u3); await db.query("select control_voice_lounge($1,'start')",[legacy]); await db.query("select control_voice_lounge_session($1,'tick')",[legacy]);
  assert.equal(await claim(legacy,u4,'opening'),null); assert.ok(await claim(legacy,u3,'opening'));
  assert.equal((await one("select save_voice_lounge_relationship($1,'ina',$2,0,$3::jsonb,'{}'::jsonb) as v",[u4,legacy,state])).v,null,'created group rooms still build no relationship');
  await as(null); const openList = (await db.query('select id from list_open_voice_lounges()')).rows.map(item => item.id);
  assert.ok(openList.includes(legacy)); assert.ok(!openList.includes(tt));
  await control(legacy,u3,'leave'); assert.equal((await room(legacy)).status,'ended');

  // Nobody reads the waiting line directly. Re-running keeps spaces (and edits to them) and tables.
  assert.deepEqual((await db.query("select privilege_type from information_schema.role_table_grants where table_name='voice_lounge_waitlist' and grantee in ('authenticated','anon')")).rows,[]);
  await db.query("update voice_lounge_spaces set host_persona='jaeseok' where id='hotel-bar'");
  // An earlier draft of this file left narrower list functions and automatic seating behind (as on the shared database).
  await db.exec(`DROP FUNCTION public.list_voice_lounge_spaces();
    CREATE FUNCTION public.list_voice_lounge_spaces() RETURNS TABLE(id text, name text, host_persona text, theme text, capacity integer, present_count integer)
      LANGUAGE sql STABLE AS $$ SELECT id,name,host_persona,theme,capacity,0 FROM public.voice_lounge_spaces $$;
    CREATE FUNCTION public.enter_voice_lounge_space(p_space text,p_nickname text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
    CREATE FUNCTION public.find_voice_lounge_company(p_room text) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;`);
  await db.exec(await readFile('supabase/migrations/20261009000000_voice_lounge_imagination_house_spaces.sql','utf8'));
  await as(null); assert.ok(Array.isArray((await db.query('select * from list_voice_lounge_spaces()')).rows[0].participants),'the list function is replaced with the current columns');
  assert.equal((await one("select count(*)::int as n from pg_proc where proname in ('enter_voice_lounge_space','find_voice_lounge_company')")).n,0,'the old automatic seating is gone');
  assert.equal((await one("select host_persona from voice_lounge_spaces where id='hotel-bar'")).host_persona,'jaeseok');
  assert.equal((await one('select count(*)::int as n from voice_lounge_spaces')).n,8);
  assert.equal((await room(tt)).status,'active');
  // The diplomat's and the lawyer's spaces have their own scenery; both a space table and solo play must open with it.
  const embassy = await open(u10, 'embassy-reception');
  assert.deepEqual([(await room(embassy)).host_persona, (await room(embassy)).theme, (await room(embassy)).status], ['diplomat','embassy','active']);
  await as(u10); const lawSolo = (await one("select start_voice_lounge_solo('law-library',$1) as id",['손님10'])).id;
  assert.deepEqual([(await room(lawSolo)).host_persona, (await room(lawSolo)).theme, (await room(lawSolo)).capacity], ['lawyer','lawlibrary',1]);
  await assert.rejects(db.query("select create_voice_lounge('lawyer','x',1,'손님10','moon')"), /지원하지 않는 라운지 테마/);
  // A database that already ran the earlier draft (other ids for the same two characters) must not list them twice:
  // an unused old space is deleted, one with a table is closed, and re-running changes nothing more.
  await db.exec(`INSERT INTO voice_lounge_spaces(id,name,host_persona,theme,sort) VALUES
    ('river-terrace','한강 야경 테라스','diplomat','river',7),('night-law-lounge','야간 법률 라운지','lawyer','rooftop',8)`);
  const oldTable = await open(u9, 'night-law-lounge');
  assert.equal((await room(oldTable)).space_id, 'night-law-lounge');
  const migration = await readFile('supabase/migrations/20261010000000_voice_lounge_diplomat_lawyer.sql', 'utf8');
  for (let run = 0; run < 2; run++) {
    await db.exec(migration);
    await as(null);
    const listed = (await db.query('select id, host_persona from list_voice_lounge_spaces()')).rows;
    assert.equal(listed.length, 8, 'eight spaces');
    for (const persona of ['diplomat', 'lawyer']) assert.equal(listed.filter(s => s.host_persona === persona).length, 1, `${persona} has one space`);
    assert.deepEqual(listed.filter(s => ['diplomat', 'lawyer'].includes(s.host_persona)).map(s => s.id), ['embassy-reception', 'law-library']);
    assert.equal((await one("select count(*)::int as n from voice_lounge_spaces where id='river-terrace'")).n, 0, 'the unused old space is removed');
    assert.equal((await one("select open from voice_lounge_spaces where id='night-law-lounge'")).open, false, 'an old space with a table is closed');
  }
  console.log('lounge spaces SQL check passed');
} finally { await db.close(); }
