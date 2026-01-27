import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Filter, Eye, AlertCircle, CheckCircle2, Clock, XCircle, FileEdit } from "lucide-react";
import { usePostSaleMessages } from "@/hooks/usePostSaleMessages";
import {
  PostSaleMessage,
  PostSaleMessageStatus,
  PostSaleTriggerEvent,
  triggerEventLabels,
  messageTypeLabels,
  statusLabels,
} from "@/types/post-sale";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusIcons: Record<PostSaleMessageStatus, React.ReactNode> = {
  enviado: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  bloqueado: <XCircle className="h-4 w-4 text-destructive" />,
  erro: <AlertCircle className="h-4 w-4 text-destructive" />,
  pendente: <Clock className="h-4 w-4 text-amber-500" />,
  rascunho: <FileEdit className="h-4 w-4 text-muted-foreground" />,
};

const statusColors: Record<PostSaleMessageStatus, string> = {
  enviado: "bg-green-500/10 text-green-700 border-green-500/30",
  bloqueado: "bg-destructive/10 text-destructive border-destructive/30",
  erro: "bg-destructive/10 text-destructive border-destructive/30",
  pendente: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  rascunho: "bg-muted text-muted-foreground border-muted-foreground/30",
};

export function PostSaleHistory() {
  const [statusFilter, setStatusFilter] = useState<PostSaleMessageStatus | "all">("all");
  const [triggerFilter, setTriggerFilter] = useState<PostSaleTriggerEvent | "all">("all");
  const [searchOrder, setSearchOrder] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<PostSaleMessage | null>(null);

  const { data: messages, isLoading } = usePostSaleMessages({
    status: statusFilter === "all" ? undefined : statusFilter,
    trigger_event: triggerFilter === "all" ? undefined : triggerFilter,
    orderId: searchOrder || undefined,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Histórico de Mensagens</h2>
        <p className="text-sm text-muted-foreground">
          Auditoria completa de todas as mensagens enviadas e bloqueadas
        </p>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por pedido..."
              value={searchOrder}
              onChange={(e) => setSearchOrder(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PostSaleMessageStatus | "all")}>
            <SelectTrigger className="w-[150px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              {Object.entries(statusLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={triggerFilter} onValueChange={(v) => setTriggerFilter(v as PostSaleTriggerEvent | "all")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Evento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Eventos</SelectItem>
              {Object.entries(triggerEventLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      {!messages?.length ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Nenhuma mensagem encontrada</p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((msg) => (
                <TableRow key={msg.id}>
                  <TableCell className="font-mono text-sm">
                    {msg.order_id}
                  </TableCell>
                  <TableCell className="text-sm">
                    {msg.buyer_name || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {triggerEventLabels[msg.trigger_event]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {messageTypeLabels[msg.message_type]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${statusColors[msg.status]}`}>
                      <span className="mr-1">{statusIcons[msg.status]}</span>
                      {statusLabels[msg.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(msg.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelectedMessage(msg)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Detalhes da Mensagem</SheetTitle>
          </SheetHeader>
          {selectedMessage && (
            <div className="space-y-4 mt-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Pedido</p>
                  <p className="font-mono text-sm">{selectedMessage.order_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={statusColors[selectedMessage.status]}>
                    {statusLabels[selectedMessage.status]}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Comprador</p>
                  <p className="text-sm">{selectedMessage.buyer_name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data</p>
                  <p className="text-sm">
                    {format(new Date(selectedMessage.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Evento</p>
                  <p className="text-sm">{triggerEventLabels[selectedMessage.trigger_event]}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tipo</p>
                  <p className="text-sm">{messageTypeLabels[selectedMessage.message_type]}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Produto</p>
                <p className="text-sm">{selectedMessage.listing_title || "-"}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Conteúdo Enviado</p>
                <Card className="p-3 bg-muted/50">
                  <p className="text-sm whitespace-pre-wrap">{selectedMessage.content_sent}</p>
                </Card>
              </div>

              {selectedMessage.status === "bloqueado" && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Motivo do Bloqueio</p>
                    <Card className="p-3 bg-destructive/10 border-destructive/30">
                      <p className="text-sm text-destructive">{selectedMessage.block_reason}</p>
                    </Card>
                  </div>
                  {selectedMessage.suggested_fix && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Sugestão de Correção</p>
                      <Card className="p-3 bg-primary/10 border-primary/30">
                        <p className="text-sm">{selectedMessage.suggested_fix}</p>
                      </Card>
                    </div>
                  )}
                </>
              )}

              {selectedMessage.sent_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Enviado em</p>
                  <p className="text-sm">
                    {format(new Date(selectedMessage.sent_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
