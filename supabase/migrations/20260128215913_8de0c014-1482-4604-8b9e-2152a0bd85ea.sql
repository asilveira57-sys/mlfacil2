-- Fix user_context constraint: drop constraint (not index) and ensure proper UNIQUE constraint exists
-- The error revealed user_context_user_id_key is already a constraint, not just an index

-- Drop the existing constraint that prevents the upsert from working correctly
ALTER TABLE public.user_context 
  DROP CONSTRAINT IF EXISTS user_context_user_id_key;

-- Ensure a properly named UNIQUE constraint exists for onConflict: 'user_id'
ALTER TABLE public.user_context 
  DROP CONSTRAINT IF EXISTS user_context_user_id_unique;

ALTER TABLE public.user_context 
  ADD CONSTRAINT user_context_user_id_unique UNIQUE (user_id);