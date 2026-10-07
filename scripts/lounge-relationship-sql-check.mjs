// Isolated PostgreSQL only; never connects to a production database or paid APIs.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const ids = Array.from({ length: 3 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const as = async id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
const latestSql = await readFile('supabase/migrations/20261006010000_voice_lounge_relationships.sql', 'utf8');
const state = (scores, stage = 'DISMISSIVE', turn = 1) => JSON.stringify({ scores, stage, pending: { direction: null, turns: 0 }, recentEvents: [{ type: 'ADMITS_ERROR', turn, at: '2026-10-06T00:00:00Z' }], memories: [], meaningfulTurns: turn, turnCount: turn, lastInteractionAt: '2026-10-06T00:00:00Z' });
const save = async (user, character, room, version, json, mood = null) => (await one('select save_voice_lounge_relationship($1,$2,$3,$4,$5::jsonb,$6::jsonb) as v', [user, character, room, version, json, mood])).v;
const create = async (user, persona, capacity) => { await as(user); return (await one("select create_voice_lounge($1,'관계 테스트',$2,'민수','river',false) as id", [persona, capacity])).id; };
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;`);
  for (const file of (await readdir('supabase/migrations')).filter(file => file.includes('voice_lounge')).sort()) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
  for (const id of ids) await db.query('insert into auth.users values($1)', [id]);

  // All six hosts can open rooms of any size; the two removed hosts cannot be chosen any more.
  const velvetA = await create(ids[0], 'velvet', 1);
  const velvetGroup = await create(ids[0], 'velvet', 4);
  assert.ok(await create(ids[0], 'jaeseok', 4));
  assert.ok(await create(ids[0], 'ina', 1));
  for (const removed of ['sunny', 'dodi']) await assert.rejects(create(ids[0], removed, 4), /host_persona_check/);
  const auditorA = await create(ids[0], 'auditor', 1), auditorB = await create(ids[1], 'auditor', 1);
  // Rooms with other people never write a relationship, even for the same host.
  assert.equal(await save(ids[0], 'velvet', velvetGroup, 0, state({ trust: 10, respect: 20, interest: 40, comfort: 15, openness: 10, intrigue: 35, poise: 50 })), null, 'a group room cannot change a relationship');

  // The room switch for the few-shot examples: on by default, only the host can change it.
  assert.equal((await one('select style_examples from voice_lounge_rooms where id=$1', [velvetA])).style_examples, true, 'on by default');
  await as(ids[0]); await db.query('select set_voice_lounge_style_examples($1,false)', [velvetA]);
  assert.equal((await one('select style_examples from voice_lounge_rooms where id=$1', [velvetA])).style_examples, false);
  await as(ids[1]); await assert.rejects(db.query('select set_voice_lounge_style_examples($1,true)', [velvetA]), /방장만/);
  assert.equal((await one('select style_examples from voice_lounge_rooms where id=$1', [velvetA])).style_examples, false, 'a guest cannot change it');
  await as(ids[0]); await db.query('select set_voice_lounge_style_examples($1,true)', [velvetA]);

  // Optimistic versions: create once, update only from the stored version.
  const scores = { trust: 10, respect: 20, interest: 40, comfort: 15, openness: 10, intrigue: 35, poise: 50 };
  assert.equal(await save(ids[0], 'velvet', velvetA, 0, state(scores), JSON.stringify({ curiosity: 40 })), 1);
  assert.equal(await save(ids[0], 'velvet', velvetA, 0, state(scores)), null, 'a second create does not overwrite');
  assert.equal(await save(ids[0], 'velvet', velvetA, 1, state({ ...scores, trust: 14 }, 'DISMISSIVE', 2)), 2);
  assert.equal(await save(ids[0], 'velvet', velvetA, 1, state({ ...scores, trust: 99 })), null, 'a stale version is rejected');
  let row = await one('select * from voice_lounge_relationships where user_id=$1 and character_id=$2', [ids[0], 'velvet']);
  assert.equal(row.scores.trust, 14); assert.equal(row.version, 2); assert.equal(row.turn_count, 2); assert.equal(row.recent_events.length, 1);
  assert.deepEqual((await one('select ai_mood from voice_lounge_rooms where id=$1', [velvetA])).ai_mood, { curiosity: 40 }, 'session mood is stored on the room');

  // Only the room's own one-to-one host and character can be written.
  assert.equal(await save(ids[1], 'velvet', velvetA, 2, state(scores)), null, 'another user cannot write this pair');
  assert.equal(await save(ids[0], 'auditor', velvetA, 0, state(scores)), null, 'the character must match the room');
  await assert.rejects(save(ids[0], 'velvet', velvetA, 2, state({ ...scores, trust: 120 })), /invalid relationship score/);
  await assert.rejects(save(ids[0], 'velvet', velvetA, 2, JSON.stringify({ scores })), /invalid relationship state/);

  // Each user and character pair is independent.
  const auditorScores = { trust: 20, respect: 30, interest: 40, comfort: 30, openness: 15, epistemicHonesty: 50, rigor: 40 };
  assert.equal(await save(ids[0], 'auditor', auditorA, 0, state({ ...auditorScores, trust: 23 }, 'UNVERIFIED')), 1);
  assert.equal(await save(ids[1], 'auditor', auditorB, 0, state({ ...auditorScores, trust: 6 }, 'UNVERIFIED')), 1);
  const rows = (await db.query('select user_id, character_id, scores->>\'trust\' as trust from voice_lounge_relationships order by user_id, character_id')).rows;
  assert.deepEqual(rows.map(item => `${item.user_id.slice(-1)}:${item.character_id}:${item.trust}`), ['1:auditor:23', '1:velvet:14', '2:auditor:6']);

  // Browsers cannot read or write raw state; only the server role can.
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await one("select has_table_privilege($1,'public.voice_lounge_relationships','SELECT') ok", [role])).ok, false);
    assert.equal((await one("select has_function_privilege($1,'public.save_voice_lounge_relationship(uuid,text,text,integer,jsonb,jsonb)','EXECUTE') ok", [role])).ok, false);
  }
  assert.equal((await one("select has_function_privilege('service_role','public.save_voice_lounge_relationship(uuid,text,text,integer,jsonb,jsonb)','EXECUTE') ok")).ok, true);
  assert.equal((await one("select relrowsecurity from pg_class where relname='voice_lounge_relationships'")).relrowsecurity, true);

  // Rooms created before the removal are moved to the closest remaining host.
  await db.exec("ALTER TABLE voice_lounge_rooms DROP CONSTRAINT voice_lounge_rooms_host_persona_check");
  await db.query("update voice_lounge_rooms set host_persona='sunny' where id=$1", [velvetGroup]);
  await db.query("update voice_lounge_rooms set host_persona='dodi' where id=$1", [auditorB]);
  await db.exec(await readFile('supabase/migrations/20261007000000_voice_lounge_six_hosts.sql', 'utf8'));
  assert.equal((await one('select host_persona from voice_lounge_rooms where id=$1', [velvetGroup])).host_persona, 'jaeseok');
  assert.equal((await one('select host_persona from voice_lounge_rooms where id=$1', [auditorB])).host_persona, 'ina');

  await db.exec(latestSql);
  await db.exec(await readFile('supabase/migrations/20261007000000_voice_lounge_six_hosts.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261008000000_voice_lounge_style_examples_toggle.sql', 'utf8'));
  row = await one('select * from voice_lounge_relationships where user_id=$1 and character_id=$2', [ids[0], 'velvet']);
  assert.equal(row.version, 2, 'reapplying the migration keeps stored relationships');
  console.log('PASS: six hosts in rooms of any size, relationships written only for one-to-one rooms, removed hosts migrated, optimistic versions, room/user/character binding, score validation, session mood on the room, independent user-character rows, server-only access and reapplication.');
} catch (error) { console.error(error.stack); process.exitCode = 1; } finally { await db.close(); }
