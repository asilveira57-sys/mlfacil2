// Aba de Referência - Captura de dados do anúncio
// Fluxo "Clonar como anúncio novo" v2 - ISOLADO

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, 
  Link, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  ImageIcon, 
  FileText, 
  Ruler,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { ReferenceSnapshot } from '../types';

interface ReferenceStepProps {
  sourceUrl: string;
  onSourceUrlChange: (url: string) => void;
  snapshot: ReferenceSnapshot | null;
  loading: boolean;
  error: string | null;
  userGuidance?: string;
  onFetch: () => void;
  onContinue: () => void;
}

export function ReferenceStep({
  sourceUrl,
  onSourceUrlChange,
  snapshot,
  loading,
  error,
  userGuidance,
  onFetch,
  onContinue,
}: ReferenceStepProps) {
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onSourceUrlChange(text);
    } catch {
      // Ignore paste errors
    }
  };
  
  const metadata = snapshot?.capture_metadata;
  
  // Validar se pode continuar
  const canContinue = snapshot && snapshot.pictures.length > 0;
  
  // Status de captura
  const picturesOk = metadata?.pictures_status === 'success';
  const picturesPartial = metadata?.pictures_status === 'partial';
  const descriptionOk = metadata?.description_status === 'success';
  const dimensionsOk = metadata?.dimensions_status === 'success';
  
  return (
    <div className="space-y-6">
      {/* Campo de URL */}
      <div className="space-y-2">
        <Label htmlFor="source-url" className="text-base font-medium">
          URL ou ID do anúncio de referência
        </Label>
        <p className="text-sm text-muted-foreground">
          Cole o link do Mercado Livre ou o ID do anúncio (MLB...) que será usado como base para criar um novo anúncio.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Input
              id="source-url"
              value={sourceUrl}
              onChange={(e) => onSourceUrlChange(e.target.value)}
              placeholder="https://produto.mercadolivre.com.br/MLB-... ou MLB1234567890"
              className="pl-10 w-full"
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
                  Capturando...
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
      
      {/* Erro */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium">{error}</p>
            {userGuidance && (
              <p className="mt-1 text-sm opacity-90">{userGuidance}</p>
            )}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Resultado da captura */}
      {snapshot && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
          {/* Preview do anúncio */}
          <div className="flex items-start gap-4">
            {snapshot.pictures[0]?.secure_url && (
              <img
                src={snapshot.pictures[0].secure_url}
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
                {snapshot.is_own_listing && (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Seu anúncio
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          {/* Status de captura detalhado */}
          <div className="text-sm space-y-2 pt-3 border-t">
            <p className="font-medium">Status da captura:</p>
            <div className="grid grid-cols-2 gap-2">
              {/* Fotos */}
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <span>Fotos:</span>
                {picturesOk ? (
                  <span className="text-primary flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {snapshot.pictures.length} capturadas
                  </span>
                ) : picturesPartial ? (
                  <span className="text-warning flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {snapshot.pictures.length} (parcial)
                  </span>
                ) : (
                  <span className="text-destructive flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Não capturadas
                  </span>
                )}
              </div>
              
              {/* Descrição */}
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>Descrição:</span>
                {descriptionOk ? (
                  <span className="text-primary flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Capturada
                  </span>
                ) : (
                  <span className="text-destructive flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Não capturada
                  </span>
                )}
              </div>
              
              {/* Dimensões */}
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <span>Dimensões:</span>
                {dimensionsOk ? (
                  <span className="text-primary flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Encontradas
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Não encontradas
                  </span>
                )}
              </div>
              
              {/* Atributos */}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Atributos:</span>
                <span>{metadata?.attributes_count || 0}</span>
              </div>
            </div>
            
            {/* Identificadores encontrados */}
            {Object.keys(snapshot.identifiers).length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground">
                  Identificadores encontrados (não serão copiados):
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {snapshot.identifiers.gtin && (
                    <Badge variant="outline" className="text-xs">GTIN: {snapshot.identifiers.gtin}</Badge>
                  )}
                  {snapshot.identifiers.ean && snapshot.identifiers.ean !== snapshot.identifiers.gtin && (
                    <Badge variant="outline" className="text-xs">EAN: {snapshot.identifiers.ean}</Badge>
                  )}
                  {snapshot.identifiers.sku && (
                    <Badge variant="outline" className="text-xs">SKU: {snapshot.identifiers.sku}</Badge>
                  )}
                </div>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground pt-1">
              ID: {snapshot.item_id} | Categoria: {snapshot.category_id}
            </p>
          </div>
          
          {/* Warnings */}
          {metadata?.warnings && metadata.warnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <ul className="text-sm list-disc list-inside space-y-1">
                  {metadata.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          {/* Aviso de descrição não capturada */}
          {!descriptionOk && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Descrição não capturada.</strong> Você poderá preenchê-la na próxima etapa.
              </AlertDescription>
            </Alert>
          )}
          
          {/* Aviso de fotos insuficientes */}
          {snapshot.pictures.length < 2 && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Fotos insuficientes.</strong> São necessárias pelo menos 2 fotos para criar o anúncio.
                {snapshot.pictures.length === 1 && ' Adicione mais fotos na próxima etapa.'}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Sucesso */}
          {canContinue && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" />
              <span>Dados capturados com sucesso</span>
            </div>
          )}
        </div>
      )}
      
      {/* Botão continuar */}
      {snapshot && (
        <div className="flex justify-end">
          <Button 
            onClick={onContinue}
            disabled={!canContinue}
          >
            Continuar para edição
          </Button>
        </div>
      )}
    </div>
  );
}
