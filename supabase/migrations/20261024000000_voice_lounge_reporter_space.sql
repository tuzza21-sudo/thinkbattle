-- Apply after 20261023000000_voice_lounge_ai_opinion_request.sql.
-- The reception place that was closed on 2026-10-12 reopens for the social-affairs reporter 윤지안, who now speaks as the
-- character with the id 'diplomat'. The ids stay (rooms and links refer to them; the scenery id is still 'embassy', now the
-- newspaper building's rooftop rest garden); the place gets its new name and goes last.
UPDATE public.voice_lounge_spaces SET name = '신문사 옥상 휴게 정원', open = true, sort = 10 WHERE id = 'embassy-reception';
