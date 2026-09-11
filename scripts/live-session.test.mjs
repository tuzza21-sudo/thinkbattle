import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/liveDebateSession.ts', import.meta.url), 'utf8');
const exports = {};
new Function('exports', ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText)(exports);
const { createSessionConfig, buildSessionPhases, getSessionTotals, validateSessionConfig, canSpeakInSession, getSessionRemaining } = exports;
test('10/15/20 minute presets preserve speaking time; team strategy is a separate two minutes', () => {
  for (const time of [600, 900, 1200]) for (const team of [1, 2, 3]) {
    const config = createSessionConfig(time, team);
    assert.equal(validateSessionConfig(config, team), null);
    assert.deepEqual(getSessionTotals(config), { debateSeconds: time, strategySeconds: team > 1 ? 120 : 0, totalSeconds: time + (team > 1 ? 120 : 0) });
    const phases = buildSessionPhases(config);
    assert.equal(phases.filter(phase => phase.kind === 'cross_examination').length, 2);
    assert.deepEqual(phases.filter(phase => phase.kind === 'strategy').map(phase => phase.id), team === 1 ? [] : ['strategy-before-cross-question', 'strategy-before-rebuttal']);
  }
});
test('skipped stages have no orphan strategy intervals and asymmetric durations survive', () => {
  const config = createSessionConfig(900, 2);
  config.stages[1].enabled = false; config.stages[0].negativeSeconds = 45;
  assert.equal(buildSessionPhases(config).some(phase => phase.id === 'strategy-before-cross-question'), false);
  assert.equal(buildSessionPhases(config)[1].seconds, 45);
  config.stages.forEach(stage => { stage.enabled = false; });
  assert.ok(validateSessionConfig(config, 2));
});
test('speaker eligibility allows repeated cross exchanges, blocks strategy and unassigned speakers', () => {
  const config = createSessionConfig(900, 2), phases = buildSessionPhases(config);
  const member = { userId: 'a', nickname: 'A', position: 'affirmative', role: 'debater', isAi: false, phaseIds: [], isReady: true, joinedAt: '' };
  assert.equal(canSpeakInSession(phases[0], member, config), true);
  assert.equal(canSpeakInSession(phases[1], member, config), false);
  assert.equal(canSpeakInSession(phases[2], member, config), false);
  assert.equal(canSpeakInSession(phases[3], member, config), true);
  assert.equal(canSpeakInSession(phases[4], member, config), true);
  config.assignmentMode = 'assigned';
  assert.equal(canSpeakInSession(phases[3], member, config), false);
  member.phaseIds.push('cross-question');
  assert.equal(canSpeakInSession(phases[4], member, config), true);
  assert.equal(canSpeakInSession(phases[3], { ...member, role: 'moderator' }, config), false);
});
test('paused timer stays frozen and moderator overtime remains negative', () => {
  const state = { deadline_at: '2026-01-01T00:00:30Z', paused_at: null, remaining_seconds: null };
  assert.equal(getSessionRemaining(state, Date.parse('2026-01-01T00:00:45Z')), -15);
  assert.equal(getSessionRemaining({ ...state, paused_at: '2026-01-01T00:00:10Z', remaining_seconds: 20 }, Date.now()), 20);
});

// Optional integration runner: npm install --prefix node_modules/.cache/debate-sql-check --no-package-lock @electric-sql/pglite
if (process.env.TEST_SESSION_SQL === '1') {
  const { PGlite } = await import('../node_modules/.cache/debate-sql-check/node_modules/@electric-sql/pglite/dist/index.js');
  test('PostgreSQL session transitions, RLS isolation and compatibility', async t => {
    const db = new PGlite();
    const ids = Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`);
    const root = new URL('../', import.meta.url);
    const read = file => readFileSync(new URL(file, root), 'utf8');
    const as = async index => { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ids[index]]); await db.exec('SET ROLE authenticated'); };
    const admin = async sql => { await db.exec('RESET ROLE'); return db.exec(sql); };
    const rpc = async (name, values = [], casts = []) => (await db.query(`SELECT public.${name}(${values.map((_, i) => `$${i + 1}${casts[i] ? `::${casts[i]}` : ''}`).join(',')}) AS value`, values)).rows[0].value;
    try {
      await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;
        CREATE TABLE public.organizations(id uuid PRIMARY KEY); CREATE TABLE public.organization_memberships(organization_id uuid,user_id uuid);
        CREATE PUBLICATION supabase_realtime;`);
      await db.exec(read('supabase_live_debate_rooms_migration.sql'));
      await db.exec('ALTER TABLE public.live_debate_arguments ADD COLUMN audio_path text; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated; DROP POLICY IF EXISTS "Users can update own lobby state" ON public.live_debate_room_participants;');
      await db.exec(read('supabase/migrations/20260911000000_flexible_live_debate_sessions.sql'));
      const room = 'debate-sqltest001', config = createSessionConfig(900, 2);
      await as(0);
      await db.query('INSERT INTO public.live_debate_rooms(room_id,host_id,topic,team_size,time_limit,session_config,audience,host_position,host_role) VALUES($1,$2,$3,2,900,$4,\'public\',\'affirmative\',\'debater\')', [room, ids[0], '검증 토론', config]);
      for (let i = 0; i < 4; i++) { await as(i); await rpc('enter_live_debate_lobby', [room, `참가자${i}`, null, null]); await rpc('choose_live_debate_team', [room, i < 2 ? 'affirmative' : 'negative']); }
      await t.test('roster chat is visible to teammates only; no direct insert', async () => {
        await as(0); await rpc('send_live_team_message', [room, crypto.randomUUID(), '우리 팀 비공개 전략']);
        await as(1); assert.equal((await db.query('SELECT * FROM live_debate_team_messages')).rows.length, 1);
        await as(2); assert.equal((await db.query('SELECT * FROM live_debate_team_messages')).rows.length, 0);
        await as(6); assert.equal((await db.query('SELECT * FROM live_debate_team_messages')).rows.length, 0);
        await assert.rejects(rpc('send_live_team_message', [room, crypto.randomUUID(), '외부인']), /unavailable/);
        await as(0); await assert.rejects(db.query('INSERT INTO live_debate_team_messages(id,room_id,team_key,user_id,nickname,body) VALUES($1,$2,$3,$4,$5,$6)', [crypto.randomUUID(), room, 'forged', ids[0], 'fake', 'fake']), /permission denied|row-level security/);
        await as(1); await rpc('claim_live_debate_seat', [room, null, 'moderator']);
        assert.equal((await db.query('SELECT * FROM live_debate_team_messages')).rows.length, 0, 'moderator cannot read team messages');
        await as(6); await rpc('enter_live_debate_lobby', [room, '새 팀원', null, null]); await rpc('choose_live_debate_team', [room, 'affirmative']);
        assert.equal((await db.query('SELECT * FROM live_debate_team_messages')).rows.length, 0, 'new roster cannot read earlier strategy');
        await db.query('DELETE FROM live_debate_room_participants WHERE room_id=$1 AND user_id=$2', [room, ids[6]]);
        await as(1); await rpc('choose_live_debate_team', [room, 'affirmative']);
      });
      await t.test('settings changes reset readiness and cannot be written directly', async () => {
        await as(0); await rpc('set_live_debate_ready', [room, true]);
        await rpc('update_live_session_settings', [room, config]);
        assert.equal((await db.query('SELECT bool_or(is_ready) AS ready FROM live_debate_room_participants')).rows[0].ready, false);
        await assert.rejects(db.query("UPDATE live_debate_rooms SET status='in_progress' WHERE room_id=$1", [room]), /RPC/);
        await as(1); await assert.rejects(rpc('update_live_session_settings', [room, config]), /only host/);
      });
      for (let i = 0; i < 4; i++) { await as(i); await rpc('set_live_debate_ready', [room, true]); }
      await as(0); assert.ok(await rpc('start_live_debate_room', [room]));
      let state = await rpc('control_live_debate_session', [room]);
      await t.test('running rosters and settings are locked; outsiders cannot read state', async () => {
        await assert.rejects(rpc('update_live_session_settings', [room, config]), /only host/);
        await assert.rejects(db.query('DELETE FROM live_debate_room_participants WHERE room_id=$1 AND user_id=$2', [room, ids[0]]), /locked/);
        await as(6); assert.equal((await db.query('SELECT * FROM live_debate_sessions WHERE room_id=$1', [room])).rows.length, 0);
        await as(0);
      });
      await t.test('speech submission does not advance phase; retries do not duplicate', async () => {
        const id = crypto.randomUUID();
        await rpc('submit_live_session_argument', [room, id, '입론 발언입니다', 'affirmative-opening']);
        await rpc('submit_live_session_argument', [room, id, '입론 발언입니다', 'affirmative-opening']);
        assert.equal((await db.query('SELECT count(*)::integer AS n FROM live_debate_arguments')).rows[0].n, 1);
        assert.equal((await rpc('control_live_debate_session', [room])).phase_index, 0);
        await as(2); await assert.rejects(rpc('submit_live_session_argument', [room, crypto.randomUUID(), '아직 아님', 'affirmative-opening']), /not your/);
        await as(0); await assert.rejects(db.query('INSERT INTO live_debate_arguments(id,room_id,user_id,sender_name,content,source) VALUES($1,$2,$3,$4,$5,$6)', [crypto.randomUUID(), room, ids[0], 'fake', 'fake', 'text']), /RPC/);
      });
      await t.test('controller revisions prevent double advancement and unauthorized controls', async () => {
        state = await rpc('control_live_debate_session', [room, 'pause', state.revision]);
        assert.ok(state.paused_at);
        await assert.rejects(rpc('submit_live_session_argument', [room, crypto.randomUUID(), '멈춤', 'affirmative-opening']), /not your/);
        const remaining = Number(state.remaining_seconds);
        state = await rpc('control_live_debate_session', [room, 'extend', state.revision]); assert.ok(Math.abs(Number(state.remaining_seconds) - remaining - 30) < 0.001);
        state = await rpc('control_live_debate_session', [room, 'resume', state.revision]); assert.equal(state.paused_at, null);
        await as(1); await assert.rejects(rpc('control_live_debate_session', [room, 'next', state.revision]), /controller|host|moderator/);
        await as(0); const old = state.revision; state = await rpc('control_live_debate_session', [room, 'next', old]);
        await assert.rejects(rpc('control_live_debate_session', [room, 'next', old]), /changed|stale|revision/);
        assert.equal(state.phase_index, 1);
      });
      await t.test('strategy blocks official speech; cross session allows unlimited exchanges on both sides', async () => {
        state = await rpc('control_live_debate_session', [room, 'next', state.revision]); assert.equal(state.phase_index, 2);
        await assert.rejects(rpc('submit_live_session_argument', [room, crypto.randomUUID(), '작전', 'strategy-before-cross-question']), /not your/);
        state = await rpc('control_live_debate_session', [room, 'next', state.revision]);
        for (let i = 0; i < 8; i++) { await as(i % 4); await rpc('submit_live_session_argument', [room, crypto.randomUUID(), `문답 ${i}`, 'affirmative-cross-question']); }
        assert.equal((await rpc('control_live_debate_session', [room])).phase_index, 3);
      });
      await t.test('late voice transcripts retain the original phase, ticket is single-use', async () => {
        await as(0); const ticket = await rpc('begin_live_debate_speech', [room, 'affirmative-cross-question']);
        await assert.rejects(rpc('begin_live_debate_speech', [room, 'affirmative-cross-question']), /previous recording/);
        await rpc('end_live_debate_speech', [ticket]);
        const nextTicket = await rpc('begin_live_debate_speech', [room, 'affirmative-cross-question']);
        assert.ok(nextTicket, 'next question is allowed while the previous transcription is pending');
        await rpc('end_live_debate_speech', [nextTicket, true]);
        state = await rpc('control_live_debate_session', [room, 'next', state.revision]);
        const id = crypto.randomUUID(); await rpc('submit_live_session_argument', [room, id, '늦게 완료된 전사', 'affirmative-cross-question', ticket]);
        assert.equal((await db.query('SELECT phase_id FROM live_debate_arguments WHERE id=$1', [id])).rows[0].phase_id, 'affirmative-cross-question');
        await assert.rejects(rpc('submit_live_session_argument', [room, crypto.randomUUID(), '재사용', 'affirmative-cross-question', ticket]), /expired|submitted/);
      });
      await t.test('automatic catch-up uses saved deadlines after a disconnected browser returns', async () => {
        await admin(`UPDATE live_debate_sessions SET deadline_at=clock_timestamp()-interval '61 seconds' WHERE room_id='${room}';`);
        await as(1); state = await rpc('control_live_debate_session', [room]);
        assert.equal(state.phase_index, 6); // negative cross -> 60-second strategy -> affirmative rebuttal
        assert.ok(state.history.length >= 6);
      });
      await t.test('evaluation waits for pending recordings, then closes and preserves private reports', async () => {
        await as(0); const ticket = await rpc('begin_live_debate_speech', [room, 'affirmative-rebuttal']);
        await rpc('end_live_debate_speech', [ticket]);
        state = await rpc('control_live_debate_session', [room, 'finish', state.revision]);
        const evaluation = { winner: 'draw', participantReports: [{ userId: ids[0], report: { totalScore: 70 } }, { userId: ids[2], report: { totalScore: 75 } }] };
        await assert.rejects(rpc('save_live_session_evaluation', [room, evaluation]), /wait/);
        await rpc('end_live_debate_speech', [ticket, true]);
        await as(2); assert.equal(await rpc('save_live_session_evaluation', [room, evaluation]), true);
        assert.equal(await rpc('save_live_session_evaluation', [room, evaluation]), false);
        assert.equal((await rpc('get_live_debate_evaluation', [room])).participantReports.length, 1);
      });
      await t.test('moderated sessions show overtime until a controller advances', async () => {
        const manualRoom = 'debate-manual001'; const manual = createSessionConfig(600, 1); manual.progressionMode = 'moderated';
        await as(0); await db.query('INSERT INTO live_debate_rooms(room_id,host_id,topic,team_size,time_limit,session_config,audience,host_position,host_role) VALUES($1,$2,$3,1,600,$4,\'public\',\'affirmative\',\'debater\')', [manualRoom, ids[0], '진행자 진행', manual]);
        for (const i of [0, 2]) { await as(i); await rpc('enter_live_debate_lobby', [manualRoom, `참가자${i}`, null, null]); await rpc('choose_live_debate_team', [manualRoom, i === 0 ? 'affirmative' : 'negative']); await rpc('set_live_debate_ready', [manualRoom, true]); }
        await as(0); await rpc('start_live_debate_room', [manualRoom]);
        await admin(`UPDATE live_debate_sessions SET deadline_at=clock_timestamp()-interval '15 seconds' WHERE room_id='${manualRoom}';`);
        await as(2); const overtime = await rpc('control_live_debate_session', [manualRoom]); assert.equal(overtime.phase_index, 0); assert.ok(Date.parse(overtime.server_now) > Date.parse(overtime.deadline_at));
        await as(0); await rpc('submit_live_session_argument', [manualRoom, crypto.randomUUID(), '초과시간 발언', 'affirmative-opening']);
        assert.equal((await rpc('control_live_debate_session', [manualRoom, 'next', overtime.revision])).phase_index, 1);
      });
      await t.test('legacy rooms still select teams and use the original start RPC', async () => {
        const oldRoom = 'debate-legacy001'; await as(0);
        await db.query('INSERT INTO live_debate_rooms(room_id,host_id,topic,team_size,time_limit,audience,host_position,host_role) VALUES($1,$2,$3,1,600,\'public\',\'affirmative\',\'debater\')', [oldRoom, ids[0], '이전 토론']);
        for (const i of [0, 2]) { await as(i); await rpc('enter_live_debate_lobby', [oldRoom, `참가자${i}`, null, null]); await rpc('choose_live_debate_team', [oldRoom, i === 0 ? 'affirmative' : 'negative']); await rpc('set_live_debate_ready', [oldRoom, true]); }
        await as(0); assert.ok(await rpc('start_live_debate_room', [oldRoom]));
        assert.equal((await db.query('SELECT * FROM live_debate_sessions WHERE room_id=$1', [oldRoom])).rows.length, 0);
      });
    } catch (error) { throw new Error(`${error.message}\n${error.where || ''}`); }
    finally { await db.close(); }
  });
}
