// Aba de Identificadores - Aviso anti-catálogo COM checkboxes de controle
// Fluxo "Clonar como anúncio novo" v2 - ISOLADO

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Barcode, 
  CheckCircle2, 
  XCircle, 
  Info,
  AlertTriangle 
} from 'lucide-react';
import { ReferenceSnapshot, FinalListingPayload, GTIN_IDENTIFIERS, SKU_IDENTIFIERS } from '../types';

interface IdentifiersStepProps {
  snapshot: ReferenceSnapshot;
  payload: FinalListingPayload;
  onPayloadChange: (updates: Partial<FinalListingPayload>) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function IdentifiersStep({
  snapshot,
  payload,
  onPayloadChange,
  onBack,
  onContinue,
}: IdentifiersStepProps) {
  // Separar identificadores em categorias
  const gtinIdentifiers = [
    { key: 'gtin', label: 'GTIN', value: snapshot.identifiers.gtin },
    { key: 'ean', label: 'EAN', value: snapshot.identifiers.ean },
    { key: 'upc', label: 'UPC', value: snapshot.identifiers.upc },
    { key: 'isbn', label: 'ISBN', value: snapshot.identifiers.isbn },
  ].filter(id => id.value);
  
  const skuIdentifiers = [
    { key: 'sku', label: 'SKU', value: snapshot.identifiers.sku },
  ].filter(id => id.value);
  
  const otherIdentifiers = [
    { key: 'mpn', label: 'MPN', value: snapshot.identifiers.mpn },
    { key: 'manufacturer_code', label: 'Código Fabricante', value: snapshot.identifiers.manufacturer_code },
  ].filter(id => id.value);
  
  const hasGtinIdentifiers = gtinIdentifiers.length > 0;
  const hasSkuIdentifiers = skuIdentifiers.length > 0;
  const hasOtherIdentifiers = otherIdentifiers.length > 0;
  const hasAnyIdentifiers = hasGtinIdentifiers || hasSkuIdentifiers || hasOtherIdentifiers;
  
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-full bg-primary/10">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Proteção Anti-Catálogo</h3>
          <p className="text-sm text-muted-foreground">
            Controle quais identificadores serão incluídos no novo anúncio
          </p>
        </div>
      </div>
      
      {/* Explicação */}
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4" />
        <AlertTitle>Como funciona</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>
            O Mercado Livre pode vincular seu anúncio ao catálogo automaticamente 
            quando detecta códigos como GTIN, EAN ou ISBN.
          </p>
          <p>
            <strong>Por padrão, esses códigos NÃO serão copiados</strong> para garantir 
            que você tenha controle total sobre título, descrição e fotos.
          </p>
        </AlertDescription>
      </Alert>
      
      {/* Identificadores encontrados */}
      {hasAnyIdentifiers ? (
        <div className="space-y-4">
          {/* GTIN/EAN Section */}
          {hasGtinIdentifiers && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-warning">
                  <ShieldAlert className="h-5 w-5" />
                  <span className="font-medium">GTIN / EAN / UPC / ISBN</span>
                </div>
                <Badge variant={payload.include_gtin ? "destructive" : "secondary"}>
                  {payload.include_gtin ? "SERÁ ENVIADO" : "NÃO SERÁ ENVIADO"}
                </Badge>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {gtinIdentifiers.map((id) => (
                  <Badge key={id.key} variant="outline" className="gap-1">
                    <Barcode className="h-3 w-3" />
                    {id.label}: {id.value}
                  </Badge>
                ))}
              </div>
              
              <div className="flex items-start gap-3 pt-2 border-t">
                <Checkbox
                  id="include_gtin"
                  checked={payload.include_gtin}
                  onCheckedChange={(checked) => onPayloadChange({ include_gtin: !!checked })}
                />
                <div className="space-y-1">
                  <Label htmlFor="include_gtin" className="text-sm font-medium cursor-pointer">
                    Incluir GTIN (EAN) no novo anúncio
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    <AlertTriangle className="h-3 w-3 inline mr-1 text-warning" />
                    <strong>Alto risco:</strong> Pode forçar vínculo ao catálogo e bloquear 
                    edição de título, fotos e descrição.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* SKU Section */}
          {hasSkuIdentifiers && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Barcode className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">SKU do Vendedor</span>
                </div>
                <Badge variant={payload.include_sku ? "outline" : "secondary"}>
                  {payload.include_sku ? "SERÁ ENVIADO" : "NÃO SERÁ ENVIADO"}
                </Badge>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {skuIdentifiers.map((id) => (
                  <Badge key={id.key} variant="outline" className="gap-1">
                    <Barcode className="h-3 w-3" />
                    {id.label}: {id.value}
                  </Badge>
                ))}
              </div>
              
              <div className="flex items-start gap-3 pt-2 border-t">
                <Checkbox
                  id="include_sku"
                  checked={payload.include_sku}
                  onCheckedChange={(checked) => onPayloadChange({ include_sku: !!checked })}
                />
                <div className="space-y-1">
                  <Label htmlFor="include_sku" className="text-sm font-medium cursor-pointer">
                    Incluir SKU no novo anúncio
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    <Info className="h-3 w-3 inline mr-1" />
                    Risco menor que GTIN, mas pode impactar dependendo da categoria.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Outros identificadores (sempre removidos) */}
          {hasOtherIdentifiers && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center gap-2 text-muted-foreground">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Outros identificadores (sempre removidos)</span>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {otherIdentifiers.map((id) => (
                  <Badge key={id.key} variant="outline" className="gap-1 opacity-60">
                    <Barcode className="h-3 w-3" />
                    {id.label}: {id.value}
                  </Badge>
                ))}
              </div>
              
              <p className="text-xs text-muted-foreground">
                MPN, código do fabricante e identificadores similares são sempre removidos 
                pois forçam catálogo em praticamente todas as categorias.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Nenhum identificador de catálogo encontrado</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            O anúncio original não possui GTIN, EAN, SKU ou outros códigos que forçam catálogo.
          </p>
        </div>
      )}
      
      {/* Resumo do que será enviado */}
      <div className="space-y-3">
        <Label className="text-base font-medium">
          Resumo do novo anúncio:
        </Label>
        
        <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Título (editável)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Descrição (editável)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Fotos selecionadas</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Preço e quantidade</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>Dimensões da embalagem</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span>catalog_listing: false</span>
            </div>
          </div>
          
          <div className="pt-2 border-t mt-2">
            <p className="text-xs text-muted-foreground">
              <strong>Garantia anti-catálogo:</strong> O anúncio será criado com 
              <code className="mx-1 px-1 bg-muted rounded">catalog_listing: false</code>
              para impedir vínculo automático.
            </p>
          </div>
        </div>
      </div>
      
      {/* Navegação */}
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onContinue}>
          Entendi, continuar
        </Button>
      </div>
    </div>
  );
}
