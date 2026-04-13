import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, AlertTriangle, Clock, TrendingUp } from 'lucide-react';
import { useEmailAnalyticsSummary } from '@/hooks/useEmailAnalytics';

export function EmailAnalyticsTab() {
  const { data: summary, isLoading: loadingSummary } = useEmailAnalyticsSummary();

  if (loadingSummary) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Send className="h-3.5 w-3.5" /> Enviados hoje
            </div>
            <p className="text-2xl font-bold">{summary?.today.sent || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" /> Pendentes hoje
            </div>
            <p className="text-2xl font-bold">{summary?.today.pending || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Falhas hoje
            </div>
            <p className="text-2xl font-bold text-destructive">{summary?.today.failed || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" /> Na fila (30min)
            </div>
            <p className="text-2xl font-bold">{summary?.pendingQueue || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Taxa entrega (30d)
            </div>
            <p className="text-2xl font-bold">
              {summary?.deliveryRate || 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 30-day summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Enviados (30d)</p>
            <p className="text-xl font-bold">{summary?.month.sent || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Falhas (30d)</p>
            <p className="text-xl font-bold text-destructive">{summary?.month.failed || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Total processados (30d)</p>
            <p className="text-xl font-bold">{summary?.month.total || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground text-center">
            📊 Dados em tempo real do pipeline ativo (email_send_log). Acesse a aba "Logs" para detalhes por e-mail.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
