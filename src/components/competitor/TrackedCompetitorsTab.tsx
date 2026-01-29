import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertTriangle,
  Settings,
  History,
  AlertCircle
} from 'lucide-react';
import { useCompetitorTracking, CompetitorTracker } from '@/hooks/useCompetitorTracking';
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
    trackers,
    overview,
    loading,
    refreshing,
    fetchTrackers,
    fetchOverview,
    updateTracker,
    deleteTracker,
    checkTracker,
  } = useCompetitorTracking(sellerId);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedTracker, setSelectedTracker] = useState<CompetitorTracker | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trackerToDelete, setTrackerToDelete] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ativo' | 'pausado' | 'all'>('ativo');

  useEffect(() => {
    fetchTrackers(statusFilter);
    fetchOverview();
  }, [fetchTrackers, fetchOverview, statusFilter]);

  const handleOpenDetail = (tracker: CompetitorTracker) => {
    setSelectedTracker(tracker);
    setDetailDrawerOpen(true);
  };

  const handleToggleStatus = async (tracker: CompetitorTracker) => {
    await updateTracker(tracker.id, {
      status: tracker.status === 'ativo' ? 'pausado' : 'ativo'
    });
  };

  const handleDeleteConfirm = async () => {
    if (trackerToDelete) {
      await deleteTracker(trackerToDelete);
      setTrackerToDelete(null);
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

  const getReactionBadge = (mode: string) => {
    switch (mode) {
      case 'monitorar':
        return <Badge variant="secondary">Monitorar</Badge>;
      case 'sugerir':
        return <Badge variant="outline" className="border-blue-500 text-blue-600">Sugerir</Badge>;
      case 'auto_aplicar':
        return <Badge className="bg-green-600">Automático</Badge>;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ativo':
        return null;
      case 'pausado':
        return <Badge variant="secondary">Pausado</Badge>;
      case 'erro':
        return <Badge variant="destructive">Erro</Badge>;
      default:
        return null;
    }
  };

  const getStateBadge = (state: string) => {
    if (state === 'indisponivel') {
      return <Badge variant="destructive">Indisponível</Badge>;
    }
    return null;
  };

  if (loading && trackers.length === 0) {
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
              <p className="text-xs text-muted-foreground">Não lidos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ações Sugeridas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.pending_actions}</div>
              <p className="text-xs text-muted-foreground">Aguardando resposta</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Com Erro</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overview.error_count}</div>
              <p className="text-xs text-muted-foreground">Falhas consecutivas</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={statusFilter === 'ativo' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('ativo')}
          >
            Ativos
          </Button>
          <Button
            variant={statusFilter === 'pausado' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('pausado')}
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

      {/* Trackers List */}
      {trackers.length === 0 ? (
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
          {trackers.map((tracker) => (
            <Card 
              key={tracker.id} 
              className={`overflow-hidden transition-all ${
                tracker.status === 'pausado' ? 'opacity-60' : ''
              } ${tracker.last_known_state === 'indisponivel' ? 'border-destructive/50' : ''}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  {tracker.competitor_thumbnail ? (
                    <img 
                      src={tracker.competitor_thumbnail} 
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
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium">{tracker.competitor_label}</span>
                          {getReactionBadge(tracker.reaction_mode)}
                          {getStatusBadge(tracker.status)}
                          {getStateBadge(tracker.last_known_state)}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {tracker.competitor_title || tracker.competitor_external_id || 'Sem título'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold">
                          {formatCurrency(tracker.last_known_price)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                      <span>Verificado: {formatDate(tracker.last_checked_at)}</span>
                      <span>Próxima: {formatDate(tracker.next_check_at)}</span>
                      {tracker.min_price && (
                        <span>Mín: {formatCurrency(tracker.min_price)}</span>
                      )}
                      {tracker.max_price && (
                        <span>Máx: {formatCurrency(tracker.max_price)}</span>
                      )}
                      {tracker.consecutive_failures > 0 && (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {tracker.consecutive_failures} falhas
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => checkTracker(tracker.id)}
                      disabled={refreshing === tracker.id}
                      title="Verificar agora"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshing === tracker.id ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDetail(tracker)}
                      title="Ver detalhes"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleStatus(tracker)}
                      title={tracker.status === 'ativo' ? 'Pausar' : 'Ativar'}
                    >
                      {tracker.status === 'ativo' ? (
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
                      <a href={tracker.competitor_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setTrackerToDelete(tracker.id);
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
        tracker={selectedTracker}
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
