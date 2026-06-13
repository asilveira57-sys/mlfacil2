import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Leaf, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CostReportPanel } from "./CostReportPanel";

interface SyncLogRow {
  id: string;
  module_name: string;
  action: string;
  status: string;
  reason: string | null;
  seller_id: string | null;
  user_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface AggregateRow {
  module_name: string;
  status: string;
  count: number;
}

const PAUSED_MODULES = [
  "radiografia",
  "ads",
  "promotions",
  "seed",
  "abc",
  "custos",
  "frete",
  "ajuste_preco",
  "atacado",
  "ad_timeline",
  "label_teste",
  "tendencias",
  "mercado",
];

const ACTIVE_MODULES = ["shipping_labels", "shipping_full"];

export function AdminEconomyMode() {
  const [logs, setLogs] = useState<SyncLogRow[]>([]);
  const [aggregates, setAggregates] = useState<AggregateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data: recent } = await (supabase as any)
        .from("system_sync_logs")
        .select("id, module_name, action, status, reason, seller_id, user_id, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(100);

      setLogs((recent as SyncLogRow[]) || []);

      // 7-day aggregates
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: agg } = await (supabase as any)
        .from("system_sync_logs")
        .select("module_name, status")
        .gte("created_at", sevenDaysAgo);

      const counts = new Map<string, AggregateRow>();
      ((agg as Array<{ module_name: string; status: string }>) || []).forEach((row) => {
        const key = `${row.module_name}::${row.status}`;
        const existing = counts.get(key);
        if (existing) existing.count += 1;
        else counts.set(key, { module_name: row.module_name, status: row.status, count: 1 });
      });
      setAggregates(Array.from(counts.values()).sort((a, b) => b.count - a.count));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
            <Leaf className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Modo Econômico</h2>
            <p className="text-sm text-muted-foreground">
              Auditoria de sync automático, crons e módulos pausados
            </p>
          </div>
        </div>
        <Button onClick={load} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Módulos pausados (auto-sync desligado)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {PAUSED_MODULES.map((m) => (
                <Badge key={m} variant="secondary">{m}</Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Estes módulos só atualizam quando o usuário clica em <strong>Atualizar</strong>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Módulos com auto-sync permitido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {ACTIVE_MODULES.map((m) => (
                <Badge key={m} className="bg-emerald-600 hover:bg-emerald-700">{m}</Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Apenas dentro da janela 06:00–20:00 BRT (seg-sex) ou 06:00–15:00 sábado.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Decisões últimos 7 dias (por módulo + status)</CardTitle>
        </CardHeader>
        <CardContent>
          {aggregates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem registros recentes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Eventos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregates.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{row.module_name}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "blocked" ? "secondary" : row.status === "executed" ? "default" : "outline"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas 100 decisões</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {loading ? "Carregando..." : "Sem logs ainda."}
            </p>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Módulo</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.module_name}</TableCell>
                      <TableCell className="text-xs">{log.action}</TableCell>
                      <TableCell>
                        <Badge variant={log.status === "blocked" ? "secondary" : log.status === "executed" ? "default" : log.status === "error" ? "destructive" : "outline"} className="text-xs">
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.reason ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cron jobs ativos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            A lista completa de crons (e os que foram desativados nesta fase) está documentada na migration mais recente
            de modo econômico. Crons ligados a Tendências e Radiografia foram desligados; apenas Etiquetas, Mensagens,
            Status de Envio, Cobrança, E-mails e snapshots mensais permanecem ativos.
          </p>
        </CardContent>
      </Card>

      <CostReportPanel />
    </div>
  );
}

export default AdminEconomyMode;
