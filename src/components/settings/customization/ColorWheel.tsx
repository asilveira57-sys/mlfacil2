import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { 
  HSLColor, 
  hslToString, 
  hslToHex, 
  parseHSL, 
  generateHarmonies,
  getContrastColor 
} from '@/hooks/useThemeCustomization';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, Palette, Pipette } from 'lucide-react';

interface ColorWheelProps {
  value: string; // HSL string like "220 70% 50%"
  onChange: (value: string) => void;
  label?: string;
  showHarmonies?: boolean;
  showQuickPalette?: boolean;
}

// Quick palette colors
const QUICK_PALETTE = [
  { h: 220, s: 82, l: 65 }, // Blue
  { h: 148, s: 42, l: 49 }, // Green
  { h: 262, s: 47, l: 63 }, // Purple
  { h: 174, s: 61, l: 40 }, // Teal
  { h: 14, s: 100, l: 70 },  // Orange
  { h: 340, s: 82, l: 76 }, // Pink
  { h: 232, s: 50, l: 64 }, // Indigo
  { h: 37, s: 100, l: 65 },  // Amber
  { h: 187, s: 71, l: 59 }, // Cyan
  { h: 200, s: 18, l: 54 }, // Slate
];

export function ColorWheel({ 
  value, 
  onChange, 
  label = 'Cor',
  showHarmonies = true,
  showQuickPalette = true,
}: ColorWheelProps) {
  const parsed = parseHSL(value);
  const [color, setColor] = useState<HSLColor>(parsed || { h: 220, s: 70, l: 50 });
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newParsed = parseHSL(value);
    if (newParsed) {
      setColor(newParsed);
    }
  }, [value]);

  const updateColor = useCallback((newColor: HSLColor) => {
    setColor(newColor);
    onChange(hslToString(newColor));
  }, [onChange]);

  const handleWheelClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!wheelRef.current) return;
    
    const rect = wheelRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const x = e.clientX - rect.left - centerX;
    const y = e.clientY - rect.top - centerY;
    
    // Calculate angle (hue)
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    
    // Calculate distance from center (saturation)
    const maxRadius = Math.min(centerX, centerY);
    const distance = Math.min(Math.sqrt(x * x + y * y), maxRadius);
    const saturation = Math.round((distance / maxRadius) * 100);
    
    updateColor({ ...color, h: Math.round(angle), s: saturation });
  }, [color, updateColor]);

  const harmonies = generateHarmonies(color);
  const contrastColor = getContrastColor(color);

  return (
    <div className="space-y-3">
      {label && (
        <Label className="text-sm font-medium">{label}</Label>
      )}
      
      <div className="flex items-center gap-3">
        {/* Color preview button */}
        <Popover open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "w-10 h-10 rounded-lg border-2 shadow-sm transition-all",
                "hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              )}
              style={{ 
                backgroundColor: `hsl(${hslToString(color)})`,
                borderColor: `hsl(${hslToString(contrastColor)} / 0.3)`,
              }}
              title="Clique para abrir o editor avançado"
            >
              <span className="sr-only">Selecionar cor</span>
            </button>
          </PopoverTrigger>
          
          <PopoverContent className="w-80 p-4" align="start">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                <span className="font-medium text-sm">Editor Avançado</span>
              </div>
              
              {/* Color Wheel */}
              <div 
                ref={wheelRef}
                onClick={handleWheelClick}
                className="relative w-full aspect-square rounded-full cursor-crosshair overflow-hidden"
                style={{
                  background: `conic-gradient(
                    hsl(0, 100%, 50%),
                    hsl(60, 100%, 50%),
                    hsl(120, 100%, 50%),
                    hsl(180, 100%, 50%),
                    hsl(240, 100%, 50%),
                    hsl(300, 100%, 50%),
                    hsl(360, 100%, 50%)
                  )`,
                }}
              >
                {/* Saturation overlay */}
                <div 
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, white, transparent)',
                  }}
                />
                
                {/* Current position indicator */}
                <div
                  className="absolute w-4 h-4 rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    left: `${50 + (color.s / 100) * 50 * Math.cos((color.h * Math.PI) / 180)}%`,
                    top: `${50 + (color.s / 100) * 50 * Math.sin((color.h * Math.PI) / 180)}%`,
                    backgroundColor: `hsl(${hslToString(color)})`,
                  }}
                />
              </div>
              
              {/* Lightness Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Luminosidade</span>
                  <span>{color.l}%</span>
                </div>
                <Slider
                  value={[color.l]}
                  onValueChange={([l]) => updateColor({ ...color, l })}
                  min={5}
                  max={95}
                  step={1}
                  className="w-full"
                />
              </div>
              
              {/* Saturation Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Saturação</span>
                  <span>{color.s}%</span>
                </div>
                <Slider
                  value={[color.s]}
                  onValueChange={([s]) => updateColor({ ...color, s })}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>
              
              {/* HEX Input */}
              <div className="flex items-center gap-2">
                <Label className="text-xs">HEX:</Label>
                <Input
                  value={hslToHex(color)}
                  onChange={(e) => {
                    const hex = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                      const parsed = parseHSL(value);
                      if (parsed) {
                        // Simple hex to HSL conversion
                        const r = parseInt(hex.slice(1, 3), 16) / 255;
                        const g = parseInt(hex.slice(3, 5), 16) / 255;
                        const b = parseInt(hex.slice(5, 7), 16) / 255;
                        const max = Math.max(r, g, b);
                        const min = Math.min(r, g, b);
                        let h = 0, s = 0;
                        const l = (max + min) / 2;
                        if (max !== min) {
                          const d = max - min;
                          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                          switch (max) {
                            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                            case g: h = ((b - r) / d + 2) / 6; break;
                            case b: h = ((r - g) / d + 4) / 6; break;
                          }
                        }
                        updateColor({
                          h: Math.round(h * 360),
                          s: Math.round(s * 100),
                          l: Math.round(l * 100),
                        });
                      }
                    }
                  }}
                  className="h-8 font-mono text-xs"
                  maxLength={7}
                />
              </div>
              
              {/* Harmonies */}
              {showHarmonies && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Sugestões de harmonia:</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {harmonies.map((harmony) => (
                      <button
                        key={harmony.name}
                        onClick={() => updateColor(harmony.color)}
                        className="w-7 h-7 rounded border border-border hover:scale-110 transition-transform"
                        style={{ backgroundColor: `hsl(${hslToString(harmony.color)})` }}
                        title={harmony.name}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
        
        {/* Quick palette */}
        {showQuickPalette && (
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PALETTE.map((c, i) => (
              <button
                key={i}
                onClick={() => updateColor(c)}
                className={cn(
                  "w-6 h-6 rounded-md border transition-all hover:scale-110",
                  color.h === c.h && color.s === c.s 
                    ? "ring-2 ring-ring ring-offset-2" 
                    : "border-border"
                )}
                style={{ backgroundColor: `hsl(${hslToString(c)})` }}
              >
                {color.h === c.h && color.s === c.s && (
                  <Check className="w-3 h-3 text-white mx-auto" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
