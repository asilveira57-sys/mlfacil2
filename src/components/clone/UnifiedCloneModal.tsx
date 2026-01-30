import { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Loader2, Link, AlertCircle, CheckCircle2, Info, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useQueryClient } from '@tanstack/react-query';

interface UnifiedCloneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ItemPreviewData {
  item_id: string;
  title: string;
  price: number;
  available_quantity: number;
  thumbnail?: string;
  category_id?: string;
  listing_type_id?: string;
  seller_id: string;
  is_catalog_source: boolean;
  catalog_product_id?: string;
  clone_mode: 'internal' | 'external';
  listing_mode: 'catalog' | 'standard';
}

interface CloneFormData {
  price: number;
  quantity: number;
  sku: string;
  listing_type: string;
}

type ModalStep = 'input' | 'preview' | 'confirm';

// Regex patterns for MLB extraction
const MLB_PATTERNS = [
  /item_id[=:]?(MLB\d{8,})/i,
  /pdp_filters=item_id[=:]?(MLB\d{8,})/i,
  /\/(MLB\d{8,})/i,
  /[?&]id=(MLB\d{8,})/i,
  /(?<!MLBU?)(MLB\d{8,})/i,
];

function extractMlbId(input: string): string | null {
  if (!input?.trim()) return null;
  const trimmed = input.trim();
  
  for (const pattern of MLB_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
      if (/^MLB\d+$/.test(id)) {
        return id;
      }
    }
  }
  
  // Direct MLB check
  if (/^MLB\d{8,}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  
  return null;
}

export function UnifiedCloneModal({ open, onOpenChange }: UnifiedCloneModalProps) {
  const { activeAccount } = useActiveAccount();
  const queryClient = useQueryClient();
  
  const [step, setStep] = useState<ModalStep>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Step 1: Input
  const [inputValue, setInputValue] = useState('');
  
  // Step 2: Preview data
  const [preview, setPreview] = useState<ItemPreviewData | null>(null);
  
  // Step 3: Editable form + confirmation
  const [formData, setFormData] = useState<CloneFormData>({
    price: 0,
    quantity: 1,
    sku: '',
    listing_type: 'gold_special',
  });
  const [confirmText, setConfirmText] = useState('');
  
  const detectedId = useMemo(() => extractMlbId(inputValue), [inputValue]);
  
  const resetModal = useCallback(() => {
    setStep('input');
    setLoading(false);
    setError(null);
    setInputValue('');
    setPreview(null);
    setFormData({ price: 0, quantity: 1, sku: '', listing_type: 'gold_special' });
    setConfirmText('');
  }, []);
  
  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      resetModal();
    }
    onOpenChange(open);
  }, [onOpenChange, resetModal]);
  
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputValue(text);
      setError(null);
    } catch {
      toast.error('Não foi possível acessar a área de transferência');
    }
  };
  
  // Step 1 → Step 2: Fetch item data and detect origin
  const handleAnalyze = async () => {
    if (!detectedId) {
      setError('Não foi possível identificar o ID do anúncio. Cole um link ou ID válido (MLB...)');
      return;
    }
    
    if (!activeAccount?.sellerId) {
      setError('Selecione uma conta do Mercado Livre');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Get ML account for API calls
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) throw new Error('Não autenticado');
      
      const { data: mlAccount } = await supabase
        .from('ml_accounts')
        .select('access_token, ml_user_id')
        .eq('ml_user_id', String(activeAccount.sellerId))
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!mlAccount?.access_token) {
        throw new Error('Conta do ML não conectada ou token expirado');
      }
      
      // Fetch item data from ML API via edge function
      const { data, error: fetchError } = await supabase.functions.invoke('ad-item-snapshot', {
        body: { item_id: detectedId },
      });
      
      if (fetchError || !data?.success) {
        throw new Error(data?.message || fetchError?.message || 'Erro ao buscar dados do anúncio');
      }
      
      const itemData = data.item;
      
      // Detect clone mode (internal vs external)
      const itemSellerId = String(itemData.seller_id);
      const userSellerId = String(activeAccount.sellerId);
      const cloneMode: 'internal' | 'external' = itemSellerId === userSellerId ? 'internal' : 'external';
      
      // Detect catalog status
      const isCatalogSource = !!(
        itemData.catalog_product_id ||
        itemData.catalog_listing === true ||
        itemData.parent_item_id
      );
      const listingMode: 'catalog' | 'standard' = isCatalogSource ? 'catalog' : 'standard';
      
      const previewData: ItemPreviewData = {
        item_id: detectedId,
        title: itemData.title,
        price: itemData.price,
        available_quantity: itemData.available_quantity || 1,
        thumbnail: itemData.thumbnail || itemData.pictures?.[0]?.url,
        category_id: itemData.category_id,
        listing_type_id: itemData.listing_type_id || 'gold_special',
        seller_id: itemSellerId,
        is_catalog_source: isCatalogSource,
        catalog_product_id: itemData.catalog_product_id,
        clone_mode: cloneMode,
        listing_mode: listingMode,
      };
      
      setPreview(previewData);
      setFormData({
        price: itemData.price,
        quantity: itemData.available_quantity || 1,
        sku: '',
        listing_type: itemData.listing_type_id || 'gold_special',
      });
      setStep('preview');
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[UnifiedCloneModal] Analyze error:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  // Step 2 → Step 3: Move to confirmation
  const handleProceedToConfirm = () => {
    setConfirmText('');
    setStep('confirm');
  };
  
  // Step 3: Execute clone
  const handleExecuteClone = async () => {
    if (confirmText !== 'CLONAR') {
      setError('Digite CLONAR para confirmar');
      return;
    }
    
    if (!preview || !activeAccount?.sellerId) {
      setError('Dados incompletos');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) throw new Error('Não autenticado');
      
      // Get ml_account_id
      const { data: mlAccount } = await supabase
        .from('ml_accounts')
        .select('id')
        .eq('ml_user_id', String(activeAccount.sellerId))
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (!mlAccount?.id) {
        throw new Error('Conta do Mercado Livre não encontrada');
      }
      
      // Get workspace_id
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
      
      // Build checklist with all necessary data
      const checklist = {
        title: !preview.is_catalog_source,
        description: !preview.is_catalog_source,
        pictures: !preview.is_catalog_source,
        attributes: true,
        price: true,
        source: 'unified_clone',
        source_url: inputValue.trim(),
        clone_mode: preview.clone_mode,
        listing_mode: preview.listing_mode,
        override_price: formData.price !== preview.price ? formData.price : undefined,
        override_quantity: formData.quantity !== preview.available_quantity ? formData.quantity : undefined,
        override_sku: formData.sku || undefined,
        override_listing_type: formData.listing_type !== preview.listing_type_id ? formData.listing_type : undefined,
      };
      
      // Create action with status QUEUED (ready to execute)
      const { data: actionData, error: insertError } = await supabase
        .from('ad_lifecycle_actions')
        .insert({
          workspace_id: workspaceId,
          ml_account_id: mlAccount.id,
          item_id: preview.item_id,
          action_type: 'CLONE',
          action_status: 'QUEUED',
          reason: `CLONE_${preview.clone_mode.toUpperCase()}`,
          checklist: checklist as never,
          created_by: user.id,
        })
        .select()
        .single();
      
      if (insertError) {
        throw new Error(`Erro ao criar ação: ${insertError.message}`);
      }
      
      // Execute immediately
      const { data: execResult, error: execError } = await supabase.functions.invoke('ad-action-execute', {
        body: { action_id: actionData.id, confirm: true },
      });
      
      if (execError) {
        throw new Error(`Erro ao executar: ${execError.message}`);
      }
      
      if (!execResult?.success) {
        // Don't consume credit on validation errors
        const errorMsg = execResult?.result?.message || execResult?.result?.error || 'Falha na clonagem';
        const userGuidance = execResult?.result?.user_guidance;
        
        throw new Error(userGuidance ? `${errorMsg}\n\n${userGuidance}` : errorMsg);
      }
      
      // Success!
      toast.success('Anúncio clonado com sucesso!', {
        description: `Novo ID: ${execResult.result?.new_item_id}`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['ad-lifecycle-actions'] });
      handleClose(false);
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[UnifiedCloneModal] Execute error:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clonar anúncio (automático)
          </DialogTitle>
          <DialogDescription>
            O sistema identifica automaticamente se o anúncio é da sua conta ou de outra conta.
          </DialogDescription>
        </DialogHeader>
        
        {/* Step 1: Input */}
        {step === 'input' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clone-input">ID do anúncio ou URL do Mercado Livre</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="clone-input"
                    placeholder="https://www.mercadolivre.com.br/... ou MLB..."
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      setError(null);
                    }}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <Button variant="outline" onClick={handlePaste} type="button">
                  Colar
                </Button>
              </div>
              
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>
                </div>
              )}
              
              {inputValue && detectedId && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    ID detectado: <span className="font-mono font-medium">{detectedId}</span>
                  </p>
                </div>
              )}
              
              {inputValue && !detectedId && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <p className="text-sm text-warning">
                    Nenhum ID de anúncio (MLB) encontrado
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Cole o link de qualquer anúncio do Mercado Livre. O sistema detectará 
                automaticamente se é interno (sua conta) ou externo (outra conta), 
                e se pertence ao catálogo.
              </p>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleAnalyze} 
                disabled={loading || !detectedId}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  'Analisar anúncio'
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
        
        {/* Step 2: Preview */}
        {step === 'preview' && preview && (
          <div className="space-y-4">
            {/* Item Preview Card */}
            <div className="flex gap-4 p-4 rounded-lg border bg-muted/30">
              {preview.thumbnail && (
                <img 
                  src={preview.thumbnail} 
                  alt={preview.title}
                  className="w-20 h-20 object-cover rounded-md"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm line-clamp-2">{preview.title}</p>
                <p className="text-lg font-bold mt-1">
                  R$ {preview.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  ID: <span className="font-mono">{preview.item_id}</span>
                </p>
              </div>
            </div>
            
            {/* Detection Results */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-md border">
                <p className="text-xs text-muted-foreground mb-1">Origem detectada</p>
                <Badge variant={preview.clone_mode === 'internal' ? 'default' : 'secondary'}>
                  {preview.clone_mode === 'internal' ? 'Interno (sua conta)' : 'Externo (outra conta)'}
                </Badge>
              </div>
              <div className="p-3 rounded-md border">
                <p className="text-xs text-muted-foreground mb-1">Tipo</p>
                <Badge variant={preview.listing_mode === 'catalog' ? 'outline' : 'default'}>
                  {preview.listing_mode === 'catalog' ? 'Catálogo' : 'Não catálogo'}
                </Badge>
              </div>
            </div>
            
            {/* Catalog Warning */}
            {preview.is_catalog_source && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/30">
                <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-warning">
                  Anúncio de catálogo: título, fotos e descrição são gerenciados pelo 
                  Mercado Livre e não serão copiados.
                </p>
              </div>
            )}
            
            <Separator />
            
            {/* Editable Fields */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Ajustar antes de clonar (opcional)</p>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="clone-price" className="text-xs">Preço (R$)</Label>
                  <Input
                    id="clone-price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="clone-qty" className="text-xs">Quantidade</Label>
                  <Input
                    id="clone-qty"
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              </div>
              
              <div className="space-y-1">
                <Label htmlFor="clone-sku" className="text-xs">SKU (opcional)</Label>
                <Input
                  id="clone-sku"
                  placeholder="Código interno do produto"
                  value={formData.sku}
                  onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                />
              </div>
            </div>
            
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('input')}>
                Voltar
              </Button>
              <Button onClick={handleProceedToConfirm}>
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}
        
        {/* Step 3: Confirmation */}
        {step === 'confirm' && preview && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
              <p className="text-sm font-medium">Resumo da clonagem</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-muted-foreground">ID fonte:</div>
                <div className="font-mono">{preview.item_id}</div>
                <div className="text-muted-foreground">Origem:</div>
                <div>{preview.clone_mode === 'internal' ? 'Sua conta' : 'Conta externa'}</div>
                <div className="text-muted-foreground">Tipo:</div>
                <div>{preview.listing_mode === 'catalog' ? 'Catálogo' : 'Padrão'}</div>
                <div className="text-muted-foreground">Preço:</div>
                <div>R$ {formData.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div className="text-muted-foreground">Quantidade:</div>
                <div>{formData.quantity}</div>
              </div>
            </div>
            
            <Separator />
            
            {/* Confirmation Input */}
            <div className="space-y-2">
              <Label htmlFor="confirm-text" className="text-sm font-medium">
                Digite <span className="font-mono font-bold">CLONAR</span> para confirmar
              </Label>
              <Input
                id="confirm-text"
                placeholder="CLONAR"
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value.toUpperCase());
                  setError(null);
                }}
                className="text-center font-mono text-lg tracking-widest"
                autoFocus
              />
            </div>
            
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('preview')}>
                Voltar
              </Button>
              <Button 
                onClick={handleExecuteClone} 
                disabled={loading || confirmText !== 'CLONAR'}
                variant={confirmText === 'CLONAR' ? 'default' : 'secondary'}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Clonando...
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Executar Clonagem
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
