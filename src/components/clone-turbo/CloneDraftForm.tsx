import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Loader2, Send, AlertTriangle, Image as ImageIcon,
  Package, Ruler, ChevronDown, ChevronUp, MapPin, Pause,
} from 'lucide-react';
import { OriginStatusBadge } from './OriginStatusBadge';
import { CategoryPicker } from './CategoryPicker';
import type { OriginPayload, UserPayload, FieldError, OriginStatus } from './types';
import { cn } from '@/lib/utils';

interface Props {
  originPayload: OriginPayload;
  originStatus: OriginStatus;
  userPayload: UserPayload;
  onUserPayloadChange: (updates: Partial<UserPayload>) => void;
  fieldErrors: FieldError[];
  generalErrors: FieldError[];
  onPublish: () => void;
  publishing: boolean;
  published: boolean;
  createdItemId?: string;
  accountId?: string | null;
}

function FieldError({ errors, field }: { errors: FieldError[]; field: string }) {
  const filtered = errors.filter(e => e.field === field);
  if (filtered.length === 0) return null;
  return (
    <>
      {filtered.map((e, i) => (
        <p key={i} className="text-xs text-destructive mt-1">{e.message}</p>
      ))}
    </>
  );
}

function hasFieldError(errors: FieldError[], field: string) {
  return errors.some(e => e.field === field);
}

export function CloneDraftForm({
  originPayload,
  originStatus,
  userPayload,
  onUserPayloadChange,
  fieldErrors,
  generalErrors,
  onPublish,
  publishing,
  published,
  createdItemId,
  accountId,
}: Props) {
  const [showDescription, setShowDescription] = useState(false);
  const [showAttributes, setShowAttributes] = useState(false);

  const originPics = originPayload.pictures || [];
  const userPics = userPayload.pictures || [];
  const activePics = userPics.length > 0 ? userPics : originPics;
  const originAttrs = originPayload.attributes || [];
  const thumbnail = originPayload.thumbnail || activePics[0]?.secure_url || activePics[0]?.url || '';

  const isLoading = originStatus === 'loading';

  return (
    <div className="space-y-0 border border-border rounded-xl overflow-hidden bg-card">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
        <OriginStatusBadge status={originStatus} />
        {published && createdItemId && (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1">
            ✓ Publicado: {createdItemId}
          </Badge>
        )}
      </div>

      {/* General errors */}
      {generalErrors.length > 0 && (
        <div className="px-4 pt-3">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-1">
              <p className="font-medium">Corrija os campos destacados e tente novamente.</p>
              {generalErrors.map((e, i) => (
                <p key={i} className="text-xs">{e.message}</p>
              ))}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* ─── Main content: Thumbnail + Fields ─── */}
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <div className="shrink-0">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt="Produto"
              className="h-20 w-20 rounded-lg object-cover border border-border bg-muted"
            />
          ) : (
            <div className="h-20 w-20 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          {activePics.length > 1 && (
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              {activePics.length} fotos
            </p>
          )}
        </div>

        {/* Primary fields */}
        <div className="flex-1 space-y-3 min-w-0">
          {/* Title */}
          <div>
            <Label htmlFor="title" className={cn('text-xs font-medium text-muted-foreground', hasFieldError(fieldErrors, 'title') && 'text-destructive')}>
              Título *
            </Label>
            <Input
              id="title"
              placeholder={isLoading ? 'Carregando...' : (originPayload.title || 'Título do anúncio')}
              value={userPayload.title || ''}
              onChange={e => onUserPayloadChange({ title: e.target.value })}
              disabled={isLoading}
              className={cn('h-9', hasFieldError(fieldErrors, 'title') && 'border-destructive')}
            />
            {!userPayload.title && originPayload.title && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Origem: {originPayload.title}</p>
            )}
            <FieldError errors={fieldErrors} field="title" />
          </div>

          {/* Price + Quantity + SKU + EAN row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label htmlFor="price" className={cn('text-xs font-medium text-muted-foreground', hasFieldError(fieldErrors, 'price') && 'text-destructive')}>
                Valor (R$) *
              </Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder={originPayload.price ? String(originPayload.price) : '0.00'}
                value={userPayload.price ?? ''}
                onChange={e => onUserPayloadChange({ price: e.target.value })}
                disabled={isLoading}
                className={cn('h-9', hasFieldError(fieldErrors, 'price') && 'border-destructive')}
              />
              <FieldError errors={fieldErrors} field="price" />
            </div>
            <div>
              <Label htmlFor="available_quantity" className="text-xs font-medium text-muted-foreground">
                Quantidade
              </Label>
              <Input
                id="available_quantity"
                type="number"
                min="1"
                placeholder={originPayload.available_quantity ? String(originPayload.available_quantity) : '1'}
                value={userPayload.available_quantity ?? ''}
                onChange={e => onUserPayloadChange({ available_quantity: e.target.value })}
                disabled={isLoading}
                className="h-9"
              />
            </div>
            <div>
              <Label htmlFor="sku" className="text-xs font-medium text-muted-foreground">SKU</Label>
              <Input
                id="sku"
                placeholder={originPayload.sku || '—'}
                value={userPayload.sku || ''}
                onChange={e => onUserPayloadChange({ sku: e.target.value })}
                disabled={isLoading}
                className="h-9"
              />
              <FieldError errors={fieldErrors} field="sku" />
            </div>
            <div>
              <Label htmlFor="gtin" className="text-xs font-medium text-muted-foreground">Cód. barras</Label>
              <Input
                id="gtin"
                placeholder={originPayload.gtin || '—'}
                value={userPayload.gtin || ''}
                onChange={e => onUserPayloadChange({ gtin: e.target.value })}
                disabled={isLoading}
                className="h-9"
              />
              <FieldError errors={fieldErrors} field="gtin" />
            </div>
          </div>

          {/* Category */}
          <div>
            <Label className={cn('text-xs font-medium text-muted-foreground', hasFieldError(fieldErrors, 'category_id') && 'text-destructive')}>
              Categoria *
            </Label>
            <CategoryPicker
              accountId={accountId || null}
              value={userPayload.category_id || originPayload.category_id || ''}
              originCategoryId={originPayload.category_id}
              originCategoryName={originPayload.category_name}
              onSelect={(id) => onUserPayloadChange({ category_id: id })}
            />
            <FieldError errors={fieldErrors} field="category_id" />
          </div>
        </div>
      </div>

      <Separator />

      {/* ─── Retirada em mãos ─── */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">Retirada em mãos</span>
        </div>
        <Switch
          checked={userPayload.local_pick_up ?? false}
          onCheckedChange={v => onUserPayloadChange({ local_pick_up: v })}
          disabled={isLoading}
        />
      </div>

      <Separator />

      {/* ─── Dimensões ─── */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Ruler className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Dimensões da embalagem</span>
          {hasFieldError(fieldErrors, 'dimensions') && (
            <Badge variant="destructive" className="text-[10px] h-4">Erro</Badge>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {([
            { id: 'package_height', label: 'Altura (cm)', key: 'package_height' as const },
            { id: 'package_width', label: 'Largura (cm)', key: 'package_width' as const },
            { id: 'package_length', label: 'Comprimento (cm)', key: 'package_length' as const },
            { id: 'package_weight', label: 'Peso (g)', key: 'package_weight' as const },
          ] as const).map(dim => (
            <div key={dim.id}>
              <Label htmlFor={dim.id} className="text-xs text-muted-foreground">{dim.label}</Label>
              <Input
                id={dim.id}
                type="number"
                step={dim.key === 'package_weight' ? '1' : '0.1'}
                min="0"
                placeholder={originPayload[dim.key] ? String(originPayload[dim.key]) : ''}
                value={userPayload[dim.key] ?? ''}
                onChange={e => onUserPayloadChange({ [dim.key]: e.target.value })}
                disabled={isLoading}
                className="h-9"
              />
            </div>
          ))}
        </div>
        <FieldError errors={fieldErrors} field="dimensions" />
      </div>

      <Separator />

      {/* ─── Modalidade ─── */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-medium">Modalidade</span>
        <Select
          value={userPayload.listing_type_id || originPayload.listing_type_id || 'gold_special'}
          onValueChange={v => onUserPayloadChange({ listing_type_id: v })}
          disabled={isLoading}
        >
          <SelectTrigger className="w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gold_special">Clássico</SelectItem>
            <SelectItem value="gold_pro">Premium</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* ─── Criar pausado ─── */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Pause className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">Criar anúncio pausado</span>
        </div>
        <Switch
          checked={userPayload.start_paused ?? false}
          onCheckedChange={v => onUserPayloadChange({ start_paused: v })}
          disabled={isLoading}
        />
      </div>

      <Separator />

      {/* ─── Descrição (collapsible) ─── */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setShowDescription(!showDescription)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Descrição</span>
          {originPayload.description && !userPayload.description && (
            <Badge variant="secondary" className="text-[10px] h-4">Origem</Badge>
          )}
          {hasFieldError(fieldErrors, 'description') && (
            <Badge variant="destructive" className="text-[10px] h-4">Erro</Badge>
          )}
        </div>
        {showDescription ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </div>
      {showDescription && (
        <div className="px-4 pb-3">
          <Textarea
            placeholder={originPayload.description ? originPayload.description.substring(0, 200) + '...' : 'Descrição do produto'}
            value={userPayload.description || ''}
            onChange={e => onUserPayloadChange({ description: e.target.value })}
            rows={5}
            disabled={isLoading}
          />
          {originPayload.description && !userPayload.description && (
            <p className="text-[10px] text-muted-foreground mt-1">Vazio = usa descrição da origem ({originPayload.description.length} chars)</p>
          )}
          <FieldError errors={fieldErrors} field="description" />
        </div>
      )}

      {/* ─── Ficha Técnica (collapsible) ─── */}
      {originAttrs.length > 0 && (
        <>
          <Separator />
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setShowAttributes(!showAttributes)}
          >
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Ficha Técnica ({originAttrs.length})</span>
              {hasFieldError(fieldErrors, 'attributes') && (
                <Badge variant="destructive" className="text-[10px] h-4">Erro</Badge>
              )}
            </div>
            {showAttributes ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
          {showAttributes && (
            <div className="px-4 pb-3">
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                {originAttrs.map((attr, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {attr.name || attr.id}: {attr.value_name || '-'}
                  </Badge>
                ))}
              </div>
              <FieldError errors={fieldErrors} field="attributes" />
            </div>
          )}
        </>
      )}

      {/* ─── Photos strip ─── */}
      {activePics.length > 0 && (
        <>
          <Separator />
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Fotos ({activePics.length})</span>
              {hasFieldError(fieldErrors, 'pictures') && (
                <Badge variant="destructive" className="text-[10px] h-4">Erro</Badge>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {activePics.slice(0, 10).map((pic, i) => (
                <img
                  key={pic.id || i}
                  src={pic.secure_url || pic.url}
                  alt={`Foto ${i + 1}`}
                  className="h-12 w-12 rounded-md object-cover border border-border shrink-0"
                />
              ))}
              {activePics.length > 10 && (
                <div className="h-12 w-12 rounded-md border border-border flex items-center justify-center text-xs text-muted-foreground shrink-0">
                  +{activePics.length - 10}
                </div>
              )}
            </div>
            <FieldError errors={fieldErrors} field="pictures" />
          </div>
        </>
      )}

      {/* ─── Footer: Publish ─── */}
      <Separator />
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
        <p className="text-xs text-muted-foreground">
          Campos vazios usam dados da origem.
        </p>
        <Button
          size="lg"
          onClick={onPublish}
          disabled={publishing || published || isLoading}
          className="gap-2"
        >
          {publishing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Publicando...
            </>
          ) : published ? (
            <>✓ Publicado</>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Criar anúncio
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
