
-- 1) get_sales_metrics: add auth + ownership check
CREATE OR REPLACE FUNCTION public.get_sales_metrics(p_seller_id text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date;
  v_7d_ago date := v_today - INTERVAL '7 days';
  v_30d_ago date := v_today - INTERVAL '30 days';
  v_date_from date := COALESCE(p_date_from, v_30d_ago);
  v_date_to date := COALESCE(p_date_to, v_today);
  v_period_days integer := v_date_to - v_date_from + 1;
  v_prev_date_from date := v_date_from - v_period_days;
  v_prev_date_to date := v_date_from - 1;
  v_12_months_ago date := v_today - INTERVAL '12 months';
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ml_accounts
    WHERE ml_user_id = p_seller_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to seller_id %', p_seller_id;
  END IF;

  WITH
  metrics AS (
    SELECT
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today THEN 1 ELSE 0 END), 0) as orders_today,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today THEN total_amount ELSE 0 END), 0) as revenue_today,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today - 1 THEN 1 ELSE 0 END), 0) as orders_yesterday,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date = v_today - 1 THEN total_amount ELSE 0 END), 0) as revenue_yesterday,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_7d_ago THEN 1 ELSE 0 END), 0) as orders_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_7d_ago THEN total_amount ELSE 0 END), 0) as revenue_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_7d_ago - 7 AND v_7d_ago - 1 THEN 1 ELSE 0 END), 0) as orders_prev_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_7d_ago - 7 AND v_7d_ago - 1 THEN total_amount ELSE 0 END), 0) as revenue_prev_7d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_30d_ago THEN 1 ELSE 0 END), 0) as orders_30d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_30d_ago THEN total_amount ELSE 0 END), 0) as revenue_30d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_30d_ago - 30 AND v_30d_ago - 1 THEN 1 ELSE 0 END), 0) as orders_prev_30d,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_30d_ago - 30 AND v_30d_ago - 1 THEN total_amount ELSE 0 END), 0) as revenue_prev_30d,
      COUNT(*) as orders_total,
      COALESCE(SUM(total_amount), 0) as revenue_total,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_date_from AND v_date_to THEN 1 ELSE 0 END), 0) as orders_period,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_date_from AND v_date_to THEN total_amount ELSE 0 END), 0) as revenue_period,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_prev_date_from AND v_prev_date_to THEN 1 ELSE 0 END), 0) as orders_prev_period,
      COALESCE(SUM(CASE WHEN (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_prev_date_from AND v_prev_date_to THEN total_amount ELSE 0 END), 0) as revenue_prev_period
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id AND order_status = 'paid'
  ),
  monthly_sales AS (
    SELECT
      to_char(date_trunc('month', created_at_meli AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') as month,
      COUNT(*) as orders,
      COALESCE(SUM(total_amount), 0) as revenue
    FROM meli_orders_cache
    WHERE seller_id = p_seller_id
      AND order_status = 'paid'
      AND (created_at_meli AT TIME ZONE 'America/Sao_Paulo')::date >= v_12_months_ago
    GROUP BY 1
    ORDER BY 1
  )
  SELECT jsonb_build_object(
    'metrics', to_jsonb(m.*),
    'monthly_sales', COALESCE((SELECT jsonb_agg(to_jsonb(ms.*) ORDER BY ms.month) FROM monthly_sales ms), '[]'::jsonb)
  ) INTO v_result
  FROM metrics m;

  RETURN v_result;
END;
$function$;

-- 2) Drop & recreate get_orders_needing_cost_sync (preserve original column names)
DROP FUNCTION IF EXISTS public.get_orders_needing_cost_sync(text, integer, integer);
CREATE FUNCTION public.get_orders_needing_cost_sync(p_seller_id text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(order_id text, shipment_id text, total_amount numeric, created_at_meli timestamptz, current_fee_ml_source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ml_accounts
    WHERE ml_user_id = p_seller_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to seller_id %', p_seller_id;
  END IF;

  RETURN QUERY
  SELECT
    o.order_id,
    o.shipment_id,
    o.total_amount,
    o.created_at_meli,
    b.fee_ml_source AS current_fee_ml_source
  FROM meli_orders_cache o
  LEFT JOIN order_cost_breakdown_cache b
    ON b.seller_id = o.seller_id AND b.order_id = o.order_id
  WHERE o.seller_id = p_seller_id
    AND o.order_status = 'paid'
    AND (b.order_id IS NULL OR b.fee_ml_source = 'pending')
  ORDER BY o.created_at_meli ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- 3) count_orders_needing_cost_sync: add auth + ownership
CREATE OR REPLACE FUNCTION public.count_orders_needing_cost_sync(p_seller_id text)
 RETURNS TABLE(total_pending bigint, no_breakdown bigint, pending_billing bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ml_accounts
    WHERE ml_user_id = p_seller_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to seller_id %', p_seller_id;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) as total_pending,
    COUNT(*) FILTER (WHERE b.order_id IS NULL) as no_breakdown,
    COUNT(*) FILTER (WHERE b.fee_ml_source = 'pending') as pending_billing
  FROM meli_orders_cache o
  LEFT JOIN order_cost_breakdown_cache b
    ON b.seller_id = o.seller_id AND b.order_id = o.order_id
  WHERE o.seller_id = p_seller_id
    AND o.order_status = 'paid'
    AND (b.order_id IS NULL OR b.fee_ml_source = 'pending');
END;
$function$;

-- 4) Note-attachments storage: restrict to workspace members
DROP POLICY IF EXISTS "Members can view note attachment files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload note attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own note attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete note attachments" ON storage.objects;

CREATE POLICY "Members can view note attachment files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'note-attachments'
    AND auth.uid() IS NOT NULL
    AND public.is_workspace_member(
      auth.uid(),
      NULLIF((string_to_array(name, '/'))[1], '')::uuid
    )
  );

CREATE POLICY "Members can upload note attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'note-attachments'
    AND auth.uid() IS NOT NULL
    AND public.is_workspace_member(
      auth.uid(),
      NULLIF((string_to_array(name, '/'))[1], '')::uuid
    )
  );

CREATE POLICY "Members can update note attachments"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'note-attachments'
    AND auth.uid() IS NOT NULL
    AND public.is_workspace_member(
      auth.uid(),
      NULLIF((string_to_array(name, '/'))[1], '')::uuid
    )
  );

CREATE POLICY "Members can delete note attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'note-attachments'
    AND auth.uid() IS NOT NULL
    AND public.is_workspace_member(
      auth.uid(),
      NULLIF((string_to_array(name, '/'))[1], '')::uuid
    )
  );
