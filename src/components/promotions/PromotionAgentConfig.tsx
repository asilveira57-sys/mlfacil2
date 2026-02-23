import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Play, Loader2, Clock, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
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
import { useSellerCategories, formatGmv } from '@/hooks/useSellerCategories';
import { supabase } from '@/integrations/supabase/client';

interface PromotionAgentConfigProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  sellerId: string | null;
}

/* ── Product Search Sub-component ── */
interface ProductHit {
  item_id: string;
  title: string | null;
  thumbnail: string | null;
  sku: string | null;
}

/* ── Mini Ollie for header ── */
function OllieMini({ isActive }: { isActive: boolean }) {
  return (
    <div className="relative w-10 h-10 shrink-0">
      {/* Main sphere */}
      <div
        className="w-full h-full rounded-full"
        style={{
          background: isActive
            ? 'radial-gradient(circle at 30% 25%, hsl(210 15% 95%), hsl(210 10% 70%) 40%, hsl(210 10% 45%) 70%, hsl(210 15% 30%))'
            : 'radial-gradient(circle at 30% 25%, hsl(0 0% 85%), hsl(0 0% 60%) 40%, hsl(0 0% 40%) 70%, hsl(0 0% 28%))',
          boxShadow: 'inset -4px -4px 8px hsl(0 0% 0% / 0.3), inset 2px 2px 4px hsl(0 0% 100% / 0.15), 0 3px 10px hsl(0 0% 0% / 0.3)',
        }}
      >
        {/* Chrome highlight */}
        <div className="absolute rounded-full" style={{ top: '8%', left: '18%', width: '35%', height: '20%', background: 'radial-gradient(ellipse, hsl(0 0% 100% / 0.6), transparent)', filter: 'blur(1px)' }} />
        {/* Antenna */}
        <div className="absolute" style={{ top: -7, left: '50%', transform: 'translateX(-50%)', width: 2, height: 9, background: isActive ? 'linear-gradient(to top, hsl(210 10% 50%), hsl(210 10% 70%))' : 'linear-gradient(to top, hsl(0 0% 45%), hsl(0 0% 60%))', borderRadius: 2 }}>
          <div className="absolute rounded-full" style={{ top: -3, left: '50%', transform: 'translateX(-50%)', width: 5, height: 5, background: isActive ? 'radial-gradient(circle, hsl(142 71% 60%), hsl(142 71% 40%))' : 'radial-gradient(circle, hsl(0 0% 55%), hsl(0 0% 40%))', boxShadow: isActive ? '0 0 4px 1px hsl(142 71% 45% / 0.6)' : 'none' }} />
        </div>
        {/* Eyes */}
        <div className="absolute flex gap-1.5" style={{ top: '32%', left: '50%', transform: 'translateX(-50%)' }}>
          {[0, 1].map(i => (
            <div key={i} className="rounded-full flex items-center justify-center" style={{ width: 10, height: 10, background: 'radial-gradient(circle at 40% 35%, hsl(0 0% 100%), hsl(0 0% 92%))', boxShadow: 'inset 0 1px 2px hsl(0 0% 0% / 0.15)' }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, hsl(210 80% 30%), hsl(210 100% 10%))' }} />
            </div>
          ))}
        </div>
        {/* Mouth */}
        <div className="absolute rounded-full" style={{ bottom: '22%', left: '50%', transform: 'translateX(-50%)', width: '40%', height: 2, background: isActive ? 'linear-gradient(90deg, transparent, hsl(142 71% 55%), transparent)' : 'linear-gradient(90deg, transparent, hsl(0 0% 50%), transparent)' }} />
      </div>
    </div>
  );
}

function ProductSearchSelector({
  selected,
  onChange,
  sellerId,
  label,
  placeholder,
}: {
  selected: string[];
  onChange: (items: string[]) => void;
  sellerId: string | null;
  label: string;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!sellerId || q.length < 3) { setResults([]); return; }
    setSearching(true);
    try {
      const { data: listings } = await supabase
        .from('meli_listings_cache')
        .select('item_id, title, sku, thumbnail')
        .eq('seller_id', sellerId)
        .or(`title.ilike.%${q}%,item_id.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(20);

      const seen = new Set<string>();
      const unique: ProductHit[] = [];
      for (const row of (listings || [])) {
        if (!seen.has(row.item_id)) {
          seen.add(row.item_id);
          unique.push({ item_id: row.item_id, title: row.title, thumbnail: row.thumbnail, sku: row.sku });
        }
      }
      setResults(unique);
    } catch { setResults([]); }
    setSearching(false);
  }, [sellerId]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 400);
    return () => clearTimeout(t);
  }, [query, search]);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  const remove = (id: string) => onChange(selected.filter(x => x !== id));

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">{label}</Label>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(id => (
            <Badge key={id} variant="secondary" className="text-[10px] gap-1 pr-1">
              {id}
              <button onClick={() => remove(id)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-8 pl-7 text-xs"
        />
        {searching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {/* Results */}
      {results.length > 0 && (
        <ScrollArea className="max-h-[140px] border rounded-md">
          <div className="p-1 space-y-0.5">
            {results.map(item => (
              <button
                key={item.item_id}
                onClick={() => toggle(item.item_id)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-accent/50 transition-colors"
              >
                <Checkbox checked={selected.includes(item.item_id)} className="pointer-events-none" />
                {item.thumbnail && (
                  <img src={item.thumbnail} alt="" className="w-7 h-7 rounded object-cover shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] truncate">{item.title || item.item_id}</p>
                  <p className="text-[10px] text-muted-foreground">{item.item_id}{item.sku ? ` · SKU: ${item.sku}` : ''}</p>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

/* ── Main Component ── */
export function PromotionAgentConfig({ open, onOpenChange, workspaceId, sellerId }: PromotionAgentConfigProps) {
  const { data: config, isLoading } = useAgentConfig(workspaceId, sellerId);
  const { data: logs } = useAgentLogs(workspaceId, sellerId);
  const { data: categories, isLoading: catLoading } = useSellerCategories(sellerId);
  const upsertMutation = useUpsertAgentConfig();
  const triggerRun = useTriggerAgentRun();

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px] w-[95vw] max-h-[85vh] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <div className="flex items-center gap-3">
            <OllieMini isActive={isEnabled} />
            <div>
              <DialogTitle>Agente de Adesão Ollie</DialogTitle>
              <DialogDescription>Adesão automática a promoções · Configuração específica desta conta</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* 3-column grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 overflow-hidden flex-1">
              {/* ── COLUNA 1: Status + Regras ── */}
              <ScrollArea className="max-h-[calc(85vh-140px)]">
                <div className="p-5 space-y-5">
                  {/* Status */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Ativar Agente</Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Adere automaticamente a campanhas elegíveis
                        </p>
                      </div>
                      <Switch checked={isEnabled} onCheckedChange={v => updateField('is_enabled', v)} />
                    </div>
                    {isEnabled && (
                      <div className="space-y-1.5">
                        <Button size="sm" variant="outline" onClick={handleManualRun} disabled={triggerRun.isPending}>
                          {triggerRun.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
                          Executar agora
                        </Button>
                        <p className="text-[10px] text-muted-foreground">O Ollie executa automaticamente após cada sincronização de promoções.</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t" />

                  {/* Regras de Desconto */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Regras de Desconto</h3>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Máximo desconto do seller (%)</Label>
                      <Input type="number" min={0} max={100} value={local.max_seller_discount ?? 10} onChange={e => updateField('max_seller_discount', Number(e.target.value))} className="h-8" />
                      <p className="text-[11px] text-muted-foreground">Teto: se o seller tiver que bancar mais que isso, não adere.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Mínimo desconto total (%)</Label>
                      <Input type="number" min={0} max={100} value={local.min_total_discount ?? ''} onChange={e => updateField('min_total_discount', e.target.value ? Number(e.target.value) : null)} placeholder="Opcional" className="h-8" />
                      <p className="text-[11px] text-muted-foreground">Só adere se desconto total ≥ este valor.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="require-copart" checked={local.require_copart ?? false} onCheckedChange={v => updateField('require_copart', !!v)} />
                      <Label htmlFor="require-copart" className="text-xs">Exigir coparticipação do ML</Label>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              {/* ── COLUNA 2: Escopo ── */}
              <ScrollArea className="max-h-[calc(85vh-140px)] border-l">
                <div className="p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Escopo de Produtos</h3>

                  <RadioGroup value={local.scope_type ?? 'all'} onValueChange={v => updateField('scope_type', v)} className="space-y-2">
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
                      <Label htmlFor="scope-items" className="text-xs">Por produto</Label>
                    </div>
                  </RadioGroup>

                  {/* Category Selector */}
                  {local.scope_type === 'categories' && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Selecione as categorias</Label>
                      {catLoading ? (
                        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
                        </div>
                      ) : !categories?.length ? (
                        <p className="text-xs text-muted-foreground py-2">
                          Nenhuma categoria sincronizada. Sincronize as categorias primeiro.
                        </p>
                      ) : (
                        <ScrollArea className="max-h-[200px] border rounded-md">
                          <div className="p-1 space-y-0.5">
                            {categories.map(cat => {
                              const checked = (local.scope_categories ?? []).includes(cat.category_id);
                              return (
                                <button
                                  key={cat.category_id}
                                  onClick={() => {
                                    const cur = local.scope_categories ?? [];
                                    updateField('scope_categories', checked ? cur.filter(c => c !== cat.category_id) : [...cur, cat.category_id]);
                                  }}
                                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-accent/50 transition-colors"
                                >
                                  <Checkbox checked={checked} className="pointer-events-none" />
                                  <span className="text-xs flex-1 truncate">{cat.category_name}</span>
                                  <Badge variant="outline" className="text-[10px] shrink-0">{formatGmv(cat.gmv_90d)}</Badge>
                                </button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  )}

                  {/* Product search selector */}
                  {local.scope_type === 'items' && (
                    <ProductSearchSelector
                      selected={local.scope_items ?? []}
                      onChange={items => updateField('scope_items', items)}
                      sellerId={sellerId}
                      label="Selecione os produtos"
                      placeholder="Buscar por título, SKU ou MLB..."
                    />
                  )}

                  <div className="border-t" />

                  {/* Exclusion list */}
                  <ProductSearchSelector
                    selected={local.exclude_items ?? []}
                    onChange={items => updateField('exclude_items', items)}
                    sellerId={sellerId}
                    label="Lista de exclusão (nunca aderir)"
                    placeholder="Buscar por título, SKU ou MLB..."
                  />
                </div>
              </ScrollArea>

              {/* ── COLUNA 3: Guardrails + Tipos + Histórico ── */}
              <ScrollArea className="max-h-[calc(85vh-140px)] border-l">
                <div className="p-5 space-y-5">
                  {/* Guardrails */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Guardrails</h3>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Estoque mínimo</Label>
                      <Input type="number" min={0} value={local.min_stock ?? 0} onChange={e => updateField('min_stock', Number(e.target.value))} className="h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Margem mínima após desconto (%)</Label>
                      <Input type="number" value={local.min_margin ?? ''} onChange={e => updateField('min_margin', e.target.value ? Number(e.target.value) : null)} placeholder="Opcional" className="h-8" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="allow-no-margin" checked={local.allow_when_margin_unknown ?? false} onCheckedChange={v => updateField('allow_when_margin_unknown', !!v)} />
                      <Label htmlFor="allow-no-margin" className="text-xs">Aderir mesmo sem cálculo de margem</Label>
                    </div>
                  </div>

                  <div className="border-t" />

                  {/* Tipos de Campanha */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipos de Campanha</h3>
                    {['SMART', 'DEAL', 'PRICE_MATCHING'].map(type => (
                      <div key={type} className="flex items-center gap-2">
                        <Checkbox
                          id={`type-${type}`}
                          checked={(local.accepted_types ?? []).includes(type)}
                          onCheckedChange={checked => {
                            const current = local.accepted_types ?? [];
                            updateField('accepted_types', checked ? [...current, type] : current.filter(t => t !== type));
                          }}
                        />
                        <Label htmlFor={`type-${type}`} className="text-xs">{type}</Label>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <Checkbox id="accept-unknown" checked={local.accept_unknown_type ?? false} onCheckedChange={v => updateField('accept_unknown_type', !!v)} />
                      <Label htmlFor="accept-unknown" className="text-xs">Aceitar tipos desconhecidos</Label>
                    </div>
                  </div>

                  <div className="border-t" />

                  {/* Histórico */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Histórico</h3>
                    {!logs?.length ? (
                      <p className="text-xs text-muted-foreground">Nenhuma execução registrada.</p>
                    ) : (
                      <div className="space-y-2">
                        {logs.slice(0, 5).map((log: AgentLog) => (
                          <div key={log.id} className="border rounded-lg p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[11px]">{format(new Date(log.executed_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                                <Badge variant="outline" className="text-[9px] px-1 py-0">{log.triggered_by}</Badge>
                              </div>
                              <button onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)} className="text-muted-foreground hover:text-foreground">
                                {expandedLog === log.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                            <div className="flex gap-2 text-[11px]">
                              <span className="flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3 text-green-500" />{log.items_adhered}</span>
                              {log.items_failed > 0 && <span className="flex items-center gap-0.5"><XCircle className="h-3 w-3 text-red-500" />{log.items_failed}</span>}
                              {log.items_skipped > 0 && <span className="flex items-center gap-0.5"><AlertTriangle className="h-3 w-3 text-yellow-500" />{log.items_skipped}</span>}
                            </div>
                            {expandedLog === log.id && (
                              <pre className="text-[10px] bg-muted/50 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t">
              <Button onClick={handleSave} disabled={upsertMutation.isPending} className="w-full">
                {upsertMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Configuração
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
