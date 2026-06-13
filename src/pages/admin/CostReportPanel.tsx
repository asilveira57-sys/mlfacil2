import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DailyReport {
  report_date: string;
  webhooks_received: number;
  webhooks_discarded: number;
  webhooks_processed: number;
  webhooks_pending: number;
  webhook_events_size_mb: number;
  print_queue_size_mb: number;
  orders_cache_size_mb: number;
  sellers_active: number;
  sellers_inactive_suspended: number;
  jobs_executed: number;
  jobs_blocked_by_hours: number;
  jobs_blocked_by_inactivity: number;
  storage_freed_mb: number;
}

interface AlertRow {
  id: string;
  kind: string;
  severity: string;
  payload: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

export function CostReportPanel() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: rep } = await (supabase as any)
      .from("cost_daily_report")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    setReport(rep ?? null);
    const { data: al } = await (supabase as any)
      .from("cost_alerts")
      .select("id, kind, severity, payload, resolved, created_at")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(20);
    setAlerts((al as AlertRow[]) ?? []);
    setLoading(false);
  };

  const runNow = async () => {
    setRunning(true);
    try {
      await supabase.functions.invoke("cost-daily-report", {});
      await load();
    } finally {
      setRunning(false);
    }
  };

  const resolveAlert = async (id: string) => {
    await (supabase as any).from("cost_alerts")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Relatório diário de custo</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runNow} disabled={running}>
            <RefreshCw className={`h-4 w-4 mr-2 ${running ? "animate-spin" : ""}`} />
            Gerar agora
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : !report ? (
        <p className="text-sm text-muted-foreground">Nenhum relatório ainda. Clique em "Gerar agora".</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Webhooks recebidos (24h)" value={report.webhooks_received} />
          <Metric label="Webhooks descartados" value={report.webhooks_discarded} />
          <Metric label="Webhooks processados" value={report.webhooks_processed} />
          <Metric label="Webhooks pendentes" value={report.webhooks_pending} alarm={report.webhooks_pending > 50000} />
          <Metric label="webhook_events (MB)" value={report.webhook_events_size_mb.toFixed(1)} />
          <Metric label="print_queue (MB)" value={report.print_queue_size_mb.toFixed(1)} alarm={report.print_queue_size_mb > 500} />
          <Metric label="orders_cache (MB)" value={report.orders_cache_size_mb.toFixed(1)} />
          <Metric label="Sellers ativos (≤3d)" value={report.sellers_active} />
          <Metric label="Sellers suspensos (inativos)" value={report.sellers_inactive_suspended} />
          <Metric label="Jobs executados" value={report.jobs_executed} />
          <Metric label="Bloqueados por horário" value={report.jobs_blocked_by_hours} />
          <Metric label="Bloqueados por inatividade" value={report.jobs_blocked_by_inactivity} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas não resolvidos</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum alerta ativo.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Detalhe</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.kind}</TableCell>
                    <TableCell>
                      <Badge variant={a.severity === "critical" ? "destructive" : "secondary"}>{a.severity}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {JSON.stringify(a.payload)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => resolveAlert(a.id)}>Resolver</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, alarm }: { label: string; value: number | string; alarm?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${alarm ? "border-destructive bg-destructive/5" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${alarm ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

export default CostReportPanel;
