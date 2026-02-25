import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, 
  Clock, Server, Database, Bell, BarChart3, Upload, 
  Puzzle, Globe, ChevronDown, ChevronUp 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const SERVICE_ICONS: Record<string, React.ElementType> = {
  "API Mercado Livre": Globe,
  "Worker de Sincronização": RefreshCw,
  "Importação de Vendas": Upload,
  "Dashboard": BarChart3,
  "Extensão": Puzzle,
  "Banco de Dados": Database,
  "Sistema de Notificações": Bell,
};

const STATUS_CONFIG = {
  operational: { label: "Operacional", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  unstable: { label: "Instabilidade", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20", icon: AlertTriangle },
  down: { label: "Interrupção", color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", icon: XCircle },
};

function getOverallStatus(services: any[]): "operational" | "unstable" | "down" {
  if (services.some(s => s.status === "down")) return "down";
  if (services.some(s => s.status === "unstable")) return "unstable";
  return "operational";
}

const OVERALL_LABELS = {
  operational: "Todos os sistemas operacionais",
  unstable: "Alguns serviços apresentam instabilidade",
  down: "Interrupção detectada em um ou mais serviços",
};

export default function SystemStatus() {
  const [showHistory, setShowHistory] = useState<string | null>(null);

  const { data: services = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["system-status-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_status_services")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["system-status-incidents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents_log")
        .select("*, system_status_services(service_name)")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  const overallStatus = getOverallStatus(services);
  const overallConfig = STATUS_CONFIG[overallStatus];
  const OverallIcon = overallConfig.icon;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Status do Sistema</h1>
            <p className="text-sm text-muted-foreground">
              Acompanhe a disponibilidade e o desempenho dos serviços em tempo real.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Overall Status Card */}
        <Card className={cn("border-2", overallConfig.bg)}>
          <CardContent className="flex items-center gap-4 py-6">
            <OverallIcon className={cn("h-12 w-12", overallConfig.color)} />
            <div className="flex-1">
              <h2 className={cn("text-xl font-semibold", overallConfig.color)}>
                {OVERALL_LABELS[overallStatus]}
              </h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3.5 w-3.5" />
                Última verificação: {dataUpdatedAt 
                  ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true, locale: ptBR })
                  : "—"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Services Grid */}
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Serviços</h3>
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="py-6 space-y-3">
                    <div className="h-5 bg-muted rounded w-2/3" />
                    <div className="h-4 bg-muted rounded w-1/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {services.map((service: any) => {
                const config = STATUS_CONFIG[service.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.operational;
                const StatusIcon = config.icon;
                const ServiceIcon = SERVICE_ICONS[service.service_name] || Server;
                return (
                  <Card key={service.id} className={cn("border", config.bg, "transition-all hover:shadow-md")}>
                    <CardContent className="py-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ServiceIcon className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium text-sm text-foreground">{service.service_name}</span>
                        </div>
                        <StatusIcon className={cn("h-5 w-5", config.color)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={cn("text-xs", config.color)}>
                          {config.label}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(service.last_checked), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                      {service.message && (
                        <p className="text-xs text-muted-foreground border-t pt-2">{service.message}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Incident History */}
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Histórico de Incidentes</h3>
          {incidents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500 opacity-60" />
                <p>Nenhum incidente registrado.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Início</TableHead>
                      <TableHead>Fim</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incidents.map((incident: any) => (
                      <TableRow key={incident.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(incident.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {incident.resolved_at
                            ? format(new Date(incident.resolved_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {(incident as any).system_status_services?.service_name || "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-xs truncate">{incident.description}</TableCell>
                        <TableCell>
                          <Badge variant={incident.status === "resolved" ? "default" : "destructive"} className="text-xs">
                            {incident.status === "resolved" ? "Resolvido" : "Em análise"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pb-8">
          <p>Esta página é atualizada automaticamente a cada 60 segundos.</p>
        </div>
      </main>
    </div>
  );
}
