// Isolated PostgreSQL (PGlite); no production database or paid model requests.
// Checks supabase/migrations/20261210000000_lounge_call_usage.sql: how a call is timed, the plan, and the admin's list.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const [a, b] = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2'];
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.users(id uuid PRIMARY KEY,email text,nickname text);
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.admin',true)='yes' $$;`);
  for (const file of ['20261111000000_lounge_speech_usage.sql', '20261209000000_lounge_payments.sql', '20261210000000_lounge_call_usage.sql']) {
    try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')); } catch (error) { throw new Error(`${file}: ${error.message}`); }
  }
  for (const [id, name] of [[a, '가'], [b, '나']]) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${name}@example.com`]);
    await db.query('insert into public.users(id,email,nickname) values($1,$2,$3)', [id, `${name}@example.com`, name]);
  }

  // The first tick only starts the clock.
  let status = (await one('select tick_lounge_call($1,true) s', [a])).s;
  assert.deepEqual(status, { seconds: 0, plan: null });
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
  console.log('lounge call usage SQL checks passed');
} finally { await db.close(); }
