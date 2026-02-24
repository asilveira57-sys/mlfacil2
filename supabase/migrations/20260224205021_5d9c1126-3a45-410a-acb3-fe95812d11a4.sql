
-- 1) Allow NULL tokens in ml_accounts
ALTER TABLE public.ml_accounts ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE public.ml_accounts ALTER COLUMN refresh_token DROP NOT NULL;
ALTER TABLE public.ml_accounts ALTER COLUMN token_expires_at DROP NOT NULL;

-- 2) Add revocation tracking columns
ALTER TABLE public.ml_accounts ADD COLUMN IF NOT EXISTS is_connected boolean NOT NULL DEFAULT true;
ALTER TABLE public.ml_accounts ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL;
ALTER TABLE public.ml_accounts ADD COLUMN IF NOT EXISTS revoked_by uuid NULL;
ALTER TABLE public.ml_accounts ADD COLUMN IF NOT EXISTS revoke_reason text NULL;

-- 3) Backfill: accounts with empty tokens or connection_status='disconnected' are not connected
UPDATE public.ml_accounts
SET is_connected = false,
    access_token = NULL,
    refresh_token = NULL,
    token_expires_at = NULL
WHERE connection_status = 'disconnected'
   OR access_token = ''
   OR token_expires_at = '1970-01-01T00:00:00.000Z';
