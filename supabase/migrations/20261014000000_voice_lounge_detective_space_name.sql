-- Apply after 20261013000000_voice_lounge_seaside_space_name.sql.
-- The 'lawyer' character is now a former police detective turned private detective (차지훈), and 'auditor' is a former
-- fund manager turned economic commentator (차현우). Only the display name of the law library changes: the id, the
-- 'lawlibrary' theme and the host_persona values stay because rooms, links and saved relationships already use them.
UPDATE public.voice_lounge_spaces SET name = '탐정 사무소 라운지' WHERE id = 'law-library';
