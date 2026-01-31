import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { AlertTriangle, CheckCircle2, XCircle, Eye, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Mock data for divergences
const mockDivergences = [
  {
    id: '1',
    order_id: '2000000123456789',
    item_id: 'MLB123456789',
    title: 'Produto Exemplo 1',
    order_date: '2026-01-28',
    charged_shipping_value: 19.90,
    paid_shipping_value: 25.50,
    expected_shipping_value: 15.90,
    shipping_diff_value: 9.60,
    shipping_diff_percent: 60.38,
    shipping_flag: 'divergent' as const,
    divergence_reason: 'Peso real maior que cadastrado',
    logistic_mode: 'ME2',
  },
  {
    id: '2',
    order_id: '2000000987654321',
    item_id: 'MLB987654321',
    title: 'Produto Exemplo 2',
    order_date: '2026-01-27',
    charged_shipping_value: 0,
    paid_shipping_value: 18.90,
    expected_shipping_value: 18.90,
    shipping_diff_value: 0,
    shipping_diff_percent: 0,
    shipping_flag: 'ok' as const,
    divergence_reason: null,
    logistic_mode: 'FULL',
  },
];

export function FreightDivergenceTab() {
  const divergentCount = mockDivergences.filter(d => d.shipping_flag === 'divergent').length;

  const getFlagBadge = (flag: string) => {
    switch (flag) {
      case 'ok':
        return (
          <Badge variant="outline" className="gap-1 text-green-600 border-green-200">
            <CheckCircle2 className="h-3 w-3" />
            OK
          </Badge>
        );
      case 'divergent':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Divergente
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">Pendente</Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Frete Cobrado Errado</h2>
          <p className="text-sm text-muted-foreground">
            Pedidos com divergência entre frete cobrado/pago e valor esperado pela tabela.
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Revalidar Vendas
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Analisado</CardDescription>
            <CardTitle className="text-2xl">{mockDivergences.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardDescription className="text-destructive">Divergentes</CardDescription>
            <CardTitle className="text-2xl text-destructive">{divergentCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Impacto Estimado</CardDescription>
            <CardTitle className="text-2xl">
              R$ {mockDivergences
                .filter(d => d.shipping_flag === 'divergent')
                .reduce((sum, d) => sum + Math.abs(d.shipping_diff_value), 0)
                .toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Divergences Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Divergências Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedido / Produto</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">Esperado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockDivergences.map((div) => (
                <TableRow key={div.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{div.order_id}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {div.title}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(div.order_date), 'dd/MM/yyyy', { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right">
                    R$ {div.charged_shipping_value.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    R$ {div.paid_shipping_value.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    R$ {div.expected_shipping_value.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={div.shipping_diff_value > 0 ? 'text-destructive' : 'text-green-600'}>
                      {div.shipping_diff_value > 0 ? '+' : ''}
                      R$ {div.shipping_diff_value.toFixed(2)}
                    </span>
                    <br />
                    <span className="text-xs text-muted-foreground">
                      ({div.shipping_diff_percent.toFixed(1)}%)
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {getFlagBadge(div.shipping_flag)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[150px]">
                    {div.divergence_reason || '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="sm" className="gap-1">
                      <Eye className="h-3 w-3" />
                      Detalhes
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
