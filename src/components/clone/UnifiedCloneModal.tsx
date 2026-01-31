import { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Loader2, Link, AlertCircle, CheckCircle2, Info, Copy, 
  Package, Scale, Pause, Play
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useQueryClient } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface UnifiedCloneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ItemPreviewData {
  item_id: string;
  title: string;
  description?: string;
  price: number;
  available_quantity: number;
  thumbnail?: string;
  pictures?: Array<{ url?: string; secure_url?: string }>;
  category_id?: string;
  listing_type_id?: string;
  seller_id: string;
  is_catalog_source: boolean;
  catalog_product_id?: string;
  clone_mode: 'internal' | 'external';
  listing_mode: 'catalog' | 'standard';
  // Seller package dimensions from source item
  seller_package_height?: number;
  seller_package_width?: number;
  seller_package_length?: number;
  seller_package_weight?: number;
}

interface CloneFormData {
  title: string;
  description: string;
  price: number;
  quantity: number;
  sku: string;
  barcode: string;
  listing_type: 'gold_special' | 'gold_pro';
  // Seller package dimensions - OBRIGATÓRIO
  seller_package_height: number;
  seller_package_width: number;
  seller_package_length: number;
  seller_package_weight: number;
  // Status
  create_paused: boolean;
}

type ModalStep = 'input' | 'preview' | 'confirm';

// ============================================================================
// REGEX PATTERNS - Extração de ID do Mercado Livre
// REGRA OFICIAL: Prioriza MLB sobre MLBU
// ============================================================================
const MLB_PATTERNS = [
  /item_id[=:]?(MLB\d{8,})/i,
  /pdp_filters=item_id[=:]?(MLB\d{8,})/i,
  /\/(MLB\d{8,})/i,
  /[?&]id=(MLB\d{8,})/i,
  /(?<!MLBU?)(MLB\d{8,})/i,
];

// MLBU patterns - fallback quando não encontra MLB
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
  
  // Prioridade 1: Tentar extrair MLB direto
  for (const pattern of MLB_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const id = (match[1] || match[0]).replace(/-/g, '').toUpperCase();
      if (/^MLB\d+$/.test(id)) {
        return { id, type: 'MLB' };
      }
    }
  }
  
  // Direct MLB check
  if (/^MLB\d{8,}$/i.test(trimmed)) {
    return { id: trimmed.toUpperCase(), type: 'MLB' };
  }
  
  // Prioridade 2: Tentar extrair MLBU (fallback)
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

// Extrair atributos de dimensões do item
function extractPackageDimensions(attributes: any[]): {
  height?: number;
  width?: number;
  length?: number;
  weight?: number;
} {
  const result: { height?: number; width?: number; length?: number; weight?: number } = {};
  
  if (!attributes || !Array.isArray(attributes)) return result;
  
  for (const attr of attributes) {
    const id = attr.id?.toUpperCase();
    const value = attr.value_name ? parseFloat(attr.value_name) : attr.value_struct?.number;
    
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
  
  return result;
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
    title: '',
    description: '',
    price: 0,
    quantity: 1,
    sku: '',
    barcode: '',
    listing_type: 'gold_special',
    seller_package_height: 0,
    seller_package_width: 0,
    seller_package_length: 0,
    seller_package_weight: 0,
    create_paused: true, // Default: criar pausado
  });
  const [confirmText, setConfirmText] = useState('');
  
  const detectedId = useMemo(() => extractMeliId(inputValue), [inputValue]);
  
  // Validar dimensões
  const dimensionsValid = useMemo(() => {
    return (
      formData.seller_package_height > 0 &&
      formData.seller_package_width > 0 &&
      formData.seller_package_length > 0 &&
      formData.seller_package_weight > 0
    );
  }, [formData]);
  
  // Validar fotos
  const hasPictures = useMemo(() => {
    return preview?.pictures && preview.pictures.length > 0;
  }, [preview]);
  
  const resetModal = useCallback(() => {
    setStep('input');
    setLoading(false);
    setError(null);
    setInputValue('');
    setPreview(null);
    setFormData({
      title: '',
      description: '',
      price: 0,
      quantity: 1,
      sku: '',
      barcode: '',
      listing_type: 'gold_special',
      seller_package_height: 0,
      seller_package_width: 0,
      seller_package_length: 0,
      seller_package_weight: 0,
      create_paused: true,
    });
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
      
      // Fetch item data from ML API via edge function
      // Passar o ID extraído e informar se é MLBU para resolução no backend
      const { data, error: fetchError } = await supabase.functions.invoke('ad-item-snapshot', {
        body: { 
          item_id: detectedId.id, 
          id_type: detectedId.type,
          seller_id: activeAccount.sellerId,
        },
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
      
      // Extrair dimensões do item fonte
      const dimensions = extractPackageDimensions(itemData.attributes);
      
      const previewData: ItemPreviewData = {
        item_id: data.resolved_item_id || itemData.id || detectedId.id,
        title: itemData.title,
        description: itemData.description,
        price: itemData.price,
        available_quantity: itemData.available_quantity || 1,
        thumbnail: itemData.thumbnail || itemData.pictures?.[0]?.url,
        pictures: itemData.pictures,
        category_id: itemData.category_id,
        listing_type_id: itemData.listing_type_id || 'gold_special',
        seller_id: itemSellerId,
        is_catalog_source: isCatalogSource,
        catalog_product_id: itemData.catalog_product_id,
        clone_mode: cloneMode,
        listing_mode: listingMode,
        seller_package_height: dimensions.height,
        seller_package_width: dimensions.width,
        seller_package_length: dimensions.length,
        seller_package_weight: dimensions.weight,
      };
      
      setPreview(previewData);
      
      // Determinar listing_type inicial - apenas gold_special ou gold_pro
      let initialListingType: 'gold_special' | 'gold_pro' = 'gold_special';
      if (itemData.listing_type_id === 'gold_pro') {
        initialListingType = 'gold_pro';
      }
      
      setFormData({
        title: itemData.title || '',
        description: itemData.description || '',
        price: itemData.price,
        quantity: itemData.available_quantity || 1,
        sku: '',
        barcode: '',
        listing_type: initialListingType,
        seller_package_height: dimensions.height || 0,
        seller_package_width: dimensions.width || 0,
        seller_package_length: dimensions.length || 0,
        seller_package_weight: dimensions.weight || 0,
        create_paused: true, // Default: criar pausado
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
    // Validar dimensões obrigatórias
    if (!dimensionsValid) {
      setError('Preencha todas as dimensões do pacote (altura, largura, comprimento e peso) antes de continuar.');
      return;
    }
    
    if (!formData.title.trim()) {
      setError('O título é obrigatório.');
      return;
    }
    
    if (!hasPictures) {
      setError('É necessário pelo menos 1 foto para clonar o anúncio.');
      return;
    }
    
    setError(null);
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
      
      // Build checklist with ALL necessary data
      // IMPORTANTE: Sempre criar como "normal" (não catálogo)
      const checklist = {
        // SEMPRE criar como anúncio normal (não catálogo)
        create_as_normal: true, // Flag para o backend
        
        // Campos sempre editáveis no clone normal
        title: true,
        description: true,
        pictures: true,
        attributes: true,
        price: true,
        
        source: 'unified_clone_v3',
        source_url: inputValue.trim(),
        clone_mode: preview.clone_mode,
        listing_mode: preview.listing_mode,
        is_catalog_source: preview.is_catalog_source,
        
        // Overrides do usuário
        override_title: formData.title !== preview.title ? formData.title : undefined,
        override_description: formData.description !== preview.description ? formData.description : undefined,
        override_price: formData.price !== preview.price ? formData.price : undefined,
        override_quantity: formData.quantity !== preview.available_quantity ? formData.quantity : undefined,
        override_sku: formData.sku || undefined,
        override_barcode: formData.barcode || undefined,
        override_listing_type: formData.listing_type,
        
        // Dimensões do pacote (OBRIGATÓRIO)
        seller_package_height: formData.seller_package_height,
        seller_package_width: formData.seller_package_width,
        seller_package_length: formData.seller_package_length,
        seller_package_weight: formData.seller_package_weight,
        
        // Status: Pausado ou Ativo
        create_paused: formData.create_paused,
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
          reason: `CLONE_${preview.clone_mode.toUpperCase()}_NORMAL`,
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
      const statusMsg = formData.create_paused ? '(pausado)' : '(ativo)';
      toast.success('Anúncio clonado com sucesso!', {
        description: `Novo ID: ${execResult.result?.new_item_id} ${statusMsg}`,
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
  
  const listingTypeLabel = formData.listing_type === 'gold_pro' ? 'Premium' : 'Clássico';
  const statusLabel = formData.create_paused ? 'Pausado' : 'Ativo';
  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clonar anúncio (automático)
          </DialogTitle>
          <DialogDescription>
            O sistema identifica automaticamente se o anúncio é da sua conta ou de outra conta.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="flex-1 px-6">
          <div className="pb-4">
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
                        ID detectado: <span className="font-mono font-medium">{detectedId.id}</span>
                        {detectedId.type === 'MLBU' && (
                          <span className="ml-2 text-xs text-warning">(catálogo - será resolvido)</span>
                        )}
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
                    Cole o link de qualquer anúncio do Mercado Livre (incluindo links de catálogo /up/MLBU...). 
                    O sistema detectará automaticamente se é interno (sua conta) ou externo (outra conta).
                  </p>
                </div>
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
                    <p className="text-xs text-muted-foreground mb-1">Tipo do anúncio fonte</p>
                    <Badge variant={preview.listing_mode === 'catalog' ? 'outline' : 'default'}>
                      {preview.listing_mode === 'catalog' ? 'Catálogo' : 'Normal'}
                    </Badge>
                  </div>
                </div>
                
                {/* Catalog Alert - SEMPRE criar como normal */}
                {preview.is_catalog_source && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-primary/10 border border-primary/30">
                    <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="text-xs text-primary">
                      <p className="font-medium">Anúncio de catálogo detectado</p>
                      <p className="mt-1">
                        Por padrão, o clone será criado como <strong>anúncio normal</strong> (não catálogo) 
                        para permitir edição de título, fotos e descrição. Você pode vincular ao catálogo depois, se desejar.
                      </p>
                    </div>
                  </div>
                )}
                
                <Separator />
                
                {/* Editable Fields - SEMPRE editáveis (clone como normal) */}
                <div className="space-y-4">
                  <p className="text-sm font-medium">Dados do novo anúncio</p>
                  
                  {/* TÍTULO - SEMPRE EDITÁVEL */}
                  <div className="space-y-1">
                    <Label htmlFor="clone-title" className="text-xs">
                      Título <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="clone-title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Título do anúncio"
                      maxLength={60}
                    />
                    <p className="text-xs text-muted-foreground">{formData.title.length}/60 caracteres</p>
                  </div>
                  
                  {/* DESCRIÇÃO - SEMPRE EDITÁVEL (clone normal) */}
                  <div className="space-y-1">
                    <Label htmlFor="clone-description" className="text-xs">Descrição</Label>
                    <Textarea
                      id="clone-description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descrição do produto..."
                      rows={3}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="clone-price" className="text-xs">
                        Preço (R$) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="clone-price"
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="clone-qty" className="text-xs">
                        Quantidade <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="clone-qty"
                        type="number"
                        min="1"
                        value={formData.quantity}
                        onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="clone-sku" className="text-xs">SKU (opcional)</Label>
                      <Input
                        id="clone-sku"
                        placeholder="Código interno"
                        value={formData.sku}
                        onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="clone-barcode" className="text-xs">Código de barras (opcional)</Label>
                      <Input
                        id="clone-barcode"
                        placeholder="EAN/GTIN"
                        value={formData.barcode}
                        onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                {/* DIMENSÕES DO PACOTE - OBRIGATÓRIO */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">
                      Dimensões do pacote <span className="text-destructive">*</span>
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="package-height" className="text-xs">Altura (cm)</Label>
                      <Input
                        id="package-height"
                        type="number"
                        step="0.1"
                        min="0"
                        value={formData.seller_package_height || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, seller_package_height: parseFloat(e.target.value) || 0 }))}
                        placeholder="Ex: 10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="package-width" className="text-xs">Largura (cm)</Label>
                      <Input
                        id="package-width"
                        type="number"
                        step="0.1"
                        min="0"
                        value={formData.seller_package_width || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, seller_package_width: parseFloat(e.target.value) || 0 }))}
                        placeholder="Ex: 15"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="package-length" className="text-xs">Comprimento (cm)</Label>
                      <Input
                        id="package-length"
                        type="number"
                        step="0.1"
                        min="0"
                        value={formData.seller_package_length || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, seller_package_length: parseFloat(e.target.value) || 0 }))}
                        placeholder="Ex: 20"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="package-weight" className="text-xs">
                        <div className="flex items-center gap-1">
                          <Scale className="h-3 w-3" />
                          Peso (g)
                        </div>
                      </Label>
                      <Input
                        id="package-weight"
                        type="number"
                        step="1"
                        min="0"
                        value={formData.seller_package_weight || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, seller_package_weight: parseFloat(e.target.value) || 0 }))}
                        placeholder="Ex: 500"
                      />
                    </div>
                  </div>
                  
                  {!dimensionsValid && (
                    <p className="text-xs text-warning">
                      Preencha todas as dimensões para evitar erros de validação do Mercado Livre.
                    </p>
                  )}
                </div>
                
                <Separator />
                
                {/* Opções de publicação */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Opções de publicação</p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Tipo de anúncio - APENAS Clássico ou Premium */}
                    <div className="space-y-1">
                      <Label htmlFor="clone-listing-type" className="text-xs">Tipo de anúncio</Label>
                      <Select
                        value={formData.listing_type}
                        onValueChange={(value: 'gold_special' | 'gold_pro') => 
                          setFormData(prev => ({ ...prev, listing_type: value }))
                        }
                      >
                        <SelectTrigger id="clone-listing-type">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gold_special">Clássico</SelectItem>
                          <SelectItem value="gold_pro">Premium</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Status do anúncio - Ativo ou Pausado */}
                    <div className="space-y-1">
                      <Label htmlFor="clone-status" className="text-xs">Status na criação</Label>
                      <Select
                        value={formData.create_paused ? 'paused' : 'active'}
                        onValueChange={(value: string) => 
                          setFormData(prev => ({ ...prev, create_paused: value === 'paused' }))
                        }
                      >
                        <SelectTrigger id="clone-status">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paused">
                            <div className="flex items-center gap-2">
                              <Pause className="h-3 w-3" />
                              Pausado
                            </div>
                          </SelectItem>
                          <SelectItem value="active">
                            <div className="flex items-center gap-2">
                              <Play className="h-3 w-3" />
                              Ativo
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Step 3: Confirmation */}
            {step === 'confirm' && preview && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                  <p className="text-sm font-medium">Resumo da clonagem</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">ID fonte:</div>
                    <div className="font-mono text-xs">{preview.item_id}</div>
                    <div className="text-muted-foreground">Origem:</div>
                    <div>{preview.clone_mode === 'internal' ? 'Sua conta' : 'Conta externa'}</div>
                    <div className="text-muted-foreground">Tipo de criação:</div>
                    <div>
                      <Badge variant="default" className="text-xs">Normal (não catálogo)</Badge>
                    </div>
                    <div className="text-muted-foreground">Modalidade:</div>
                    <div>{listingTypeLabel}</div>
                    <div className="text-muted-foreground">Status:</div>
                    <div className="flex items-center gap-1">
                      {formData.create_paused ? (
                        <><Pause className="h-3 w-3" /> {statusLabel}</>
                      ) : (
                        <><Play className="h-3 w-3" /> {statusLabel}</>
                      )}
                    </div>
                    <div className="text-muted-foreground">Preço:</div>
                    <div>R$ {formData.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div className="text-muted-foreground">Quantidade:</div>
                    <div>{formData.quantity}</div>
                  </div>
                  
                  <Separator className="my-2" />
                  
                  <div className="text-sm">
                    <div className="text-muted-foreground mb-1">Título final:</div>
                    <div className="font-medium text-xs">{formData.title}</div>
                  </div>
                  
                  <Separator className="my-2" />
                  
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div className="text-center p-2 rounded bg-muted">
                      <div className="text-muted-foreground">Altura</div>
                      <div className="font-medium">{formData.seller_package_height} cm</div>
                    </div>
                    <div className="text-center p-2 rounded bg-muted">
                      <div className="text-muted-foreground">Largura</div>
                      <div className="font-medium">{formData.seller_package_width} cm</div>
                    </div>
                    <div className="text-center p-2 rounded bg-muted">
                      <div className="text-muted-foreground">Compr.</div>
                      <div className="font-medium">{formData.seller_package_length} cm</div>
                    </div>
                    <div className="text-center p-2 rounded bg-muted">
                      <div className="text-muted-foreground">Peso</div>
                      <div className="font-medium">{formData.seller_package_weight} g</div>
                    </div>
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
              </div>
            )}
          </div>
        </ScrollArea>
        
        {/* Fixed Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2 bg-background">
          {step === 'input' && (
            <>
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
            </>
          )}
          
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('input')}>
                Voltar
              </Button>
              <Button onClick={handleProceedToConfirm} disabled={!dimensionsValid || !formData.title.trim() || !hasPictures}>
                Continuar
              </Button>
            </>
          )}
          
          {step === 'confirm' && (
            <>
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
