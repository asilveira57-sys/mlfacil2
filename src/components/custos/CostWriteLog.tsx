import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, FileText, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface CostWriteLogProps {
  sellerId: string;
}

interface WriteLogEntry {
  order_id: string;
  last_writer: string | null;
  calculated_at: string | null;
  commission_cost: number | null;
  shipping_cost_seller: number | null;
  fee_ml: number | null;
  fee_ml_source: string | null;
  revenue_total: number | null;
  profit_total: number | null;
  last_recalculated_at: string | null;
}

const WRITER_LABELS: Record<string, { label: string; color: string }> = {
  'cost-engine:calculateSingleOrder': { label: 'Cálculo Individual', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  'cost-engine:batch': { label: 'Batch (Recalcular)', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  'cost-engine:job-batch': { label: 'Job Batch', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
  'ml-sync-real-costs:resync_single': { label: 'Sync Individual (ML)', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  'ml-sync-real-costs:batch': { label: 'Sync Batch (ML)', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  'costs-nightly-sync': { label: 'Sync Noturno', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
};

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `R$ ${Number(value).toFixed(2)}`;
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function CostWriteLog({ sellerId }: CostWriteLogProps) {
  const [entries, setEntries] = useState<WriteLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchOrder, setSearchOrder] = useState('');
  const [writerFilter, setWriterFilter] = useState('all');
  const [zeroFilter, setZeroFilter] = useState('all'); // all | zero_commission | zero_shipping

  const fetchLogs = async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('order_cost_breakdown_cache')
        .select('order_id, last_writer, calculated_at, commission_cost, shipping_cost_seller, fee_ml, fee_ml_source, revenue_total, profit_total, last_recalculated_at')
        .eq('seller_id', sellerId)
        .order('last_recalculated_at', { ascending: false })
        .limit(200);

      if (searchOrder.trim()) {
        query = query.eq('order_id', searchOrder.trim());
      }
      if (writerFilter !== 'all') {
        query = query.eq('last_writer', writerFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      let filtered = (data || []) as WriteLogEntry[];
      if (zeroFilter === 'zero_commission') {
        filtered = filtered.filter(e => !e.commission_cost || e.commission_cost === 0);
      } else if (zeroFilter === 'zero_shipping') {
        filtered = filtered.filter(e => !e.shipping_cost_seller || e.shipping_cost_seller === 0);
      }

      setEntries(filtered);
    } catch (err: any) {
      toast.error('Erro ao buscar logs: ' + (err.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [sellerId]);

  const writerOptions = Object.keys(WRITER_LABELS);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Logs de Gravação
        </CardTitle>
        <CardDescription>
          Rastreie qual função gravou por último em cada pedido. Útil para identificar sobrescrita indevida de comissão/frete.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground mb-1 block">Pedido</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ID do pedido..."
                value={searchOrder}
                onChange={e => setSearchOrder(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="min-w-[200px]">
            <label className="text-xs text-muted-foreground mb-1 block">Função escritora</label>
            <Select value={writerFilter} onValueChange={setWriterFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {writerOptions.map(w => (
                  <SelectItem key={w} value={w}>{WRITER_LABELS[w].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px]">
            <label className="text-xs text-muted-foreground mb-1 block">Filtro de zeros</label>
            <Select value={zeroFilter} onValueChange={setZeroFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="zero_commission">Comissão = 0</SelectItem>
                <SelectItem value="zero_shipping">Frete = 0</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={fetchLogs} size="sm" variant="outline">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Buscar
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum registro encontrado.
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Última Função</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Frete</TableHead>
                  <TableHead className="text-right">Receita</TableHead>
                  <TableHead className="text-right">Lucro</TableHead>
                  <TableHead>Fonte Fee</TableHead>
                  <TableHead>Gravado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => {
                  const writerInfo = entry.last_writer ? WRITER_LABELS[entry.last_writer] : null;
                  const isZeroCommission = !entry.commission_cost || entry.commission_cost === 0;
                  const isZeroShipping = !entry.shipping_cost_seller || entry.shipping_cost_seller === 0;
                  
                  return (
                    <TableRow key={entry.order_id}>
                      <TableCell className="font-mono text-xs">{entry.order_id}</TableCell>
                      <TableCell>
                        {writerInfo ? (
                          <Badge variant="outline" className={writerInfo.color}>
                            {writerInfo.label}
                          </Badge>
                        ) : entry.last_writer ? (
                          <Badge variant="outline">{entry.last_writer}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right ${isZeroCommission ? 'text-destructive font-medium' : ''}`}>
                        {isZeroCommission && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                        {formatCurrency(entry.commission_cost)}
                      </TableCell>
                      <TableCell className={`text-right ${isZeroShipping ? 'text-destructive font-medium' : ''}`}>
                        {isZeroShipping && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                        {formatCurrency(entry.shipping_cost_seller)}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(entry.revenue_total)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(entry.profit_total)}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{entry.fee_ml_source || '—'}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(entry.last_recalculated_at || entry.calculated_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        {entries.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Mostrando {entries.length} registros mais recentes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
