CREATE TABLE public.ml_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ml_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  nickname TEXT,
  email TEXT,
  country_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, ml_user_id)
);

ALTER TABLE public.ml_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.analyzed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ml_account_id UUID REFERENCES public.ml_accounts(id) ON DELETE SET NULL,
  item_id TEXT NOT NULL,
  title TEXT,
  category_id TEXT,
  price NUMERIC(15, 2),
  available_quantity INTEGER,
  sold_quantity INTEGER,
  status TEXT,
  permalink TEXT,
  thumbnail TEXT,
  raw_data JSONB,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.analyzed_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.item_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyzed_item_id UUID NOT NULL REFERENCES public.analyzed_items(id) ON DELETE CASCADE,
  visits_total INTEGER,
  visits_7d INTEGER,
  visits_30d INTEGER,
  sold_quantity_7d INTEGER,
  sold_quantity_30d INTEGER,
  conversion_rate NUMERIC(5, 2),
  photo_count INTEGER,
  has_video BOOLEAN DEFAULT FALSE,
  has_clips BOOLEAN DEFAULT FALSE,
  title_length INTEGER,
  description_length INTEGER,
  listing_type TEXT,
  shipping_type TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.item_metrics ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.keywords_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyzed_item_id UUID NOT NULL REFERENCES public.analyzed_items(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  search_position INTEGER,
  search_page INTEGER,
  in_ads BOOLEAN DEFAULT FALSE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(analyzed_item_id, keyword, checked_at)
);

ALTER TABLE public.keywords_tracking ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ml_accounts_user_id ON public.ml_accounts(user_id);
CREATE INDEX idx_analyzed_items_user_id ON public.analyzed_items(user_id);
CREATE INDEX idx_analyzed_items_item_id ON public.analyzed_items(item_id)