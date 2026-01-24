import { ArrowLeft, TrendingUp, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMercado } from '@/contexts/MercadoContext';

export function MercadoHeader() {
  const navigate = useNavigate();
  const { getTelemetryStats } = useMercado();
  const stats = getTelemetryStats();

  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Mercado</h1>
        </div>
      </div>

      {/* Dev-only telemetry badge */}
      {import.meta.env.DEV && (
        <Badge variant="outline" className="gap-1 text-xs">
          <Activity className="h-3 w-3" />
          Cache: {stats.cacheHitRate}% | Drawer: {stats.avgDrawerOpenMs}ms
        </Badge>
      )}
    </header>
  );
}
