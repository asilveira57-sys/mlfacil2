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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, DollarSign, Package, Play, Pause, RotateCcw, AlertCircle, Clock, Loader2, Database, FileText, AlertTriangle, Zap, CheckCircle2, FastForward, Plus, Pencil, Trash2, Receipt } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface CostSettingsProps { sellerId: string; }

interface RealCostsSyncState { status: string; processed: number; total: number; cursor_offset: number; scope_days: number | null; last_error: string | null; last_heartbeat_at: string | null; stats_json: { billing?: number; pending?: number; with_shipping?: number } | null; }
interface BackfillSyncState { status: string; cursor_offset: number; total_orders: number; processed_orders: number; with_billing: number; last_heartbeat_at: string | null; }
interface CoverageStats { total_paid: number; with_real_billing: number; with_pending_billing: number; total_processed: number; coverage_percent: number; }
interface BillingSyncState { status: string; scope: string | null; periods_offset: number; total_periods: number; processed_periods: number; last_error: string | null; last_heartbeat_at: string | null; }
interface BillingStatus { total_details: number; unique_orders_with_billing: number; unique_shipments_with_billing?: number; periods_count?: number; oldest_period: string | null; newest_period: string | null; last_sync_at: string | null; sync_state?: BillingSyncState | null; }

interface PackagingType { id: string; name: string; height_cm: number | null; width_cm: number | null; length_cm: number | null; cost_value: number; is_active: boolean; }
interface TaxConfig { das_icms_percent: number; pis_percent: number; cofins_percent: number; irpj_percent: number; csll_percent: number; difal_enabled: boolean; difal_percent: number; origin_state: string; }

const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export function CostSettings({ sellerId }: CostSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [realCostsState, setRealCostsState] = useState<RealCostsSyncState | null>(null);
  const [backfillState, setBackfillState] = useState<BackfillSyncState | null>(null);
  const [coverage, setCoverage] = useState<CoverageStats & { missing_breakdown?: number }>({ total_paid: 0, with_real_billing: 0, with_pending_billing: 0, total_processed: 0, coverage_percent: 0 });
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [syncScope, setSyncScope] = useState<string>("all");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetProgressConfirm, setShowResetProgressConfirm] = useState(false);
  const [syncingBilling, setSyncingBilling] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => localStorage.getItem("cost_watchdog_enabled") !== "false");
  const [currentAutoStep, setCurrentAutoStep] = useState<string | null>(null);

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

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastBillingScope = useRef<string>("history");

  useEffect(() => { localStorage.setItem("cost_watchdog_seller_id", sellerId); window.dispatchEvent(new Event("cost_watchdog_update")); }, [sellerId]);
  useEffect(() => { localStorage.setItem("cost_watchdog_enabled", autoSyncEnabled ? "true" : "false"); window.dispatchEvent(new Event("cost_watchdog_update")); }, [autoSyncEnabled]);

  useEffect(() => {
    loadRealCostsStatus();
    loadBillingStatus();
    loadBackfillState();
    loadPackaging();
    loadTaxConfig();
    setLoading(false);

    pollIntervalRef.current = setInterval(() => { loadRealCostsStatus(); loadBillingStatus(); loadBackfillState(); }, 3000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [sellerId]);

  useEffect(() => {
    const billingSyncState = billingStatus?.sync_state;
    if (billingSyncState?.status === 'running' || billingSyncState?.status === 'paused') setCurrentAutoStep("billing");
    else if (backfillState?.status === 'running' || backfillState?.status === 'paused') setCurrentAutoStep("backfill");
    else if (realCostsState?.status === 'running' || realCostsState?.status === 'paused') setCurrentAutoStep("realcosts");
    else setCurrentAutoStep(null);
  }, [billingStatus, backfillState, realCostsState, coverage]);

  // ---- Loaders ----
  const loadRealCostsStatus = async () => { try { const { data } = await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "status" } }); if (data?.state) setRealCostsState(data.state); if (data?.coverage) setCoverage(data.coverage); } catch {} };
  const loadBillingStatus = async () => { try { const { data } = await supabase.functions.invoke("ml-sync-billing-details", { body: { seller_id: sellerId, action: "status" } }); if (data) setBillingStatus(data); } catch {} };
  const loadBackfillState = async () => { try { const { data } = await supabase.from("meli_backfill_sync_state" as any).select("*").eq("seller_id", sellerId).maybeSingle(); if (data) setBackfillState(data as any); } catch {} };

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

  // ---- Packaging actions ----
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

  // ---- Tax actions ----
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

  // ---- Sync actions (same as before) ----
  const handleSyncBilling = async (scope: string = "recent") => {
    setSyncingBilling(true); lastBillingScope.current = scope;
    try {
      toast.info(scope === "history" ? "Sincronizando histórico completo..." : "Sincronizando últimos 12 meses...");
      const { data, error } = await supabase.functions.invoke("ml-sync-billing-details", { body: { seller_id: sellerId, action: "sync", scope } });
      if (error) throw error;
      if (data?.status === 'paused') toast.info(`Billing pausado (${data.periods_processed || 0} períodos).`);
      else toast.success(`Billing sincronizado: ${data?.records_inserted || 0} registros`);
      loadBillingStatus();
    } catch (err: any) { toast.error("Erro ao sincronizar billing: " + (err?.message || "Erro")); } finally { setSyncingBilling(false); }
  };

  const handleBackfillMissing = async () => {
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "backfill_missing", scope_days: syncScope === "all" ? null : parseInt(syncScope) } });
      if (error) throw error;
      toast.success(data?.message || "Backfill concluído");
      loadRealCostsStatus(); loadBackfillState();
    } catch (err: any) { toast.error("Erro no backfill"); } finally { setBackfilling(false); }
  };

  const handleStartSync = async () => { try { await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "start", scope_days: syncScope === "all" ? null : parseInt(syncScope) } }); toast.success("Sincronização iniciada"); loadRealCostsStatus(); } catch { toast.error("Erro"); } };
  const handleContinueSync = async (forceResume = false) => { try { const { data } = await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "continue", force_resume: forceResume } }); if (data?.message?.includes("complete")) toast.success("Concluída!"); loadRealCostsStatus(); } catch {} };
  const handlePauseSync = async () => { setAutoSyncEnabled(false); try { await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "pause" } }); toast.info("Pausado"); loadRealCostsStatus(); } catch {} };
  const handleResetSync = async () => { try { await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "reset" } }); await supabase.from("meli_backfill_sync_state" as any).delete().eq("seller_id", sellerId); toast.success("Resetado"); setRealCostsState(null); setBackfillState(null); setShowResetConfirm(false); loadRealCostsStatus(); } catch {} };
  const handleResetProgressOnly = async () => { try { await supabase.from("meli_real_costs_sync_state" as any).delete().eq("seller_id", sellerId); await supabase.from("meli_backfill_sync_state" as any).delete().eq("seller_id", sellerId); await supabase.from("meli_billing_details_sync_state" as any).delete().eq("seller_id", sellerId); toast.success("Progresso resetado"); setRealCostsState(null); setBackfillState(null); setShowResetProgressConfirm(false); loadRealCostsStatus(); loadBillingStatus(); loadBackfillState(); } catch {} };

  const getStatusBadge = () => {
    if (!realCostsState) return <Badge variant="secondary">Não iniciado</Badge>;
    switch (realCostsState.status) {
      case 'running': return <Badge className="bg-blue-500 text-white animate-pulse">Processando</Badge>;
      case 'paused': return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Pausado</Badge>;
      case 'done': return <Badge className="bg-green-500 text-white">Concluído</Badge>;
      case 'error': return <Badge variant="destructive">Erro</Badge>;
      default: return <Badge variant="secondary">Aguardando</Badge>;
    }
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

  const formatLastActivity = () => {
    if (!realCostsState?.last_heartbeat_at) return null;
    const diff = Date.now() - new Date(realCostsState.last_heartbeat_at).getTime();
    if (diff < 60000) return "agora";
    if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
    return `há ${Math.floor(diff / 3600000)}h`;
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>;

  const progressPercent = realCostsState?.total > 0 ? Math.round((realCostsState.processed / realCostsState.total) * 100) : 0;
  const isRunningOrPaused = realCostsState?.status === 'running' || realCostsState?.status === 'paused';
  const canStart = !realCostsState || realCostsState.status === 'idle' || realCostsState.status === 'done' || realCostsState.status === 'error';
  const billingSyncState = billingStatus?.sync_state;
  const billingProgress = billingSyncState?.total_periods > 0 ? Math.round((billingSyncState.processed_periods / billingSyncState.total_periods) * 100) : 0;
  const isBillingSyncing = billingSyncState?.status === 'running' || billingSyncState?.status === 'paused';
  const allComplete = (coverage.missing_breakdown || 0) === 0 && coverage.with_real_billing > 0 && coverage.with_real_billing >= coverage.total_paid * 0.9;

  const totalTaxPercent = taxConfig.das_icms_percent + taxConfig.pis_percent + taxConfig.cofins_percent + taxConfig.irpj_percent + taxConfig.csll_percent;

  return (
    <div className="space-y-6">
      {/* Auto-Sync Banner */}
      <Card className={autoSyncEnabled ? "border-2 border-green-500/30 bg-green-50/30 dark:bg-green-900/10" : ""}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className={`h-5 w-5 ${autoSyncEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
              <div>
                <p className="font-medium">Sincronização Automática</p>
                <p className="text-sm text-muted-foreground">
                  {autoSyncEnabled ? (currentAutoStep ? (currentAutoStep === 'billing' ? 'Sincronizando billing...' : currentAutoStep === 'backfill' ? 'Criando registros...' : 'Calculando custos...') : (allComplete ? "✓ Completo!" : "Monitorando")) : "Pausado"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {currentAutoStep && autoSyncEnabled && <Loader2 className="h-4 w-4 animate-spin text-green-500" />}
              {allComplete && autoSyncEnabled && <CheckCircle2 className="h-5 w-5 text-green-500" />}
              <Switch checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} />
            </div>
          </div>
        </CardContent>
      </Card>

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
          {/* Step 1: Billing */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Passo 1: Sincronizar Taxas (Billing)</CardTitle>
                  <CardDescription>Busca as taxas exatas de cada pedido da API do Mercado Livre</CardDescription>
                </div>
                {getBillingSyncBadge()}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                <div className="p-3 bg-muted rounded-lg"><p className="text-2xl font-bold">{billingStatus?.total_details?.toLocaleString() || 0}</p><p className="text-xs text-muted-foreground">Movimentos</p></div>
                <div className="p-3 bg-muted rounded-lg"><p className="text-2xl font-bold">{billingStatus?.unique_orders_with_billing?.toLocaleString() || 0}</p><p className="text-xs text-muted-foreground">Pedidos com Billing</p></div>
                <div className="p-3 bg-muted rounded-lg"><p className="text-2xl font-bold">{billingStatus?.periods_count || 0}</p><p className="text-xs text-muted-foreground">Períodos</p></div>
                <div className="p-3 bg-muted rounded-lg"><p className="text-sm font-medium">{billingStatus?.oldest_period || "—"}</p><p className="text-xs text-muted-foreground">Mais Antigo</p></div>
                <div className="p-3 bg-muted rounded-lg"><p className="text-sm font-medium">{billingStatus?.last_sync_at ? new Date(billingStatus.last_sync_at).toLocaleDateString('pt-BR') : "—"}</p><p className="text-xs text-muted-foreground">Última Sync</p></div>
              </div>
              {isBillingSyncing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm"><span>Progresso</span><span className="font-medium">{billingProgress}%</span></div>
                  <Progress value={billingProgress} className="h-2" />
                </div>
              )}
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-amber-700 dark:text-amber-300">O Mercado Livre disponibiliza billing 24 a 48h após a venda.</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => handleSyncBilling("recent")} disabled={syncingBilling || isBillingSyncing} variant="outline" className="gap-2">
                  {syncingBilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Últimos 12 Meses
                </Button>
                <Button onClick={() => handleSyncBilling("history")} disabled={syncingBilling || isBillingSyncing} className="gap-2">
                  {syncingBilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}Histórico Completo
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Calculate */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Passo 2: Calcular Custos Reais</CardTitle>
              <CardDescription>Cruza billing com pedidos para calcular custo total</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"><p className="text-2xl font-bold text-green-600">{coverage.with_real_billing.toLocaleString()}</p><p className="text-xs text-green-700 dark:text-green-400">Com Taxa Real</p></div>
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"><p className="text-2xl font-bold text-amber-600">{coverage.with_pending_billing.toLocaleString()}</p><p className="text-xs text-amber-700 dark:text-amber-400">Pendente</p></div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"><p className="text-2xl font-bold text-red-600">{(coverage.missing_breakdown || 0).toLocaleString()}</p><p className="text-xs text-red-700 dark:text-red-400">Sem Registro</p></div>
                <div className="p-3 bg-muted rounded-lg"><p className="text-2xl font-bold">{coverage.total_paid.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Pedidos</p></div>
                <div className="p-3 bg-muted rounded-lg"><p className="text-2xl font-bold">{coverage.coverage_percent}%</p><p className="text-xs text-muted-foreground">Cobertura Real</p></div>
              </div>
              {(coverage.missing_breakdown || 0) > 0 && (
                <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /><span className="text-sm text-red-700 dark:text-red-300"><strong>{coverage.missing_breakdown?.toLocaleString()}</strong> pedidos sem registro de custo</span></div>
                  <Button onClick={handleBackfillMissing} disabled={backfilling || backfillState?.status === 'running'} size="sm" variant="outline" className="gap-2 border-red-300 text-red-700 hover:bg-red-100">
                    {backfilling ? <Loader2 className="h-3 w-3 animate-spin" /> : null}Criar Registros
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div><p className="text-sm font-medium">Status</p><p className="text-xs text-muted-foreground">{coverage.total_processed.toLocaleString()} processados</p></div>
                {getStatusBadge()}
              </div>
              {isRunningOrPaused && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm"><span>Progresso</span><span className="font-medium">{progressPercent}%</span></div>
                  <Progress value={progressPercent} className="h-2" />
                </div>
              )}
              {formatLastActivity() && <p className="text-xs text-muted-foreground text-right">Última atividade: {formatLastActivity()}</p>}
              {canStart && (
                <div className="flex items-center gap-4">
                  <Label className="text-sm">Escopo:</Label>
                  <Select value={syncScope} onValueChange={setSyncScope}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os pedidos</SelectItem><SelectItem value="60">Últimos 60 dias</SelectItem><SelectItem value="90">Últimos 90 dias</SelectItem><SelectItem value="180">Últimos 180 dias</SelectItem></SelectContent></Select>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {canStart && <Button onClick={handleStartSync} className="gap-2"><Play className="h-4 w-4" />Calcular Custos Reais</Button>}
                {realCostsState?.status === 'running' && <Button variant="outline" onClick={handlePauseSync} className="gap-2"><Pause className="h-4 w-4" />Pausar</Button>}
                {realCostsState?.status === 'paused' && !autoSyncEnabled && (
                  <><Button onClick={() => handleContinueSync(false)} className="gap-2"><Play className="h-4 w-4" />Continuar</Button><Button variant="outline" onClick={() => handleContinueSync(true)} className="gap-2"><RefreshCw className="h-4 w-4" />Forçar</Button></>
                )}
                {isRunningOrPaused && <Button variant="ghost" onClick={() => setShowResetConfirm(true)} className="gap-2 text-destructive hover:text-destructive"><RotateCcw className="h-4 w-4" />Resetar</Button>}
                {realCostsState?.status === 'done' && <Button variant="outline" onClick={handleStartSync} className="gap-2"><RefreshCw className="h-4 w-4" />Recalcular</Button>}
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

      {/* Reset Dialogs */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Resetar sincronização?</AlertDialogTitle><AlertDialogDescription>Apaga todo o progresso e custos calculados.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => { setShowResetConfirm(false); setShowResetProgressConfirm(true); }}>Resetar Apenas Progresso</Button>
            <AlertDialogAction onClick={handleResetSync} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Resetar Tudo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResetProgressConfirm} onOpenChange={setShowResetProgressConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Resetar apenas progresso?</AlertDialogTitle><AlertDialogDescription>Os custos calculados serão mantidos.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleResetProgressOnly}>Resetar Progresso</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
