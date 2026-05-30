import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Settings, History } from 'lucide-react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useShippingLabelsV2, usePrintHistoryV2 } from '@/hooks/useShippingLabelsV2';
import type { ShippingOrder, LabelLayout } from '@/hooks/useShippingLabelsV2';
import { ShippingFilters } from '@/components/shipping/ShippingFilters';
import { ShippingTable } from '@/components/shipping/ShippingTable';
import { ShippingPagination } from '@/components/shipping/ShippingPagination';
import { OrderDetailsDrawer } from '@/components/shipping/OrderDetailsDrawer';
import { BulkActionsBarV2 } from '@/components/shipping-v2/BulkActionsBarV2';
import { PrintHistoryV2 } from '@/components/shipping-v2/PrintHistoryV2';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PageContainer } from '@/components/layout/PageContainer';
import { exportSeparationReport, SeparationMode } from '@/utils/exportSeparationReport';
import { useMlApiAccess } from '@/components/access/TrialExpiredBanner';
import { TrialExpiredScreen } from '@/components/shipping/TrialExpiredScreen';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { computeCapabilitiesV2, computeSelectionDiagnostics } from '@/lib/labeltestEligibility';
import type { LabelTestLayout } from '@/lib/labeltestEligibility';
import { loadFiltersState } from '@/lib/shippingLabelsSession';

export default function ShippingLabels() {
  const { t } = useTranslation('shipping');
  const navigate = useNavigate();
  const { toast } = useToast();

  const { activeAccount, sellerId, loading: accountLoading, initialized } = useActiveAccount();

  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const restoredLogistic = useMemo(() => {
    if (!sellerId) return 'all';
    const s = loadFiltersState(sellerId);
    return (s?.logisticFilter as 'all' | 'flex' | 'coleta' | 'full') || 'all';
  }, [sellerId]);
  const [logisticFilter, setLogisticFilter] = useState<'all' | 'flex' | 'coleta' | 'full'>(restoredLogistic);

  const { allowed: mlAllowed, loading: mlAccessLoading, isTrialExpired } = useMlApiAccess();
  const { flags } = useUserAccess();
  const companyId = activeAccount?.companyId || null;

  const {
    orders, isLoading, statusFilter, setStatusFilter,
    periodFilter, setPeriodFilter, customDateRange, setDateRange,
    currentPage, setCurrentPage, totalCount, totalPages, pageSize,
    selectedIds, toggleSelection, selectAll, clearSelection,
    isSyncing, syncPhase, syncProgress, sync, lastSyncAt, statusCounts,
    generateLabels, isGenerating, generationProgress,
    isStalled, resumeStalledRecovery, cancelStalledRecovery,
    searchQuery, setSearchQuery, sortField, sortDirection, toggleSort,
    orderItems,
  } = useShippingLabelsV2({ sellerId: sellerId || null });

  const { data: printHistory = [], isLoading: historyLoading } = usePrintHistoryV2(sellerId || null);

  useEffect(() => {
    if (!accountLoading && initialized && !activeAccount) {
      toast({
        title: 'Conta não conectada',
        description: 'Você precisa conectar sua conta do Mercado Livre primeiro.',
        variant: 'destructive',
      });
      navigate('/dashboard');
    }
  }, [accountLoading, initialized, activeAccount, navigate, toast]);

  useEffect(() => {
    clearSelection();
    if (sellerId) {
      const current = loadFiltersState(sellerId);
      if (current) {
        import('@/lib/shippingLabelsSession').then(({ saveFiltersState }) => {
          saveFiltersState(sellerId, { ...current, logisticFilter });
        });
      }
    }
  }, [logisticFilter, clearSelection, sellerId]);

  const filteredOrders = logisticFilter === 'all' ? orders : orders.filter((o: ShippingOrder) => {
    if (logisticFilter === 'flex') return o.logistic_type === 'self_service';
    if (logisticFilter === 'full') return o.logistic_type === 'fulfillment';
    return o.logistic_type && o.logistic_type !== 'self_service' && o.logistic_type !== 'fulfillment';
  });

  const handleSelectAll = useCallback(() => { selectAll(filteredOrders); }, [selectAll, filteredOrders]);
  const handleViewDetails = (order: ShippingOrder) => { setSelectedOrder(order); setDrawerOpen(true); };
  const handleGenerateLabels = (format: 'pdf' | 'zpl', layout: LabelTestLayout) => {
    generateLabels({ format, layout: layout as LabelLayout });
  };
  const handleReprintLabel = (shipmentId: string, format: 'pdf' | 'zpl', layout: LabelLayout) => {
    generateLabels({ format, layout, shipmentId });
  };

  const selectedOrders = orders.filter((o: ShippingOrder) => selectedIds.has(o.id));
  const capabilities = computeCapabilitiesV2(selectedOrders);
  const diagnostics = computeSelectionDiagnostics(selectedOrders);

  const handleSeparationReport = useCallback(async (mode: SeparationMode) => {
    const selected = orders.filter((o: ShippingOrder) => selectedIds.has(o.id));
    if (selected.length === 0) return;

    let logoBase64: string | null = null;
    try {
      if (companyId) {
        const { data } = await supabase
          .from('companies')
          .select('logo_url')
          .eq('id', companyId)
          .maybeSingle();
        const logoUrl = (data as any)?.logo_url || null;
        if (logoUrl) {
          const storageMatch = logoUrl.match(/\/storage\/v1\/object\/public\/(.+)/);
          if (storageMatch) {
            const [bucket, ...pathParts] = storageMatch[1].split('/');
            const filePath = pathParts.join('/');
            const { data: blob } = await supabase.storage.from(bucket).download(filePath);
            if (blob) {
              logoBase64 = await new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }
          } else {
            const resp = await fetch(logoUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              logoBase64 = await new Promise<string | null>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }
          }
        }
      }
    } catch { /* use default */ }

    await exportSeparationReport({
      orders: selected,
      orderItems,
      mode,
      logoBase64,
      sellerName: activeAccount?.nickname || undefined,
    });
  }, [orders, selectedIds, orderItems, companyId, activeAccount]);

  const headerContent = (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className="gap-1.5">
        <History className="h-4 w-4" />
        Histórico
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate('/shipping-labels/header-settings')}
        title="Configurar cabeçalho"
      >
        <Settings className="h-5 w-5" />
      </Button>
    </div>
  );

  if ((!activeAccount && (accountLoading || !initialized)) || (mlAccessLoading && !flags)) {
    return (
      <PageContainer title={t('title')}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </PageContainer>
    );
  }

  const hasActiveSub = flags?.has_active_subscription === true;
  if (!mlAllowed && isTrialExpired && !hasActiveSub) {
    return <TrialExpiredScreen title={t('title')} />;
  }

  return (
    <PageContainer
      title={t('title')}
      subtitle={activeAccount?.nickname || activeAccount?.email || undefined}
      headerContent={headerContent}
    >
      <main className="container mx-auto px-3 py-2 space-y-2">
        {isStalled && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 flex items-center justify-between gap-3">
            <div className="text-sm text-amber-900 dark:text-amber-100">
              <strong>Verificação pausada.</strong> A geração ainda pode estar em andamento no servidor. Retome a verificação para continuar acompanhando.
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="default" onClick={resumeStalledRecovery}>
                Retomar verificação
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelStalledRecovery}>
                Descartar
              </Button>
            </div>
          </div>
        )}

        {showHistory && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Histórico de Geração</h3>
            <PrintHistoryV2 jobs={printHistory} isLoading={historyLoading} />
          </div>
        )}

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

        <ShippingPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          totalCount={totalCount}
        />
      </main>

      <BulkActionsBarV2
        selectedCount={selectedIds.size}
        onClear={clearSelection}
        onGenerateLabels={handleGenerateLabels}
        onSeparationReport={handleSeparationReport}
        isGenerating={isGenerating}
        generationProgress={generationProgress}
        capabilities={capabilities}
        diagnostics={diagnostics}
      />

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
