-- Apply after 20261217000000_lounge_glm_gemini_models.sql. Not applied automatically on merge: run it in the Supabase SQL editor.
-- 2026-11-19, by the owner: a one-to-one room can be set to 라쿤 ('deepseek-raccoon'), DeepSeek's own model for a chat and for a call alike.
BEGIN;

ALTER TABLE public.voice_lounge_rooms DROP CONSTRAINT IF EXISTS voice_lounge_rooms_ai_model_check;
ALTER TABLE public.voice_lounge_rooms ADD CONSTRAINT voice_lounge_rooms_ai_model_check CHECK (ai_model IS NULL OR ai_model IN ('gpt','gpt-reasoning','gpt-sol','gpt-sol-next','gpt-terra','deepseek-flash','deepseek-raccoon','gemini-flash','gemini-pro','glm-flash'));

CREATE OR REPLACE FUNCTION public.set_voice_lounge_model(p_room text, p_model text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.voice_lounge_rooms;
BEGIN
  SELECT * INTO r FROM public.voice_lounge_rooms WHERE id=p_room FOR UPDATE;
  IF NOT FOUND OR r.host_id<>auth.uid() OR r.capacity<>1 OR r.space_id IS NOT NULL OR r.status='ended' THEN
    RAISE EXCEPTION '내 1:1 대화에서만 대화 모델을 바꿀 수 있어요.'; END IF;
  IF p_model IS NULL OR p_model NOT IN ('gpt','gemini-flash','glm-flash','deepseek-flash','deepseek-raccoon') THEN RAISE EXCEPTION '고를 수 없는 모델이에요.'; END IF;
  UPDATE public.voice_lounge_rooms SET ai_model=NULLIF(p_model,'gpt') WHERE id=p_room;
  RETURN p_model;
END $$;
REVOKE ALL ON FUNCTION public.set_voice_lounge_model(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_voice_lounge_model(text,text) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
