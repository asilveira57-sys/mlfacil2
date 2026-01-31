import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MODULE_CATALOG } from '@/types/collaborator';

interface CollaboratorModuleGridProps {
  selectedModules: Record<string, boolean>;
  onChange: (modules: Record<string, boolean>) => void;
  disabled?: boolean;
}

export function CollaboratorModuleGrid({ 
  selectedModules, 
  onChange,
  disabled = false
}: CollaboratorModuleGridProps) {
  const handleToggle = (key: string, checked: boolean) => {
    onChange({
      ...selectedModules,
      [key]: checked,
    });
  };

  const handleSelectAll = () => {
    const allEnabled = MODULE_CATALOG.reduce((acc, mod) => {
      acc[mod.key] = true;
      return acc;
    }, {} as Record<string, boolean>);
    onChange(allEnabled);
  };

  const handleDeselectAll = () => {
    const allDisabled = MODULE_CATALOG.reduce((acc, mod) => {
      acc[mod.key] = false;
      return acc;
    }, {} as Record<string, boolean>);
    onChange(allDisabled);
  };

  const enabledCount = Object.values(selectedModules).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          Módulos habilitados ({enabledCount}/{MODULE_CATALOG.length})
        </Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={disabled}
            className="text-xs text-primary hover:underline disabled:opacity-50"
          >
            Selecionar todos
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            type="button"
            onClick={handleDeselectAll}
            disabled={disabled}
            className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
          >
            Limpar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {MODULE_CATALOG.map((mod) => (
          <div
            key={mod.key}
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
              selectedModules[mod.key] 
                ? 'border-primary/30 bg-primary/5' 
                : 'border-border bg-background hover:border-muted-foreground/30'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Checkbox
              id={`module-${mod.key}`}
              checked={!!selectedModules[mod.key]}
              onCheckedChange={(checked) => handleToggle(mod.key, !!checked)}
              disabled={disabled}
              className="mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor={`module-${mod.key}`}
                  className="text-sm font-medium cursor-pointer select-none"
                  onClick={() => !disabled && handleToggle(mod.key, !selectedModules[mod.key])}
                >
                  {mod.label}
                </Label>
                {mod.restricted && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Restrito
                  </Badge>
                )}
              </div>
              {mod.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {mod.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
