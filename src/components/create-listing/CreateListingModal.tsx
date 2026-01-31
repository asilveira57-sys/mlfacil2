// Modal principal: Clonar como anúncio novo (v2)
// COMPLETAMENTE ISOLADO do fluxo de clonagem existente (UnifiedCloneModal)

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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Link, 
  FileText, 
  Package, 
  ShieldCheck,
  Send, 
  AlertCircle,
  RefreshCw 
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useQueryClient } from '@tanstack/react-query';

import { 
  CreateListingStep, 
  ReferenceSnapshot, 
  FinalListingPayload,
  filterSafeAttributes,
} from './types';
import { useCreateListingCapture } from './useCreateListingCapture';
import { useCreateListingDraft } from './useCreateListingDraft';
import { 
  ReferenceStep, 
  ContentStep, 
  LogisticsStep, 
  IdentifiersStep,
  PublishStep 
} from './steps';

interface CreateListingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateListingModal({ open, onOpenChange }: CreateListingModalProps) {
  const { activeAccount } = useActiveAccount();
  const queryClient = useQueryClient();
  
  // Hooks isolados
  const capture = useCreateListingCapture();
  const draftManager = useCreateListingDraft();
  
  // Estado local
  const [activeStep, setActiveStep] = useState<CreateListingStep>('reference');
  const [sourceUrl, setSourceUrl] = useState('');
  const [snapshot, setSnapshot] = useState<ReferenceSnapshot | null>(null);
  const [userGuidance, setUserGuidance] = useState<string | undefined>();
  
  // Estados de execução
  const [executing, setExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [createdItemId, setCreatedItemId] = useState<string | undefined>();
  const [authExpired, setAuthExpired] = useState(false);
  
  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setActiveStep('reference');
      setSourceUrl('');
      setSnapshot(null);
      setUserGuidance(undefined);
      setExecuting(false);
      setExecuteError(null);
      setSuccess(false);
      setCreatedItemId(undefined);
      setAuthExpired(false);
      capture.reset();
      draftManager.reset();
    }
  }, [open]);
  
  // Capturar dados do anúncio de referência
  const handleCapture = async () => {
    const result = await capture.captureReference(sourceUrl);
    
    if (result.success && result.snapshot) {
      setSnapshot(result.snapshot);
      setUserGuidance(undefined);
      
      // Criar rascunho automaticamente
      await draftManager.createDraft(sourceUrl, result.snapshot);
    } else {
      setUserGuidance(result.userGuidance);
    }
  };
  
  // Atualizar payload
  const handlePayloadChange = useCallback((updates: Partial<FinalListingPayload>) => {
    draftManager.updatePayload(updates);
  }, [draftManager.updatePayload]);
  
  // Navegação entre steps
  const handleContinueFromReference = () => setActiveStep('content');
  const handleContinueFromContent = () => setActiveStep('logistics');
  const handleContinueFromLogistics = () => setActiveStep('identifiers');
  const handleContinueFromIdentifiers = () => setActiveStep('publish');
  
  const handleBackToReference = () => setActiveStep('reference');
  const handleBackToContent = () => setActiveStep('content');
  const handleBackToLogistics = () => setActiveStep('logistics');
  const handleBackToIdentifiers = () => setActiveStep('identifiers');
  
  // Executar criação do anúncio
  const handleExecute = async () => {
    if (!draftManager.draft || !activeAccount?.sellerId) {
      setExecuteError('Dados incompletos. Volte e verifique.');
      return;
    }
    
    const validation = draftManager.validate();
    if (!validation.valid) {
      setExecuteError(validation.errors[0]?.message || 'Erro de validação');
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
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('active_workspace_id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      let workspaceId = (prefs as any)?.active_workspace_id ?? null;
      
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
      
      const payload = draftManager.draft.final_payload;
      
      // Montar checklist para criar anúncio NORMAL (anti-catálogo)
      const checklist = {
        // Flag crítica: criar como anúncio normal
        create_as_normal: true,
        force_standard_listing: true,
        
        // Dados do anúncio
        final_title: payload.title,
        final_description: payload.description,
        final_price: payload.price,
        final_quantity: payload.available_quantity,
        final_condition: payload.condition,
        
        // Tipo e status
        listing_type: payload.listing_type_id,
        create_paused: payload.initial_status === 'paused',
        
        // Dimensões
        seller_package_height: payload.package_height,
        seller_package_width: payload.package_width,
        seller_package_length: payload.package_length,
        seller_package_weight: payload.package_weight,
        
        // Fotos
        final_pictures: payload.pictures,
        
        // Categoria
        category_id: payload.category_id,
        
        // Atributos (já filtrados, sem identificadores de catálogo)
        final_attributes: payload.attributes,
        
        // Metadados
        source: 'create_listing_v2',
        source_url: sourceUrl,
        anti_catalog_enabled: true,
        
        copy_title: true,
        copy_description: true,
        copy_pictures: true,
        copy_attributes: true,
        copy_price: true,
      };
      
      console.log('[CreateListingModal] Creating normal listing with checklist:', {
        title: checklist.final_title,
        pictures_count: checklist.final_pictures?.length,
        create_as_normal: checklist.create_as_normal,
        attributes_count: checklist.final_attributes?.length,
      });
      
      // Criar ação no sistema existente
      const { data: action, error: actionError } = await supabase
        .from('ad_lifecycle_actions')
        .insert({
          workspace_id: workspaceId,
          ml_account_id: mlAccount.id,
          item_id: snapshot?.item_id || draftManager.draft.source_item_id,
          action_type: 'CLONE',
          action_status: 'QUEUED',
          checklist: JSON.parse(JSON.stringify(checklist)),
          source_snapshot: JSON.parse(JSON.stringify(draftManager.draft.reference_snapshot)),
          reason: 'Criar como anúncio novo (anti-catálogo)',
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
        
        // Mensagem de erro orientada
        let errorMessage = result?.message || 'Erro desconhecido na criação';
        
        if (errorMessage.includes('title') && errorMessage.includes('invalid')) {
          errorMessage = 'O Mercado Livre rejeitou a criação. Isso pode indicar que a categoria ' +
            'requer atributos específicos ou que o fluxo de catálogo foi forçado. ' +
            'Tente usar uma categoria diferente ou verifique os atributos obrigatórios.';
        }
        
        throw new Error(errorMessage);
      }
      
      // Sucesso!
      const newItemId = result?.new_item_id;
      setCreatedItemId(newItemId);
      setSuccess(true);
      
      // Invalidar queries
      queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });
      
      toast.success('Anúncio criado com sucesso!', {
        description: `ID: ${newItemId}`,
      });
      
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setExecuteError(message);
    } finally {
      setExecuting(false);
    }
  };
  
  // Handler para reconectar
  const handleReconnect = () => {
    window.location.href = '/configuracoes';
  };
  
  const stepConfig = [
    { value: 'reference' as CreateListingStep, label: 'Referência', icon: Link },
    { value: 'content' as CreateListingStep, label: 'Conteúdo', icon: FileText },
    { value: 'logistics' as CreateListingStep, label: 'Logística', icon: Package },
    { value: 'identifiers' as CreateListingStep, label: 'Proteção', icon: ShieldCheck },
    { value: 'publish' as CreateListingStep, label: 'Publicar', icon: Send },
  ];
  
  // Verificar se pode acessar cada step
  const canAccessStep = (step: CreateListingStep): boolean => {
    const payload = draftManager.draft?.final_payload;
    
    switch (step) {
      case 'reference':
        return true;
      case 'content':
        return !!snapshot && !!draftManager.draft;
      case 'logistics':
        return !!payload && !!payload.title?.trim() && (payload.pictures?.length || 0) > 0;
      case 'identifiers':
        return !!payload && 
          payload.package_height > 0 &&
          payload.package_width > 0 &&
          payload.package_length > 0 &&
          payload.package_weight > 0;
      case 'publish':
        return canAccessStep('identifiers');
      default:
        return false;
    }
  };
  
  const validation = draftManager.validate();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header fixo */}
        <DialogHeader className="flex-shrink-0 border-b pb-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">Criar anúncio novo</DialogTitle>
            <Badge variant="secondary" className="text-xs gap-1">
              <ShieldCheck className="h-3 w-3" />
              Anti-catálogo
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Cria um anúncio normal a partir de qualquer referência, com controle total sobre título, descrição e fotos
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
          value={activeStep} 
          onValueChange={(v) => {
            if (canAccessStep(v as CreateListingStep)) {
              setActiveStep(v as CreateListingStep);
            }
          }}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid grid-cols-5 flex-shrink-0">
            {stepConfig.map((step) => (
              <TabsTrigger
                key={step.value}
                value={step.value}
                disabled={!canAccessStep(step.value)}
                className="gap-1 text-xs"
              >
                <step.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{step.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          
          {/* Conteúdo com rolagem */}
          <ScrollArea className="flex-1 min-h-0 mt-4" type="always">
            <div className="pr-4">
              <TabsContent value="reference" className="mt-0">
                <ReferenceStep
                  sourceUrl={sourceUrl}
                  onSourceUrlChange={setSourceUrl}
                  snapshot={snapshot}
                  loading={capture.loading}
                  error={capture.error}
                  userGuidance={userGuidance}
                  onFetch={handleCapture}
                  onContinue={handleContinueFromReference}
                />
              </TabsContent>
              
              <TabsContent value="content" className="mt-0">
                {draftManager.draft?.final_payload && (
                  <ContentStep
                    payload={draftManager.draft.final_payload}
                    onPayloadChange={handlePayloadChange}
                    onBack={handleBackToReference}
                    onContinue={handleContinueFromContent}
                  />
                )}
              </TabsContent>
              
              <TabsContent value="logistics" className="mt-0">
                {draftManager.draft?.final_payload && (
                  <LogisticsStep
                    payload={draftManager.draft.final_payload}
                    onPayloadChange={handlePayloadChange}
                    onBack={handleBackToContent}
                    onContinue={handleContinueFromLogistics}
                  />
                )}
              </TabsContent>
              
              <TabsContent value="identifiers" className="mt-0">
                {snapshot && (
                  <IdentifiersStep
                    snapshot={snapshot}
                    onBack={handleBackToLogistics}
                    onContinue={handleContinueFromIdentifiers}
                  />
                )}
              </TabsContent>
              
              <TabsContent value="publish" className="mt-0">
                {draftManager.draft?.final_payload && (
                  <PublishStep
                    payload={draftManager.draft.final_payload}
                    onPayloadChange={handlePayloadChange}
                    validation={validation}
                    onBack={handleBackToIdentifiers}
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
