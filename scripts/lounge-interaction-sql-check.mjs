// Isolated PostgreSQL validation. Install @electric-sql/pglite in a temporary
// cache and set LOUNGE_PGLITE_MODULE to its index.js file URL before running.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.LOUNGE_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002', c = '00000000-0000-4000-8000-000000000003';
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const as = async id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
const control = async (room, action, turn) => (await one('select to_jsonb(public.control_voice_lounge_session($1,$2,$3)) as s', [room, action, turn ?? null])).s;
const current = async room => (await one('select to_jsonb(s) as s from voice_lounge_sessions s where room_id=$1', [room])).s;
const decide = async (room, message, decision) => {
  const claim = (await one('select public.claim_voice_lounge_interaction($1,$2,$3) as value', [room, a, message])).value;
  assert.ok(claim);
  return (await one('select public.finish_voice_lounge_interaction($1,$2,$3,$4) as value', [room, message, claim.ticket, JSON.stringify(decision)])).value;
};
const message = async (room, speaker, turn, text = '소연님, 어떤 생각이 드세요?') => (await one("insert into voice_lounge_messages(room_id,user_id,nickname,kind,text,turn_id) values($1,$2,'테스트','human',$3,$4) returning id", [room, speaker, text, turn])).id;
const create = async () => {
  await as(a);
  const room = (await one("select create_voice_lounge('ina','책 이야기',3,'민수','river',false) as id")).id;
  for (const [id, nickname] of [[b, '소연'], [c, '지우']]) { await as(id); await db.query('select join_voice_lounge($1,$2)', [room, nickname]); }
  await as(a); await db.query("select control_voice_lounge($1,'start')", [room]);
  return { room, s: await control(room, 'tick') };
};
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;`);
  for (const file of (await readdir('supabase/migrations')).filter(file => file.includes('voice_lounge')).sort()) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
  // The migration is safe to reapply through SQL Editor.
  await db.exec(await readFile('supabase/migrations/20261003000000_voice_lounge_safety_and_questions.sql', 'utf8'));
  await db.query('insert into auth.users(id) values($1),($2),($3)', [a,b,c]);
  const allow = { moderation: 'allow', reason: 'none', target_id: b, question: '책의 어떤 문장이 기억에 남나요?' };
  const warn = { moderation: 'warn', reason: 'harassment', target_id: null, question: null };
  const severe = { ...warn, moderation: 'restrict', reason: 'threat' };
  {
    let { room, s } = await create(); s = await control(room,'begin',s.turn_id);
    const result = await decide(room,await message(room,a,s.turn_id),{...severe,reason:'harassment'});
    assert.equal(result.warnings,1);
    assert.ok(Date.parse(result.restricted_until)>Date.now()+240_000,'a severe personal attack restricts immediately on the first offense');
  }
  {
    let { room, s } = await create();
    assert.equal(s.speaker_id, a);
    s = await control(room, 'begin', s.turn_id);
    const id = await message(room, a, s.turn_id);
    assert.equal((await decide(room, id, allow)).question_queued, true);
    const source = s.turn_id;
    s = await control(room, 'done', source); assert.equal(s.turn_kind, 'reply'); assert.equal(s.speaker_id, b); assert.equal(s.reply_from, a);
    await as(b); s = await control(room, 'pass', s.turn_id);
    assert.equal(s.turn_kind, 'basic'); assert.equal(s.speaker_id, b); assert.ok(!s.completed.includes(b), 'reply pass preserves basic opportunity');
    assert.equal((await one('select public.claim_voice_lounge_interaction($1,$2,$3) as v', [room,a,id])).v, null, 'review is idempotent');
    await as(a);
    const previous = await message(room, a, source);
    await decide(room, previous, allow);
    assert.equal((await current(room)).reply_queue.length,0,'same original turn cannot monopolize replies');
  }
  {
    let { room, s } = await create(); s = await control(room, 'begin', s.turn_id);
    const original = s.turn_id; s = await control(room, 'done', original);
    const id = await message(room, a, original);
    await decide(room, id, allow); s = await current(room); assert.equal(s.turn_kind,'reply','late transcript replaces only an unannounced ready turn');
    await as(b); s = await control(room,'pass',s.turn_id); assert.equal(s.turn_kind,'basic'); assert.equal(s.speaker_id,b);
  }
  {
    let { room, s } = await create(); s = await control(room, 'begin', s.turn_id);
    const original = s.turn_id; s = await control(room, 'done', original);
    await as(b); s = await control(room, 'begin', s.turn_id); await as(a);
    await decide(room, await message(room, a, original), allow);
    assert.equal((await current(room)).turn_id, s.turn_id, 'late analysis never interrupts someone already speaking');
    assert.equal((await current(room)).reply_queue.length, 1);
    await as(b); s = await control(room, 'done', s.turn_id);
    assert.equal(s.turn_kind, 'reply'); assert.equal(s.speaker_id, b);
  }
  {
    let { room, s } = await create(); s = await control(room, 'begin', s.turn_id);
    await decide(room, await message(room, a, s.turn_id), warn);
    await db.query("insert into voice_lounge_session_turns(id,room_id,stage,speaker_id,kind,started_at,ended_at) values(gen_random_uuid(),$1,0,$2,'extra',now(),now())", [room,a]);
    const turn = (await one('select id from voice_lounge_session_turns where room_id=$1 and kind=$2', [room,'extra'])).id;
    const result = await decide(room, await message(room,a,turn), warn);
    assert.equal(result.warnings, 2);
    assert.ok(Date.parse(result.restricted_until) > Date.now() + 100_000);
    assert.ok(Date.parse(result.restricted_until) < Date.now() + 140_000, 'repeated harassment uses two minutes');
    const late = await decide(room, await message(room,a,s.turn_id), warn);
    assert.equal(late.warnings,2,'out-of-order segments from an earlier turn do not add another warning');
    const version = (await one('select safety_updated_at from voice_lounge_members where room_id=$1 and user_id=$2', [room,a])).safety_updated_at;
    await db.query('select ack_voice_lounge_voice_sync($1,$2,$3)', [room,a,version]);
    assert.equal((await db.query('select * from pending_voice_lounge_voice_sync($1,$2)', [room,b])).rows.length,1,'cached-token reconnects are rechecked during a restriction');
  }
  {
    let { room, s } = await create(); s = await control(room,'begin',s.turn_id);
    let id = await message(room,a,s.turn_id,'攻撃');
    assert.equal((await decide(room,id,warn)).warnings,1);
    id = await message(room,a,s.turn_id,'同じ発言の続き');
    assert.equal((await decide(room,id,warn)).warnings,1,'segmented utterance cannot double count');
    id = await message(room,a,s.turn_id,'脅迫'); await decide(room,id,severe);
    const member = await one('select * from voice_lounge_members where room_id=$1 and user_id=$2',[room,a]);
    assert.ok(Date.parse(member.speaking_restricted_until)>Date.now()+240_000);
    assert.equal((await one('select claim_voice_lounge_audio($1) as value',[room])).value,false,'no paid audio claim while restricted');
    assert.equal((await one('select claim_voice_lounge_host($1) as value',[room])).value,null,'restricted owner cannot pay for an unpublishable AI broadcast');
    await assert.rejects(db.query('select post_voice_lounge_message($1,$2)',[room,'bypass']),/발언이 제한/);
    assert.equal((await current(room)).speaker_id,null,'restriction ends the current floor');
    s = await control(room,'tick'); assert.equal(s.speaker_id,b,'restricted member excluded from roster');
    const pending = (await db.query('select * from pending_voice_lounge_voice_sync($1,$2)',[room,b])).rows; assert.equal(pending.length,1);
    await db.query('select ack_voice_lounge_voice_sync($1,$2,$3)',[room,a,'2000-01-01']);
    assert.equal((await db.query('select * from pending_voice_lounge_voice_sync($1,$2)',[room,b])).rows.length,1,'stale voice ack cannot clear a newer restriction');
    assert.equal((await one('select release_voice_lounge_restriction($1,$2,$3) as value',[room,b,a])).value,false,'non-host cannot release');
    assert.equal((await one('select release_voice_lounge_restriction($1,$2,$3) as value',[room,a,a])).value,true);
    assert.equal((await one('select moderation_warnings from voice_lounge_members where room_id=$1 and user_id=$2',[room,a])).moderation_warnings,0);
  }
  {
    const { room } = await create();
    await decide(room, await message(room,a,null), warn);
    await decide(room, await message(room,a,null), warn);
    assert.equal((await one('select moderation_warnings from voice_lounge_members where room_id=$1 and user_id=$2',[room,a])).moderation_warnings,1);
    await db.query("update voice_lounge_members set last_warning_at=now()-interval '31 seconds',safety_updated_at=now() where room_id=$1 and user_id=$2",[room,a]);
    assert.equal((await decide(room, await message(room,a,null), warn)).warnings,2,'intermediate segments or voice sync cannot postpone the warning window');
  }
  {
    const { room } = await create();
    await db.query("update voice_lounge_members set speaking_restricted_until=now()+interval '2 minutes' where room_id=$1",[room]);
    await db.query("update voice_lounge_sessions set speaker_id=null,state='between',between_since=now()-interval '20 seconds' where room_id=$1",[room]);
    assert.equal((await control(room,'tick')).stage,0,'all restricted participants pause rather than finish every stage');
  }
  {
    const { room } = await create();
    await db.query("update voice_lounge_members set speaking_restricted_until=now()-interval '1 second',safety_updated_at=now(),voice_synced_at=now() where room_id=$1 and user_id=$2",[room,b]);
    const expired = (await db.query('select * from pending_voice_lounge_voice_sync($1,$2)',[room,a])).rows;
    assert.equal(expired.length,1); assert.equal(expired[0].speaking_restricted_until,null,'expiry restores publishing through sync');
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select finish_voice_lounge_interaction($1,1,gen_random_uuid(),$2)',[room,JSON.stringify(severe)]),/permission denied/);
    await assert.rejects(db.query('update voice_lounge_members set speaking_restricted_until=null where room_id=$1',[room]),/permission denied/);
    await db.exec('reset role');
  }
  console.log('PASS: all lounge migrations, reapplication, reply turns, basic opportunities, late results, deduplication, restriction, expiry, permissions and restoration');
} finally { await db.close(); }
