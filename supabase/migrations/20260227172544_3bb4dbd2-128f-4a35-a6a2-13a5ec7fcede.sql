
-- =============================================
-- FINANCE MODULE: Core Tables
-- =============================================

-- 1. Finance Accounts (MP OAuth credentials, separate from ML)
CREATE TABLE public.finance_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id),
  ml_account_id UUID REFERENCES public.ml_accounts(id),
  mp_user_id TEXT NOT NULL,
  nickname TEXT,
  email TEXT,
  access_token TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL DEFAULT '',
  token_expires_at TIMESTAMPTZ,
  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_token_refresh_at TIMESTAMPTZ,
  last_api_ok_at TIMESTAMPTZ,
  last_api_error_code TEXT,
  last_api_error_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, mp_user_id)
);

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own finance accounts"
  ON public.finance_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_finance_accounts_updated_at
  BEFORE UPDATE ON public.finance_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. MP Payments Raw (pagamentos recebidos)
CREATE TABLE public.mp_payments_raw (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  finance_account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE CASCADE,
  mp_payment_id TEXT NOT NULL,
  mp_order_id TEXT,
  status TEXT,
  status_detail TEXT,
  payment_type TEXT,
  payment_method_id TEXT,
  transaction_amount NUMERIC,
  net_received_amount NUMERIC,
  total_paid_amount NUMERIC,
  fee_amount NUMERIC,
  installments INTEGER,
  date_approved TIMESTAMPTZ,
  date_created TIMESTAMPTZ,
  money_release_date TIMESTAMPTZ,
  payer_email TEXT,
  description TEXT,
  external_reference TEXT,
  raw_json JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(finance_account_id, mp_payment_id)
);

ALTER TABLE public.mp_payments_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payments"
  ON public.mp_payments_raw FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER update_mp_payments_raw_updated_at
  BEFORE UPDATE ON public.mp_payments_raw
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_mp_payments_raw_account ON public.mp_payments_raw(finance_account_id);
CREATE INDEX idx_mp_payments_raw_status ON public.mp_payments_raw(status);
CREATE INDEX idx_mp_payments_raw_date ON public.mp_payments_raw(date_approved);

-- 3. MP Movements Raw (ledger/movimentos da conta)
CREATE TABLE public.mp_movements_raw (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  finance_account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE CASCADE,
  mp_movement_id TEXT NOT NULL,
  movement_type TEXT,
  description TEXT,
  amount NUMERIC,
  balance NUMERIC,
  date_created TIMESTAMPTZ,
  reference_id TEXT,
  payment_id TEXT,
  status TEXT,
  raw_json JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(finance_account_id, mp_movement_id)
);

ALTER TABLE public.mp_movements_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own movements"
  ON public.mp_movements_raw FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER update_mp_movements_raw_updated_at
  BEFORE UPDATE ON public.mp_movements_raw
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_mp_movements_raw_account ON public.mp_movements_raw(finance_account_id);
CREATE INDEX idx_mp_movements_raw_date ON public.mp_movements_raw(date_created);

-- 4. Finance Job Runs (log de execuções de sync)
CREATE TABLE public.finance_job_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  finance_account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  error_message TEXT,
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own job runs"
  ON public.finance_job_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER update_finance_job_runs_updated_at
  BEFORE UPDATE ON public.finance_job_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_finance_job_runs_account ON public.finance_job_runs(finance_account_id);
CREATE INDEX idx_finance_job_runs_type ON public.finance_job_runs(job_type, status);

-- 5. Finance Reconciliation Runs
CREATE TABLE public.finance_reconciliation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  finance_account_id UUID NOT NULL REFERENCES public.finance_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  period_from DATE,
  period_to DATE,
  total_items INTEGER DEFAULT 0,
  ok_count INTEGER DEFAULT 0,
  divergent_count INTEGER DEFAULT 0,
  missing_payment_count INTEGER DEFAULT 0,
  missing_order_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own reconciliation runs"
  ON public.finance_reconciliation_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE TRIGGER update_finance_reconciliation_runs_updated_at
  BEFORE UPDATE ON public.finance_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Finance Reconciliation Items
CREATE TABLE public.finance_reconciliation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.finance_reconciliation_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  order_id TEXT,
  payment_id TEXT,
  movement_id TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'pending',
  order_amount NUMERIC,
  payment_amount NUMERIC,
  movement_amount NUMERIC,
  difference NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_reconciliation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own reconciliation items"
  ON public.finance_reconciliation_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_finance_reconciliation_items_run ON public.finance_reconciliation_items(run_id);
CREATE INDEX idx_finance_reconciliation_items_status ON public.finance_reconciliation_items(reconciliation_status);
