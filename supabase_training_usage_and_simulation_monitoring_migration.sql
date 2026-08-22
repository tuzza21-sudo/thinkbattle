-- ThinkFit free-user training limits and persona simulation monitoring.
-- Run after supabase_super_admin_migration.sql and supabase_production_hardening_migration.sql.

-- Grandfather accounts that exist when this migration is first applied.
-- Accounts created afterwards receive the default limited free-user policy.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'training_quota_exempt'
  ) THEN
    ALTER TABLE public.users ADD COLUMN training_quota_exempt BOOLEAN;
    UPDATE public.users SET training_quota_exempt = TRUE;
    ALTER TABLE public.users ALTER COLUMN training_quota_exempt SET DEFAULT FALSE;
    ALTER TABLE public.users ALTER COLUMN training_quota_exempt SET NOT NULL;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.training_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  training_kind TEXT NOT NULL CHECK (training_kind IN ('debate', 'simulation')),
  session_key TEXT NOT NULL CHECK (char_length(session_key) BETWEEN 1 AND 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, training_kind, session_key)
);

CREATE INDEX IF NOT EXISTS idx_training_usage_user_kind_created
  ON public.training_usage_events (user_id, training_kind, created_at DESC);

ALTER TABLE public.training_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_usage_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_training_session(
  p_training_kind TEXT,
  p_session_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  day_start TIMESTAMPTZ;
  month_start TIMESTAMPTZ;
  daily_used INTEGER;
  monthly_used INTEGER;
  already_claimed BOOLEAN := FALSE;
  is_exempt BOOLEAN := FALSE;
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF p_training_kind NOT IN ('debate', 'simulation') THEN RAISE EXCEPTION 'invalid training kind'; END IF;
  IF char_length(trim(COALESCE(p_session_key, ''))) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'invalid session key';
  END IF;

  -- Prevent two tabs from claiming the final allowance concurrently.
  PERFORM pg_advisory_xact_lock(hashtext(current_user_id::TEXT || ':' || p_training_kind));

  day_start := date_trunc('day', timezone('Asia/Seoul', now())) AT TIME ZONE 'Asia/Seoul';
  month_start := date_trunc('month', timezone('Asia/Seoul', now())) AT TIME ZONE 'Asia/Seoul';

  SELECT EXISTS (
    SELECT 1 FROM public.training_usage_events
    WHERE user_id = current_user_id
      AND training_kind = p_training_kind
      AND session_key = trim(p_session_key)
  ) INTO already_claimed;

  IF already_claimed THEN
    SELECT COUNT(*) FILTER (WHERE created_at >= day_start)::INT, COUNT(*)::INT
    INTO daily_used, monthly_used
    FROM public.training_usage_events
    WHERE user_id = current_user_id
      AND training_kind = p_training_kind
      AND created_at >= month_start;
    RETURN jsonb_build_object(
      'allowed', TRUE,
      'alreadyClaimed', TRUE,
      'exempt', FALSE,
      'dailyUsed', daily_used,
      'monthlyUsed', monthly_used,
      'dailyLimit', 3,
      'monthlyLimit', 10
    );
  END IF;

  SELECT
    COALESCE(u.training_quota_exempt, FALSE)
    OR public.is_super_admin()
  INTO is_exempt
  FROM public.users u
  WHERE u.id = current_user_id;

  SELECT COUNT(*) FILTER (WHERE created_at >= day_start)::INT, COUNT(*)::INT
  INTO daily_used, monthly_used
  FROM public.training_usage_events
  WHERE user_id = current_user_id
    AND training_kind = p_training_kind
    AND created_at >= month_start;

  IF NOT is_exempt AND daily_used >= 3 THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'daily',
      'exempt', FALSE,
      'dailyUsed', daily_used,
      'monthlyUsed', monthly_used,
      'dailyLimit', 3,
      'monthlyLimit', 10
    );
  END IF;

  IF NOT is_exempt AND monthly_used >= 10 THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'monthly',
      'exempt', FALSE,
      'dailyUsed', daily_used,
      'monthlyUsed', monthly_used,
      'dailyLimit', 3,
      'monthlyLimit', 10
    );
  END IF;

  INSERT INTO public.training_usage_events (user_id, training_kind, session_key)
  VALUES (current_user_id, p_training_kind, trim(p_session_key));

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'alreadyClaimed', FALSE,
    'exempt', is_exempt,
    'dailyUsed', daily_used + 1,
    'monthlyUsed', monthly_used + 1,
    'dailyLimit', CASE WHEN is_exempt THEN NULL ELSE 3 END,
    'monthlyLimit', CASE WHEN is_exempt THEN NULL ELSE 10 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_training_session(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_training_session(TEXT, TEXT) TO authenticated;

CREATE TABLE IF NOT EXISTS public.simulation_training_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL CHECK (char_length(mission_id) BETWEEN 1 AND 160),
  mission_title TEXT NOT NULL CHECK (char_length(mission_title) BETWEEN 1 AND 180),
  category_id TEXT NOT NULL CHECK (category_id IN ('career', 'negotiation', 'workplace', 'sales')),
  persona_id TEXT NOT NULL CHECK (persona_id IN (
    'pressure_interviewer',
    'aggressive_negotiator',
    'authoritarian_manager',
    'construction_client',
    'b2b_operations_executive',
    'insurance_customer',
    'sales_decision_maker'
  )),
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  source TEXT NOT NULL DEFAULT 'preset' CHECK (source IN ('preset', 'profile', 'custom')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned', 'failed')),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds BETWEEN 0 AND 14400),
  turns JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(turns) = 'array'),
  report JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_simulation_sessions_user_started
  ON public.simulation_training_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_simulation_sessions_status_started
  ON public.simulation_training_sessions (status, started_at DESC);

ALTER TABLE public.simulation_training_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own simulation sessions" ON public.simulation_training_sessions;
CREATE POLICY "Users can read own simulation sessions"
ON public.simulation_training_sessions FOR SELECT TO authenticated
USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.simulation_training_sessions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_simulation_training_session(
  p_session_id UUID,
  p_mission_id TEXT,
  p_mission_title TEXT,
  p_category_id TEXT,
  p_persona_id TEXT,
  p_difficulty INTEGER,
  p_source TEXT,
  p_initial_turns JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  quota_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF char_length(trim(COALESCE(p_mission_id, ''))) NOT BETWEEN 1 AND 160
    OR char_length(trim(COALESCE(p_mission_title, ''))) NOT BETWEEN 1 AND 180
    OR p_category_id NOT IN ('career', 'negotiation', 'workplace', 'sales')
    OR p_persona_id NOT IN (
      'pressure_interviewer', 'aggressive_negotiator', 'authoritarian_manager',
      'construction_client', 'b2b_operations_executive', 'insurance_customer',
      'sales_decision_maker'
    )
    OR p_difficulty NOT BETWEEN 1 AND 3
    OR p_source NOT IN ('preset', 'profile', 'custom')
    OR jsonb_typeof(p_initial_turns) <> 'array'
    OR octet_length(p_initial_turns::TEXT) > 100000
  THEN
    RAISE EXCEPTION 'invalid simulation session';
  END IF;

  quota_result := public.claim_training_session('simulation', p_session_id::TEXT);
  IF NOT COALESCE((quota_result ->> 'allowed')::BOOLEAN, FALSE) THEN
    RETURN quota_result;
  END IF;

  INSERT INTO public.simulation_training_sessions (
    id, user_id, mission_id, mission_title, category_id, persona_id,
    difficulty, source, turns
  )
  VALUES (
    p_session_id, auth.uid(), trim(p_mission_id), trim(p_mission_title),
    p_category_id, p_persona_id, p_difficulty, p_source, p_initial_turns
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN quota_result || jsonb_build_object('sessionId', p_session_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_simulation_training_session(
  p_session_id UUID,
  p_turns JSONB,
  p_duration_seconds INTEGER,
  p_status TEXT DEFAULT 'in_progress',
  p_report JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF jsonb_typeof(p_turns) <> 'array'
    OR octet_length(p_turns::TEXT) > 100000
    OR p_duration_seconds NOT BETWEEN 0 AND 14400
    OR p_status NOT IN ('in_progress', 'completed', 'abandoned', 'failed')
    OR (p_report IS NOT NULL AND jsonb_typeof(p_report) <> 'object')
  THEN
    RAISE EXCEPTION 'invalid simulation update';
  END IF;

  UPDATE public.simulation_training_sessions
  SET turns = p_turns,
      duration_seconds = p_duration_seconds,
      status = p_status,
      report = COALESCE(p_report, report),
      completed_at = CASE WHEN p_status = 'completed' THEN timezone('utc', now()) ELSE completed_at END,
      updated_at = timezone('utc', now())
  WHERE id = p_session_id
    AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.start_simulation_training_session(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_simulation_training_session(UUID, JSONB, INTEGER, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_simulation_training_session(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_simulation_training_session(UUID, JSONB, INTEGER, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_super_admin_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE result JSONB;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH record_rows AS (
    SELECT
      r.id, r.user_id, r.topic, r.debate_level, r.created_at,
      u.nickname, u.email, r.arguments,
      COALESCE(r.final_report -> 'report', r.final_report) AS report,
      COALESCE((r.final_report -> 'report' ->> 'totalScore')::NUMERIC, (r.final_report ->> 'totalScore')::NUMERIC, 0)::INT AS total_score
    FROM public.debate_records r
    JOIN public.users u ON u.id = r.user_id
    ORDER BY r.created_at DESC
  ), simulation_rows AS (
    SELECT
      s.id, s.user_id, s.mission_id, s.mission_title, s.category_id,
      s.persona_id, s.difficulty, s.source,
      CASE
        WHEN s.status = 'in_progress' AND s.updated_at < now() - INTERVAL '4 hours'
          THEN 'abandoned'
        ELSE s.status
      END AS status,
      s.duration_seconds,
      s.turns, s.report, s.started_at, s.completed_at,
      u.nickname, u.email,
      CASE
        WHEN COALESCE(s.report ->> 'overallScore', '') ~ '^[0-9]+$'
          THEN (s.report ->> 'overallScore')::INT
        ELSE NULL
      END AS overall_score
    FROM public.simulation_training_sessions s
    JOIN public.users u ON u.id = s.user_id
    ORDER BY s.started_at DESC
    LIMIT 500
  ), organization_rows AS (
    SELECT
      o.id,
      o.name,
      o.created_at,
      (SELECT COUNT(*)::INT
       FROM public.organization_memberships member
       WHERE member.organization_id = o.id) AS member_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'userId', owner_user.id,
          'nickname', owner_user.nickname,
          'email', owner_user.email
        ) ORDER BY owner_user.nickname, owner_user.email)
        FROM public.organization_memberships owner_membership
        JOIN public.users owner_user ON owner_user.id = owner_membership.user_id
        WHERE owner_membership.organization_id = o.id
          AND owner_membership.role = 'owner'
      ), '[]'::jsonb) AS owners
    FROM public.organizations o
  ), active_user_rows AS (
    SELECT user_id FROM public.debate_records
    UNION
    SELECT user_id FROM public.simulation_training_sessions
  )
  SELECT jsonb_build_object(
    'totalUsers', (SELECT COUNT(*)::INT FROM public.users),
    'totalRecords', (SELECT COUNT(*)::INT FROM public.debate_records),
    'totalSimulationSessions', (SELECT COUNT(*)::INT FROM public.simulation_training_sessions),
    'activeUsers', (SELECT COUNT(*)::INT FROM active_user_rows),
    'organizations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'createdAt', created_at,
      'memberCount', member_count,
      'owners', owners
    ) ORDER BY created_at DESC) FROM organization_rows), '[]'::jsonb),
    'records', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'topic', topic,
      'userId', user_id,
      'nickname', nickname,
      'email', email,
      'debateLevel', debate_level,
      'completedAt', created_at,
      'totalScore', total_score,
      'report', report,
      'arguments', arguments
    )) FROM record_rows), '[]'::jsonb),
    'simulationSessions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'userId', user_id,
      'nickname', nickname,
      'email', email,
      'missionId', mission_id,
      'missionTitle', mission_title,
      'categoryId', category_id,
      'personaId', persona_id,
      'difficulty', difficulty,
      'source', source,
      'status', status,
      'durationSeconds', duration_seconds,
      'turns', turns,
      'report', report,
      'overallScore', overall_score,
      'startedAt', started_at,
      'completedAt', completed_at
    )) FROM simulation_rows), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_super_admin_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_super_admin_dashboard() TO authenticated;

-- To exempt a paid or internal account manually:
-- UPDATE public.users SET training_quota_exempt = TRUE WHERE email = 'account@example.com';
-- To apply the limits to an existing account:
-- UPDATE public.users SET training_quota_exempt = FALSE WHERE email = 'account@example.com';
