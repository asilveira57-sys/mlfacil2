CREATE TABLE public.landing_public_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_valor_30d numeric NOT NULL DEFAULT 0,
  total_pedidos_30d bigint NOT NULL DEFAULT 0,
  ticket_medio_30d numeric NOT NULL DEFAULT 0,
  pedidos_por_dia_30d numeric NOT NULL DEFAULT 0,
  period_start timestamptz,
  period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.landing_public_stats TO anon;
GRANT SELECT ON public.landing_public_stats TO authenticated;
GRANT ALL ON public.landing_public_stats TO service_role;

ALTER TABLE public.landing_public_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read landing stats"
ON public.landing_public_stats
FOR SELECT
USING (true);

INSERT INTO public.landing_public_stats (total_valor_30d, total_pedidos_30d, ticket_medio_30d, pedidos_por_dia_30d)
VALUES (0, 0, 0, 0);