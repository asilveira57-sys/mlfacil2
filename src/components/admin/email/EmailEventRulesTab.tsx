import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Pencil, Zap, Clock, Shield } from 'lucide-react';
import { useEmailEventRules, type EmailEventRule } from '@/hooks/useEmailAdmin';

export function EmailEventRulesTab() {
  const { data: rules, isLoading, updateRule } = useEmailEventRules();
  const [editing, setEditing] = useState<EmailEventRule | null>(null);

  const handleSave = () => {
    if (!editing) return;
    updateRule.mutate({
      id: editing.id,
      is_enabled: editing.is_enabled,
      cooldown_minutes: editing.cooldown_minutes,
      max_per_day: editing.max_per_day,
      scope: editing.scope,
    });
    setEditing(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" /> Regras de Eventos ({rules?.length || 0})
          </CardTitle>
          <CardDescription>Cada evento do sistema pode disparar um e-mail automaticamente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {rules?.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono font-medium">{rule.event_key}</code>
                    <Badge variant={rule.is_enabled ? 'default' : 'secondary'} className="text-[10px]">
                      {rule.is_enabled ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Cooldown: {rule.cooldown_minutes}min
                    </span>
                    <span className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Máx/dia: {rule.max_per_day}
                    </span>
                    <span>Escopo: {rule.scope}</span>
                    {rule.template_name && (
                      <span>Template: {rule.template_name}</span>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing({ ...rule })}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {(!rules || rules.length === 0) && (
              <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma regra cadastrada.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Regra: {editing?.event_key}</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Habilitado</Label>
                <Switch
                  checked={editing.is_enabled}
                  onCheckedChange={(v) => setEditing({ ...editing, is_enabled: v })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Escopo</Label>
                <Select
                  value={editing.scope}
                  onValueChange={(v) => setEditing({ ...editing, scope: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="company">Empresa</SelectItem>
                    <SelectItem value="both">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Cooldown (minutos)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.cooldown_minutes}
                    onChange={(e) => setEditing({ ...editing, cooldown_minutes: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Máx envios/dia</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editing.max_per_day}
                    onChange={(e) => setEditing({ ...editing, max_per_day: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={updateRule.isPending}>
              {updateRule.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
