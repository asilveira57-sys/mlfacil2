// Hook para captura de dados do anúncio de referência
// COMPLETAMENTE ISOLADO do fluxo de clonagem existente

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { 
  ReferenceSnapshot, 
  CaptureMetadata, 
  CapturedIdentifiers,
  PackageDimensions,
  ReferencePicture,
  ReferenceAttribute,
} from './types';

// Padrões de extração de ID (MLB tem prioridade sobre MLBU)
const MLB_PATTERNS = [
  /item_id[=:]?(MLB\d{8,})/i,
  /pdp_filters=item_id[=:]?(MLB\d{8,})/i,
  /\/(MLB\d{8,})/i,
  /[?&]id=(MLB\d{8,})/i,
  /(?<!MLBU?)(MLB\d{8,})/i,
];

const MLBU_PATTERNS = [
  /\/up\/(MLBU\d+)/i,
  /\/p\/(MLBU\d+)/i,
  /(MLBU\d{8,})/i,
];

interface ExtractedId {
  id: string;
  type: 'MLB' | 'MLBU';
}

function extractMeliId(input: string): ExtractedId | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();
  
  // Prioridade 1: MLB (anúncio real)
  for (const pattern of MLB_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
      if (/^MLB\d+$/.test(id)) {
        return { id, type: 'MLB' };
      }
    }
  }
  
  // Fallback: ID direto MLB
  if (/^MLB\d{8,}$/i.test(trimmed)) {
    return { id: trimmed.toUpperCase(), type: 'MLB' };
  }
  
  // Prioridade 2: MLBU (catálogo - precisa resolver)
  for (const pattern of MLBU_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
      if (/^MLBU\d+$/.test(id)) {
        return { id, type: 'MLBU' };
      }
    }
  }
  
  return null;
}

// Extrair dimensões do pacote dos atributos
function extractDimensionsFromAttributes(attributes: ReferenceAttribute[]): PackageDimensions | undefined {
  if (!attributes || !Array.isArray(attributes)) return undefined;
  
  const dims: PackageDimensions = { height: 0, width: 0, length: 0, weight: 0 };
  let found = false;
  
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name ? parseFloat(attr.value_name) : attr.value_struct?.number;
    
    if (value && !isNaN(value)) {
      if (id === 'SELLER_PACKAGE_HEIGHT' || id === 'PACKAGE_HEIGHT') {
        dims.height = value;
        found = true;
      } else if (id === 'SELLER_PACKAGE_WIDTH' || id === 'PACKAGE_WIDTH') {
        dims.width = value;
        found = true;
      } else if (id === 'SELLER_PACKAGE_LENGTH' || id === 'PACKAGE_LENGTH') {
        dims.length = value;
        found = true;
      } else if (id === 'SELLER_PACKAGE_WEIGHT' || id === 'PACKAGE_WEIGHT') {
        dims.weight = value;
        found = true;
      }
    }
  }
  
  return found ? dims : undefined;
}

// Extrair identificadores dos atributos
function extractIdentifiersFromAttributes(attributes: ReferenceAttribute[]): CapturedIdentifiers {
  const identifiers: CapturedIdentifiers = {};
  
  if (!attributes || !Array.isArray(attributes)) return identifiers;
  
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name || attr.value_id;
    
    if (!value) continue;
    
    switch (id) {
      case 'GTIN':
        identifiers.gtin = value;
        break;
      case 'EAN':
        identifiers.ean = value;
        break;
      case 'UPC':
        identifiers.upc = value;
        break;
      case 'ISBN':
        identifiers.isbn = value;
        break;
      case 'MPN':
      case 'PART_NUMBER':
        identifiers.mpn = value;
        break;
      case 'SKU':
      case 'SELLER_SKU':
        identifiers.sku = value;
        break;
      case 'MANUFACTURER_CODE':
        identifiers.manufacturer_code = value;
        break;
    }
  }
  
  return identifiers;
}

// Processar array de fotos garantindo HTTPS
function processPictures(pictures: any[], thumbnail?: string): {
  processed: ReferencePicture[];
  source: 'api_full' | 'thumbnail_fallback' | 'none';
} {
  if (!pictures || !Array.isArray(pictures) || pictures.length === 0) {
    // Fallback para thumbnail
    if (thumbnail) {
      const secureUrl = thumbnail.replace(/^http:\/\//i, 'https://');
      return {
        processed: [{ id: 'thumb', url: secureUrl, secure_url: secureUrl }],
        source: 'thumbnail_fallback',
      };
    }
    return { processed: [], source: 'none' };
  }
  
  const processed: ReferencePicture[] = pictures
    .map((p: any, index: number) => {
      const secureUrl = (p.secure_url || p.url || '').replace(/^http:\/\//i, 'https://');
      return {
        id: p.id || `pic_${index}`,
        url: secureUrl,
        secure_url: secureUrl,
        size: p.size,
        max_size: p.max_size,
      };
    })
    .filter(p => p.url && p.url.length > 0);
  
  return { processed, source: processed.length > 0 ? 'api_full' : 'none' };
}

export interface CaptureResult {
  success: boolean;
  snapshot?: ReferenceSnapshot;
  error?: string;
  userGuidance?: string;
}

export function useCreateListingCapture() {
  const { activeAccount } = useActiveAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Capturar dados completos do anúncio de referência
  const captureReference = useCallback(async (urlOrId: string): Promise<CaptureResult> => {
    const extracted = extractMeliId(urlOrId);
    
    if (!extracted) {
      const errorMsg = 'Não foi possível identificar o ID do anúncio. Cole um link ou ID válido (MLB...).';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
    
    if (!activeAccount?.sellerId) {
      const errorMsg = 'Selecione uma conta do Mercado Livre antes de continuar.';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Chamar Edge Function dedicada para captura
      const { data, error: fetchError } = await supabase.functions.invoke('create-listing-capture', {
        body: { 
          item_id: extracted.id, 
          id_type: extracted.type,
          seller_id: activeAccount.sellerId,
        },
      });
      
      if (fetchError) {
        throw new Error(fetchError.message || 'Erro de conexão');
      }
      
      if (!data?.success) {
        return {
          success: false,
          error: data?.error || 'Erro ao capturar dados',
          userGuidance: data?.user_guidance,
        };
      }
      
      const item = data.item;
      const captureLog = data.capture_log;
      
      // Processar fotos
      const picturesResult = processPictures(item.pictures, item.thumbnail);
      
      // Extrair dimensões
      const dimensions = extractDimensionsFromAttributes(item.attributes || []);
      
      // Extrair identificadores
      const identifiers = extractIdentifiersFromAttributes(item.attributes || []);
      
      // Montar metadata de captura
      const metadata: CaptureMetadata = {
        captured_at: new Date().toISOString(),
        pictures_status: picturesResult.processed.length >= 2 ? 'success' : 
                         picturesResult.processed.length === 1 ? 'partial' : 'failed',
        pictures_count: picturesResult.processed.length,
        pictures_source: picturesResult.source,
        description_status: item.description ? 'success' : 'failed',
        description_source: captureLog?.description_source || 'none',
        dimensions_status: dimensions ? 'success' : 'not_found',
        dimensions_source: dimensions ? 'attributes' : 'none',
        attributes_count: item.attributes?.length || 0,
        errors: captureLog?.errors || [],
        warnings: [],
      };
      
      // Adicionar warnings
      if (picturesResult.source === 'thumbnail_fallback') {
        metadata.warnings.push('Apenas thumbnail capturado. Adicione mais fotos manualmente.');
      }
      if (!item.description) {
        metadata.warnings.push('Descrição não capturada. Preencha manualmente.');
      }
      if (!dimensions) {
        metadata.warnings.push('Dimensões não encontradas. Preencha manualmente.');
      }
      
      // Determinar se é anúncio próprio
      const isOwnListing = String(item.seller_id) === String(activeAccount.sellerId);
      
      const snapshot: ReferenceSnapshot = {
        item_id: data.resolved_item_id || item.id || extracted.id,
        title: item.title || '',
        description: item.description || '',
        price: item.price || 0,
        available_quantity: item.available_quantity || 1,
        condition: item.condition || 'new',
        category_id: item.category_id || '',
        category_name: item.category_name,
        listing_type_id: item.listing_type_id || 'gold_special',
        pictures: picturesResult.processed,
        attributes: item.attributes || [],
        seller_id: String(item.seller_id),
        is_own_listing: isOwnListing,
        capture_metadata: metadata,
        identifiers,
        package_dimensions: dimensions,
      };
      
      console.log('[CreateListingCapture] Captured successfully:', {
        item_id: snapshot.item_id,
        pictures: snapshot.pictures.length,
        description_length: snapshot.description.length,
        has_dimensions: !!dimensions,
        identifiers_found: Object.keys(identifiers).length,
      });
      
      return { success: true, snapshot };
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido ao capturar dados';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, [activeAccount?.sellerId]);
  
  // Limpar estado
  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);
  
  return {
    loading,
    error,
    setError,
    captureReference,
    reset,
  };
}
