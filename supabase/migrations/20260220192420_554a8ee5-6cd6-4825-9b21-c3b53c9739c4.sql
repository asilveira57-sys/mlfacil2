
-- Fix: the recalc trigger needs to bypass RLS on system_rating_stats
-- Recreate function with row_security disabled
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
