-- Fix selected plan FK to match current access-control model (plans_v2)
-- This resolves onboarding ZPL selection failures caused by FK mismatch.

ALTER TABLE public.user_access_state
DROP CONSTRAINT IF EXISTS user_access_state_selected_plan_id_fkey;

-- Safety cleanup before adding the new FK
UPDATE public.user_access_state uas
SET selected_plan_id = NULL
WHERE uas.selected_plan_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.plans_v2 p2
    WHERE p2.id = uas.selected_plan_id
  );

ALTER TABLE public.user_access_state
ADD CONSTRAINT user_access_state_selected_plan_id_fkey
FOREIGN KEY (selected_plan_id)
REFERENCES public.plans_v2(id)
ON DELETE SET NULL;