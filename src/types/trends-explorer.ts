// Types for the Trends Explorer module

export interface CategoryListItem {
  id: string;
  name: string;
  share_percent: number;
  total_count: number;
  parent_id: string | null;
  has_children: boolean;
  delta_24h?: number;
  is_favorite: boolean;
  path: string[];
}

export interface CategoryKPIs {
  total_listings: number;
  created_24h: number;
  avg_price: number;
  median_price: number;
}

export interface BreakdownItem {
  label: string;
  count: number;
  percent: number;
}

export interface PriceRange {
  range: string;
  min: number;
  max: number;
  count: number;
  percent: number;
}

export interface OfficialStore {
  id: string;
  name: string;
  listings_count: number;
}

export interface LocationItem {
  state: string;
  city?: string;
  count: number;
  percent: number;
}

export interface CategoryDetails {
  category_id: string;
  kpis: CategoryKPIs;
  conditions: BreakdownItem[];
  sale_formats: BreakdownItem[];
  listing_types: BreakdownItem[];
  shipping_modes: BreakdownItem[];
  flags: {
    with_video: number;
    with_offer: number;
    with_free_shipping: number;
    with_discount: number;
  };
  price_ranges: PriceRange[];
  official_stores: OfficialStore[];
  locations: LocationItem[];
  cached_at: string;
  ttl_seconds: number;
}

export interface TopSellerItem {
  id: string;
  item_id: string;
  title: string;
  thumbnail: string;
  price: number;
  sold_quantity: number;
  is_catalog: boolean;
  is_full: boolean;
  rank: number;
}

export interface KeywordItem {
  keyword: string;
  volume: number;
  trend: 'up' | 'down' | 'stable';
  rank: number;
}

export interface CategoryMetrics {
  category_id: string;
  top_sellers: TopSellerItem[];
  top_keywords: KeywordItem[];
  cached_at: string;
  ttl_seconds: number;
}

export interface ComparisonData {
  categories: {
    id: string;
    name: string;
    share_percent: number;
    total_count: number;
    delta_24h?: number;
    top_keywords: KeywordItem[];
    price_ranges: PriceRange[];
  }[];
}

export interface TelemetryEvent {
  event_type: 'drawer_open' | 'kpis_loaded' | 'lists_loaded' | 'cache_hit' | 'cache_miss' | 'prefetch_start' | 'prefetch_complete';
  category_id: string;
  data_type: 'details' | 'metrics';
  duration_ms: number;
  cache_layer?: 'memory' | 'db' | 'network';
  timestamp: string;
}

export type DrawerType = 'details' | 'metrics' | null;

export interface CacheEntry<T> {
  data: T;
  cached_at: number;
  ttl_ms: number;
}
