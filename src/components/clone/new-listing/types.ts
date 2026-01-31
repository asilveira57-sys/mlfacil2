// Tipos para o fluxo "Clonar como anúncio novo"

export interface CloneDraft {
  id: string;
  user_id: string;
  workspace_id: string;
  ml_account_id?: string;
  source_url?: string;
  source_item_id: string;
  captured_at: string;
  raw_snapshot: RawSnapshot;
  draft_payload: DraftPayload;
  status: DraftStatus;
  created_item_id?: string;
  error_message?: string;
  error_details?: Record<string, unknown>;
  validation_logs: ValidationLog[];
  created_at: string;
  updated_at: string;
}

export type DraftStatus = 'DRAFT' | 'READY' | 'CREATING' | 'CREATED' | 'FAILED';

export interface RawSnapshot {
  item_id: string;
  title: string;
  description?: string;
  price: number;
  available_quantity: number;
  condition: string;
  category_id: string;
  listing_type_id: string;
  pictures: Picture[];
  attributes: Attribute[];
  seller_id: string;
  thumbnail?: string;
  variations?: Variation[];
  shipping?: Record<string, unknown>;
  is_catalog_source: boolean;
  catalog_product_id?: string;
  
  // Captura detalhada
  capture_log?: CaptureLog;
  
  // GTIN/EAN/SKU capturados (para controle do usuário)
  captured_gtin?: string;
  captured_ean?: string;
  captured_sku?: string;
}

export interface CaptureLog {
  pictures_count: number;
  pictures_source: 'api_full' | 'api_thumbnail_fallback' | 'none';
  description_captured: boolean;
  description_source?: 'api_public' | 'api_authenticated' | 'none';
  dimensions_captured: boolean;
  dimensions_source?: 'attributes' | 'none';
  attributes_count: number;
  gtin_found: boolean;
  ean_found: boolean;
  sku_found: boolean;
  errors?: string[];
}

export interface DraftPayload {
  // Conteúdo
  title: string;
  description: string;
  price: number;
  available_quantity: number;
  condition: string;
  
  // Fotos
  pictures: Picture[];
  
  // Logística
  seller_package_height: number;
  seller_package_width: number;
  seller_package_length: number;
  seller_package_weight: number;
  
  // Atributos (filtrando catalogáveis por default)
  attributes: Attribute[];
  
  // Publicação
  listing_type_id: 'gold_special' | 'gold_pro';
  initial_status: 'active' | 'paused';
  
  // Categoria (herdada)
  category_id: string;
  
  // Controle de GTIN/EAN/SKU (toggles do usuário)
  include_gtin?: boolean; // Default: false
  include_sku?: boolean;  // Default: false
  
  // Valores capturados (exibição)
  captured_gtin?: string;
  captured_sku?: string;
}

export interface Picture {
  id?: string;
  url?: string;
  secure_url?: string;
}

export interface Attribute {
  id: string;
  name?: string;
  value_id?: string;
  value_name?: string;
  value_struct?: {
    number?: number;
    unit?: string;
  };
}

export interface Variation {
  id: string;
  attribute_combinations: Attribute[];
  available_quantity: number;
  price: number;
  picture_ids: string[];
}

export interface ValidationLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  field?: string;
}

export type TabStep = 'reference' | 'content' | 'logistics' | 'publish';

// Lista de atributos que forçam vínculo com catálogo - NUNCA enviar por default
export const CATALOG_FORCING_ATTRIBUTES = new Set([
  'GTIN',
  'EAN',
  'UPC',
  'ISBN',
  'MPN',
  'PART_NUMBER',
  'ALPHANUMERIC_MODEL',
  'MANUFACTURER_CODE',
  'SKU',
]);

// Atributos de identificação que podem ser controlados pelo usuário
export const USER_CONTROLLABLE_IDENTIFIERS = new Set([
  'GTIN',
  'EAN',
  'SELLER_SKU',
  'SKU',
]);
