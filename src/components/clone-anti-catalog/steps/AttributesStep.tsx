// Aba de Atributos - Visualização dos atributos seguros
// Fluxo Anti-Catálogo v3 - ISOLADO

import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EditablePayload, SnapshotAttribute, ESSENTIAL_ATTRIBUTES } from '../types';
import { Tags, X, ShieldCheck } from 'lucide-react';

interface AttributesStepProps {
  payload: EditablePayload;
  onPayloadChange: (updates: Partial<EditablePayload>) => void;
}

export function AttributesStep({ payload, onPayloadChange }: AttributesStepProps) {
  const attributes = payload.attributes;

  const removeAttribute = (attrId: string) => {
    const newAttributes = attributes.filter(a => a.id !== attrId);
    onPayloadChange({ attributes: newAttributes });
  };

  const isEssential = (attrId: string) => {
    return ESSENTIAL_ATTRIBUTES.has(attrId?.toUpperCase());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Tags className="h-5 w-5 text-primary" />
        <Label className="text-base font-medium">Atributos do produto</Label>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          Apenas atributos <strong>seguros</strong> são exibidos aqui. Identificadores como GTIN, EAN, SKU e outros que forçam vínculo com catálogo foram automaticamente removidos.
        </AlertDescription>
      </Alert>

      {attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum atributo disponível para este produto.
        </p>
      ) : (
        <div className="space-y-2">
          {attributes.map((attr) => (
            <div
              key={attr.id}
              className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{attr.name || attr.id}</span>
                  {isEssential(attr.id) && (
                    <Badge variant="secondary" className="text-xs">Essencial</Badge>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {attr.value_name || attr.value_id || '-'}
                  {attr.value_struct?.unit && ` ${attr.value_struct.unit}`}
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeAttribute(attr.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {attributes.length} atributo(s) serão enviados
      </p>
    </div>
  );
}
