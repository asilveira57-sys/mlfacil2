import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ColorWheel } from './ColorWheel';
import { 
  MenuThemeSettings, 
  ThemePreset,
  parseHSL,
  hslToString,
} from '@/hooks/useThemeCustomization';
import { 
  Menu, 
  LayoutDashboard, 
  Settings, 
  BarChart3,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MenuCustomizationProps {
  theme: MenuThemeSettings;
  onColorChange: (key: keyof MenuThemeSettings, value: string) => void;
  presets: ThemePreset[];
  onApplyPreset: (preset: ThemePreset) => void;
}

const colorFields: { key: keyof MenuThemeSettings; label: string; description: string }[] = [
  { key: 'menu_bg_color', label: 'Fundo do Menu', description: 'Cor de fundo principal' },
  { key: 'menu_text_color', label: 'Texto', description: 'Cor do texto padrão' },
  { key: 'menu_icon_color', label: 'Ícones', description: 'Cor dos ícones' },
  { key: 'menu_item_active_color', label: 'Item Ativo', description: 'Destaque do item selecionado' },
  { key: 'menu_item_hover_color', label: 'Hover', description: 'Cor ao passar o mouse' },
];

export function MenuCustomization({ 
  theme, 
  onColorChange, 
  presets,
  onApplyPreset,
}: MenuCustomizationProps) {
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', active: true },
    { icon: BarChart3, label: 'Analytics', active: false },
    { icon: Settings, label: 'Configurações', active: false },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Menu className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Menu Lateral</CardTitle>
        </div>
        <CardDescription>
          Personalize as cores do menu de navegação lateral
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
                    backgroundColor: `hsl(${preset.theme_data.menu_bg_color || '0 0% 100%'})` 
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

        {/* Color Pickers */}
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

        {/* Live Preview */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Preview em Tempo Real</Label>
          
          <div className="flex gap-4">
            {/* Collapsed Preview */}
            <div 
              className="w-16 rounded-lg border shadow-sm overflow-hidden"
              style={{ backgroundColor: `hsl(${theme.menu_bg_color})` }}
            >
              <div className="p-2 border-b" style={{ borderColor: `hsl(${theme.menu_item_hover_color})` }}>
                <div 
                  className="w-8 h-8 rounded-lg mx-auto flex items-center justify-center"
                  style={{ backgroundColor: `hsl(${theme.menu_item_active_color})` }}
                >
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
              </div>
              <div className="p-2 space-y-2">
                {menuItems.map((item, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-full h-8 rounded flex items-center justify-center transition-colors",
                      item.active ? "opacity-100" : "opacity-70"
                    )}
                    style={{ 
                      backgroundColor: item.active 
                        ? `hsl(${theme.menu_item_hover_color})` 
                        : 'transparent',
                    }}
                  >
                    <item.icon 
                      className="w-4 h-4" 
                      style={{ 
                        color: item.active 
                          ? `hsl(${theme.menu_item_active_color})` 
                          : `hsl(${theme.menu_icon_color})` 
                      }} 
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Expanded Preview */}
            <div 
              className="flex-1 max-w-64 rounded-lg border shadow-sm overflow-hidden"
              style={{ backgroundColor: `hsl(${theme.menu_bg_color})` }}
            >
              <div 
                className="p-3 border-b flex items-center gap-2" 
                style={{ borderColor: `hsl(${theme.menu_item_hover_color})` }}
              >
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `hsl(${theme.menu_item_active_color})` }}
                >
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div 
                    className="text-sm font-bold"
                    style={{ color: `hsl(${theme.menu_text_color})` }}
                  >
                    Mktpfacil
                  </div>
                  <div 
                    className="text-[10px]"
                    style={{ color: `hsl(${theme.menu_icon_color})` }}
                  >
                    Analytics Pro
                  </div>
                </div>
              </div>
              <div className="p-2 space-y-1">
                {menuItems.map((item, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-full px-3 py-2 rounded flex items-center gap-3 transition-colors cursor-pointer",
                      item.active ? "opacity-100" : "opacity-80 hover:opacity-100"
                    )}
                    style={{ 
                      backgroundColor: item.active 
                        ? `hsl(${theme.menu_item_hover_color})` 
                        : 'transparent',
                    }}
                  >
                    <item.icon 
                      className="w-4 h-4" 
                      style={{ 
                        color: item.active 
                          ? `hsl(${theme.menu_item_active_color})` 
                          : `hsl(${theme.menu_icon_color})` 
                      }} 
                    />
                    <span 
                      className="text-sm"
                      style={{ 
                        color: item.active 
                          ? `hsl(${theme.menu_item_active_color})` 
                          : `hsl(${theme.menu_text_color})`,
                        fontWeight: item.active ? 500 : 400,
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
