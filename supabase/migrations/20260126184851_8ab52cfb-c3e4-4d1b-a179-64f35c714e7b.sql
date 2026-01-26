-- Habilitar realtime para as tabelas de promoções
ALTER PUBLICATION supabase_realtime ADD TABLE public.promotion_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.promotion_items_snapshots;