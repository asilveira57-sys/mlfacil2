import { MercadoProvider } from '@/contexts/MercadoContext';
import {
  MercadoBreadcrumb,
  MercadoToolbar,
  MercadoCategoryGrid,
  MercadoDetailsDrawer,
  MercadoMetricsDrawer,
  MercadoComparisonPanel,
} from '@/components/mercado';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

function MercadoContent() {
  return (
    <DashboardLayout
      title="Mercado"
      subtitle="Dashboard de analytics premium"
    >
      <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
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
    </DashboardLayout>
  );
}

export default function Mercado() {
  return (
    <MercadoProvider>
      <MercadoContent />
    </MercadoProvider>
  );
}
