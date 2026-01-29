import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Trash2, 
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Settings,
  History
} from 'lucide-react';
import { useCompetitorTracking, TrackedListing } from '@/hooks/useCompetitorTracking';
import { AddTrackedListingDialog } from './AddTrackedListingDialog';
import { TrackedListingDetailDrawer } from './TrackedListingDetailDrawer';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';

interface TrackedCompetitorsTabProps {
  sellerId: string;
}

export function TrackedCompetitorsTab({ sellerId }: TrackedCompetitorsTabProps) {
  const {
    listings,
    overview,
    loading,
    refreshing,
    fetchListings,
    fetchOverview,
    updateListing,
    deleteListing,
    checkListing,
  } = useCompetitorTracking(sellerId);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<TrackedListing | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [listingToDelete, setListingToDelete] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'paused' | 'all'>('active');

  useEffect(() => {
    fetchListings(statusFilter);
    fetchOverview();
  }, [fetchListings, fetchOverview, statusFilter]);

  const handleOpenDetail = (listing: TrackedListing) => {
    setSelectedListing(listing);
    setDetailDrawerOpen(true);
  };

  const handleToggleStatus = async (listing: TrackedListing) => {
    await updateListing(listing.id, {
      status: listing.status === 'active' ? 'paused' : 'active'
    });
  };

  const handleDeleteConfirm = async () => {
    if (listingToDelete) {
      await deleteListing(listingToDelete);
      setListingToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Nunca';
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getReactionBadge = (type: string) => {
    switch (type) {
      case 'monitor':
        return <Badge variant="secondary">Monitorar</Badge>;
      case 'suggest':
        return <Badge variant="outline" className="border-blue-500 text-blue-600">Sugerir</Badge>;
      case 'auto':
        return <Badge className="bg-green-600">Automático</Badge>;
      default:
        return null;
    }
  };

  const getPriceTrend = (listing: TrackedListing) => {
    if (!listing.last_price_change_at) return null;
    
    // Check if price changed in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (new Date(listing.last_price_change_at) < sevenDaysAgo) return null;

    // We'd need more context for trend, for now just show changed
    return <Badge variant="outline" className="text-amber-600 border-amber-500">Alterado</Badge>;
  };

  if (loading && listings.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      {overview && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Monitorados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.total_tracked}</div>
              <p className="text-xs text-muted-foreground">{overview.active_count} ativos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Alertas Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.alerts_count}</div>
              <p className="text-xs text-muted-foreground">Ações recomendadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Alterações Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.recent_price_changes}</div>
              <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pausados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.paused_count}</div>
              <p className="text-xs text-muted-foreground">Sem monitoramento</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={statusFilter === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('active')}
          >
            Ativos
          </Button>
          <Button
            variant={statusFilter === 'paused' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('paused')}
          >
            Pausados
          </Button>
          <Button
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('all')}
          >
            Todos
          </Button>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Concorrente
        </Button>
      </div>

      {/* Listings */}
      {listings.length === 0 ? (
        <Card className="p-8 text-center">
          <Eye className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Nenhum concorrente monitorado</h3>
          <p className="text-muted-foreground mb-4">
            Adicione links de anúncios concorrentes para acompanhar preços e receber alertas
          </p>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Primeiro Concorrente
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <Card 
              key={listing.id} 
              className={`overflow-hidden transition-all ${
                listing.status === 'paused' ? 'opacity-60' : ''
              } ${!listing.is_available ? 'border-destructive/50' : ''}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  {listing.thumbnail ? (
                    <img 
                      src={listing.thumbnail} 
                      alt="" 
                      className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                      <Eye className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{listing.competitor_name}</span>
                          {getReactionBadge(listing.reaction_type)}
                          {getPriceTrend(listing)}
                          {!listing.is_available && (
                            <Badge variant="destructive">Indisponível</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {listing.title || listing.competitor_item_id}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold">
                          {formatCurrency(listing.current_price)}
                        </div>
                        {listing.original_price && listing.original_price > (listing.current_price || 0) && (
                          <div className="text-sm text-muted-foreground line-through">
                            {formatCurrency(listing.original_price)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span>Verificado: {formatDate(listing.last_check_at)}</span>
                      {listing.price_change_count > 0 && (
                        <span className="flex items-center gap-1">
                          <History className="h-3 w-3" />
                          {listing.price_change_count} alterações
                        </span>
                      )}
                      {listing.min_price && (
                        <span>Mín: {formatCurrency(listing.min_price)}</span>
                      )}
                      {listing.max_price && (
                        <span>Máx: {formatCurrency(listing.max_price)}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => checkListing(listing.id)}
                      disabled={refreshing === listing.id}
                      title="Verificar agora"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing === listing.id ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDetail(listing)}
                      title="Ver detalhes"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleStatus(listing)}
                      title={listing.status === 'active' ? 'Pausar' : 'Ativar'}
                    >
                      {listing.status === 'active' ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      title="Abrir anúncio"
                    >
                      <a href={listing.competitor_link} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setListingToDelete(listing.id);
                        setDeleteDialogOpen(true);
                      }}
                      title="Remover"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <AddTrackedListingDialog
        sellerId={sellerId}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />

      {/* Detail Drawer */}
      <TrackedListingDetailDrawer
        sellerId={sellerId}
        listing={selectedListing}
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover monitoramento?</AlertDialogTitle>
            <AlertDialogDescription>
              O histórico de preços e alertas deste concorrente será mantido, mas o monitoramento será interrompido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
