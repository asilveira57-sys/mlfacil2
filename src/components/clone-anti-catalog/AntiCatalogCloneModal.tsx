// Componente principal do fluxo "Clonar como Anúncio Novo (Anti-Catálogo v3)"
// COMPLETAMENTE ISOLADO de qualquer outro fluxo de clonagem

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { 
  ShieldCheck, 
  Loader2, 
  FileText, 
  Image, 
  Tags, 
  Package, 
  CheckCircle2,
  ExternalLink,
  Copy,
  AlertTriangle
} from 'lucide-react';

import { useAntiCatalogCapture } from './hooks/useAntiCatalogCapture';
import { useAntiCatalogCreate } from './hooks/useAntiCatalogCreate';
import { ContentStep } from './steps/ContentStep';
import { PhotosStep } from './steps/PhotosStep';
import { AttributesStep } from './steps/AttributesStep';
import { LogisticsStep } from './steps/LogisticsStep';
import { ReviewStep } from './steps/ReviewStep';
import { 
  AntiCatalogStep, 
  SourceSnapshot, 
  EditablePayload,
  CreateListingResult
} from './types';

interface AntiCatalogCloneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mlAccountId: string;
  initialItemId?: string;
}

export function AntiCatalogCloneModal({
  open,
  onOpenChange,
  mlAccountId,
  initialItemId,
}: AntiCatalogCloneModalProps) {
  const { toast } = useToast();
  
  // Estado do fluxo
  const [step, setStep] = useState<'input' | 'edit' | 'success' | 'error'>('input');
  const [currentTab, setCurrentTab] = useState<AntiCatalogStep>('content');
  const [inputValue, setInputValue] = useState(initialItemId || '');
  
  // Dados capturados
  const [snapshot, setSnapshot] = useState<SourceSnapshot | null>(null);
  const [payload, setPayload] = useState<EditablePayload | null>(null);
  
  // Resultado da criação
  const [result, setResult] = useState<CreateListingResult | null>(null);
  
  // Hooks isolados
  const { capture, isCapturing, error: captureError } = useAntiCatalogCapture();
  const { create, isCreating, error: createError } = useAntiCatalogCreate();

  // Handler para buscar item de origem
  const handleCapture = useCallback(async () => {
    if (!inputValue.trim()) {
      toast({
        title: 'ID obrigatório',
        description: 'Informe o ID ou URL do anúncio de referência.',
        variant: 'destructive',
      });
      return;
    }

    const result = await capture(inputValue, mlAccountId);
    
    if (result.success && result.snapshot && result.initialPayload) {
      setSnapshot(result.snapshot);
      setPayload(result.initialPayload);
      setStep('edit');
      setCurrentTab('content');
    } else {
      toast({
        title: 'Erro ao buscar item',
        description: result.error || 'Não foi possível carregar o anúncio.',
        variant: 'destructive',
      });
    }
  }, [inputValue, mlAccountId, capture, toast]);

  // Handler para atualizar payload
  const handlePayloadChange = useCallback((updates: Partial<EditablePayload>) => {
    setPayload(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  // Handler para criar anúncio
  const handleCreate = useCallback(async () => {
    if (!payload || !snapshot) return;

    const createResult = await create(payload, snapshot, mlAccountId);
    setResult(createResult);

    if (createResult.success) {
      setStep('success');
      toast({
        title: 'Anúncio criado com sucesso!',
        description: `ID: ${createResult.item_id}`,
      });
    } else {
      setStep('error');
      toast({
        title: 'Erro ao criar anúncio',
        description: createResult.error || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }, [payload, snapshot, mlAccountId, create, toast]);

  // Reset ao fechar
  const handleClose = useCallback(() => {
    setStep('input');
    setCurrentTab('content');
    setInputValue(initialItemId || '');
    setSnapshot(null);
    setPayload(null);
    setResult(null);
    onOpenChange(false);
  }, [initialItemId, onOpenChange]);

  // Tentar novamente após erro
  const handleRetry = useCallback(() => {
    setStep('edit');
    setCurrentTab('review');
    setResult(null);
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Clonar como Anúncio Novo (Anti-Catálogo)
          </DialogTitle>
        </DialogHeader>

        {/* Step: Input - Informar ID/URL */}
        {step === 'input' && (
          <div className="space-y-4">
            <Alert className="border-primary/50 bg-primary/5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <AlertDescription>
                Este fluxo cria um <strong>anúncio normal</strong>, fora de catálogo, 
                com título e fotos totalmente editáveis.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="source-input">ID ou URL do anúncio de referência</Label>
              <div className="flex gap-2">
                <Input
                  id="source-input"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="MLB123456789 ou cole a URL completa"
                  disabled={isCapturing}
                />
                <Button onClick={handleCapture} disabled={isCapturing}>
                  {isCapturing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Buscar'
                  )}
                </Button>
              </div>
              {captureError && (
                <p className="text-sm text-destructive">{captureError}</p>
              )}
            </div>
          </div>
        )}

        {/* Step: Edit - Abas de edição */}
        {step === 'edit' && snapshot && payload && (
          <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v as AntiCatalogStep)}>
            <TabsList className="grid grid-cols-5 mb-4">
              <TabsTrigger value="content" className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                <span className="hidden sm:inline">Conteúdo</span>
              </TabsTrigger>
              <TabsTrigger value="photos" className="flex items-center gap-1">
                <Image className="h-3 w-3" />
                <span className="hidden sm:inline">Fotos</span>
              </TabsTrigger>
              <TabsTrigger value="attributes" className="flex items-center gap-1">
                <Tags className="h-3 w-3" />
                <span className="hidden sm:inline">Atributos</span>
              </TabsTrigger>
              <TabsTrigger value="logistics" className="flex items-center gap-1">
                <Package className="h-3 w-3" />
                <span className="hidden sm:inline">Logística</span>
              </TabsTrigger>
              <TabsTrigger value="review" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                <span className="hidden sm:inline">Revisar</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="content">
              <ContentStep payload={payload} onPayloadChange={handlePayloadChange} />
            </TabsContent>

            <TabsContent value="photos">
              <PhotosStep payload={payload} onPayloadChange={handlePayloadChange} />
            </TabsContent>

            <TabsContent value="attributes">
              <AttributesStep payload={payload} onPayloadChange={handlePayloadChange} />
            </TabsContent>

            <TabsContent value="logistics">
              <LogisticsStep payload={payload} onPayloadChange={handlePayloadChange} />
            </TabsContent>

            <TabsContent value="review">
              <ReviewStep 
                payload={payload} 
                snapshot={snapshot}
                isCreating={isCreating}
                onConfirm={handleCreate}
              />
            </TabsContent>
          </Tabs>
        )}

        {/* Step: Success */}
        {step === 'success' && result?.item_id && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
            <h3 className="text-xl font-semibold">Anúncio criado com sucesso!</h3>
            <p className="text-muted-foreground">
              Seu anúncio foi criado como <strong>anúncio normal</strong>, fora de catálogo.
            </p>
            
            <div className="flex items-center justify-center gap-2 p-3 bg-muted rounded-lg">
              <span className="font-mono font-medium">{result.item_id}</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(result.item_id!);
                  toast({ title: 'ID copiado!' });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            {result.permalink && (
              <Button asChild variant="outline">
                <a href={result.permalink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ver no Mercado Livre
                </a>
              </Button>
            )}

            <Button onClick={handleClose} className="w-full">
              Fechar
            </Button>
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && result && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
              <h3 className="text-xl font-semibold">Erro ao criar anúncio</h3>
            </div>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {result.error || 'Erro desconhecido'}
              </AlertDescription>
            </Alert>

            {result.diagnostic && (
              <div className="p-3 bg-muted rounded-lg text-xs font-mono">
                <p><strong>Diagnóstico:</strong></p>
                <p>Status API: {result.api_status || '-'}</p>
                <p>Código: {result.error_code || '-'}</p>
                {result.retry_info?.attempted && (
                  <p>Retry: {result.retry_info.field_added || 'tentado'}</p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={handleRetry} className="flex-1">
                Tentar novamente
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
