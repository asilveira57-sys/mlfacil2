import { useEffect, useState, useCallback } from 'react';
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
import { ShippingCutoffCard } from '@/components/shipping/ShippingCutoffCard';
import { useShippingCutoff } from '@/hooks/useShippingCutoff';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';

import { useToast } from '@/hooks/use-toast';
import { PageContainer } from '@/components/layout/PageContainer';
import { exportSeparationReport, SeparationMode } from '@/utils/exportSeparationReport';

export default function ShippingLabels() {
  const { t } = useTranslation('shipping');
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Use global active account from context
  const { activeAccount, sellerId, loading: accountLoading, initialized } = useActiveAccount();
  
  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logisticFilter, setLogisticFilter] = useState<'all' | 'flex' | 'coleta' | 'full'>('all');
  const { isAdmin } = useUserRole();
  const companyId = activeAccount?.companyId || null;

  // Shipping cutoff
  const {
    data: cutoffData,
    isLoading: cutoffLoading,
    isRefreshing: cutoffRefreshing,
    error: cutoffError,
    refresh: refreshCutoff,
  } = useShippingCutoff({
    sellerId: activeAccount?.id || null,
    mlUserId: sellerId || null,
    companyId: activeAccount?.companyId || null,
  });

  // Fetch zone details from cache when cutoff has by_zone flex
  const [zoneDetails, setZoneDetails] = useState<Array<{ zone: string; cutoff: string }> | null>(null);
  useEffect(() => {
    if (cutoffData?.flex?.cutoff_type === 'by_zone' && cutoffData?.flex?.zone_details_count > 0 && companyId && sellerId) {
      supabase
        .from('shipping_cutoff_cache')
        .select('flex_zone_details')
        .eq('company_id', companyId)
        .eq('seller_id', sellerId)
        .order('date_ref', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.flex_zone_details) {
            setZoneDetails(data.flex_zone_details as any);
          }
        });
    } else {
      setZoneDetails(null);
    }
  }, [cutoffData?.flex?.cutoff_type, cutoffData?.flex?.zone_details_count, companyId, sellerId]);

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

  const handleViewDetails = (order: ShippingOrder) => {
    setSelectedOrder(order);
    setDrawerOpen(true);
  };

  const handleGenerateLabels = (format: 'pdf' | 'zpl', layout: LabelLayout) => {
    generateLabels({ format, layout });
  };

  const handleReprintLabel = (shipmentId: string, format: 'pdf' | 'zpl') => {
    generateLabels({ format, layout: 'meli_100x150', shipmentId });
  };

  const handleSeparationReport = useCallback(async (mode: SeparationMode) => {
    const selected = orders.filter(o => selectedIds.has(o.id));
    if (selected.length === 0) return;
    let logoUrl: string | null = null;
    try {
      if (companyId) {
        const { data } = await supabase
          .from('companies')
          .select('logo_url')
          .eq('id', companyId)
          .maybeSingle();
        logoUrl = (data as any)?.logo_url || null;
      }
    } catch { /* use default */ }
    await exportSeparationReport({
      orders: selected,
      orderItems,
      mode,
      logoUrl,
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

  if (accountLoading || !initialized) {
    return (
      <PageContainer title={t('title')}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer 
      title={t('title')} 
      subtitle={activeAccount?.nickname || activeAccount?.email || undefined}
      headerContent={headerContent}
    >
      {/* Main Content */}
      <main className="container mx-auto px-3 py-3 space-y-3">
        {/* Cutoff Card */}
        <ShippingCutoffCard
          data={cutoffData}
          isLoading={cutoffLoading}
          isRefreshing={cutoffRefreshing}
          error={cutoffError}
          onRefresh={refreshCutoff}
          canRefresh={isAdmin}
          zoneDetails={zoneDetails}
        />

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
          orders={logisticFilter === 'all' ? orders : orders.filter(o => {
            if (logisticFilter === 'flex') return o.logistic_type === 'self_service';
            if (logisticFilter === 'full') return o.logistic_type === 'fulfillment';
            // coleta = everything else that has a logistic_type and isn't flex/full
            return o.logistic_type && o.logistic_type !== 'self_service' && o.logistic_type !== 'fulfillment';
          })}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          onSelectAll={selectAll}
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
