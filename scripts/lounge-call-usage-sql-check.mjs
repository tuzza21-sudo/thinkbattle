// Isolated PostgreSQL (PGlite); no production database or paid model requests.
// Checks supabase/migrations/20261210000000_lounge_call_usage.sql: how a call is timed, the plan, and the admin's list.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const [a, b] = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'];
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz DEFAULT now()); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.users(id uuid PRIMARY KEY,email text,nickname text);
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.admin',true)='yes' $$;`);
  await db.exec('CREATE TABLE public.lounge_beta_testers(user_id uuid PRIMARY KEY)');
  for (const file of ['20261111000000_lounge_speech_usage.sql', '20261209000000_lounge_payments.sql', '20261210000000_lounge_call_usage.sql', '20261210040000_lounge_call_exempt.sql', '20261210060000_lounge_call_testers_limited.sql']) {
    try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')); } catch (error) { throw new Error(`${file}: ${error.message}`); }
  }
  for (const [id, name] of [[a, '가'], [b, '나']]) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${name}@example.com`]);
    await db.query('insert into public.users(id,email,nickname) values($1,$2,$3)', [id, `${name}@example.com`, name]);
  }

  // The first tick only starts the clock.
  let status = (await one('select tick_lounge_call($1,true) s', [a])).s;
  assert.deepEqual(status, { seconds: 0, plan: null, exempt: false, tester: false });
  // A later tick adds the time since the last one.
  await db.query("update lounge_call_usage set last_tick_at = now() - interval '30 seconds' where user_id=$1", [a]);
  status = (await one('select tick_lounge_call($1,false) s', [a])).s;
  assert.ok(status.seconds >= 30 && status.seconds <= 32, `30 seconds added, got ${status.seconds}`);
  // Never more than a minute at once, and nothing after a gap (a call that dropped is not time spent).
  await db.query("update lounge_call_usage set last_tick_at = now() - interval '85 seconds' where user_id=$1", [a]);
  const afterLong = (await one('select tick_lounge_call($1,false) s', [a])).s.seconds;
  assert.equal(afterLong - status.seconds, 60, 'at most a minute at once');
  await db.query("update lounge_call_usage set last_tick_at = now() - interval '10 minutes' where user_id=$1", [a]);
  assert.equal((await one('select tick_lounge_call($1,false) s', [a])).s.seconds, afterLong, 'a gap adds nothing');
  // A start tick never adds time.
  await db.query("update lounge_call_usage set last_tick_at = now() - interval '20 seconds' where user_id=$1", [a]);
  assert.equal((await one('select tick_lounge_call($1,true) s', [a])).s.seconds, afterLong);

  // The plan: the paid one whose month has not ended; Pro over Plus; an ended or unpaid one is none.
  const pay = (user, plan, status, end, oid) => db.query("insert into lounge_payments(user_id,plan,amount,oid,device,status,period_start,period_end) values($1,$2,1,$3,'pc',$4,now()-interval '1 day',$5)", [user, plan, oid, status, end]);
  assert.equal((await one('select lounge_active_plan($1) p', [b])).p, null);
  await pay(b, 'plus', 'paid', new Date(Date.now() + 864e5), 'o1');
  assert.equal((await one('select lounge_active_plan($1) p', [b])).p, 'plus');
  await pay(b, 'pro', 'pending', new Date(Date.now() + 864e5), 'o2');
  assert.equal((await one('select lounge_active_plan($1) p', [b])).p, 'plus', 'an unpaid order is not a plan');
  await pay(b, 'pro', 'paid', new Date(Date.now() + 864e5), 'o3');
  assert.equal((await one('select lounge_active_plan($1) p', [b])).p, 'pro');
  await db.query("update lounge_payments set period_end = now() - interval '1 hour' where user_id=$1", [b]);
  assert.equal((await one('select lounge_active_plan($1) p', [b])).p, null, 'a plan that ended');

  // The administrator's list: minutes and credits together, only for the administrator.
  await db.query("insert into lounge_speech_usage(user_id,month,engine,chars) values($1,lounge_speech_month(),'eleven-v4-turbo',1200),($1,lounge_speech_month(),'typecast',300)", [b]);
  await db.exec("select set_config('test.admin','no',false)");
  await assert.rejects(() => db.query('select admin_list_lounge_usage(null)'), /not authorized/);
  await db.exec("select set_config('test.admin','yes',false)");
  const list = (await one('select admin_list_lounge_usage(null) r')).r;
  assert.equal(list.members.length, 2);
  const mine = list.members.find(member => member.user_id === a), other = list.members.find(member => member.user_id === b);
  assert.equal(mine.seconds, afterLong); assert.equal(mine.credits, 0);
  assert.equal(other.credits, 1500, 'all premium engines are added'); assert.equal(other.seconds, 0);
  // Another month shows nothing of this one.
  assert.deepEqual((await one("select admin_list_lounge_usage(date_trunc('month', now() - interval '40 days')::date) r")).r.members, []);
  // Who the minutes bind (20261210040000): the admin (email or Kakao account) and a beta tester never; a member without a plan only
  // when they signed up after the limit began; a member with a plan always.
  await db.exec("UPDATE public.lounge_call_limits SET applies_from = now() - interval '1 day'");
  const mk = async (id, email, createdAgo) => { await db.query("insert into auth.users(id,email,created_at) values($1,$2,now() - $3::interval)", [id, email, createdAgo]); };
  const [early, late, tester, admin, kakao, paid] = ['1', '2', '3', '4', '5', '6'].map(n => `00000000-0000-4000-8000-00000000000${n}`);
  const kakaoId = 'd8771e72-7ae4-4402-b8cc-dc52e13bebff';
  await mk(early, 'early@example.com', '10 days'); await mk(late, 'late@example.com', '1 hour'); await mk(tester, 'tester@example.com', '1 hour');
  await mk(admin, 'Piorne@Naver.com', '1 hour'); await mk(kakaoId, null, '1 hour'); await mk(paid, 'paid@example.com', '1 hour');
  await db.query('insert into lounge_beta_testers(user_id) values($1)', [tester]);
  await pay(paid, 'plus', 'paid', new Date(Date.now() + 864e5), 'o9');
  const exempt = async id => (await one('select lounge_call_exempt($1) e', [id])).e;
  assert.equal(await exempt(early), true, 'a member from before the limit');
  assert.equal(await exempt(late), false, 'a new member');
  assert.equal(await exempt(tester), false, 'a beta tester has 30 minutes, not none');
  assert.equal((await one('select lounge_call_tester($1) t', [tester])).t, true);
  await db.query("update auth.users set created_at = now() - interval '10 days' where id=$1", [tester]);
  assert.equal(await exempt(tester), false, 'a tester who signed up before the limit is still a tester');
  assert.equal(await exempt(admin), true, 'the email account of the admin');
  assert.equal(await exempt(kakaoId), true, 'the Kakao account of the admin');
  assert.equal(await exempt(paid), false, 'a new member with a plan');
  await db.query("update auth.users set created_at = now() - interval '10 days' where id=$1", [paid]);
  assert.equal(await exempt(paid), false, 'a plan always has its minutes, even for an earlier member');
  assert.deepEqual((await one('select lounge_call_status($1) s', [late])).s, { seconds: 0, plan: null, exempt: false, tester: false });
  assert.equal((await one('select lounge_call_status($1) s', [tester])).s.tester, true);
  await db.exec("select set_config('test.admin','yes',false)");
  const members = (await one('select admin_list_lounge_usage(null) r')).r.members;
  assert.ok(members.every(member => typeof member.exempt === 'boolean' && typeof member.tester === 'boolean'), 'the list says who is exempt and who is a tester');
  console.log('lounge call usage SQL checks passed');
} finally { await db.close(); }
