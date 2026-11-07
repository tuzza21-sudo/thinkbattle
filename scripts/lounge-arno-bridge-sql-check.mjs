// Isolated PostgreSQL (PGlite); no production database or paid model requests.
// Checks supabase/migrations/20261211020000_lounge_arno_bridge_place.sql on stand-ins for the tables and functions that
// list the places: the new place is accepted by the constraints and by a function that lists places, a function's other
// settings are kept, and running it again changes nothing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../node_modules/.cache/lounge-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const list = "('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater')";
const fails = async (sql, pattern) => { try { await db.exec(sql); } catch (error) { assert.match(String(error.message), pattern); return; } assert.fail('should have failed: ' + sql); };
try {
  await db.exec(`
    CREATE TABLE public.voice_lounge_rooms(id text PRIMARY KEY, theme text NOT NULL CONSTRAINT voice_lounge_rooms_theme_check CHECK (theme IN ${list}));
    CREATE TABLE public.voice_lounge_spaces(id text PRIMARY KEY, theme text NOT NULL CONSTRAINT voice_lounge_spaces_theme_check CHECK (theme IN ${list}));
    CREATE TABLE public.lounge_scenarios(id text PRIMARY KEY, theme text NOT NULL CONSTRAINT lounge_scenarios_theme_check CHECK (theme IN ${list}), updated_at timestamptz);
    CREATE TABLE public.lounge_custom_characters(id text PRIMARY KEY, theme text NOT NULL CONSTRAINT lounge_custom_characters_theme_check CHECK (theme IN ${list}));
    CREATE FUNCTION public.create_room(p_theme text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
    BEGIN
      IF p_theme IS NULL OR p_theme NOT IN ('rooftop','river','forest','hotellobby','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater') THEN RAISE EXCEPTION 'bad theme'; END IF;
      RETURN 'ok';
    END $$;
    CREATE FUNCTION public.unrelated(a integer) RETURNS integer LANGUAGE sql AS $$ SELECT a + 1 $$;
    INSERT INTO public.lounge_scenarios VALUES ('guide-enrosadira', 'rooftop', now());`);
  await fails("INSERT INTO public.voice_lounge_rooms VALUES ('r0','arnobridge')", /theme_check/);
  await fails("SELECT public.create_room('arnobridge')", /bad theme/);

  const migration = await readFile('supabase/migrations/20261211020000_lounge_arno_bridge_place.sql', 'utf8');
  await db.exec(migration);
  for (const table of ['voice_lounge_rooms', 'voice_lounge_spaces', 'lounge_custom_characters']) await db.exec(`INSERT INTO public.${table} VALUES ('x-${table}', 'arnobridge')`);
  assert.equal((await db.query("SELECT public.create_room('arnobridge') r")).rows[0].r, 'ok', 'the function accepts the new place');
  assert.equal((await db.query("SELECT public.create_room('cocktailbar') r")).rows[0].r, 'ok', 'and the old ones');
  await fails("SELECT public.create_room('nowhere')", /bad theme/);
  await fails("INSERT INTO public.voice_lounge_rooms VALUES ('r1','nowhere')", /theme_check/);
  assert.equal((await db.query("SELECT theme FROM public.lounge_scenarios WHERE id='guide-enrosadira'")).rows[0].theme, 'arnobridge', 'the story opens there');
  assert.match((await db.query("SELECT prosecdef, proconfig FROM pg_proc WHERE proname='create_room'")).rows.map(row => JSON.stringify(row))[0], /true.*search_path/, 'security definer and search_path are kept');
  assert.equal((await db.query('SELECT public.unrelated(1) r')).rows[0].r, 2, 'other functions are untouched');
  await db.exec(migration); // again: nothing changes, nothing fails
  assert.equal((await db.query("SELECT public.create_room('arnobridge') r")).rows[0].r, 'ok');
  console.log('lounge arno bridge sql: ok');
} finally { await db.close(); }
