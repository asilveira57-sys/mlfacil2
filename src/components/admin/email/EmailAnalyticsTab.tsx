import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, AlertTriangle, Clock, TrendingUp, Mail, Zap, Calendar, Megaphone } from 'lucide-react';
import { useEmailAnalytics, useEmailAnalyticsSummary } from '@/hooks/useEmailAnalytics';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function EmailAnalyticsTab() {
  const { data: daily, isLoading: loadingDaily } = useEmailAnalytics(30);
  const { data: summary, isLoading: loadingSummary } = useEmailAnalyticsSummary();

  if (loadingDaily || loadingSummary) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const chartData = (daily || []).map((d) => ({
    date: format(parseISO(d.metric_date), 'dd/MM', { locale: ptBR }),
    Enviados: d.total_sent,
    Falhas: d.total_failed,
    Enfileirados: d.total_queued,
  }));

  const sourceData = (daily || []).map((d) => ({
    date: format(parseISO(d.metric_date), 'dd/MM', { locale: ptBR }),
    Eventos: d.total_events,
    Agendamentos: d.total_schedules,
    Campanhas: d.total_campaigns,
  }));

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
              <Mail className="h-3.5 w-3.5" /> Enfileirados hoje
            </div>
            <p className="text-2xl font-bold">{summary?.today.queued || 0}</p>
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
              <Clock className="h-3.5 w-3.5" /> Na fila
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
            <p className="text-xs text-muted-foreground">Total enfileirados (30d)</p>
            <p className="text-xl font-bold">{summary?.month.queued || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Delivery Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Volume de envio (30 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados de analytics ainda. Os dados são agregados diariamente à meia-noite.</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Enviados" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Falhas" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Source Breakdown Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Origem dos disparos
            <Badge variant="outline" className="text-xs font-normal gap-1"><Zap className="h-3 w-3" />Eventos</Badge>
            <Badge variant="outline" className="text-xs font-normal gap-1"><Calendar className="h-3 w-3" />Agendamentos</Badge>
            <Badge variant="outline" className="text-xs font-normal gap-1"><Megaphone className="h-3 w-3" />Campanhas</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sourceData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sourceData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Eventos" fill="hsl(var(--accent-foreground))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Agendamentos" fill="hsl(var(--primary) / 0.6)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Campanhas" fill="hsl(var(--secondary-foreground) / 0.5)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
