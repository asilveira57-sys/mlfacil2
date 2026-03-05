-- Add display_order column to tenant_plans
ALTER TABLE public.tenant_plans ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;