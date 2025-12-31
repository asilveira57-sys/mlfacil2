import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Check } from "lucide-react";
import { AbcConfig } from "@/pages/AbcAnalysis";

interface AbcConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AbcConfig;
  onSave: (config: AbcConfig) => void;
}

export function AbcConfigPanel({
  open,
  onOpenChange,
  config,
  onSave,
}: AbcConfigPanelProps) {
  const [localConfig, setLocalConfig] = useState<AbcConfig>(config);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalConfig(config);
    setError(null);
  }, [config, open]);

  const total = localConfig.percentA + localConfig.percentB + localConfig.percentC;
  const isValid = total === 100;

  const handleChange = (key: keyof AbcConfig, value: string) => {
    const numValue = parseInt(value) || 0;
    const clampedValue = Math.max(0, Math.min(100, numValue));
    
    setLocalConfig((prev) => ({
      ...prev,
      [key]: clampedValue,
    }));
    setError(null);
  };

  const handleSave = () => {
    if (!isValid) {
      // Auto-adjust C to make total = 100
      const adjusted = {
        ...localConfig,
        percentC: 100 - localConfig.percentA - localConfig.percentB,
      };
      
      if (adjusted.percentC < 0) {
        setError("A soma dos percentuais A e B não pode exceder 100%");
        return;
      }
      
      setLocalConfig(adjusted);
      onSave(adjusted);
    } else {
      onSave(localConfig);
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Configuração ABC</SheetTitle>
          <SheetDescription>
            Define os percentuais de classificação para a curva ABC.
            O total deve somar 100%.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Percent A */}
          <div className="space-y-2">
            <Label htmlFor="percentA" className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-success/20 text-success text-xs font-medium">
                Classe A
              </span>
              Itens de alta prioridade
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="percentA"
                type="number"
                min={0}
                max={100}
                value={localConfig.percentA}
                onChange={(e) => handleChange("percentA", e.target.value)}
                className="w-24"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          </div>

          {/* Percent B */}
          <div className="space-y-2">
            <Label htmlFor="percentB" className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-warning/20 text-warning text-xs font-medium">
                Classe B
              </span>
              Itens de média prioridade
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="percentB"
                type="number"
                min={0}
                max={100}
                value={localConfig.percentB}
                onChange={(e) => handleChange("percentB", e.target.value)}
                className="w-24"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          </div>

          {/* Percent C */}
          <div className="space-y-2">
            <Label htmlFor="percentC" className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-destructive/20 text-destructive text-xs font-medium">
                Classe C
              </span>
              Itens de baixa prioridade
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="percentC"
                type="number"
                min={0}
                max={100}
                value={localConfig.percentC}
                onChange={(e) => handleChange("percentC", e.target.value)}
                className="w-24"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          </div>

          {/* Total indicator */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <span className="font-medium">Total:</span>
              <span
                className={`font-bold ${
                  isValid ? "text-success" : "text-destructive"
                }`}
              >
                {total}%
              </span>
            </div>
            
            {!isValid && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {total < 100
                    ? `Faltam ${100 - total}% para completar 100%`
                    : `Excede em ${total - 100}% o limite de 100%`}
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSave}>
              <Check className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
