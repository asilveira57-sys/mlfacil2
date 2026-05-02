DROP FUNCTION IF EXISTS public.get_sales_metrics(text, date, date);
DROP FUNCTION IF EXISTS public.get_orders_needing_cost_sync(text, integer, integer);
DROP FUNCTION IF EXISTS public.count_orders_needing_cost_sync(text);

NOTIFY pgrst, 'reload schema';