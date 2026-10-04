// Isolated PostgreSQL checks; never contacts the production database.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';
import { filmCard, filmStudyFixture } from './lounge-film-fixtures.mjs';
const { PGlite } = await import(process.env.LOUNGE_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const host = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
const as = id => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
const create = async brief => (await one("select create_voice_lounge('ina','직접 쓴 대화 주제',4,'방장','cafe',false,$1::jsonb) as id", [JSON.stringify(brief)])).id;
const brief = { category: 'media', subcategory: 'film', work_title: 'Nocturnal Animals', creator: 'Tom Ford', reason: '이 선택이 마음에 남았어요.', discussion: '책임과 자유를 각자 어떻게 보는지 이야기하고 싶어요.' };
try {
  await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;`);
  for (const file of (await readdir('supabase/migrations')).filter(file => file.includes('voice_lounge')).sort()) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261004000000_voice_lounge_topic_briefs.sql', 'utf8'));
  await db.exec(await readFile('supabase/migrations/20261004030000_voice_lounge_education_topics.sql', 'utf8'));
  await db.query('insert into auth.users values($1),($2)', [host,other]); await as(host);
  await db.exec('SET ROLE authenticated');
  const room = await create({ ...brief, work_title: ' Nocturnal Animals ', reason: ` \n${brief.reason}\t ` });
  const saved = await one('select topic_brief,study_required,guided_session from voice_lounge_rooms where id=$1', [room]);
  assert.deepEqual(saved.topic_brief, brief); assert.equal(saved.study_required, true); assert.equal(saved.guided_session, true);
  const claim = (await one('select claim_voice_lounge_study($1) as v', [room])).v;
  assert.deepEqual(claim.topic_brief, brief); assert.equal(claim.state, 'claimed');
  const before = (await one('select count(*)::integer as n from voice_lounge_rooms')).n;
  for (const invalid of [null, [], {}, { ...brief, creator: '' }, { ...brief, work_title: '\n\t' }, { ...brief, reason: '  ' }, { ...brief, discussion: 'x'.repeat(601) }, { ...brief, category: 'love' }, { ...brief, subcategory: 'travel' }, { ...brief, reason: 1 }, { ...brief, creator: null }, { ...brief, extra: 'unexpected' }]) await assert.rejects(create(invalid));
  assert.equal((await one('select count(*)::integer as n from voice_lounge_rooms')).n, before, 'invalid creation leaves no orphan rooms');
  const exports = {};
  new Function('exports', ts.transpileModule(await readFile('src/lib/lounge.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText)(exports);
  for (const category of exports.loungeTopics) for (const subtype of category.subtopics) {
    const value = { ...brief, category: category.id, subcategory: subtype.id, ...(category.id !== 'media' ? { work_title: '', creator: '' } : subtype.id === 'show' ? { creator: '' } : {}) };
    const id = await create(value);
    assert.deepEqual((await one('select topic_brief from voice_lounge_rooms where id=$1', [id])).topic_brief, value, 'SQL accepts every UI category/subcategory');
  }
  const legacy = (await one("select create_voice_lounge('ina','예전 방식',4,'나','river',false) as id")).id;
  assert.equal((await one('select topic_brief from voice_lounge_rooms where id=$1', [legacy])).topic_brief, null);
  const oldSocietyBrief = { ...brief, category: 'society', subcategory: 'current', work_title: '', creator: '' };
  const oldSocietyRoom = await create(oldSocietyBrief);
  assert.deepEqual(exports.normalizeLoungeTopicBrief(oldSocietyBrief), oldSocietyBrief);
  assert.equal(exports.getLoungeTopic('society').title, '사회 / 이슈');
  await db.exec('RESET ROLE');
  await db.query('update voice_lounge_rooms set topic_study=$2 where id=$1', [oldSocietyRoom, JSON.stringify({ title: '기존 이슈 자료' })]);
  await db.exec(await readFile('supabase/migrations/20261004030000_voice_lounge_education_topics.sql', 'utf8'));
  const unchanged = await one('select topic_brief,topic_study from voice_lounge_rooms where id=$1', [oldSocietyRoom]);
  assert.deepEqual(unchanged.topic_brief, oldSocietyBrief);
  assert.equal(unchanged.topic_study.title, '기존 이슈 자료');
  await db.exec('SET ROLE authenticated');
  const finish=async(value,ticket=claim.ticket)=>(await one('select finish_voice_lounge_study($1,$2,$3) as v',[room,ticket,JSON.stringify(value)])).v;
  for(const bad of [
    {...filmStudyFixture,film_research:null},
    {...filmStudyFixture,film_research:{...filmStudyFixture.film_research,version:null}},
    {...filmStudyFixture,film_research:{...filmStudyFixture.film_research,materials:[]}},
    {...filmStudyFixture,film_research:{...filmStudyFixture.film_research,cards:[{...filmCard,evidence:[{kind:'scene_fact',text:'missing source',source_urls:['https://invented.test/']}]}]}},
    {...filmStudyFixture,film_research:{...filmStudyFixture.film_research,cards:[{...filmCard,evidence:[{kind:'ai_inference',text:'only inference',source_urls:[]}]}]}},
    {...filmStudyFixture,film_research:{...filmStudyFixture.film_research,cards:[{...filmCard,followups:null}]}},
    {...filmStudyFixture,film_research:{...filmStudyFixture.film_research,cards:[{...filmCard,interpretations:[{kind:'director_statement',text:'incorrect attribution',basis:'test',source_urls:[filmStudyFixture.sources[0].url]},filmCard.interpretations[1]]}]}},
    {...filmStudyFixture,film_research:{...filmStudyFixture.film_research,cards:[filmCard,filmCard]}},
    {...filmStudyFixture,overview:'x'.repeat(48001)},
    {...filmStudyFixture,confidence:null},
  ]) assert.equal(await finish(bad),false,'invalid film research is not cached');
  await as(other);assert.equal(await finish(filmStudyFixture),false,'a participant cannot save host research');await as(host);
  assert.equal(await finish(filmStudyFixture,other),false,'an unrelated ticket cannot save');
  assert.equal(await finish(filmStudyFixture),true,'valid source-backed ending cards are stored');
  assert.deepEqual((await one('select claim_voice_lounge_study($1) as v',[room])).v.study,filmStudyFixture,'prepared film cards are reused');
  await db.exec('RESET ROLE');
  const oldFilm=await create(brief);
  const bookRoom=await create({...brief,subcategory:'book'});
  const oldStudy={...filmStudyFixture};delete oldStudy.film_research;
  for(const id of [oldFilm,bookRoom])await db.query('update voice_lounge_rooms set topic_study=$2,study_attempts=3 where id=$1',[id,JSON.stringify(oldStudy)]);
  await db.exec(await readFile('supabase/migrations/20261004010000_voice_lounge_film_discussion_cards.sql','utf8'));
  const reset=await one('select topic_study,study_attempts from voice_lounge_rooms where id=$1',[oldFilm]);assert.equal(reset.topic_study,null);assert.equal(reset.study_attempts,0);
  assert.deepEqual((await one('select topic_study from voice_lounge_rooms where id=$1',[bookRoom])).topic_study,oldStudy,'other categories keep their cache');
  assert.deepEqual((await one('select topic_study from voice_lounge_rooms where id=$1',[room])).topic_study,filmStudyFixture,'reapplication preserves version-2 cards');
  await db.exec('SET ROLE authenticated');
  await as(other);
  assert.equal((await one('select claim_voice_lounge_study($1) as v', [room])).v, null, 'only the host can claim preparation');
  await db.exec('RESET ROLE');
  assert.equal((await one("select has_function_privilege('anon','public.create_voice_lounge(text,text,integer,text,text,boolean,jsonb)','execute') as v")).v, false);
  await db.exec('SET ROLE anon');
  const listed = (await db.query('select * from list_open_voice_lounges()')).rows;
  assert.deepEqual(listed.find(value => value.id === room).topic_brief, brief);
  assert.deepEqual(Object.keys(listed[0]).sort(), ['id','topic','host_persona','theme','capacity','status','participant_count','topic_brief'].sort(), 'no IDs, research, transcripts, tickets or private profiles leak through discovery');
  await db.exec('RESET ROLE');
  await db.query("update voice_lounge_rooms set status='ended' where id=$1", [room]);
  assert.equal((await db.query('select * from list_open_voice_lounges()')).rows.some(value => value.id === room), false);
  console.log('PASS: all topic subtypes, atomic creation, source-backed ending cards, fact/inference attribution, bounded storage, tickets/host authorization, legacy caches, film cache upgrade and reapplication, public briefing without research leakage.');
} catch (error) { const position = Number(error.position || error.internalPosition); console.error(error.message, error.where || '', (error.internalQuery || error.query || '').slice(Math.max(0,position-180),position+150)); process.exitCode = 1; }
finally { await db.close(); }
