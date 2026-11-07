-- Apply after 20261210040000_lounge_call_exempt.sql.
-- (2026-11-07) The beta's daily allowance (20261030000000, 8 minutes by default) no longer binds a one-to-one talk with a
-- character: turning the voice on was refused ("하루 8분까지…") once the day's minutes were spent, and the voice went off by
-- itself when they ran out. A one-to-one voice call is now limited by the month's minutes of calls (20261210000000 and
-- 20261210040000: the plan's, or 5 for a new member without one), and a chat never was limited. Rooms with other people keep
-- their daily allowance. lounge_beta_left says "no limit" (NULL) for 'solo', which the check in set_voice_lounge_voice, the
-- meter's check and the countdown in the room (none when there is nothing left to count) all read as no limit.
BEGIN;

CREATE OR REPLACE FUNCTION public.lounge_beta_left(p_user uuid, p_kind text) RETURNS double precision
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN p_kind='solo' OR NOT public.lounge_beta_limited(p_user) THEN NULL ELSE greatest(0,
    (SELECT l.group_daily_seconds FROM public.lounge_beta_limits l WHERE l.id=1)
    - coalesce((SELECT u.seconds FROM public.lounge_daily_usage u WHERE u.user_id=p_user AND u.day=public.lounge_today() AND u.kind=p_kind),0)
  ) END;
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
