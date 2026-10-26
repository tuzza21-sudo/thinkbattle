// Isolated PostgreSQL only; never connects to a production database or paid APIs.
// Checks migration 20261123000000: a story is continued only while the room's copy is the story as it is today, and a
// prologue may run to 12,000 characters.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const as = async id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;`);
  await db.exec('CREATE TABLE public.users (id uuid PRIMARY KEY, email text, nickname text, provider text);');
  // The lounge's own replay, then every later lounge migration from members' characters on (2026-11-02).
  const all = (await readdir('supabase/migrations')).sort();
  const files = [...all.filter(file => file.includes('voice_lounge')), ...all.filter(file => !file.includes('voice_lounge') && file.includes('lounge') && file >= '20261102')];
  for (const file of files) {
    try { await db.exec(await readFile('supabase/migrations/' + file, 'utf8')); }
    catch (error) { throw new Error(`${file}: ${error.message}`); }
  }
  await db.query('insert into auth.users values($1)', [user]);
  await db.query("insert into public.users(id,nickname,gender,age_group) values($1,'손님1','male','30s')", [user]);
  await as(user);
  const start = async () => (await one("select start_lounge_scenario('closer-contract-love','손님1') as id")).id;
  const first = await start();
  assert.equal(await start(), first, 'the same story continues in the same room');
  await db.query("update lounge_scenarios set prologue=$1 where id='closer-contract-love'", ['새로 쓴 프롤로그. '.repeat(1000)]);
  const second = await start();
  assert.notEqual(second, first, 'a rewritten story opens a new room');
  assert.equal((await one('select scenario->>\'prologue\' as p from voice_lounge_rooms where id=$1', [second])).p.length, '새로 쓴 프롤로그. '.repeat(1000).length, 'the long prologue is kept whole');
  assert.equal(await start(), second, 'and that room is continued after');
  assert.equal((await one("select count(*)::int as n from lounge_scenarios where character_id='closer' and active")).n, 1, '강무진 keeps one story');
  await assert.rejects(db.query("update lounge_scenarios set prologue=$1 where id='closer-contract-love'", ['가'.repeat(12001)]), /prologue_check/);
  console.log('PASS: a story continues while unchanged, a rewritten story opens a new room, prologues to 12,000 characters, one 강무진 story');
} finally { await db.close(); }
