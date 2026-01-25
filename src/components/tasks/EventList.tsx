import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Zap, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import type { SystemEvent } from '@/types/tasks';

interface EventListProps {
  events: SystemEvent[];
  loading: boolean;
  onCreateTask: (event: SystemEvent) => void;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  'promotion.ends_soon': 'Promoção terminando',
  'promotion.item.ineligible': 'Item inelegível',
  'competitor.price_drop': 'Queda de preço concorrente',
  'order.cancelled': 'Pedido cancelado',
  'listing.health_drop': 'Queda de saúde do anúncio',
  'ads.budget_exhausted': 'Orçamento de ads esgotado',
};

export function EventList({ events, loading, onCreateTask }: EventListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Zap className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">Nenhum evento pendente</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Eventos do sistema que precisam de ação aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map(event => (
        <Card key={event.id}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Zap className="h-4 w-4 text-yellow-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {JSON.stringify(event.payload).slice(0, 100)}...
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(event.created_at), "dd 'de' MMM 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCreateTask(event)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Criar tarefa
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
