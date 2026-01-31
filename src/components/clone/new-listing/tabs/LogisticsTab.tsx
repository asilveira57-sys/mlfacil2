import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Package, Scale, Ruler, Info, AlertTriangle, Barcode } from 'lucide-react';
import { DraftPayload, Attribute, CATALOG_FORCING_ATTRIBUTES } from '../types';

interface LogisticsTabProps {
  payload: DraftPayload;
  onPayloadChange: (updates: Partial<DraftPayload>) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function LogisticsTab({
  payload,
  onPayloadChange,
  onBack,
  onContinue,
}: LogisticsTabProps) {
  const dimensionsValid = 
    payload.seller_package_height > 0 &&
    payload.seller_package_width > 0 &&
    payload.seller_package_length > 0 &&
    payload.seller_package_weight > 0;
  
  // Separar atributos que serão usados vs removidos
  const excludedAttributes = payload.attributes?.filter(attr => 
    CATALOG_FORCING_ATTRIBUTES.has(attr.id?.toUpperCase())
  ) || [];
  
  // CORREÇÃO 4: Verificar se tem GTIN/EAN/SKU capturados
  const hasGtin = !!payload.captured_gtin;
  const hasSku = !!payload.captured_sku;
  
  return (
    <div className="space-y-6">
      {/* Dimensões do pacote */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <Label className="text-base font-medium">Dimensões do pacote</Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Informe as dimensões da embalagem para cálculo de frete.
          {(payload.seller_package_height > 0 || payload.seller_package_width > 0) && (
            <span className="text-primary"> Valores pré-preenchidos do anúncio original.</span>
          )}
        </p>
        
        {!dimensionsValid && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Todas as dimensões são obrigatórias para publicar o anúncio.
            </AlertDescription>
          </Alert>
        )}
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="height" className="flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              Altura (cm)
            </Label>
            <Input
              id="height"
              type="number"
              min={0}
              step={0.1}
              value={payload.seller_package_height || ''}
              onChange={(e) => onPayloadChange({ 
                seller_package_height: parseFloat(e.target.value) || 0 
              })}
              placeholder="0"
              className={payload.seller_package_height <= 0 ? 'border-destructive' : ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="width" className="flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              Largura (cm)
            </Label>
            <Input
              id="width"
              type="number"
              min={0}
              step={0.1}
              value={payload.seller_package_width || ''}
              onChange={(e) => onPayloadChange({ 
                seller_package_width: parseFloat(e.target.value) || 0 
              })}
              placeholder="0"
              className={payload.seller_package_width <= 0 ? 'border-destructive' : ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="length" className="flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              Comprimento (cm)
            </Label>
            <Input
              id="length"
              type="number"
              min={0}
              step={0.1}
              value={payload.seller_package_length || ''}
              onChange={(e) => onPayloadChange({ 
                seller_package_length: parseFloat(e.target.value) || 0 
              })}
              placeholder="0"
              className={payload.seller_package_length <= 0 ? 'border-destructive' : ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight" className="flex items-center gap-1">
              <Scale className="h-3 w-3" />
              Peso (g)
            </Label>
            <Input
              id="weight"
              type="number"
              min={0}
              step={1}
              value={payload.seller_package_weight || ''}
              onChange={(e) => onPayloadChange({ 
                seller_package_weight: parseFloat(e.target.value) || 0 
              })}
              placeholder="0"
              className={payload.seller_package_weight <= 0 ? 'border-destructive' : ''}
            />
          </div>
        </div>
      </div>
      
      {/* CORREÇÃO 4: Controle de GTIN/EAN/SKU */}
      {(hasGtin || hasSku) && (
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Barcode className="h-5 w-5 text-primary" />
            <Label className="text-base font-medium">Identificadores (opcional)</Label>
          </div>
          
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Atenção:</strong> Incluir GTIN/EAN pode fazer o Mercado Livre vincular 
              automaticamente seu anúncio ao catálogo, limitando edições futuras. 
              Por padrão, esses campos estão desativados.
            </AlertDescription>
          </Alert>
          
          <div className="space-y-4 bg-muted/50 rounded-lg p-4">
            {hasGtin && (
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="include-gtin" className="text-sm font-medium">
                    Incluir GTIN/EAN no anúncio
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Valor capturado: <Badge variant="outline" className="text-xs">{payload.captured_gtin}</Badge>
                  </p>
                </div>
                <Switch
                  id="include-gtin"
                  checked={payload.include_gtin || false}
                  onCheckedChange={(checked) => onPayloadChange({ include_gtin: checked })}
                />
              </div>
            )}
            
            {hasSku && (
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="include-sku" className="text-sm font-medium">
                    Incluir SKU do vendedor
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Valor capturado: <Badge variant="outline" className="text-xs">{payload.captured_sku}</Badge>
                  </p>
                </div>
                <Switch
                  id="include-sku"
                  checked={payload.include_sku || false}
                  onCheckedChange={(checked) => onPayloadChange({ include_sku: checked })}
                />
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Campos que não serão usados */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-muted-foreground" />
          <Label className="text-base font-medium text-muted-foreground">
            Campos que não serão copiados
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Para garantir que o anúncio seja criado como <strong>anúncio normal</strong> (não catálogo), 
          os seguintes identificadores não serão incluídos na criação (a menos que você ative acima):
        </p>
        <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>GTIN / EAN / UPC / ISBN {!payload.include_gtin && hasGtin && <span className="text-destructive">(capturado, não será enviado)</span>}</li>
            <li>MPN / Part Number</li>
            <li>Código do Fabricante</li>
            <li>SKU do fornecedor {!payload.include_sku && hasSku && <span className="text-destructive">(capturado, não será enviado)</span>}</li>
            <li>Modelo Alfanumérico</li>
          </ul>
          {excludedAttributes.length > 0 && (
            <p className="text-xs mt-2 text-destructive">
              {excludedAttributes.length} atributo(s) deste tipo encontrado(s) no anúncio original.
            </p>
          )}
        </div>
      </div>
      
      {/* Navegação */}
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onContinue} disabled={!dimensionsValid}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
