import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Plus, RefreshCw, Trash2, ExternalLink, Eye, EyeOff,
  Star, Package, Edit2, Check, X, ChevronDown, ChevronRight,
  Users
} from 'lucide-react';
import { useCompetitorSellers, CompetitorSeller } from '@/hooks/useCompetitorSellers';
import { AddCompetitorSellerDialog } from './AddCompetitorSellerDialog';
import { SellerDetailDrawer } from './SellerDetailDrawer';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';

interface SellerTrackingListProps {
  sellerId: string;
}

export function SellerTrackingList({ sellerId }: SellerTrackingListProps) {
  const {
    sellers, loading, syncing,
    fetchSellers, addSellerResolved, syncSeller,
    getDetail, updateAlias, deleteSeller,
  } = useCompetitorSellers(sellerId);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<CompetitorSeller | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sellerToDelete, setSellerToDelete] = useState<string | null>(null);
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const [aliasValue, setAliasValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ativo' | 'pausado' | 'all'>('ativo');

  const prevSellerIdRef = useRef(sellerId);
  const hasFetchedRef = useRef(false);
  const prevStatusFilterRef = useRef(statusFilter);

  useEffect(() => {
    const sellerChanged = prevSellerIdRef.current !== sellerId;
    const statusChanged = prevStatusFilterRef.current !== statusFilter;
    
    if (hasFetchedRef.current && !sellerChanged && !statusChanged) return;
    
    prevSellerIdRef.current = sellerId;
    prevStatusFilterRef.current = statusFilter;
    hasFetchedRef.current = true;
    
    fetchSellers(statusFilter);
  }, [fetchSellers, statusFilter, sellerId]);

  const handleOpenDetail = (seller: CompetitorSeller) => {
    setSelectedSeller(seller);
    setDetailOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (sellerToDelete) {
      await deleteSeller(sellerToDelete);
      setSellerToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleSaveAlias = async (sellerId: string) => {
    await updateAlias(sellerId, aliasValue);
    setEditingAlias(null);
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Nunca';
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  const getDisplayName = (seller: CompetitorSeller) => {
    const base = seller.ml_nickname || `Seller ${seller.ml_seller_id}`;
    return seller.user_alias ? `${base} (${seller.user_alias})` : base;
  };

  if (loading && sellers.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant={statusFilter === 'ativo' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('ativo')}>Ativos</Button>
          <Button variant={statusFilter === 'pausado' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('pausado')}>Pausados</Button>
          <Button variant={statusFilter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('all')}>Todos</Button>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Monitorar Seller
        </Button>
      </div>

      {/* Empty State */}
      {sellers.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Nenhum seller monitorado</h3>
          <p className="text-muted-foreground mb-4">
            Adicione sellers concorrentes para acompanhar seus anúncios e vendas estimadas
          </p>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Monitorar Primeiro Seller
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {sellers.map((seller) => (
            <Card key={seller.id} className={`overflow-hidden transition-all ${seller.status === 'pausado' ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Avatar placeholder */}
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Users className="h-6 w-6 text-primary" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {editingAlias === seller.id ? (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{seller.ml_nickname}</span>
                          <Input
                            value={aliasValue}
                            onChange={(e) => setAliasValue(e.target.value)}
                            className="h-7 w-40 text-sm"
                            placeholder="Apelido"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveAlias(seller.id);
                              if (e.key === 'Escape') setEditingAlias(null);
                            }}
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSaveAlias(seller.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingAlias(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium">{getDisplayName(seller)}</span>
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => { setEditingAlias(seller.id); setAliasValue(seller.user_alias || ''); }}
                            title="Editar apelido"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      {seller.status === 'pausado' && <Badge variant="secondary">Pausado</Badge>}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {seller.total_items_tracked} anúncios
                      </span>
                      <span>Vinculado: {formatDate(seller.binding_date)}</span>
                      <span>Sync: {formatDate(seller.last_synced_at)}</span>
                      {seller.seller_reputation?.power_seller_status && (
                        <Badge variant="outline" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          {seller.seller_reputation.power_seller_status}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => syncSeller(seller.id)} disabled={syncing === seller.id} title="Sincronizar agora">
                      <RefreshCw className={`h-4 w-4 ${syncing === seller.id ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDetail(seller)} title="Ver detalhes">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => { setSellerToDelete(seller.id); setDeleteDialogOpen(true); }}
                      title="Remover" className="text-destructive hover:text-destructive"
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

      {/* Dialogs */}
      <AddCompetitorSellerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={addSellerResolved}
        sellerId={sellerId}
      />

      {selectedSeller && (
        <SellerDetailDrawer
          open={detailOpen}
          onOpenChange={setDetailOpen}
          sellerId={sellerId}
          competitorSeller={selectedSeller}
          onSync={() => syncSeller(selectedSeller.id)}
          syncing={syncing === selectedSeller.id}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover monitoramento do seller?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados de anúncios e snapshots deste seller serão removidos permanentemente.
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
