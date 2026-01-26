import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Zap, AlertTriangle, TrendingUp } from 'lucide-react';
import type { 
  AdsRule, 
  AdsRuleCondition, 
  AdsRuleExtraCondition,
  AdsRuleMetric,
  AdsRuleOperator,
  AdsRuleCompareWith,
  AdsRulePeriod,
  AdsRuleTemplate,
} from '@/types/ads-rules';
import {
  ADS_RULE_TEMPLATES,
  METRIC_LABELS,
  OPERATOR_LABELS,
  COMPARE_WITH_LABELS,
  PERIOD_LABELS,
  EXTRA_CONDITION_LABELS,
} from '@/types/ads-rules';

interface AdsRuleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AdsRule | null;
  onSave: (rule: Partial<AdsRule>) => Promise<void>;
}

const DEFAULT_CONDITION: AdsRuleCondition = {
  metric: 'acos',
  operator: 'gt',
  compare_with: 'fixed_value',
  fixed_value: 30,
  period_days: 7,
};

export function AdsRuleEditor({ open, onOpenChange, rule, onSave }: AdsRuleEditorProps) {
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'template' | 'custom'>('template');
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<'violation' | 'opportunity'>('violation');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [isEnabled, setIsEnabled] = useState(true);
  const [conditions, setConditions] = useState<AdsRuleCondition[]>([]);
  const [extraConditions, setExtraConditions] = useState<AdsRuleExtraCondition[]>([]);

  // Reset form when dialog opens/closes or rule changes
  useEffect(() => {
    if (open) {
      if (rule) {
        setName(rule.name);
        setDescription(rule.description || '');
        setEventType(rule.event_type);
        setSeverity(rule.severity);
        setIsEnabled(rule.is_enabled);
        setConditions(rule.conditions || []);
        setExtraConditions(rule.extra_conditions || []);
        setActiveTab('custom');
      } else {
        setName('');
        setDescription('');
        setEventType('violation');
        setSeverity('medium');
        setIsEnabled(true);
        setConditions([]);
        setExtraConditions([]);
        setActiveTab('template');
      }
    }
  }, [open, rule]);

  const handleSelectTemplate = (template: AdsRuleTemplate) => {
    setName(template.name);
    setDescription(template.description);
    setEventType(template.event_type);
    setSeverity(template.severity);
    setConditions([...template.conditions]);
    setExtraConditions([...template.extra_conditions]);
    setActiveTab('custom');
  };

  const addCondition = () => {
    setConditions([...conditions, { ...DEFAULT_CONDITION }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, updates: Partial<AdsRuleCondition>) => {
    setConditions(conditions.map((c, i) => i === index ? { ...c, ...updates } : c));
  };

  const toggleExtraCondition = (type: AdsRuleExtraCondition['type']) => {
    const existing = extraConditions.find(e => e.type === type);
    if (existing) {
      setExtraConditions(extraConditions.map(e => 
        e.type === type ? { ...e, enabled: !e.enabled } : e
      ));
    } else {
      setExtraConditions([...extraConditions, { type, enabled: true }]);
    }
  };

  const isExtraEnabled = (type: AdsRuleExtraCondition['type']) => {
    return extraConditions.find(e => e.type === type)?.enabled || false;
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        event_type: eventType,
        severity,
        is_enabled: isEnabled,
        conditions,
        extra_conditions: extraConditions.filter(e => e.enabled),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Editar regra' : 'Nova regra'}</DialogTitle>
          <DialogDescription>
            Configure condições para monitorar métricas de ADS
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'template' | 'custom')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="template">Usar template</TabsTrigger>
            <TabsTrigger value="custom">Personalizar</TabsTrigger>
          </TabsList>

          {/* Templates Tab */}
          <TabsContent value="template" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Escolha um template pré-configurado para começar rapidamente
            </p>
            <div className="grid grid-cols-1 gap-3">
              {ADS_RULE_TEMPLATES.map((template) => (
                <Card 
                  key={template.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleSelectTemplate(template)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                          template.event_type === 'violation' ? 'bg-destructive/10' : 'bg-success/10'
                        }`}>
                          {template.event_type === 'violation' ? (
                            <AlertTriangle className="h-5 w-5 text-destructive" />
                          ) : (
                            <TrendingUp className="h-5 w-5 text-success" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{template.name}</p>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {template.severity}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Custom Tab */}
          <TabsContent value="custom" className="space-y-6 mt-4">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">Nome da regra *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: ACOS acima da margem"
                  className="mt-1"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva quando esta regra deve disparar..."
                  className="mt-1"
                  rows={2}
                />
              </div>

              <div>
                <Label>Tipo de evento</Label>
                <Select value={eventType} onValueChange={(v) => setEventType(v as 'violation' | 'opportunity')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="violation">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        Violação
                      </div>
                    </SelectItem>
                    <SelectItem value="opportunity">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-success" />
                        Oportunidade
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Severidade</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Conditions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Condições de métricas</Label>
                <Button variant="outline" size="sm" onClick={addCondition}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>

              {conditions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Adicione condições para definir quando a regra deve disparar
                </p>
              ) : (
                <div className="space-y-3">
                  {conditions.map((condition, index) => (
                    <Card key={index} className="p-3">
                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="flex-1 min-w-[120px]">
                          <Label className="text-xs">Métrica</Label>
                          <Select 
                            value={condition.metric} 
                            onValueChange={(v) => updateCondition(index, { metric: v as AdsRuleMetric })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(METRIC_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="min-w-[100px]">
                          <Label className="text-xs">Operador</Label>
                          <Select 
                            value={condition.operator} 
                            onValueChange={(v) => updateCondition(index, { operator: v as AdsRuleOperator })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(OPERATOR_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="min-w-[140px]">
                          <Label className="text-xs">Comparar com</Label>
                          <Select 
                            value={condition.compare_with} 
                            onValueChange={(v) => updateCondition(index, { compare_with: v as AdsRuleCompareWith })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(COMPARE_WITH_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {condition.compare_with === 'fixed_value' && (
                          <div className="w-24">
                            <Label className="text-xs">Valor</Label>
                            <Input
                              type="number"
                              value={condition.fixed_value || 0}
                              onChange={(e) => updateCondition(index, { fixed_value: parseFloat(e.target.value) || 0 })}
                              className="mt-1"
                            />
                          </div>
                        )}

                        <div className="min-w-[140px]">
                          <Label className="text-xs">Período</Label>
                          <Select 
                            value={condition.period_days.toString()} 
                            onValueChange={(v) => updateCondition(index, { period_days: parseInt(v) as AdsRulePeriod })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeCondition(index)}
                          className="text-destructive hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Extra conditions */}
            <div className="space-y-3">
              <Label>Condições adicionais</Label>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(EXTRA_CONDITION_LABELS) as AdsRuleExtraCondition['type'][]).map((type) => (
                  <div 
                    key={type}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <span className="text-sm">{EXTRA_CONDITION_LABELS[type]}</span>
                    <Switch
                      checked={isExtraEnabled(type)}
                      onCheckedChange={() => toggleExtraCondition(type)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Enabled switch */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-medium">Regra ativa</p>
                <p className="text-sm text-muted-foreground">
                  Desative para pausar temporariamente
                </p>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Salvando...' : (rule ? 'Salvar alterações' : 'Criar regra')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
