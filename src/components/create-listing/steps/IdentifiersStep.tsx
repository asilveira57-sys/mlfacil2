// Aba de Identificadores - Aviso anti-catálogo
// Fluxo "Clonar como anúncio novo" v2 - ISOLADO

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ShieldAlert, Barcode, CheckCircle2, XCircle, Info } from 'lucide-react';
import { ReferenceSnapshot, CATALOG_BLOCKING_IDENTIFIERS } from '../types';

interface IdentifiersStepProps {
  snapshot: ReferenceSnapshot;
  onBack: () => void;
  onContinue: () => void;
}

export function IdentifiersStep({
  snapshot,
  onBack,
  onContinue,
}: IdentifiersStepProps) {
  const hasIdentifiers = Object.keys(snapshot.identifiers).length > 0;
  
  // Listar identificadores encontrados
  const foundIdentifiers = [
    { key: 'gtin', label: 'GTIN', value: snapshot.identifiers.gtin },
    { key: 'ean', label: 'EAN', value: snapshot.identifiers.ean },
    { key: 'upc', label: 'UPC', value: snapshot.identifiers.upc },
    { key: 'isbn', label: 'ISBN', value: snapshot.identifiers.isbn },
    { key: 'mpn', label: 'MPN', value: snapshot.identifiers.mpn },
    { key: 'sku', label: 'SKU', value: snapshot.identifiers.sku },
    { key: 'manufacturer_code', label: 'Código Fabricante', value: snapshot.identifiers.manufacturer_code },
  ].filter(id => id.value);
  
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
            Este fluxo garante que seu anúncio seja criado como anúncio normal
          </p>
        </div>
      </div>
      
      {/* Explicação */}
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4" />
        <AlertTitle>Por que isso é importante?</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p>
            Quando você inclui códigos como GTIN, EAN ou ISBN em um anúncio, o Mercado Livre 
            pode vincular automaticamente seu anúncio ao catálogo.
          </p>
          <p>
            <strong>Isso significa que você pode perder o controle sobre:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Título do anúncio</li>
            <li>Descrição do produto</li>
            <li>Fotos exibidas</li>
          </ul>
        </AlertDescription>
      </Alert>
      
      {/* Status dos identificadores */}
      <div className="space-y-3">
        <Label className="text-base font-medium">
          Identificadores do anúncio original:
        </Label>
        
        {hasIdentifiers ? (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2 text-warning">
              <ShieldAlert className="h-5 w-5" />
              <span className="font-medium">Identificadores encontrados</span>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {foundIdentifiers.map((id) => (
                <Badge key={id.key} variant="outline" className="gap-1">
                  <Barcode className="h-3 w-3" />
                  {id.label}: {id.value}
                </Badge>
              ))}
            </div>
            
            <div className="flex items-center gap-2 text-sm text-primary pt-2 border-t">
              <XCircle className="h-4 w-4" />
              <span>
                <strong>Estes identificadores NÃO serão copiados</strong> para garantir que 
                seu anúncio seja criado como anúncio normal.
              </span>
            </div>
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
      </div>
      
      {/* O que será enviado */}
      <div className="space-y-3">
        <Label className="text-base font-medium">
          O que será enviado no novo anúncio:
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
              <span>Atributos da categoria</span>
            </div>
          </div>
          
          <div className="pt-2 border-t mt-2">
            <p className="text-xs text-muted-foreground">
              <strong>Não será enviado:</strong> GTIN, EAN, UPC, ISBN, MPN, SKU, código do fabricante, 
              catalog_product_id, ou qualquer chave que force vínculo ao catálogo.
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
