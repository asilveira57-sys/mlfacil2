import { Printer, FileText } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface OnboardingPrintPrefsProps {
  printMode: string;
  labelSize: string;
  onChangePrintMode: (mode: string) => void;
  onChangeLabelSize: (size: string) => void;
}

const PRINT_MODES = [
  { id: 'zpl', label: 'ZPL/EPL', description: 'Impressoras térmicas (Zebra, etc.)' },
  { id: 'pdf', label: 'PDF', description: 'Impressoras comuns (jato de tinta, laser)' },
];

const LABEL_SIZES = [
  { value: '4x6', label: '4x6 polegadas (102x152mm)' },
  { value: '4x4', label: '4x4 polegadas (102x102mm)' },
  { value: '4x2', label: '4x2 polegadas (102x51mm)' },
];

export function OnboardingPrintPrefs({
  printMode,
  labelSize,
  onChangePrintMode,
  onChangeLabelSize,
}: OnboardingPrintPrefsProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Printer className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">Preferências de Impressão</h2>
        <p className="text-muted-foreground text-sm">
          Configure o padrão para suas etiquetas
        </p>
      </div>

      {/* Print Mode */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Modo de impressão</Label>
        <RadioGroup value={printMode} onValueChange={onChangePrintMode} className="space-y-2">
          {PRINT_MODES.map((mode) => (
            <label
              key={mode.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                printMode === mode.id 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value={mode.id} />
              <div className="flex-1">
                <p className="font-medium text-sm">{mode.label}</p>
                <p className="text-xs text-muted-foreground">{mode.description}</p>
              </div>
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* Label Size */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Tamanho padrão da etiqueta</Label>
        <Select value={labelSize} onValueChange={onChangeLabelSize}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LABEL_SIZES.map((size) => (
              <SelectItem key={size.value} value={size.value}>
                {size.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Você pode alterar isso a qualquer momento ao gerar etiquetas.
        </p>
      </div>
    </div>
  );
}
