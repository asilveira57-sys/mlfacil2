import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link2, Link2Off, RotateCcw, Save, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SyncSettingsProps {
  isSynced: boolean;
  onBreakSync: () => void;
  onEnableSync: () => void;
  hasChanges: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  companyColorHex?: string;
  companyColorName?: string;
}

export function SyncSettings({
  isSynced,
  onBreakSync,
  onEnableSync,
  hasChanges,
  saving,
  onSave,
  onReset,
  companyColorHex,
  companyColorName,
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
          Gerencie a identidade visual unificada do sistema
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Current Status */}
        <Alert className={cn(
          "border-2",
          isSynced ? "border-primary/30 bg-primary/5" : "border-muted"
        )}>
          <div className="flex items-start gap-3">
            {isSynced ? (
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
            )}
            <div className="space-y-1">
              <p className="font-medium text-sm">
                {isSynced 
                  ? 'Cores unificadas ativas' 
                  : 'Modo avançado: cores independentes'}
              </p>
              <AlertDescription className="text-xs text-muted-foreground">
                {isSynced 
                  ? 'Menu, atalhos e cards seguem automaticamente a Cor da Empresa. Altere a cor na aba "Atalhos" para aplicar em todo o sistema.' 
                  : 'Cada área (menu, cards, atalhos) pode ter cores personalizadas independentes.'}
              </AlertDescription>
            </div>
          </div>
        </Alert>

        {/* Company Color Preview */}
        {isSynced && companyColorHex && (
          <div className="p-4 rounded-lg border bg-muted/30">
            <Label className="text-xs text-muted-foreground mb-2 block">Cor da Empresa Ativa</Label>
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg shadow-sm"
                style={{ backgroundColor: companyColorHex }}
              />
              <div>
                <p className="font-medium text-sm">{companyColorName || 'Personalizada'}</p>
                <p className="text-xs text-muted-foreground">Aplicada em todo o sistema</p>
              </div>
            </div>
          </div>
        )}

        {/* Sync Toggle */}
        <div className="p-4 rounded-lg border bg-card">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Usar cores unificadas da empresa</Label>
              <p className="text-xs text-muted-foreground">
                {isSynced 
                  ? 'Desligar permite personalização avançada por área' 
                  : 'Ligar sincroniza todas as áreas com a Cor da Empresa'}
              </p>
            </div>
            <Switch
              checked={isSynced}
              onCheckedChange={(checked) => {
                if (checked) {
                  onEnableSync();
                } else {
                  onBreakSync();
                }
              }}
            />
          </div>
          
          {!isSynced && (
            <p className="text-xs text-warning mt-3 p-2 bg-warning/10 rounded">
              ⚠️ No modo avançado, alterações em uma área não afetam as outras. 
              Para voltar ao padrão unificado, ative a sincronização acima.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
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
