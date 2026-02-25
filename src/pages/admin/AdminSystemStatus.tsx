import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  CheckCircle2, AlertTriangle, XCircle, Plus, Pencil, Trash2, 
  RefreshCw, History, MessageSquare 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "operational", label: "Operacional", icon: CheckCircle2, color: "text-emerald-500" },
  { value: "unstable", label: "Instabilidade", icon: AlertTriangle, color: "text-amber-500" },
  { value: "down", label: "Interrupção", icon: XCircle, color: "text-destructive" },
];

export function AdminSystemStatus() {
  const queryClient = useQueryClient();
  const [newServiceName, setNewServiceName] = useState("");
  const [showAddService, setShowAddService] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [editMessage, setEditMessage] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [showAddIncident, setShowAddIncident] = useState(false);
  const [incidentServiceId, setIncidentServiceId] = useState("");
  const [incidentDescription, setIncidentDescription] = useState("");

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["admin-system-status-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_status_services")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["admin-system-status-incidents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents_log")
        .select("*, system_status_services(service_name)")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["admin-system-status-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_status_logs")
        .select("*, system_status_services(service_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-system-status-services"] });
    queryClient.invalidateQueries({ queryKey: ["admin-system-status-incidents"] });
    queryClient.invalidateQueries({ queryKey: ["admin-system-status-logs"] });
  };

  const addServiceMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("system_status_services").insert({ service_name: name });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Serviço adicionado"); setNewServiceName(""); setShowAddService(false); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, status, message }: { id: string; status: string; message: string }) => {
      const { error } = await supabase.from("system_status_services").update({ status, message }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Serviço atualizado"); setEditingService(null); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("system_status_services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Serviço removido"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const addIncidentMutation = useMutation({
    mutationFn: async ({ serviceId, description }: { serviceId: string; description: string }) => {
      const { error } = await supabase.from("incidents_log").insert({ 
        service_id: serviceId, description, status: "investigating" 
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Incidente registrado"); setShowAddIncident(false); setIncidentDescription(""); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const resolveIncidentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("incidents_log")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Incidente resolvido"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Services Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Serviços</CardTitle>
          <Dialog open={showAddService} onOpenChange={setShowAddService}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Adicionar</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo Serviço</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome do serviço</Label>
                  <Input value={newServiceName} onChange={e => setNewServiceName(e.target.value)} placeholder="Ex: API de Pagamentos" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => addServiceMutation.mutate(newServiceName)} disabled={!newServiceName.trim()}>
                  Criar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Última verificação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s: any) => {
                const cfg = STATUS_OPTIONS.find(o => o.value === s.status) || STATUS_OPTIONS[0];
                const Icon = cfg.icon;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.service_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Icon className={cn("h-4 w-4", cfg.color)} />
                        <span className="text-sm">{cfg.label}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{s.message || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {formatDistanceToNow(new Date(s.last_checked), { addSuffix: true, locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditingService(s); setEditStatus(s.status); setEditMessage(s.message || ""); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Remover serviço?")) deleteServiceMutation.mutate(s.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Service Dialog */}
      <Dialog open={!!editingService} onOpenChange={(open) => { if (!open) setEditingService(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar: {editingService?.service_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mensagem (opcional)</Label>
              <Textarea value={editMessage} onChange={e => setEditMessage(e.target.value)} placeholder="Detalhes sobre o status..." />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => updateServiceMutation.mutate({ id: editingService.id, status: editStatus, message: editMessage })}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Incidents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Incidentes</CardTitle>
          <Dialog open={showAddIncident} onOpenChange={setShowAddIncident}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2"><MessageSquare className="h-4 w-4" />Registrar Incidente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Registrar Incidente Manual</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Serviço</Label>
                  <Select value={incidentServiceId} onValueChange={setIncidentServiceId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger>
                    <SelectContent>
                      {services.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.service_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea value={incidentDescription} onChange={e => setIncidentDescription(e.target.value)} placeholder="Descreva o incidente..." />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => addIncidentMutation.mutate({ serviceId: incidentServiceId, description: incidentDescription })} disabled={!incidentServiceId || !incidentDescription.trim()}>
                  Registrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum incidente registrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((inc: any) => (
                  <TableRow key={inc.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(inc.started_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">{inc.system_status_services?.service_name || "—"}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate">{inc.description}</TableCell>
                    <TableCell>
                      <Badge variant={inc.status === "resolved" ? "default" : "destructive"} className="text-xs">
                        {inc.status === "resolved" ? "Resolvido" : "Em análise"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {inc.status === "investigating" && (
                        <Button size="sm" variant="outline" onClick={() => resolveIncidentMutation.mutate(inc.id)}>
                          Resolver
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Change Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5" />Logs de Alteração</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum log registrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Anterior</TableHead>
                  <TableHead>Novo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(log.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm">{log.system_status_services?.service_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{log.previous_status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{log.new_status}</Badge>
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
