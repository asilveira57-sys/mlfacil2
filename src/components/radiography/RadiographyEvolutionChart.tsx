import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  Legend,
} from "recharts";
import {
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Package,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RadiographyEvolutionChartProps {
  sellerId: string;
  itemId: string;
}

interface TimelineDay {
  date: string;
  visits: number;
  sales_7d: number | null;
  conversion_7d: number | null;
  score_total: number | null;
  events: Array<{
    id: string;
    event_type: string;
    event_category: string;
    severity: string;
    impact_direction: string;
    observation_pt: string;
    detected_at: string;
  }>;
}

interface VisitHistoryData {
  timeline: TimelineDay[];
  events: any[];
  summary: {
    total_visits: number;
    avg_daily_visits: number;
    trend_7d: number;
    total_events: number;
    days_analyzed: number;
  };
}

export function RadiographyEvolutionChart({ sellerId, itemId }: RadiographyEvolutionChartProps) {
  const [data, setData] = useState<VisitHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("30");

  const fetchData = useCallback(async () => {
    if (!sellerId || !itemId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data: result, error: fetchError } = await supabase.functions.invoke("radiography-engine", {
        body: { 
          seller_id: sellerId, 
          action: "visit-history", 
          item_id: itemId,
          days: parseInt(period),
        }
      });
      
      if (fetchError) throw fetchError;
      setData(result);
    } catch (err: any) {
      console.error("[RadiographyEvolution] Error:", err);
      setError(err.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [sellerId, itemId, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-4">{error || "Dados não disponíveis"}</p>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    return format(date, "dd/MM", { locale: ptBR });
  };

  const formatEventType = (type: string) => {
    const map: Record<string, string> = {
      stockout: "Ruptura",
      stockout_full: "Ruptura Full",
      stock_recovered: "Estoque Reposto",
      price_changed: "Preço",
      title_changed: "Título",
      visits_spike: "Pico Visitas",
      visits_drop: "Queda Visitas",
      logistic_upgraded: "Upgrade Log.",
      logistic_downgraded: "Downgrade Log.",
      catalog_entered: "Entrou Catálogo",
      catalog_exited: "Saiu Catálogo",
      buybox_lost: "Perdeu Buy Box",
    };
    return map[type] || type;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "#ef4444";
      case "warning": return "#f59e0b";
      default: return "#3b82f6";
    }
  };

  const getImpactIcon = (direction: string) => {
    switch (direction) {
      case "positive": return <TrendingUp className="h-3 w-3 text-green-500" />;
      case "negative": return <TrendingDown className="h-3 w-3 text-red-500" />;
      default: return <Minus className="h-3 w-3 text-muted-foreground" />;
    }
  };

  // Prepare chart data with event markers
  const chartData = data.timeline.map((day) => ({
    ...day,
    hasEvent: day.events.length > 0,
    eventCount: day.events.length,
    formattedDate: formatDate(day.date),
  }));

  // Find days with events for reference dots
  const eventDays = chartData.filter(d => d.hasEvent);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    
    const dayData = chartData.find(d => d.formattedDate === label);
    if (!dayData) return null;

    return (
      <div className="bg-card border rounded-lg p-3 shadow-lg max-w-xs">
        <p className="font-medium mb-2">{format(new Date(dayData.date + "T00:00:00"), "dd 'de' MMMM", { locale: ptBR })}</p>
        
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <Eye className="h-3 w-3 text-blue-500" />
            <span>{dayData.visits.toLocaleString("pt-BR")} visitas</span>
          </div>
          
          {dayData.sales_7d !== null && (
            <div className="flex items-center gap-2">
              <Package className="h-3 w-3 text-green-500" />
              <span>{dayData.sales_7d} vendas (7d)</span>
            </div>
          )}
          
          {dayData.score_total !== null && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Score: {dayData.score_total}</span>
            </div>
          )}
        </div>

        {dayData.events.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Eventos do dia:</p>
            {dayData.events.map((event, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div 
                  className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                  style={{ backgroundColor: getSeverityColor(event.severity) }}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{formatEventType(event.event_type)}</span>
                    {getImpactIcon(event.impact_direction)}
                  </div>
                  <p className="text-muted-foreground line-clamp-2">{event.observation_pt}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-muted/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Eye className="h-3 w-3" />
              Total Visitas
            </div>
            <div className="text-lg font-bold">{data.summary.total_visits.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Eye className="h-3 w-3" />
              Média Diária
            </div>
            <div className="text-lg font-bold">{data.summary.avg_daily_visits.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              {data.summary.trend_7d >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              Tendência 7d
            </div>
            <div className={`text-lg font-bold ${data.summary.trend_7d >= 0 ? "text-green-500" : "text-red-500"}`}>
              {data.summary.trend_7d >= 0 ? "+" : ""}{data.summary.trend_7d}%
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-muted/50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3 w-3" />
              Eventos
            </div>
            <div className="text-lg font-bold">{data.summary.total_events}</div>
          </CardContent>
        </Card>
      </div>

      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Correlação entre visitas diárias e eventos de otimização
        </p>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="14">14 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="60">60 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main Chart */}
      <Card>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="formattedDate" 
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
                className="text-muted-foreground"
              />
              <YAxis 
                yAxisId="visits"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                tickFormatter={(value) => value.toLocaleString("pt-BR")}
              />
              <YAxis 
                yAxisId="sales"
                orientation="right"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                domain={[0, "auto"]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              
              {/* Visits Line */}
              <Line
                yAxisId="visits"
                type="monotone"
                dataKey="visits"
                name="Visitas"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
              
              {/* Sales Bars */}
              <Bar
                yAxisId="sales"
                dataKey="sales_7d"
                name="Vendas 7d"
                fill="hsl(var(--primary) / 0.3)"
                radius={[2, 2, 0, 0]}
              />

              {/* Event Markers as Reference Dots */}
              {eventDays.map((day, i) => (
                <ReferenceDot
                  key={i}
                  yAxisId="visits"
                  x={day.formattedDate}
                  y={day.visits}
                  r={8}
                  fill={getSeverityColor(day.events[0]?.severity || "info")}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Events Legend */}
      {data.events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Eventos no Período</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.events.slice(0, 10).map((event, i) => (
                <Badge 
                  key={i}
                  variant="outline"
                  className="flex items-center gap-1"
                  style={{ borderColor: getSeverityColor(event.severity) }}
                >
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getSeverityColor(event.severity) }}
                  />
                  {formatEventType(event.event_type)}
                  <span className="text-muted-foreground text-xs">
                    {format(new Date(event.detected_at), "dd/MM")}
                  </span>
                </Badge>
              ))}
              {data.events.length > 10 && (
                <Badge variant="secondary">+{data.events.length - 10} mais</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
