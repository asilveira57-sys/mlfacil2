-- Fix specific user: Mario Henrique (delatripshop@gmail.com)

-- Activate trial on user_access_state
UPDATE public.user_access_state
SET 
  trial_status = 'active',
  trial_start_at = now(),
  trial_end_at = now() + interval '14 days',
  payment_status = 'trial',
  onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
  updated_at = now()
WHERE user_id = 'ac476662-1df2-4ec9-8ac4-07fef86a6f63'
  AND trial_status = 'none';

-- Activate trial on the primary company
UPDATE public.companies
SET 
  trial_started_at = now(),
  trial_ends_at = now() + interval '14 days',
  trial_status = 'active',
  updated_at = now()
WHERE id = '6f47bac1-f1f4-4b37-92b4-e108b44d462b';

-- Deactivate the duplicate company
UPDATE public.companies
SET is_active = false, updated_at = now()
WHERE id = '13c2a775-5188-4f65-bf86-23e8150d7b98'
  AND user_id = 'ac476662-1df2-4ec9-8ac4-07fef86a6f63';

-- Log the manual fix
INSERT INTO public.system_audit_log (user_id, event_type, event_category, target_id, details)
VALUES (
  'ac476662-1df2-4ec9-8ac4-07fef86a6f63',
  'TRIAL_MANUAL_ACTIVATED',
  'admin_fix',
  'ac476662-1df2-4ec9-8ac4-07fef86a6f63',
  '{"trigger": "admin_fix", "trial_days": 14, "reason": "onboarding_completed_before_trial_auto_activation_fix", "duplicate_company_deactivated": "13c2a775-5188-4f65-bf86-23e8150d7b98"}'::jsonb
);