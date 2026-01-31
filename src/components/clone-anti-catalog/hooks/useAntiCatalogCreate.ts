// Hook ISOLADO para criação de anúncio (Anti-Catálogo v3)
// NÃO depende de nenhum outro hook ou serviço de clonagem existente

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  EditablePayload, 
  SourceSnapshot,
  CreateListingResult,
} from '../types';

interface UseAntiCatalogCreateReturn {
  create: (
    payload: EditablePayload, 
    snapshot: SourceSnapshot, 
    mlAccountId: string
  ) => Promise<CreateListingResult>;
  isCreating: boolean;
  error: string | null;
}

export function useAntiCatalogCreate(): UseAntiCatalogCreateReturn {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (
    payload: EditablePayload, 
    snapshot: SourceSnapshot, 
    mlAccountId: string
  ): Promise<CreateListingResult> => {
    setIsCreating(true);
    setError(null);

    try {
      // Chamar a edge function isolada para criação
      const { data, error: invokeError } = await supabase.functions.invoke(
        'clone-anti-catalog-execute',
        {
          body: {
            ml_account_id: mlAccountId,
            source_item_id: snapshot.item_id,
            category_id: snapshot.category_id,
            currency_id: snapshot.currency_id,
            payload: {
              title: payload.title,
              description: payload.description,
              price: payload.price,
              available_quantity: payload.available_quantity,
              condition: payload.condition,
              pictures: payload.pictures.map(p => ({ source: p.secure_url })),
              attributes: payload.attributes,
              listing_type_id: payload.listing_type_id,
              package_height: payload.package_height,
              package_width: payload.package_width,
              package_length: payload.package_length,
              package_weight: payload.package_weight,
            },
          },
        }
      );

      if (invokeError) {
        throw new Error(`Erro ao criar anúncio: ${invokeError.message}`);
      }

      if (!data?.success) {
        setError(data?.error || 'Erro desconhecido');
        return {
          success: false,
          error: data?.error || 'Erro ao criar anúncio',
          error_code: data?.error_code,
          api_status: data?.api_status,
          retry_info: data?.retry_info,
          diagnostic: data?.diagnostic,
        };
      }

      return {
        success: true,
        item_id: data.item_id,
        permalink: data.permalink,
        retry_info: data.retry_info,
        diagnostic: data.diagnostic,
      };
    } catch (err: any) {
      const errorMessage = err?.message || 'Erro desconhecido ao criar anúncio';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setIsCreating(false);
    }
  }, []);

  return {
    create,
    isCreating,
    error,
  };
}
