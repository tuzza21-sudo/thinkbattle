// Isolated PostgreSQL only; never connects to a production database or paid APIs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const admin = '00000000-0000-4000-8000-0000000000a1', visitor = '00000000-0000-4000-8000-0000000000b2';
const alice = '00000000-0000-4000-8000-0000000000c3', bob = '00000000-0000-4000-8000-0000000000d4';
const as = async (id, email) => db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)", [id ?? '', JSON.stringify(email ? { sub: id, email } : {})]);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
// A unit vector with its weight on one axis (and a little on another), so the similarity between two of them is easy to reason about:
// the dot product of axis(0) and axis(0, n, mix) is sqrt(1 - mix^2).
const axis = (index, other = -1, mix = 0) => { const v = new Array(256).fill(0); v[index] = Math.sqrt(1 - mix * mix); if (other >= 0) v[other] = mix; return v; };
const vector = v => `{${v.join(',')}}`;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-4, `${label}: ${actual} vs ${expected}`);
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'piorne@naver.com' $$;`);
  const first = await readFile('supabase/migrations/20261011000000_lounge_character_knowledge.sql', 'utf8');
  const second = await readFile('supabase/migrations/20261012000000_lounge_knowledge_selection.sql', 'utf8');
  await db.exec(first);
  // An entry saved before the second file existed must survive it.
  await as(admin, 'piorne@naver.com');
  const legacy = (await one("select admin_save_lounge_knowledge(null,'lawyer','knowledge','예전 항목','예전 내용',true,$1::real[]) as id", [vector(axis(20))])).id;
  await db.exec(second);
  assert.equal((await one('select title, tags, lesson, time_sensitive from lounge_character_knowledge where id=$1', [legacy])).tags.length, 0);

  // Only the super administrator manages entries.
  await as(visitor, 'visitor@example.test');
  for (const sql of ["select admin_list_lounge_knowledge(null)", "select admin_save_lounge_knowledge(null,'lawyer','knowledge','t','c',true,null)", "select admin_delete_lounge_knowledge(gen_random_uuid())"])
    await assert.rejects(db.query(sql), /not authorized/);
  await as(admin, 'PIORNE@naver.com');

  const save = (id, character, kind, title, content, active, v, extra = {}) => one('select admin_save_lounge_knowledge($1,$2,$3,$4,$5,$6,$7::real[],$8::text[],$9,$10,$11,$12,$13) as id',
    [id, character, kind, title, content, active, v ? vector(v) : null, `{${(extra.tags ?? []).join(',')}}`, extra.lesson ?? null, extra.category ?? null, extra.note ?? null, extra.asOf ?? null, extra.sensitive ?? false]).then(row => row.id);
  const K1 = await save(null, 'lawyer', 'knowledge', '증거능력과 증명력', '증거능력은 법정에서 쓸 수 있는 자격이다.', true, axis(0), { tags: ['증거', '재판'], note: '교과서 요약', asOf: '2026-01-01', sensitive: true });
  const K2 = await save(null, 'lawyer', 'knowledge', '반대신문의 원칙', '질문은 하나씩, 유도하지 않는다.', true, axis(0, 1, 0.7));
  const K3 = await save(null, 'lawyer', 'knowledge', '약하게 닿는 지식', '질문과 조금만 닿는 지식.', true, axis(0, 2, 0.9));
  const E1 = await save(null, 'lawyer', 'experience', '세 번째 질문에서 나온 답', '같은 질문을 세 번 물었더니 세 번째에 진짜 답이 나왔다.', true, axis(0), { lesson: '돌려 말하는 사람에게는 질문을 바꿔 한 번 더 묻는다.', category: 'success', tags: ['반대신문'] });
  const E5 = await save(null, 'lawyer', 'experience', '몰아붙였다가 후회한 사건', '증인을 너무 몰아붙여 이겼지만 후회한 일.', true, axis(0, 6, 0.5), { lesson: '이기는 질문과 옳은 질문은 다르다.', category: 'failure' });
  const E4 = await save(null, 'lawyer', 'experience', '합의를 권한 사건', '재판 대신 합의를 권했던 사건.', true, axis(0, 5, 0.8), { category: 'decision' });
  const E3 = await save(null, 'lawyer', 'experience', '약하게 닿는 일화', '질문과 조금만 닿는 일화.', true, axis(0, 4, 0.9), { category: 'case' });
  const off = await save(null, 'lawyer', 'experience', '비활성 일화', '쓰지 않는 일화.', false, axis(0), { category: 'case' });
  const other = await save(null, 'diplomat', 'experience', '다른 캐릭터의 일화', '다른 캐릭터의 일화.', true, axis(0), { category: 'case' });

  // The new fields are stored, belong to their kind only, and are shown to the administrator with how often they were used.
  const listed = (await db.query("select * from admin_list_lounge_knowledge('lawyer')")).rows;
  const k1 = listed.find(row => row.id === K1), e1 = listed.find(row => row.id === E1);
  assert.deepEqual([k1.tags, k1.source_note, k1.time_sensitive, k1.lesson, k1.category], [['증거', '재판'], '교과서 요약', true, null, null]);
  assert.equal(String(k1.as_of.toISOString?.().slice(0, 10) ?? k1.as_of).slice(0, 10), '2026-01-01');
  assert.deepEqual([e1.lesson, e1.category, e1.source_note, e1.as_of, e1.time_sensitive, e1.times_shown], ['돌려 말하는 사람에게는 질문을 바꿔 한 번 더 묻는다.', 'success', null, null, false, 0]);
  const strayKnowledge = await save(null, 'lawyer', 'knowledge', '종류에 맞지 않는 칸', '내용', true, axis(30), { lesson: '교훈', category: 'success' });
  assert.deepEqual((await one('select lesson, category from lounge_character_knowledge where id=$1', [strayKnowledge])), { lesson: null, category: null }, 'an experience-only field is dropped from a fact');
  const strayExperience = await save(null, 'lawyer', 'experience', '종류에 맞지 않는 칸', '내용', true, axis(31), { note: '출처', asOf: '2026-01-01', sensitive: true });
  assert.deepEqual((await one('select source_note, as_of, time_sensitive from lounge_character_knowledge where id=$1', [strayExperience])), { source_note: null, as_of: null, time_sensitive: false }, 'a fact-only field is dropped from an experience');
  await db.query('delete from lounge_character_knowledge where id = any($1::uuid[])', [[strayKnowledge, strayExperience]]);
  await assert.rejects(save(null, 'lawyer', 'knowledge', 't', 'c', true, axis(1), { sensitive: true }), /selection_check/, 'a time-sensitive fact needs the date it holds from');
  await assert.rejects(save(null, 'lawyer', 'experience', 't', 'c', true, axis(1), { category: 'legend' }), /selection_check/);
  await assert.rejects(save(null, 'lawyer', 'experience', 't', 'c', true, axis(1), { lesson: 'x'.repeat(301) }), /selection_check/);
  await assert.rejects(save(null, 'lawyer', 'knowledge', 't', 'c', true, axis(1), { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }), /selection_check/);
  await assert.rejects(save(null, 'Lawyer!', 'knowledge', 't', 'c', true, axis(1)), /character_id/);
  await assert.rejects(save(null, 'lawyer', 'rumour', 't', 'c', true, axis(1)), /kind/);
  await assert.rejects(save(null, 'lawyer', 'knowledge', ' ', 'c', true, axis(1)), /title/);
  await assert.rejects(save(null, 'lawyer', 'knowledge', 't', 'x'.repeat(2001), true, axis(1)), /content/);
  await assert.rejects(save(null, 'lawyer', 'knowledge', 't', 'c', true, [1, 0]), /embedding/);
  await assert.rejects(save(crypto.randomUUID(), 'lawyer', 'knowledge', 't', 'c', true, axis(1)), /not found/);

  // The lookup: the service role, not the person, calls it. Returns up to two facts and one experience.
  const pick = async (character, v, room, users = [], snippet = null) => (await db.query('select * from pick_lounge_character_knowledge($1,$2::real[],$3,$4::uuid[],$5)', [character, vector(v), room, `{${users.join(',')}}`, snippet])).rows;
  const ids = rows => rows.map(row => row.id);
  const storyIds = rows => ids(rows.filter(row => row.kind === 'experience'));
  const uses = async room => (await db.query('select entry_id, user_id, snippet from lounge_character_knowledge_uses where room_id=$1 order by id', [room])).rows;
  const ago = (room, seconds) => db.query("update lounge_character_knowledge_uses set used_at = used_at - make_interval(secs => $2) where room_id=$1", [room, seconds]);
  const longQuestion = '증거능력이 정확히 뭔가요? '.repeat(20);

  // Turn 1: two facts (the third is cut by the limit) and the best experience. The experience is recorded, the facts are not.
  let rows = await pick('lawyer', axis(0), 'room-a', [alice], longQuestion);
  assert.deepEqual(ids(rows.filter(row => row.kind === 'knowledge')), [K1, K2], 'the two closest facts');
  assert.deepEqual(storyIds(rows), [E1], 'one experience, the closest');
  assert.equal(rows.length, 3);
  const shown = rows.find(row => row.id === E1);
  assert.deepEqual([shown.lesson, shown.category, shown.time_sensitive], ['돌려 말하는 사람에게는 질문을 바꿔 한 번 더 묻는다.', 'success', false]);
  assert.equal(rows.find(row => row.id === K1).time_sensitive, true);
  let log = await uses('room-a');
  assert.equal(log.length, 1); assert.deepEqual([log[0].entry_id, log[0].user_id], [E1, alice]); assert.equal(log[0].snippet.length, 120, 'the start of the question is kept, not all of it');
  assert.ok(!ids(rows).includes(off) && !ids(rows).includes(other) && !ids(rows).includes(legacy), 'inactive, other characters and unrelated entries are not returned');

  // Turn 2, moments later in the same room: no experience at all, but the facts are still given.
  rows = await pick('lawyer', axis(0), 'room-a', [alice]);
  assert.deepEqual(ids(rows), [K1, K2], 'the same question does not bring a story again right away');
  assert.equal((await uses('room-a')).length, 1, 'nothing new is recorded when nothing was shown');

  // A minute later a story may come again, but never one this person has heard.
  await ago('room-a', 60);
  rows = await pick('lawyer', axis(0), 'room-a', [alice]);
  assert.deepEqual(storyIds(rows), [E5], 'a different story, the next closest');
  near(rows.find(row => row.id === E5).score, 0.866, 'score of the second story');
  await ago('room-a', 60);
  assert.deepEqual(storyIds(await pick('lawyer', axis(0), 'room-a', [alice])), [E4], 'and a third');
  await ago('room-a', 60);
  assert.deepEqual(storyIds(await pick('lawyer', axis(0), 'room-a', [alice])), [], 'every story that fits has been told, so none is repeated (the weakly matching one never qualifies)');
  assert.ok(ids(await pick('lawyer', axis(0), 'room-a', [alice])).includes(K1), 'facts are still given');
  assert.equal(ids(await pick('lawyer', axis(0, 2, 0.9), 'room-x')).includes(K3), true, 'a fact above the lower threshold is given');
  assert.ok(!ids(await pick('lawyer', axis(0), 'room-x2', [])).includes(E3), 'a story below the experience threshold is never given');
  await db.query("delete from lounge_character_knowledge_uses where room_id in ('room-x','room-x2')");

  // Once told, never again to that person: not a year later, and not in another room.
  await ago('room-a', 400 * 86400);
  assert.deepEqual(storyIds(await pick('lawyer', axis(0), 'room-a', [alice])), [], 'a year later, in the same room');
  assert.deepEqual(storyIds(await pick('lawyer', axis(0), 'room-b', [alice])), [], 'a year later, in another room');
  assert.equal((await uses('room-b')).length, 0, 'nothing is recorded when nothing is shown');

  // A different person who has not heard them gets the best story, at full score.
  rows = await pick('lawyer', axis(0), 'room-c', [bob]);
  assert.deepEqual(storyIds(rows), [E1]); near(rows.find(row => row.id === E1).score, 1.0, 'a stranger hears the best story at full score');
  assert.equal(rows.find(row => row.id === E1).retold, false, 'told for the first time to everyone present');

  // A group is told a story as long as at least one person present has not heard it. Here alice has heard all three,
  // bob only E1: so E1 is out (everyone has heard it) and the best story someone has not heard is E5.
  const carol = '00000000-0000-4000-8000-0000000000e5', dave = '00000000-0000-4000-8000-0000000000f6', erin = '00000000-0000-4000-8000-0000000000a7', frank = '00000000-0000-4000-8000-0000000000b8';
  rows = await pick('lawyer', axis(0), 'room-g1', [alice, bob]);
  assert.deepEqual(storyIds(rows), [E5], 'bob has not heard E5, so the group is told it');
  assert.equal(rows.find(row => row.id === E5).retold, true, 'and the character is told that some of them have heard it');
  assert.deepEqual((await uses('room-g1')).map(row => [row.entry_id, row.user_id]), [[E5, bob]], 'it is recorded only for the person who had not heard it');
  assert.deepEqual(storyIds(await pick('lawyer', axis(0), 'room-g1', [alice, bob])), [], 'not again right away');
  await ago('room-g1', 60);
  assert.deepEqual(storyIds(await pick('lawyer', axis(0), 'room-g1', [alice, bob])), [E4], 'a minute later, the one bob has not heard');
  await ago('room-g1', 60);
  assert.deepEqual(storyIds(await pick('lawyer', axis(0), 'room-g1', [alice, bob])), [], 'now everyone present has heard everything that fits, so none is told');
  assert.deepEqual((await uses('room-g1')).map(row => [row.entry_id, row.user_id]), [[E5, bob], [E4, bob]]);

  // Someone new in the room is enough: carol has heard nothing, so the best story is told again for her, and the others are
  // not recorded a second time.
  rows = await pick('lawyer', axis(0), 'room-g2', [alice, carol]);
  assert.deepEqual(storyIds(rows), [E1]); assert.equal(rows.find(row => row.id === E1).retold, true);
  assert.deepEqual((await uses('room-g2')).map(row => [row.entry_id, row.user_id]), [[E1, carol]]);

  // A room where nobody has heard anything: told once, recorded for everyone. When someone new walks in, it is told again for them.
  rows = await pick('lawyer', axis(0), 'room-g3', [dave, erin]);
  assert.deepEqual(storyIds(rows), [E1]); assert.equal(rows.find(row => row.id === E1).retold, false);
  assert.deepEqual((await uses('room-g3')).map(row => [row.entry_id, row.user_id]), [[E1, dave], [E1, erin]]);
  await ago('room-g3', 60);
  assert.deepEqual(storyIds(await pick('lawyer', axis(0), 'room-g3', [dave, erin])), [E5], 'the same people get the next story, not the same one');
  await ago('room-g3', 60);
  rows = await pick('lawyer', axis(0), 'room-g3', [dave, erin, frank]);
  assert.deepEqual(storyIds(rows), [E1], 'frank joined and has heard nothing, so the best story is told for him');
  assert.equal(rows.find(row => row.id === E1).retold, true);
  assert.deepEqual((await uses('room-g3')).slice(-1).map(row => [row.entry_id, row.user_id]), [[E1, frank]]);

  // With nobody named, what was shown in the room is not repeated.
  assert.deepEqual(storyIds(await pick('lawyer', axis(0), 'room-n', [])), [E1]);
  await ago('room-n', 60);
  assert.deepEqual(storyIds(await pick('lawyer', axis(0), 'room-n', [])), [E5], 'with nobody named, what was shown in the room is still not repeated');

  const people = Array.from({ length: 30 }, (_, i) => `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`);
  await pick('lawyer', axis(0), 'room-big', people);
  assert.equal((await uses('room-big')).length, 20, 'at most twenty people are recorded for one turn');

  // Nothing fits: nothing is returned and nothing is recorded.
  assert.deepEqual(await pick('lawyer', axis(9), 'room-q', [alice]), []);
  assert.deepEqual(await pick('lawyer', [1, 0], 'room-q', [alice]), [], 'a query of the wrong size matches nothing');
  assert.equal((await uses('room-q')).length, 0);
  assert.deepEqual(ids(await pick('diplomat', axis(0), 'room-d')), [other], 'each character has only their own');

  // The administrator sees how often a story was shown, and deleting an entry removes its records.
  const shownCount = async id => (await db.query("select times_shown from admin_list_lounge_knowledge('lawyer') where id=$1", [id])).rows[0].times_shown;
  assert.equal(await shownCount(E1), 27, 'E1 was heard by alice, bob, carol, dave, erin and frank, once with nobody named, and by the twenty people of the big room');
  assert.equal(await shownCount(E3), 0);
  assert.equal((await one('select admin_delete_lounge_knowledge($1) as removed', [E1])).removed, true);
  assert.equal((await one('select count(*)::int as n from lounge_character_knowledge_uses where entry_id=$1', [E1])).n, 0);
  assert.equal((await one('select admin_delete_lounge_knowledge($1) as removed', [E1])).removed, false);

  // Editing re-embeds and moves the entry.
  await save(K2, 'lawyer', 'knowledge', '반대신문의 원칙', '수정한 내용', true, axis(40), { tags: ['수정'] });
  assert.ok(!ids(await pick('lawyer', axis(0), 'room-e')).includes(K2));
  assert.equal((await pick('lawyer', axis(40), 'room-e')).find(row => row.id === K2).content, '수정한 내용');

  // Privileges: visitors cannot reach the tables or the lookup; only the server role can look up.
  for (const table of ['lounge_character_knowledge', 'lounge_character_knowledge_uses']) {
    assert.equal((await one("select has_table_privilege('authenticated',$1,'select') as p", [`public.${table}`])).p, false);
    assert.equal((await one("select has_table_privilege('anon',$1,'select') as p", [`public.${table}`])).p, false);
    assert.equal((await one("select relrowsecurity as p from pg_class where relname=$1", [table])).p, true);
  }
  const pickSignature = 'public.pick_lounge_character_knowledge(text,real[],text,uuid[],text,real,real)';
  assert.equal((await one("select has_function_privilege('authenticated',$1,'execute') as p", [pickSignature])).p, false);
  assert.equal((await one("select has_function_privilege('anon',$1,'execute') as p", [pickSignature])).p, false);
  assert.equal((await one("select has_function_privilege('service_role',$1,'execute') as p", [pickSignature])).p, true);
  assert.equal((await one("select has_function_privilege('anon','public.admin_list_lounge_knowledge(text)','execute') as p")).p, false);
  assert.equal((await one("select count(*)::int as n from pg_proc where proname='match_lounge_character_knowledge'")).n, 0, 'the old lookup is gone');
  assert.equal((await one("select count(*)::int as n from pg_proc where proname='pick_lounge_character_knowledge'")).n, 1, 'one lookup, with no older version beside it');

  // Re-running the second file changes nothing (the first is applied once, before it).
  const before = (await one('select count(*)::int as n from lounge_character_knowledge')).n;
  await db.exec(second);
  assert.equal((await one('select count(*)::int as n from lounge_character_knowledge')).n, before);
  console.log('lounge knowledge SQL check passed');
} finally { await db.close(); }
