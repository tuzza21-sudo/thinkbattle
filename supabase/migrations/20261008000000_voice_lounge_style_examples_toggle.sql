-- Apply after 20261007000000_voice_lounge_six_hosts.sql.
-- Lets the host of a one-to-one room turn the few-shot style examples off for that room, so the same
-- character can be tested with and without examples. On by default; only the room's host can change it.
BEGIN;
ALTER TABLE public.voice_lounge_rooms ADD COLUMN IF NOT EXISTS style_examples boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_voice_lounge_style_examples(p_room text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요해요.'; END IF;
  UPDATE public.voice_lounge_rooms SET style_examples=coalesce(p_enabled,true) WHERE id=p_room AND host_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION '방장만 바꿀 수 있어요.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_voice_lounge_style_examples(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_voice_lounge_style_examples(text,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
