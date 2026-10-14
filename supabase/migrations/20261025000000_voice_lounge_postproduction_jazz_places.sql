-- Apply after 20261024000000_voice_lounge_reporter_space.sql.
-- Two places get new scenes and names: the hotel lounge becomes the film director's post-production suite before dawn and
-- the forest study becomes an old LP jazz bar for the engineer. The ids (and the scenery ids 'hotel' and 'forest') stay,
-- because rooms and links refer to them.
UPDATE public.voice_lounge_spaces SET name = '새벽 후반작업실' WHERE id = 'hotel-lounge';
UPDATE public.voice_lounge_spaces SET name = '오래된 LP 재즈 바' WHERE id = 'forest-study';
