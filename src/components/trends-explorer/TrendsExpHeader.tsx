import { ArrowLeft, TrendingUp, BarChart2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TrendsExpBreadcrumb } from './TrendsExpBreadcrumb';
import { TrendsExpToolbar } from './TrendsExpToolbar';
import { useTrendsExplorer } from '@/contexts/TrendsExplorerContext';

export function TrendsExpHeader() {
  const navigate = useNavigate();
  const { getTelemetryStats } = useTrendsExplorer();

  const handleBack = () => navigate('/dashboard');

  const stats = getTelemetryStats();

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="container mx-auto px-4">
        {/* Top Bar */}
        <div className="flex items-center justify-between h-14 gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Tendências</h1>
            </div>
          </div>

          {/* Telemetry Badge (dev only) */}
          {import.meta.env.DEV && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <BarChart2 className="h-3 w-3" />
              <span>Cache: {((stats.cache_hit_rate) * 100).toFixed(0)}%</span>
              <span>|</span>
              <span>Drawer: {stats.avg_drawer_open_ms.toFixed(0)}ms</span>
            </div>
          )}
        </div>

        {/* Breadcrumb + Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3">
          <TrendsExpBreadcrumb />
          <TrendsExpToolbar />
        </div>
      </div>
    </header>
  );
}
