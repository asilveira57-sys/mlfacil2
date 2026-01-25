import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { AutomationRule, AutomationAction, WorkspaceAccount } from '@/types/tasks';
import { TASK_PRIORITY_LABELS, SOURCE_TYPES } from '@/types/tasks';

interface AutomationRuleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: AutomationRule | null;
  accounts: WorkspaceAccount[];
  onSave: (rule: Partial<AutomationRule>) => Promise<void>;
}

const EVENT_TYPES = [
  { value: 'promotion.started', label: 'Promoção iniciada' },
  { value: 'promotion.ending_soon', label: 'Promoção terminando' },
  { value: 'promotion.ended', label: 'Promoção encerrada' },
  { value: 'cost.margin_low', label: 'Margem baixa detectada' },
  { value: 'cost.margin_negative', label: 'Margem negativa' },
  { value: 'competitor.price_drop', label: 'Concorrente baixou preço' },
  { value: 'competitor.buybox_lost', label: 'Perda de buybox' },
  { value: 'ads.budget_exhausted', label: 'Orçamento de anúncios esgotado' },
  { value: 'ads.low_performance', label: 'Performance de anúncios baixa' },
  { value: 'order.cancelled', label: 'Pedido cancelado' },
  { value: 'order.claim_opened', label: 'Reclamação aberta' },
  { value: 'listing.quality_drop', label: 'Qualidade do anúncio caiu' },
  { value: 'listing.paused', label: 'Anúncio pausado' },
  { value: 'listing.stock_low', label: 'Estoque baixo' },
];

const ACTION_TYPES = [
  { value: 'create_task', label: 'Criar tarefa' },
  { value: 'assign_to', label: 'Atribuir responsável' },
  { value: 'set_due_in_hours', label: 'Definir prazo (horas)' },
  { value: 'add_checklist', label: 'Adicionar checklist' },
  { value: 'notify', label: 'Notificar responsável' },
  { value: 'add_tag', label: 'Adicionar tag' },
];

export function AutomationRuleEditor({
  open,
  onOpenChange,
  rule,
  accounts,
  onSave,
}: AutomationRuleEditorProps) {
  const [name, setName] = useState('');
  const [triggerEventType, setTriggerEventType] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setName(rule.name);
      setTriggerEventType(rule.trigger_event_type);
      setAccountId(rule.account_id);
      setIsEnabled(rule.is_enabled);
      setActions(rule.actions);
    } else {
      setName('');
      setTriggerEventType('');
      setAccountId(null);
      setIsEnabled(true);
      setActions([]);
    }
  }, [rule, open]);

  const handleAddAction = () => {
    setActions([...actions, { type: 'create_task', params: {} }]);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const handleActionTypeChange = (index: number, type: AutomationAction['type']) => {
    const updated = [...actions];
    updated[index] = { type, params: {} };
    setActions(updated);
  };

  const handleActionParamChange = (index: number, key: string, value: unknown) => {
    const updated = [...actions];
    updated[index] = {
      ...updated[index],
      params: { ...updated[index].params, [key]: value },
    };
    setActions(updated);
  };

  const handleSave = async () => {
    if (!name.trim() || !triggerEventType) return;

    setSaving(true);
    try {
      await onSave({
        id: rule?.id,
        name: name.trim(),
        trigger_event_type: triggerEventType,
        account_id: accountId,
        is_enabled: isEnabled,
        conditions: {},
        actions,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const renderActionParams = (action: AutomationAction, index: number) => {
    switch (action.type) {
      case 'create_task':
        return (
          <div className="space-y-3 mt-3">
            <div>
              <Label className="text-xs">Título da tarefa</Label>
              <Input
                placeholder="Ex: Revisar {{item_title}}"
                value={(action.params.title as string) || ''}
                onChange={e => handleActionParamChange(index, 'title', e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {'{{campo}}'} para interpolar dados do evento
              </p>
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea
                placeholder="Descrição da tarefa..."
                value={(action.params.description as string) || ''}
                onChange={e => handleActionParamChange(index, 'description', e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Select
                value={(action.params.priority as string) || 'medium'}
                onValueChange={v => handleActionParamChange(index, 'priority', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo de origem</Label>
              <Select
                value={(action.params.source_type as string) || ''}
                onValueChange={v => handleActionParamChange(index, 'source_type', v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(SOURCE_TYPES).map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'assign_to':
        return (
          <div className="mt-3">
            <Label className="text-xs">Roteamento</Label>
            <Select
              value={(action.params.routing_rule as string) || 'round_robin'}
              onValueChange={v => handleActionParamChange(index, 'routing_rule', v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">Distribuição equilibrada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'set_due_in_hours':
        return (
          <div className="mt-3">
            <Label className="text-xs">Horas para vencimento</Label>
            <Input
              type="number"
              min={1}
              placeholder="24"
              value={(action.params.hours as number) || ''}
              onChange={e => handleActionParamChange(index, 'hours', parseInt(e.target.value) || 24)}
              className="mt-1"
            />
          </div>
        );

      case 'add_checklist':
        return (
          <div className="mt-3">
            <Label className="text-xs">Itens do checklist (um por linha)</Label>
            <Textarea
              placeholder="Verificar preço&#10;Atualizar anúncio&#10;Conferir estoque"
              value={((action.params.items as string[]) || []).join('\n')}
              onChange={e => handleActionParamChange(index, 'items', e.target.value.split('\n').filter(Boolean))}
              className="mt-1"
              rows={3}
            />
          </div>
        );

      case 'add_tag':
        return (
          <div className="mt-3">
            <Label className="text-xs">Tag</Label>
            <Input
              placeholder="Ex: urgente"
              value={(action.params.tag as string) || ''}
              onChange={e => handleActionParamChange(index, 'tag', e.target.value)}
              className="mt-1"
            />
          </div>
        );

      case 'notify':
        return (
          <p className="text-xs text-muted-foreground mt-3">
            Notifica automaticamente o responsável atribuído
          </p>
        );

      default:
        return null;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{rule ? 'Editar regra' : 'Nova regra de automação'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label>Nome da regra</Label>
              <Input
                placeholder="Ex: Criar tarefa para margem negativa"
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Regra ativa</Label>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
          </div>

          {/* Trigger */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Gatilho</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Quando este evento ocorrer</Label>
                <Select value={triggerEventType} onValueChange={setTriggerEventType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecionar evento..." />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(event => (
                      <SelectItem key={event.value} value={event.value}>
                        {event.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {accounts.length > 0 && (
                <div>
                  <Label className="text-xs">Conta específica (opcional)</Label>
                  <Select
                    value={accountId || 'all'}
                    onValueChange={v => setAccountId(v === 'all' ? null : v)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as contas</SelectItem>
                      {accounts.map(account => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Ações</CardTitle>
                <Button size="sm" variant="outline" onClick={handleAddAction}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma ação configurada
                </p>
              ) : (
                actions.map((action, index) => (
                  <div key={index} className="border rounded-lg p-3 relative">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => handleRemoveAction(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>

                    <div>
                      <Label className="text-xs">Tipo de ação</Label>
                      <Select
                        value={action.type}
                        onValueChange={v => handleActionTypeChange(index, v as AutomationAction['type'])}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTION_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {renderActionParams(action, index)}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !triggerEventType}>
            {saving ? 'Salvando...' : rule ? 'Salvar alterações' : 'Criar regra'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
