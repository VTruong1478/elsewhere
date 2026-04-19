-- Tea shop place type (filter chip: tea_shops). Must run before get_feed_places references it.
ALTER TYPE public.place_type ADD VALUE IF NOT EXISTS 'tea_shop';
