// Aba de Logística - Dimensões do pacote
// Fluxo "Clonar como anúncio novo" v2 - ISOLADO

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Package, Scale, Ruler, CheckCircle2 } from 'lucide-react';
import { FinalListingPayload } from '../types';

interface LogisticsStepProps {
  payload: FinalListingPayload;
  onPayloadChange: (updates: Partial<FinalListingPayload>) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function LogisticsStep({
  payload,
  onPayloadChange,
  onBack,
  onContinue,
}: LogisticsStepProps) {
  const dimensionsValid = 
    payload.package_height > 0 &&
    payload.package_width > 0 &&
    payload.package_length > 0 &&
    payload.package_weight > 0;
  
  const hasPrefilled = 
    payload.package_height > 0 || 
    payload.package_width > 0 || 
    payload.package_length > 0 || 
    payload.package_weight > 0;
  
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
          {hasPrefilled && (
            <span className="text-primary"> Alguns valores foram pré-preenchidos do anúncio original.</span>
          )}
        </p>
        
        {!dimensionsValid && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Todas as dimensões são obrigatórias.</strong> Preencha altura, largura, comprimento e peso para continuar.
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
              value={payload.package_height || ''}
              onChange={(e) => onPayloadChange({ 
                package_height: parseFloat(e.target.value) || 0 
              })}
              placeholder="0"
              className={payload.package_height <= 0 ? 'border-destructive' : ''}
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
              value={payload.package_width || ''}
              onChange={(e) => onPayloadChange({ 
                package_width: parseFloat(e.target.value) || 0 
              })}
              placeholder="0"
              className={payload.package_width <= 0 ? 'border-destructive' : ''}
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
              value={payload.package_length || ''}
              onChange={(e) => onPayloadChange({ 
                package_length: parseFloat(e.target.value) || 0 
              })}
              placeholder="0"
              className={payload.package_length <= 0 ? 'border-destructive' : ''}
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
              value={payload.package_weight || ''}
              onChange={(e) => onPayloadChange({ 
                package_weight: parseFloat(e.target.value) || 0 
              })}
              placeholder="0"
              className={payload.package_weight <= 0 ? 'border-destructive' : ''}
            />
          </div>
        </div>
        
        {dimensionsValid && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" />
            <span>Dimensões válidas</span>
          </div>
        )}
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
