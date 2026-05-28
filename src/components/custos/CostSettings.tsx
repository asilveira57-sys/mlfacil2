import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, DollarSign, Package, Play, Pause, RotateCcw, AlertCircle, Clock, Loader2, Database, FileText, AlertTriangle, Zap, CheckCircle2, FastForward, Plus, Pencil, Trash2, Receipt, Download, Lock } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useUserAccess } from "@/contexts/UserAccessContext";

interface CostSettingsProps { sellerId: string; }

interface BillingSyncState { status: string; scope: string | null; periods_offset: number; total_periods: number; processed_periods: number; last_error: string | null; last_heartbeat_at: string | null; }
interface BillingStatus { total_details: number; unique_orders_with_billing: number; unique_shipments_with_billing?: number; periods_count?: number; oldest_period: string | null; newest_period: string | null; last_sync_at: string | null; sync_state?: BillingSyncState | null; }

interface PackagingType { id: string; name: string; height_cm: number | null; width_cm: number | null; length_cm: number | null; cost_value: number; is_active: boolean; }
interface TaxConfig { das_icms_percent: number; pis_percent: number; cofins_percent: number; irpj_percent: number; csll_percent: number; difal_enabled: boolean; difal_percent: number; origin_state: string; }

const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export function CostSettings({ sellerId }: CostSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [syncingBilling, setSyncingBilling] = useState(false);

  // Historical import state
  const [historicalJob, setHistoricalJob] = useState<any>(null);
  const [startingHistorical, setStartingHistorical] = useState(false);
  const [startingHistorical30d, setStartingHistorical30d] = useState(false);

  // Packaging V2 state
  const [packagingList, setPackagingList] = useState<PackagingType[]>([]);
  const [packagingLoading, setPackagingLoading] = useState(false);
  const [showPackagingDialog, setShowPackagingDialog] = useState(false);
  const [editingPackaging, setEditingPackaging] = useState<PackagingType | null>(null);
  const [pkgForm, setPkgForm] = useState({ name: '', height_cm: '', width_cm: '', length_cm: '', cost_value: '' });
  const [savingPackaging, setSavingPackaging] = useState(false);

  // Tax V2 state
  const [taxConfig, setTaxConfig] = useState<TaxConfig>({ das_icms_percent: 0, pis_percent: 0, cofins_percent: 0, irpj_percent: 0, csll_percent: 0, difal_enabled: false, difal_percent: 6, origin_state: '' });
  const [taxLoading, setTaxLoading] = useState(false);
  const [savingTax, setSavingTax] = useState(false);

  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBillingScope = useRef<string>("history");

  // Access control
  const { flags } = useUserAccess();
  const hasActiveSubscription = flags?.has_active_subscription ?? false;

  useEffect(() => {
    if (!sellerId) { setLoading(false); return; }
    loadBillingStatus();
    loadPackaging();
    loadTaxConfig();
    loadHistoricalJobStatus();
    setLoading(false);

    pollIntervalRef.current = setInterval(() => { if (sellerId) { loadBillingStatus(); loadHistoricalJobStatus(); } }, 3000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [sellerId]);

  // ---- Loaders ----
  const loadBillingStatus = async () => { if (!sellerId) return; try { const { data } = await supabase.functions.invoke("ml-sync-billing-details", { body: { seller_id: sellerId, action: "status" } }); if (data) setBillingStatus(data); } catch {} };

  const loadHistoricalJobStatus = async () => {
    if (!sellerId) return;
    try {
      const { data, error } = await supabase.functions.invoke("orders-historical-import", { body: { seller_id: sellerId, action: "status" } });
      if (data?.job) setHistoricalJob(data.job);
      else setHistoricalJob(null);
    } catch {}
  };

  const handleStartHistoricalImport = async () => {
    setStartingHistorical(true);
    try {
      const { data, error } = await supabase.functions.invoke("orders-historical-import", { body: { seller_id: sellerId, action: "start", days_back: 365 } });
      if (error) throw error;
      if (data?.ok) {
        toast.success("Importação histórica iniciada! O processo roda em background.");
        loadHistoricalJobStatus();
      } else {
        toast.error(data?.error || "Erro ao iniciar importação");
      }
    } catch (err: any) {
      toast.error("Erro ao iniciar importação: " + (err?.message || "Erro"));
    } finally {
      setStartingHistorical(false);
    }
  };

  const handleStartHistoricalImport30d = async () => {
    setStartingHistorical30d(true);
    try {
      const { data, error } = await supabase.functions.invoke("orders-historical-import", { body: { seller_id: sellerId, action: "start", days_back: 30 } });
      if (error) throw error;
      if (data?.ok) {
        toast.success("Importação dos últimos 30 dias iniciada!");
        loadHistoricalJobStatus();
      } else {
        toast.error(data?.error || "Erro ao iniciar importação");
      }
    } catch (err: any) {
      toast.error("Erro ao iniciar importação: " + (err?.message || "Erro"));
    } finally {
      setStartingHistorical30d(false);
    }
  };

  const loadPackaging = async () => {
    setPackagingLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/packaging/list?seller_id=${sellerId}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) { const data = await res.json(); setPackagingList(data.packaging || []); }
    } catch {} finally { setPackagingLoading(false); }
  };

  const loadTaxConfig = async () => {
    setTaxLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/tax/get?seller_id=${sellerId}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const data = await res.json();
        if (data.tax) setTaxConfig({
          das_icms_percent: data.tax.das_icms_percent || 0, pis_percent: data.tax.pis_percent || 0,
          cofins_percent: data.tax.cofins_percent || 0, irpj_percent: data.tax.irpj_percent || 0,
          csll_percent: data.tax.csll_percent || 0, difal_enabled: data.tax.difal_enabled || false,
          difal_percent: data.tax.difal_percent || 6, origin_state: data.tax.origin_state || '',
        });
      }
    } catch {} finally { setTaxLoading(false); }
  };

  const handleSavePackaging = async () => {
    setSavingPackaging(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/packaging/upsert`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ seller_id: sellerId, id: editingPackaging?.id || null, name: pkgForm.name, height_cm: parseFloat(pkgForm.height_cm) || null, width_cm: parseFloat(pkgForm.width_cm) || null, length_cm: parseFloat(pkgForm.length_cm) || null, cost_value: parseFloat(pkgForm.cost_value) || 0 }),
      });
      if (res.ok) { toast.success(editingPackaging ? 'Embalagem atualizada' : 'Embalagem criada'); setShowPackagingDialog(false); loadPackaging(); }
      else toast.error('Erro ao salvar embalagem');
    } catch { toast.error('Erro ao salvar embalagem'); } finally { setSavingPackaging(false); }
  };

  const handleTogglePackaging = async (id: string, is_active: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/packaging/toggle`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active }),
      });
      loadPackaging();
    } catch {}
  };

  const handleSaveTax = async () => {
    setSavingTax(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cost-engine/tax/update`, {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ seller_id: sellerId, ...taxConfig }),
      });
      if (res.ok) toast.success('Impostos salvos!');
      else toast.error('Erro ao salvar impostos');
    } catch { toast.error('Erro ao salvar impostos'); } finally { setSavingTax(false); }
  };

  // ---- Sync actions ----
  const handleSyncBilling = async (scope: string = "recent") => {
    setSyncingBilling(true); lastBillingScope.current = scope;
    try {
      const scopeLabel = scope === "history" ? "histórico completo" : scope === "30d" ? "últimos 30 dias" : "últimos 12 meses";
      toast.info(`Sincronizando ${scopeLabel}...`);
      const { data, error } = await supabase.functions.invoke("ml-sync-billing-details", { body: { seller_id: sellerId, action: "sync", scope } });
      if (error) throw error;
      if (data?.status === 'paused') toast.info(`Billing pausado (${data.periods_processed || 0} períodos).`);
      else toast.success(`Billing sincronizado: ${data?.records_inserted || 0} registros`);
      loadBillingStatus();
    } catch (err: any) { toast.error("Erro ao sincronizar billing: " + (err?.message || "Erro")); } finally { setSyncingBilling(false); }
  };

  const getBillingSyncBadge = () => {
    const s = billingStatus?.sync_state;
    if (!s) return null;
    switch (s.status) {
      case 'running': return <Badge className="bg-blue-500 text-white animate-pulse">Sincronizando</Badge>;
      case 'paused': return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Pausado</Badge>;
      case 'done': return <Badge className="bg-green-500 text-white">Completo</Badge>;
      default: return null;
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>;

  const billingSyncState = billingStatus?.sync_state;
  const billingProgress = billingSyncState?.total_periods > 0 ? Math.round((billingSyncState.processed_periods / billingSyncState.total_periods) * 100) : 0;
  const isBillingSyncing = billingSyncState?.status === 'running' || billingSyncState?.status === 'paused';
  const isJobRunning = historicalJob?.status === "running";

  const totalTaxPercent = taxConfig.das_icms_percent + taxConfig.pis_percent + taxConfig.cofins_percent + taxConfig.irpj_percent + taxConfig.csll_percent;

  return (
    <div className="space-y-6">
      {/* TABS: Embalagens | Impostos | Sincronização */}
      <Tabs defaultValue="packaging" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="packaging" className="gap-2"><Package className="h-4 w-4" />Embalagens</TabsTrigger>
          <TabsTrigger value="taxes" className="gap-2"><Receipt className="h-4 w-4" />Impostos</TabsTrigger>
          <TabsTrigger value="sync" className="gap-2"><Database className="h-4 w-4" />Sincronização</TabsTrigger>
        </TabsList>

        {/* ---- ABA EMBALAGENS ---- */}
        <TabsContent value="packaging">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Cadastro de Embalagens</CardTitle>
                  <CardDescription>Gerencie as embalagens da sua empresa. O custo será somado por venda.</CardDescription>
                </div>
                <Button onClick={() => { setEditingPackaging(null); setPkgForm({ name: '', height_cm: '', width_cm: '', length_cm: '', cost_value: '' }); setShowPackagingDialog(true); }} className="gap-2">
                  <Plus className="h-4 w-4" />Nova Embalagem
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {packagingLoading ? (
                <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : packagingList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>Nenhuma embalagem cadastrada</p>
                  <p className="text-sm">Clique em "Nova Embalagem" para começar</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Dimensões (AxLxC)</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[80px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packagingList.map(pkg => (
                        <TableRow key={pkg.id} className={!pkg.is_active ? 'opacity-50' : ''}>
                          <TableCell className="font-medium">{pkg.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {pkg.height_cm || '-'} × {pkg.width_cm || '-'} × {pkg.length_cm || '-'} cm
                          </TableCell>
                          <TableCell className="font-medium">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pkg.cost_value)}
                          </TableCell>
                          <TableCell>
                            <Switch checked={pkg.is_active} onCheckedChange={(checked) => handleTogglePackaging(pkg.id, checked)} />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => {
                              setEditingPackaging(pkg);
                              setPkgForm({ name: pkg.name, height_cm: String(pkg.height_cm || ''), width_cm: String(pkg.width_cm || ''), length_cm: String(pkg.length_cm || ''), cost_value: String(pkg.cost_value || '') });
                              setShowPackagingDialog(true);
                            }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- ABA IMPOSTOS ---- */}
        <TabsContent value="taxes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Configuração de Impostos</CardTitle>
              <CardDescription>Configure as alíquotas médias de impostos para cálculo de lucro líquido</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {taxLoading ? <Skeleton className="h-48 w-full" /> : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="space-y-2">
                      <Label>DAS/ICMS %</Label>
                      <Input type="number" step="0.01" min="0" value={taxConfig.das_icms_percent} onChange={e => setTaxConfig(prev => ({ ...prev, das_icms_percent: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>PIS %</Label>
                      <Input type="number" step="0.01" min="0" value={taxConfig.pis_percent} onChange={e => setTaxConfig(prev => ({ ...prev, pis_percent: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>COFINS %</Label>
                      <Input type="number" step="0.01" min="0" value={taxConfig.cofins_percent} onChange={e => setTaxConfig(prev => ({ ...prev, cofins_percent: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>IRPJ %</Label>
                      <Input type="number" step="0.01" min="0" value={taxConfig.irpj_percent} onChange={e => setTaxConfig(prev => ({ ...prev, irpj_percent: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>CSLL %</Label>
                      <Input type="number" step="0.01" min="0" value={taxConfig.csll_percent} onChange={e => setTaxConfig(prev => ({ ...prev, csll_percent: parseFloat(e.target.value) || 0 }))} />
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm font-medium">Total de Impostos: <span className="text-lg font-bold">{totalTaxPercent.toFixed(2)}%</span></p>
                    {taxConfig.difal_enabled && <p className="text-xs text-muted-foreground">+ DIFAL {taxConfig.difal_percent}% (quando aplicável)</p>}
                  </div>

                  <div className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Aplicar DIFAL</p>
                        <p className="text-sm text-muted-foreground">Diferencial de Alíquota do ICMS</p>
                      </div>
                      <Switch checked={taxConfig.difal_enabled} onCheckedChange={checked => setTaxConfig(prev => ({ ...prev, difal_enabled: checked }))} />
                    </div>

                    {taxConfig.difal_enabled && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>% DIFAL</Label>
                          <Input type="number" step="0.01" min="0" value={taxConfig.difal_percent} onChange={e => setTaxConfig(prev => ({ ...prev, difal_percent: parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>UF de Origem</Label>
                          <Select value={taxConfig.origin_state} onValueChange={v => setTaxConfig(prev => ({ ...prev, origin_state: v }))}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>{STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {taxConfig.difal_enabled && (
                      <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-amber-700 dark:text-amber-300">DIFAL será aplicado apenas quando a venda for para outra UF diferente de {taxConfig.origin_state || '(não definida)'}.</span>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveTax} disabled={savingTax}>
                      {savingTax ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar Impostos"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- ABA SINCRONIZAÇÃO ---- */}
        <TabsContent value="sync" className="space-y-6">
          {/* Step 0: Historical Orders Import */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />Importar Pedidos</CardTitle>
                  <CardDescription>Importa o histórico de pedidos do Mercado Livre</CardDescription>
                </div>
                {historicalJob?.status === "running" && <Badge className="bg-blue-500 text-white animate-pulse">Importando</Badge>}
                {historicalJob?.status === "done" && <Badge className="bg-green-500 text-white">Concluído</Badge>}
                {historicalJob?.status === "pending" && <Badge variant="outline" className="border-yellow-500 text-yellow-600">Agendado</Badge>}
                {historicalJob?.status === "error" && <Badge variant="destructive">Erro</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {historicalJob && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{(historicalJob.processed_orders || 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Pedidos Importados</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-2xl font-bold">{(historicalJob.total_orders || 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Total Estimado</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">{historicalJob.started_at ? new Date(historicalJob.started_at).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : "—"}</p>
                    <p className="text-xs text-muted-foreground">Início</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">{historicalJob.completed_at ? new Date(historicalJob.completed_at).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : "—"}</p>
                    <p className="text-xs text-muted-foreground">Conclusão</p>
                  </div>
                </div>
              )}
              {historicalJob?.status === "running" && historicalJob.total_orders > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Progresso</span>
                    <span className="font-medium">{Math.round((historicalJob.processed_orders / historicalJob.total_orders) * 100)}%</span>
                  </div>
                  <Progress value={Math.round((historicalJob.processed_orders / historicalJob.total_orders) * 100)} className="h-2" />
                </div>
              )}
              {historicalJob?.error_message && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-destructive">{historicalJob.error_message}</span>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {/* 30 days button — always enabled */}
                <Button
                  onClick={handleStartHistoricalImport30d}
                  disabled={startingHistorical30d || isJobRunning}
                  className="gap-2"
                  variant="outline"
                >
                  {startingHistorical30d || isJobRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Importar Pedidos (30 dias)
                </Button>

                {/* Botão "Importar Pedidos (1 ano)" removido em 2026-05 para controle de custo.
                    Importação histórica > 30 dias está bloqueada para sellers; uso futuro restrito a admin. */}

                {historicalJob?.status === "done" && (
                  <span className="text-sm text-muted-foreground">
                    ✓ {historicalJob.processed_orders?.toLocaleString()} pedidos importados
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Step 1: Billing (TEMPORARILY DISABLED) */}
          <Card className="border border-muted opacity-60 pointer-events-none select-none">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-muted-foreground"><Database className="h-5 w-5" />Passo 1: Sincronizar Taxas (Billing)</CardTitle>
                  <CardDescription>Temporariamente desativado — em manutenção</CardDescription>
                </div>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">Desativado</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-2xl font-bold text-muted-foreground">—</p><p className="text-xs text-muted-foreground">Movimentos</p></div>
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-2xl font-bold text-muted-foreground">—</p><p className="text-xs text-muted-foreground">Pedidos com Billing</p></div>
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-2xl font-bold text-muted-foreground">—</p><p className="text-xs text-muted-foreground">Períodos</p></div>
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-sm font-medium text-muted-foreground">—</p><p className="text-xs text-muted-foreground">Mais Antigo</p></div>
                <div className="p-3 bg-muted/50 rounded-lg"><p className="text-sm font-medium text-muted-foreground">—</p><p className="text-xs text-muted-foreground">Última Sync</p></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled className="gap-2 opacity-50"><FileText className="h-4 w-4" />Últimos 30 Dias</Button>
                <Button disabled variant="outline" className="gap-2 opacity-50"><FileText className="h-4 w-4" />Últimos 12 Meses</Button>
                <Button disabled variant="outline" className="gap-2 opacity-50"><Database className="h-4 w-4" />Histórico Completo</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Packaging Dialog */}
      <Dialog open={showPackagingDialog} onOpenChange={setShowPackagingDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingPackaging ? 'Editar Embalagem' : 'Nova Embalagem'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={pkgForm.name} onChange={e => setPkgForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Caixa Pequena" /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label>Altura (cm)</Label><Input type="number" step="0.1" value={pkgForm.height_cm} onChange={e => setPkgForm(p => ({ ...p, height_cm: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Largura (cm)</Label><Input type="number" step="0.1" value={pkgForm.width_cm} onChange={e => setPkgForm(p => ({ ...p, width_cm: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Comprimento (cm)</Label><Input type="number" step="0.1" value={pkgForm.length_cm} onChange={e => setPkgForm(p => ({ ...p, length_cm: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Valor (R$) *</Label><Input type="number" step="0.01" min="0" value={pkgForm.cost_value} onChange={e => setPkgForm(p => ({ ...p, cost_value: e.target.value }))} placeholder="0.00" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPackagingDialog(false)}>Cancelar</Button>
            <Button onClick={handleSavePackaging} disabled={savingPackaging || !pkgForm.name}>
              {savingPackaging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingPackaging ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
