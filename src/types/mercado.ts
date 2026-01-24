// Types for Mercado Analytics Module (separate from Tendências)

// Basic category info for grid display
export interface MercadoCategoryItem {
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

// Detailed breakdown for a category
export interface MercadoCategoryDetails {
  category_id: string;
  kpis: {
    total_listings: number;
    created_24h: number;
    avg_price: number;
    median_price: number;
  };
  conditions: { label: string; count: number; percent: number }[];
  sale_formats: { label: string; count: number; percent: number }[];
  listing_types: { label: string; count: number; percent: number }[];
  shipping_modes: { label: string; count: number; percent: number }[];
  flags: {
    with_video: number;
    with_offer: number;
    with_free_shipping: number;
    with_discount: number;
  };
  price_ranges: { range: string; min: number; max: number; count: number; percent: number }[];
  official_stores: { id: string; name: string; listings_count: number }[];
  locations: { state: string; count: number; percent: number }[];
  cached_at: string;
  ttl_seconds: number;
}

// Metrics (top sellers and keywords)
export interface MercadoCategoryMetrics {
  category_id: string;
  top_sellers: {
    id: string;
    item_id: string;
    title: string;
    thumbnail: string;
    price: number;
    sold_quantity: number;
    is_catalog: boolean;
    is_full: boolean;
    rank: number;
  }[];
  top_keywords: {
    keyword: string;
    volume: number;
    trend: 'up' | 'down' | 'stable';
    rank: number;
  }[];
  cached_at: string;
  ttl_seconds: number;
}

// Comparison data structure
export interface MercadoComparisonData {
  categories: {
    id: string;
    name: string;
    share_percent: number;
    total_count: number;
    delta_24h?: number;
    top_keywords: MercadoCategoryMetrics['top_keywords'];
    price_ranges: MercadoCategoryDetails['price_ranges'];
  }[];
}

// Cache entry
export interface MercadoCacheEntry<T> {
  data: T;
  cached_at: number;
  ttl_ms: number;
}

// Telemetry event
export interface MercadoTelemetryEvent {
  event_type: string;
  category_id?: string;
  data_type?: 'details' | 'metrics' | 'grid';
  cache_source?: 'memory' | 'db' | 'network';
  duration_ms: number;
  timestamp: string;
}

// Drawer types
export type MercadoDrawerType = 'details' | 'metrics' | null;
