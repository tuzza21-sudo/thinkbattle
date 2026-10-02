// Install the test-only engine under node_modules/.cache/lounge-validation first.
// This script never connects to Supabase or modifies a production database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const people = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO authenticated;
  INSERT INTO auth.users(id) VALUES ${people.map(id => `('${id}')`).join(',')};`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261001000000_voice_lounge.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261001010000_voice_lounge_solo.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261001020000_voice_lounge_fast_turns.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261001030000_voice_lounge_turn_taking.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261001050000_voice_lounge_themes.sql', import.meta.url), 'utf8'));
const asUser = async (index, sql, params = []) => {
  await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [people[index]]);
    const result = await db.query(sql, params); await db.exec('COMMIT;'); return result;
  } catch (error) { await db.exec('ROLLBACK;'); throw error; }
};
try {
  // Exercise an upgrade with rooms already counted by the old daily ceiling.
  const creationSql = "SELECT create_voice_lounge('ina','Creation limit test',1,'Host') AS id";
  for (let i = 0; i < 5; i++) await asUser(0, creationSql);
  await assert.rejects(asUser(0, creationSql), /5개/);
  const unlimitedSql = readFileSync(new URL('../supabase/migrations/20261002000000_voice_lounge_unlimited_creation.sql', import.meta.url), 'utf8');
  await db.exec(unlimitedSql);
  await db.exec(unlimitedSql); // Reapplying the migration is safe.
  const createdRooms = [];
  for (let i = 0; i < 12; i++) {
    const result = await asUser(0, i % 2 === 0 ? creationSql : "SELECT create_voice_lounge('ina','Creation limit test',1,'Host','forest') AS id");
    createdRooms.push(result.rows[0].id);
  }
  assert.equal(new Set(createdRooms).size, 12, 'every creation returns a distinct room');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM voice_lounge_rooms WHERE host_id=$1', [people[0]])).rows[0].count, 17, 'existing and new rooms do not impose a creation limit');
  assert.equal((await asUser(0, 'SELECT count(*)::int AS count FROM voice_lounge_members')).rows[0].count, 17, 'every created room retains host membership');
  for (const signature of ['text,text,integer,text', 'text,text,integer,text,text']) {
    assert.equal((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS allowed", [`public.create_voice_lounge(${signature})`])).rows[0].allowed, false, 'anonymous role cannot create rooms');
    assert.equal((await db.query("SELECT has_function_privilege('authenticated',$1,'EXECUTE') AS allowed", [`public.create_voice_lounge(${signature})`])).rows[0].allowed, true, 'signed-in accounts retain creation access');
  }
  await db.exec('BEGIN; SET LOCAL ROLE authenticated;');
  await db.query("SELECT set_config('request.jwt.claim.sub','',true)");
  await assert.rejects(db.query(creationSql), /로그인/);
  await db.exec('ROLLBACK;');
  const beforeInvalidCreation = (await db.query('SELECT count(*)::int AS count FROM voice_lounge_rooms')).rows[0].count;
  await assert.rejects(asUser(0, "SELECT create_voice_lounge('ina','Creation limit test',1,'')"));
  assert.equal((await db.query('SELECT count(*)::int AS count FROM voice_lounge_rooms')).rows[0].count, beforeInvalidCreation, 'failed membership creation rolls back the room');
  await db.exec('DELETE FROM voice_lounge_rooms;');
  const studySql = readFileSync(new URL('../supabase/migrations/20261002010000_voice_lounge_topic_study.sql', import.meta.url), 'utf8');
  await db.exec(studySql); await db.exec(studySql);
  const studyRoom = (await asUser(0, "SELECT create_voice_lounge('ina','녹터널애니멀 영화',2,'Host','forest',true) AS id")).rows[0].id;
  await asUser(1, "SELECT join_voice_lounge($1,'Guest')", [studyRoom]);
  assert.equal((await asUser(0, 'SELECT study_required FROM voice_lounge_rooms WHERE id=$1', [studyRoom])).rows[0].study_required, true);
  assert.equal((await asUser(1, 'SELECT claim_voice_lounge_study($1) AS claim', [studyRoom])).rows[0].claim, null, 'guest cannot initiate paid research');
  assert.equal((await asUser(2, 'SELECT claim_voice_lounge_study($1) AS claim', [studyRoom])).rows[0].claim, null, 'outsider cannot initiate research');
  const claim = (await asUser(0, 'SELECT claim_voice_lounge_study($1) AS claim', [studyRoom])).rows[0].claim;
  assert.equal(claim.state, 'claimed'); assert.equal(claim.topic, '녹터널애니멀 영화');
  assert.equal((await asUser(0, 'SELECT claim_voice_lounge_study($1) AS claim', [studyRoom])).rows[0].claim.state, 'busy', 'overlapping searches share one ticket');
  assert.equal((await db.query('SELECT ai_turns FROM voice_lounge_rooms WHERE id=$1', [studyRoom])).rows[0].ai_turns, 0, 'preparation does not spend moderator turns');
  const brief = { title: 'Movie', confidence: 'verified', overview: 'Introduction', facts: ['Fact'], angles: ['View'], questions: ['Question?'], clarification: '', sources: [{ title: 'Source', url: 'https://film.test/' }] };
  assert.equal((await asUser(0, 'SELECT finish_voice_lounge_study($1,$2,$3::jsonb) AS saved', [studyRoom, people[7], JSON.stringify(brief)])).rows[0].saved, false, 'wrong ticket cannot save');
  assert.equal((await asUser(1, 'SELECT finish_voice_lounge_study($1,$2,$3::jsonb) AS saved', [studyRoom, claim.ticket, JSON.stringify(brief)])).rows[0].saved, false, 'guest cannot save');
  assert.equal((await asUser(0, 'SELECT finish_voice_lounge_study($1,$2,$3::jsonb) AS saved', [studyRoom, claim.ticket, JSON.stringify({ text: 'x'.repeat(25000) })])).rows[0].saved, false, 'briefing storage is bounded');
  assert.equal((await asUser(0, 'SELECT finish_voice_lounge_study($1,$2,$3::jsonb) AS saved', [studyRoom, claim.ticket, JSON.stringify(brief)])).rows[0].saved, true);
  assert.deepEqual((await asUser(0, 'SELECT claim_voice_lounge_study($1) AS claim', [studyRoom])).rows[0].claim, { state: 'ready', study: brief }, 'completed brief is reused');
  assert.deepEqual((await asUser(1, 'SELECT topic_study FROM voice_lounge_rooms WHERE id=$1', [studyRoom])).rows[0].topic_study, brief, 'members can view shared sources');
  assert.equal((await asUser(2, 'SELECT topic_study FROM voice_lounge_rooms WHERE id=$1', [studyRoom])).rows.length, 0, 'outsiders cannot read research');
  const retryRoom = (await asUser(0, "SELECT create_voice_lounge('ina','다른 주제',1,'Host','river',true) AS id")).rows[0].id;
  for (let attempt = 0; attempt < 3; attempt++) {
    const retryClaim = (await asUser(0, 'SELECT claim_voice_lounge_study($1) AS claim', [retryRoom])).rows[0].claim;
    assert.equal(retryClaim.state, 'claimed');
    await asUser(0, 'SELECT fail_voice_lounge_study($1,$2)', [retryRoom, retryClaim.ticket]);
    assert.equal((await asUser(0, 'SELECT claim_voice_lounge_study($1) AS claim', [retryRoom])).rows[0].claim.state, 'busy', 'failed searches retain a retry cooldown');
    await db.query("UPDATE voice_lounge_rooms SET study_ticket_at=now()-interval '91 seconds' WHERE id=$1", [retryRoom]);
    assert.equal((await asUser(0, 'SELECT finish_voice_lounge_study($1,$2,$3::jsonb) AS saved', [retryRoom, retryClaim.ticket, JSON.stringify(brief)])).rows[0].saved, false, 'stale search cannot save');
  }
  assert.equal((await asUser(0, 'SELECT claim_voice_lounge_study($1) AS claim', [retryRoom])).rows[0].claim.state, 'exhausted', 'failed preparation does not loop indefinitely');
  for (const signature of ['create_voice_lounge(text,text,integer,text,text,boolean)', 'claim_voice_lounge_study(text)', 'finish_voice_lounge_study(text,uuid,jsonb)', 'fail_voice_lounge_study(text,uuid)']) {
    assert.equal((await db.query("SELECT has_function_privilege('anon',$1,'EXECUTE') AS allowed", [`public.${signature}`])).rows[0].allowed, false);
  }
  await db.exec('DELETE FROM voice_lounge_rooms;');
  assert.equal((await db.query("SELECT has_function_privilege('anon','public.create_voice_lounge(text,text,integer,text,text)','EXECUTE') AS allowed")).rows[0].allowed, false);
  await assert.rejects(asUser(0, "SELECT create_voice_lounge('ina','Theme test',1,'Host','invalid')"));
  assert.equal((await db.query('SELECT count(*)::int AS count FROM voice_lounge_rooms')).rows[0].count, 0, 'invalid theme creates no room');
  for (const theme of ['rooftop', 'river', 'forest']) {
    const themedRoom = (await asUser(0, "SELECT create_voice_lounge('ina','Theme test',2,'Host',$1) AS id", [theme])).rows[0].id;
    await asUser(1, "SELECT join_voice_lounge($1,'Guest')", [themedRoom]);
    assert.equal((await asUser(1, 'SELECT theme FROM voice_lounge_rooms WHERE id=$1', [themedRoom])).rows[0].theme, theme, 'invitee sees the chosen theme');
    await assert.rejects(asUser(1, "UPDATE voice_lounge_rooms SET theme='forest' WHERE id=$1", [themedRoom]), /permission denied/);
    await db.query('DELETE FROM voice_lounge_rooms WHERE id=$1', [themedRoom]);
  }
  await assert.rejects(asUser(0, "SELECT create_voice_lounge('jaeseok','가벼운 하루',7,'방장')"));
  await assert.rejects(asUser(0, "SELECT create_voice_lounge('jaeseok','가벼운 하루',0,'방장')"));
  const soloRoom = (await asUser(7, "SELECT create_voice_lounge('jaeseok','영화 이야기',1,'혼자') AS id")).rows[0].id;
  await assert.rejects(asUser(6, "SELECT join_voice_lounge($1,'초대받지 않은 사람')", [soloRoom]), /가득/);
  await asUser(7, "SELECT control_voice_lounge($1,'start')", [soloRoom]);
  assert.equal((await asUser(7, 'SELECT status FROM voice_lounge_rooms WHERE id=$1', [soloRoom])).rows[0].status, 'active');
  assert.equal((await asUser(7, 'SELECT theme FROM voice_lounge_rooms WHERE id=$1', [soloRoom])).rows[0].theme, 'rooftop', 'old callers keep a default theme');
  const soloTicket = (await asUser(7, 'SELECT claim_voice_lounge_host($1) AS ticket', [soloRoom])).rows[0].ticket;
  assert.ok(soloTicket, 'one human can request the AI in a solo room');
  assert.equal((await asUser(7, "SELECT finish_voice_lounge_host($1,$2,'어떤 영화가 기억에 남았어요?','영화 수다') AS saved", [soloRoom, soloTicket])).rows[0].saved, true);
  assert.equal((await asUser(7, 'SELECT claim_voice_lounge_host($1) AS ticket', [soloRoom])).rows[0].ticket, null, 'solo still has a short cooldown');
  await db.query("UPDATE voice_lounge_rooms SET last_ai_at=now()-interval '3 seconds' WHERE id=$1", [soloRoom]);
  assert.equal((await asUser(7, 'SELECT claim_voice_lounge_host($1) AS ticket', [soloRoom])).rows[0].ticket, null, 'three seconds is too soon for solo');
  await db.query("UPDATE voice_lounge_rooms SET last_ai_at=now()-interval '6 seconds' WHERE id=$1", [soloRoom]);
  const followupTicket = (await asUser(7, 'SELECT claim_voice_lounge_host($1) AS ticket', [soloRoom])).rows[0].ticket;
  assert.ok(followupTicket, 'solo does not wait thirty seconds');
  await db.query("UPDATE voice_lounge_rooms SET last_ai_at=now()-interval '6 seconds' WHERE id=$1", [soloRoom]);
  assert.equal((await asUser(7, 'SELECT claim_voice_lounge_host($1) AS ticket', [soloRoom])).rows[0].ticket, null, 'pending solo turns never overlap');
  await asUser(7, "SELECT finish_voice_lounge_host($1,$2,'그 장면이 좋았군요.','영화 수다')", [soloRoom, followupTicket]);
  await asUser(7, "SELECT post_voice_lounge_message($1,'오늘 영화 봤어요')", [soloRoom]);
  assert.equal((await asUser(7, 'SELECT claim_voice_lounge_audio($1) AS allowed', [soloRoom])).rows[0].allowed, true);
  await asUser(7, "SELECT control_voice_lounge($1,'leave')", [soloRoom]);
  assert.equal((await db.query('SELECT status FROM voice_lounge_rooms WHERE id=$1', [soloRoom])).rows[0].status, 'ended');
  await db.query('DELETE FROM voice_lounge_rooms WHERE id=$1', [soloRoom]);
  const result = await asUser(0, "SELECT create_voice_lounge('ina','오늘의 소소한 행복',6,'방장') AS id");
  const room = result.rows[0].id;
  const roomArg = [room];
  await assert.rejects(asUser(0, "SELECT control_voice_lounge($1,'start')", roomArg), /두 명 이상/);
  for (let i = 1; i < 6; i++) await asUser(i, 'SELECT join_voice_lounge($1,$2)', [room, `친구${i}`]);
  await assert.rejects(asUser(6, "SELECT join_voice_lounge($1,'초과')", roomArg), /가득/);
  assert.equal((await asUser(6, 'SELECT * FROM voice_lounge_rooms')).rows.length, 0, 'outsider cannot read rooms');
  assert.equal((await asUser(6, 'SELECT * FROM voice_lounge_members')).rows.length, 0, 'outsider cannot read nicknames');
  await assert.rejects(asUser(1, "UPDATE voice_lounge_rooms SET capacity=6 WHERE id=$1", roomArg), /permission denied/);
  await assert.rejects(asUser(1, "SELECT control_voice_lounge($1,'start')", roomArg), /방장/);
  await asUser(0, "SELECT control_voice_lounge($1,'start')", roomArg);
  const ticket = (await asUser(0, 'SELECT claim_voice_lounge_host($1) AS ticket', roomArg)).rows[0].ticket;
  assert.ok(ticket);
  assert.equal((await asUser(0, 'SELECT claim_voice_lounge_host($1) AS ticket', roomArg)).rows[0].ticket, null, 'second AI turn cannot overlap');
  assert.equal((await asUser(1, 'SELECT claim_voice_lounge_host($1) AS ticket', roomArg)).rows[0].ticket, null, 'guest cannot request AI');
  assert.equal((await asUser(0, "SELECT finish_voice_lounge_host($1,$2,'반가워요','취향') AS saved", [room, people[7]])).rows[0].saved, false, 'wrong ticket cannot write AI text');
  assert.equal((await asUser(0, "SELECT finish_voice_lounge_host($1,$2,'오늘의 작은 기쁨은 뭐였어요?',$3) AS saved", [room, ticket, 'a'.repeat(3000)])).rows[0].saved, true);
  await db.query("UPDATE voice_lounge_rooms SET last_ai_at=now()-interval '3 seconds' WHERE id=$1", roomArg);
  assert.equal((await asUser(0, 'SELECT claim_voice_lounge_host($1) AS ticket', roomArg)).rows[0].ticket, null, 'group still waits thirty seconds');
  assert.equal((await db.query('SELECT length(memory) AS size FROM voice_lounge_rooms WHERE id=$1', roomArg)).rows[0].size, 1800);
  assert.equal((await asUser(0, "SELECT finish_voice_lounge_host($1,$2,'중복','') AS saved", [room, ticket])).rows[0].saved, false);
  await asUser(1, "SELECT post_voice_lounge_message($1,'산책이 좋았어요')", roomArg);
  await assert.rejects(asUser(1, "SELECT post_voice_lounge_message($1,'연속 도배')", roomArg), /천천히/);
  await assert.rejects(asUser(6, "SELECT post_voice_lounge_message($1,'외부인')", roomArg), /진행 중인 방/);
  assert.equal((await asUser(1, 'SELECT claim_voice_lounge_audio($1) AS allowed', roomArg)).rows[0].allowed, true);
  assert.equal((await asUser(1, 'SELECT claim_voice_lounge_audio($1) AS allowed', roomArg)).rows[0].allowed, false, 'audio cooldown');
  await db.query("UPDATE voice_lounge_members SET audio_requests=240,last_audio_at=now()-interval '1 minute' WHERE room_id=$1 AND user_id=$2", [room, people[1]]);
  assert.equal((await asUser(1, 'SELECT claim_voice_lounge_audio($1) AS allowed', roomArg)).rows[0].allowed, false, 'audio ceiling');
  await asUser(1, "SELECT control_voice_lounge($1,'leave')", roomArg);
  assert.equal((await asUser(1, 'SELECT * FROM voice_lounge_rooms WHERE id=$1', roomArg)).rows.length, 0, 'leaving revokes read access');
  await asUser(1, "SELECT join_voice_lounge($1,'돌아온 친구')", roomArg);
  assert.equal((await asUser(1, 'SELECT claim_voice_lounge_audio($1) AS allowed', roomArg)).rows[0].allowed, false, 'rejoining cannot reset audio quota');
  await db.query("UPDATE voice_lounge_rooms SET ai_turns=120,last_ai_at=now()-interval '1 minute' WHERE id=$1", roomArg);
  assert.equal((await asUser(0, 'SELECT claim_voice_lounge_host($1) AS ticket', roomArg)).rows[0].ticket, null, 'AI room ceiling');
  await asUser(0, "SELECT control_voice_lounge($1,'leave')", roomArg);
  assert.equal((await asUser(1, 'SELECT status FROM voice_lounge_rooms WHERE id=$1', roomArg)).rows[0].status, 'ended', 'host leaving closes room');
  assert.equal((await asUser(1, 'SELECT claim_voice_lounge_audio($1) AS allowed', roomArg)).rows[0].allowed, false);
  await assert.rejects(asUser(1, 'SELECT cleanup_voice_lounges()'), /permission denied/);
  await db.query("UPDATE voice_lounge_rooms SET expires_at=now()-interval '25 hours' WHERE id=$1", roomArg);
  await db.exec('SET ROLE service_role;');
  assert.equal((await db.query('SELECT cleanup_voice_lounges() AS deleted')).rows[0].deleted, 1);
  await db.exec('RESET ROLE;');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM voice_lounge_messages')).rows[0].count, 0, 'cleanup cascades to transcripts');
  const guidedSql = readFileSync(new URL('../supabase/migrations/20261002020000_voice_lounge_guided_sessions.sql', import.meta.url), 'utf8');
  await db.exec(guidedSql); await db.exec(guidedSql);
  const guided = (await asUser(0, "SELECT create_voice_lounge('ina','영화 호프',4,'Host','forest',false) AS id")).rows[0].id;
  for (let i = 1; i < 4; i++) await asUser(i, 'SELECT join_voice_lounge($1,$2)', [guided, `Guest ${i}`]);
  await asUser(0, "SELECT control_voice_lounge($1,'start')", [guided]);
  const sessionAction = async (actor, action, turn = null, seconds = 0) => (await asUser(actor, 'SELECT * FROM control_voice_lounge_session($1,$2,$3,$4)', [guided, action, turn, seconds])).rows[0];
  let session = await sessionAction(0, 'tick');
  assert.equal(session.state, 'ready'); assert.equal(session.speaker_id, people[0]);
  assert.deepEqual(session.round_order, people.slice(0, 4));
  await assert.rejects(sessionAction(1, 'yield', session.turn_id), /방장/);
  await assert.rejects(sessionAction(4, 'raise'), /권한/);
  assert.equal((await asUser(4, 'SELECT * FROM voice_lounge_sessions WHERE room_id=$1', [guided])).rows.length, 0);
  await assert.rejects(asUser(1, "UPDATE voice_lounge_sessions SET speaker_id=$1 WHERE room_id=$2", [people[1], guided]), /permission denied/);
  session = await sessionAction(2, 'raise');
  session = await sessionAction(1, 'raise');
  session = await sessionAction(2, 'raise');
  assert.deepEqual(session.hand_queue, [people[2], people[1]], 'hands are FIFO and deduplicated');
  session = await sessionAction(1, 'lower'); assert.deepEqual(session.hand_queue, [people[2]]);
  session = await sessionAction(1, 'raise');
  session = await sessionAction(3, 'pass'); assert.ok(session.completed.includes(people[3]), 'someone waiting can pass their basic opportunity');
  const oldTurn = session.turn_id;
  const guidedTicket = (await asUser(0, 'SELECT claim_voice_lounge_host($1) AS ticket', [guided])).rows[0].ticket;
  assert.ok(guidedTicket, 'guided rounds allow moderator introductions');
  session = await sessionAction(0, 'begin', session.turn_id);
  assert.equal(session.state, 'speaking');
  assert.equal((await asUser(0, 'SELECT claim_voice_lounge_turn_audio($1,$2) AS allowed', [guided, oldTurn])).rows[0].allowed, true);
  assert.equal((await asUser(1, 'SELECT claim_voice_lounge_turn_audio($1,$2) AS allowed', [guided, oldTurn])).rows[0].allowed, false, 'a different user cannot upload another speaker’s turn');
  assert.equal((await asUser(0, "SELECT finish_voice_lounge_host($1,$2,'늦은 안내','') AS saved", [guided, guidedTicket])).rows[0].saved, false, 'AI introduction cannot play after the user starts');
  session = await sessionAction(0, 'done', session.turn_id);
  assert.equal(session.speaker_id, people[1], 'basic opportunities precede additional hands');
  await asUser(0, "SELECT post_voice_lounge_turn_message($1,$2,'참여한 이유를 나눴어요')", [guided, oldTurn]);
  const delayed = (await db.query('SELECT user_id,turn_id FROM voice_lounge_messages WHERE room_id=$1 ORDER BY id DESC LIMIT 1', [guided])).rows[0];
  assert.equal(delayed.user_id, people[0]); assert.equal(delayed.turn_id, oldTurn, 'late transcripts retain their original speaker and turn');
  await assert.rejects(asUser(1, "SELECT post_voice_lounge_turn_message($1,$2,'잘못된 차례')", [guided, oldTurn]), /차례/);
  assert.equal((await sessionAction(1, 'done', oldTurn)).speaker_id, people[1], 'stale actions cannot skip a newer turn');
  session = await sessionAction(1, 'done', session.turn_id); assert.equal(session.speaker_id, people[2]);
  session = await sessionAction(2, 'done', session.turn_id);
  assert.equal(session.speaker_id, people[2]); assert.equal(session.turn_kind, 'extra', 'first hand receives the first additional turn');
  session = await sessionAction(2, 'done', session.turn_id);
  assert.equal(session.speaker_id, people[1]); assert.equal(session.turn_kind, 'extra');
  session = await sessionAction(1, 'done', session.turn_id); assert.equal(session.state, 'between');
  session = await sessionAction(0, 'tick'); assert.equal(session.stage, 0, 'short pauses do not force a stage change');
  session = await sessionAction(0, 'next_stage'); assert.equal(session.stage, 1); assert.equal(session.speaker_id, people[1], 'round starters rotate');
  await assert.rejects(sessionAction(0, 'next_stage'), /기다리는/);
  session = await sessionAction(1, 'begin', session.turn_id);
  await db.query("UPDATE voice_lounge_sessions SET spoken_seconds=119,activity_at=now()-interval '5 seconds' WHERE room_id=$1", [guided]);
  session = await sessionAction(1, 'activity', session.turn_id, 5);
  assert.ok(session.nudged); assert.equal(session.speaker_id, people[1], 'gentle warning does not cut off a participant');
  const before = session.spoken_seconds;
  session = await sessionAction(1, 'activity', session.turn_id, 10);
  assert.ok(session.spoken_seconds - before < 1, 'duration reports cannot race ahead of elapsed time');
  await assert.rejects(sessionAction(1, 'activity', session.turn_id, 100), /시간/);
  await db.query("UPDATE voice_lounge_sessions SET spoken_seconds=209,activity_at=now()-interval '5 seconds' WHERE room_id=$1", [guided]);
  session = await sessionAction(1, 'activity', session.turn_id, 5);
  assert.equal(session.speaker_id, people[2], 'excessive speaking yields to the next participant');
  // Every remaining round offers all connected participants a basic turn.
  for (let stage = 1; stage <= 5; stage++) {
    const offered = new Set();
    while (session.speaker_id) {
      offered.add(session.speaker_id);
      session = await sessionAction(people.indexOf(session.speaker_id), 'pass', session.turn_id);
    }
    if (stage > 1) assert.equal(offered.size, 4, 'each new stage offers every participant a chance');
    session = await sessionAction(0, 'next_stage');
  }
  assert.equal(session.state, 'finished');
  assert.equal((await db.query('SELECT status FROM voice_lounge_rooms WHERE id=$1', [guided])).rows[0].status, 'ended');
  const soloGuided = (await asUser(0, "SELECT create_voice_lounge('ina','Solo',1,'Host','river',false) AS id")).rows[0].id;
  assert.equal((await db.query('SELECT guided_session FROM voice_lounge_rooms WHERE id=$1', [soloGuided])).rows[0].guided_session, false, 'solo conversation stays free-form');
  await db.exec('DELETE FROM voice_lounge_rooms');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM voice_lounge_sessions')).rows[0].count, 0, 'room cleanup also removes round state');
  console.log('PASS: guided round-robin, hand FIFO, passes, rotated rounds, gentle warnings and long-turn handoff, late transcription attribution and stale AI cancellation; lounge upgrades, RLS, budgets and cleanup.');
} finally { await db.close(); }
