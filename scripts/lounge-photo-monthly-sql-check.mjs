// Isolated PostgreSQL (PGlite); no production database or paid model requests.
// Checks supabase/migrations/20261211000000_lounge_photo_monthly.sql: the month's number of photos by plan.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const user = '00000000-0000-4000-8000-0000000000a1', room = 'lounge-00000000-0000-4000-8000-000000000001';
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.lounge_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Seoul')::date $$;
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects(bucket_id text, name text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name,'/') $$;
    CREATE TABLE public.voice_lounge_rooms(id text PRIMARY KEY, host_id uuid, capacity integer, space_id text, status text, host_persona text);`);
  for (const file of ['20261101000000_lounge_character_photos.sql', '20261211000000_lounge_photo_monthly.sql']) {
    try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')); } catch (error) { throw new Error(`${file}: ${error.message}`); }
  }
  await db.query('insert into auth.users(id) values($1)', [user]);
  await db.query("insert into voice_lounge_rooms values($1,$2,1,null,'active','velvet')", [room, user]);
  await db.query('update lounge_image_settings set daily_per_user=100');
  const claim = async (monthly, source = 'request') => (await one('select claim_lounge_character_photo($1,$2,$3,$4,$5) c', [user, room, source, '장면', monthly])).c;
  const ready = async () => { await db.query("update lounge_character_posts set status='ready' where user_id=$1", [user]); };

  // Three a month for a member without a plan: the fourth is stopped, with the number.
  for (let index = 0; index < 3; index++) { assert.equal((await claim(3)).state, 'claimed', `photo ${index + 1}`); await ready(); }
  assert.deepEqual(await claim(3), { state: 'month_limit', monthly: 3 });
  // The same photos under a larger number: Plus 10 still has room, and no number (the admin) is never stopped.
  assert.equal((await claim(10)).state, 'claimed'); await ready();
  assert.equal((await claim(null)).state, 'claimed'); await ready();
  // Without p_monthly (an old caller) there is no monthly limit: the daily number is the only ceiling.
  assert.equal((await one('select claim_lounge_character_photo($1,$2,$3,$4) c', [user, room, 'request', 'x'])).c.state, 'claimed'); await ready();
  // The photos of earlier months do not count.
  await db.query("update lounge_character_posts set created_at = lounge_month_start() - interval '1 day' where user_id=$1", [user]);
  assert.equal((await claim(3)).state, 'claimed', 'a new month begins with none used'); await ready();
  const usage = (await one("select set_config('request.jwt.claim.sub',$1,false) s, get_my_lounge_photo_usage() u", [user])).u;
  assert.equal(usage.monthUsed, 1);
  console.log('lounge photo monthly sql: ok');
} finally { await db.close(); }
