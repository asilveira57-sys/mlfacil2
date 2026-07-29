CREATE OR REPLACE FUNCTION public.auto_start_trial_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.trial_started_at IS NULL THEN
    UPDATE public.companies
    SET trial_started_at = now(),
        trial_ends_at = now() + interval '14 days',
        updated_at = now()
    WHERE id = NEW.id
      AND trial_started_at IS NULL;

    UPDATE public.user_access_state
    SET trial_status = 'active',
        trial_start_at = now(),
        trial_end_at = now() + interval '14 days',
        updated_at = now()
    WHERE user_id = NEW.user_id
      AND trial_status = 'none';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_start_trial ON public.companies;
CREATE TRIGGER trg_auto_start_trial
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.auto_start_trial_on_company();