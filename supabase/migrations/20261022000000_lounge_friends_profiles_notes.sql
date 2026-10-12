-- Apply after 20261021000000_voice_lounge_sea_terrace_order.sql.
-- People you want to talk with again: a friends list with presence, ratings for people you talked with, a member
-- profile (age group, region, introduction) other members can open, notes (쪽지), and blocking.
-- Everything is reached through the functions below; the tables allow no direct access. Guests (anonymous
-- sign-ins) can look at profiles but cannot keep friends, rate, write or receive notes.
BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio text;
-- Friends see when you are online and which room you are in unless you turn this off in your profile.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS show_presence boolean NOT NULL DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS lounge_last_seen timestamptz;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_region_check;
ALTER TABLE public.users ADD CONSTRAINT users_region_check CHECK (region IS NULL OR length(region) BETWEEN 1 AND 30);
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_bio_check;
ALTER TABLE public.users ADD CONSTRAINT users_bio_check CHECK (bio IS NULL OR length(bio) BETWEEN 1 AND 200);

-- The people each member wants to talk with again.
CREATE TABLE IF NOT EXISTS public.lounge_friends (
  owner uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner, friend),
  CHECK (owner <> friend)
);
CREATE INDEX IF NOT EXISTS lounge_friends_friend_idx ON public.lounge_friends(friend);
-- A rating from 1 to 5 for someone you talked with in a room. Rooms are deleted a day after they end, so the room
-- id is only a key here, not a reference.
CREATE TABLE IF NOT EXISTS public.lounge_ratings (
  room_id text NOT NULL,
  rater uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, rater, ratee),
  CHECK (rater <> ratee)
);
CREATE INDEX IF NOT EXISTS lounge_ratings_ratee_idx ON public.lounge_ratings(ratee);
CREATE TABLE IF NOT EXISTS public.lounge_notes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sender uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK (sender <> recipient)
);
CREATE INDEX IF NOT EXISTS lounge_notes_recipient_idx ON public.lounge_notes(recipient, id DESC);
CREATE INDEX IF NOT EXISTS lounge_notes_sender_idx ON public.lounge_notes(sender, created_at DESC);
CREATE TABLE IF NOT EXISTS public.lounge_blocks (
  blocker uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
ALTER TABLE public.lounge_friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_friends, public.lounge_ratings, public.lounge_notes, public.lounge_blocks FROM PUBLIC, anon, authenticated;

-- A registered member: signed in and not a guest.
CREATE OR REPLACE FUNCTION public.lounge_is_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
$$;
CREATE OR REPLACE FUNCTION public.lounge_is_blocked(p_other uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.lounge_blocks WHERE (blocker = auth.uid() AND blocked = p_other) OR (blocker = p_other AND blocked = auth.uid()));
$$;
-- Whether the caller may see this person's profile and avatar: themselves, a friend (either way), someone they share
-- or shared a room with, or someone they exchanged notes with.
CREATE OR REPLACE FUNCTION public.lounge_related(p_other uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND p_other IS NOT NULL AND (
    p_other = auth.uid()
    OR EXISTS (SELECT 1 FROM public.lounge_friends WHERE (owner = auth.uid() AND friend = p_other) OR (owner = p_other AND friend = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.voice_lounge_members a JOIN public.voice_lounge_members b ON b.room_id = a.room_id WHERE a.user_id = auth.uid() AND b.user_id = p_other)
    OR EXISTS (SELECT 1 FROM public.lounge_notes WHERE (sender = auth.uid() AND recipient = p_other) OR (sender = p_other AND recipient = auth.uid()))
  );
$$;
-- Related members can sign each other's avatar links (the bucket stays private for everyone else).
DROP POLICY IF EXISTS lounge_avatar_read_related ON storage.objects;
CREATE POLICY lounge_avatar_read_related ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'lounge-avatars' AND CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' THEN public.lounge_related(((storage.foldername(name))[1])::uuid) ELSE false END);

-- The member's own profile fields. Age group is one of 20s..60s or empty.
CREATE OR REPLACE FUNCTION public.update_lounge_profile(p_age_group text, p_region text, p_bio text, p_show_presence boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  age text := nullif(btrim(coalesce(p_age_group, '')), '');
  place text := nullif(btrim(coalesce(p_region, '')), '');
  intro text := nullif(btrim(coalesce(p_bio, '')), '');
BEGIN
  IF NOT public.lounge_is_member() THEN RAISE EXCEPTION 'registered account required'; END IF;
  IF age IS NOT NULL AND age NOT IN ('20s','30s','40s','50s','60s') THEN RAISE EXCEPTION 'invalid age group'; END IF;
  IF length(coalesce(place, '')) > 30 THEN RAISE EXCEPTION 'region too long'; END IF;
  IF length(coalesce(intro, '')) > 200 THEN RAISE EXCEPTION 'introduction too long'; END IF;
  UPDATE public.users SET age_group = age, region = place, bio = intro, show_presence = coalesce(p_show_presence, show_presence) WHERE id = auth.uid();
END;
$$;
-- Called about once a minute while a member is in the lounge.
CREATE OR REPLACE FUNCTION public.touch_lounge_presence() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.users SET lounge_last_seen = now()
  WHERE id = auth.uid() AND public.lounge_is_member() AND (lounge_last_seen IS NULL OR lounge_last_seen < now() - interval '30 seconds');
$$;

-- One member's profile as another member sees it. The average rating shows from three ratings on.
CREATE OR REPLACE FUNCTION public.get_lounge_profile(p_user uuid, p_room text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE person public.users; ratings_count integer; ratings_avg numeric; shared boolean := false; mine smallint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required'; END IF;
  IF NOT public.lounge_related(p_user) THEN RAISE EXCEPTION 'profile unavailable'; END IF;
  SELECT * INTO person FROM public.users WHERE id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile unavailable'; END IF;
  SELECT count(*)::integer, avg(score) INTO ratings_count, ratings_avg FROM public.lounge_ratings WHERE ratee = p_user;
  IF p_room IS NOT NULL AND p_user <> auth.uid() THEN
    shared := EXISTS (SELECT 1 FROM public.voice_lounge_members WHERE room_id = p_room AND user_id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.voice_lounge_members WHERE room_id = p_room AND user_id = p_user);
    SELECT score INTO mine FROM public.lounge_ratings WHERE room_id = p_room AND rater = auth.uid() AND ratee = p_user;
  END IF;
  RETURN jsonb_build_object(
    'id', person.id, 'nickname', person.nickname, 'avatar_path', person.lounge_avatar_path,
    'age_group', person.age_group, 'region', person.region, 'bio', person.bio,
    'rating_count', ratings_count, 'rating_avg', CASE WHEN ratings_count >= 3 THEN round(ratings_avg, 1) ELSE NULL END,
    'is_self', person.id = auth.uid(),
    'is_friend', EXISTS (SELECT 1 FROM public.lounge_friends WHERE owner = auth.uid() AND friend = p_user),
    'is_blocked', EXISTS (SELECT 1 FROM public.lounge_blocks WHERE blocker = auth.uid() AND blocked = p_user),
    'can_rate', shared AND public.lounge_is_member(), 'my_rating', mine,
    'guest', EXISTS (SELECT 1 FROM auth.users WHERE id = p_user AND coalesce(is_anonymous, false))
  );
END;
$$;

-- The other members of a room the caller sat in, with whether each is already a friend and the caller's rating.
CREATE OR REPLACE FUNCTION public.list_lounge_room_people(p_room text)
RETURNS TABLE (user_id uuid, nickname text, avatar_path text, is_friend boolean, my_rating smallint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.lounge_is_member() THEN RAISE EXCEPTION 'registered account required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.voice_lounge_members WHERE room_id = p_room AND voice_lounge_members.user_id = auth.uid()) THEN RAISE EXCEPTION 'not in this room'; END IF;
  RETURN QUERY
  SELECT m.user_id, coalesce(u.nickname, m.nickname), u.lounge_avatar_path,
    EXISTS (SELECT 1 FROM public.lounge_friends f WHERE f.owner = auth.uid() AND f.friend = m.user_id),
    (SELECT r.score FROM public.lounge_ratings r WHERE r.room_id = p_room AND r.rater = auth.uid() AND r.ratee = m.user_id)
  FROM public.voice_lounge_members m
  JOIN public.users u ON u.id = m.user_id
  JOIN auth.users au ON au.id = m.user_id AND NOT coalesce(au.is_anonymous, false)
  WHERE m.room_id = p_room AND m.user_id <> auth.uid() AND NOT public.lounge_is_blocked(m.user_id)
  ORDER BY m.joined_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.rate_lounge_member(p_room text, p_user uuid, p_score integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.lounge_is_member() THEN RAISE EXCEPTION 'registered account required'; END IF;
  IF p_user IS NULL OR p_user = auth.uid() THEN RAISE EXCEPTION 'cannot rate yourself'; END IF;
  IF p_score IS NULL OR p_score NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'score must be 1 to 5'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM public.voice_lounge_members WHERE room_id = p_room AND user_id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.voice_lounge_members WHERE room_id = p_room AND user_id = p_user)) THEN
    RAISE EXCEPTION 'only people who talked together can rate each other';
  END IF;
  INSERT INTO public.lounge_ratings(room_id, rater, ratee, score) VALUES (p_room, auth.uid(), p_user, p_score)
  ON CONFLICT (room_id, rater, ratee) DO UPDATE SET score = EXCLUDED.score, updated_at = now();
END;
$$;

-- Adds or removes someone from the caller's list of people to talk with again.
CREATE OR REPLACE FUNCTION public.set_lounge_friend(p_user uuid, p_on boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.lounge_is_member() THEN RAISE EXCEPTION 'registered account required'; END IF;
  IF p_user IS NULL OR p_user = auth.uid() THEN RAISE EXCEPTION 'invalid member'; END IF;
  IF NOT p_on THEN DELETE FROM public.lounge_friends WHERE owner = auth.uid() AND friend = p_user; RETURN; END IF;
  IF NOT public.lounge_related(p_user) OR public.lounge_is_blocked(p_user) THEN RAISE EXCEPTION 'member unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = p_user AND coalesce(is_anonymous, false)) THEN RAISE EXCEPTION 'guests cannot be friends'; END IF;
  IF (SELECT count(*) FROM public.lounge_friends WHERE owner = auth.uid()) >= 200 THEN RAISE EXCEPTION 'friend list is full'; END IF;
  INSERT INTO public.lounge_friends(owner, friend) VALUES (auth.uid(), p_user) ON CONFLICT DO NOTHING;
END;
$$;

-- The caller's friends with presence. Online and the room a friend is in show only for friends who share their status.
-- A one-to-one room with an AI character is never shown.
CREATE OR REPLACE FUNCTION public.list_lounge_friends()
RETURNS TABLE (user_id uuid, nickname text, avatar_path text, age_group text, region text, online boolean, last_seen timestamptz,
  room_id text, room_topic text, space_id text, space_name text, room_count integer, room_capacity integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.lounge_is_member() THEN RAISE EXCEPTION 'registered account required'; END IF;
  RETURN QUERY
  SELECT u.id, u.nickname, u.lounge_avatar_path, u.age_group, u.region,
    (u.show_presence AND u.lounge_last_seen > now() - interval '3 minutes'),
    CASE WHEN u.show_presence THEN u.lounge_last_seen END,
    cur.id, cur.topic, cur.space_id, cur.space_name, cur.present, cur.capacity
  FROM public.lounge_friends f
  JOIN public.users u ON u.id = f.friend
  LEFT JOIN LATERAL (
    SELECT r.id, r.topic, r.space_id, s.name AS space_name, r.capacity,
      (SELECT count(*)::integer FROM public.voice_lounge_members x WHERE x.room_id = r.id AND x.active AND x.last_seen > now() - interval '3 minutes') AS present
    FROM public.voice_lounge_members m
    JOIN public.voice_lounge_rooms r ON r.id = m.room_id
    JOIN public.voice_lounge_spaces s ON s.id = r.space_id
    WHERE u.show_presence AND m.user_id = u.id AND m.active AND m.last_seen > now() - interval '3 minutes'
      AND r.status IN ('lobby','active') AND r.capacity > 1 AND coalesce(r.expires_at, r.created_at + interval '2 hours') > now()
    ORDER BY m.last_seen DESC LIMIT 1
  ) cur ON true
  WHERE f.owner = auth.uid() AND NOT public.lounge_is_blocked(f.friend)
  ORDER BY (u.show_presence AND u.lounge_last_seen > now() - interval '3 minutes') DESC NULLS LAST, u.nickname;
END;
$$;

-- A note goes only to someone the sender is related to (a friend, or someone from a room they shared), at most 20 an hour.
CREATE OR REPLACE FUNCTION public.send_lounge_note(p_to uuid, p_body text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE text_body text := btrim(coalesce(p_body, '')); note_id bigint;
BEGIN
  IF NOT public.lounge_is_member() THEN RAISE EXCEPTION 'registered account required'; END IF;
  IF p_to IS NULL OR p_to = auth.uid() THEN RAISE EXCEPTION 'invalid recipient'; END IF;
  IF length(text_body) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'note must be 1 to 500 characters'; END IF;
  IF NOT public.lounge_related(p_to) OR public.lounge_is_blocked(p_to)
     OR EXISTS (SELECT 1 FROM auth.users WHERE id = p_to AND coalesce(is_anonymous, false)) THEN RAISE EXCEPTION 'cannot send a note to this member'; END IF;
  IF (SELECT count(*) FROM public.lounge_notes WHERE sender = auth.uid() AND created_at > now() - interval '1 hour') >= 20 THEN RAISE EXCEPTION 'too many notes, try again later'; END IF;
  DELETE FROM public.lounge_notes WHERE created_at < now() - interval '30 days';
  INSERT INTO public.lounge_notes(sender, recipient, body) VALUES (auth.uid(), p_to, text_body) RETURNING id INTO note_id;
  RETURN note_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.list_lounge_notes()
RETURNS TABLE (id bigint, other_id uuid, other_nickname text, other_avatar_path text, mine boolean, body text, created_at timestamptz, read_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.lounge_is_member() THEN RAISE EXCEPTION 'registered account required'; END IF;
  RETURN QUERY
  SELECT n.id, o.id, o.nickname, o.lounge_avatar_path, n.sender = auth.uid(), n.body, n.created_at, n.read_at
  FROM public.lounge_notes n
  JOIN public.users o ON o.id = CASE WHEN n.sender = auth.uid() THEN n.recipient ELSE n.sender END
  WHERE (n.sender = auth.uid() OR n.recipient = auth.uid()) AND n.created_at > now() - interval '30 days'
    AND NOT public.lounge_is_blocked(o.id)
  ORDER BY n.id DESC LIMIT 200;
END;
$$;
CREATE OR REPLACE FUNCTION public.mark_lounge_notes_read(p_with uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.lounge_notes SET read_at = now() WHERE recipient = auth.uid() AND sender = p_with AND read_at IS NULL AND public.lounge_is_member();
$$;
CREATE OR REPLACE FUNCTION public.count_lounge_unread_notes() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.lounge_is_member() THEN (SELECT count(*)::integer FROM public.lounge_notes n WHERE n.recipient = auth.uid() AND n.read_at IS NULL
    AND n.created_at > now() - interval '30 days' AND NOT public.lounge_is_blocked(n.sender)) ELSE 0 END;
$$;

-- Blocking ends the friendship both ways and stops notes in both directions.
CREATE OR REPLACE FUNCTION public.block_lounge_user(p_user uuid, p_on boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.lounge_is_member() THEN RAISE EXCEPTION 'registered account required'; END IF;
  IF p_user IS NULL OR p_user = auth.uid() THEN RAISE EXCEPTION 'invalid member'; END IF;
  IF NOT p_on THEN DELETE FROM public.lounge_blocks WHERE blocker = auth.uid() AND blocked = p_user; RETURN; END IF;
  INSERT INTO public.lounge_blocks(blocker, blocked) VALUES (auth.uid(), p_user) ON CONFLICT DO NOTHING;
  DELETE FROM public.lounge_friends WHERE (owner = auth.uid() AND friend = p_user) OR (owner = p_user AND friend = auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.lounge_is_member(), public.lounge_is_blocked(uuid), public.lounge_related(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lounge_is_member(), public.lounge_is_blocked(uuid), public.lounge_related(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.update_lounge_profile(text,text,text,boolean), public.touch_lounge_presence(), public.get_lounge_profile(uuid,text),
  public.list_lounge_room_people(text), public.rate_lounge_member(text,uuid,integer), public.set_lounge_friend(uuid,boolean), public.list_lounge_friends(),
  public.send_lounge_note(uuid,text), public.list_lounge_notes(), public.mark_lounge_notes_read(uuid), public.count_lounge_unread_notes(),
  public.block_lounge_user(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_lounge_profile(text,text,text,boolean), public.touch_lounge_presence(), public.get_lounge_profile(uuid,text),
  public.list_lounge_room_people(text), public.rate_lounge_member(text,uuid,integer), public.set_lounge_friend(uuid,boolean), public.list_lounge_friends(),
  public.send_lounge_note(uuid,text), public.list_lounge_notes(), public.mark_lounge_notes_read(uuid), public.count_lounge_unread_notes(),
  public.block_lounge_user(uuid,boolean) TO authenticated;

COMMIT;
