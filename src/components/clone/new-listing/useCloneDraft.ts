import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { 
  CloneDraft, 
  RawSnapshot, 
  DraftPayload, 
  DraftStatus,
  Attribute,
  CaptureLog,
  CATALOG_FORCING_ATTRIBUTES 
} from './types';

// Padrões de extração de ID
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
  
  for (const pattern of MLB_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
      if (/^MLB\d+$/.test(id)) {
        return { id, type: 'MLB' };
      }
    }
  }
  
  if (/^MLB\d{8,}$/i.test(trimmed)) {
    return { id: trimmed.toUpperCase(), type: 'MLB' };
  }
  
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

function extractPackageDimensions(attributes: Attribute[]): {
  height: number;
  width: number;
  length: number;
  weight: number;
} {
  const result = { height: 0, width: 0, length: 0, weight: 0 };
  
  if (!attributes || !Array.isArray(attributes)) return result;
  
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name ? parseFloat(attr.value_name) : attr.value_struct?.number;
    
    if (value && !isNaN(value)) {
      if (id === 'SELLER_PACKAGE_HEIGHT' || id === 'PACKAGE_HEIGHT') {
        result.height = value;
      } else if (id === 'SELLER_PACKAGE_WIDTH' || id === 'PACKAGE_WIDTH') {
        result.width = value;
      } else if (id === 'SELLER_PACKAGE_LENGTH' || id === 'PACKAGE_LENGTH') {
        result.length = value;
      } else if (id === 'SELLER_PACKAGE_WEIGHT' || id === 'PACKAGE_WEIGHT') {
        result.weight = value;
      }
    }
  }
  
  return result;
}

function filterSafeAttributes(attributes: Attribute[]): Attribute[] {
  if (!attributes || !Array.isArray(attributes)) return [];
  
  return attributes.filter(attr => {
    const id = attr.id?.toUpperCase();
    // Remover atributos que forçam catálogo
    return !CATALOG_FORCING_ATTRIBUTES.has(id);
  });
}

function extractIdentifiers(attributes: Attribute[]): {
  gtin?: string;
  ean?: string;
  sku?: string;
} {
  const result: { gtin?: string; ean?: string; sku?: string } = {};
  
  if (!attributes || !Array.isArray(attributes)) return result;
  
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name || attr.value_id;
    
    if (!value) continue;
    
    if (id === 'GTIN') {
      result.gtin = value;
    } else if (id === 'EAN') {
      result.ean = value;
    } else if (id === 'SELLER_SKU' || id === 'SKU') {
      result.sku = value;
    }
  }
  
  return result;
}

export function useCloneDraft() {
  const { activeAccount } = useActiveAccount();
  const [draft, setDraft] = useState<CloneDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Buscar dados do anúncio de referência
  const fetchReference = useCallback(async (url: string): Promise<RawSnapshot | null> => {
    const extracted = extractMeliId(url);
    if (!extracted) {
      setError('Não foi possível identificar o ID do anúncio. Cole um link ou ID válido (MLB...)');
      return null;
    }
    
    if (!activeAccount?.sellerId) {
      setError('Selecione uma conta do Mercado Livre');
      return null;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase.functions.invoke('ad-item-snapshot', {
        body: { 
          item_id: extracted.id, 
          id_type: extracted.type,
          seller_id: activeAccount.sellerId,
        },
      });
      
      if (fetchError || !data?.success) {
        throw new Error(data?.message || fetchError?.message || 'Erro ao buscar dados do anúncio');
      }
      
      const item = data.item;
      const captureLog: CaptureLog = data.capture_log || {
        pictures_count: 0,
        pictures_source: 'none',
        description_captured: false,
        dimensions_captured: false,
        attributes_count: 0,
        gtin_found: false,
        ean_found: false,
        sku_found: false,
        errors: [],
      };
      
      // CORREÇÃO 1: Usar fotos completas já processadas pela edge function
      const finalPictures = item.pictures || [];
      
      console.log(`[useCloneDraft] Capture log:`, captureLog);
      console.log(`[useCloneDraft] Pictures: ${finalPictures.length}, Description: ${!!item.description}, Dimensions: ${captureLog.dimensions_captured}`);
      
      // Extrair dimensões dos atributos
      const dimensions = extractPackageDimensions(item.attributes || []);
      
      // CORREÇÃO 4: Extrair identificadores para controle do usuário
      const identifiers = extractIdentifiers(item.attributes || []);
      
      const snapshot: RawSnapshot = {
        item_id: data.resolved_item_id || item.id || extracted.id,
        title: item.title || '',
        // CORREÇÃO 2: Usar descrição capturada pela edge function
        description: item.description || '',
        price: item.price || 0,
        available_quantity: item.available_quantity || 1,
        condition: item.condition || 'new',
        category_id: item.category_id || '',
        listing_type_id: item.listing_type_id || 'gold_special',
        // CORREÇÃO 1: Fotos completas
        pictures: finalPictures,
        attributes: item.attributes || [],
        seller_id: String(item.seller_id),
        thumbnail: item.thumbnail,
        variations: item.variations,
        shipping: item.shipping,
        is_catalog_source: !!(
          item.catalog_product_id ||
          item.catalog_listing === true ||
          item.parent_item_id
        ),
        catalog_product_id: item.catalog_product_id,
        // CORREÇÃO 7: Guardar log de captura
        capture_log: captureLog,
        // CORREÇÃO 4: Guardar identificadores capturados
        captured_gtin: item.captured_gtin || identifiers.gtin,
        captured_ean: item.captured_ean || identifiers.ean,
        captured_sku: item.captured_sku || identifiers.sku,
      };
      
      return snapshot;
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [activeAccount?.sellerId]);
  
  // Criar rascunho a partir do snapshot
  const createDraft = useCallback(async (
    sourceUrl: string,
    snapshot: RawSnapshot
  ): Promise<CloneDraft | null> => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) throw new Error('Não autenticado');
      
      // Buscar workspace
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('active_workspace_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      let workspaceId = (prefs as any)?.active_workspace_id;
      
      if (!workspaceId) {
        const { data: member } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        
        workspaceId = (member as any)?.workspace_id;
      }
      
      if (!workspaceId) {
        throw new Error('Workspace não encontrado');
      }
      
      // Buscar ml_account_id
      let mlAccountId: string | null = null;
      if (activeAccount?.sellerId) {
        const { data: mlAccount } = await supabase
          .from('ml_accounts')
          .select('id')
          .eq('ml_user_id', String(activeAccount.sellerId))
          .eq('user_id', user.id)
          .maybeSingle();
        
        mlAccountId = mlAccount?.id || null;
      }
      
      // CORREÇÃO 3: Extrair dimensões do snapshot (já vieram da API)
      const dimensions = extractPackageDimensions(snapshot.attributes);
      
      // CORREÇÃO 5: Filtrar atributos seguros (remover GTIN/EAN/SKU etc)
      const safeAttributes = filterSafeAttributes(snapshot.attributes);
      
      // Determinar listing_type inicial
      let listingType: 'gold_special' | 'gold_pro' = 'gold_special';
      if (snapshot.listing_type_id === 'gold_pro') {
        listingType = 'gold_pro';
      }
      
      const draftPayload: DraftPayload = {
        title: snapshot.title,
        // CORREÇÃO 2: Descrição já vem preenchida do snapshot
        description: snapshot.description || '',
        price: snapshot.price,
        available_quantity: snapshot.available_quantity,
        condition: snapshot.condition,
        // CORREÇÃO 1: Fotos já estão completas
        pictures: snapshot.pictures,
        // CORREÇÃO 3: Dimensões pré-preenchidas quando existem
        seller_package_height: dimensions.height,
        seller_package_width: dimensions.width,
        seller_package_length: dimensions.length,
        seller_package_weight: dimensions.weight,
        // CORREÇÃO 5: Apenas atributos seguros
        attributes: safeAttributes,
        listing_type_id: listingType,
        initial_status: 'paused', // Default: criar pausado
        category_id: snapshot.category_id,
        // CORREÇÃO 4: Toggles desligados por padrão
        include_gtin: false,
        include_sku: false,
        // Valores capturados para exibição
        captured_gtin: snapshot.captured_gtin,
        captured_sku: snapshot.captured_sku,
      };
      
      // Inserir no banco
      const { data: insertedDraft, error: insertError } = await supabase
        .from('clone_drafts')
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          ml_account_id: mlAccountId,
          source_url: sourceUrl,
          source_item_id: snapshot.item_id,
          raw_snapshot: JSON.parse(JSON.stringify(snapshot)),
          draft_payload: JSON.parse(JSON.stringify(draftPayload)),
          status: 'DRAFT',
          validation_logs: [],
        })
        .select()
        .single();
      
      if (insertError) {
        throw new Error('Erro ao salvar rascunho: ' + insertError.message);
      }
      
      const newDraft: CloneDraft = {
        id: insertedDraft.id,
        user_id: insertedDraft.user_id,
        workspace_id: insertedDraft.workspace_id,
        ml_account_id: insertedDraft.ml_account_id ?? undefined,
        source_url: insertedDraft.source_url ?? undefined,
        source_item_id: insertedDraft.source_item_id,
        captured_at: insertedDraft.captured_at,
        raw_snapshot: insertedDraft.raw_snapshot as unknown as RawSnapshot,
        draft_payload: insertedDraft.draft_payload as unknown as DraftPayload,
        status: insertedDraft.status as DraftStatus,
        created_item_id: insertedDraft.created_item_id ?? undefined,
        error_message: insertedDraft.error_message ?? undefined,
        error_details: insertedDraft.error_details as Record<string, unknown> | undefined,
        validation_logs: (insertedDraft.validation_logs as unknown as any[]) || [],
        created_at: insertedDraft.created_at,
        updated_at: insertedDraft.updated_at,
      };
      
      setDraft(newDraft);
      return newDraft;
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [activeAccount?.sellerId]);
  
  // Atualizar payload do rascunho
  const updateDraftPayload = useCallback(async (
    draftId: string,
    payload: Partial<DraftPayload>
  ): Promise<boolean> => {
    if (!draft) return false;
    
    setLoading(true);
    setError(null);
    
    try {
      const newPayload = { ...draft.draft_payload, ...payload };
      
      const { error: updateError } = await supabase
        .from('clone_drafts')
        .update({ 
          draft_payload: JSON.parse(JSON.stringify(newPayload)),
          updated_at: new Date().toISOString(),
        })
        .eq('id', draftId);
      
      if (updateError) {
        throw new Error('Erro ao atualizar rascunho');
      }
      
      setDraft({
        ...draft,
        draft_payload: newPayload,
      });
      
      return true;
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [draft]);
  
  // Limpar estado
  const resetDraft = useCallback(() => {
    setDraft(null);
    setError(null);
    setLoading(false);
  }, []);
  
  return {
    draft,
    setDraft,
    loading,
    error,
    setError,
    fetchReference,
    createDraft,
    updateDraftPayload,
    resetDraft,
  };
}
