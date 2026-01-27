-- =====================================================
-- ADMIN MODULE: Complete Setup
-- =====================================================

-- 1. Seed initial admin users (upsert to handle existing users)
-- We need to insert into user_roles for users that already exist

-- First, create a function to safely add admin role by email
CREATE OR REPLACE FUNCTION public.add_admin_by_email(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Find user by email in auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  
  IF v_user_id IS NOT NULL THEN
    -- Insert admin role if not exists
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;

-- Add initial admin users
SELECT public.add_admin_by_email('asilveira57@gmail.com');
SELECT public.add_admin_by_email('etiquetacapixaba2@gmail.com');

-- 2. Create admin action audit log for tracking all admin actions
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action_type text NOT NULL,
  target_table text,
  target_id text,
  old_value jsonb,
  new_value jsonb,
  description text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
ON public.admin_action_log
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert audit logs
CREATE POLICY "Admins can insert audit logs"
ON public.admin_action_log
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Create onboarding_cards table for managing first-access cards
CREATE TABLE IF NOT EXISTS public.onboarding_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  link_url text,
  icon_name text,
  display_condition text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.onboarding_cards ENABLE ROW LEVEL SECURITY;

-- Everyone can read active cards
CREATE POLICY "Anyone can read active onboarding cards"
ON public.onboarding_cards
FOR SELECT
USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

-- Only admins can manage cards
CREATE POLICY "Admins can manage onboarding cards"
ON public.onboarding_cards
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Create platform_settings table for global configuration
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  category text NOT NULL DEFAULT 'general',
  is_public boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Public settings can be read by anyone, private only by admins
CREATE POLICY "Read platform settings"
ON public.platform_settings
FOR SELECT
USING (is_public = true OR public.has_role(auth.uid(), 'admin'));

-- Only admins can manage settings
CREATE POLICY "Admins can manage platform settings"
ON public.platform_settings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Insert default platform settings
INSERT INTO public.platform_settings (key, value, description, category, is_public) VALUES
  ('platform_name', '"MKTPFacil"', 'Nome da plataforma', 'general', true),
  ('platform_domain', '"mlfacil2.lovable.app"', 'Domínio principal', 'general', true),
  ('platform_logo_url', '""', 'URL do logotipo', 'general', true),
  ('seo_default_title', '"MKTPFacil - Gestão Inteligente para Vendedores"', 'Title padrão para SEO', 'seo', true),
  ('seo_default_description', '"Plataforma completa para vendedores do Mercado Livre"', 'Description padrão para SEO', 'seo', true),
  ('analytics_ga4_id', '""', 'Google Analytics 4 ID', 'integrations', false),
  ('analytics_gtm_id', '""', 'Google Tag Manager ID', 'integrations', false),
  ('analytics_meta_pixel_id', '""', 'Meta Pixel ID', 'integrations', false),
  ('footer_links', '[]', 'Links do rodapé', 'general', true),
  ('system_emails', '{"support": "", "noreply": ""}', 'E-mails do sistema', 'general', false)
ON CONFLICT (key) DO NOTHING;

-- 5. Create seo_page_settings for per-page SEO control
CREATE TABLE IF NOT EXISTS public.seo_page_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path text UNIQUE NOT NULL,
  meta_title text,
  meta_description text,
  canonical_url text,
  og_title text,
  og_description text,
  og_image text,
  robots_index boolean NOT NULL DEFAULT true,
  robots_follow boolean NOT NULL DEFAULT true,
  structured_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.seo_page_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read SEO settings (needed for meta tags)
CREATE POLICY "Anyone can read SEO settings"
ON public.seo_page_settings
FOR SELECT
USING (true);

-- Only admins can manage SEO
CREATE POLICY "Admins can manage SEO settings"
ON public.seo_page_settings
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- 6. Create integration_status table for tracking external integrations
CREATE TABLE IF NOT EXISTS public.integration_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  error_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.integration_status ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage integrations
CREATE POLICY "Admins can manage integrations"
ON public.integration_status
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Insert default integrations
INSERT INTO public.integration_status (integration_name, display_name, status) VALUES
  ('mercado_livre', 'Mercado Livre', 'active'),
  ('mercado_pago', 'Mercado Pago', 'active'),
  ('google_analytics', 'Google Analytics 4', 'inactive'),
  ('meta_pixel', 'Meta Pixel', 'inactive'),
  ('google_tag_manager', 'Google Tag Manager', 'inactive')
ON CONFLICT (integration_name) DO NOTHING;

-- 7. Helper function to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action_type text,
  p_target_table text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_old_value jsonb DEFAULT NULL,
  p_new_value jsonb DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.admin_action_log (
    admin_user_id,
    action_type,
    target_table,
    target_id,
    old_value,
    new_value,
    description
  ) VALUES (
    auth.uid(),
    p_action_type,
    p_target_table,
    p_target_id,
    p_old_value,
    p_new_value,
    p_description
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- 8. Function to get admin dashboard stats
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats jsonb;
BEGIN
  -- Only allow admins
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('error', 'Unauthorized');
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM auth.users),
    'trial_users', (SELECT COUNT(*) FROM public.user_access_state WHERE subscription_status = 'trial'),
    'active_subscriptions', (SELECT COUNT(*) FROM public.user_access_state WHERE subscription_status = 'active'),
    'expired_subscriptions', (SELECT COUNT(*) FROM public.user_access_state WHERE subscription_status = 'expired'),
    'pending_webhooks', (SELECT COUNT(*) FROM public.mp_webhook_logs WHERE processed_at IS NULL),
    'recent_signups_7d', (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '7 days'),
    'trials_expiring_soon', (SELECT COUNT(*) FROM public.user_access_state WHERE trial_end_at > now() AND trial_end_at < now() + interval '3 days')
  ) INTO v_stats;
  
  RETURN v_stats;
END;
$$;

-- 9. Function to manage user roles (admin only)
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_target_user_id uuid,
  p_role app_role,
  p_action text -- 'add' or 'remove'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow admins
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_action = 'add' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_target_user_id, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF p_action = 'remove' THEN
    DELETE FROM public.user_roles
    WHERE user_id = p_target_user_id AND role = p_role;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  -- Log the action
  PERFORM public.log_admin_action(
    'user_role_change',
    'user_roles',
    p_target_user_id::text,
    NULL,
    jsonb_build_object('role', p_role, 'action', p_action),
    'Admin changed user role'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 10. Function to adjust user trial period (admin only)
CREATE OR REPLACE FUNCTION public.admin_adjust_trial(
  p_target_user_id uuid,
  p_days_adjustment int, -- positive to add, negative to remove
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_end_at timestamptz;
  v_new_end_at timestamptz;
BEGIN
  -- Only allow admins
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Get current trial end
  SELECT trial_end_at INTO v_old_end_at
  FROM public.user_access_state
  WHERE user_id = p_target_user_id;

  IF v_old_end_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found or no trial period');
  END IF;

  -- Calculate new end date
  v_new_end_at := v_old_end_at + (p_days_adjustment || ' days')::interval;

  -- Update trial end
  UPDATE public.user_access_state
  SET trial_end_at = v_new_end_at,
      updated_at = now()
  WHERE user_id = p_target_user_id;

  -- Log the action
  PERFORM public.log_admin_action(
    'trial_adjustment',
    'user_access_state',
    p_target_user_id::text,
    jsonb_build_object('trial_end_at', v_old_end_at),
    jsonb_build_object('trial_end_at', v_new_end_at, 'days_adjusted', p_days_adjustment),
    COALESCE(p_reason, 'Trial period adjusted by admin')
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_end_at', v_old_end_at,
    'new_end_at', v_new_end_at
  );
END;
$$;

-- 11. Function to reset user trial (admin only)
CREATE OR REPLACE FUNCTION public.admin_reset_trial(
  p_target_user_id uuid,
  p_trial_days int DEFAULT 7,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_state jsonb;
  v_new_end_at timestamptz;
BEGIN
  -- Only allow admins
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Get current state
  SELECT jsonb_build_object(
    'trial_end_at', trial_end_at,
    'subscription_status', subscription_status
  ) INTO v_old_state
  FROM public.user_access_state
  WHERE user_id = p_target_user_id;

  IF v_old_state IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Calculate new trial end
  v_new_end_at := now() + (p_trial_days || ' days')::interval;

  -- Update state
  UPDATE public.user_access_state
  SET trial_end_at = v_new_end_at,
      subscription_status = 'trial',
      updated_at = now()
  WHERE user_id = p_target_user_id;

  -- Log the action
  PERFORM public.log_admin_action(
    'trial_reset',
    'user_access_state',
    p_target_user_id::text,
    v_old_state,
    jsonb_build_object('trial_end_at', v_new_end_at, 'trial_days', p_trial_days),
    COALESCE(p_reason, 'Trial period reset by admin')
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_trial_end_at', v_new_end_at
  );
END;
$$;

-- 12. Function to block/unblock user (admin only)
CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(
  p_target_user_id uuid,
  p_blocked boolean,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
BEGIN
  -- Only allow admins
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Get current status
  SELECT subscription_status INTO v_old_status
  FROM public.user_access_state
  WHERE user_id = p_target_user_id;

  IF v_old_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Update status
  UPDATE public.user_access_state
  SET subscription_status = CASE WHEN p_blocked THEN 'blocked' ELSE 'trial' END,
      updated_at = now()
  WHERE user_id = p_target_user_id;

  -- Log the action
  PERFORM public.log_admin_action(
    CASE WHEN p_blocked THEN 'user_blocked' ELSE 'user_unblocked' END,
    'user_access_state',
    p_target_user_id::text,
    jsonb_build_object('subscription_status', v_old_status),
    jsonb_build_object('subscription_status', CASE WHEN p_blocked THEN 'blocked' ELSE 'trial' END),
    COALESCE(p_reason, CASE WHEN p_blocked THEN 'User blocked by admin' ELSE 'User unblocked by admin' END)
  );

  RETURN jsonb_build_object('success', true, 'blocked', p_blocked);
END;
$$;

-- 13. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_action_log_admin_user ON public.admin_action_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_created_at ON public.admin_action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_action_type ON public.admin_action_log(action_type);
CREATE INDEX IF NOT EXISTS idx_onboarding_cards_sort_order ON public.onboarding_cards(sort_order);
CREATE INDEX IF NOT EXISTS idx_platform_settings_category ON public.platform_settings(category);
CREATE INDEX IF NOT EXISTS idx_seo_page_settings_path ON public.seo_page_settings(page_path);