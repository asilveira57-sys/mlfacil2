-- Fix user_context FK to match the unified account source of truth (ml_accounts)
-- This prevents 409/23503 conflicts when persisting active account selection.

ALTER TABLE public.user_context
  DROP CONSTRAINT IF EXISTS user_context_active_marketplace_account_id_fkey;

ALTER TABLE public.user_context
  ADD CONSTRAINT user_context_active_marketplace_account_id_fkey
  FOREIGN KEY (active_marketplace_account_id)
  REFERENCES public.ml_accounts(id)
  ON DELETE SET NULL;