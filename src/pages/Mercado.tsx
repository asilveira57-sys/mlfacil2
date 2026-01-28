import { MercadoProvider } from '@/contexts/MercadoContext';
import {
  MercadoBreadcrumb,
  MercadoToolbar,
  MercadoCategoryGrid,
  MercadoDetailsDrawer,
  MercadoMetricsDrawer,
  MercadoComparisonPanel,
} from '@/components/mercado';
import { PageContainer } from '@/components/layout/PageContainer';

function MercadoContent() {
  return (
    <PageContainer
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
    </PageContainer>
  );
}

export default function Mercado() {
  return (
    <MercadoProvider>
      <MercadoContent />
    </MercadoProvider>
  );
}
