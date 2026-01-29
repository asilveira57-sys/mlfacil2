-- Create competitor_tracked_listings table
CREATE TABLE IF NOT EXISTS public.competitor_tracked_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  competitor_item_id TEXT NOT NULL,
  marketplace TEXT NOT NULL DEFAULT 'mercadolivre',
  competitor_name TEXT NOT NULL,
  competitor_link TEXT NOT NULL,
  title TEXT,
  thumbnail TEXT,
  current_price NUMERIC,
  original_price NUMERIC,
  listing_type TEXT,
  condition TEXT,
  shipping_free BOOLEAN DEFAULT false,
  shipping_full BOOLEAN DEFAULT false,
  is_available BOOLEAN DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',
  min_price NUMERIC,
  max_price NUMERIC,
  reaction_type TEXT NOT NULL DEFAULT 'monitor',
  adjustment_value NUMERIC DEFAULT 0.10,
  my_item_id TEXT,
  last_check_at TIMESTAMPTZ,
  last_price_change_at TIMESTAMPTZ,
  check_count INTEGER DEFAULT 0,
  price_change_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tracked_listing UNIQUE (user_id, seller_id, competitor_item_id)
);

-- Create competitor_price_history table
CREATE TABLE IF NOT EXISTS public.competitor_price_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracked_listing_id UUID NOT NULL REFERENCES public.competitor_tracked_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  price NUMERIC NOT NULL,
  original_price NUMERIC,
  price_delta NUMERIC,
  price_delta_percent NUMERIC,
  is_available BOOLEAN DEFAULT true,
  listing_type TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create competitor_tracking_alerts table
CREATE TABLE IF NOT EXISTS public.competitor_tracking_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  seller_id TEXT NOT NULL,
  tracked_listing_id UUID REFERENCES public.competitor_tracked_listings(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message_pt TEXT NOT NULL,
  data_json JSONB,
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.competitor_tracked_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_tracking_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for competitor_tracked_listings
CREATE POLICY "Users can view their own tracked listings"
  ON public.competitor_tracked_listings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tracked listings"
  ON public.competitor_tracked_listings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tracked listings"
  ON public.competitor_tracked_listings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tracked listings"
  ON public.competitor_tracked_listings FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for competitor_price_history
CREATE POLICY "Users can view their own price history"
  ON public.competitor_price_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own price history"
  ON public.competitor_price_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS policies for competitor_tracking_alerts
CREATE POLICY "Users can view their own tracking alerts"
  ON public.competitor_tracking_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tracking alerts"
  ON public.competitor_tracking_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tracking alerts"
  ON public.competitor_tracking_alerts FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_competitor_tracked_seller ON public.competitor_tracked_listings(user_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_competitor_price_history_listing ON public.competitor_price_history(tracked_listing_id);
CREATE INDEX IF NOT EXISTS idx_competitor_tracking_alerts_user ON public.competitor_tracking_alerts(user_id, seller_id, is_dismissed);

-- Trigger for updated_at
CREATE TRIGGER update_competitor_tracked_listings_updated_at
  BEFORE UPDATE ON public.competitor_tracked_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();