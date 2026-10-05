// Isolated PostgreSQL only; never connects to a production database or paid APIs.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const ids = Array.from({ length: 4 }, (_, i) => `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
const as = async id => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
let room;
const state = async () => (await one('select to_jsonb(s) as s from voice_lounge_sessions s where room_id=$1',[room])).s;
const control = async (action,turn=null) => (await one('select to_jsonb(control_voice_lounge_session($1,$2,$3)) as s',[room,action,turn])).s;
const cooldown = async () => db.query("update voice_lounge_rooms set last_ai_at=now()-interval '100 seconds',ai_ticket_at=NULL,ai_ticket=NULL where id=$1",[room]);
const claim = async reason => (await one('select claim_voice_lounge_host($1,$2) as ticket',[room,reason])).ticket;
const finish = async ticket => (await one("select finish_voice_lounge_host($1,$2,'각자의 관점을 연결한 뒤 자유롭게 이야기해 주세요.','') as saved",[room,ticket])).saved;
const latestSql = await readFile('supabase/migrations/20261005000000_voice_lounge_presence_and_moderation.sql','utf8');
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;`);
  for(const file of (await readdir('supabase/migrations')).filter(file=>file.includes('voice_lounge')).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  for(const id of ids) await db.query('insert into auth.users values($1)',[id]);
  await as(ids[0]); room=(await one("select create_voice_lounge('ina','서로의 경험과 기준',3,'민수','river',false) as id")).id;
  for(const [i,id] of ids.entries()) if(i&&i<3){await as(id);await db.query('select join_voice_lounge($1,$2)',[room,['민수','소연','지우'][i]]);}
  await db.query("update voice_lounge_members set last_seen=now()-interval '10 minutes' where room_id=$1",[room]);
  await as(ids[3]); await assert.rejects(db.query("select join_voice_lounge($1,'새 참가자')",[room]),/가득/);
  assert.equal((await one('select count(*)::int n from voice_lounge_members where room_id=$1 and active',[room])).n,3,'suspension must not release a seat');
  await as(ids[0]); await db.query("select control_voice_lounge($1,'start')",[room]);
  await db.query("update voice_lounge_members set last_seen=now()-interval '10 minutes' where room_id=$1",[room]);
  await as(ids[1]); await db.query("select control_voice_lounge($1,'heartbeat')",[room]);
  assert.equal((await one('select status from voice_lounge_rooms where id=$1',[room])).status,'active','a suspended owner must not end the room');
  const listed=await one('select * from list_open_voice_lounges() where id=$1',[room]);
  assert.equal(listed.participant_count,3,'public listing retains background participants');
  await as(ids[0]); let s=await control('tick');assert.equal(s.round_order.length,3,'the queue retains background participants');
  const initial = await claim('opening');assert.ok(initial);assert.equal(await finish(initial),true);
  const finishRound=async()=>{
    const stage=(await state()).stage, seen=[];
    while((await state()).speaker_id){
      const turn=await state();seen.push(turn.speaker_id);await as(turn.speaker_id);
      await control('begin',turn.turn_id);await control('done',turn.turn_id);
      assert.equal((await state()).stage,stage);assert.ok(seen.length<=3,'no duplicate basic turn');
    }
    assert.equal(new Set(seen).size,3);await as(ids[0]);
  };
  await finishRound();
  await db.query("update voice_lounge_sessions set between_since=now()-interval '13 seconds' where room_id=$1",[room]);
  s=await control('tick');assert.equal(s.stage,1);
  await cooldown();const opening=await claim('opening');assert.ok(opening);assert.equal(await finish(opening),true);
  await finishRound();s=await state();assert.equal(s.state,'summarizing');assert.equal(s.free_started_at,null);
  const summaryTurn=s.turn_id;
  for(let i=0;i<3;i++)assert.equal((await control('tick')).turn_id,summaryTurn,'ticks must not create another summary');
  await as(ids[1]);assert.equal(await claim('round_summary'),null,'only the owner may broadcast');
  await as(ids[0]);await cooldown();assert.equal(await claim('opening'),null);
  const summary=await claim('round_summary');assert.ok(summary);assert.equal(await claim('round_summary'),null,'one in-flight generation');
  await db.query('update voice_lounge_rooms set moderator_requested_at=now(),moderator_requested_by=$2 where id=$1',[room,ids[1]]);
  assert.equal(await finish(summary),true);s=await state();assert.equal(s.state,'summarizing');assert.equal(s.free_started_at,null);assert.equal(s.turn_id,summaryTurn);assert.equal(s.summary_announced_stage,1);
  assert.equal((await control('tick')).state,'summarizing','saving text must not open microphones before playback');
  await as(ids[1]);await assert.rejects(control('open_free',summaryTurn),/방장만/);
  await as(ids[0]);assert.equal((await control('open_free',ids[3])).state,'summarizing','old turn acknowledgements cannot open free discussion');
  s=await control('open_free',summaryTurn);assert.equal(s.state,'free');
  assert.ok(Date.parse(s.free_ends_at)-Date.parse(s.free_started_at)>=60_000);
  assert.ok((await one('select moderator_requested_at from voice_lounge_rooms where id=$1',[room])).moderator_requested_at,'scheduled summary does not consume a human request');
  await cooldown();assert.equal(await claim('round_summary'),null);assert.equal(await claim('free_ending'),null,'no premature ending notice');
  s=await control('next_stage');assert.equal(s.stage,1);assert.equal(s.state,'free','manual next stage reserves notice time');
  assert.ok(Date.parse(s.free_ends_at)-Date.now()<=31_000);
  await cooldown();const warning=await claim('free_ending');assert.ok(warning);assert.equal(await claim('free_ending'),null);
  assert.equal(await finish(warning),true);s=await state();assert.equal(s.free_warning_announced_stage,1);
  await cooldown();assert.equal(await claim('free_ending'),null,'ending notice is once per stage');
  assert.equal((await control('tick')).stage,1,'notice never instantly jumps to the next topic');
  await db.exec(latestSql);assert.equal((await state()).free_ends_at,s.free_ends_at,'migration reapplication preserves the clock');
  await db.query("update voice_lounge_sessions set free_ends_at=now()-interval '1 second' where room_id=$1",[room]);
  s=await control('tick');assert.equal(s.stage,2);assert.equal(s.state,'ready');
  await finishRound();assert.equal((await state()).state,'summarizing');
  await db.query("update voice_lounge_sessions set between_since=now()-interval '91 seconds' where room_id=$1",[room]);
  await cooldown();s=await control('tick');assert.equal(s.state,'free','AI failure cannot strand the room');
  await db.query("update voice_lounge_sessions set free_ends_at=now()-interval '1 second' where room_id=$1",[room]);
  assert.equal((await control('tick')).stage,2,'transition waits for the ending notice');
  await db.query("update voice_lounge_sessions set free_ends_at=now()-interval '61 seconds' where room_id=$1",[room]);
  assert.equal((await control('tick')).stage,3,'failed notice eventually allows recovery');
  await as(ids[1]);await db.query("select control_voice_lounge($1,'leave')",[room]);
  assert.equal((await one('select active from voice_lounge_members where room_id=$1 and user_id=$2',[room,ids[1]])).active,false);
  await as(ids[3]);await db.query("select join_voice_lounge($1,'새 참가자')",[room]);
  assert.equal((await one('select count(*)::int n from voice_lounge_members where room_id=$1 and active',[room])).n,3);
  await as(ids[0]);await db.query("select control_voice_lounge($1,'leave')",[room]);
  assert.equal((await one('select status from voice_lounge_rooms where id=$1',[room])).status,'ended','explicit owner leave still ends the room');
  await as(ids[2]);await assert.rejects(db.query("select join_voice_lounge($1,'지우')",[room]),/종료/);
  for(const signature of ['join_voice_lounge(text,text)','control_voice_lounge(text,text)','control_voice_lounge_session(text,text,uuid,double precision)','claim_voice_lounge_host(text,text)','finish_voice_lounge_host(text,uuid,text,text)']){
    assert.equal((await one("select has_function_privilege('anon',$1,'EXECUTE') allowed",['public.'+signature])).allowed,false);
  }
  console.log('PASS: background membership, stale owner survival, public counts and capacity, full speaking queues, summary-before-free, one summary/notice per stage, manual notice window, retained human requests, failed-AI recovery, explicit leave, authorization and migration reapplication.');
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await db.close();}
