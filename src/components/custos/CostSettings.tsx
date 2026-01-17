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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, DollarSign, Percent, Package, Play, Pause, RotateCcw, AlertCircle, Clock, Loader2, Database, FileText, AlertTriangle, Zap, CheckCircle2, FastForward } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface CostSettingsProps { sellerId: string; }

interface RealCostsSyncState { 
  status: string; 
  processed: number; 
  total: number; 
  cursor_offset: number; 
  scope_days: number | null; 
  last_error: string | null; 
  last_heartbeat_at: string | null; 
  stats_json: { billing?: number; pending?: number; with_shipping?: number } | null; 
}

interface BackfillSyncState {
  status: string;
  cursor_offset: number;
  total_orders: number;
  processed_orders: number;
  with_billing: number;
  last_heartbeat_at: string | null;
}

interface CoverageStats { 
  total_paid: number; 
  with_real_billing: number; 
  with_pending_billing: number;
  total_processed: number;
  coverage_percent: number; 
}

interface BillingSyncState {
  status: string;
  scope: string | null;
  periods_offset: number;
  total_periods: number;
  processed_periods: number;
  last_error: string | null;
  last_heartbeat_at: string | null;
}

interface BillingStatus {
  total_details: number;
  unique_orders_with_billing: number;
  unique_shipments_with_billing?: number;
  periods_count?: number;
  oldest_period: string | null;
  newest_period: string | null;
  last_sync_at: string | null;
  sync_state?: BillingSyncState | null;
}

export function CostSettings({ sellerId }: CostSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packagingCost, setPackagingCost] = useState("0");
  const [packagingMode, setPackagingMode] = useState("per_order");
  const [feePercent, setFeePercent] = useState("17");
  const [feeMode, setFeeMode] = useState("percent");
  const [realCostsState, setRealCostsState] = useState<RealCostsSyncState | null>(null);
  const [backfillState, setBackfillState] = useState<BackfillSyncState | null>(null);
  const [coverage, setCoverage] = useState<CoverageStats & { missing_breakdown?: number }>({ total_paid: 0, with_real_billing: 0, with_pending_billing: 0, total_processed: 0, coverage_percent: 0 });
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [syncScope, setSyncScope] = useState<string>("all");
  const [billingScope, setBillingScope] = useState<string>("recent");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showResetProgressConfirm, setShowResetProgressConfirm] = useState(false);
  const [syncingBilling, setSyncingBilling] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  
  // Auto-sync watchdog state - synced with global via localStorage
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() => {
    return localStorage.getItem("cost_watchdog_enabled") !== "false";
  });
  const [currentAutoStep, setCurrentAutoStep] = useState<string | null>(null);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastBillingScope = useRef<string>("history");

  // Sync sellerId to localStorage for global watchdog
  useEffect(() => {
    localStorage.setItem("cost_watchdog_seller_id", sellerId);
  }, [sellerId]);

  // Sync autoSyncEnabled to localStorage for global watchdog
  useEffect(() => {
    localStorage.setItem("cost_watchdog_enabled", autoSyncEnabled ? "true" : "false");
  }, [autoSyncEnabled]);

  // Load initial data
  useEffect(() => {
    loadSettings();
    loadRealCostsStatus();
    loadBillingStatus();
    loadBackfillState();
    
    // Polling for status updates (UI only, not action triggering)
    pollIntervalRef.current = setInterval(() => {
      loadRealCostsStatus();
      loadBillingStatus();
      loadBackfillState();
    }, 3000);
    
    return () => { 
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [sellerId]);

  // Update current step based on state changes (for UI display only)
  useEffect(() => {
    const billingSyncState = billingStatus?.sync_state;
    if (billingSyncState?.status === 'running' || billingSyncState?.status === 'paused') {
      setCurrentAutoStep("billing");
    } else if (backfillState?.status === 'running' || backfillState?.status === 'paused') {
      setCurrentAutoStep("backfill");
    } else if (realCostsState?.status === 'running' || realCostsState?.status === 'paused') {
      setCurrentAutoStep("realcosts");
    } else if ((coverage.missing_breakdown || 0) === 0 && coverage.with_pending_billing === 0 && coverage.with_real_billing > 0) {
      setCurrentAutoStep(null);
    } else {
      setCurrentAutoStep(null);
    }
  }, [billingStatus, backfillState, realCostsState, coverage]);

  const loadSettings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: packagingData } = await supabase.from("packaging_cost_settings").select("*").eq("seller_id", sellerId).maybeSingle();
      if (packagingData) { setPackagingCost(packagingData.default_packaging_cost?.toString() || "0"); setPackagingMode(packagingData.packaging_cost_mode || "per_order"); }
      const { data: feeData } = await supabase.from("marketplace_fee_rules").select("*").eq("seller_id", sellerId).maybeSingle();
      if (feeData) { setFeePercent(feeData.fee_percent_default?.toString() || "17"); setFeeMode(feeData.fee_mode || "percent"); }
      setLoading(false);
    } catch { setLoading(false); }
  };

  const loadRealCostsStatus = async () => {
    try {
      const { data } = await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "status" } });
      if (data?.state) setRealCostsState(data.state);
      if (data?.coverage) setCoverage(data.coverage);
    } catch {}
  };

  const loadBillingStatus = async () => {
    try {
      const { data } = await supabase.functions.invoke("ml-sync-billing-details", { body: { seller_id: sellerId, action: "status" } });
      if (data) setBillingStatus(data);
    } catch {}
  };

  const loadBackfillState = async () => {
    try {
      const { data } = await supabase.from("meli_backfill_sync_state").select("*").eq("seller_id", sellerId).maybeSingle();
      if (data) setBackfillState(data);
    } catch {}
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      await supabase.from("packaging_cost_settings").upsert({ user_id: session.user.id, seller_id: sellerId, default_packaging_cost: parseFloat(packagingCost) || 0, packaging_cost_mode: packagingMode, updated_at: new Date().toISOString() }, { onConflict: "seller_id" });
      await supabase.from("marketplace_fee_rules").upsert({ user_id: session.user.id, seller_id: sellerId, fee_percent_default: parseFloat(feePercent) || 17, fee_mode: feeMode, updated_at: new Date().toISOString() }, { onConflict: "seller_id" });
      toast.success("Configurações salvas!");
    } catch { toast.error("Erro ao salvar configurações"); } finally { setSaving(false); }
  };

  const handleSyncBilling = async (scope: string = "recent") => {
    setSyncingBilling(true);
    lastBillingScope.current = scope;
    try {
      toast.info(scope === "history" ? "Sincronizando histórico completo de billing (automático)..." : "Sincronizando billing recente (últimos 12 meses)...");
      const { data, error } = await supabase.functions.invoke("ml-sync-billing-details", { body: { seller_id: sellerId, action: "sync", scope } });
      if (error) throw error;
      
      if (data?.status === 'paused') {
        toast.info(`Billing pausado (${data.periods_processed || 0} períodos). Continuará automaticamente...`);
      } else if (data?.status === 'done') {
        toast.success(`Billing completo: ${data?.records_inserted || 0} registros, ${data?.periods_processed || 0} períodos`);
      } else {
        toast.success(`Billing sincronizado: ${data?.records_inserted || 0} registros, ${data?.periods_processed || 0} períodos`);
      }
      loadBillingStatus();
    } catch (err: any) { 
      toast.error("Erro ao sincronizar billing: " + (err?.message || "Erro desconhecido")); 
    } finally { 
      setSyncingBilling(false); 
    }
  };

  const handleBackfillMissing = async () => {
    setBackfilling(true);
    try {
      toast.info("Criando breakdown para pedidos sem registro (automático)...");
      const { data, error } = await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "backfill_missing", scope_days: syncScope === "all" ? null : parseInt(syncScope) } });
      if (error) throw error;
      
      if (data?.status === 'paused') {
        toast.info(`Criados ${data.processed || 0} registros. Continuará automaticamente...`);
      } else {
        toast.success(data?.message || "Backfill concluído");
      }
      loadRealCostsStatus();
      loadBackfillState();
    } catch (err: any) { 
      toast.error("Erro no backfill: " + (err?.message || "Erro desconhecido")); 
    } finally { 
      setBackfilling(false); 
    }
  };

  const handleStartSync = async () => {
    try {
      await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "start", scope_days: syncScope === "all" ? null : parseInt(syncScope) } });
      toast.success("Sincronização iniciada");
      loadRealCostsStatus();
    } catch { toast.error("Erro ao iniciar sincronização"); }
  };

  const handleContinueSync = async (forceResume = false) => {
    try {
      const { data } = await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "continue", force_resume: forceResume } });
      if (data?.message?.includes("complete")) { toast.success("Sincronização concluída!"); }
      loadRealCostsStatus();
    } catch {}
  };

  const handlePauseSync = async () => {
    // Disable auto-sync temporarily
    setAutoSyncEnabled(false);
    try {
      await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "pause" } });
      toast.info("Sincronização pausada (automático desativado)");
      loadRealCostsStatus();
    } catch { toast.error("Erro ao pausar sincronização"); }
  };

  const handleResetSync = async () => {
    try {
      await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "reset" } });
      // Also reset backfill state
      await supabase.from("meli_backfill_sync_state").delete().eq("seller_id", sellerId);
      toast.success("Sincronização resetada");
      setRealCostsState(null);
      setBackfillState(null);
      setShowResetConfirm(false);
      loadRealCostsStatus();
    } catch { toast.error("Erro ao resetar sincronização"); }
  };

  const handleResetProgressOnly = async () => {
    try {
      // Reset ONLY state tables, not the breakdown data
      await supabase.from("meli_real_costs_sync_state").delete().eq("seller_id", sellerId);
      await supabase.from("meli_backfill_sync_state").delete().eq("seller_id", sellerId);
      await supabase.from("meli_billing_details_sync_state").delete().eq("seller_id", sellerId);
      toast.success("Progresso resetado (dados mantidos)");
      setRealCostsState(null);
      setBackfillState(null);
      setShowResetProgressConfirm(false);
      loadRealCostsStatus();
      loadBillingStatus();
      loadBackfillState();
    } catch { toast.error("Erro ao resetar progresso"); }
  };

  const handleForceResumeBilling = async () => {
    try {
      toast.info("Forçando retomada do billing...");
      await supabase.functions.invoke("ml-sync-billing-details", {
        body: { seller_id: sellerId, action: "sync", scope: billingStatus?.sync_state?.scope || lastBillingScope.current }
      });
      loadBillingStatus();
    } catch { toast.error("Erro ao retomar billing"); }
  };

  const handleForceResumeBackfill = async () => {
    try {
      toast.info("Forçando retomada do backfill...");
      await supabase.functions.invoke("ml-sync-real-costs", {
        body: { seller_id: sellerId, action: "continue_backfill" }
      });
      loadBackfillState();
    } catch { toast.error("Erro ao retomar backfill"); }
  };

  const handleForceResumeRealCosts = async () => {
    try {
      toast.info("Forçando retomada dos custos...");
      await supabase.functions.invoke("ml-sync-real-costs", {
        body: { seller_id: sellerId, action: "continue", force_resume: true }
      });
      loadRealCostsStatus();
    } catch { toast.error("Erro ao retomar custos"); }
  };

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
    const syncState = billingStatus?.sync_state;
    if (!syncState) return null;
    switch (syncState.status) {
      case 'running': return <Badge className="bg-blue-500 text-white animate-pulse">Sincronizando</Badge>;
      case 'paused': return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Pausado</Badge>;
      case 'done': return <Badge className="bg-green-500 text-white">Completo</Badge>;
      case 'error': return <Badge variant="destructive">Erro</Badge>;
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

  const getAutoSyncStepLabel = () => {
    switch (currentAutoStep) {
      case 'billing': return 'Sincronizando billing...';
      case 'backfill': return 'Criando registros...';
      case 'realcosts': return 'Calculando custos...';
      default: return null;
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>;

  const progressPercent = realCostsState?.total > 0 ? Math.round((realCostsState.processed / realCostsState.total) * 100) : 0;
  const isRunningOrPaused = realCostsState?.status === 'running' || realCostsState?.status === 'paused';
  const canStart = !realCostsState || realCostsState.status === 'idle' || realCostsState.status === 'done' || realCostsState.status === 'error';
  
  const billingSyncState = billingStatus?.sync_state;
  const billingProgress = billingSyncState?.total_periods > 0 ? Math.round((billingSyncState.processed_periods / billingSyncState.total_periods) * 100) : 0;
  const isBillingSyncing = billingSyncState?.status === 'running' || billingSyncState?.status === 'paused';

  // Check if everything is complete
  const allComplete = (coverage.missing_breakdown || 0) === 0 && 
                      coverage.with_real_billing > 0 && 
                      coverage.with_real_billing >= coverage.total_paid * 0.9; // >90% coverage

  return (
    <div className="space-y-6">
      {/* Auto-Sync Control Banner */}
      <Card className={autoSyncEnabled ? "border-2 border-green-500/30 bg-green-50/30 dark:bg-green-900/10" : ""}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Zap className={`h-5 w-5 ${autoSyncEnabled ? 'text-green-500' : 'text-muted-foreground'}`} />
              <div>
                <p className="font-medium">Sincronização Automática</p>
                <p className="text-sm text-muted-foreground">
                  {autoSyncEnabled 
                    ? (currentAutoStep ? getAutoSyncStepLabel() : (allComplete ? "✓ Completo!" : "Monitorando e continuando automaticamente"))
                    : "Pausado - clique para ativar"
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {currentAutoStep && autoSyncEnabled && (
                <Loader2 className="h-4 w-4 animate-spin text-green-500" />
              )}
              {allComplete && autoSyncEnabled && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              <Switch checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Sync Billing Details */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Passo 1: Sincronizar Taxas (Billing Reports)</CardTitle>
              <CardDescription>Busca as taxas exatas de cada pedido diretamente da API do Mercado Livre</CardDescription>
            </div>
            {getBillingSyncBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{billingStatus?.total_details?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Movimentos</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{billingStatus?.unique_orders_with_billing?.toLocaleString() || 0}</p>
              <p className="text-xs text-muted-foreground">Pedidos com Billing</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{billingStatus?.periods_count || 0}</p>
              <p className="text-xs text-muted-foreground">Períodos</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{billingStatus?.oldest_period || "—"}</p>
              <p className="text-xs text-muted-foreground">Período Mais Antigo</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">{billingStatus?.last_sync_at ? new Date(billingStatus.last_sync_at).toLocaleDateString('pt-BR') : "—"}</p>
              <p className="text-xs text-muted-foreground">Última Sync</p>
            </div>
          </div>

          {/* Billing sync progress */}
          {isBillingSyncing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Progresso de períodos</span>
                <span className="font-medium">{billingProgress}%</span>
              </div>
              <Progress value={billingProgress} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{billingSyncState?.processed_periods || 0} / {billingSyncState?.total_periods || 0} períodos</span>
                {billingSyncState?.status === 'running' && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Processando...</span>}
                {billingSyncState?.status === 'paused' && autoSyncEnabled && <span className="flex items-center gap-1 text-green-600"><Clock className="h-3 w-3" />Auto-retomando...</span>}
                {billingSyncState?.status === 'paused' && !autoSyncEnabled && <span className="flex items-center gap-1 text-yellow-600"><Clock className="h-3 w-3" />Pausado (ative automático)</span>}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span className="text-amber-700 dark:text-amber-300">O Mercado Livre disponibiliza billing ~24h após a venda. Pedidos recentes aparecerão como "Pendente".</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => handleSyncBilling("recent")} disabled={syncingBilling || isBillingSyncing} variant="outline" className="gap-2">
              {syncingBilling ? <><Loader2 className="h-4 w-4 animate-spin" />Sincronizando...</> : <><FileText className="h-4 w-4" />Últimos 12 Meses</>}
            </Button>
            <Button onClick={() => handleSyncBilling("history")} disabled={syncingBilling || isBillingSyncing} className="gap-2">
              {syncingBilling ? <><Loader2 className="h-4 w-4 animate-spin" />Sincronizando...</> : <><Database className="h-4 w-4" />Histórico Completo</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Calculate Real Costs */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />Passo 2: Calcular Custos Reais</CardTitle>
          <CardDescription>Cruza os dados de billing com os pedidos para calcular o custo total de marketplace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-2xl font-bold text-green-600">{coverage.with_real_billing.toLocaleString()}</p>
              <p className="text-xs text-green-700 dark:text-green-400">Com Taxa Real</p>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-2xl font-bold text-amber-600">{coverage.with_pending_billing.toLocaleString()}</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">Pendente</p>
            </div>
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-2xl font-bold text-red-600">{(coverage.missing_breakdown || 0).toLocaleString()}</p>
              <p className="text-xs text-red-700 dark:text-red-400">Sem Registro</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{coverage.total_paid.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Pedidos</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{coverage.coverage_percent}%</p>
              <p className="text-xs text-muted-foreground">Cobertura Real</p>
            </div>
          </div>

          {/* Missing breakdown alert with auto-sync indicator */}
          {(coverage.missing_breakdown || 0) > 0 && (
            <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-red-700 dark:text-red-300">
                  <strong>{coverage.missing_breakdown?.toLocaleString()}</strong> pedidos ainda não têm registro de custo
                  {autoSyncEnabled && backfillState?.status !== 'running' && " (será criado automaticamente)"}
                </span>
              </div>
              <Button 
                onClick={handleBackfillMissing} 
                disabled={backfilling || backfillState?.status === 'running'} 
                size="sm" 
                variant="outline" 
                className="gap-2 border-red-300 text-red-700 hover:bg-red-100"
              >
                {backfilling || backfillState?.status === 'running' ? <><Loader2 className="h-3 w-3 animate-spin" />Criando...</> : "Criar Registros"}
              </Button>
            </div>
          )}

          {/* Backfill progress */}
          {backfillState && (backfillState.status === 'running' || backfillState.status === 'paused') && (
            <div className="space-y-2 p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span>Criando registros de breakdown</span>
                <span className="font-medium">
                  {backfillState.processed_orders?.toLocaleString() || 0} processados
                </span>
              </div>
              <div className="flex items-center justify-between">
                {backfillState.status === 'paused' && autoSyncEnabled && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Clock className="h-3 w-3" />Continuando automaticamente...
                  </p>
                )}
                {backfillState.status === 'paused' && (
                  <Button onClick={handleForceResumeBackfill} size="sm" variant="outline" className="gap-1">
                    <FastForward className="h-3 w-3" />Forçar Retomar
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="text-sm font-medium">Status da Sincronização</p>
              <p className="text-xs text-muted-foreground">{coverage.total_processed.toLocaleString()} pedidos processados</p>
            </div>
            {getStatusBadge()}
          </div>

          {isRunningOrPaused && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm"><span>Progresso desta execução</span><span className="font-medium">{progressPercent}%</span></div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{realCostsState?.processed?.toLocaleString() || 0} / {realCostsState?.total?.toLocaleString() || 0} pedidos</span>
                {realCostsState?.status === 'running' && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Processando...</span>}
                {realCostsState?.status === 'paused' && autoSyncEnabled && <span className="flex items-center gap-1 text-green-600"><Clock className="h-3 w-3" />Auto-retomando...</span>}
                {realCostsState?.status === 'paused' && !autoSyncEnabled && <span className="flex items-center gap-1 text-yellow-600"><Clock className="h-3 w-3" />Pausado</span>}
              </div>
            </div>
          )}

          {realCostsState?.stats_json && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                <p className="font-medium text-green-600">{realCostsState.stats_json.billing || 0}</p>
                <p className="text-green-700 dark:text-green-400">Taxa Real</p>
              </div>
              <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                <p className="font-medium text-amber-600">{realCostsState.stats_json.pending || 0}</p>
                <p className="text-amber-700 dark:text-amber-400">Pendente</p>
              </div>
              <div className="p-2 bg-muted/50 rounded">
                <p className="font-medium">{realCostsState.stats_json.with_shipping || 0}</p>
                <p className="text-muted-foreground">Com Frete</p>
              </div>
            </div>
          )}

          {realCostsState?.status === 'error' && realCostsState.last_error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 text-destructive"><AlertCircle className="h-4 w-4" /><span className="text-sm font-medium">Erro na sincronização</span></div>
              <p className="text-xs text-muted-foreground mt-1">{realCostsState.last_error}</p>
            </div>
          )}

          {formatLastActivity() && <p className="text-xs text-muted-foreground text-right">Última atividade: {formatLastActivity()}</p>}

          {canStart && (
            <div className="flex items-center gap-4">
              <Label className="text-sm">Escopo:</Label>
              <Select value={syncScope} onValueChange={setSyncScope}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os pedidos</SelectItem>
                  <SelectItem value="60">Últimos 60 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                  <SelectItem value="180">Últimos 180 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {canStart && <Button onClick={handleStartSync} className="gap-2"><Play className="h-4 w-4" />Calcular Custos Reais</Button>}
            {realCostsState?.status === 'running' && <Button variant="outline" onClick={handlePauseSync} className="gap-2"><Pause className="h-4 w-4" />Pausar</Button>}
            {realCostsState?.status === 'paused' && !autoSyncEnabled && (
              <>
                <Button onClick={() => handleContinueSync(false)} className="gap-2"><Play className="h-4 w-4" />Continuar</Button>
                <Button variant="outline" onClick={() => handleContinueSync(true)} className="gap-2"><RefreshCw className="h-4 w-4" />Forçar Retomar</Button>
              </>
            )}
            {isRunningOrPaused && <Button variant="ghost" onClick={() => setShowResetConfirm(true)} className="gap-2 text-destructive hover:text-destructive"><RotateCcw className="h-4 w-4" />Resetar</Button>}
            {realCostsState?.status === 'done' && <Button variant="outline" onClick={handleStartSync} className="gap-2"><RefreshCw className="h-4 w-4" />Recalcular</Button>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Custo de Embalagem</CardTitle><CardDescription>Configure o custo padrão de embalagem para cálculo de lucro</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Valor padrão (R$)</Label><Input type="number" step="0.01" value={packagingCost} onChange={(e) => setPackagingCost(e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-2"><Label>Modo de aplicação</Label><Select value={packagingMode} onValueChange={setPackagingMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="per_order">Por pedido</SelectItem><SelectItem value="per_item">Por item</SelectItem></SelectContent></Select></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Percent className="h-5 w-5" />Taxa de Venda (Legado)</CardTitle><CardDescription>Esta configuração é mantida apenas para referência. O sistema agora usa exclusivamente dados reais da API.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
            <p>⚠️ O sistema não usa mais taxas estimadas. Pedidos sem dados de billing são marcados como "Pendente" até que o Mercado Livre disponibilize os dados (geralmente 24h após a venda).</p>
          </div>
          <div className="grid grid-cols-2 gap-4 opacity-50">
            <div className="space-y-2"><Label>Taxa padrão (%)</Label><Input type="number" step="0.1" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} placeholder="17" disabled /></div>
            <div className="space-y-2"><Label>Modo de cálculo</Label><Select value={feeMode} onValueChange={setFeeMode} disabled><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">Percentual</SelectItem><SelectItem value="real">Usar dados reais</SelectItem></SelectContent></Select></div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end"><Button onClick={handleSaveSettings} disabled={saving}>{saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : "Salvar Configurações"}</Button></div>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Resetar sincronização?</AlertDialogTitle><AlertDialogDescription>Esta ação irá apagar todo o progresso da sincronização atual E zerar os custos calculados. Você precisará sincronizar o billing e calcular os custos novamente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => { setShowResetConfirm(false); setShowResetProgressConfirm(true); }}>Resetar Apenas Progresso</Button>
            <AlertDialogAction onClick={handleResetSync} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Resetar Tudo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResetProgressConfirm} onOpenChange={setShowResetProgressConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Resetar apenas progresso?</AlertDialogTitle><AlertDialogDescription>Esta ação irá resetar apenas o progresso da sincronização. Os custos já calculados serão mantidos. Útil para destravar processos travados.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleResetProgressOnly}>Resetar Progresso</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
