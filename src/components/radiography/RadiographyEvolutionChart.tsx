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
  Activity,
  Scan,
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
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <Skeleton className="h-6 w-48 bg-slate-700" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full bg-slate-700" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="py-12 text-center">
          <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-slate-500" />
          </div>
          <p className="text-slate-400 mb-4">{error || "Dados não disponíveis"}</p>
          <Button variant="outline" onClick={fetchData} className="border-slate-600 text-slate-300">
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
      default: return "#22d3ee";
    }
  };

  const getImpactIcon = (direction: string) => {
    switch (direction) {
      case "positive": return <TrendingUp className="h-3 w-3 text-emerald-400" />;
      case "negative": return <TrendingDown className="h-3 w-3 text-red-400" />;
      default: return <Minus className="h-3 w-3 text-slate-400" />;
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
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-lg max-w-xs">
        <p className="font-medium mb-2 text-slate-200">{format(new Date(dayData.date + "T00:00:00"), "dd 'de' MMMM", { locale: ptBR })}</p>
        
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2 text-slate-300">
            <Eye className="h-3 w-3 text-cyan-400" />
            <span>{dayData.visits.toLocaleString("pt-BR")} visitas</span>
          </div>
          
          {dayData.sales_7d !== null && (
            <div className="flex items-center gap-2 text-slate-300">
              <Package className="h-3 w-3 text-emerald-400" />
              <span>{dayData.sales_7d} vendas (7d)</span>
            </div>
          )}
          
          {dayData.score_total !== null && (
            <div className="flex items-center gap-2 text-slate-400">
              <span>Score: {dayData.score_total}</span>
            </div>
          )}
        </div>

        {dayData.events.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-600 space-y-2">
            <p className="text-xs font-medium text-slate-400">Eventos do dia:</p>
            {dayData.events.map((event, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div 
                  className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                  style={{ backgroundColor: getSeverityColor(event.severity) }}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1 text-slate-300">
                    <span className="font-medium">{formatEventType(event.event_type)}</span>
                    {getImpactIcon(event.impact_direction)}
                  </div>
                  <p className="text-slate-500 line-clamp-2">{event.observation_pt}</p>
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
      {/* Summary Cards - Clinical Style */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <Eye className="h-3 w-3 text-cyan-400" />
              Total Visitas
            </div>
            <div className="text-lg font-bold text-cyan-400 font-mono">{data.summary.total_visits.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <Activity className="h-3 w-3 text-violet-400" />
              Média Diária
            </div>
            <div className="text-lg font-bold text-violet-400 font-mono">{data.summary.avg_daily_visits.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              {data.summary.trend_7d >= 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-400" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-400" />
              )}
              Tendência 7d
            </div>
            <div className={`text-lg font-bold font-mono ${data.summary.trend_7d >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {data.summary.trend_7d >= 0 ? "+" : ""}{data.summary.trend_7d}%
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
              <AlertTriangle className="h-3 w-3 text-amber-400" />
              Eventos
            </div>
            <div className="text-lg font-bold text-amber-400 font-mono">{data.summary.total_events}</div>
          </CardContent>
        </Card>
      </div>

      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Correlação entre visitas diárias e eventos de otimização
        </p>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="14">14 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="60">60 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main Chart - X-Ray Style */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="formattedDate" 
                tick={{ fontSize: 11, fill: '#64748b' }}
                interval="preserveStartEnd"
                stroke="#475569"
              />
              <YAxis 
                yAxisId="visits"
                tick={{ fontSize: 11, fill: '#64748b' }}
                stroke="#475569"
                tickFormatter={(value) => value.toLocaleString("pt-BR")}
              />
              <YAxis 
                yAxisId="sales"
                orientation="right"
                tick={{ fontSize: 11, fill: '#64748b' }}
                stroke="#475569"
                domain={[0, "auto"]}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ color: '#94a3b8' }}
              />
              
              {/* Visits Line - Cyan for clinical look */}
              <Line
                yAxisId="visits"
                type="monotone"
                dataKey="visits"
                name="Visitas"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, strokeWidth: 2, fill: '#22d3ee' }}
              />
              
              {/* Sales Bars */}
              <Bar
                yAxisId="sales"
                dataKey="sales_7d"
                name="Vendas 7d"
                fill="rgba(34, 211, 238, 0.3)"
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
                  stroke="#1e293b"
                  strokeWidth={2}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Events Legend */}
      {data.events.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Scan className="h-4 w-4 text-cyan-400" />
              <CardTitle className="text-sm text-slate-200">Eventos no Período</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.events.slice(0, 10).map((event, i) => (
                <Badge 
                  key={i}
                  variant="outline"
                  className="flex items-center gap-1 border-slate-600 text-slate-300 bg-slate-800/50"
                  style={{ borderColor: getSeverityColor(event.severity) }}
                >
                  <div 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: getSeverityColor(event.severity) }}
                  />
                  {formatEventType(event.event_type)}
                  <span className="text-slate-500 text-xs">
                    {format(new Date(event.detected_at), "dd/MM")}
                  </span>
                </Badge>
              ))}
              {data.events.length > 10 && (
                <Badge className="bg-slate-700 text-slate-300 border-slate-600">+{data.events.length - 10} mais</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
