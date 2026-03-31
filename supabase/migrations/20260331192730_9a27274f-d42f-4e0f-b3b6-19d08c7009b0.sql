
-- 1. execution_policies: default rules per routine
CREATE TABLE public.execution_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  default_cooldown_minutes integer NOT NULL DEFAULT 60,
  cooldown_high integer NOT NULL DEFAULT 30,
  cooldown_medium integer NOT NULL DEFAULT 60,
  cooldown_low integer NOT NULL DEFAULT 180,
  cooldown_zero integer NOT NULL DEFAULT 720,
  requires_active_listings boolean NOT NULL DEFAULT false,
  requires_recent_activity boolean NOT NULL DEFAULT false,
  max_runs_per_day integer NOT NULL DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_execution_policies" ON public.execution_policies FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_manage_execution_policies" ON public.execution_policies FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Seed default policies
INSERT INTO public.execution_policies (routine_key, enabled, default_cooldown_minutes, cooldown_high, cooldown_medium, cooldown_low, cooldown_zero, requires_active_listings, requires_recent_activity, max_runs_per_day) VALUES
  ('radiography_sync',    true, 60, 30, 60, 180, 720, true, false, 8),
  ('radiography_collect', true, 60, 30, 60, 180, 720, true, false, 8),
  ('radiography_analyze', true, 120, 60, 120, 360, 720, true, false, 4),
  ('qa_polling',          true, 15, 10, 15, 30, 120, false, false, 48),
  ('nightly_cron',        true, 1440, 1440, 1440, 1440, 1440, false, false, 1);

-- 2. execution_state: per-seller per-routine state
CREATE TABLE public.execution_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text,
  seller_id text NOT NULL,
  routine_key text NOT NULL,
  priority_level text NOT NULL DEFAULT 'medium',
  activity_level text NOT NULL DEFAULT 'medium',
  eligible_to_run boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_skipped_at timestamptz,
  next_eligible_run_at timestamptz,
  cooldown_minutes_applied integer NOT NULL DEFAULT 60,
  daily_run_count integer NOT NULL DEFAULT 0,
  daily_run_date date NOT NULL DEFAULT CURRENT_DATE,
  active_listings_count integer NOT NULL DEFAULT 0,
  recent_sales_7d integer NOT NULL DEFAULT 0,
  recent_questions_24h integer NOT NULL DEFAULT 0,
  consecutive_no_result integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seller_id, routine_key)
);

ALTER TABLE public.execution_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_execution_state" ON public.execution_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_manage_execution_state" ON public.execution_state FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_execution_state_routine ON public.execution_state (routine_key, next_eligible_run_at);
CREATE INDEX idx_execution_state_seller ON public.execution_state (seller_id);

-- 3. execution_logs: audit trail
CREATE TABLE public.execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_key text NOT NULL,
  seller_id text NOT NULL,
  decision text NOT NULL,
  reason text,
  priority text,
  cooldown_applied integer,
  execution_ms integer,
  items_processed integer DEFAULT 0,
  is_manual_override boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_read_execution_logs" ON public.execution_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_execution_logs_routine ON public.execution_logs (routine_key, created_at DESC);
CREATE INDEX idx_execution_logs_seller ON public.execution_logs (seller_id, created_at DESC);

-- 4. should_run_routine: central decision function (SECURITY DEFINER for edge functions)
CREATE OR REPLACE FUNCTION public.should_run_routine(
  p_seller_id text,
  p_routine_key text,
  p_is_manual boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy execution_policies%ROWTYPE;
  v_state execution_state%ROWTYPE;
  v_cooldown integer;
  v_decision text;
  v_reason text;
  v_next_eligible timestamptz;
  v_now timestamptz := now();
BEGIN
  -- Get policy
  SELECT * INTO v_policy FROM execution_policies WHERE routine_key = p_routine_key;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('decision', 'run', 'reason', 'no_policy_found', 'priority_level', 'medium', 'cooldown_applied', 0, 'next_eligible_run_at', v_now);
  END IF;

  -- Check if routine is enabled
  IF NOT v_policy.enabled THEN
    RETURN jsonb_build_object('decision', 'skip', 'reason', 'routine_disabled', 'priority_level', 'none', 'cooldown_applied', 0, 'next_eligible_run_at', null);
  END IF;

  -- Get or create state
  SELECT * INTO v_state FROM execution_state WHERE seller_id = p_seller_id AND routine_key = p_routine_key;
  
  IF NOT FOUND THEN
    INSERT INTO execution_state (seller_id, routine_key, priority_level, activity_level)
    VALUES (p_seller_id, p_routine_key, 'medium', 'medium')
    RETURNING * INTO v_state;
  END IF;

  -- Reset daily counter if new day
  IF v_state.daily_run_date < CURRENT_DATE THEN
    UPDATE execution_state SET daily_run_count = 0, daily_run_date = CURRENT_DATE 
    WHERE id = v_state.id;
    v_state.daily_run_count := 0;
  END IF;

  -- Manual override: always run but log it
  IF p_is_manual THEN
    v_cooldown := CASE v_state.priority_level
      WHEN 'high' THEN v_policy.cooldown_high
      WHEN 'medium' THEN v_policy.cooldown_medium
      WHEN 'low' THEN v_policy.cooldown_low
      WHEN 'zero' THEN v_policy.cooldown_zero
      ELSE v_policy.default_cooldown_minutes
    END;
    v_next_eligible := v_now + (v_cooldown || ' minutes')::interval;
    
    UPDATE execution_state SET
      last_run_at = v_now,
      next_eligible_run_at = v_next_eligible,
      cooldown_minutes_applied = v_cooldown,
      daily_run_count = v_state.daily_run_count + 1,
      updated_at = v_now
    WHERE id = v_state.id;
    
    RETURN jsonb_build_object('decision', 'run', 'reason', 'manual_override', 'priority_level', v_state.priority_level, 'cooldown_applied', v_cooldown, 'next_eligible_run_at', v_next_eligible);
  END IF;

  -- Check requires_active_listings
  IF v_policy.requires_active_listings AND v_state.active_listings_count = 0 THEN
    UPDATE execution_state SET last_skipped_at = v_now, eligible_to_run = false, updated_at = v_now WHERE id = v_state.id;
    RETURN jsonb_build_object('decision', 'skip', 'reason', 'no_active_listings', 'priority_level', v_state.priority_level, 'cooldown_applied', 0, 'next_eligible_run_at', null);
  END IF;

  -- Check max runs per day
  IF v_state.daily_run_count >= v_policy.max_runs_per_day THEN
    RETURN jsonb_build_object('decision', 'skip', 'reason', 'max_daily_runs_reached', 'priority_level', v_state.priority_level, 'cooldown_applied', 0, 'next_eligible_run_at', (CURRENT_DATE + interval '1 day'));
  END IF;

  -- Calculate cooldown based on priority
  v_cooldown := CASE v_state.priority_level
    WHEN 'high' THEN v_policy.cooldown_high
    WHEN 'medium' THEN v_policy.cooldown_medium
    WHEN 'low' THEN v_policy.cooldown_low
    WHEN 'zero' THEN v_policy.cooldown_zero
    ELSE v_policy.default_cooldown_minutes
  END;

  -- Apply consecutive_no_result penalty (increase cooldown by 50% per miss, max 3x)
  IF v_state.consecutive_no_result > 0 THEN
    v_cooldown := LEAST(v_cooldown * POWER(1.5, LEAST(v_state.consecutive_no_result, 4))::integer, v_cooldown * 3);
  END IF;

  -- Check cooldown
  IF v_state.next_eligible_run_at IS NOT NULL AND v_state.next_eligible_run_at > v_now THEN
    RETURN jsonb_build_object('decision', 'defer', 'reason', 'cooldown_active', 'priority_level', v_state.priority_level, 'cooldown_applied', v_cooldown, 'next_eligible_run_at', v_state.next_eligible_run_at);
  END IF;

  -- APPROVED — update state
  v_next_eligible := v_now + (v_cooldown || ' minutes')::interval;
  
  UPDATE execution_state SET
    last_run_at = v_now,
    next_eligible_run_at = v_next_eligible,
    cooldown_minutes_applied = v_cooldown,
    daily_run_count = v_state.daily_run_count + 1,
    eligible_to_run = true,
    updated_at = v_now
  WHERE id = v_state.id;

  RETURN jsonb_build_object('decision', 'run', 'reason', 'eligible', 'priority_level', v_state.priority_level, 'cooldown_applied', v_cooldown, 'next_eligible_run_at', v_next_eligible);
END;
$$;

-- 5. Helper function to update seller activity metrics
CREATE OR REPLACE FUNCTION public.update_execution_priority(
  p_seller_id text,
  p_routine_key text,
  p_active_listings integer DEFAULT 0,
  p_recent_sales_7d integer DEFAULT 0,
  p_recent_questions_24h integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_priority text;
  v_activity text;
BEGIN
  -- Auto-classify priority
  IF p_active_listings = 0 THEN
    v_priority := 'zero';
    v_activity := 'zero';
  ELSIF p_recent_sales_7d >= 20 OR p_active_listings >= 50 THEN
    v_priority := 'high';
    v_activity := 'high';
  ELSIF p_recent_sales_7d >= 5 OR p_active_listings >= 10 THEN
    v_priority := 'medium';
    v_activity := 'medium';
  ELSE
    v_priority := 'low';
    v_activity := 'low';
  END IF;

  INSERT INTO execution_state (seller_id, routine_key, priority_level, activity_level, active_listings_count, recent_sales_7d, recent_questions_24h, updated_at)
  VALUES (p_seller_id, p_routine_key, v_priority, v_activity, p_active_listings, p_recent_sales_7d, p_recent_questions_24h, now())
  ON CONFLICT (seller_id, routine_key)
  DO UPDATE SET
    priority_level = v_priority,
    activity_level = v_activity,
    active_listings_count = p_active_listings,
    recent_sales_7d = p_recent_sales_7d,
    recent_questions_24h = p_recent_questions_24h,
    updated_at = now();
END;
$$;

-- 6. Helper to log execution result and update consecutive counters
CREATE OR REPLACE FUNCTION public.log_execution_result(
  p_seller_id text,
  p_routine_key text,
  p_decision text,
  p_reason text,
  p_priority text,
  p_cooldown integer,
  p_execution_ms integer DEFAULT 0,
  p_items_processed integer DEFAULT 0,
  p_is_manual boolean DEFAULT false,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert log
  INSERT INTO execution_logs (routine_key, seller_id, decision, reason, priority, cooldown_applied, execution_ms, items_processed, is_manual_override, metadata)
  VALUES (p_routine_key, p_seller_id, p_decision, p_reason, p_priority, p_cooldown, p_execution_ms, p_items_processed, p_is_manual, p_metadata);

  -- Update consecutive_no_result counter
  IF p_decision = 'run' THEN
    IF p_items_processed > 0 THEN
      UPDATE execution_state SET consecutive_no_result = 0, last_success_at = now(), updated_at = now()
      WHERE seller_id = p_seller_id AND routine_key = p_routine_key;
    ELSE
      UPDATE execution_state SET consecutive_no_result = consecutive_no_result + 1, updated_at = now()
      WHERE seller_id = p_seller_id AND routine_key = p_routine_key;
    END IF;
  END IF;
END;
$$;
