import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, TrendingDown, Maximize2 } from "lucide-react";

interface GapMetricsCardProps {
  avgGapHours: number | null;
  medianGapHours: number | null;
  maxGapHours: number | null;
}

function formatGap(hours: number | null): { hours: string; days: string } {
  if (hours === null) return { hours: "—", days: "—" };
  const h = Math.round(hours * 10) / 10;
  const d = Math.round((hours / 24) * 10) / 10;
  return { hours: `${h}h`, days: `${d}d` };
}

export function GapMetricsCard({ avgGapHours, medianGapHours, maxGapHours }: GapMetricsCardProps) {
  const avg = formatGap(avgGapHours);
  const median = formatGap(medianGapHours);
  const max = formatGap(maxGapHours);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Intervalos entre Vendas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{avg.hours}</div>
            <div className="text-xs text-muted-foreground">{avg.days}</div>
            <div className="text-xs text-muted-foreground mt-1">Média</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{median.hours}</div>
            <div className="text-xs text-muted-foreground">{median.days}</div>
            <div className="text-xs text-muted-foreground mt-1">Mediana</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-500">{max.hours}</div>
            <div className="text-xs text-muted-foreground">{max.days}</div>
            <div className="text-xs text-muted-foreground mt-1">Maior</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
