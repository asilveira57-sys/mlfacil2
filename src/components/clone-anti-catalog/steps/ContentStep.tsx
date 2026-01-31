// Aba de Conteúdo - Título, Descrição, Preço, Quantidade
// Fluxo Anti-Catálogo v3 - ISOLADO

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { EditablePayload } from '../types';
import { FileText, DollarSign, Package, Tag } from 'lucide-react';

interface ContentStepProps {
  payload: EditablePayload;
  onPayloadChange: (updates: Partial<EditablePayload>) => void;
}

export function ContentStep({ payload, onPayloadChange }: ContentStepProps) {
  return (
    <div className="space-y-6">
      {/* Título */}
      <div className="space-y-2">
        <Label htmlFor="title" className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Título do anúncio
        </Label>
        <Input
          id="title"
          value={payload.title}
          onChange={(e) => onPayloadChange({ title: e.target.value })}
          placeholder="Digite o título do anúncio"
          maxLength={60}
          className={payload.title.length === 0 ? 'border-destructive' : ''}
        />
        <p className="text-xs text-muted-foreground">
          {payload.title.length}/60 caracteres
        </p>
      </div>

      {/* Descrição */}
      <div className="space-y-2">
        <Label htmlFor="description" className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Descrição
        </Label>
        <Textarea
          id="description"
          value={payload.description}
          onChange={(e) => onPayloadChange({ description: e.target.value })}
          placeholder="Descrição detalhada do produto"
          rows={6}
          className="resize-none"
        />
      </div>

      {/* Preço e Quantidade */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Preço (R$)
          </Label>
          <Input
            id="price"
            type="number"
            min={0}
            step={0.01}
            value={payload.price || ''}
            onChange={(e) => onPayloadChange({ price: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            className={payload.price <= 0 ? 'border-destructive' : ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantity" className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Quantidade
          </Label>
          <Input
            id="quantity"
            type="number"
            min={1}
            step={1}
            value={payload.available_quantity || ''}
            onChange={(e) => onPayloadChange({ available_quantity: parseInt(e.target.value) || 1 })}
            placeholder="1"
            className={payload.available_quantity <= 0 ? 'border-destructive' : ''}
          />
        </div>
      </div>

      {/* Condição */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          Condição
        </Label>
        <RadioGroup
          value={payload.condition}
          onValueChange={(value) => onPayloadChange({ condition: value as 'new' | 'used' })}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="new" id="new" />
            <Label htmlFor="new" className="cursor-pointer">Novo</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="used" id="used" />
            <Label htmlFor="used" className="cursor-pointer">Usado</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Tipo de anúncio */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          Tipo de anúncio
        </Label>
        <RadioGroup
          value={payload.listing_type_id}
          onValueChange={(value) => onPayloadChange({ listing_type_id: value as 'gold_special' | 'gold_pro' })}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="gold_special" id="gold_special" />
            <Label htmlFor="gold_special" className="cursor-pointer">Clássico</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="gold_pro" id="gold_pro" />
            <Label htmlFor="gold_pro" className="cursor-pointer">Premium</Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}
