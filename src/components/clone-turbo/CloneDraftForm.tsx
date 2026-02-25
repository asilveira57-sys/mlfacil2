import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Send, AlertTriangle, Image as ImageIcon, Package, Tag, FileText, Ruler, ChevronDown, ChevronUp } from 'lucide-react';
import { OriginStatusBadge } from './OriginStatusBadge';
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
}

function FieldWrapper({ id, label, errors, children, hint }: { id: string; label: string; errors: FieldError[]; children: React.ReactNode; hint?: string }) {
  const fieldErrors = errors.filter(e => e.field === id);
  const hasError = fieldErrors.length > 0;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={cn('text-sm font-medium', hasError && 'text-destructive')}>
        {label}
      </Label>
      <div className={cn(hasError && 'ring-1 ring-destructive rounded-md')}>
        {children}
      </div>
      {hint && !hasError && <p className="text-xs text-muted-foreground">{hint}</p>}
      {fieldErrors.map((e, i) => (
        <p key={i} className="text-xs text-destructive">{e.message}</p>
      ))}
    </div>
  );
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
}: Props) {
  const [showAttributes, setShowAttributes] = useState(false);
  const [showDescription, setShowDescription] = useState(false);

  const originPics = originPayload.pictures || [];
  const userPics = userPayload.pictures || [];
  const activePics = userPics.length > 0 ? userPics : originPics;

  const originAttrs = originPayload.attributes || [];

  return (
    <div className="space-y-4">
      {/* Origin status indicator */}
      <div className="flex items-center justify-between">
        <OriginStatusBadge status={originStatus} />
        {published && createdItemId && (
          <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1">
            ✓ Publicado: {createdItemId}
          </Badge>
        )}
      </div>

      {/* General errors */}
      {generalErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="space-y-1">
            <p className="font-medium">Erro ao publicar. Corrija os campos destacados e reenvie.</p>
            {generalErrors.map((e, i) => (
              <p key={i} className="text-xs">{e.message}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column - Main fields */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              Dados do Anúncio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldWrapper id="title" label="Título" errors={fieldErrors} hint={originPayload.title ? `Origem: ${originPayload.title.substring(0, 60)}...` : undefined}>
              <Input
                id="title"
                placeholder={originPayload.title || 'Título do anúncio'}
                value={userPayload.title || ''}
                onChange={e => onUserPayloadChange({ title: e.target.value })}
              />
            </FieldWrapper>

            <FieldWrapper id="category_id" label="Categoria" errors={fieldErrors} hint={originPayload.category_id ? `Origem: ${originPayload.category_id}` : undefined}>
              <Input
                id="category_id"
                placeholder={originPayload.category_id || 'ID da categoria (ex: MLB1234)'}
                value={userPayload.category_id || ''}
                onChange={e => onUserPayloadChange({ category_id: e.target.value })}
              />
            </FieldWrapper>

            <div className="grid grid-cols-2 gap-3">
              <FieldWrapper id="price" label="Preço (R$)" errors={fieldErrors}>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={originPayload.price ? String(originPayload.price) : '0.00'}
                  value={userPayload.price ?? ''}
                  onChange={e => onUserPayloadChange({ price: e.target.value })}
                />
              </FieldWrapper>

              <FieldWrapper id="available_quantity" label="Quantidade" errors={fieldErrors}>
                <Input
                  id="available_quantity"
                  type="number"
                  min="1"
                  placeholder={originPayload.available_quantity ? String(originPayload.available_quantity) : '1'}
                  value={userPayload.available_quantity ?? ''}
                  onChange={e => onUserPayloadChange({ available_quantity: e.target.value })}
                />
              </FieldWrapper>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FieldWrapper id="condition" label="Condição" errors={fieldErrors}>
                <Select
                  value={userPayload.condition || originPayload.condition || 'new'}
                  onValueChange={v => onUserPayloadChange({ condition: v })}
                >
                  <SelectTrigger id="condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Novo</SelectItem>
                    <SelectItem value="used">Usado</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>

              <FieldWrapper id="listing_type_id" label="Tipo de anúncio" errors={fieldErrors}>
                <Select
                  value={userPayload.listing_type_id || originPayload.listing_type_id || 'gold_special'}
                  onValueChange={v => onUserPayloadChange({ listing_type_id: v })}
                >
                  <SelectTrigger id="listing_type_id">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gold_special">Clássico</SelectItem>
                    <SelectItem value="gold_pro">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FieldWrapper id="sku" label="SKU" errors={fieldErrors}>
                <Input
                  id="sku"
                  placeholder={originPayload.sku || 'Opcional'}
                  value={userPayload.sku || ''}
                  onChange={e => onUserPayloadChange({ sku: e.target.value })}
                />
              </FieldWrapper>

              <FieldWrapper id="gtin" label="EAN / GTIN" errors={fieldErrors}>
                <Input
                  id="gtin"
                  placeholder={originPayload.gtin || 'Opcional'}
                  value={userPayload.gtin || ''}
                  onChange={e => onUserPayloadChange({ gtin: e.target.value })}
                />
              </FieldWrapper>
            </div>
          </CardContent>
        </Card>

        {/* Right column - Dimensions, photos, description */}
        <div className="space-y-4">
          {/* Dimensions */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ruler className="h-4 w-4 text-primary" />
                Dimensões da Embalagem
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn('grid grid-cols-2 gap-3', fieldErrors.some(e => e.field === 'dimensions') && 'ring-1 ring-destructive rounded-md p-2')}>
                <FieldWrapper id="package_height" label="Altura (cm)" errors={fieldErrors}>
                  <Input
                    id="package_height"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={originPayload.package_height ? String(originPayload.package_height) : ''}
                    value={userPayload.package_height ?? ''}
                    onChange={e => onUserPayloadChange({ package_height: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper id="package_width" label="Largura (cm)" errors={fieldErrors}>
                  <Input
                    id="package_width"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={originPayload.package_width ? String(originPayload.package_width) : ''}
                    value={userPayload.package_width ?? ''}
                    onChange={e => onUserPayloadChange({ package_width: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper id="package_length" label="Comprimento (cm)" errors={fieldErrors}>
                  <Input
                    id="package_length"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder={originPayload.package_length ? String(originPayload.package_length) : ''}
                    value={userPayload.package_length ?? ''}
                    onChange={e => onUserPayloadChange({ package_length: e.target.value })}
                  />
                </FieldWrapper>
                <FieldWrapper id="package_weight" label="Peso (g)" errors={fieldErrors}>
                  <Input
                    id="package_weight"
                    type="number"
                    step="1"
                    min="0"
                    placeholder={originPayload.package_weight ? String(originPayload.package_weight) : ''}
                    value={userPayload.package_weight ?? ''}
                    onChange={e => onUserPayloadChange({ package_weight: e.target.value })}
                  />
                </FieldWrapper>
              </div>
              {fieldErrors.filter(e => e.field === 'dimensions').map((e, i) => (
                <p key={i} className="text-xs text-destructive mt-2">{e.message}</p>
              ))}
            </CardContent>
          </Card>

          {/* Photos */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                Fotos ({activePics.length})
                {fieldErrors.some(e => e.field === 'pictures') && (
                  <Badge variant="destructive" className="text-xs">Erro</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activePics.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activePics.slice(0, 8).map((pic, i) => (
                    <img
                      key={pic.id || i}
                      src={pic.secure_url || pic.url}
                      alt={`Foto ${i + 1}`}
                      className="h-14 w-14 rounded-md object-cover border border-border/50"
                    />
                  ))}
                  {activePics.length > 8 && (
                    <div className="h-14 w-14 rounded-md border border-border/50 flex items-center justify-center text-xs text-muted-foreground">
                      +{activePics.length - 8}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma foto carregada. Serão usadas as fotos da origem quando disponíveis.</p>
              )}
              {fieldErrors.filter(e => e.field === 'pictures').map((e, i) => (
                <p key={i} className="text-xs text-destructive mt-1">{e.message}</p>
              ))}
            </CardContent>
          </Card>

          {/* Description toggle */}
          <Card className="border-border/50">
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowDescription(!showDescription)}>
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Descrição
                  {fieldErrors.some(e => e.field === 'description') && (
                    <Badge variant="destructive" className="text-xs">Erro</Badge>
                  )}
                </span>
                {showDescription ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </CardTitle>
            </CardHeader>
            {showDescription && (
              <CardContent>
                <Textarea
                  placeholder={originPayload.description ? originPayload.description.substring(0, 200) + '...' : 'Descrição do produto'}
                  value={userPayload.description || ''}
                  onChange={e => onUserPayloadChange({ description: e.target.value })}
                  rows={6}
                />
                {originPayload.description && !userPayload.description && (
                  <p className="text-xs text-muted-foreground mt-1">Vazio = usa descrição da origem ({originPayload.description.length} chars)</p>
                )}
              </CardContent>
            )}
          </Card>

          {/* Attributes toggle */}
          {originAttrs.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowAttributes(!showAttributes)}>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    Ficha Técnica ({originAttrs.length} atributos)
                    {fieldErrors.some(e => e.field === 'attributes') && (
                      <Badge variant="destructive" className="text-xs">Erro</Badge>
                    )}
                  </span>
                  {showAttributes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </CardTitle>
              </CardHeader>
              {showAttributes && (
                <CardContent>
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                    {originAttrs.map((attr, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {attr.name || attr.id}: {attr.value_name || '-'}
                      </Badge>
                    ))}
                  </div>
                  {fieldErrors.filter(e => e.field === 'attributes').map((e, i) => (
                    <p key={i} className="text-xs text-destructive mt-2">{e.message}</p>
                  ))}
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Publish button */}
      <Separator />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Campos em branco usarão os dados da origem automaticamente.
        </p>
        <Button
          size="lg"
          onClick={onPublish}
          disabled={publishing || published}
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
              Publicar Anúncio
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
