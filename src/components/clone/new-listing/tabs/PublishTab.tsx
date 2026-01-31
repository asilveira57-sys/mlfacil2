import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Pause, 
  Play,
  Crown,
  Tag,
  ExternalLink 
} from 'lucide-react';
import { DraftPayload } from '../types';

interface PublishTabProps {
  payload: DraftPayload;
  onPayloadChange: (updates: Partial<DraftPayload>) => void;
  onBack: () => void;
  onExecute: () => void;
  loading: boolean;
  error: string | null;
  success: boolean;
  createdItemId?: string;
}

export function PublishTab({
  payload,
  onPayloadChange,
  onBack,
  onExecute,
  loading,
  error,
  success,
  createdItemId,
}: PublishTabProps) {
  const [confirmText, setConfirmText] = useState('');
  
  const confirmValid = confirmText === 'CLONAR';
  
  // Validações finais
  const validations = [
    { label: 'Título preenchido', valid: !!payload.title?.trim() },
    { label: 'Pelo menos 1 foto', valid: payload.pictures?.length > 0 },
    { label: 'Preço válido', valid: payload.price > 0 },
    { label: 'Quantidade válida', valid: payload.available_quantity > 0 },
    { label: 'Dimensões completas', valid: 
      payload.seller_package_height > 0 &&
      payload.seller_package_width > 0 &&
      payload.seller_package_length > 0 &&
      payload.seller_package_weight > 0
    },
  ];
  
  const allValid = validations.every(v => v.valid);
  const canExecute = allValid && confirmValid && !loading;
  
  if (success && createdItemId) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <CheckCircle2 className="h-16 w-16 text-primary" />
          <h3 className="text-xl font-semibold">Anúncio criado com sucesso!</h3>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {createdItemId}
          </Badge>
          <a
            href={`https://www.mercadolivre.com.br/anuncios/${createdItemId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            Ver anúncio no Mercado Livre
          </a>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Tipo de anúncio */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Tipo de anúncio</Label>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => onPayloadChange({ listing_type_id: 'gold_special' })}
            className={`p-4 border rounded-lg text-left transition-colors ${
              payload.listing_type_id === 'gold_special'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-5 w-5 text-primary" />
              <span className="font-medium">Clássico</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Exposição padrão, sem custo fixo adicional
            </p>
          </button>
          <button
            type="button"
            onClick={() => onPayloadChange({ listing_type_id: 'gold_pro' })}
            className={`p-4 border rounded-lg text-left transition-colors ${
              payload.listing_type_id === 'gold_pro'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Crown className="h-5 w-5 text-warning" />
              <span className="font-medium">Premium</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Maior exposição, melhor posicionamento
            </p>
          </button>
        </div>
      </div>
      
      {/* Status inicial */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Status na criação</Label>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => onPayloadChange({ initial_status: 'paused' })}
            className={`p-4 border rounded-lg text-left transition-colors ${
              payload.initial_status === 'paused'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Pause className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Pausado</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Revise antes de ativar
            </p>
          </button>
          <button
            type="button"
            onClick={() => onPayloadChange({ initial_status: 'active' })}
            className={`p-4 border rounded-lg text-left transition-colors ${
              payload.initial_status === 'active'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Play className="h-5 w-5 text-primary" />
              <span className="font-medium">Ativo</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Publicar imediatamente
            </p>
          </button>
        </div>
      </div>
      
      {/* Checklist de validações */}
      <div className="space-y-3 pt-4 border-t">
        <Label className="text-base font-medium">Checklist</Label>
        <div className="space-y-2">
          {validations.map((v, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {v.valid ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span className={v.valid ? 'text-foreground' : 'text-destructive'}>
                {v.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Confirmação */}
      <div className="space-y-3 pt-4 border-t">
        <Label htmlFor="confirm" className="text-base font-medium">
          Confirmação
        </Label>
        <p className="text-sm text-muted-foreground">
          Digite <strong>CLONAR</strong> para habilitar o botão de criação
        </p>
        <Input
          id="confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
          placeholder="Digite CLONAR"
          className={confirmValid ? 'border-primary' : ''}
        />
      </div>
      
      {/* Erro */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {/* Navegação */}
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={onBack} disabled={loading}>
          Voltar
        </Button>
        <Button onClick={onExecute} disabled={!canExecute}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Criando anúncio...
            </>
          ) : (
            'Criar anúncio novo'
          )}
        </Button>
      </div>
    </div>
  );
}
