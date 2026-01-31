import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sun, Moon, Monitor, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ColorModePreference } from '@/hooks/useColorMode';

interface ColorModeToggleProps {
  mode: ColorModePreference;
  effectiveMode: 'light' | 'dark';
  onModeChange: (mode: ColorModePreference) => void;
  previewMode: 'light' | 'dark' | null;
  onPreviewChange: (mode: 'light' | 'dark' | null) => void;
  companyColorHex?: string;
}

const modeOptions: { value: ColorModePreference; label: string; icon: React.ElementType; description: string }[] = [
  { 
    value: 'light', 
    label: 'Claro', 
    icon: Sun, 
    description: 'Tema claro sempre ativo' 
  },
  { 
    value: 'dark', 
    label: 'Escuro', 
    icon: Moon, 
    description: 'Tema escuro sempre ativo' 
  },
  { 
    value: 'auto', 
    label: 'Automático', 
    icon: Monitor, 
    description: 'Segue preferência do sistema' 
  },
];

export function ColorModeToggle({
  mode,
  effectiveMode,
  onModeChange,
  previewMode,
  onPreviewChange,
  companyColorHex,
}: ColorModeToggleProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {effectiveMode === 'dark' ? (
            <Moon className="h-5 w-5 text-primary" />
          ) : (
            <Sun className="h-5 w-5 text-primary" />
          )}
          <CardTitle className="text-lg">Modo de Visualização</CardTitle>
        </div>
        <CardDescription>
          Escolha entre modo claro, escuro ou automático. As cores são adaptadas automaticamente 
          da sua paleta base, garantindo legibilidade em qualquer ambiente.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Info about automatic adaptation */}
        <div className="p-4 rounded-lg bg-muted/50 border">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Cores inteligentes:</span>{' '}
            O sistema adapta automaticamente sua paleta de cores para cada modo, 
            ajustando luminosidade e saturação para garantir conforto visual.
          </p>
          {companyColorHex && (
            <div className="flex items-center gap-2 mt-3">
              <div 
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: companyColorHex }}
              />
              <span className="text-xs text-muted-foreground">
                Paleta base derivada da Cor da Empresa
              </span>
            </div>
          )}
        </div>

        {/* Mode Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Preferência de Tema</Label>
          <div className="grid grid-cols-3 gap-3">
            {modeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => onModeChange(option.value)}
                className={cn(
                  "relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                  mode === option.value
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-muted-foreground/30"
                )}
              >
                <option.icon className={cn(
                  "h-6 w-6",
                  mode === option.value ? "text-primary" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-sm font-medium",
                  mode === option.value ? "text-primary" : "text-foreground"
                )}>
                  {option.label}
                </span>
                <span className="text-[10px] text-muted-foreground text-center">
                  {option.description}
                </span>
                {mode === option.value && (
                  <Badge variant="secondary" className="absolute -top-2 -right-2 text-[9px] px-1.5">
                    Ativo
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Current effective mode */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
          <div className="flex items-center gap-2">
            {effectiveMode === 'dark' ? (
              <Moon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Sun className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm">
              Modo atual: <strong>{effectiveMode === 'dark' ? 'Escuro' : 'Claro'}</strong>
              {mode === 'auto' && (
                <span className="text-muted-foreground ml-1">(via sistema)</span>
              )}
            </span>
          </div>
        </div>

        {/* Preview Buttons */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Pré-visualizar sem salvar
          </Label>
          <div className="flex gap-2">
            <Button
              variant={previewMode === 'light' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPreviewChange(previewMode === 'light' ? null : 'light')}
              className="gap-2"
            >
              <Sun className="h-4 w-4" />
              Preview Claro
            </Button>
            <Button
              variant={previewMode === 'dark' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPreviewChange(previewMode === 'dark' ? null : 'dark')}
              className="gap-2"
            >
              <Moon className="h-4 w-4" />
              Preview Escuro
            </Button>
            {previewMode && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPreviewChange(null)}
              >
                Cancelar Preview
              </Button>
            )}
          </div>
          {previewMode && (
            <p className="text-xs text-warning">
              ⚠️ Você está visualizando o modo {previewMode === 'dark' ? 'escuro' : 'claro'}. 
              Selecione uma preferência acima para salvar.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
