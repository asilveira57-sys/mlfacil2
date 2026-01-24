import { MercadoProvider } from '@/contexts/MercadoContext';
import {
  MercadoHeader,
  MercadoBreadcrumb,
  MercadoToolbar,
  MercadoCategoryGrid,
  MercadoDetailsDrawer,
  MercadoMetricsDrawer,
  MercadoComparisonPanel,
} from '@/components/mercado';

function MercadoContent() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
        {/* Header */}
        <MercadoHeader />

        {/* Breadcrumb */}
        <MercadoBreadcrumb />

        {/* Toolbar */}
        <MercadoToolbar />

        {/* Category Grid */}
        <MercadoCategoryGrid />

        {/* Comparison Panel */}
        <MercadoComparisonPanel />

        {/* Drawers */}
        <MercadoDetailsDrawer />
        <MercadoMetricsDrawer />
      </div>
    </div>
  );
}

export default function Mercado() {
  return (
    <MercadoProvider>
      <MercadoContent />
    </MercadoProvider>
  );
}
