import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ArrowLeftRight, Loader2, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFinanceAccounts } from '@/hooks/useFinanceAccounts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

export default function FinanceiroMovimentos() {
  const { data: accounts } = useFinanceAccounts();
  const accountId = accounts?.[0]?.id;
  const [search, setSearch] = useState('');

  const { data: movements, isLoading } = useQuery({
    queryKey: ['mp-movements', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const { data, error } = await supabase
        .from('mp_movements_raw')
        .select('*')
        .eq('finance_account_id', accountId)
        .order('date_created', { ascending: false })
        .limit(200);

      if (error) throw error;
      return data || [];
    },
    enabled: !!accountId,
  });

  const filtered = (movements || []).filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      m.mp_movement_id?.toLowerCase().includes(s) ||
      m.description?.toLowerCase().includes(s) ||
      m.movement_type?.toLowerCase().includes(s) ||
      m.reference_id?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Movimentos</h1>
        <p className="text-muted-foreground">Ledger completo da conta Mercado Pago</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por ID, descrição, tipo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Extrato de Movimentos
            {movements && <Badge variant="secondary" className="ml-2">{filtered.length}</Badge>}
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
                    <TableHead>ID Movimento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Pagamento Ref.</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {!accountId
                          ? 'Configure a integração para começar.'
                          : 'Nenhum movimento encontrado. Sincronize na aba Integrações.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs">{m.mp_movement_id}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{m.movement_type || '-'}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{m.description || '-'}</TableCell>
                        <TableCell className={`text-right font-medium ${(m.amount ?? 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {formatCurrency(m.amount)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(m.balance)}</TableCell>
                        <TableCell className="font-mono text-xs">{m.payment_id || '-'}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatDate(m.date_created)}</TableCell>
                      </TableRow>
                    ))
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
