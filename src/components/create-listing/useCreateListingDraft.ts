// Hook para gerenciar rascunho de criação de anúncio
// Usa a tabela clone_drafts existente com identificação via source_url

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import {
  CreateListingDraft,
  CreateListingStatus,
  ReferenceSnapshot,
  FinalListingPayload,
  ValidationResult,
  filterSafeAttributes,
} from './types';

export interface CreateDraftResult {
  success: boolean;
  draft?: CreateListingDraft;
  error?: string;
}

export function useCreateListingDraft() {
  const { activeAccount } = useActiveAccount();
  const [draft, setDraft] = useState<CreateListingDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Criar rascunho a partir do snapshot
  const createDraft = useCallback(async (
    sourceUrl: string,
    snapshot: ReferenceSnapshot
  ): Promise<CreateDraftResult> => {
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
      
      // Filtrar atributos seguros (remover identificadores de catálogo)
      const safeAttributes = filterSafeAttributes(snapshot.attributes);
      
      // Determinar listing_type inicial
      let listingType: 'gold_special' | 'gold_pro' = 'gold_special';
      if (snapshot.listing_type_id === 'gold_pro') {
        listingType = 'gold_pro';
      }
      
      // Montar payload inicial
      const finalPayload: FinalListingPayload = {
        title: snapshot.title,
        description: snapshot.description,
        price: snapshot.price,
        available_quantity: snapshot.available_quantity,
        condition: snapshot.condition === 'used' ? 'used' : 'new',
        pictures: snapshot.pictures,
        package_height: snapshot.package_dimensions?.height || 0,
        package_width: snapshot.package_dimensions?.width || 0,
        package_length: snapshot.package_dimensions?.length || 0,
        package_weight: snapshot.package_dimensions?.weight || 0,
        attributes: safeAttributes,
        listing_type_id: listingType,
        initial_status: 'paused', // Default: criar pausado para revisão
        category_id: snapshot.category_id,
        // NOVAS FLAGS: Por padrão, NÃO incluir GTIN/SKU (anti-catálogo)
        include_gtin: false,
        include_sku: false,
      };
      
      // Usar a tabela clone_drafts existente
      const { data: insertedDraft, error: insertError } = await supabase
        .from('clone_drafts')
        .insert({
          user_id: user.id,
          workspace_id: workspaceId,
          ml_account_id: mlAccountId,
          source_url: `create_listing_v2::${sourceUrl}`, // Prefixo para identificar fluxo
          source_item_id: snapshot.item_id,
          raw_snapshot: JSON.parse(JSON.stringify(snapshot)),
          draft_payload: JSON.parse(JSON.stringify(finalPayload)),
          status: 'DRAFT',
          validation_logs: [],
        })
        .select()
        .single();
      
      if (insertError) {
        throw new Error('Erro ao salvar rascunho: ' + insertError.message);
      }
      
      const newDraft: CreateListingDraft = {
        id: insertedDraft.id,
        user_id: insertedDraft.user_id,
        workspace_id: insertedDraft.workspace_id,
        ml_account_id: insertedDraft.ml_account_id ?? undefined,
        source_url: sourceUrl,
        source_item_id: insertedDraft.source_item_id,
        reference_snapshot: insertedDraft.raw_snapshot as unknown as ReferenceSnapshot,
        final_payload: insertedDraft.draft_payload as unknown as FinalListingPayload,
        status: insertedDraft.status as CreateListingStatus,
        created_item_id: insertedDraft.created_item_id ?? undefined,
        error_message: insertedDraft.error_message ?? undefined,
        created_at: insertedDraft.created_at,
        updated_at: insertedDraft.updated_at,
      };
      
      setDraft(newDraft);
      return { success: true, draft: newDraft };
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      return { success: false, error: message };
    } finally {
      setLoading(false);
    }
  }, [activeAccount?.sellerId]);
  
  // Atualizar payload do rascunho
  const updatePayload = useCallback(async (updates: Partial<FinalListingPayload>): Promise<boolean> => {
    if (!draft) return false;
    
    const newPayload = { ...draft.final_payload, ...updates };
    
    // Atualizar estado local imediatamente
    setDraft({ ...draft, final_payload: newPayload });
    
    // Persistir no banco (async, não bloqueia UI)
    supabase
      .from('clone_drafts')
      .update({ 
        draft_payload: JSON.parse(JSON.stringify(newPayload)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', draft.id)
      .then(({ error }) => {
        if (error) console.error('[CreateListingDraft] Failed to persist:', error);
      });
    
    return true;
  }, [draft]);
  
  // Validar rascunho antes de criar
  const validate = useCallback((): ValidationResult => {
    if (!draft) {
      return {
        valid: false,
        errors: [{ field: 'draft', message: 'Rascunho não encontrado', code: 'MISSING_DRAFT' }],
        warnings: [],
      };
    }
    
    const payload = draft.final_payload;
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];
    
    // Validações obrigatórias
    if (!payload.title?.trim()) {
      errors.push({ field: 'title', message: 'Título é obrigatório', code: 'REQUIRED' });
    }
    
    if (payload.pictures.length < 2) {
      errors.push({ 
        field: 'pictures', 
        message: 'São necessárias pelo menos 2 fotos', 
        code: 'MINIMUM_PICTURES' 
      });
    }
    
    if (payload.price <= 0) {
      errors.push({ field: 'price', message: 'Preço deve ser maior que zero', code: 'INVALID_PRICE' });
    }
    
    if (payload.available_quantity <= 0) {
      errors.push({ field: 'available_quantity', message: 'Quantidade deve ser maior que zero', code: 'INVALID_QUANTITY' });
    }
    
    // Dimensões obrigatórias
    if (payload.package_height <= 0) {
      errors.push({ field: 'package_height', message: 'Altura é obrigatória', code: 'REQUIRED' });
    }
    if (payload.package_width <= 0) {
      errors.push({ field: 'package_width', message: 'Largura é obrigatória', code: 'REQUIRED' });
    }
    if (payload.package_length <= 0) {
      errors.push({ field: 'package_length', message: 'Comprimento é obrigatório', code: 'REQUIRED' });
    }
    if (payload.package_weight <= 0) {
      errors.push({ field: 'package_weight', message: 'Peso é obrigatório', code: 'REQUIRED' });
    }
    
    // Warnings
    if (!payload.description?.trim()) {
      warnings.push({ field: 'description', message: 'Descrição vazia pode reduzir conversão' });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }, [draft]);
  
  // Atualizar status
  const setStatus = useCallback(async (status: CreateListingStatus): Promise<boolean> => {
    if (!draft) return false;
    
    const { error } = await supabase
      .from('clone_drafts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', draft.id);
    
    if (error) {
      console.error('[CreateListingDraft] Failed to update status:', error);
      return false;
    }
    
    setDraft({ ...draft, status });
    return true;
  }, [draft]);
  
  // Limpar estado
  const reset = useCallback(() => {
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
    createDraft,
    updatePayload,
    validate,
    setStatus,
    reset,
  };
}
