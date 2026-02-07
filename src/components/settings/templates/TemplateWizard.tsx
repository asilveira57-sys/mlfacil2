import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Save, Upload, Trash2 } from 'lucide-react';
import { useTemplate, useTemplateMutations, useTemplateVariants, useVariantMutations, useTemplateAssets, useAssetMutations } from '@/hooks/useTemplates';
import type { DesignTokens, TemplateScope } from '@/types/templates';
import { useDropzone } from 'react-dropzone';

interface TemplateWizardProps {
  templateId: string | null; // null = create new
  onClose: () => void;
}

const DEFAULT_TOKENS: DesignTokens = {
  primary: '223 47% 23%',
  primary_foreground: '210 40% 98%',
  secondary: '215 20% 65%',
  secondary_foreground: '222 47% 11%',
  background: '210 40% 98%',
  foreground: '222 47% 11%',
  card: '0 0% 100%',
  card_foreground: '222 47% 11%',
  muted: '210 40% 96%',
  muted_foreground: '215 16% 47%',
  accent: '189 94% 43%',
  accent_foreground: '0 0% 100%',
  border: '214 32% 91%',
  radius: '0.75rem',
  sidebar_background: '0 0% 100%',
  sidebar_foreground: '222 47% 11%',
  sidebar_primary: '223 47% 23%',
};

const TOKEN_GROUPS = [
  {
    label: 'Cores Primárias',
    tokens: ['primary', 'primary_foreground', 'secondary', 'secondary_foreground'],
  },
  {
    label: 'Backgrounds',
    tokens: ['background', 'foreground', 'card', 'card_foreground', 'muted', 'muted_foreground'],
  },
  {
    label: 'Destaques',
    tokens: ['accent', 'accent_foreground', 'border'],
  },
  {
    label: 'Sidebar',
    tokens: ['sidebar_background', 'sidebar_foreground', 'sidebar_primary'],
  },
  {
    label: 'Layout',
    tokens: ['radius'],
  },
];

const TOKEN_LABELS: Record<string, string> = {
  primary: 'Primária',
  primary_foreground: 'Texto Primária',
  secondary: 'Secundária',
  secondary_foreground: 'Texto Secundária',
  background: 'Fundo',
  foreground: 'Texto Principal',
  card: 'Card',
  card_foreground: 'Texto Card',
  muted: 'Muted',
  muted_foreground: 'Texto Muted',
  accent: 'Destaque',
  accent_foreground: 'Texto Destaque',
  border: 'Borda',
  radius: 'Border Radius',
  sidebar_background: 'Sidebar Fundo',
  sidebar_foreground: 'Sidebar Texto',
  sidebar_primary: 'Sidebar Primária',
};

export function TemplateWizard({ templateId, onClose }: TemplateWizardProps) {
  const isEditing = !!templateId;
  const { data: template, isLoading: tplLoading } = useTemplate(templateId);
  const { data: variants, isLoading: varLoading } = useTemplateVariants(templateId);
  const { data: assets } = useTemplateAssets(templateId);
  const { createTemplate, updateTemplate } = useTemplateMutations();
  const { upsertVariant } = useVariantMutations();
  const { uploadAsset, deleteAsset } = useAssetMutations();

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<TemplateScope>('global');
  const [lightTokens, setLightTokens] = useState<DesignTokens>({ ...DEFAULT_TOKENS });
  const [darkTokens, setDarkTokens] = useState<DesignTokens>({
    ...DEFAULT_TOKENS,
    background: '222 47% 11%',
    foreground: '210 40% 98%',
    card: '222 40% 14%',
    card_foreground: '210 40% 98%',
    muted: '217 33% 17%',
    muted_foreground: '215 20% 65%',
    sidebar_background: '222 47% 11%',
    sidebar_foreground: '210 40% 98%',
  });
  const [initialized, setInitialized] = useState(false);

  // Init from existing data
  if (isEditing && template && !initialized && !tplLoading && !varLoading) {
    setName(template.name);
    setDescription(template.description || '');
    setScope(template.scope as TemplateScope);
    
    const lightVar = variants?.find(v => v.variant_key === 'light');
    if (lightVar) setLightTokens(lightVar.design_tokens as DesignTokens);
    
    const darkVar = variants?.find(v => v.variant_key === 'dark');
    if (darkVar) setDarkTokens(darkVar.design_tokens as DesignTokens);
    
    setInitialized(true);
  }

  const handleSave = async () => {
    if (!name.trim()) return;

    try {
      let id = templateId;

      if (isEditing && id) {
        await updateTemplate.mutateAsync({ id, name, description, scope });
      } else {
        const newTpl = await createTemplate.mutateAsync({ name, description, scope });
        id = newTpl.id;
      }

      if (id) {
        // Save light variant
        await upsertVariant.mutateAsync({
          template_id: id,
          variant_key: 'light',
          design_tokens: lightTokens,
        });

        // Save dark variant
        await upsertVariant.mutateAsync({
          template_id: id,
          variant_key: 'dark',
          design_tokens: darkTokens,
        });
      }

      onClose();
    } catch {
      // Errors handled by mutations
    }
  };

  const updateToken = (variant: 'light' | 'dark', key: string, value: string) => {
    if (variant === 'light') {
      setLightTokens(prev => ({ ...prev, [key]: value }));
    } else {
      setDarkTokens(prev => ({ ...prev, [key]: value }));
    }
  };

  // Asset upload
  const onDrop = useCallback(async (files: File[]) => {
    if (!templateId) return;
    for (const file of files) {
      await uploadAsset.mutateAsync({
        template_id: templateId,
        asset_type: 'background',
        file,
      });
    }
  }, [templateId, uploadAsset]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.svg', '.webp'] },
    disabled: !templateId,
  });

  if (isEditing && (tplLoading || varLoading)) {
    return <Skeleton className="h-96" />;
  }

  const renderTokenEditor = (variant: 'light' | 'dark', tokens: DesignTokens) => (
    <div className="space-y-6">
      {TOKEN_GROUPS.map(group => (
        <div key={group.label}>
          <h5 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
            {group.label}
          </h5>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.tokens.map(tokenKey => (
              <div key={tokenKey} className="space-y-1.5">
                <Label className="text-xs">{TOKEN_LABELS[tokenKey] || tokenKey}</Label>
                <div className="flex gap-2">
                  {tokenKey !== 'radius' && (
                    <div
                      className="w-8 h-8 rounded-md border flex-shrink-0"
                      style={{
                        background: `hsl(${(tokens as any)[tokenKey] || '0 0% 50%'})`,
                      }}
                    />
                  )}
                  <Input
                    value={(tokens as any)[tokenKey] || ''}
                    onChange={e => updateToken(variant, tokenKey, e.target.value)}
                    placeholder="H S% L%"
                    className="text-xs font-mono h-8"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Editar Template' : 'Novo Template'}
          </h2>
          <p className="text-xs text-muted-foreground">
            Configure nome, escopo e design tokens
          </p>
        </div>
      </div>

      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações Básicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Meu Template" />
            </div>
            <div className="space-y-2">
              <Label>Escopo</Label>
              <Select value={scope} onValueChange={v => setScope(v as TemplateScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="category">Categoria</SelectItem>
                  <SelectItem value="subcategory">Subcategoria</SelectItem>
                  <SelectItem value="seasonal">Sazonal</SelectItem>
                  <SelectItem value="company">Empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      {/* Design Tokens - Light */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">☀️ Variante Light</CardTitle>
          <CardDescription>Cores e tokens para o modo claro</CardDescription>
        </CardHeader>
        <CardContent>
          {renderTokenEditor('light', lightTokens)}
        </CardContent>
      </Card>

      {/* Design Tokens - Dark */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">🌙 Variante Dark</CardTitle>
          <CardDescription>Cores e tokens para o modo escuro</CardDescription>
        </CardHeader>
        <CardContent>
          {renderTokenEditor('dark', darkTokens)}
        </CardContent>
      </Card>

      {/* Assets (only for existing templates) */}
      {isEditing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📁 Assets</CardTitle>
            <CardDescription>Imagens de fundo, padrões e banners</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload zone */}
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-muted-foreground/40'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {isDragActive ? 'Solte aqui...' : 'Arraste imagens ou clique para upload'}
              </p>
            </div>

            {/* Assets list */}
            {assets && assets.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {assets.map(asset => (
                  <div key={asset.id} className="relative group rounded-lg border overflow-hidden">
                    <img
                      src={asset.file_url}
                      alt={asset.asset_type}
                      className="w-full h-24 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="p-2 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">{asset.asset_type}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive/60 hover:text-destructive"
                        onClick={() => deleteAsset.mutate(asset)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save / Cancel */}
      <div className="flex gap-3 justify-end sticky bottom-4">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          disabled={!name.trim() || createTemplate.isPending || updateTemplate.isPending}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          Salvar Template
        </Button>
      </div>
    </div>
  );
}
