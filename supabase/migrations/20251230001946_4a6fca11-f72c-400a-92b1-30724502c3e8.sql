-- Add logistic_type column to track FULL vs seller shipping
ALTER TABLE meli_shipments_cache 
ADD COLUMN IF NOT EXISTS logistic_type text;