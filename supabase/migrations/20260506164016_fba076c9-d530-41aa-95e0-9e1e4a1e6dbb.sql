
-- 1. verification_links: remove public SELECT
DROP POLICY IF EXISTS "Anyone can read verification links" ON public.verification_links;

-- 2. blog_posts/blog_categories: remove overly permissive ALL policies
DROP POLICY IF EXISTS "Authenticated users can manage posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Authenticated users can manage categories" ON public.blog_categories;

-- 3. title_suggestion_analysis & listing_keyword_feedback: scope to owner
DROP POLICY IF EXISTS "Authenticated users manage title suggestions" ON public.title_suggestion_analysis;
CREATE POLICY "Owners manage title suggestions"
  ON public.title_suggestion_analysis FOR ALL TO authenticated
  USING (seller_id IN (SELECT ml_user_id FROM public.ml_accounts WHERE user_id = auth.uid()))
  WITH CHECK (seller_id IN (SELECT ml_user_id FROM public.ml_accounts WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated users manage own keyword feedback" ON public.listing_keyword_feedback;
CREATE POLICY "Owners manage keyword feedback"
  ON public.listing_keyword_feedback FOR ALL TO authenticated
  USING (seller_id IN (SELECT ml_user_id FROM public.ml_accounts WHERE user_id = auth.uid()))
  WITH CHECK (seller_id IN (SELECT ml_user_id FROM public.ml_accounts WHERE user_id = auth.uid()));

-- 4. visual_identity_settings: scope writes to owner
DROP POLICY IF EXISTS "Users can update own visual identity settings" ON public.visual_identity_settings;
DROP POLICY IF EXISTS "Users can upsert own visual identity settings" ON public.visual_identity_settings;
CREATE POLICY "Owners insert visual identity settings"
  ON public.visual_identity_settings FOR INSERT TO authenticated
  WITH CHECK (
    (seller_id)::text IN (SELECT ml_user_id FROM public.ml_accounts WHERE user_id = auth.uid() AND is_active = true)
  );
CREATE POLICY "Owners update visual identity settings"
  ON public.visual_identity_settings FOR UPDATE TO authenticated
  USING (
    (seller_id)::text IN (SELECT ml_user_id FROM public.ml_accounts WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    (seller_id)::text IN (SELECT ml_user_id FROM public.ml_accounts WHERE user_id = auth.uid() AND is_active = true)
  );

-- 5. service-write tables: restrict ALL policies to service_role only
DO $$
DECLARE
  t text;
  pol text;
  tables text[] := ARRAY[
    'listing_health_logs','listing_health_recommendations','listing_health_alerts',
    'listing_media_analysis','listing_health_rules','listing_events',
    'listing_radiography','listing_snapshots','listing_seo_analysis',
    'seo_analysis_logs','title_suggestion_logs','market_keywords_cache',
    'ml_top_listings_cache','ml_autocomplete_cache','seller_category_metrics',
    'sandbox_company_snapshot','category_tree_cache','promotion_sync_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd='ALL'
        AND (qual='true' OR qual IS NULL)
        AND (with_check='true' OR with_check IS NULL)
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO public USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
        pol, t
      );
    END LOOP;
  END LOOP;
END $$;

-- 6. email_logs & system_audit_log: restrict insert to service_role
DROP POLICY IF EXISTS "service_insert_email_logs" ON public.email_logs;
CREATE POLICY "service_insert_email_logs"
  ON public.email_logs FOR INSERT TO public
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service can insert audit logs" ON public.system_audit_log;
CREATE POLICY "Service can insert audit logs"
  ON public.system_audit_log FOR INSERT TO public
  WITH CHECK (auth.role() = 'service_role');

-- 7. meli_listing_fee_cache: restrict writes to service_role
DROP POLICY IF EXISTS "Users can insert fee cache" ON public.meli_listing_fee_cache;
DROP POLICY IF EXISTS "Users can update fee cache" ON public.meli_listing_fee_cache;
CREATE POLICY "Service writes fee cache insert"
  ON public.meli_listing_fee_cache FOR INSERT TO public
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service writes fee cache update"
  ON public.meli_listing_fee_cache FOR UPDATE TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
