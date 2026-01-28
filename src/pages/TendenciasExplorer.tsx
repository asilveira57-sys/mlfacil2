import { useMemo } from 'react';
import { TrendsExplorerProvider, useTrendsExplorer } from '@/contexts/TrendsExplorerContext';
import {
  TrendsExpBreadcrumb,
  TrendsExpToolbar,
  TrendsExpCategoryGrid,
  TrendsExpDetailsDrawer,
  TrendsExpMetricsDrawer,
  TrendsExpComparisonPanel,
} from '@/components/trends-explorer';
import { PageContainer } from '@/components/layout/PageContainer';
import { BarChart2 } from 'lucide-react';

function TelemetryBadge() {
  const { getTelemetryStats } = useTrendsExplorer();
  const stats = getTelemetryStats();

  if (!import.meta.env.DEV) return null;

  return (
    <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
      <BarChart2 className="h-3 w-3" />
      <span>Cache: {((stats.cache_hit_rate) * 100).toFixed(0)}%</span>
      <span>|</span>
      <span>Drawer: {stats.avg_drawer_open_ms.toFixed(0)}ms</span>
    </div>
  );
}

function TendenciasExplorerContent() {
  // Memoize headerContent to prevent render loops
  const headerContent = useMemo(() => <TelemetryBadge />, []);

  return (
    <PageContainer
      title="Tendências"
      subtitle="Análise de mercado e oportunidades"
      headerContent={headerContent}
    >
      <div className="container mx-auto px-4 py-6 space-y-4">
        {/* Breadcrumb + Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TrendsExpBreadcrumb />
          <TrendsExpToolbar />
        </div>

        {/* Category Grid */}
        <TrendsExpCategoryGrid />
      </div>

      {/* Drawers */}
      <TrendsExpDetailsDrawer />
      <TrendsExpMetricsDrawer />
      <TrendsExpComparisonPanel />
    </PageContainer>
  );
}

export default function TendenciasExplorer() {
  return (
    <TrendsExplorerProvider>
      <TendenciasExplorerContent />
    </TrendsExplorerProvider>
  );
}
