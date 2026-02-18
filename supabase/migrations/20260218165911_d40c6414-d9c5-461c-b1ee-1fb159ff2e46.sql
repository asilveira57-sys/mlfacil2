-- Drop the old 9-parameter version of get_shipping_orders (without p_period_type)
DROP FUNCTION IF EXISTS public.get_shipping_orders(
  text, 
  timestamp with time zone, 
  timestamp with time zone, 
  text, 
  text, 
  text, 
  text, 
  integer, 
  integer
);