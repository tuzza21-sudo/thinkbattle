// Isolated PostgreSQL only; never connects to a production database or paid APIs.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const one = async (sql,args=[]) => (await db.query(sql,args)).rows[0];
const as = async id => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
let room;
const state = async () => (await one('select to_jsonb(s) as s from voice_lounge_sessions s where room_id=$1',[room])).s;
const roomRow = async () => one('select * from voice_lounge_rooms where id=$1',[room]);
const control = async (action,turn=null) => (await one('select to_jsonb(control_voice_lounge_session($1,$2,$3)) as s',[room,action,turn])).s;
const cooldown = async () => db.query("update voice_lounge_rooms set last_ai_at=now()-interval '200 seconds',ai_ticket_at=NULL,ai_ticket=NULL where id=$1",[room]);
const claim = async reason => (await one('select claim_voice_lounge_host($1,$2) as ticket',[room,reason])).ticket;
const finish = async ticket => (await one("select finish_voice_lounge_host($1,$2,'반가워요. 편하게 이야기 나눠요.','') as saved",[room,ticket])).saved;
const say = async (id,text) => { await as(id); await db.query('select post_voice_lounge_message($1,$2)',[room,text]); await db.query("update voice_lounge_messages set created_at=created_at-interval '3 seconds' where room_id=$1",[room]); };
const age = async seconds => db.query(`update voice_lounge_messages set created_at=created_at-interval '${seconds} seconds' where room_id=$1`,[room]);
const latestSql = await readFile('supabase/migrations/20261006000000_voice_lounge_light_moderation.sql','utf8');
const create = async (count, capacity = count) => {
  await as(ids[0]); room=(await one("select create_voice_lounge('ina','서로의 경험과 기준',$1,'민수','river',false) as id",[capacity])).id;
  for(let i=1;i<count;i++){await as(ids[i]);await db.query('select join_voice_lounge($1,$2)',[room,`참가자${i}`]);}
  await as(ids[0]); if(capacity>1) await db.query("select control_voice_lounge($1,'start')",[room]);
};
const finishRound = async count => {
  const stage=(await state()).stage, seen=[];
  while((await state()).speaker_id){
    const turn=await state();seen.push(turn.speaker_id);await as(turn.speaker_id);
    await control('begin',turn.turn_id);await control('done',turn.turn_id);
    assert.ok(seen.length<=count,'no duplicate basic turn');
  }
  assert.equal(new Set(seen).size,count);assert.equal((await state()).stage,stage);await as(ids[0]);
};
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;`);
  for(const file of (await readdir('supabase/migrations')).filter(file=>file.includes('voice_lounge')).sort()) await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  for(const id of ids) await db.query('insert into auth.users values($1)',[id]);

  // Three people: greeting, one introduction round, one first-topic round, then free conversation.
  await create(3);
  let s=await control('tick');assert.equal(s.stage,0);assert.equal(s.state,'ready');
  const greeting=await claim('opening');assert.ok(greeting);assert.equal(await finish(greeting),true);
  await cooldown();assert.equal(await claim('opening'),null,'the greeting is spoken once');
  await finishRound(3);
  await db.query("update voice_lounge_sessions set between_since=now()-interval '7 seconds' where room_id=$1",[room]);
  s=await control('tick');assert.equal(s.stage,1);assert.equal(s.state,'ready','three or more people share one first-topic round');
  await cooldown();const bridge=await claim('opening');assert.ok(bridge);assert.equal(await finish(bridge),true);
  await finishRound(3);
  s=await state();assert.equal(s.state,'free','no AI summary between the round and free conversation');assert.equal(s.free_ends_at,null);
  await cooldown();assert.equal(await claim('opening'),null);
  await db.query("update voice_lounge_sessions set stage_started_at=now()-interval '2 hours',free_started_at=now()-interval '2 hours' where room_id=$1",[room]);
  for(let i=0;i<3;i++) assert.equal((await control('tick')).stage,1,'free conversation has no timer');

  // Silence: at most once per real silence, never while people have just spoken.
  await cooldown();await age(60);assert.equal(await claim('silence'),null,'no human has spoken since the AI did');
  await say(ids[1],'저는 그 장면이 제일 기억에 남아요.');await say(ids[2],'저도 비슷하게 느꼈어요.');await as(ids[0]);
  await cooldown();assert.equal(await claim('silence'),null,'recent human speech blocks a silence prompt');
  await age(40);await db.query("update voice_lounge_rooms set last_ai_at=now()-interval '100 seconds' where id=$1",[room]);
  assert.equal(await claim('silence'),null,'AI waits two minutes between silence prompts');
  await cooldown();const quiet=await claim('silence');assert.ok(quiet);assert.equal(await finish(quiet),true);
  await cooldown();await age(60);assert.equal(await claim('silence'),null,'no second prompt into the same silence');
  assert.equal(await claim('followup'),null,'groups never get per-utterance replies');

  // Explicit help keeps its kind and is consumed once.
  assert.equal(await claim('requested'),null,'requested needs a pending request');
  await as(ids[1]);await assert.rejects(db.query("select request_voice_lounge_moderator($1,'lecture')",[room]),/도움 요청/);
  await db.query("select request_voice_lounge_moderator($1,'question')",[room]);
  await as(ids[2]);await db.query("select request_voice_lounge_moderator($1,'topic')",[room]);
  let r=await roomRow();assert.equal(r.moderator_request_kind,'topic');assert.equal(r.moderator_requested_by,ids[1]);
  await as(ids[1]);assert.equal(await claim('requested'),null,'only the room owner broadcasts');
  await as(ids[0]);const help=await claim('requested');assert.ok(help);assert.equal(await finish(help),true);
  r=await roomRow();assert.equal(r.moderator_requested_at,null);assert.equal(r.moderator_request_kind,null);
  await say(ids[2],'사회자, 어떻게 생각해?');await as(ids[0]);
  r=await roomRow();assert.equal(r.moderator_request_kind,'direct','a spoken call asks for a direct answer');
  await db.query('update voice_lounge_rooms set moderator_requested_at=NULL,moderator_requested_by=NULL,moderator_request_kind=NULL where id=$1',[room]);
  await say(ids[1],'도우미야, 질문 하나 해줘');await as(ids[0]);
  r=await roomRow();assert.equal(r.moderator_request_kind,'direct','the assistant name also calls the AI');assert.equal(r.moderator_requested_by,ids[1]);

  // Topic cards change without AI speech; the host decides when to close.
  s=await control('next_stage');assert.equal(s.stage,2);assert.equal(s.state,'free');
  await cooldown();assert.equal(await claim('opening'),null,'topic cards are shown on screen, not announced');
  await as(ids[1]);await assert.rejects(control('next_stage'),/방장만/);await assert.rejects(control('wrap_up'),/방장만/);
  await as(ids[0]);s=await control('wrap_up');assert.equal(s.stage,5);assert.equal(s.state,'ready');assert.equal(s.round_order.length,3);
  await cooldown();const closing=await claim('opening');assert.ok(closing);assert.equal(await finish(closing),true);
  await finishRound(3);
  await db.query("update voice_lounge_sessions set between_since=now()-interval '7 seconds' where room_id=$1",[room]);
  assert.equal((await control('tick')).state,'finished');assert.equal((await roomRow()).status,'ended');

  // Two people skip the topic round; next_stage from the last card starts the closing round.
  await create(2);
  await control('tick');const pairGreeting=await claim('opening');assert.ok(pairGreeting);assert.equal(await finish(pairGreeting),true);
  await finishRound(2);
  await db.query("update voice_lounge_sessions set between_since=now()-interval '7 seconds' where room_id=$1",[room]);
  s=await control('tick');assert.equal(s.stage,1);assert.equal(s.state,'free','two people talk freely after introductions');
  await cooldown();const pairBridge=await claim('opening');assert.ok(pairBridge,'the first topic is introduced once');assert.equal(await finish(pairBridge),true);
  for(const stage of [2,3,4]) assert.equal((await control('next_stage')).stage,stage);
  s=await control('next_stage');assert.equal(s.stage,5);assert.equal(s.state,'ready');
  await assert.rejects(control('wrap_up'),/자유 대화/);

  // One-to-one is a conversation: replies follow each turn, no unprompted silence prompts.
  await create(1);
  await db.query("update voice_lounge_rooms set status='active',started_at=now(),expires_at=now()+interval '1 hour' where id=$1",[room]);
  await say(ids[0],'요즘 산책하는 게 좋아요.');await as(ids[0]);await age(60);
  await cooldown();assert.equal(await claim('silence'),null,'solo never prompts unasked');
  const reply=await claim('followup');assert.ok(reply);assert.equal(await finish(reply),true);
  await cooldown();assert.ok(await claim('requested'),'solo topic requests come straight from the user');

  // In-flight sessions from the timed/summarized flow continue as free conversation.
  await create(3);await control('tick');
  await db.query("update voice_lounge_sessions set stage=2,state='summarizing',speaker_id=NULL,free_ends_at=now()+interval '1 minute' where room_id=$1",[room]);
  await db.exec(latestSql);
  s=await state();assert.equal(s.state,'free');assert.equal(s.free_ends_at,null);
  await db.query("update voice_lounge_sessions set state='summarizing' where room_id=$1",[room]);
  await as(ids[0]);s=await control('open_free',s.turn_id);assert.equal(s.state,'free','older clients cannot strand a retired summary');
  await cooldown();assert.equal(await claim('round_summary'),null);assert.equal(await claim('free_ending'),null);

  for(const signature of ['request_voice_lounge_moderator(text,text)','post_voice_lounge_message(text,text)','control_voice_lounge_session(text,text,uuid,double precision)','claim_voice_lounge_host(text,text)','finish_voice_lounge_host(text,uuid,text,text)']){
    assert.equal((await one("select has_function_privilege('anon',$1,'EXECUTE') allowed",['public.'+signature])).allowed,false);
    assert.equal((await one("select has_function_privilege('authenticated',$1,'EXECUTE') allowed",['public.'+signature])).allowed,true);
  }
  console.log('PASS: short greeting, one introduction round, first-topic round only for 3+, no AI summaries or timed endings, screen-only topic cards, host-led closing, one silence prompt per real pause, typed and spoken help requests, solo conversation rules, legacy session recovery, reapplication and privileges.');
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await db.close();}
