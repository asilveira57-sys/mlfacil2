import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Link, 
  FileText, 
  Package, 
  Send, 
  X,
  AlertCircle,
  RefreshCw 
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useQueryClient } from '@tanstack/react-query';

import { TabStep, RawSnapshot, DraftPayload, CATALOG_FORCING_ATTRIBUTES } from './types';
import { useCloneDraft } from './useCloneDraft';
import { ReferenceTab, ContentTab, LogisticsTab, PublishTab } from './tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface NewListingCloneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewListingCloneModal({ open, onOpenChange }: NewListingCloneModalProps) {
  const { activeAccount } = useActiveAccount();
  const queryClient = useQueryClient();
  
  const {
    draft,
    loading: draftLoading,
    error: draftError,
    setError,
    fetchReference,
    createDraft,
    updateDraftPayload,
    resetDraft,
  } = useCloneDraft();
  
  const [activeTab, setActiveTab] = useState<TabStep>('reference');
  const [sourceUrl, setSourceUrl] = useState('');
  const [snapshot, setSnapshot] = useState<RawSnapshot | null>(null);
  const [payload, setPayload] = useState<DraftPayload | null>(null);
  
  // Estados de execução
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdItemId, setCreatedItemId] = useState<string | undefined>();
  const [authExpired, setAuthExpired] = useState(false);
  
  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setActiveTab('reference');
      setSourceUrl('');
      setSnapshot(null);
      setPayload(null);
      setExecuting(false);
      setExecuteError(null);
      setSuccess(false);
      setCreatedItemId(undefined);
      setAuthExpired(false);
      resetDraft();
    }
  }, [open, resetDraft]);
  
  // Sincronizar payload com draft
  useEffect(() => {
    if (draft?.draft_payload) {
      setPayload(draft.draft_payload);
    }
  }, [draft?.draft_payload]);
  
  // Buscar dados do anúncio de referência
  const handleFetchReference = async () => {
    const result = await fetchReference(sourceUrl);
    if (result) {
      setSnapshot(result);
      // Criar rascunho automaticamente
      await createDraft(sourceUrl, result);
    }
  };
  
  // Atualizar payload local e no banco
  const handlePayloadChange = useCallback((updates: Partial<DraftPayload>) => {
    setPayload(prev => {
      if (!prev) return prev;
      return { ...prev, ...updates };
    });
    
    // Atualizar no banco (debounced in real usage)
    if (draft?.id) {
      updateDraftPayload(draft.id, updates);
    }
  }, [draft?.id, updateDraftPayload]);
  
  // Navegação entre abas
  const handleContinueFromReference = () => setActiveTab('content');
  const handleContinueFromContent = () => setActiveTab('logistics');
  const handleContinueFromLogistics = () => setActiveTab('publish');
  const handleBackToReference = () => setActiveTab('reference');
  const handleBackToContent = () => setActiveTab('content');
  const handleBackToLogistics = () => setActiveTab('logistics');
  
  // Executar criação do anúncio
  const handleExecute = async () => {
    if (!draft || !payload || !activeAccount?.sellerId) {
      setExecuteError('Dados incompletos. Volte e verifique.');
      return;
    }
    
    setExecuting(true);
    setExecuteError(null);
    
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) throw new Error('Não autenticado');
      
      // Buscar ml_account_id
      const { data: mlAccount } = await supabase
        .from('ml_accounts')
        .select('id')
        .eq('ml_user_id', String(activeAccount.sellerId))
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!mlAccount?.id) {
        throw new Error('Conta do Mercado Livre não encontrada');
      }
      
      // Buscar workspace_id
      let workspaceId: string | null = null;
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('active_workspace_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      workspaceId = (prefs as any)?.active_workspace_id ?? null;
      
      if (!workspaceId) {
        const { data: member } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        
        workspaceId = (member as any)?.workspace_id ?? null;
      }
      
      if (!workspaceId) {
        throw new Error('Workspace não encontrado');
      }
      
      // Atualizar status do rascunho para CREATING
      await supabase
        .from('clone_drafts')
        .update({ status: 'CREATING' })
        .eq('id', draft.id);
      
      // Montar checklist para o execute
      const checklist = {
        create_as_normal: true,
        copy_title: true,
        copy_description: true,
        copy_pictures: true,
        copy_attributes: true,
        copy_price: true,
        source: 'new_listing_clone_v1',
        source_url: sourceUrl,
        
        // Dados editados
        final_title: payload.title,
        final_description: payload.description,
        final_price: payload.price,
        final_quantity: payload.available_quantity,
        final_condition: payload.condition,
        
        // Tipo e status
        listing_type: payload.listing_type_id,
        create_paused: payload.initial_status === 'paused',
        
        // Dimensões
        seller_package_height: payload.seller_package_height,
        seller_package_width: payload.seller_package_width,
        seller_package_length: payload.seller_package_length,
        seller_package_weight: payload.seller_package_weight,
        
        // Fotos (já filtradas)
        final_pictures: payload.pictures,
        
        // Categoria
        category_id: payload.category_id,
        
        // Atributos seguros
        final_attributes: payload.attributes.filter(attr => 
          !CATALOG_FORCING_ATTRIBUTES.has(attr.id?.toUpperCase())
        ),
      };
      
      // Criar ação no sistema existente
      const { data: action, error: actionError } = await supabase
        .from('ad_lifecycle_actions')
        .insert({
          workspace_id: workspaceId,
          ml_account_id: mlAccount.id,
          item_id: snapshot?.item_id || draft.source_item_id,
          action_type: 'CLONE',
          action_status: 'QUEUED',
          checklist: JSON.parse(JSON.stringify(checklist)),
          source_snapshot: JSON.parse(JSON.stringify(draft.raw_snapshot)),
          reason: 'Clonar como anúncio novo',
        })
        .select()
        .single();
      
      if (actionError || !action) {
        throw new Error('Erro ao criar ação: ' + actionError?.message);
      }
      
      // Executar ação imediatamente
      const { data: result, error: executeError } = await supabase.functions.invoke(
        'ad-action-execute',
        {
          body: { action_id: action.id, confirm: true },
        }
      );
      
      if (executeError) {
        throw new Error('Erro ao executar: ' + executeError.message);
      }
      
      if (!result?.success) {
        const errorCode = result?.error || '';
        const requiresReconnection = result?.requires_reconnection;
        
        if (errorCode === 'AUTH_EXPIRED' || errorCode === 'UNAUTHORIZED' || 
            errorCode === 'ML_ACCOUNT_MISSING_TOKEN' || requiresReconnection) {
          setAuthExpired(true);
          throw new Error('Token expirado. Reconecte sua conta do Mercado Livre.');
        }
        
        throw new Error(result?.message || 'Erro desconhecido na criação');
      }
      
      // Sucesso!
      const newItemId = result?.new_item_id;
      setCreatedItemId(newItemId);
      setSuccess(true);
      
      // Atualizar rascunho
      await supabase
        .from('clone_drafts')
        .update({ 
          status: 'CREATED',
          created_item_id: newItemId,
        })
        .eq('id', draft.id);
      
      // Invalidar queries
      queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });
      
      toast.success('Anúncio criado com sucesso!', {
        description: newItemId,
      });
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setExecuteError(message);
      
      // Atualizar rascunho com erro
      if (draft?.id) {
        await supabase
          .from('clone_drafts')
          .update({ 
            status: 'FAILED',
            error_message: message,
          })
          .eq('id', draft.id);
      }
    } finally {
      setExecuting(false);
    }
  };
  
  // Handler para reconectar
  const handleReconnect = () => {
    // Salvar estado atual
    sessionStorage.setItem('new_listing_clone_backup', JSON.stringify({
      sourceUrl,
      snapshot,
      payload,
      activeTab,
      draftId: draft?.id,
      timestamp: Date.now(),
    }));
    
    // Navegar para configurações (onde o usuário pode reconectar)
    window.location.href = '/configuracoes';
  };
  
  const tabConfig = [
    { value: 'reference' as TabStep, label: 'Referência', icon: Link },
    { value: 'content' as TabStep, label: 'Conteúdo', icon: FileText },
    { value: 'logistics' as TabStep, label: 'Logística', icon: Package },
    { value: 'publish' as TabStep, label: 'Publicar', icon: Send },
  ];
  
  // Verificar se pode acessar cada aba
  const canAccessTab = (tab: TabStep): boolean => {
    switch (tab) {
      case 'reference':
        return true;
      case 'content':
        return !!snapshot && !!draft;
      case 'logistics':
        return !!payload && !!payload.title?.trim() && (payload.pictures?.length || 0) > 0;
      case 'publish':
        return !!payload && 
          payload.seller_package_height > 0 &&
          payload.seller_package_width > 0 &&
          payload.seller_package_length > 0 &&
          payload.seller_package_weight > 0;
      default:
        return false;
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header fixo */}
        <DialogHeader className="flex-shrink-0 border-b pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">Clonar como anúncio novo</DialogTitle>
            <Badge variant="secondary" className="text-xs">
              Fluxo anti-catálogo
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Cria um anúncio normal a partir de qualquer referência, com título e descrição editáveis
          </p>
        </DialogHeader>
        
        {/* Banner de erro de autenticação */}
        {authExpired && (
          <Alert variant="destructive" className="mx-0 flex-shrink-0">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between w-full">
              <span>Token expirado. Reconecte sua conta para continuar.</span>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleReconnect}
                className="ml-4"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reconectar
              </Button>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Tabs */}
        <Tabs 
          value={activeTab} 
          onValueChange={(v) => {
            if (canAccessTab(v as TabStep)) {
              setActiveTab(v as TabStep);
            }
          }}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid grid-cols-4 flex-shrink-0">
            {tabConfig.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                disabled={!canAccessTab(tab.value)}
                className="gap-1 text-xs sm:text-sm"
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          
          {/* Conteúdo rolável */}
          <ScrollArea className="flex-1 mt-4" type="always">
            <div className="pr-4">
              <TabsContent value="reference" className="mt-0">
                <ReferenceTab
                  sourceUrl={sourceUrl}
                  onSourceUrlChange={setSourceUrl}
                  snapshot={snapshot}
                  loading={draftLoading}
                  error={draftError}
                  onFetch={handleFetchReference}
                  onContinue={handleContinueFromReference}
                />
              </TabsContent>
              
              <TabsContent value="content" className="mt-0">
                {payload && (
                  <ContentTab
                    payload={payload}
                    onPayloadChange={handlePayloadChange}
                    onBack={handleBackToReference}
                    onContinue={handleContinueFromContent}
                  />
                )}
              </TabsContent>
              
              <TabsContent value="logistics" className="mt-0">
                {payload && (
                  <LogisticsTab
                    payload={payload}
                    onPayloadChange={handlePayloadChange}
                    onBack={handleBackToContent}
                    onContinue={handleContinueFromLogistics}
                  />
                )}
              </TabsContent>
              
              <TabsContent value="publish" className="mt-0">
                {payload && (
                  <PublishTab
                    payload={payload}
                    onPayloadChange={handlePayloadChange}
                    onBack={handleBackToLogistics}
                    onExecute={handleExecute}
                    loading={executing}
                    error={executeError}
                    success={success}
                    createdItemId={createdItemId}
                  />
                )}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
