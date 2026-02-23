import { useState, useEffect } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Play, Loader2, Clock, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useAgentConfig,
  useUpsertAgentConfig,
  useAgentLogs,
  useTriggerAgentRun,
  type AgentConfig,
  type AgentLog,
} from '@/hooks/usePromotionAgent';

interface PromotionAgentConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  sellerId: string | null;
}

export function PromotionAgentConfig({ open, onOpenChange, workspaceId, sellerId }: PromotionAgentConfigProps) {
  const { data: config, isLoading } = useAgentConfig(workspaceId, sellerId);
  const { data: logs } = useAgentLogs(workspaceId, sellerId);
  const upsertMutation = useUpsertAgentConfig();
  const triggerRun = useTriggerAgentRun();

  // Local state
  const [local, setLocal] = useState<Partial<AgentConfig>>({});
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    if (config) setLocal(config);
  }, [config]);

  const updateField = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!workspaceId || !sellerId) return;
    const merged: AgentConfig = {
      ...config!,
      ...local,
      workspace_id: workspaceId,
      seller_id: sellerId,
    } as AgentConfig;

    try {
      await upsertMutation.mutateAsync(merged);
      toast.success('Configuração salva');
    } catch (err) {
      toast.error('Erro ao salvar configuração');
      console.error('[AgentConfig] Save error:', err);
    }
  };

  const handleManualRun = async () => {
    if (!workspaceId || !sellerId) return;
    try {
      await triggerRun.mutateAsync({ workspaceId, sellerId });
      toast.success('Execução manual disparada');
    } catch (err) {
      toast.error(String(err));
    }
  };

  const isEnabled = local.is_enabled ?? false;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] rounded-none rounded-l-lg h-full">
        <ScrollArea className="h-full">
          <div className="p-6 space-y-6">
            <DrawerHeader className="p-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DrawerTitle>Agente de Adesão</DrawerTitle>
                  <DrawerDescription>Adesão automática a promoções</DrawerDescription>
                </div>
              </div>
            </DrawerHeader>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Status */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Ativar Agente</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Quando ativo, adere automaticamente a campanhas elegíveis
                      </p>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(v) => updateField('is_enabled', v)}
                    />
                  </div>

                  {isEnabled && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleManualRun}
                        disabled={triggerRun.isPending}
                      >
                        {triggerRun.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Executar agora
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Regras de Desconto */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Regras de Desconto</h3>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Máximo desconto do seller (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={local.max_seller_discount ?? 10}
                      onChange={(e) => updateField('max_seller_discount', Number(e.target.value))}
                      className="h-8"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Teto: se o seller tiver que bancar mais que isso, não adere.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Mínimo desconto total da campanha (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={local.min_total_discount ?? ''}
                      onChange={(e) => updateField('min_total_discount', e.target.value ? Number(e.target.value) : null)}
                      placeholder="Opcional"
                      className="h-8"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Só adere se desconto total (seller + ML) for ≥ este valor.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="require-copart"
                      checked={local.require_copart ?? false}
                      onCheckedChange={(v) => updateField('require_copart', !!v)}
                    />
                    <Label htmlFor="require-copart" className="text-xs">
                      Exigir coparticipação do ML (meli_percentage {'>'} 0)
                    </Label>
                  </div>
                </div>

                <Separator />

                {/* Escopo de Produtos */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Escopo de Produtos</h3>

                  <RadioGroup
                    value={local.scope_type ?? 'all'}
                    onValueChange={(v) => updateField('scope_type', v)}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="all" id="scope-all" />
                      <Label htmlFor="scope-all" className="text-xs">Todos os produtos</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="categories" id="scope-cat" />
                      <Label htmlFor="scope-cat" className="text-xs">Por categoria</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="items" id="scope-items" />
                      <Label htmlFor="scope-items" className="text-xs">Por lista de itens (MLB/SKU)</Label>
                    </div>
                  </RadioGroup>

                  {local.scope_type === 'categories' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Categorias (uma por linha)</Label>
                      <Textarea
                        value={(local.scope_categories ?? []).join('\n')}
                        onChange={(e) => updateField('scope_categories', e.target.value.split('\n').filter(Boolean))}
                        rows={3}
                        placeholder="Ex: MLB123456"
                        className="text-xs"
                      />
                    </div>
                  )}

                  {local.scope_type === 'items' && (
                    <div className="space-y-1">
                      <Label className="text-xs">MLBs / SKUs (um por linha)</Label>
                      <Textarea
                        value={(local.scope_items ?? []).join('\n')}
                        onChange={(e) => updateField('scope_items', e.target.value.split('\n').filter(Boolean))}
                        rows={3}
                        placeholder="MLB1234567890"
                        className="text-xs"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Lista de exclusão (nunca aderir)</Label>
                    <Textarea
                      value={(local.exclude_items ?? []).join('\n')}
                      onChange={(e) => updateField('exclude_items', e.target.value.split('\n').filter(Boolean))}
                      rows={2}
                      placeholder="MLB que não devem participar"
                      className="text-xs"
                    />
                  </div>
                </div>

                <Separator />

                {/* Tipos de Campanha */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Tipos de Campanha</h3>
                  {['SMART', 'DEAL', 'PRICE_MATCHING'].map(type => (
                    <div key={type} className="flex items-center gap-2">
                      <Checkbox
                        id={`type-${type}`}
                        checked={(local.accepted_types ?? []).includes(type)}
                        onCheckedChange={(checked) => {
                          const current = local.accepted_types ?? [];
                          updateField('accepted_types', checked
                            ? [...current, type]
                            : current.filter(t => t !== type)
                          );
                        }}
                      />
                      <Label htmlFor={`type-${type}`} className="text-xs">{type}</Label>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="accept-unknown"
                      checked={local.accept_unknown_type ?? false}
                      onCheckedChange={(v) => updateField('accept_unknown_type', !!v)}
                    />
                    <Label htmlFor="accept-unknown" className="text-xs">Aceitar tipos desconhecidos</Label>
                  </div>
                </div>

                <Separator />

                {/* Guardrails */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Guardrails</h3>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Estoque mínimo para aderir</Label>
                    <Input
                      type="number"
                      min={0}
                      value={local.min_stock ?? 0}
                      onChange={(e) => updateField('min_stock', Number(e.target.value))}
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Margem mínima após desconto (%)</Label>
                    <Input
                      type="number"
                      value={local.min_margin ?? ''}
                      onChange={(e) => updateField('min_margin', e.target.value ? Number(e.target.value) : null)}
                      placeholder="Opcional"
                      className="h-8"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="allow-no-margin"
                      checked={local.allow_when_margin_unknown ?? false}
                      onCheckedChange={(v) => updateField('allow_when_margin_unknown', !!v)}
                    />
                    <Label htmlFor="allow-no-margin" className="text-xs">
                      Aderir mesmo sem cálculo de margem
                    </Label>
                  </div>
                </div>

                <Separator />

                <Button onClick={handleSave} disabled={upsertMutation.isPending} className="w-full">
                  {upsertMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Salvar Configuração
                </Button>

                <Separator />

                {/* Histórico */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Histórico de Execuções</h3>

                  {!logs?.length ? (
                    <p className="text-xs text-muted-foreground">Nenhuma execução registrada.</p>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((log: AgentLog) => (
                        <div key={log.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs">
                                {format(new Date(log.executed_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                              </span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {log.triggered_by}
                              </Badge>
                            </div>
                            <button
                              onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {expandedLog === log.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>

                          <div className="flex gap-3 text-xs">
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              {log.items_adhered} aderidos
                            </span>
                            {log.items_failed > 0 && (
                              <span className="flex items-center gap-1">
                                <XCircle className="h-3 w-3 text-red-500" />
                                {log.items_failed} falhas
                              </span>
                            )}
                            {log.items_skipped > 0 && (
                              <span className="flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 text-yellow-500" />
                                {log.items_skipped} ignorados
                              </span>
                            )}
                          </div>

                          {expandedLog === log.id && (
                            <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
