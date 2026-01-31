import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Link2, Link2Off, RotateCcw, Save, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SyncSettingsProps {
  isSynced: boolean;
  onSyncChange: (synced: boolean) => void;
  hasChanges: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}

export function SyncSettings({
  isSynced,
  onSyncChange,
  hasChanges,
  saving,
  onSave,
  onReset,
}: SyncSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {isSynced ? (
            <Link2 className="h-5 w-5 text-primary" />
          ) : (
            <Link2Off className="h-5 w-5 text-muted-foreground" />
          )}
          <CardTitle className="text-lg">Sincronização Visual</CardTitle>
        </div>
        <CardDescription>
          Sincronize as cores do menu, cards e atalhos para uma identidade visual unificada
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Sincronizar identidade visual</Label>
            <p className="text-xs text-muted-foreground">
              {isSynced 
                ? 'Menu, atalhos e cards usam a mesma paleta base' 
                : 'Cada área tem personalização independente'}
            </p>
          </div>
          <Switch
            checked={isSynced}
            onCheckedChange={onSyncChange}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={onReset}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Restaurar Padrão
          </Button>
          
          <Button
            onClick={onSave}
            disabled={!hasChanges || saving}
            className={cn(
              "gap-2",
              hasChanges && "animate-pulse"
            )}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
