
-- Add is_global column to freight_rulesets
ALTER TABLE public.freight_rulesets ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

-- Fix existing weights that are still in grams (> 50 means it's grams, not kg)
UPDATE public.meli_listings_cache 
SET weight_kg = weight_kg / 1000 
WHERE weight_kg > 50 
  AND weight_kg IS NOT NULL;
