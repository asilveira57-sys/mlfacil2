// Aba de Conteúdo - Edição de título, descrição, fotos
// Fluxo "Clonar como anúncio novo" v2 - ISOLADO

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, GripVertical, AlertCircle, Image as ImageIcon, ArrowUp, ArrowDown } from 'lucide-react';
import { FinalListingPayload, ReferencePicture } from '../types';

interface ContentStepProps {
  payload: FinalListingPayload;
  onPayloadChange: (updates: Partial<FinalListingPayload>) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function ContentStep({
  payload,
  onPayloadChange,
  onBack,
  onContinue,
}: ContentStepProps) {
  const handleRemovePicture = (index: number) => {
    const newPictures = [...payload.pictures];
    newPictures.splice(index, 1);
    onPayloadChange({ pictures: newPictures });
  };
  
  const handleMovePicture = (from: number, to: number) => {
    if (to < 0 || to >= payload.pictures.length) return;
    const newPictures = [...payload.pictures];
    const [moved] = newPictures.splice(from, 1);
    newPictures.splice(to, 0, moved);
    onPayloadChange({ pictures: newPictures });
  };
  
  const titleValid = payload.title?.trim().length > 0;
  const hasPictures = payload.pictures?.length >= 2;
  const canContinue = titleValid && hasPictures;
  
  return (
    <div className="space-y-6">
      {/* Título */}
      <div className="space-y-2">
        <Label htmlFor="title" className="text-base font-medium">
          Título do anúncio
        </Label>
        <p className="text-sm text-muted-foreground">
          O título pode ser mantido igual ao original ou editado livremente.
        </p>
        <Input
          id="title"
          value={payload.title}
          onChange={(e) => onPayloadChange({ title: e.target.value })}
          placeholder="Título do anúncio"
          maxLength={60}
          className={!titleValid ? 'border-destructive' : ''}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{!titleValid && 'O título é obrigatório'}</span>
          <span>{payload.title?.length || 0}/60</span>
        </div>
      </div>
      
      {/* Descrição */}
      <div className="space-y-2">
        <Label htmlFor="description" className="text-base font-medium">
          Descrição
        </Label>
        {!payload.description && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              A descrição não foi capturada automaticamente. Preencha manualmente para melhorar suas vendas.
            </AlertDescription>
          </Alert>
        )}
        <Textarea
          id="description"
          value={payload.description}
          onChange={(e) => onPayloadChange({ description: e.target.value })}
          placeholder="Descrição detalhada do produto..."
          className="min-h-[150px]"
        />
      </div>
      
      {/* Preço e Quantidade */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Preço (R$)</Label>
          <Input
            id="price"
            type="number"
            min={0}
            step={0.01}
            value={payload.price}
            onChange={(e) => onPayloadChange({ price: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantidade disponível</Label>
          <Input
            id="quantity"
            type="number"
            min={1}
            value={payload.available_quantity}
            onChange={(e) => onPayloadChange({ available_quantity: parseInt(e.target.value) || 1 })}
          />
        </div>
      </div>
      
      {/* Condição */}
      <div className="space-y-2">
        <Label>Condição</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={payload.condition === 'new' ? 'default' : 'outline'}
            onClick={() => onPayloadChange({ condition: 'new' })}
          >
            Novo
          </Button>
          <Button
            type="button"
            variant={payload.condition === 'used' ? 'default' : 'outline'}
            onClick={() => onPayloadChange({ condition: 'used' })}
          >
            Usado
          </Button>
        </div>
      </div>
      
      {/* Fotos */}
      <div className="space-y-2">
        <Label className="text-base font-medium">
          Fotos ({payload.pictures?.length || 0})
        </Label>
        <p className="text-sm text-muted-foreground">
          Mínimo 2 fotos. Use as setas para reordenar. A primeira será a foto principal.
        </p>
        {!hasPictures && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              São necessárias pelo menos 2 fotos para publicar o anúncio.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {payload.pictures?.map((pic, index) => {
            const imageUrl = pic.secure_url || pic.url;
            return (
              <div
                key={pic.id || index}
                className="relative group aspect-square border rounded-md overflow-hidden bg-muted"
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={`Foto ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                
                {/* Indicador de posição */}
                <Badge
                  variant={index === 0 ? 'default' : 'secondary'}
                  className="absolute bottom-1 left-1 text-xs"
                >
                  {index === 0 ? '★' : index + 1}
                </Badge>
                
                {/* Controles */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-6 w-6"
                    onClick={() => handleMovePicture(index, index - 1)}
                    disabled={index === 0}
                    title="Mover para cima"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-6 w-6"
                    onClick={() => handleMovePicture(index, index + 1)}
                    disabled={index === payload.pictures.length - 1}
                    title="Mover para baixo"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-6 w-6"
                    onClick={() => handleRemovePicture(index)}
                    title="Remover foto"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Navegação */}
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={onContinue} disabled={!canContinue}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
