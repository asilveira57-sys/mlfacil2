import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Clock, ShoppingCart, AlertTriangle, Play, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AdTimelineEvent, AdLifecycleAction } from "@/types/ad-timeline";

interface AuditLogProps {
  events: AdTimelineEvent[];
  actions: AdLifecycleAction[];
  isLoading?: boolean;
}

export function AuditLog({ events, actions, isLoading }: AuditLogProps) {
  // Merge and sort events and actions by date
  const allItems = [
    ...events.map(e => ({ type: 'event' as const, data: e, date: new Date(e.occurred_at) })),
    ...actions.map(a => ({ type: 'action' as const, data: a, date: new Date(a.updated_at) })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'SALE': return <ShoppingCart className="h-4 w-4 text-green-500" />;
      case 'GAP': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'ACTION_EXECUTED': return <Play className="h-4 w-4 text-blue-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'FAILED': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'RUNNING': return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Histórico</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Histórico</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-3">
            {allItems.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Nenhum evento registrado
              </div>
            ) : (
              allItems.map((item, index) => (
                <div key={index} className="flex items-start gap-3 p-2 rounded hover:bg-muted/50">
                  {item.type === 'event' ? (
                    <>
                      {getEventIcon(item.data.event_type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {item.data.event_type === 'SALE' ? 'Venda' :
                             item.data.event_type === 'GAP' ? 'Gap de vendas' :
                             item.data.event_type === 'ACTION_EXECUTED' ? 'Ação executada' :
                             item.data.event_type}
                          </span>
                          {item.data.event_type === 'GAP' && item.data.payload?.gap_days && (
                            <Badge variant="outline" className="text-xs">
                              {item.data.payload.gap_days} dias
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(item.date, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {getActionStatusIcon(item.data.action_status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {item.data.action_type === 'END' ? 'Encerrar' :
                             item.data.action_type === 'RELIST' ? 'Republicar' :
                             item.data.action_type === 'CLONE' ? 'Clonar' :
                             item.data.action_type}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {item.data.action_status}
                          </Badge>
                        </div>
                        {item.data.reason && (
                          <div className="text-xs text-muted-foreground truncate">
                            {item.data.reason}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {format(item.date, "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
