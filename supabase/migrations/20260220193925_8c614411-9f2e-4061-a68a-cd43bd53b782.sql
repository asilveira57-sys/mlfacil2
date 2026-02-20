
-- Fix recalc_system_rating_stats: bypass RLS
CREATE OR REPLACE FUNCTION public.recalc_system_rating_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO off
AS $function$
BEGIN
  UPDATE public.system_rating_stats SET
    avg_stars = COALESCE((SELECT AVG(stars) FROM public.system_ratings WHERE is_hidden_by_admin = false), 0),
    ratings_count = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false),
    stars_1 = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false AND stars = 1),
    stars_2 = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false AND stars = 2),
    stars_3 = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false AND stars = 3),
    stars_4 = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false AND stars = 4),
    stars_5 = (SELECT COUNT(*) FROM public.system_ratings WHERE is_hidden_by_admin = false AND stars = 5),
    last_rating_at = (SELECT MAX(created_at) FROM public.system_ratings WHERE is_hidden_by_admin = false),
    updated_at = now();
  RETURN NULL;
END;
$function$;

-- Fix recalc_module_rating_stats: bypass RLS
CREATE OR REPLACE FUNCTION public.recalc_module_rating_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO off
AS $function$
DECLARE
  v_module_id UUID;
BEGIN
  v_module_id := COALESCE(NEW.module_id, OLD.module_id);
  INSERT INTO public.module_rating_stats (module_id, avg_stars, ratings_count, stars_1, stars_2, stars_3, stars_4, stars_5, last_rating_at, updated_at)
  SELECT
    v_module_id,
    COALESCE(AVG(stars), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE stars = 1),
    COUNT(*) FILTER (WHERE stars = 2),
    COUNT(*) FILTER (WHERE stars = 3),
    COUNT(*) FILTER (WHERE stars = 4),
    COUNT(*) FILTER (WHERE stars = 5),
    MAX(created_at),
    now()
  FROM public.module_ratings
  WHERE module_id = v_module_id AND is_hidden_by_admin = false
  ON CONFLICT (module_id) DO UPDATE SET
    avg_stars = EXCLUDED.avg_stars,
    ratings_count = EXCLUDED.ratings_count,
    stars_1 = EXCLUDED.stars_1,
    stars_2 = EXCLUDED.stars_2,
    stars_3 = EXCLUDED.stars_3,
    stars_4 = EXCLUDED.stars_4,
    stars_5 = EXCLUDED.stars_5,
    last_rating_at = EXCLUDED.last_rating_at,
    updated_at = now();
  RETURN NULL;
END;
$function$;
