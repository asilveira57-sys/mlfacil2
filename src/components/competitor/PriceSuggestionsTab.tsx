import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from '@/components/ui/pagination';
import {
  Check,
  X,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  Clock,
  AlertTriangle,
  RefreshCw,
  Filter
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PriceAction {
  id: string;
  tracker_id: string;
  user_id: string;
  seller_listing_id: string | null;
  action_type: string;
  status: string;
  reason: string | null;
  competitor_price: number | null;
  proposed_price: number | null;
  applied_price: number | null;
  created_at: string;
  tracker?: {
    competitor_label: string;
    competitor_thumbnail: string | null;
    seller_listing_title: string | null;
    seller_listing_id: string | null;
  };
}

interface PriceSuggestionsTabProps {
  sellerId: string;
}

export function PriceSuggestionsTab({ sellerId }: PriceSuggestionsTabProps) {
  const [actions, setActions] = useState<PriceAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'done' | 'ignored' | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const pageSize = 20;

  const fetchActions = useCallback(async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Build query for price actions with tracker info
      let query = supabase
        .from('competitor_price_actions')
        .select(`
          *,
          tracker:competitor_trackers!tracker_id (
            competitor_label,
            competitor_thumbnail,
            seller_listing_title,
            seller_listing_id
          )
        `, { count: 'exact' })
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      // Apply status filter
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Add pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      
      if (error) throw error;
      
      setActions(data || []);
      setTotalPages(Math.ceil((count || 0) / pageSize));
    } catch (error: any) {
      console.error('Error fetching actions:', error);
      toast.error('Erro ao carregar sugestões');
    } finally {
      setLoading(false);
    }
  }, [sellerId, statusFilter, page]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const handleUpdateStatus = async (actionId: string, newStatus: 'done' | 'ignored') => {
    setRefreshing(actionId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('competitor_price_actions')
        .update({ status: newStatus })
        .eq('id', actionId)
        .eq('user_id', session.user.id);

      if (error) throw error;

      toast.success(newStatus === 'done' ? 'Marcado como feito' : 'Sugestão ignorada');
      await fetchActions();
    } catch (error: any) {
      console.error('Error updating action:', error);
      toast.error('Erro ao atualizar sugestão');
    } finally {
      setRefreshing(null);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (date: string) => {
    return format(new Date(date), "dd/MM HH:mm", { locale: ptBR });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
      case 'done':
        return <Badge className="gap-1"><Check className="h-3 w-3" /> Feito</Badge>;
      case 'ignored':
        return <Badge variant="secondary" className="gap-1"><X className="h-3 w-3" /> Ignorado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingCount = actions.filter(a => a.status === 'pending').length;

  if (loading && actions.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">Aguardando ação</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Concluídas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {actions.filter(a => a.status === 'done').length}
            </div>
            <p className="text-xs text-muted-foreground">Sugestões aplicadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ignoradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {actions.filter(a => a.status === 'ignored').length}
            </div>
            <p className="text-xs text-muted-foreground">Descartadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filtrar status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="done">Concluídas</SelectItem>
              <SelectItem value="ignored">Ignoradas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchActions()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Suggestions Table */}
      {actions.length === 0 ? (
        <Card className="p-8 text-center">
          <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma sugestão encontrada</h3>
          <p className="text-muted-foreground">
            {statusFilter === 'pending' 
              ? 'As sugestões de preço aparecerão aqui quando concorrentes mudarem de preço'
              : 'Nenhuma sugestão com este status'}
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seu Anúncio</TableHead>
                <TableHead>Concorrente</TableHead>
                <TableHead className="text-right">Preço Concorrente</TableHead>
                <TableHead className="text-right">Preço Sugerido</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((action) => (
                <TableRow key={action.id}>
                  <TableCell>
                    <div className="max-w-[200px]">
                      <p className="font-medium truncate">
                        {action.tracker?.seller_listing_title || 'Sem vínculo'}
                      </p>
                      {action.seller_listing_id && (
                        <p className="text-xs text-muted-foreground">{action.seller_listing_id}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {action.tracker?.competitor_thumbnail && (
                        <img 
                          src={action.tracker.competitor_thumbnail} 
                          alt="" 
                          className="w-8 h-8 object-cover rounded"
                        />
                      )}
                      <span className="font-medium">{action.tracker?.competitor_label || '-'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-medium">{formatCurrency(action.competitor_price)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-bold text-primary">{formatCurrency(action.proposed_price)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <TrendingDown className="h-4 w-4" />
                      <span>{action.reason || 'Preço alterado'}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(action.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(action.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {action.status === 'pending' && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleUpdateStatus(action.id, 'done')}
                          disabled={refreshing === action.id}
                          title="Marcar como feito"
                        >
                          <Check className="h-4 w-4 text-primary" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleUpdateStatus(action.id, 'ignored')}
                          disabled={refreshing === action.id}
                          title="Ignorar"
                        >
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = i + 1;
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    onClick={() => setPage(pageNum)}
                    isActive={page === pageNum}
                    className="cursor-pointer"
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
