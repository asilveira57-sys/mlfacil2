
-- =====================================================
-- FIX DEFINITIVO: Avaliações - stats sem WHERE clause
-- =====================================================

-- 1. Desabilitar RLS nas tabelas de cache (dados agregados apenas)
ALTER TABLE public.system_rating_stats DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_rating_stats DISABLE ROW LEVEL SECURITY;

-- 2. Adicionar coluna 'key' à system_rating_stats para ter alvo único no UPSERT
ALTER TABLE public.system_rating_stats ADD COLUMN IF NOT EXISTS key TEXT NOT NULL DEFAULT 'global';
ALTER TABLE public.system_rating_stats ADD CONSTRAINT system_rating_stats_key_unique UNIQUE (key);

-- 3. Reescrever recalc_system_rating_stats com UPSERT + fail-safe
CREATE OR REPLACE FUNCTION public.recalc_system_rating_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
BEGIN
  BEGIN
    INSERT INTO public.system_rating_stats (key, avg_stars, ratings_count, stars_1, stars_2, stars_3, stars_4, stars_5, last_rating_at, updated_at)
    SELECT
      'global',
      COALESCE(AVG(stars), 0),
      COUNT(*),
      COUNT(*) FILTER (WHERE stars = 1),
      COUNT(*) FILTER (WHERE stars = 2),
      COUNT(*) FILTER (WHERE stars = 3),
      COUNT(*) FILTER (WHERE stars = 4),
      COUNT(*) FILTER (WHERE stars = 5),
      MAX(created_at),
      now()
    FROM public.system_ratings
    WHERE is_hidden_by_admin = false
    ON CONFLICT (key) DO UPDATE SET
      avg_stars = EXCLUDED.avg_stars,
      ratings_count = EXCLUDED.ratings_count,
      stars_1 = EXCLUDED.stars_1,
      stars_2 = EXCLUDED.stars_2,
      stars_3 = EXCLUDED.stars_3,
      stars_4 = EXCLUDED.stars_4,
      stars_5 = EXCLUDED.stars_5,
      last_rating_at = EXCLUDED.last_rating_at,
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    -- Log falha mas NÃO bloqueia a avaliação do usuário
    RAISE WARNING 'recalc_system_rating_stats falhou: %', SQLERRM;
  END;
  RETURN NULL;
END;
$function$;

-- 4. Reescrever recalc_module_rating_stats com fail-safe
CREATE OR REPLACE FUNCTION public.recalc_module_rating_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  v_module_id UUID;
BEGIN
  v_module_id := COALESCE(NEW.module_id, OLD.module_id);
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'recalc_module_rating_stats falhou para module %: %', v_module_id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
