import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package } from 'lucide-react';
import { useShippingLabels, ShippingOrder } from '@/hooks/useShippingLabels';
import { ShippingFilters } from '@/components/shipping/ShippingFilters';
import { ShippingTable } from '@/components/shipping/ShippingTable';
import { ShippingPagination } from '@/components/shipping/ShippingPagination';
import { BulkActionsBar } from '@/components/shipping/BulkActionsBar';
import { OrderDetailsDrawer } from '@/components/shipping/OrderDetailsDrawer';
import { useToast } from '@/hooks/use-toast';

interface MLAccount {
  id: string;
  nickname: string | null;
  email: string | null;
  is_active: boolean;
  ml_user_id: string;
}

export default function ShippingLabels() {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">Etiquetas de Envio</h1>
                {mlAccount && (
                  <p className="text-sm text-muted-foreground">
                    {mlAccount.nickname || mlAccount.email}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
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
        onGeneratePDF={() => generateLabels({ format: 'pdf' })}
        onGenerateZPL={() => generateLabels({ format: 'zpl' })}
        isGenerating={isGenerating}
        generationProgress={generationProgress}
      />

      {/* Details Drawer */}
      <OrderDetailsDrawer
        order={selectedOrder}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onReprint={(shipmentId, format) => generateLabels({ format, shipmentId })}
        isGenerating={isGenerating}
      />
    </div>
  );
}
