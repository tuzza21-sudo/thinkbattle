-- Apply after 20261015000000_voice_lounge_rooms_by_place.sql.
-- The hotel bar place (same photo as the hotel lounge) becomes the Han River night view, and the detective office
-- place is closed. Ids stay because rooms and links already refer to them; tables already open keep their scenery.
UPDATE public.voice_lounge_spaces SET name = '한강 야경', theme = 'river' WHERE id = 'hotel-bar';
UPDATE public.voice_lounge_spaces SET open = false WHERE id = 'law-library';
