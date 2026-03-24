
-- Fix FK constraints that block auth.users deletion (change to ON DELETE SET NULL or CASCADE)

-- sync_jobs.created_by_user_id -> SET NULL
ALTER TABLE public.sync_jobs DROP CONSTRAINT sync_jobs_created_by_user_id_fkey;
ALTER TABLE public.sync_jobs ADD CONSTRAINT sync_jobs_created_by_user_id_fkey 
  FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- app_notifications.resolved_by -> SET NULL
ALTER TABLE public.app_notifications DROP CONSTRAINT app_notifications_resolved_by_fkey;
ALTER TABLE public.app_notifications ADD CONSTRAINT app_notifications_resolved_by_fkey 
  FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- email_campaigns.created_by -> SET NULL
ALTER TABLE public.email_campaigns DROP CONSTRAINT email_campaigns_created_by_fkey;
ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- email_queue.user_id -> CASCADE
ALTER TABLE public.email_queue DROP CONSTRAINT email_queue_user_id_fkey;
ALTER TABLE public.email_queue ADD CONSTRAINT email_queue_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- learned_listings.imported_by -> SET NULL
ALTER TABLE public.learned_listings DROP CONSTRAINT learned_listings_imported_by_fkey;
ALTER TABLE public.learned_listings ADD CONSTRAINT learned_listings_imported_by_fkey 
  FOREIGN KEY (imported_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ml_publication_jobs.created_by -> SET NULL
ALTER TABLE public.ml_publication_jobs DROP CONSTRAINT ml_publication_jobs_created_by_fkey;
ALTER TABLE public.ml_publication_jobs ADD CONSTRAINT ml_publication_jobs_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- pricing_simulation_events.actor_user_id -> SET NULL
ALTER TABLE public.pricing_simulation_events DROP CONSTRAINT pricing_simulation_events_actor_user_id_fkey;
ALTER TABLE public.pricing_simulation_events ADD CONSTRAINT pricing_simulation_events_actor_user_id_fkey 
  FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- pricing_simulations.created_by_user_id -> SET NULL
ALTER TABLE public.pricing_simulations DROP CONSTRAINT pricing_simulations_created_by_user_id_fkey;
ALTER TABLE public.pricing_simulations ADD CONSTRAINT pricing_simulations_created_by_user_id_fkey 
  FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- product_records.created_by -> SET NULL
ALTER TABLE public.product_records DROP CONSTRAINT product_records_created_by_fkey;
ALTER TABLE public.product_records ADD CONSTRAINT product_records_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
