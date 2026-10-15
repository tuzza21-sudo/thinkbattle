-- Apply after 20261029000000_lounge_admin_activity.sql.
-- Beta usage limits: each member gets a daily allowance of time in rooms, counted separately for 1:1 talks with a
-- character (rooms of one) and for rooms with other people. Only accounts created after this file is first run are
-- limited; earlier members, beta testers chosen in the admin page and the super admin are not. The super admin can
-- change the minutes or turn the limits off. Days are counted in Korean time.
--
-- Time is metered on voice_lounge_members: every heartbeat moves last_seen forward, and the time between two of those
-- updates counts when it is short enough to mean the member stayed (90 seconds or less). When the allowance runs out a
-- 1:1 room ends and a member of a shared room loses their seat; taking a seat again needs time left.
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_beta_limits(
  id integer PRIMARY KEY DEFAULT 1 CHECK (id=1),
  enabled boolean NOT NULL DEFAULT true,
  solo_daily_seconds integer NOT NULL DEFAULT 480 CHECK (solo_daily_seconds BETWEEN 60 AND 86400),
  group_daily_seconds integer NOT NULL DEFAULT 900 CHECK (group_daily_seconds BETWEEN 60 AND 86400),
  applies_from timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- applies_from is set once, the first time this runs: everyone who signed up before then stays unlimited.
INSERT INTO public.lounge_beta_limits(id) VALUES(1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.lounge_beta_testers(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 80),
  added_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lounge_daily_usage(
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('solo','group')),
  seconds double precision NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  PRIMARY KEY(user_id, day, kind)
);

ALTER TABLE public.lounge_beta_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_beta_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_beta_limits, public.lounge_beta_testers, public.lounge_daily_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lounge_beta_limits, public.lounge_beta_testers, public.lounge_daily_usage TO service_role;

CREATE OR REPLACE FUNCTION public.lounge_today() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Seoul')::date $$;

-- Whether this member's time counts. The super admin's address matches is_super_admin().
CREATE OR REPLACE FUNCTION public.lounge_beta_limited(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.lounge_beta_limits l, auth.users a
    WHERE l.id=1 AND l.enabled AND a.id=p_user AND a.created_at>=l.applies_from
      AND lower(coalesce(a.email,''))<>'piorne@naver.com'
      AND NOT EXISTS(SELECT 1 FROM public.lounge_beta_testers t WHERE t.user_id=p_user)
  );
$$;

-- Seconds left today for 'solo' or 'group'; NULL when the member is not limited.
CREATE OR REPLACE FUNCTION public.lounge_beta_left(p_user uuid, p_kind text) RETURNS double precision
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN NOT public.lounge_beta_limited(p_user) THEN NULL ELSE greatest(0,
    (SELECT CASE WHEN p_kind='solo' THEN l.solo_daily_seconds ELSE l.group_daily_seconds END FROM public.lounge_beta_limits l WHERE l.id=1)
    - coalesce((SELECT u.seconds FROM public.lounge_daily_usage u WHERE u.user_id=p_user AND u.day=public.lounge_today() AND u.kind=p_kind),0)
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.voice_lounge_beta_meter() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms; room_kind text; gap double precision; minutes integer;
BEGIN
  IF NOT NEW.active OR NOT public.lounge_beta_limited(NEW.user_id) THEN RETURN NEW; END IF;
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=NEW.room_id;
  IF NOT FOUND OR r.status='ended' THEN RETURN NEW; END IF;
  room_kind:=CASE WHEN r.capacity=1 THEN 'solo' ELSE 'group' END;

  -- Taking a seat (a new one, or back to one left earlier) needs time left today.
  IF TG_OP='INSERT' OR NOT OLD.active THEN
    IF public.lounge_beta_left(NEW.user_id,room_kind)<=0 THEN
      SELECT CASE WHEN room_kind='solo' THEN solo_daily_seconds ELSE group_daily_seconds END/60 INTO minutes FROM public.lounge_beta_limits WHERE id=1;
      RAISE EXCEPTION '%', CASE WHEN room_kind='solo'
        THEN '베타 기간에는 캐릭터와의 1:1 대화를 하루 '||minutes||'분까지 할 수 있어요. 오늘 시간을 다 썼어요. 내일 다시 이야기해요.'
        ELSE '베타 기간에는 함께하는 대화방을 하루 '||minutes||'분까지 이용할 수 있어요. 오늘 시간을 다 썼어요. 내일 다시 만나요.' END;
    END IF;
    RETURN NEW;
  END IF;

  -- Staying: the time since the last sign of presence counts, unless the gap means they had gone.
  IF r.status<>'active' OR NEW.last_seen IS NOT DISTINCT FROM OLD.last_seen THEN RETURN NEW; END IF;
  gap:=extract(epoch FROM NEW.last_seen-OLD.last_seen);
  IF gap<=0 OR gap>90 THEN RETURN NEW; END IF;
  INSERT INTO public.lounge_daily_usage(user_id,day,kind,seconds) VALUES(NEW.user_id,public.lounge_today(),room_kind,gap)
    ON CONFLICT (user_id,day,kind) DO UPDATE SET seconds=public.lounge_daily_usage.seconds+excluded.seconds;
  IF public.lounge_beta_left(NEW.user_id,room_kind)<=0 THEN
    -- A 1:1 room simply ends (the member keeps their seat so the page can still show the ended room);
    -- in a shared room only this member's seat goes.
    IF room_kind='solo' THEN UPDATE public.voice_lounge_rooms SET status='ended' WHERE id=NEW.room_id;
    ELSE NEW.active:=false;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS voice_lounge_beta_meter ON public.voice_lounge_members;
CREATE TRIGGER voice_lounge_beta_meter BEFORE INSERT OR UPDATE ON public.voice_lounge_members
  FOR EACH ROW EXECUTE FUNCTION public.voice_lounge_beta_meter();

-- The member's own allowance, for the countdown in the room.
CREATE OR REPLACE FUNCTION public.get_my_lounge_beta_usage() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object('limited', public.lounge_beta_limited(auth.uid()),
    'soloLimit', l.solo_daily_seconds, 'groupLimit', l.group_daily_seconds,
    'soloLeft', public.lounge_beta_left(auth.uid(),'solo'), 'groupLeft', public.lounge_beta_left(auth.uid(),'group'))
  FROM public.lounge_beta_limits l WHERE l.id=1;
$$;

-- Admin: settings, testers, and today's use by limited members.
CREATE OR REPLACE FUNCTION public.admin_get_lounge_beta() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN jsonb_build_object(
    'settings', (SELECT jsonb_build_object('enabled',l.enabled,'soloMinutes',l.solo_daily_seconds/60,'groupMinutes',l.group_daily_seconds/60,
        'appliesFrom',l.applies_from,'updatedAt',l.updated_at) FROM public.lounge_beta_limits l WHERE l.id=1),
    'testers', coalesce((SELECT jsonb_agg(jsonb_build_object('userId',t.user_id,'nickname',u.nickname,'email',coalesce(u.email,a.email),
        'note',t.note,'addedAt',t.added_at) ORDER BY t.added_at DESC)
      FROM public.lounge_beta_testers t LEFT JOIN public.users u ON u.id=t.user_id LEFT JOIN auth.users a ON a.id=t.user_id),'[]'::jsonb),
    'today', coalesce((SELECT jsonb_agg(jsonb_build_object('userId',x.user_id,'nickname',u.nickname,'email',u.email,
        'soloSeconds',x.solo,'groupSeconds',x.grp) ORDER BY x.solo+x.grp DESC)
      FROM (SELECT d.user_id, coalesce(sum(d.seconds) FILTER (WHERE d.kind='solo'),0)::int AS solo, coalesce(sum(d.seconds) FILTER (WHERE d.kind='group'),0)::int AS grp
            FROM public.lounge_daily_usage d WHERE d.day=public.lounge_today() GROUP BY d.user_id) x
      LEFT JOIN public.users u ON u.id=x.user_id),'[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_lounge_beta_limits(p_enabled boolean, p_solo_minutes integer, p_group_minutes integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_solo_minutes NOT BETWEEN 1 AND 1440 OR p_group_minutes NOT BETWEEN 1 AND 1440 THEN RAISE EXCEPTION 'minutes out of range'; END IF;
  UPDATE public.lounge_beta_limits SET enabled=coalesce(p_enabled,true), solo_daily_seconds=p_solo_minutes*60,
    group_daily_seconds=p_group_minutes*60, updated_at=now() WHERE id=1;
END $$;

CREATE OR REPLACE FUNCTION public.admin_add_lounge_beta_tester(p_email text, p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target uuid;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT id INTO target FROM auth.users WHERE lower(email)=lower(trim(p_email)) LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
  INSERT INTO public.lounge_beta_testers(user_id,note) VALUES(target,left(coalesce(trim(p_note),''),80))
    ON CONFLICT (user_id) DO UPDATE SET note=excluded.note;
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_lounge_beta_tester(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  DELETE FROM public.lounge_beta_testers WHERE user_id=p_user;
END $$;

REVOKE ALL ON FUNCTION public.lounge_beta_limited(uuid), public.lounge_beta_left(uuid,text), public.voice_lounge_beta_meter()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_lounge_beta_usage(), public.admin_get_lounge_beta(),
  public.admin_set_lounge_beta_limits(boolean,integer,integer), public.admin_add_lounge_beta_tester(text,text),
  public.admin_remove_lounge_beta_tester(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_lounge_beta_usage(), public.admin_get_lounge_beta(),
  public.admin_set_lounge_beta_limits(boolean,integer,integer), public.admin_add_lounge_beta_tester(text,text),
  public.admin_remove_lounge_beta_tester(uuid) TO authenticated;

-- Usage rows are only needed for today's count; keep two weeks for the admin to look back on, then drop them.
CREATE OR REPLACE FUNCTION public.cleanup_voice_lounges() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE removed bigint;
BEGIN
  DELETE FROM public.voice_lounge_rooms WHERE coalesce(expires_at,created_at+interval '2 hours')<now()-interval '30 days';
  GET DIAGNOSTICS removed=ROW_COUNT;
  DELETE FROM public.lounge_admin_access_log WHERE created_at<now()-interval '1 year';
  DELETE FROM public.lounge_daily_usage WHERE day<public.lounge_today()-14;
  RETURN removed;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
