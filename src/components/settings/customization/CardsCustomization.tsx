import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ColorWheel } from './ColorWheel';
import { 
  CardThemeSettings, 
  ThemePreset,
} from '@/hooks/useThemeCustomization';
import { 
  LayoutGrid,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ShoppingCart,
} from 'lucide-react';

interface CardsCustomizationProps {
  theme: CardThemeSettings;
  onColorChange: (key: keyof CardThemeSettings, value: string) => void;
  presets: ThemePreset[];
  onApplyPreset: (preset: ThemePreset) => void;
}

const colorFields: { key: keyof CardThemeSettings; label: string; description: string }[] = [
  { key: 'card_bg_color', label: 'Fundo do Card', description: 'Cor de fundo dos cards' },
  { key: 'card_title_color', label: 'Título', description: 'Cor dos títulos' },
  { key: 'card_value_color', label: 'Valor Principal', description: 'Cor dos valores/números' },
  { key: 'card_text_secondary_color', label: 'Texto Secundário', description: 'Textos auxiliares' },
  { key: 'card_border_color', label: 'Borda', description: 'Cor das bordas' },
];

const indicatorFields: { key: keyof CardThemeSettings; label: string; icon: React.ElementType }[] = [
  { key: 'card_indicator_positive', label: 'Positivo', icon: TrendingUp },
  { key: 'card_indicator_warning', label: 'Alerta', icon: AlertTriangle },
  { key: 'card_indicator_critical', label: 'Crítico', icon: TrendingDown },
];

export function CardsCustomization({ 
  theme, 
  onColorChange, 
  presets,
  onApplyPreset,
}: CardsCustomizationProps) {
  const sampleCards = [
    { 
      title: 'Pedidos (30d)', 
      value: '1.234', 
      indicator: 'positive' as const,
      change: '+12%',
      icon: ShoppingCart,
    },
    { 
      title: 'Alertas Pendentes', 
      value: '5', 
      indicator: 'warning' as const,
      change: '3 novos',
      icon: AlertTriangle,
    },
    { 
      title: 'ACOS Médio', 
      value: '35%', 
      indicator: 'critical' as const,
      change: 'Alto',
      icon: TrendingDown,
    },
  ];

  const getIndicatorColor = (indicator: 'positive' | 'warning' | 'critical') => {
    switch (indicator) {
      case 'positive': return theme.card_indicator_positive;
      case 'warning': return theme.card_indicator_warning;
      case 'critical': return theme.card_indicator_critical;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Cards do Dashboard</CardTitle>
        </div>
        <CardDescription>
          Personalize as cores dos cards de métricas e KPIs
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Presets */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Temas Rápidos</Label>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                onClick={() => onApplyPreset(preset)}
                className="gap-2"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ 
                    backgroundColor: `hsl(${preset.theme_data.card_bg_color || '0 0% 100%'})` 
                  }}
                />
                {preset.name}
                {preset.is_default && (
                  <Badge variant="secondary" className="text-[10px] px-1">Padrão</Badge>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Main Color Pickers */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Cores Principais</Label>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {colorFields.map((field) => (
              <div key={field.key} className="space-y-1">
                <ColorWheel
                  value={theme[field.key]}
                  onChange={(value) => onColorChange(field.key, value)}
                  label={field.label}
                  showHarmonies={false}
                />
                <p className="text-[10px] text-muted-foreground">{field.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Indicator Color Pickers */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Cores de Indicadores</Label>
          <div className="grid gap-4 sm:grid-cols-3">
            {indicatorFields.map((field) => (
              <div key={field.key} className="space-y-1">
                <ColorWheel
                  value={theme[field.key]}
                  onChange={(value) => onColorChange(field.key, value)}
                  label={field.label}
                  showHarmonies={false}
                  showQuickPalette={false}
                />
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <field.icon className="w-3 h-3" />
                  <span>Indicador de status</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Preview */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Preview em Tempo Real</Label>
          
          <div className="grid gap-3 sm:grid-cols-3">
            {sampleCards.map((card, i) => (
              <div
                key={i}
                className="p-4 rounded-lg shadow-sm transition-all"
                style={{ 
                  backgroundColor: `hsl(${theme.card_bg_color})`,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: `hsl(${theme.card_border_color})`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p 
                      className="text-xs mb-1"
                      style={{ color: `hsl(${theme.card_text_secondary_color})` }}
                    >
                      {card.title}
                    </p>
                    <p 
                      className="text-2xl font-bold"
                      style={{ color: `hsl(${theme.card_value_color})` }}
                    >
                      {card.value}
                    </p>
                    <p 
                      className="text-xs mt-1"
                      style={{ color: `hsl(${getIndicatorColor(card.indicator)})` }}
                    >
                      {card.change}
                    </p>
                  </div>
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ 
                      backgroundColor: `hsl(${getIndicatorColor(card.indicator)} / 0.1)`,
                    }}
                  >
                    <card.icon 
                      className="w-5 h-5"
                      style={{ color: `hsl(${getIndicatorColor(card.indicator)})` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
