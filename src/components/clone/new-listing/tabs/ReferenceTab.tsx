import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Link, Search, Package, AlertCircle, CheckCircle2, Info } from 'lucide-react';
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
  
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="source-url" className="text-base font-medium">
          URL do anúncio de referência
        </Label>
        <p className="text-sm text-muted-foreground">
          Cole o link do Mercado Livre ou o ID do anúncio (MLB...) que será usado como base
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="source-url"
              value={sourceUrl}
              onChange={(e) => onSourceUrlChange(e.target.value)}
              placeholder="https://produto.mercadolivre.com.br/MLB-... ou MLB1234567890"
              className="pl-10 w-full"
            />
          </div>
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
                Buscar dados
              </>
            )}
          </Button>
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
                className="w-24 h-24 object-cover rounded-md border"
              />
            )}
            <div className="flex-1 space-y-2">
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
              <div className="text-xs text-muted-foreground space-y-1">
                <p>ID: {snapshot.item_id}</p>
                <p>Categoria: {snapshot.category_id}</p>
                <p>Fotos: {snapshot.pictures?.length || 0}</p>
                {snapshot.description && (
                  <p className="text-primary">✓ Descrição capturada</p>
                )}
                {snapshot.variations && snapshot.variations.length > 0 && (
                  <p>Variações: {snapshot.variations.length}</p>
                )}
              </div>
            </div>
          </div>
          
          {snapshot.is_catalog_source && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Este anúncio é de catálogo. O novo anúncio será criado como <strong>anúncio normal</strong>, 
                permitindo editar livremente título, descrição e fotos. Campos como EAN/GTIN não serão 
                copiados para evitar vínculo automático com o catálogo.
              </AlertDescription>
            </Alert>
          )}
          
          {!snapshot.description && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                A descrição do anúncio não foi capturada. Você poderá preenchê-la na próxima etapa.
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
          <Button onClick={onContinue}>
            Continuar para edição
          </Button>
        </div>
      )}
    </div>
  );
}
