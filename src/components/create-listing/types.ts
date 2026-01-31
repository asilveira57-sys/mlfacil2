// Tipos para o fluxo "Clonar como anúncio novo" (v2 - anti-catálogo)
// Este módulo é COMPLETAMENTE ISOLADO do fluxo de clonagem existente

export interface CreateListingDraft {
  id: string;
  user_id: string;
  workspace_id: string;
  ml_account_id?: string;
  source_url?: string;
  source_item_id: string;
  reference_snapshot: ReferenceSnapshot;
  final_payload: FinalListingPayload;
  status: CreateListingStatus;
  created_item_id?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export type CreateListingStatus = 
  | 'CAPTURING'   // Capturando dados da referência
  | 'DRAFT'       // Rascunho editável
  | 'VALIDATING'  // Validando antes de criar
  | 'CREATING'    // Criando na API do ML
  | 'CREATED'     // Sucesso
  | 'FAILED';     // Erro

// Snapshot do anúncio de referência (dados capturados)
export interface ReferenceSnapshot {
  item_id: string;
  title: string;
  description: string;
  price: number;
  available_quantity: number;
  condition: string;
  category_id: string;
  category_name?: string;
  listing_type_id: string;
  
  // Fotos - TODAS as fotos do anúncio, nunca só thumbnail
  pictures: ReferencePicture[];
  
  // Atributos da categoria
  attributes: ReferenceAttribute[];
  
  // Informações do vendedor original
  seller_id: string;
  is_own_listing: boolean;
  
  // Metadados de captura
  capture_metadata: CaptureMetadata;
  
  // Identificadores (para controle do usuário)
  identifiers: CapturedIdentifiers;
  
  // Dimensões do pacote
  package_dimensions?: PackageDimensions;
}

export interface ReferencePicture {
  id: string;
  url: string;
  secure_url: string;
  size?: string;
  max_size?: string;
}

export interface ReferenceAttribute {
  id: string;
  name?: string;
  value_id?: string;
  value_name?: string;
  value_struct?: {
    number?: number;
    unit?: string;
  };
}

export interface CaptureMetadata {
  captured_at: string;
  
  // Detalhes de cada captura
  pictures_status: 'success' | 'partial' | 'failed';
  pictures_count: number;
  pictures_source: 'api_full' | 'thumbnail_fallback' | 'none';
  
  description_status: 'success' | 'failed';
  description_source: 'api_public' | 'api_authenticated' | 'none';
  
  dimensions_status: 'success' | 'not_found';
  dimensions_source: 'attributes' | 'none';
  
  attributes_count: number;
  
  // Erros ocorridos durante captura
  errors: string[];
  warnings: string[];
}

export interface CapturedIdentifiers {
  gtin?: string;
  ean?: string;
  upc?: string;
  isbn?: string;
  mpn?: string;
  sku?: string;
  manufacturer_code?: string;
}

export interface PackageDimensions {
  height: number;  // cm
  width: number;   // cm
  length: number;  // cm
  weight: number;  // gramas
}

// Payload final para criação do anúncio
export interface FinalListingPayload {
  // Conteúdo editável
  title: string;
  description: string;
  price: number;
  available_quantity: number;
  condition: 'new' | 'used';
  
  // Fotos selecionadas
  pictures: ReferencePicture[];
  
  // Dimensões (obrigatórias)
  package_height: number;
  package_width: number;
  package_length: number;
  package_weight: number;
  
  // Atributos (filtrados - sem identificadores de catálogo)
  attributes: ReferenceAttribute[];
  
  // Tipo e status
  listing_type_id: 'gold_special' | 'gold_pro';
  initial_status: 'active' | 'paused';
  
  // Categoria (herdada)
  category_id: string;
  
  // NOVAS FLAGS: Controle de identificadores pelo usuário
  include_gtin: boolean;  // Se true, envia GTIN/EAN/UPC/ISBN
  include_sku: boolean;   // Se true, envia SKU/SELLER_SKU
}

// Configuração de validação
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

// Tab steps
export type CreateListingStep = 
  | 'reference'   // Informar URL/ID
  | 'content'     // Editar título, descrição, fotos
  | 'logistics'   // Dimensões
  | 'identifiers' // Aviso anti-catálogo
  | 'publish';    // Confirmação e criação

// Lista de atributos que NUNCA devem ser copiados por padrão (forçam catálogo)
export const CATALOG_BLOCKING_IDENTIFIERS = new Set([
  'GTIN',
  'EAN',
  'UPC',
  'ISBN',
  'MPN',
  'PART_NUMBER',
  'ALPHANUMERIC_MODEL',
  'MANUFACTURER_CODE',
  'SKU',
  'SELLER_SKU',
]);

// Identificadores de GTIN (forçam catálogo com alta probabilidade)
export const GTIN_IDENTIFIERS = new Set([
  'GTIN',
  'EAN',
  'UPC',
  'ISBN',
]);

// Identificadores de SKU (podem forçar catálogo dependendo da categoria)
export const SKU_IDENTIFIERS = new Set([
  'SKU',
  'SELLER_SKU',
]);

// Atributos de PACKAGE duplicados (conflitam com SELLER_PACKAGE_*)
export const DUPLICATE_PACKAGE_ATTRS = new Set([
  'PACKAGE_HEIGHT',
  'PACKAGE_WIDTH',
  'PACKAGE_LENGTH',
  'PACKAGE_WEIGHT',
]);

// Validar se um atributo é seguro para copiar
export function isAttributeSafeForNormalListing(attrId: string): boolean {
  return !CATALOG_BLOCKING_IDENTIFIERS.has(attrId?.toUpperCase());
}

// Filtrar apenas atributos seguros
export function filterSafeAttributes(attributes: ReferenceAttribute[]): ReferenceAttribute[] {
  if (!attributes || !Array.isArray(attributes)) return [];
  return attributes.filter(attr => isAttributeSafeForNormalListing(attr.id));
}

// Filtrar atributos com controle granular (para o usuário decidir GTIN/SKU)
export function filterAttributesWithControl(
  attributes: ReferenceAttribute[],
  options: { includeGtin: boolean; includeSku: boolean }
): {
  filtered: ReferenceAttribute[];
  removed: string[];
} {
  if (!attributes || !Array.isArray(attributes)) {
    return { filtered: [], removed: [] };
  }
  
  const removed: string[] = [];
  
  const filtered = attributes.filter(attr => {
    const attrIdUpper = attr.id?.toUpperCase() || '';
    
    // Sempre remover PACKAGE_* duplicados
    if (DUPLICATE_PACKAGE_ATTRS.has(attrIdUpper)) {
      removed.push(attr.id);
      return false;
    }
    
    // Sempre remover identificadores perigosos (MPN, PART_NUMBER, etc.)
    if (['MPN', 'PART_NUMBER', 'ALPHANUMERIC_MODEL', 'MANUFACTURER_CODE'].includes(attrIdUpper)) {
      removed.push(attr.id);
      return false;
    }
    
    // Controle de GTIN
    if (GTIN_IDENTIFIERS.has(attrIdUpper)) {
      if (!options.includeGtin) {
        removed.push(attr.id);
        return false;
      }
    }
    
    // Controle de SKU
    if (SKU_IDENTIFIERS.has(attrIdUpper)) {
      if (!options.includeSku) {
        removed.push(attr.id);
        return false;
      }
    }
    
    return true;
  });
  
  return { filtered, removed };
}

// Remover ITEM_CONDITION duplicado (já existe "condition" no body)
export function removeDuplicateCondition(attributes: ReferenceAttribute[]): ReferenceAttribute[] {
  return attributes.filter(attr => attr.id?.toUpperCase() !== 'ITEM_CONDITION');
}
