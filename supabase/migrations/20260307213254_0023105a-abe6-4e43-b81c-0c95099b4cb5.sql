
-- 1. Create trigger function to auto-create company + mark onboarding completed on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_display_name text;
BEGIN
  -- Extract display name from email (part before @)
  v_display_name := split_part(NEW.email, '@', 1);
  IF v_display_name IS NULL OR v_display_name = '' THEN
    v_display_name := 'Minha Empresa';
  END IF;

  -- Create company for the new user
  INSERT INTO public.companies (user_id, display_name, is_primary)
  VALUES (NEW.id, v_display_name, true)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_company_id;

  -- Mark onboarding as completed so ProtectedRoute doesn't block
  -- The welcome cards (admin-managed) will handle the real onboarding experience
  UPDATE public.user_access_state
  SET onboarding_status = 'completed',
      onboarding_completed_at = now(),
      updated_at = now()
  WHERE user_id = NEW.id
    AND onboarding_status = 'pending';

  RETURN NEW;
END;
$$;

-- 2. Create trigger on auth.users (fires AFTER insert)
-- NOTE: We attach to user_access_state instead since we can't attach to auth.users
-- Actually, let's use a different approach: trigger on user_access_state insert
DROP TRIGGER IF EXISTS trg_auto_setup_new_user ON public.user_access_state;

CREATE TRIGGER trg_auto_setup_new_user
  AFTER INSERT ON public.user_access_state
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_setup();

-- 3. Insert ML connection step into the welcome flow (ordem 5, push existing step 5 to 6)
UPDATE public.onboarding_steps
SET ordem = 6
WHERE flow_id = 'b91a534a-93b7-4686-9789-449e6f5e3b9e'
  AND ordem = 5;

INSERT INTO public.onboarding_steps (flow_id, ordem, tipo, titulo, conteudo, cta_label, cta_route, obrigatoria)
VALUES (
  'b91a534a-93b7-4686-9789-449e6f5e3b9e',
  5,
  'acao',
  'Conecte seu Mercado Livre',
  'Para importar seus pedidos e etiquetas, conecte sua conta do Mercado Livre. Você será redirecionado para autorizar o acesso.',
  'Conectar Mercado Livre',
  '/settings',
  false
);
