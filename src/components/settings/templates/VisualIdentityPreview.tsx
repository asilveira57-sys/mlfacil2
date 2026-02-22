import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Palette } from 'lucide-react';
import type { DesignTokens } from '@/types/templates';

interface VisualGroup {
  slug: string;
  nome: string;
  gradiente_inicio: string;
  gradiente_fim: string;
  imagem_overlay_url: string | null;
  intensidade_padrao: number;
}

interface VisualIdentityPreviewProps {
  groups: VisualGroup[];
  selectedSlug: string;
  onSelectSlug: (slug: string) => void;
  intensity: number;
  onIntensityChange: (value: number) => void;
  resolvedTokens: DesignTokens | null;
}

export function VisualIdentityControls({
  groups,
  selectedSlug,
  onSelectSlug,
  intensity,
  onIntensityChange,
}: Omit<VisualIdentityPreviewProps, 'resolvedTokens'>) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs">Grupo Visual (opcional)</Label>
        <Select value={selectedSlug} onValueChange={onSelectSlug}>
          <SelectTrigger>
            <SelectValue placeholder="Nenhum overlay" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum overlay</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.slug} value={g.slug}>
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full border flex-shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${g.gradiente_inicio}, ${g.gradiente_fim})`,
                    }}
                  />
                  {g.nome}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedSlug !== 'none' && (
        <div className="space-y-2">
          <Label className="text-xs">Intensidade: {intensity}</Label>
          <Slider
            min={1}
            max={10}
            step={1}
            value={[intensity]}
            onValueChange={([v]) => onIntensityChange(v)}
          />
        </div>
      )}
    </>
  );
}

export function CombinedPreview({
  resolvedTokens,
  group,
  intensity,
  overlayUrl,
}: {
  resolvedTokens: DesignTokens;
  group: VisualGroup | null;
  intensity: number;
  overlayUrl?: string | null;
}) {
  const bg = (resolvedTokens as any).background || '0 0% 100%';
  const card = (resolvedTokens as any).card || bg;
  const fg = (resolvedTokens as any).foreground || '0 0% 0%';
  const primary = (resolvedTokens as any).primary || '220 70% 50%';
  const muted = (resolvedTokens as any).muted_foreground || (resolvedTokens as any)['muted-foreground'] || '0 0% 45%';

  const opacityValue = group ? Math.min(Math.max(intensity / 10, 0.05), 0.8) : 0;
  const gradient = group
    ? `linear-gradient(135deg, ${group.gradiente_inicio}, ${group.gradiente_fim})`
    : undefined;

  return (
    <div
      className="relative rounded-lg border overflow-hidden"
      style={{ background: `hsl(${bg})`, minHeight: 180 }}
    >
      {/* Gradient overlay */}
      {gradient && (
        <div
          className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-500"
          style={{
            background: gradient,
            opacity: opacityValue,
            mixBlendMode: 'overlay',
          }}
        />
      )}

      {/* Image overlay */}
      {(group?.imagem_overlay_url || overlayUrl) && (
        <div
          className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-500"
          style={{
            backgroundImage: `url(${group?.imagem_overlay_url || overlayUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: opacityValue * 0.5,
            mixBlendMode: 'soft-light',
          }}
        />
      )}

      {/* Sample content */}
      <div className="relative z-10 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4" style={{ color: `hsl(${primary})` }} />
          <span className="font-semibold text-sm" style={{ color: `hsl(${fg})` }}>
            Preview Integrado
          </span>
        </div>

        <div
          className="rounded-md p-3 space-y-2"
          style={{ background: `hsl(${card})` }}
        >
          <div className="flex gap-2">
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: `hsl(${primary} / 0.15)`,
                color: `hsl(${primary})`,
              }}
            >
              Badge
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{
                background: `hsl(${muted} / 0.15)`,
                color: `hsl(${muted})`,
              }}
            >
              Exemplo
            </span>
          </div>
          <p className="text-xs" style={{ color: `hsl(${fg})` }}>
            Este preview mostra como os tokens de cor se combinam com o overlay visual selecionado.
          </p>
          <div
            className="h-2 rounded-full"
            style={{ background: `hsl(${primary})`, width: '60%' }}
          />
        </div>

        {group && (
          <p className="text-[10px]" style={{ color: `hsl(${muted})` }}>
            Overlay: {group.nome} · Intensidade: {opacityValue.toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}
