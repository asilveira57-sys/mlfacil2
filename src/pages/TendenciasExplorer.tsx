import { TrendsExplorerProvider } from '@/contexts/TrendsExplorerContext';
import {
  TrendsExpHeader,
  TrendsExpCategoryGrid,
  TrendsExpDetailsDrawer,
  TrendsExpMetricsDrawer,
  TrendsExpComparisonPanel,
} from '@/components/trends-explorer';

function TendenciasExplorerContent() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TrendsExpHeader />

      <main className="flex-1 container mx-auto px-4 py-6">
        <TrendsExpCategoryGrid />
      </main>

      {/* Drawers */}
      <TrendsExpDetailsDrawer />
      <TrendsExpMetricsDrawer />
      <TrendsExpComparisonPanel />
    </div>
  );
}

export default function TendenciasExplorer() {
  return (
    <TrendsExplorerProvider>
      <TendenciasExplorerContent />
    </TrendsExplorerProvider>
  );
}
