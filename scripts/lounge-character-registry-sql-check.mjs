// Isolated PostgreSQL only; never connects to a production database or paid APIs.
// Checks migration 20261120000000: a house character is one row of lounge_house_characters, and nothing else needs SQL.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const as = async id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
const memberCharacter = `c_${'a'.repeat(32)}`;
const houses = ['jaeseok', 'ina', 'auditor', 'closer', 'velvet', 'trickster', 'diplomat', 'lawyer'];
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;`);
  // The profile table belongs to the app and is not in the replay: a stand-in with the columns the lounge migrations use.
  await db.exec('CREATE TABLE public.users (id uuid PRIMARY KEY, email text, nickname text, provider text);');
  for (const file of (await readdir('supabase/migrations')).filter(file => file.includes('voice_lounge')).sort()) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
  await db.query('insert into auth.users values($1)', [user]);
  await db.query("insert into public.users(id,nickname,gender,age_group) values($1,'손님1','male','30s')", [user]);
  // The stories table came later and is not part of this replay: a stand-in with the same inline check, as it was written.
  await db.exec(`CREATE TABLE public.lounge_scenarios (id text PRIMARY KEY,
    character_id text NOT NULL CHECK (character_id IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer')));
    INSERT INTO public.lounge_scenarios VALUES ('s1','ina');`);

  // Before: a ninth character is refused by every one of the places that listed the eight.
  await as(user);
  await assert.rejects(db.query("insert into voice_lounge_spaces(id,name,host_persona,theme,sort) values('new-space','새 공간','newbie','cafe',20)"), /host_persona_check/);
  await assert.rejects(db.query("insert into lounge_scenarios values('s2','newbie')"), /character_id_check/);

  await db.exec(await readFile('supabase/migrations/20261120000000_lounge_character_registry.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261120000000_lounge_character_registry.sql', 'utf8')); // and it can be run twice

  // The eight are registered and nothing about them changed.
  assert.deepEqual((await db.query('select id from lounge_house_characters order by id')).rows.map(row => row.id), [...houses].sort());
  for (const id of houses) assert.equal((await one('select is_lounge_house_character($1) as ok', [id])).ok, true, id);
  assert.equal((await one('select is_lounge_house_character($1) as ok', ['newbie'])).ok, false);
  assert.equal((await one('select is_lounge_house_character(NULL) as ok')).ok, false);
  assert.equal((await one('select is_lounge_character($1) as ok', [memberCharacter])).ok, true, 'a member\'s character is a character');
  assert.equal((await one('select is_lounge_house_character($1) as ok', [memberCharacter])).ok, false, 'but not a house one');
  assert.equal((await one('select is_lounge_character($1) as ok', ['c_nothex'])).ok, false);
  const spaces = (await db.query('select host_persona from list_voice_lounge_spaces()')).rows.map(row => row.host_persona);
  // (the detective's space is closed, so seven characters are listed)
  assert.ok(spaces.every(id => houses.includes(id)) && new Set(spaces).size >= 7, 'the characters keep their open spaces');
  await as(user);
  const table = (await one("select open_voice_lounge_table('hotel-bar','손님1','영화 이야기','velvet','{}'::text[],NULL::integer) as id")).id;
  assert.equal((await one('select host_persona from voice_lounge_rooms where id=$1', [table])).host_persona, 'velvet', 'a table opens as before');
  const solo = (await one("select start_voice_lounge_solo('hotel-bar','손님1') as id")).id;
  assert.equal((await one('select host_persona from voice_lounge_rooms where id=$1', [solo])).host_persona, 'velvet', 'a one-to-one chat starts as before');
  await assert.rejects(db.query("select open_voice_lounge_table('hotel-bar','손님1','주제','nope','{}'::text[],NULL::integer)"), /캐릭터를 골라/, 'an unknown character is refused by the function');
  await assert.rejects(db.query("select start_voice_lounge_solo('hotel-bar','손님1','nope')"), /캐릭터를 골라/);
  await assert.rejects(db.query("select set_voice_lounge_persona($1,'nope')", [table]), /캐릭터를 골라|바꿀 수/);
  await assert.rejects(db.query("update voice_lounge_rooms set host_persona='nope' where id=$1", [table]), /host_persona_check/, 'a room cannot hold an unknown character');
  await assert.rejects(db.query("insert into lounge_scenarios values('s3','nope')"), /character_id_check/);
  await db.query('update voice_lounge_rooms set host_persona=$2 where id=$1', [solo, memberCharacter]);
  assert.equal((await one('select host_persona from voice_lounge_rooms where id=$1', [solo])).host_persona, memberCharacter, 'a room may hold a member\'s character');

  // A ninth character: one row, then its space, a table, a one-to-one chat and a story all work, with no other SQL.
  await db.query("insert into lounge_house_characters(id) values('newbie')");
  await db.query("insert into voice_lounge_spaces(id,name,host_persona,theme,sort) values('new-space','새 공간','newbie','cafe',20)");
  await db.query("insert into lounge_scenarios values('s2','newbie')");
  await as(user);
  const newTable = (await one("select open_voice_lounge_table('new-space','손님1','새 이야기','newbie','{}'::text[],NULL::integer) as id")).id;
  assert.equal((await one('select host_persona from voice_lounge_rooms where id=$1', [newTable])).host_persona, 'newbie');
  await db.query("update voice_lounge_rooms set status='ended' where id=$1", [newTable]);
  const newSolo = (await one("select start_voice_lounge_solo('new-space','손님1') as id")).id;
  assert.equal((await one('select host_persona from voice_lounge_rooms where id=$1', [newSolo])).host_persona, 'newbie');
  await as(null);
  assert.ok((await db.query('select * from list_voice_lounge_spaces()')).rows.some(row => row.host_persona === 'newbie'), 'the new space is listed');
  // An id of the wrong shape cannot even be registered.
  await assert.rejects(db.query("insert into lounge_house_characters(id) values('Bad Id')"), /check/);
  console.log('character registry checks passed');
} finally { await db.close(); }
