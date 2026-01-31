// Hook ISOLADO para captura de item de origem (Anti-Catálogo v3)
// NÃO depende de nenhum outro hook ou serviço de clonagem existente

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  SourceSnapshot, 
  EditablePayload,
  filterSafeAttributes,
  extractPackageDimensions,
  SnapshotAttribute,
  SnapshotPicture
} from '../types';

interface CaptureResult {
  success: boolean;
  snapshot?: SourceSnapshot;
  initialPayload?: EditablePayload;
  error?: string;
}

interface UseAntiCatalogCaptureReturn {
  capture: (input: string, mlAccountId: string) => Promise<CaptureResult>;
  isCapturing: boolean;
  error: string | null;
}

/**
 * Extrai o ID do item do ML a partir de URL ou ID direto
 */
function extractItemId(input: string): string | null {
  if (!input) return null;
  
  const trimmed = input.trim();
  
  // Se já é um MLB ID direto
  if (/^MLB\d+$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  
  // Tentar extrair de URL
  const patterns = [
    // Padrão com item_id no path: /MLB-123456789
    /MLB[-]?(\d+)/i,
    // Padrão com query param: ?item_id=MLB123456789
    /item_id[=:]MLB(\d+)/i,
    // Padrão pdp_filters
    /pdp_filters[=:]item_id:MLB(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const numericId = match[1] || match[0].replace(/[^0-9]/g, '');
      return `MLB${numericId}`;
    }
  }
  
  return null;
}

export function useAntiCatalogCapture(): UseAntiCatalogCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async (input: string, mlAccountId: string): Promise<CaptureResult> => {
    setIsCapturing(true);
    setError(null);

    try {
      const itemId = extractItemId(input);
      if (!itemId) {
        throw new Error('ID de anúncio inválido. Use o formato MLB123456789 ou cole a URL completa.');
      }

      // Buscar dados do item via edge function existente (ad-item-snapshot)
      const { data: snapshotData, error: snapshotError } = await supabase.functions.invoke(
        'ad-item-snapshot',
        {
          body: {
            item_id: itemId,
            ml_account_id: mlAccountId,
            include_description: true,
            include_attributes: true,
          }
        }
      );

      if (snapshotError) {
        throw new Error(`Erro ao buscar item: ${snapshotError.message}`);
      }

      if (!snapshotData?.success || !snapshotData?.item) {
        throw new Error(snapshotData?.error || 'Item não encontrado');
      }

      const item = snapshotData.item;
      
      // Mapear fotos
      const pictures: SnapshotPicture[] = (item.pictures || []).map((p: any) => ({
        id: p.id,
        url: p.url || p.secure_url,
        secure_url: p.secure_url || p.url,
      })).filter((p: SnapshotPicture) => p.secure_url);

      // Mapear todos os atributos
      const allAttributes: SnapshotAttribute[] = (item.attributes || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        value_id: a.value_id,
        value_name: a.value_name,
        value_struct: a.value_struct,
      }));

      // Filtrar atributos seguros
      const safeAttributes = filterSafeAttributes(allAttributes);

      // Extrair dimensões
      const packageDimensions = extractPackageDimensions(allAttributes);

      // Montar snapshot
      const snapshot: SourceSnapshot = {
        item_id: itemId,
        title: item.title || '',
        description: snapshotData.description || item.description || '',
        price: item.price || 0,
        currency_id: item.currency_id || 'BRL',
        available_quantity: item.available_quantity || 1,
        condition: item.condition === 'used' ? 'used' : 'new',
        category_id: item.category_id || '',
        category_name: snapshotData.category_name,
        listing_type_id: item.listing_type_id || 'gold_special',
        pictures,
        all_attributes: allAttributes,
        safe_attributes: safeAttributes,
        package_dimensions: packageDimensions,
        captured_at: new Date().toISOString(),
        seller_id: item.seller_id?.toString() || '',
      };

      // Montar payload inicial editável
      const initialPayload: EditablePayload = {
        title: snapshot.title,
        description: snapshot.description,
        price: snapshot.price,
        available_quantity: snapshot.available_quantity,
        condition: snapshot.condition,
        pictures: [...pictures],
        attributes: [...safeAttributes],
        package_height: packageDimensions?.height || 0,
        package_width: packageDimensions?.width || 0,
        package_length: packageDimensions?.length || 0,
        package_weight: packageDimensions?.weight || 0,
        listing_type_id: snapshot.listing_type_id === 'gold_pro' ? 'gold_pro' : 'gold_special',
      };

      return {
        success: true,
        snapshot,
        initialPayload,
      };
    } catch (err: any) {
      const errorMessage = err?.message || 'Erro desconhecido ao capturar item';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsCapturing(false);
    }
  }, []);

  return {
    capture,
    isCapturing,
    error,
  };
}
