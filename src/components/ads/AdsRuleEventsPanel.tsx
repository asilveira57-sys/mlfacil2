import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import type { AdsRuleEvent } from '@/types/ads-rules';

interface AdsRuleEventsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: AdsRuleEvent[];
  loading: boolean;
}

export function AdsRuleEventsPanel({ open, onOpenChange, events, loading }: AdsRuleEventsPanelProps) {
  const violations = events.filter(e => e.event_type === 'violation');
  const opportunities = events.filter(e => e.event_type === 'opportunity');

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive/10 text-destructive';
      case 'high': return 'bg-orange-500/10 text-orange-600';
      case 'medium': return 'bg-warning/10 text-warning';
      case 'low': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Eventos de Regras</SheetTitle>
          <SheetDescription>
            Violações e oportunidades detectadas pelas suas regras
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Summary */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-lg font-bold">{violations.length}</p>
                <p className="text-xs text-muted-foreground">Violações</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-lg font-bold">{opportunities.length}</p>
                <p className="text-xs text-muted-foreground">Oportunidades</p>
              </div>
            </div>
          </div>

          {/* Events list */}
          <ScrollArea className="h-[calc(100vh-220px)]">
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Nenhum evento</p>
                <p className="text-sm mt-1">
                  Os eventos aparecerão aqui quando as regras forem avaliadas
                </p>
              </div>
            ) : (
              <div className="space-y-3 pr-4">
                {events.map((event) => (
                  <Card key={event.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                          event.event_type === 'violation' ? 'bg-destructive/10' : 'bg-success/10'
                        }`}>
                          {event.event_type === 'violation' ? (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          ) : (
                            <TrendingUp className="h-4 w-4 text-success" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="font-medium text-sm truncate">{event.rule_name}</p>
                            <Badge variant="secondary" className={getSeverityColor(event.severity)}>
                              {event.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {event.message_pt}
                          </p>
                          {event.item_title && (
                            <p className="text-xs text-muted-foreground truncate">
                              Produto: {event.item_title}
                            </p>
                          )}
                          {Object.keys(event.metrics_snapshot).length > 0 && (
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {Object.entries(event.metrics_snapshot).map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-xs">
                                  {key}: {typeof value === 'number' ? value.toFixed(2) : value}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDate(event.created_at)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
