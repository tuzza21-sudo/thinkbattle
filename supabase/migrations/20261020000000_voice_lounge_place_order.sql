-- Apply after 20261019000000_voice_lounge_boardroom_cocktailbar_theater.sql.
-- The diplomatic reception place is closed (ids stay, so its rooms and the character's page keep working), and the
-- places are listed in this order: hotel lounge, sea terrace, cocktail bar, forest study, rooftop, Han River night
-- view, rainy cafe, executive boardroom, improv theatre.
UPDATE public.voice_lounge_spaces SET open = false WHERE id = 'embassy-reception';
UPDATE public.voice_lounge_spaces s SET sort = o.sort
  FROM (VALUES ('hotel-lounge',1),('seaside-bookshop',2),('cocktail-bar',3),('forest-study',4),('rooftop-lounge',5),
    ('hotel-bar',6),('rainy-cafe',7),('executive-boardroom',8),('improv-theater',9)) AS o(id,sort)
  WHERE s.id = o.id;
