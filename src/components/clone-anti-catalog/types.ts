// Tipos ISOLADOS para o fluxo "Clonar como Anúncio Novo (Anti-Catálogo v3)"
// Este módulo é COMPLETAMENTE INDEPENDENTE de qualquer outro fluxo de clonagem

export interface AntiCatalogDraft {
  id: string;
  user_id: string;
  workspace_id: string;
  ml_account_id: string;
  source_item_id: string;
  source_snapshot: SourceSnapshot;
  editable_payload: EditablePayload;
  status: AntiCatalogDraftStatus;
  created_item_id?: string;
  error_message?: string;
  error_details?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type AntiCatalogDraftStatus = 
  | 'CAPTURING'   // Buscando dados do item de origem
  | 'DRAFT'       // Rascunho editável pelo usuário
  | 'CREATING'    // Criando na API do ML
  | 'CREATED'     // Sucesso - anúncio criado
  | 'FAILED';     // Erro na criação

// Snapshot do item de origem (dados capturados)
export interface SourceSnapshot {
  item_id: string;
  title: string;
  description: string;
  price: number;
  currency_id: string;
  available_quantity: number;
  condition: 'new' | 'used';
  category_id: string;
  category_name?: string;
  listing_type_id: string;
  
  // Fotos do item original
  pictures: SnapshotPicture[];
  
  // Atributos originais (todos, para referência)
  all_attributes: SnapshotAttribute[];
  
  // Atributos já filtrados (seguros para envio)
  safe_attributes: SnapshotAttribute[];
  
  // Informações de logística
  package_dimensions?: PackageDimensions;
  
  // Metadados de captura
  captured_at: string;
  seller_id: string;
}

export interface SnapshotPicture {
  id: string;
  url: string;
  secure_url: string;
}

export interface SnapshotAttribute {
  id: string;
  name?: string;
  value_id?: string | null;
  value_name?: string | null;
  value_struct?: {
    number?: number;
    unit?: string;
  } | null;
}

export interface PackageDimensions {
  height: number;  // cm
  width: number;   // cm
  length: number;  // cm
  weight: number;  // gramas
}

// Payload editável pelo usuário
export interface EditablePayload {
  title: string;
  description: string;
  price: number;
  available_quantity: number;
  condition: 'new' | 'used';
  
  // Fotos selecionadas (pode reordenar/remover)
  pictures: SnapshotPicture[];
  
  // Atributos editáveis (já filtrados, seguros)
  attributes: SnapshotAttribute[];
  
  // Dimensões de envio
  package_height: number;
  package_width: number;
  package_length: number;
  package_weight: number;
  
  // Tipo de anúncio
  listing_type_id: 'gold_special' | 'gold_pro';
}

// Abas do fluxo
export type AntiCatalogStep = 
  | 'content'     // Título, descrição, preço, quantidade
  | 'photos'      // Gerenciar fotos
  | 'attributes'  // Atributos (apenas visualização/remoção)
  | 'logistics'   // Dimensões do pacote
  | 'review';     // Revisão final e criação

// ============================================
// REGRAS DE FILTRAGEM ANTI-CATÁLOGO
// ============================================

// Campos que NUNCA podem ser enviados no POST /items
export const FORBIDDEN_BODY_FIELDS = new Set([
  'catalog_listing',
  'catalog_product_id',
  'product_id',
  'parent_item_id',
  'family_name', // Só envia se API exigir via retry
]);

// Atributos que NUNCA podem ser enviados (forçam catálogo)
export const FORBIDDEN_ATTRIBUTES = new Set([
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

// Atributos que são duplicados (já existem como campos raiz)
export const DUPLICATE_ATTRIBUTES = new Set([
  'ITEM_CONDITION',
  'PACKAGE_HEIGHT',
  'PACKAGE_WIDTH',
  'PACKAGE_LENGTH',
  'PACKAGE_WEIGHT',
]);

// Atributos essenciais que devem ser preservados
export const ESSENTIAL_ATTRIBUTES = new Set([
  'BRAND',
  'MODEL',
  'PAPER_TYPE',
  'PAPER_SIZE',
  'PAPER_FORMAT',
  'FINISH',
  'GRAMMAGE',
  'SHEETS_NUMBER',
  'LINE_NAME',
  'COLOR',
  'MATERIAL',
  'SIZE',
  'UNITS_PER_PACKAGE',
]);

// ============================================
// FUNÇÕES UTILITÁRIAS DE FILTRAGEM
// ============================================

/**
 * Verifica se um atributo é seguro para envio (não força catálogo)
 */
export function isAttributeSafe(attrId: string): boolean {
  const id = attrId?.toUpperCase() || '';
  return !FORBIDDEN_ATTRIBUTES.has(id) && !DUPLICATE_ATTRIBUTES.has(id);
}

/**
 * Filtra atributos removendo os que forçam catálogo ou são duplicados
 */
export function filterSafeAttributes(attributes: SnapshotAttribute[]): SnapshotAttribute[] {
  if (!attributes || !Array.isArray(attributes)) return [];
  return attributes.filter(attr => isAttributeSafe(attr.id));
}

/**
 * Extrai dimensões de envio dos atributos (SELLER_PACKAGE_*)
 */
export function extractPackageDimensions(attributes: SnapshotAttribute[]): PackageDimensions | undefined {
  if (!attributes || !Array.isArray(attributes)) return undefined;
  
  const findValue = (attrId: string): number => {
    const attr = attributes.find(a => a.id?.toUpperCase() === attrId);
    if (attr?.value_struct?.number) return attr.value_struct.number;
    if (attr?.value_name) return parseFloat(attr.value_name) || 0;
    return 0;
  };
  
  const height = findValue('SELLER_PACKAGE_HEIGHT');
  const width = findValue('SELLER_PACKAGE_WIDTH');
  const length = findValue('SELLER_PACKAGE_LENGTH');
  const weight = findValue('SELLER_PACKAGE_WEIGHT');
  
  if (height > 0 || width > 0 || length > 0 || weight > 0) {
    return { height, width, length, weight };
  }
  
  return undefined;
}

// Resultado da criação
export interface CreateListingResult {
  success: boolean;
  item_id?: string;
  permalink?: string;
  error?: string;
  error_code?: string;
  api_status?: number;
  retry_info?: {
    attempted: boolean;
    field_added?: string;
    success_on_retry?: boolean;
  };
  diagnostic?: {
    payload_keys_sent: string[];
    attributes_ids_sent: string[];
    removed_fields: string[];
  };
}
