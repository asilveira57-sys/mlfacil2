import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownCircle, Loader2, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFinanceAccounts } from '@/hooks/useFinanceAccounts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  approved: { label: 'Aprovado', variant: 'default' },
  pending: { label: 'Pendente', variant: 'secondary' },
  rejected: { label: 'Rejeitado', variant: 'destructive' },
  refunded: { label: 'Devolvido', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  in_process: { label: 'Em processo', variant: 'secondary' },
  in_mediation: { label: 'Em mediação', variant: 'secondary' },
  charged_back: { label: 'Chargeback', variant: 'destructive' },
};

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'dd/MM/yy HH:mm', { locale: ptBR });
  } catch {
    return '-';
  }
}

export default function FinanceiroRecebimentos() {
  const { data: accounts } = useFinanceAccounts();
  const accountId = accounts?.[0]?.id;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: payments, isLoading } = useQuery({
    queryKey: ['mp-payments', accountId, statusFilter],
    queryFn: async () => {
      if (!accountId) return [];
      let query = supabase
        .from('mp_payments_raw')
        .select('*')
        .eq('finance_account_id', accountId)
        .order('date_created', { ascending: false })
        .limit(200);

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!accountId,
  });

  const filtered = (payments || []).filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.mp_payment_id?.toLowerCase().includes(s) ||
      p.description?.toLowerCase().includes(s) ||
      p.payer_email?.toLowerCase().includes(s) ||
      p.external_reference?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recebimentos</h1>
        <p className="text-muted-foreground">Pagamentos recebidos via Mercado Pago</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID, descrição, e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="approved">Aprovado</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="rejected">Rejeitado</SelectItem>
            <SelectItem value="refunded">Devolvido</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownCircle className="h-4 w-4" />
            Pagamentos
            {payments && <Badge variant="secondary" className="ml-2">{filtered.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Pagamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor Bruto</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                    <TableHead className="text-right">Valor Líquido</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Parcelas</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Liberação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        {!accountId
                          ? 'Configure a integração para começar.'
                          : 'Nenhum pagamento encontrado. Sincronize na aba Integrações.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(p => {
                      const statusInfo = STATUS_LABELS[p.status || ''] || { label: p.status || '-', variant: 'outline' as const };
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.mp_payment_id}</TableCell>
                          <TableCell>
                            <Badge variant={statusInfo.variant} className="text-xs">
                              {statusInfo.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(p.transaction_amount)}</TableCell>
                          <TableCell className="text-right text-destructive">{formatCurrency(p.fee_amount ? -Math.abs(p.fee_amount) : null)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(p.net_received_amount)}</TableCell>
                          <TableCell className="text-xs">{p.payment_method_id || '-'}</TableCell>
                          <TableCell className="text-center">{p.installments || '-'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{formatDate(p.date_approved || p.date_created)}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{formatDate(p.money_release_date)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
