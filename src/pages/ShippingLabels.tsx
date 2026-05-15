import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useShippingLabels, ShippingOrder, LabelLayout } from '@/hooks/useShippingLabels';
import { ShippingFilters } from '@/components/shipping/ShippingFilters';
import { ShippingTable } from '@/components/shipping/ShippingTable';
import { ShippingPagination } from '@/components/shipping/ShippingPagination';
import { BulkActionsBar } from '@/components/shipping/BulkActionsBar';
import { OrderDetailsDrawer } from '@/components/shipping/OrderDetailsDrawer';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

import { useToast } from '@/hooks/use-toast';
import { PageContainer } from '@/components/layout/PageContainer';
import { exportSeparationReport, SeparationMode } from '@/utils/exportSeparationReport';
import { useMlApiAccess } from '@/components/access/TrialExpiredBanner';
import { TrialExpiredScreen } from '@/components/shipping/TrialExpiredScreen';
import { useUserAccess } from '@/contexts/UserAccessContext';
import { computeSelectionCapabilities } from '@/lib/shippingLabelRules';
import { loadFiltersState } from '@/lib/shippingLabelsSession';

export default function ShippingLabels() {
  const { t } = useTranslation('shipping');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[MOUNT] ShippingLabelsPage');
    return () => console.log('[UNMOUNT] ShippingLabelsPage');
  }, []);
  
  // Use global active account from context
  const { activeAccount, sellerId, loading: accountLoading, initialized } = useActiveAccount();
  
  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Restore logisticFilter from session
  const restoredLogistic = useMemo(() => {
    if (!sellerId) return 'all';
    const s = loadFiltersState(sellerId);
    return (s?.logisticFilter as 'all' | 'flex' | 'coleta' | 'full') || 'all';
  }, [sellerId]);
  const [logisticFilter, setLogisticFilter] = useState<'all' | 'flex' | 'coleta' | 'full'>(restoredLogistic);
  const { isAdmin } = useUserRole();
  const { allowed: mlAllowed, loading: mlAccessLoading, isTrialExpired } = useMlApiAccess();
  const { flags } = useUserAccess();
  const companyId = activeAccount?.companyId || null;

  // Shipping cutoff


  const {
    orders,
    isLoading,
    statusFilter,
    setStatusFilter,
    periodFilter,
    setPeriodFilter,
    customDateRange,
    setDateRange,
    currentPage,
    setCurrentPage,
    totalCount,
    totalPages,
    pageSize,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isSyncing,
    syncPhase,
    syncProgress,
    sync,
    lastSyncAt,
    statusCounts,
    generateLabels,
    isGenerating,
    generationProgress,
    searchQuery,
    setSearchQuery,
    sortField,
    sortDirection,
    toggleSort,
    orderItems,
  } = useShippingLabels({ sellerId: sellerId || null });

  // Check if account is available
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

  // Persist logisticFilter and clear selection when it changes
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

  // Compute filtered orders based on logistic filter
  const filteredOrders = logisticFilter === 'all' ? orders : orders.filter(o => {
    if (logisticFilter === 'flex') return o.logistic_type === 'self_service';
    if (logisticFilter === 'full') return o.logistic_type === 'fulfillment';
    return o.logistic_type && o.logistic_type !== 'self_service' && o.logistic_type !== 'fulfillment';
  });

  const handleSelectAll = useCallback(() => {
    selectAll(filteredOrders);
  }, [selectAll, filteredOrders]);

  const handleViewDetails = (order: ShippingOrder) => {
    setSelectedOrder(order);
    setDrawerOpen(true);
  };

  const handleGenerateLabels = (format: 'pdf' | 'zpl', layout: LabelLayout) => {
    generateLabels({ format, layout });
  };

  const handleReprintLabel = (shipmentId: string, format: 'pdf' | 'zpl', layout: LabelLayout) => {
    generateLabels({ format, layout, shipmentId });
  };

  // Compute capabilities for selected orders using centralized rules
  const selectedOrders = orders.filter(o => selectedIds.has(o.id));
  const capabilities = computeSelectionCapabilities(selectedOrders);

  const handleSeparationReport = useCallback(async (mode: SeparationMode) => {
    const selected = orders.filter(o => selectedIds.has(o.id));
    if (selected.length === 0) return;
    
    // Load logo as base64 via storage SDK to bypass CORS
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
          // Extract storage path from full URL
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
            // External URL - try direct fetch
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
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate('/shipping-labels/header-settings')}
      title="Configurar cabeçalho"
    >
      <Settings className="h-5 w-5" />
    </Button>
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

  // Show friendly expired screen instead of loading data that will fail
  // CRITICAL: Never block if has_active_subscription is true (paid user)
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
      {/* Main Content */}
      <main className="container mx-auto px-3 py-3 space-y-3">


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

        {/* Table - shows loading only for initial load, not during sync */}
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

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        onClear={clearSelection}
        onGenerateLabels={handleGenerateLabels}
        onSeparationReport={handleSeparationReport}
        isGenerating={isGenerating}
        generationProgress={generationProgress}
        capabilities={capabilities}
      />

      {/* Details Drawer */}
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
