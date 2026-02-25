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

// === Parsing de IDs MLB / MLBU ===

export interface ParseResult {
  mlb_id: string | null;
  mlbu_id: string | null;
  decision: 'mlb_from_param' | 'mlb_from_url' | 'mlb_direct' | 'mlbu_only' | 'none';
  raw_input: string;
}

export function parseInput(input: string): ParseResult {
  if (!input?.trim()) return { mlb_id: null, mlbu_id: null, decision: 'none', raw_input: input };
  const trimmed = input.trim();

  console.log('[CloneParser] step=parse_input raw_input=', trimmed);

  // Extrair MLBU se presente
  let mlbu_id: string | null = null;
  const mlbuPatterns = [/\/up\/(MLBU\d+)/i, /\/p\/(MLBU\d+)/i, /(MLBU\d{8,})/i];
  for (const p of mlbuPatterns) {
    const m = trimmed.match(p);
    if (m) {
      mlbu_id = (m[1] || m[0]).replace(/-/g, '').toUpperCase();
      if (!/^MLBU\d+$/.test(mlbu_id)) mlbu_id = null;
      else break;
    }
  }

  // 1) item_id em query param
  const paramPatterns = [
    /item_id[=:](MLB[\d-]+)/i,
    /pdp_filters=item_id[=:](MLB[\d-]+)/i,
  ];
  for (const p of paramPatterns) {
    const m = trimmed.match(p);
    if (m) {
      const id = m[1].replace(/-/g, '').toUpperCase();
      if (/^MLB\d+$/.test(id)) {
        console.log('[CloneParser] step=detect_item_id decision=mlb_from_param extracted_item_id=', id, 'extracted_product_id=', mlbu_id);
        return { mlb_id: id, mlbu_id, decision: 'mlb_from_param', raw_input: trimmed };
      }
    }
  }

  // 2) MLB\d+ em qualquer parte da URL (não MLBU)
  const mlbGeneric = trimmed.match(/(?<![A-Z])(MLB[\d-]{8,})/i);
  if (mlbGeneric) {
    const candidate = mlbGeneric[1].replace(/-/g, '').toUpperCase();
    if (/^MLB\d+$/.test(candidate) && !candidate.startsWith('MLBU')) {
      console.log('[CloneParser] step=detect_item_id decision=mlb_from_url extracted_item_id=', candidate, 'extracted_product_id=', mlbu_id);
      return { mlb_id: candidate, mlbu_id, decision: 'mlb_from_url', raw_input: trimmed };
    }
  }

  // 3) ID direto MLB
  if (/^MLB[\d-]+$/i.test(trimmed)) {
    const id = trimmed.replace(/-/g, '').toUpperCase();
    if (/^MLB\d+$/.test(id)) {
      console.log('[CloneParser] step=detect_item_id decision=mlb_direct extracted_item_id=', id);
      return { mlb_id: id, mlbu_id: null, decision: 'mlb_direct', raw_input: trimmed };
    }
  }

  // 4) Só MLBU encontrado
  if (mlbu_id) {
    console.log('[CloneParser] step=detect_product_id decision=mlbu_only extracted_product_id=', mlbu_id);
    return { mlb_id: null, mlbu_id, decision: 'mlbu_only', raw_input: trimmed };
  }

  console.log('[CloneParser] step=parse_input decision=none');
  return { mlb_id: null, mlbu_id: null, decision: 'none', raw_input: trimmed };
}

// === Helpers ===

function extractPackageDimensions(attributes: Attribute[]) {
  const result = { height: 0, width: 0, length: 0, weight: 0 };
  if (!attributes || !Array.isArray(attributes)) return result;
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name ? parseFloat(attr.value_name) : attr.value_struct?.number;
    if (value && !isNaN(value)) {
      if (id === 'SELLER_PACKAGE_HEIGHT' || id === 'PACKAGE_HEIGHT') result.height = value;
      else if (id === 'SELLER_PACKAGE_WIDTH' || id === 'PACKAGE_WIDTH') result.width = value;
      else if (id === 'SELLER_PACKAGE_LENGTH' || id === 'PACKAGE_LENGTH') result.length = value;
      else if (id === 'SELLER_PACKAGE_WEIGHT' || id === 'PACKAGE_WEIGHT') result.weight = value;
    }
  }
  return result;
}

function filterSafeAttributes(attributes: Attribute[]): Attribute[] {
  if (!attributes || !Array.isArray(attributes)) return [];
  return attributes.filter(attr => !CATALOG_FORCING_ATTRIBUTES.has(attr.id?.toUpperCase()));
}

function extractIdentifiers(attributes: Attribute[]) {
  const result: { gtin?: string; ean?: string; sku?: string } = {};
  if (!attributes || !Array.isArray(attributes)) return result;
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name || attr.value_id;
    if (!value) continue;
    if (id === 'GTIN') result.gtin = value;
    else if (id === 'EAN') result.ean = value;
    else if (id === 'SELLER_SKU' || id === 'SKU') result.sku = value;
  }
  return result;
}

// === Error detail interface ===

export interface LoadErrorDetail {
  item_id: string;
  http_status?: number;
  ml_error?: string;
  error_body_snippet?: string;
  load_mode: string;
}

// === Hook ===

export function useCloneDraft() {
  const { activeAccount } = useActiveAccount();
  const [draft, setDraft] = useState<CloneDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<LoadErrorDetail | null>(null);
  
  const fetchReference = useCallback(async (itemId: string, idType: 'MLB' | 'MLBU' = 'MLB'): Promise<RawSnapshot | null> => {
    if (!activeAccount?.sellerId) {
      setError('Selecione uma conta do Mercado Livre');
      return null;
    }
    
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    
    try {
      console.log('[CloneParser] step=load_item item_id=', itemId, 'id_type=', idType);
      
      const { data, error: fetchError } = await supabase.functions.invoke('ad-item-snapshot', {
        body: { 
          item_id: itemId, 
          id_type: idType,
          seller_id: activeAccount.sellerId,
        },
      });
      
      if (fetchError) {
        setError(`Erro de conexão: ${fetchError.message}`);
        setErrorDetail({ item_id: itemId, load_mode: 'public_api', ml_error: fetchError.message });
        return null;
      }
      
      if (!data?.success) {
        // Build detailed error from backend response
        const detail: LoadErrorDetail = {
          item_id: data?.item_id || itemId,
          http_status: data?.http_status,
          ml_error: data?.message || data?.error || 'Erro desconhecido',
          error_body_snippet: data?.error_body_snippet,
          load_mode: data?.load_mode || 'public_api',
        };
        setErrorDetail(detail);
        
        // Only say "catálogo" if backend explicitly returned CATALOG_RESOLUTION_FAILED
        if (data?.error === 'CATALOG_RESOLUTION_FAILED') {
          setError(data.message || 'Não foi possível resolver o link de catálogo');
        } else {
          setError(data?.message || `Falha ao carregar anúncio ${itemId}`);
        }
        return null;
      }
      
      const item = data.item;
      const captureLog: CaptureLog = data.capture_log || {
        pictures_count: 0, pictures_source: 'none', description_captured: false,
        dimensions_captured: false, attributes_count: 0, gtin_found: false, ean_found: false, sku_found: false, errors: [],
      };
      
      const finalPictures = item.pictures || [];
      const dimensions = extractPackageDimensions(item.attributes || []);
      const identifiers = extractIdentifiers(item.attributes || []);
      
      console.log('[CloneParser] step=load_item success pictures=', finalPictures.length, 'description=', !!item.description, 'dimensions=', captureLog.dimensions_captured);
      
      // Detect catalog ONLY from real API data
      const isCatalog = !!(
        item.catalog_product_id ||
        item.catalog_listing === true ||
        item.parent_item_id
      );
      
      const snapshot: RawSnapshot = {
        item_id: data.resolved_item_id || item.id || itemId,
        title: item.title || '',
        description: item.description || '',
        price: item.price || 0,
        available_quantity: item.available_quantity || 1,
        condition: item.condition || 'new',
        category_id: item.category_id || '',
        listing_type_id: item.listing_type_id || 'gold_special',
        pictures: finalPictures,
        attributes: item.attributes || [],
        seller_id: String(item.seller_id),
        thumbnail: item.thumbnail,
        variations: item.variations,
        shipping: item.shipping,
        is_catalog_source: isCatalog,
        catalog_product_id: item.catalog_product_id,
        capture_log: captureLog,
        captured_gtin: item.captured_gtin || identifiers.gtin,
        captured_ean: item.captured_ean || identifiers.ean,
        captured_sku: item.captured_sku || identifiers.sku,
      };
      
      return snapshot;
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      setErrorDetail({ item_id: itemId, load_mode: 'public_api', ml_error: message });
      return null;
    } finally {
      setLoading(false);
    }
  }, [activeAccount?.sellerId]);
  
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
      
      const { data: prefs } = await supabase
        .from('user_preferences').select('active_workspace_id')
        .eq('user_id', user.id).maybeSingle();
      
      let workspaceId = (prefs as any)?.active_workspace_id;
      
      if (!workspaceId) {
        const { data: member } = await supabase
          .from('workspace_members').select('workspace_id')
          .eq('user_id', user.id).limit(1).maybeSingle();
        workspaceId = (member as any)?.workspace_id;
      }
      
      if (!workspaceId) throw new Error('Workspace não encontrado');
      
      let mlAccountId: string | null = null;
      if (activeAccount?.sellerId) {
        const { data: mlAccount } = await supabase
          .from('ml_accounts').select('id')
          .eq('ml_user_id', String(activeAccount.sellerId))
          .eq('user_id', user.id).maybeSingle();
        mlAccountId = mlAccount?.id || null;
      }
      
      const dimensions = extractPackageDimensions(snapshot.attributes);
      const safeAttributes = filterSafeAttributes(snapshot.attributes);
      
      let listingType: 'gold_special' | 'gold_pro' = 'gold_special';
      if (snapshot.listing_type_id === 'gold_pro') listingType = 'gold_pro';
      
      const draftPayload: DraftPayload = {
        title: snapshot.title,
        description: snapshot.description || '',
        price: snapshot.price,
        available_quantity: snapshot.available_quantity,
        condition: snapshot.condition,
        pictures: snapshot.pictures,
        seller_package_height: dimensions.height,
        seller_package_width: dimensions.width,
        seller_package_length: dimensions.length,
        seller_package_weight: dimensions.weight,
        attributes: safeAttributes,
        listing_type_id: listingType,
        initial_status: 'paused',
        category_id: snapshot.category_id,
        include_gtin: false,
        include_sku: false,
        captured_gtin: snapshot.captured_gtin,
        captured_sku: snapshot.captured_sku,
      };
      
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
      
      if (insertError) throw new Error('Erro ao salvar rascunho: ' + insertError.message);
      
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
        .update({ draft_payload: JSON.parse(JSON.stringify(newPayload)), updated_at: new Date().toISOString() })
        .eq('id', draftId);
      
      if (updateError) throw new Error('Erro ao atualizar rascunho');
      setDraft({ ...draft, draft_payload: newPayload });
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [draft]);
  
  const resetDraft = useCallback(() => {
    setDraft(null);
    setError(null);
    setErrorDetail(null);
    setLoading(false);
  }, []);
  
  return {
    draft,
    setDraft,
    loading,
    error,
    errorDetail,
    setError,
    fetchReference,
    createDraft,
    updateDraftPayload,
    resetDraft,
  };
}
