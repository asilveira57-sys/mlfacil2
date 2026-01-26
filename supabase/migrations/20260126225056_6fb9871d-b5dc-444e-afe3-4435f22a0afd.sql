-- ============================================================
-- CONSOLIDAÇÃO DE CONEXÕES ML: Prevenção de Duplicatas
-- ============================================================
-- Fonte da verdade: ml_accounts
-- Tabelas derivadas: ads_connections, marketplace_accounts
-- ============================================================

-- 1. Função para buscar ou criar conta de forma segura (previne duplicatas)
CREATE OR REPLACE FUNCTION public.get_or_create_ml_account(
  p_user_id UUID,
  p_seller_id TEXT,
  p_nickname TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_access_token TEXT DEFAULT '',
  p_refresh_token TEXT DEFAULT '',
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  account_id UUID,
  is_new BOOLEAN,
  seller_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  -- Check if account already exists
  SELECT id INTO v_existing_id
  FROM ml_accounts
  WHERE user_id = p_user_id
    AND ml_user_id = p_seller_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Update existing account (reconnection case)
    UPDATE ml_accounts
    SET 
      access_token = COALESCE(NULLIF(p_access_token, ''), access_token),
      refresh_token = COALESCE(NULLIF(p_refresh_token, ''), refresh_token),
      token_expires_at = COALESCE(p_expires_at, token_expires_at),
      is_active = true,
      nickname = COALESCE(p_nickname, nickname),
      email = COALESCE(p_email, email),
      updated_at = now()
    WHERE id = v_existing_id;

    RETURN QUERY SELECT v_existing_id, false, p_seller_id;
  ELSE
    -- Create new account
    INSERT INTO ml_accounts (
      user_id,
      ml_user_id,
      nickname,
      email,
      access_token,
      refresh_token,
      token_expires_at,
      is_active
    ) VALUES (
      p_user_id,
      p_seller_id,
      p_nickname,
      p_email,
      COALESCE(p_access_token, ''),
      COALESCE(p_refresh_token, ''),
      COALESCE(p_expires_at, now() + interval '6 hours'),
      true
    )
    RETURNING id INTO v_new_id;

    RETURN QUERY SELECT v_new_id, true, p_seller_id;
  END IF;
END;
$$;

-- 2. Função para garantir ads_connection vinculada (auto-link)
CREATE OR REPLACE FUNCTION public.ensure_ads_connection(
  p_user_id UUID,
  p_seller_id TEXT
)
RETURNS TABLE (
  connection_id UUID,
  is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
  v_new_id UUID;
  v_ml_account RECORD;
BEGIN
  -- Check if ads_connection already exists
  SELECT id INTO v_existing_id
  FROM ads_connections
  WHERE user_id = p_user_id
    AND seller_id = p_seller_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, false;
    RETURN;
  END IF;

  -- Get ml_account info for linking
  SELECT id, nickname, email
  INTO v_ml_account
  FROM ml_accounts
  WHERE user_id = p_user_id
    AND ml_user_id = p_seller_id
    AND is_active = true
  LIMIT 1;

  IF v_ml_account IS NULL THEN
    -- No ml_account to link
    RETURN;
  END IF;

  -- Create ads_connection linked to ml_account
  INSERT INTO ads_connections (
    user_id,
    seller_id,
    status,
    status_message,
    ml_account_name,
    ml_account_email,
    connected_at,
    auto_sync_enabled,
    sync_interval_hours,
    next_scheduled_sync_at
  ) VALUES (
    p_user_id,
    p_seller_id,
    'connected',
    'Vinculado automaticamente via conta Mercado Livre',
    v_ml_account.nickname,
    v_ml_account.email,
    now(),
    true,
    6,
    now() + interval '6 hours'
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id, true;
END;
$$;

-- 3. Índices para performance e integridade
CREATE INDEX IF NOT EXISTS idx_ml_accounts_user_seller 
  ON ml_accounts(user_id, ml_user_id);

CREATE INDEX IF NOT EXISTS idx_ads_connections_user_seller 
  ON ads_connections(user_id, seller_id);

-- 4. Constraint única para prevenir duplicatas (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ml_accounts_user_seller_unique'
  ) THEN
    ALTER TABLE ml_accounts 
    ADD CONSTRAINT ml_accounts_user_seller_unique 
    UNIQUE (user_id, ml_user_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'ads_connections_user_seller_unique'
  ) THEN
    ALTER TABLE ads_connections 
    ADD CONSTRAINT ads_connections_user_seller_unique 
    UNIQUE (user_id, seller_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END;
$$;

-- 5. View de compatibilidade: unified_marketplace_accounts
CREATE OR REPLACE VIEW public.unified_marketplace_accounts AS
SELECT 
  ma.id,
  ma.user_id,
  ma.ml_user_id as seller_id,
  ma.nickname,
  ma.email,
  'mercadolivre'::text as provider,
  CASE 
    WHEN ma.is_active = false THEN 'disconnected'
    WHEN ma.token_expires_at < now() THEN 'expired'
    ELSE 'connected'
  END::text as status,
  ma.is_active,
  ma.created_at,
  ma.updated_at,
  -- ADS connection info (if linked)
  ac.id as ads_connection_id,
  ac.last_sync_at as ads_last_sync,
  ac.auto_sync_enabled as ads_auto_sync
FROM ml_accounts ma
LEFT JOIN ads_connections ac 
  ON ac.user_id = ma.user_id 
  AND ac.seller_id = ma.ml_user_id;

-- Grant access to authenticated users
GRANT SELECT ON public.unified_marketplace_accounts TO authenticated;

COMMENT ON VIEW public.unified_marketplace_accounts IS 
'View unificada de contas marketplace. Fonte: ml_accounts (verdade), com dados de ads_connections quando disponíveis.';