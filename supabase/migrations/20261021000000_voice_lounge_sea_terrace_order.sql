-- Apply after 20261020000000_voice_lounge_place_order.sql.
-- The seaside place is simply "바다 테라스" (not a bookshop) and swaps places with the rooftop lounge:
-- New order: hotel lounge, rooftop lounge, cocktail bar, forest study, sea terrace, Han River night view,
-- rainy cafe, executive boardroom, improv theatre.
-- The id stays because rooms and links already refer to it.
UPDATE public.voice_lounge_spaces SET name = '바다 테라스' WHERE id = 'seaside-bookshop';
UPDATE public.voice_lounge_spaces s SET sort = o.sort
  FROM (VALUES ('rooftop-lounge',2),('seaside-bookshop',5)) AS o(id,sort)
  WHERE s.id = o.id;
