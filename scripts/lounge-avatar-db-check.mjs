import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE public.users(id uuid PRIMARY KEY REFERENCES auth.users(id));
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_profile ON public.users TO authenticated USING (id=auth.uid()) WITH CHECK (id=auth.uid());
GRANT SELECT,UPDATE ON public.users TO authenticated;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects(id text PRIMARY KEY, bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,DELETE ON storage.objects TO authenticated;
INSERT INTO auth.users VALUES ('${owner}'),('${other}'); INSERT INTO public.users VALUES ('${owner}'),('${other}');`);
const sql = readFileSync('supabase/migrations/20261001040000_lounge_profile_avatars.sql','utf8');
await db.exec(sql); await db.exec(sql);
async function asUser(id, sql, anonymous = false) {
  await db.exec('BEGIN; SET LOCAL ROLE authenticated');
  try {
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",[id, JSON.stringify({is_anonymous:anonymous})]);
    const result = await db.query(sql); await db.exec('COMMIT'); return result.rows;
  } catch(error) { await db.exec('ROLLBACK'); throw error; }
}
try {
  assert.equal((await asUser(owner,'SELECT consume_lounge_avatar_generation() AS ok'))[0].ok,true);
  assert.equal((await asUser(owner,'SELECT consume_lounge_avatar_generation() AS ok'))[0].ok,false,'15-second cooldown');
  for (let i=0;i<2;i++) { await db.exec("UPDATE lounge_avatar_generation_limits SET last_attempt_at=now()-interval '1 minute'"); assert.equal((await asUser(owner,'SELECT consume_lounge_avatar_generation() AS ok'))[0].ok,true); }
  await db.exec("UPDATE lounge_avatar_generation_limits SET last_attempt_at=now()-interval '1 minute'");
  assert.equal((await asUser(owner,'SELECT consume_lounge_avatar_generation() AS ok'))[0].ok,false,'three attempts per Korean day');
  await assert.rejects(asUser(owner,'SELECT * FROM lounge_avatar_generation_limits'),/permission denied/);
  await assert.rejects(asUser(other,'SELECT consume_lounge_avatar_generation()',true),/registered account/);
  await db.exec("UPDATE lounge_avatar_generation_limits SET day=day-1");
  assert.equal((await asUser(owner,'SELECT consume_lounge_avatar_generation() AS ok'))[0].ok,true,'next day resets');
  const filename = `${owner}/${other}.webp`;
  await asUser(owner,`INSERT INTO storage.objects VALUES ('own','lounge-avatars','${filename}')`);
  assert.equal((await asUser(other,'SELECT * FROM storage.objects')).length,0,'another account cannot read private avatars');
  assert.equal((await asUser(owner,'SELECT * FROM storage.objects')).length,1);
  await assert.rejects(asUser(other,`INSERT INTO storage.objects VALUES ('bad','lounge-avatars','${filename}')`),/row-level security/);
  await assert.rejects(asUser(owner,`INSERT INTO storage.objects VALUES ('guest','lounge-avatars','${filename}')`,true),/row-level security/);
  await asUser(owner,`UPDATE users SET lounge_avatar_path='${filename}' WHERE id='${owner}'`);
  await assert.rejects(asUser(owner,`UPDATE users SET lounge_avatar_path='${other}/${other}.webp' WHERE id='${owner}'`),/check constraint/);
  await assert.rejects(asUser(owner,`UPDATE users SET lounge_avatar_path='${owner}/../outside.webp' WHERE id='${owner}'`),/check constraint/);
  console.log('Avatar DB: migration idempotency, fixed quota, cooldown, rollover, private storage and profile paths passed.');
} finally { await db.close(); }
