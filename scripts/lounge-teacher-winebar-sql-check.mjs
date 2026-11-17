// Isolated PostgreSQL checks: no production database or model requests.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const list = "('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater','arnobridge')";
const story = JSON.parse(await readFile('docs/stories/teacher-after-the-lecture.json', 'utf8'));
const one = async sql => (await db.query(sql)).rows[0];
const fails = async (sql, pattern) => {
  await assert.rejects(db.exec(sql), pattern);
};
try {
  await db.exec(`
    CREATE TABLE public.voice_lounge_rooms(id text PRIMARY KEY, theme text NOT NULL CONSTRAINT voice_lounge_rooms_theme_check CHECK (theme IN ${list}), scenario jsonb);
    CREATE TABLE public.voice_lounge_spaces(id text PRIMARY KEY, theme text NOT NULL CONSTRAINT voice_lounge_spaces_theme_check CHECK (theme IN ${list}));
    CREATE TABLE public.lounge_custom_characters(id text PRIMARY KEY, theme text NOT NULL CONSTRAINT lounge_custom_characters_theme_check CHECK (theme IN ${list}));
    CREATE TABLE public.lounge_scenarios(id text PRIMARY KEY, character_id text, title text, hook text, user_role text, relationship text, place text,
      theme text NOT NULL CONSTRAINT lounge_scenarios_theme_check CHECK (theme IN ${list}), prologue text, sort integer DEFAULT 0, active boolean DEFAULT true, updated_at timestamptz);
    INSERT INTO public.lounge_scenarios(id,character_id,title,theme,prologue) VALUES
      ('teacher-after-the-lecture','teacher','old','hotellobby','old teacher prologue'),
      ('other-story','ina','other','hotellobby','another character');
    INSERT INTO public.voice_lounge_rooms VALUES ('existing-teacher-room','hotellobby','{"id":"teacher-after-the-lecture","prologue":"old teacher prologue"}');
    CREATE FUNCTION public.create_room(p_theme text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    BEGIN
      IF p_theme NOT IN ${list} THEN RAISE EXCEPTION 'bad theme'; END IF;
      RETURN p_theme;
    END $$;
    CREATE FUNCTION public.pick_background(p_theme text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    BEGIN
      IF p_theme NOT IN ${list.slice(0, -1)},'car','livingroom','bedroom','restaurant','street') THEN RAISE EXCEPTION 'bad theme'; END IF;
      RETURN p_theme;
    END $$;
    CREATE FUNCTION public.unrelated() RETURNS text LANGUAGE sql AS $$ SELECT 'untouched'::text $$;
  `);
  await fails("SELECT public.create_room('winebar')", /bad theme/);
  const migration = await readFile('supabase/migrations/20261224000000_lounge_teacher_winebar.sql', 'utf8');
  for (let pass = 0; pass < 2; pass++) {
    await db.exec(migration);
    for (const table of ['voice_lounge_rooms', 'voice_lounge_spaces', 'lounge_custom_characters']) {
      await db.exec(`INSERT INTO public.${table}(id,theme) VALUES ('winebar-${pass}','winebar')`);
    }
    const saved = await one("SELECT * FROM public.lounge_scenarios WHERE id='teacher-after-the-lecture'");
    for (const field of ['character_id', 'title', 'hook', 'user_role', 'relationship', 'place', 'theme', 'prologue']) assert.equal(saved[field], story[field], field);
    assert.equal((await one("SELECT public.create_room('winebar') AS result")).result, 'winebar');
    assert.equal((await one("SELECT public.create_room('hotellobby') AS result")).result, 'hotellobby');
    assert.equal((await one("SELECT public.pick_background('winebar') AS result")).result, 'winebar');
    assert.equal((await one("SELECT public.pick_background('car') AS result")).result, 'car');
    await fails("SELECT public.create_room('nowhere')", /bad theme/);
    await fails(`INSERT INTO public.voice_lounge_rooms(id,theme) VALUES ('invalid-${pass}','nowhere')`, /theme_check/);
    const room = await one("SELECT theme,scenario FROM public.voice_lounge_rooms WHERE id='existing-teacher-room'");
    assert.equal(room.theme, 'hotellobby');
    assert.equal(room.scenario.prologue, 'old teacher prologue');
    assert.equal((await one("SELECT prologue FROM public.lounge_scenarios WHERE id='other-story'")).prologue, 'another character');
    assert.equal((await one('SELECT public.unrelated() AS result')).result, 'untouched');
    const fn = await one("SELECT prosecdef,proconfig FROM pg_proc WHERE proname='create_room'");
    assert.equal(fn.prosecdef, true);
    assert.ok(fn.proconfig.includes('search_path=public'));
  }
  console.log('lounge teacher winebar sql: ok (constraints, functions, story, existing rooms, repeat application)');
} finally {
  await db.close();
}
