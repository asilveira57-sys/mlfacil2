-- Cleanup duplicate ML account connections under autorizada@uol.com.br (user 3eb654fb-e01a-41b2-b0e3-e8567845c1df)
-- Keep all 4 sellers exclusively under santaritavendasdepecas@gmail.com (user 7f327157-17b8-4a80-ba96-6b5d148d291e)

UPDATE public.ml_accounts
SET
  is_active = false,
  is_connected = false,
  connection_status = 'disconnected',
  refresh_token = NULL,
  access_token = NULL,
  token_expires_at = NULL,
  last_api_error_code = 'admin_cleanup_duplicate_tenant',
  last_api_error_at = now(),
  updated_at = now()
WHERE user_id = '3eb654fb-e01a-41b2-b0e3-e8567845c1df'
  AND ml_user_id IN ('1156546479', '19615006', '28598182', '285619990');

-- Audit trail
INSERT INTO public.account_events (user_id, event_type, module, event_scope, event_source, event_date, event_data)
SELECT
  '3eb654fb-e01a-41b2-b0e3-e8567845c1df',
  'admin_ml_account_cleanup',
  'admin',
  'connection_state',
  'migration',
  now(),
  jsonb_build_object(
    'accountId', id,
    'ml_user_id', ml_user_id,
    'nickname', nickname,
    'reason', 'duplicate_tenant_conflict_resolved_to_santaritavendasdepecas'
  )
FROM public.ml_accounts
WHERE user_id = '3eb654fb-e01a-41b2-b0e3-e8567845c1df'
  AND ml_user_id IN ('1156546479', '19615006', '28598182', '285619990');