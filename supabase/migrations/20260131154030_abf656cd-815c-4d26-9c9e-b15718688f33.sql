-- Add new columns to ml_accounts for proper connection status tracking
-- connection_status: 'connected' | 'attention' | 'disconnected' | 'revoked'
ALTER TABLE public.ml_accounts 
ADD COLUMN IF NOT EXISTS connection_status text DEFAULT 'connected';

-- Track last successful token refresh and API call
ALTER TABLE public.ml_accounts 
ADD COLUMN IF NOT EXISTS last_token_refresh_at timestamptz;

ALTER TABLE public.ml_accounts 
ADD COLUMN IF NOT EXISTS last_api_ok_at timestamptz;

-- Track last error for diagnostics
ALTER TABLE public.ml_accounts 
ADD COLUMN IF NOT EXISTS last_api_error_code text;

ALTER TABLE public.ml_accounts 
ADD COLUMN IF NOT EXISTS last_api_error_at timestamptz;

-- Count of consecutive failures (reset on success)
ALTER TABLE public.ml_accounts 
ADD COLUMN IF NOT EXISTS consecutive_failures int DEFAULT 0;

-- Add index for active queries
CREATE INDEX IF NOT EXISTS idx_ml_accounts_connection_status 
ON public.ml_accounts(user_id, connection_status);

-- Update existing rows: set connection_status based on is_active and token expiry
UPDATE public.ml_accounts 
SET connection_status = CASE 
  WHEN access_token IS NULL OR access_token = '' THEN 'disconnected'
  WHEN token_expires_at < NOW() THEN 'attention'
  ELSE 'connected'
END,
last_api_ok_at = CASE 
  WHEN access_token IS NOT NULL AND access_token != '' THEN updated_at 
  ELSE NULL 
END;

-- Add constraint for connection_status values
ALTER TABLE public.ml_accounts
DROP CONSTRAINT IF EXISTS check_connection_status;

ALTER TABLE public.ml_accounts
ADD CONSTRAINT check_connection_status 
CHECK (connection_status IN ('connected', 'attention', 'disconnected', 'revoked'));