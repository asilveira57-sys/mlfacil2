import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, Eye, RefreshCw, MessageSquare, Filter, Inbox } from "lucide-react";

const PRIORITY_CONFIG = {
  low: { label: "Baixa", variant: "outline" as const },
  medium: { label: "Média", variant: "secondary" as const },
  high: { label: "Alta", variant: "default" as const },
  urgent: { label: "Urgente", variant: "destructive" as const },
};

const STATUS_CONFIG = {
  new: { label: "Nova", variant: "default" as const },
  in_progress: { label: "Em andamento", variant: "secondary" as const },
  answered: { label: "Respondida", variant: "outline" as const },
};

export default function AdminContatos() {
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selected, setSelected] = useState<any>(null);

  const { data: messages = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-contact-messages", filterSubject, filterPriority, filterStatus],
    queryFn: async () => {
      let query = supabase.from("contact_messages").select("*").order("created_at", { ascending: false });
      if (filterSubject !== "all") query = query.eq("subject", filterSubject);
      if (filterPriority !== "all") query = query.eq("priority", filterPriority);
      if (filterStatus !== "all") query = query.eq("status", filterStatus);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("contact_messages").update({ status }).eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar status");
      return;
    }
    toast.success("Status atualizado");
    refetch();
    if (selected?.id === id) setSelected((prev: any) => ({ ...prev, status }));
  };

  const exportCSV = () => {
    if (!messages.length) return;
    const headers = ["Nome", "Email", "Telefone", "Empresa", "Assunto", "Mensagem", "Prioridade", "Status", "Data"];
    const rows = messages.map((m: any) => [
      m.name, m.email, m.phone || "", m.company || "", m.subject, m.message?.replace(/\n/g, " "),
      PRIORITY_CONFIG[m.priority as keyof typeof PRIORITY_CONFIG]?.label || m.priority,
      STATUS_CONFIG[m.status as keyof typeof STATUS_CONFIG]?.label || m.status,
      format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contatos-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Mensagens de Contato</h2>
          <p className="text-sm text-muted-foreground">{messages.length} mensagens encontradas</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2" disabled={!messages.length}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterSubject} onValueChange={setFilterSubject}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Assunto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os assuntos</SelectItem>
                {["Parceria", "Consultoria", "Suporte técnico", "Instrução / Treinamento", "Reclamação", "Convite para evento", "Imprensa / Reportagem", "Outro"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? (
          <CardContent className="py-12 text-center text-muted-foreground">Carregando...</CardContent>
        ) : messages.length === 0 ? (
          <CardContent className="py-12 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Nenhuma mensagem encontrada.</p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m: any) => {
                  const p = PRIORITY_CONFIG[m.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.low;
                  const s = STATUS_CONFIG[m.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.new;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(m.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell className="text-xs">{m.email}</TableCell>
                      <TableCell className="text-xs">{m.subject}</TableCell>
                      <TableCell><Badge variant={p.variant} className="text-xs">{p.label}</Badge></TableCell>
                      <TableCell><Badge variant={s.variant} className="text-xs">{s.label}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setSelected(m)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {m.status !== "answered" && (
                            <Button variant="ghost" size="icon" onClick={() => updateStatus(m.id, "answered")}>
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mensagem de {selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Email:</span> <br />{selected.email}</div>
                <div><span className="text-muted-foreground">Telefone:</span> <br />{selected.phone || "—"}</div>
                <div><span className="text-muted-foreground">Empresa:</span> <br />{selected.company || "—"}</div>
                <div><span className="text-muted-foreground">Assunto:</span> <br />{selected.subject}</div>
                <div><span className="text-muted-foreground">Prioridade:</span> <br />
                  <Badge variant={PRIORITY_CONFIG[selected.priority as keyof typeof PRIORITY_CONFIG]?.variant}>{PRIORITY_CONFIG[selected.priority as keyof typeof PRIORITY_CONFIG]?.label}</Badge>
                </div>
                <div><span className="text-muted-foreground">Data:</span> <br />{format(new Date(selected.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Mensagem:</span>
                <p className="mt-1 text-sm bg-muted p-3 rounded-lg whitespace-pre-wrap">{selected.message}</p>
              </div>
              <div className="flex gap-2">
                <Select value={selected.status} onValueChange={v => updateStatus(selected.id, v)}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
