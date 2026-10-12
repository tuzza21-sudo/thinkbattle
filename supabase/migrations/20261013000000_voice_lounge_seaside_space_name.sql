-- Apply after 20261012000000_lounge_knowledge_selection.sql.
-- The seaside space no longer belongs to a bookshop owner: Han Ina is now an interviewer, podcast host and author.
-- Only the display name changes. The id stays because rooms and links already refer to it.
UPDATE public.voice_lounge_spaces SET name = '바다 테라스' WHERE id = 'seaside-bookshop';
