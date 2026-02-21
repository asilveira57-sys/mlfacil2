
ALTER TABLE onboarding_user_progress
  DROP CONSTRAINT IF EXISTS onboarding_user_progress_company_id_seller_id_user_id_flow__key;

ALTER TABLE onboarding_user_progress
  ALTER COLUMN seller_id TYPE text USING seller_id::text;

ALTER TABLE onboarding_user_progress
  ADD CONSTRAINT onboarding_user_progress_company_id_seller_id_user_id_flow__key
  UNIQUE (company_id, seller_id, user_id, flow_id, flow_versao);
