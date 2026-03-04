
-- Trigger to enqueue user_registered email when a profile is created
-- Uses pg_net to call the edge function asynchronously
CREATE OR REPLACE FUNCTION public.trigger_email_user_registered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Fire-and-forget: enqueue user_registered email event via pg_net
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/email-enqueue-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'event_key', 'user_registered',
      'user_id', NEW.user_id::text,
      'to_email', NEW.email,
      'variables', jsonb_build_object(
        'user_name', COALESCE(NEW.full_name, 'Usuário'),
        'user_email', COALESCE(NEW.email, '')
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fail-safe: never block profile creation
  RAISE WARNING 'email_user_registered trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_email_on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_email_user_registered();
