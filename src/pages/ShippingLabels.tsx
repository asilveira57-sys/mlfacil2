import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import { useShippingLabels, ShippingOrder, LabelLayout } from '@/hooks/useShippingLabels';
import { ShippingFilters } from '@/components/shipping/ShippingFilters';
import { ShippingTable } from '@/components/shipping/ShippingTable';
import { ShippingPagination } from '@/components/shipping/ShippingPagination';
import { BulkActionsBar } from '@/components/shipping/BulkActionsBar';
import { OrderDetailsDrawer } from '@/components/shipping/OrderDetailsDrawer';
import { DiagnosticPanel } from '@/components/shipping/DiagnosticPanel';
import { useToast } from '@/hooks/use-toast';
import { PageContainer } from '@/components/layout/PageContainer';

interface MLAccount {
  id: string;
  nickname: string | null;
  email: string | null;
  is_active: boolean;
  ml_user_id: string;
}

export default function ShippingLabels() {
  const { t } = useTranslation('shipping');
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [mlAccount, setMlAccount] = useState<MLAccount | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    repairSync,
    diagnosticInfo,
  } = useShippingLabels({ sellerId: mlAccount?.ml_user_id || null });

  useEffect(() => {
    const checkAuthAndFetchAccount = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/auth');
        return;
      }

      // Fetch ML account
      const { data, error } = await supabase
        .from('ml_accounts')
        .select('id, nickname, email, is_active, ml_user_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching ML account:', error);
        toast({
          title: 'Erro',
          description: 'Não foi possível carregar a conta do Mercado Livre.',
          variant: 'destructive',
        });
      } else if (!data) {
        toast({
          title: 'Conta não conectada',
          description: 'Você precisa conectar sua conta do Mercado Livre primeiro.',
          variant: 'destructive',
        });
        navigate('/dashboard');
        return;
      } else {
        setMlAccount(data);
      }

      setLoading(false);
    };

    checkAuthAndFetchAccount();
  }, [navigate, toast]);

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

  if (loading) {
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
      subtitle={mlAccount?.nickname || mlAccount?.email || undefined}
      headerContent={headerContent}
    >
      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Diagnostic Panel */}
        <DiagnosticPanel
          diagnosticInfo={diagnosticInfo}
          isSyncing={isSyncing}
          onRepair={repairSync}
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
        />

        {/* Table - shows loading only for initial load, not during sync */}
        <ShippingTable
          orders={orders}
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
