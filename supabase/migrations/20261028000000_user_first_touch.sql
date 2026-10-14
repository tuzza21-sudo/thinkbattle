-- Apply after 20261027000000_voice_lounge_table_capacity.sql.
-- Where each member first came from (campaign tags on the first address, whether it was a Meta ad click, first page,
-- linking site), saved once at signup by the member's own browser, and a read-only funnel report for the ad agent.
-- The ad click id itself is never stored. Nothing here is visible to other members.
BEGIN;
CREATE TABLE IF NOT EXISTS public.user_first_touch(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'direct' CHECK (length(source) <= 80),
  medium text NOT NULL DEFAULT 'none' CHECK (length(medium) <= 80),
  campaign text NOT NULL DEFAULT '' CHECK (length(campaign) <= 80),
  content text NOT NULL DEFAULT '' CHECK (length(content) <= 80),
  term text NOT NULL DEFAULT '' CHECK (length(term) <= 80),
  from_meta boolean NOT NULL DEFAULT false,
  landing text NOT NULL DEFAULT '' CHECK (length(landing) <= 120),
  referrer text NOT NULL DEFAULT '' CHECK (length(referrer) <= 120),
  touched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_first_touch_campaign ON public.user_first_touch(created_at, source, campaign);
ALTER TABLE public.user_first_touch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_first_touch FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_first_touch TO service_role;

-- A member saves their own first touch once; a second call changes nothing. Guests are not recorded.
CREATE OR REPLACE FUNCTION public.save_user_first_touch(p_touch jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE anon boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT coalesce(is_anonymous,false) INTO anon FROM auth.users WHERE id=auth.uid();
  IF anon THEN RETURN; END IF;
  IF p_touch IS NULL OR jsonb_typeof(p_touch)<>'object' THEN RAISE EXCEPTION '올바르지 않은 요청이에요.'; END IF;
  INSERT INTO public.user_first_touch(user_id,source,medium,campaign,content,term,from_meta,landing,referrer,touched_at)
  VALUES(auth.uid(),
    left(coalesce(nullif(p_touch->>'source',''),'direct'),80), left(coalesce(nullif(p_touch->>'medium',''),'none'),80),
    left(coalesce(p_touch->>'campaign',''),80), left(coalesce(p_touch->>'content',''),80), left(coalesce(p_touch->>'term',''),80),
    coalesce((p_touch->>'fromMeta')::boolean,false), left(coalesce(p_touch->>'landing',''),120), left(coalesce(p_touch->>'referrer',''),120),
    CASE WHEN p_touch->>'touchedAt' ~ '^\d{4}-\d{2}-\d{2}T' THEN (p_touch->>'touchedAt')::timestamptz ELSE NULL END)
  ON CONFLICT (user_id) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.save_user_first_touch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_user_first_touch(jsonb) TO authenticated;

-- Funnel per day and campaign for the ad agent (server role only): new members, how many of them spoke at least once,
-- and how many of those came back on another day. Counts only; no names, ids or message text leave the database.
CREATE OR REPLACE FUNCTION public.ad_funnel_report(p_from date, p_to date)
RETURNS TABLE(day date, source text, medium text, campaign text, signups integer, spoke integer, returned integer)
LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  WITH members AS (
    SELECT t.user_id, (t.created_at AT TIME ZONE 'Asia/Seoul')::date AS day, t.source, t.medium, t.campaign, t.created_at
    FROM public.user_first_touch t
    WHERE (t.created_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN p_from AND p_to
  ), talk AS (
    SELECT m.user_id, count(DISTINCT (msg.created_at AT TIME ZONE 'Asia/Seoul')::date) AS days
    FROM members m JOIN public.voice_lounge_messages msg ON msg.user_id = m.user_id AND msg.kind = 'human'
    GROUP BY m.user_id
  )
  SELECT m.day, m.source, m.medium, m.campaign, count(*)::integer,
         count(*) FILTER (WHERE talk.days >= 1)::integer, count(*) FILTER (WHERE talk.days >= 2)::integer
  FROM members m LEFT JOIN talk ON talk.user_id = m.user_id
  GROUP BY m.day, m.source, m.medium, m.campaign ORDER BY m.day, m.source, m.campaign;
$$;
REVOKE ALL ON FUNCTION public.ad_funnel_report(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ad_funnel_report(date,date) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
