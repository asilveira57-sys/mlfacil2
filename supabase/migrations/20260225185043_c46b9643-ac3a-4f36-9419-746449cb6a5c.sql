
-- Add max_sales column to plans table to define the upper limit of sales for each plan tier
ALTER TABLE public.plans ADD COLUMN max_sales integer DEFAULT NULL;

-- Set max_sales for each volume plan based on their slug
UPDATE public.plans SET max_sales = 50 WHERE slug = 'ate-50-vendas';
UPDATE public.plans SET max_sales = 300 WHERE slug = '51-300-vendas';
UPDATE public.plans SET max_sales = 700 WHERE slug = '301-700-vendas';
UPDATE public.plans SET max_sales = 1500 WHERE slug = '701-1500-vendas';
UPDATE public.plans SET max_sales = 3000 WHERE slug = '1501-3000-vendas';
UPDATE public.plans SET max_sales = NULL WHERE slug = 'acima-3000-vendas'; -- unlimited
UPDATE public.plans SET max_sales = NULL WHERE slug = 'zpl-full'; -- N/A for ZPL

-- Also add min_sales for clarity
ALTER TABLE public.plans ADD COLUMN min_sales integer DEFAULT 0;

UPDATE public.plans SET min_sales = 0 WHERE slug = 'ate-50-vendas';
UPDATE public.plans SET min_sales = 51 WHERE slug = '51-300-vendas';
UPDATE public.plans SET min_sales = 301 WHERE slug = '301-700-vendas';
UPDATE public.plans SET min_sales = 701 WHERE slug = '701-1500-vendas';
UPDATE public.plans SET min_sales = 1501 WHERE slug = '1501-3000-vendas';
UPDATE public.plans SET min_sales = 3001 WHERE slug = 'acima-3000-vendas';
