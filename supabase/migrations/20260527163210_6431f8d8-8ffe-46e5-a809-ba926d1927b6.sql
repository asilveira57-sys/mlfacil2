
-- Expire old trial assignment for BS TOOLS owner
UPDATE public.user_plan_assignments
SET status = 'expired', updated_at = now()
WHERE id = '8adab48c-ade7-4a32-811a-6168531fc607'
  AND status = 'active';

-- Insert active Veterano assignment matching the paid entitlement period
INSERT INTO public.user_plan_assignments
  (tenant_id, user_id, plan_tier_id, status, starts_at, expires_at, is_trial, notes)
SELECT
  '4d1be4c6-5af4-4d97-b0a9-8f8102d68605'::uuid,
  '4f366f15-7c5c-4cbf-8c95-76b82c84853f'::uuid,
  'f1e2d3c4-b5a6-7890-abcd-ef1234567890'::uuid,
  'active',
  '2026-05-27 16:30:06.58385+00'::timestamptz,
  '2026-11-27 16:30:06.58385+00'::timestamptz,
  false,
  'Sync manual: pagamento MP 161235408978 (Veterano semestral) reconhecido em entitlement 812c717c-85d1-46c2-88f7-1fab331b560f'
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_plan_assignments
  WHERE user_id = '4f366f15-7c5c-4cbf-8c95-76b82c84853f'
    AND plan_tier_id = 'f1e2d3c4-b5a6-7890-abcd-ef1234567890'
    AND status = 'active'
);
