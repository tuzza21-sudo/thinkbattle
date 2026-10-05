// Isolated PostgreSQL; no production DB or paid APIs.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.LOUNGE_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const ids = ['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
const as = async id => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
let room;
const state = async () => (await one('select to_jsonb(s) as s from voice_lounge_sessions s where room_id=$1',[room])).s;
const control = async (action,turn=null) => (await one('select to_jsonb(control_voice_lounge_session($1,$2,$3)) as s',[room,action,turn])).s;
const cooldown = async () => db.query("update voice_lounge_rooms set last_ai_at=now()-interval '100 seconds',ai_ticket_at=NULL,ai_ticket=NULL where id=$1",[room]);
const claim = async reason => (await one('select claim_voice_lounge_host($1,$2) as ticket',[room,reason])).ticket;
const finish = async ticket => (await one("select finish_voice_lounge_host($1,$2,'서로 편하게 이야기해 주세요.','') as saved",[room,ticket])).saved;
const post = async text => {
  const role=(await one('select current_user as role')).role;
  await db.exec('RESET ROLE');
  await db.query("update voice_lounge_messages set created_at=now()-interval '3 seconds' where room_id=$1 and user_id=auth.uid()",[room]);
  if(role==='authenticated')await db.exec('SET ROLE authenticated');
  await db.query('select post_voice_lounge_message($1,$2)',[room,text]);
};
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;`);
  // Historical upgrade contract; newer presence/moderation behavior has its own SQL fixture.
  for(const file of (await readdir('supabase/migrations')).filter(file=>file.includes('voice_lounge')&&file<='20261004040000_voice_lounge_round_then_free.sql').sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  for(const id of ids) await db.query('insert into auth.users values($1)',[id]);
  await as(ids[0]); room=(await one("select create_voice_lounge('ina','책에 대한 서로 다른 생각',3,'민수','river',false) as id")).id;
  for(const [index,id] of ids.entries()) if(index){await as(id); await db.query('select join_voice_lounge($1,$2)',[room,['민수','소연','지우'][index]]);}
  await as(ids[0]); await db.query("select control_voice_lounge($1,'start')",[room]);
  let s=await control('tick'); assert.equal(s.stage,0); assert.equal(s.state,'ready');
  const opening=await claim('opening');assert.ok(opening);assert.equal(await finish(opening),true);
  for(let i=0;i<3;i++){
    s=await state(); await as(s.speaker_id); await control('begin',s.turn_id); s=await control('done',s.turn_id);
    await as(ids[0]);await cooldown();assert.equal(await claim('opening'),null,'no AI greeting per participant turn');
  }
  await db.query("update voice_lounge_sessions set between_since=now()-interval '13 seconds' where room_id=$1",[room]);
  s=await control('tick'); assert.equal(s.stage,1);assert.equal(s.state,'ready');assert.ok(s.speaker_id);
  assert.equal((await one('select count(*)::int as n from voice_lounge_session_turns where room_id=$1 and stage=1',[room])).n,1);
  const question=await claim('opening');assert.ok(question);assert.equal(await finish(question),true);
  const finishRound=async()=>{
    const stage=(await state()).stage;
    const seen=[];
    while((await state()).state!=='free') {
      const turn=await state();assert.equal(turn.stage,stage);assert.ok(turn.speaker_id);
      seen.push(turn.speaker_id);await as(turn.speaker_id);await control('begin',turn.turn_id);await control('done',turn.turn_id);
      assert.ok(seen.length<=3,'basic round repeated a participant');
    }
    assert.equal(new Set(seen).size,3);await as(ids[0]);
    assert.equal((await state()).speaker_id,null);assert.ok((await state()).free_started_at);
  };
  // A budget expiring while people are waiting must not skip their basic turns.
  await db.query("update voice_lounge_sessions set stage_started_at=now()-interval '10 minutes' where room_id=$1",[room]);
  await assert.rejects(control('next_stage'),/아직 차례/);
  await as(ids[1]);await control('raise');await as(ids[0]);
  await finishRound();
  assert.deepEqual((await state()).hand_queue,[ids[1]],'additional speech waits for free discussion rather than consuming a second round');
  await control('tick');assert.equal((await state()).stage,1,'free time survives an exhausted round budget');
  const freeVersion=(await state()).free_started_at;
  await db.exec(await readFile('supabase/migrations/20261004040000_voice_lounge_round_then_free.sql','utf8'));
  assert.equal((await state()).free_started_at,freeVersion,'reapplication must not restart free time');
  assert.equal((await state()).state,'free','applying SQL must not interrupt an open conversation');
  await cooldown();assert.equal(await claim('opening'),null);assert.equal(await claim('followup'),null);
  await as(ids[1]);await db.exec('SET ROLE authenticated');
  await post('민수님, 어떻게 생각하세요?');
  assert.equal((await one('select moderator_requested_at from voice_lounge_rooms where id=$1',[room])).moderator_requested_at,null);
  await post('AI가 매번 답하는 방식은 답답해요.');
  assert.equal((await one('select moderator_requested_at from voice_lounge_rooms where id=$1',[room])).moderator_requested_at,null);
  await post('사회자, 어떻게 생각해?');
  assert.equal((await one('select moderator_requested_by from voice_lounge_rooms where id=$1',[room])).moderator_requested_by,ids[1]);
  await control('raise');assert.deepEqual((await state()).hand_queue,[ids[1]]);
  await assert.rejects(control('begin',(await state()).turn_id),/자유 대화/);
  assert.equal(await claim('requested'),null,'only the owner broadcasts AI');
  await db.exec('RESET ROLE');await as(ids[0]);await cooldown();
  const requested=await claim('requested');assert.ok(requested);assert.equal(await finish(requested),true);
  assert.equal((await one('select moderator_requested_at from voice_lounge_rooms where id=$1',[room])).moderator_requested_at,null);
  await as(ids[2]);await db.exec('SET ROLE authenticated');await db.query('select request_voice_lounge_moderator($1)',[room]);
  assert.equal((await one('select moderator_requested_by from voice_lounge_rooms where id=$1',[room])).moderator_requested_by,ids[2]);
  await db.exec('RESET ROLE'); await as(ids[0]);await cooldown();const olderTicket=await claim('requested');
  await db.query("update voice_lounge_rooms set moderator_requested_at=now()+interval '1 second' where id=$1",[room]);
  assert.equal(await finish(olderTicket),true);assert.ok((await one('select moderator_requested_at from voice_lounge_rooms where id=$1',[room])).moderator_requested_at,'a newer request is retained');
  await db.query('update voice_lounge_rooms set moderator_requested_at=NULL,moderator_requested_by=NULL where id=$1',[room]);
  // Safety stays asynchronous and enforces the same restriction in free speech.
  for(let i=0;i<2;i++){
    await as(ids[1]);await post('인신공격 테스트');
    const message=(await one("select id from voice_lounge_messages where room_id=$1 and user_id=$2 order by id desc limit 1",[room,ids[1]])).id;
    const review=(await one('select claim_voice_lounge_interaction($1,$2,$3) as v',[room,ids[1],message])).v;
    await one('select finish_voice_lounge_interaction($1,$2,$3,$4::jsonb)',[room,message,review.ticket,JSON.stringify({moderation:'warn',reason:'harassment'})]);
    if(!i)await db.query("update voice_lounge_members set last_warning_at=now()-interval '31 seconds' where room_id=$1 and user_id=$2",[room,ids[1]]);
  }
  await assert.rejects(post('제한 중 발언'),/제한/);await assert.rejects(control('raise'),/제한/);
  await assert.rejects(db.query('select request_voice_lounge_moderator($1)',[room]),/제한/);
  assert.equal((await one('select claim_voice_lounge_audio($1) as allowed',[room])).allowed,false);
  await as(ids[0]);await db.query('select release_voice_lounge_restriction($1,$2,$3)',[room,ids[0],ids[1]]);
  await db.query("update voice_lounge_members set last_seen=now()-interval '100 seconds' where room_id=$1 and user_id<>$2",[room,ids[0]]);
  await cooldown();const alone=await claim('followup');assert.ok(alone,'the only present human may talk directly to AI');assert.equal(await finish(alone),true);
  await db.query('update voice_lounge_members set last_seen=now() where room_id=$1',[room]);
  await db.query("update voice_lounge_sessions set free_started_at=now()-interval '61 seconds' where room_id=$1",[room]);
  s=await control('tick');assert.equal(s.stage,2);assert.equal(s.state,'ready');
  await cooldown();const topicOpening=await claim('opening');assert.ok(topicOpening);assert.equal(await finish(topicOpening),true);
  await finishRound();
  for(let stage=3;stage<=5;stage++) {s=await control('next_stage');assert.equal(s.stage,stage);assert.equal(s.state,'ready');if(stage<5)await finishRound();}
  await cooldown();const closing=await claim('opening');assert.ok(closing);assert.equal(await finish(closing),true);
  s=await state();await as(s.speaker_id);await control('begin',s.turn_id);await control('done',s.turn_id);
  await as(ids[0]);await cooldown();assert.equal(await claim('opening'),null,'closing has no per-turn AI reply');
  await db.exec(await readFile('supabase/migrations/20261004040000_voice_lounge_round_then_free.sql','utf8'));
  assert.equal((await state()).announced_stage,5);
  await db.exec('SET ROLE anon');await assert.rejects(db.query('select request_voice_lounge_moderator($1)',[room]),/permission denied/);
  console.log('PASS: basic turns before free conversation, full rosters despite elapsed budgets, minimum free time, rotated topic rounds, free microphones/transcripts, one opening per phase, explicit requests, no human-question intervention, bounded hand queue, safety, owner authorization and migration reapplication.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await db.close();}
