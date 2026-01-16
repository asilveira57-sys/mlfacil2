import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, DollarSign, Percent, Package, Play, Pause, RotateCcw, AlertCircle, Clock, Loader2, Database, FileText, AlertTriangle } from "lucide-react";
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

interface CoverageStats { 
  total_paid: number; 
  with_real_billing: number; 
  with_pending_billing: number;
  total_processed: number;
  coverage_percent: number; 
}

interface BillingStatus {
  total_details: number;
  unique_orders_with_billing: number;
  unique_shipments_with_billing?: number;
  periods_count?: number;
  oldest_period: string | null;
  newest_period: string | null;
  last_sync_at: string | null;
}

export function CostSettings({ sellerId }: CostSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packagingCost, setPackagingCost] = useState("0");
  const [packagingMode, setPackagingMode] = useState("per_order");
  const [feePercent, setFeePercent] = useState("17");
  const [feeMode, setFeeMode] = useState("percent");
  const [realCostsState, setRealCostsState] = useState<RealCostsSyncState | null>(null);
  const [coverage, setCoverage] = useState<CoverageStats & { missing_breakdown?: number }>({ total_paid: 0, with_real_billing: 0, with_pending_billing: 0, total_processed: 0, coverage_percent: 0 });
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [syncScope, setSyncScope] = useState<string>("all");
  const [billingScope, setBillingScope] = useState<string>("recent");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [syncingBilling, setSyncingBilling] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoResumeAttemptedRef = useRef(false);

  useEffect(() => {
    loadSettings();
    loadRealCostsStatus();
    loadBillingStatus();
    pollIntervalRef.current = setInterval(() => {
      loadRealCostsStatus();
      loadBillingStatus();
    }, 3000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [sellerId]);

  useEffect(() => {
    if (!realCostsState) return;
    if (realCostsState.status === 'paused' && !autoResumeAttemptedRef.current) {
      autoResumeAttemptedRef.current = true;
      handleContinueSync();
    }
    if (realCostsState.status !== 'paused') autoResumeAttemptedRef.current = false;
  }, [realCostsState]);

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
    try {
      toast.info(scope === "history" ? "Sincronizando histórico completo de billing..." : "Sincronizando billing recente (últimos 12 meses)...");
      const { data, error } = await supabase.functions.invoke("ml-sync-billing-details", { body: { seller_id: sellerId, action: "sync", scope } });
      if (error) throw error;
      toast.success(`Billing sincronizado: ${data?.records_inserted || 0} registros, ${data?.periods_processed || 0} períodos`);
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
      toast.info("Criando breakdown para pedidos sem registro...");
      const { data, error } = await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "backfill_missing", scope_days: syncScope === "all" ? null : parseInt(syncScope) } });
      if (error) throw error;
      toast.success(data?.message || "Backfill concluído");
      loadRealCostsStatus();
    } catch (err: any) { 
      toast.error("Erro no backfill: " + (err?.message || "Erro desconhecido")); 
    } finally { 
      setBackfilling(false); 
    }
  };

  const handleStartSync = async () => {
    try {
      autoResumeAttemptedRef.current = false;
      await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "start", scope_days: syncScope === "all" ? null : parseInt(syncScope) } });
      toast.success("Sincronização iniciada");
      loadRealCostsStatus();
    } catch { toast.error("Erro ao iniciar sincronização"); }
  };

  const handleContinueSync = async (forceResume = false) => {
    try {
      const { data } = await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "continue", force_resume: forceResume } });
      if (data?.message?.includes("complete")) { toast.success("Sincronização concluída!"); autoResumeAttemptedRef.current = false; }
      loadRealCostsStatus();
    } catch { autoResumeAttemptedRef.current = false; }
  };

  const handlePauseSync = async () => {
    try {
      await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "pause" } });
      toast.info("Sincronização pausada (progresso preservado)");
      autoResumeAttemptedRef.current = true;
      loadRealCostsStatus();
    } catch { toast.error("Erro ao pausar sincronização"); }
  };

  const handleResetSync = async () => {
    try {
      await supabase.functions.invoke("ml-sync-real-costs", { body: { seller_id: sellerId, action: "reset" } });
      toast.success("Sincronização resetada");
      setRealCostsState(null);
      setShowResetConfirm(false);
      loadRealCostsStatus();
    } catch { toast.error("Erro ao resetar sincronização"); }
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

  return (
    <div className="space-y-6">
      {/* Step 1: Sync Billing Details */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Passo 1: Sincronizar Taxas (Billing Reports)</CardTitle>
          <CardDescription>Busca as taxas exatas de cada pedido diretamente da API do Mercado Livre</CardDescription>
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

          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span className="text-amber-700 dark:text-amber-300">O Mercado Livre disponibiliza billing ~24h após a venda. Pedidos recentes aparecerão como "Pendente".</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => handleSyncBilling("recent")} disabled={syncingBilling} variant="outline" className="gap-2">
              {syncingBilling ? <><Loader2 className="h-4 w-4 animate-spin" />Sincronizando...</> : <><FileText className="h-4 w-4" />Últimos 12 Meses</>}
            </Button>
            <Button onClick={() => handleSyncBilling("history")} disabled={syncingBilling} className="gap-2">
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

          {/* Missing breakdown alert */}
          {(coverage.missing_breakdown || 0) > 0 && (
            <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-red-700 dark:text-red-300">
                  <strong>{coverage.missing_breakdown?.toLocaleString()}</strong> pedidos ainda não têm registro de custo
                </span>
              </div>
              <Button 
                onClick={handleBackfillMissing} 
                disabled={backfilling} 
                size="sm" 
                variant="outline" 
                className="gap-2 border-red-300 text-red-700 hover:bg-red-100"
              >
                {backfilling ? <><Loader2 className="h-3 w-3 animate-spin" />Criando...</> : "Criar Registros"}
              </Button>
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
                {realCostsState?.status === 'paused' && <span className="flex items-center gap-1 text-yellow-600"><Clock className="h-3 w-3" />Pausado - retomando...</span>}
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
            {realCostsState?.status === 'paused' && (
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
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleResetSync} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Resetar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
