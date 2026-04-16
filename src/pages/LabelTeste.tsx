import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, FlaskConical, History } from 'lucide-react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useShippingLabelsV2, usePrintHistoryV2 } from '@/hooks/useShippingLabelsV2';
import type { ShippingOrder, LabelLayout } from '@/hooks/useShippingLabelsV2';
import { ShippingFilters } from '@/components/shipping/ShippingFilters';
import { ShippingTable } from '@/components/shipping/ShippingTable';
import { ShippingPagination } from '@/components/shipping/ShippingPagination';
import { OrderDetailsDrawer } from '@/components/shipping/OrderDetailsDrawer';
import { PrintHistoryV2 } from '@/components/shipping-v2/PrintHistoryV2';
import { PrintInstructionsV2 } from '@/components/shipping-v2/PrintInstructionsV2';
import { useToast } from '@/hooks/use-toast';
import { PageContainer } from '@/components/layout/PageContainer';
import { computeCapabilitiesV2, computeSelectionDiagnostics } from '@/lib/labeltestEligibility';
import type { LabelTestLayout } from '@/lib/labeltestEligibility';
import { BulkActionsBarV2 } from '@/components/shipping-v2/BulkActionsBarV2';
import { useMlApiAccess } from '@/components/access/TrialExpiredBanner';
import { TrialExpiredScreen } from '@/components/shipping/TrialExpiredScreen';
import { useUserAccess } from '@/contexts/UserAccessContext';

export default function LabelTeste() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeAccount, sellerId, loading: accountLoading, initialized } = useActiveAccount();
  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logisticFilter, setLogisticFilter] = useState<'all' | 'flex' | 'coleta' | 'full'>('all');
  const [showHistory, setShowHistory] = useState(false);
  const { allowed: mlAllowed, loading: mlAccessLoading, isTrialExpired } = useMlApiAccess();
  const { flags } = useUserAccess();

  const {
    orders, isLoading, statusFilter, setStatusFilter,
    periodFilter, setPeriodFilter, customDateRange, setDateRange,
    currentPage, setCurrentPage, totalCount, totalPages, pageSize,
    selectedIds, toggleSelection, selectAll, clearSelection,
    isSyncing, syncPhase, syncProgress, sync, lastSyncAt, statusCounts,
    generateLabels, isGenerating, generationProgress,
    searchQuery, setSearchQuery, sortField, sortDirection, toggleSort,
    orderItems,
  } = useShippingLabelsV2({ sellerId: sellerId || null });

  const { data: printHistory = [], isLoading: historyLoading } = usePrintHistoryV2(sellerId || null);

  useEffect(() => {
    if (!accountLoading && initialized && !activeAccount) {
      toast({ title: 'Conta não conectada', description: 'Conecte sua conta do Mercado Livre.', variant: 'destructive' });
      navigate('/dashboard');
    }
  }, [accountLoading, initialized, activeAccount, navigate, toast]);

  useEffect(() => { clearSelection(); }, [logisticFilter, clearSelection]);

  const filteredOrders = logisticFilter === 'all' ? orders : orders.filter((o: ShippingOrder) => {
    if (logisticFilter === 'flex') return o.logistic_type === 'self_service';
    if (logisticFilter === 'full') return o.logistic_type === 'fulfillment';
    return o.logistic_type && o.logistic_type !== 'self_service' && o.logistic_type !== 'fulfillment';
  });

  const handleSelectAll = useCallback(() => { selectAll(filteredOrders); }, [selectAll, filteredOrders]);
  const handleViewDetails = (order: ShippingOrder) => { setSelectedOrder(order); setDrawerOpen(true); };
  const handleGenerateLabels = (format: 'pdf' | 'zpl', layout: LabelTestLayout) => { generateLabels({ format, layout: layout as LabelLayout }); };
  const handleReprintLabel = (shipmentId: string, format: 'pdf' | 'zpl', layout: LabelLayout) => { generateLabels({ format, layout, shipmentId }); };
  const selectedOrders = orders.filter((o: ShippingOrder) => selectedIds.has(o.id));
  const capabilities = computeCapabilitiesV2(selectedOrders);
  const diagnostics = computeSelectionDiagnostics(selectedOrders);

  if (accountLoading || !initialized || mlAccessLoading) {
    return (
      <PageContainer title="Label Teste V2">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </PageContainer>
    );
  }

  const hasActiveSub = flags?.has_active_subscription === true;
  if (!mlAllowed && isTrialExpired && !hasActiveSub) {
    return <TrialExpiredScreen title="Label Teste V2" />;
  }

  const headerContent = (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-amber-600 border-amber-500 bg-amber-50 dark:bg-amber-950/30 gap-1">
        <FlaskConical className="h-3 w-3" />
        TESTE V2
      </Badge>
      <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className="gap-1.5">
        <History className="h-4 w-4" />
        Histórico
      </Button>
      <Button variant="ghost" size="icon" onClick={() => navigate('/shipping-labels/header-settings')} title="Configurar cabeçalho">
        <Settings className="h-5 w-5" />
      </Button>
    </div>
  );

  return (
    <PageContainer
      title="Etiquetas V2"
      subtitle={activeAccount?.nickname || activeAccount?.email || undefined}
      headerContent={headerContent}
    >
      <main className="container mx-auto px-3 py-3 space-y-4">
        {/* Print instructions */}
        <PrintInstructionsV2 />

        {/* History panel */}
        {showHistory && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Histórico de Geração (V2)</h3>
            <PrintHistoryV2 jobs={printHistory} isLoading={historyLoading} />
          </div>
        )}

        {/* Filters */}
        <ShippingFilters
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          periodFilter={periodFilter}
          setPeriodFilter={setPeriodFilter}
          customDateRange={customDateRange}
          setDateRange={setDateRange}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          statusCounts={statusCounts}
          isSyncing={isSyncing}
          syncPhase={syncPhase}
          syncProgress={syncProgress}
          onSync={sync}
          lastSyncAt={lastSyncAt}
          totalCount={totalCount}
          logisticFilter={logisticFilter}
          setLogisticFilter={setLogisticFilter}
        />

        {/* Table */}
        <ShippingTable
          orders={filteredOrders}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          onSelectAll={handleSelectAll}
          onViewDetails={handleViewDetails}
          isLoading={isLoading}
          sortField={sortField}
          sortDirection={sortDirection}
          onToggleSort={toggleSort}
          orderItems={orderItems}
        />

        {/* Pagination */}
        <ShippingPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          totalCount={totalCount}
        />
      </main>

      {/* Bulk actions */}
      <BulkActionsBarV2
        selectedCount={selectedIds.size}
        onClear={clearSelection}
        onGenerateLabels={handleGenerateLabels}
        isGenerating={isGenerating}
        generationProgress={generationProgress}
        capabilities={capabilities}
        diagnostics={diagnostics}
      />

      {/* Details drawer */}
      <OrderDetailsDrawer
        order={selectedOrder}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onReprint={handleReprintLabel}
        isGenerating={isGenerating}
        orderItems={selectedOrder ? orderItems.get(selectedOrder.order_id) : undefined}
      />
    </PageContainer>
  );
}
