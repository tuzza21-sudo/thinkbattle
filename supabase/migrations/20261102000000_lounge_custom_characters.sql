-- Apply after 20261101000000_lounge_character_photos.sql.
-- Characters that members create. A member drafts a character with the AI, edits it, and talks with it one-to-one.
-- It is private to its creator until they ask for it to be public and the super admin approves it; editing a public
-- character sends it back for review. Each member may have three. Everything is written by the server (api/
-- lounge-characters.ts, service role) after an AI review; members read their own and everyone reads public ones.
-- Portraits live in the public bucket lounge-custom-characters. A portrait the member uploaded is only shown on the
-- profile; photos of the character are made only from an AI portrait (portrait_source='ai').
BEGIN;

CREATE TABLE IF NOT EXISTS public.lounge_custom_characters(
  id text PRIMARY KEY CHECK (id ~ '^c_[0-9a-f]{32}$'),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 20),
  status text NOT NULL DEFAULT 'private' CHECK (status IN ('private','pending','public','rejected')),
  sheet jsonb NOT NULL CHECK (jsonb_typeof(sheet)='object'),
  template text NOT NULL CHECK (template IN ('warm','playful','slow_burn','rival')),
  flirtation boolean NOT NULL DEFAULT true,
  voice text NOT NULL CHECK (length(voice) BETWEEN 1 AND 40),
  theme text NOT NULL CHECK (theme IN ('rooftop','river','forest','hotel','cafe','seaside','embassy','lawlibrary','boardroom','cocktailbar','theater')),
  portrait_path text,
  portrait_source text CHECK (portrait_source IN ('ai','upload')),
  review_note text NOT NULL DEFAULT '' CHECK (length(review_note)<=300),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lounge_custom_characters_owner ON public.lounge_custom_characters(owner_id, created_at);
CREATE INDEX IF NOT EXISTS lounge_custom_characters_public ON public.lounge_custom_characters(status, updated_at DESC);

ALTER TABLE public.lounge_custom_characters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_custom_characters FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lounge_custom_characters TO anon, authenticated;
GRANT ALL ON TABLE public.lounge_custom_characters TO service_role;
DROP POLICY IF EXISTS lounge_custom_characters_read ON public.lounge_custom_characters;
CREATE POLICY lounge_custom_characters_read ON public.lounge_custom_characters FOR SELECT TO anon, authenticated
  USING (status='public' OR owner_id=auth.uid());

-- Three characters a member.
CREATE OR REPLACE FUNCTION public.lounge_custom_character_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('lounge-custom:'||NEW.owner_id::text, 43));
  IF (SELECT count(*) FROM public.lounge_custom_characters WHERE owner_id=NEW.owner_id) >= 3 THEN
    RAISE EXCEPTION '캐릭터는 한 사람당 3개까지 만들 수 있어요.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lounge_custom_character_limit ON public.lounge_custom_characters;
CREATE TRIGGER lounge_custom_character_limit BEFORE INSERT ON public.lounge_custom_characters
  FOR EACH ROW EXECUTE FUNCTION public.lounge_custom_character_limit();

-- Portrait drafts the AI made today, a few per member (each costs an image).
CREATE TABLE IF NOT EXISTS public.lounge_custom_portrait_attempts(
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lounge_custom_portrait_attempts_owner ON public.lounge_custom_portrait_attempts(owner_id, created_at);
ALTER TABLE public.lounge_custom_portrait_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lounge_custom_portrait_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.lounge_custom_portrait_attempts TO service_role;
-- Server only: true when one more portrait may be made today (10 a day), and records it.
CREATE OR REPLACE FUNCTION public.claim_lounge_custom_portrait(p_owner uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('lounge-custom-portrait:'||p_owner::text, 44));
  IF (SELECT count(*) FROM public.lounge_custom_portrait_attempts WHERE owner_id=p_owner AND created_at>=public.lounge_today_start()) >= 10 THEN RETURN false; END IF;
  INSERT INTO public.lounge_custom_portrait_attempts(owner_id) VALUES(p_owner);
  DELETE FROM public.lounge_custom_portrait_attempts WHERE created_at<now()-interval '14 days';
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_lounge_custom_portrait(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_lounge_custom_portrait(uuid) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lounge-custom-characters', 'lounge-custom-characters', true, 5242880, ARRAY['image/webp','image/png','image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- A room's character may now also be a member's character.
ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_host_persona_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_host_persona_check CHECK (
  host_persona IN ('jaeseok','ina','auditor','closer','velvet','trickster','diplomat','lawyer') OR host_persona ~ '^c_[0-9a-f]{32}$');

-- A one-to-one chat with a member's character: its creator's, or a public one. An unfinished one is continued.
CREATE OR REPLACE FUNCTION public.start_lounge_custom_chat(p_character text, p_nickname text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.lounge_custom_characters; picked text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.'; END IF;
  SELECT * INTO c FROM public.lounge_custom_characters WHERE id=p_character;
  IF NOT FOUND OR NOT (c.owner_id=auth.uid() OR c.status='public') THEN RAISE EXCEPTION '대화할 수 없는 캐릭터예요.'; END IF;
  IF c.portrait_path IS NULL THEN RAISE EXCEPTION '대표 사진을 정한 뒤 대화할 수 있어요.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('voice-lounge-solo:'||auth.uid()::text,97));
  SELECT id INTO picked FROM public.voice_lounge_rooms
    WHERE host_id=auth.uid() AND capacity=1 AND space_id IS NULL AND host_persona=p_character
      AND status IN ('lobby','active') AND coalesce(expires_at,created_at+interval '2 hours')>now()
    ORDER BY created_at DESC LIMIT 1;
  IF picked IS NOT NULL THEN RETURN picked; END IF;
  RETURN public.create_voice_lounge(p_character,'둘이서 편하게 이야기해요',1,p_nickname,c.theme);
END $$;
REVOKE ALL ON FUNCTION public.start_lounge_custom_chat(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_lounge_custom_chat(text,text) TO authenticated;

-- The creator asks for review, takes a character back to private, or deletes it.
CREATE OR REPLACE FUNCTION public.set_lounge_custom_character_status(p_character text, p_action text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.lounge_custom_characters;
BEGIN
  SELECT * INTO c FROM public.lounge_custom_characters WHERE id=p_character FOR UPDATE;
  IF NOT FOUND OR c.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '내 캐릭터만 바꿀 수 있어요.'; END IF;
  IF p_action='submit' THEN
    IF c.portrait_path IS NULL THEN RAISE EXCEPTION '대표 사진을 정한 뒤 공개를 신청할 수 있어요.'; END IF;
    IF c.status NOT IN ('private','rejected') THEN RETURN c.status; END IF;
    UPDATE public.lounge_custom_characters SET status='pending', updated_at=now() WHERE id=p_character;
    RETURN 'pending';
  ELSIF p_action='private' THEN
    UPDATE public.lounge_custom_characters SET status='private', updated_at=now() WHERE id=p_character;
    RETURN 'private';
  ELSIF p_action='delete' THEN
    DELETE FROM public.lounge_custom_characters WHERE id=p_character;
    RETURN 'deleted';
  END IF;
  RAISE EXCEPTION '올바르지 않은 요청이에요.';
END $$;
REVOKE ALL ON FUNCTION public.set_lounge_custom_character_status(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lounge_custom_character_status(text,text) TO authenticated;

-- Admin: characters waiting for review, and the decision.
CREATE OR REPLACE FUNCTION public.admin_list_lounge_character_reviews() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sheet',c.sheet,'template',c.template,'flirtation',c.flirtation,
      'voice',c.voice,'theme',c.theme,'portraitPath',c.portrait_path,'portraitSource',c.portrait_source,'updatedAt',c.updated_at,
      'owner',(SELECT coalesce(u.nickname,u.email) FROM public.users u WHERE u.id=c.owner_id)) ORDER BY c.updated_at)
    FROM public.lounge_custom_characters c WHERE c.status='pending'),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.admin_review_lounge_custom_character(p_character text, p_approve boolean, p_note text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.lounge_custom_characters SET status=CASE WHEN p_approve THEN 'public' ELSE 'rejected' END,
    review_note=left(coalesce(p_note,''),300), reviewed_at=now(), updated_at=now()
    WHERE id=p_character AND status='pending';
END $$;
REVOKE ALL ON FUNCTION public.admin_list_lounge_character_reviews(), public.admin_review_lounge_custom_character(text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_lounge_character_reviews(), public.admin_review_lounge_custom_character(text,boolean,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
