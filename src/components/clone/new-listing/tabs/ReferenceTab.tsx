import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Link, Search, Package, AlertCircle, CheckCircle2, Info, ImageIcon, FileText, Ruler } from 'lucide-react';
import { RawSnapshot } from '../types';

interface ReferenceTabProps {
  sourceUrl: string;
  onSourceUrlChange: (url: string) => void;
  snapshot: RawSnapshot | null;
  loading: boolean;
  error: string | null;
  onFetch: () => void;
  onContinue: () => void;
}

export function ReferenceTab({
  sourceUrl,
  onSourceUrlChange,
  snapshot,
  loading,
  error,
  onFetch,
  onContinue,
}: ReferenceTabProps) {
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onSourceUrlChange(text);
    } catch {
      // Ignore paste errors
    }
  };
  
  const captureLog = snapshot?.capture_log;
  
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="source-url" className="text-base font-medium">
          URL do anúncio de referência
        </Label>
        <p className="text-sm text-muted-foreground">
          Cole o link do Mercado Livre ou o ID do anúncio (MLB...) que será usado como base
        </p>
        {/* CORREÇÃO 8: Campo de URL com largura total */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Input
              id="source-url"
              value={sourceUrl}
              onChange={(e) => onSourceUrlChange(e.target.value)}
              placeholder="https://produto.mercadolivre.com.br/MLB-... ou MLB1234567890"
              className="pl-10 w-full truncate"
            />
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              onClick={handlePaste}
              disabled={loading}
            >
              Colar
            </Button>
            <Button
              onClick={onFetch}
              disabled={loading || !sourceUrl.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Buscando...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Buscar
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {snapshot && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          <div className="flex items-start gap-4">
            {snapshot.thumbnail && (
              <img
                src={snapshot.thumbnail}
                alt={snapshot.title}
                className="w-24 h-24 object-cover rounded-md border flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0 space-y-2">
              <h4 className="font-medium line-clamp-2">{snapshot.title}</h4>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  R$ {snapshot.price?.toFixed(2)}
                </Badge>
                <Badge variant="outline">
                  {snapshot.available_quantity} disponível(is)
                </Badge>
                <Badge variant="outline">
                  {snapshot.condition === 'new' ? 'Novo' : 'Usado'}
                </Badge>
                {snapshot.is_catalog_source && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Origem: Catálogo
                  </Badge>
                )}
              </div>
              
              {/* CORREÇÃO 7: Detalhes da captura */}
              <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                <p className="font-medium text-foreground">Dados capturados:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <p className="flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" />
                    Fotos: {snapshot.pictures?.length || 0}
                    {captureLog?.pictures_source === 'api_thumbnail_fallback' && (
                      <span className="text-warning"> (thumbnail)</span>
                    )}
                  </p>
                  <p className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Descrição: {snapshot.description ? (
                      <span className="text-primary">✓ Capturada</span>
                    ) : (
                      <span className="text-destructive">✗ Não capturada</span>
                    )}
                  </p>
                  <p className="flex items-center gap-1">
                    <Ruler className="h-3 w-3" />
                    Dimensões: {captureLog?.dimensions_captured ? (
                      <span className="text-primary">✓ Capturadas</span>
                    ) : (
                      <span className="text-muted-foreground">Não encontradas</span>
                    )}
                  </p>
                  <p>Atributos: {snapshot.attributes?.length || 0}</p>
                </div>
                
                {/* Identificadores capturados */}
                {(snapshot.captured_gtin || snapshot.captured_ean || snapshot.captured_sku) && (
                  <div className="pt-1">
                    <p className="font-medium text-foreground">Identificadores encontrados:</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {snapshot.captured_gtin && (
                        <Badge variant="outline" className="text-xs">
                          GTIN: {snapshot.captured_gtin}
                        </Badge>
                      )}
                      {snapshot.captured_ean && snapshot.captured_ean !== snapshot.captured_gtin && (
                        <Badge variant="outline" className="text-xs">
                          EAN: {snapshot.captured_ean}
                        </Badge>
                      )}
                      {snapshot.captured_sku && (
                        <Badge variant="outline" className="text-xs">
                          SKU: {snapshot.captured_sku}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                
                <p className="text-xs pt-1">
                  ID: {snapshot.item_id} | Categoria: {snapshot.category_id}
                </p>
              </div>
            </div>
          </div>
          
          {snapshot.is_catalog_source && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Este anúncio é de catálogo. O novo anúncio será criado como <strong>anúncio normal</strong>, 
                permitindo editar livremente título, descrição e fotos. Campos como EAN/GTIN não serão 
                copiados por padrão (você pode ativar na aba de Logística).
              </AlertDescription>
            </Alert>
          )}
          
          {/* CORREÇÃO 2: Aviso de descrição não capturada */}
          {!snapshot.description && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Descrição não capturada automaticamente.</strong> Você poderá preenchê-la na próxima etapa.
              </AlertDescription>
            </Alert>
          )}
          
          {/* Aviso de fotos insuficientes */}
          {snapshot.pictures?.length === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Nenhuma foto capturada.</strong> É necessário pelo menos 1 foto para publicar.
              </AlertDescription>
            </Alert>
          )}
          
          {/* Erros de captura */}
          {captureLog?.errors && captureLog.errors.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium">Avisos durante a captura:</p>
                <ul className="text-xs mt-1 list-disc list-inside">
                  {captureLog.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="flex items-center gap-2 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" />
            <span>Dados capturados com sucesso</span>
          </div>
        </div>
      )}
      
      {snapshot && (
        <div className="flex justify-end">
          <Button 
            onClick={onContinue}
            disabled={snapshot.pictures?.length === 0}
          >
            Continuar para edição
          </Button>
        </div>
      )}
    </div>
  );
}
