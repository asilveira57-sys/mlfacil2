import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { ArrowDownCircle } from 'lucide-react';

export default function FinanceiroRecebimentos() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Recebimentos</h1>
        <p className="text-muted-foreground">Pagamentos recebidos via Mercado Pago</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowDownCircle className="h-4 w-4" />
            Pagamentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Pagamento</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor Bruto</TableHead>
                  <TableHead className="text-right">Valor Líquido</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Parcelas</TableHead>
                  <TableHead>Data Aprovação</TableHead>
                  <TableHead>Liberação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Nenhum pagamento sincronizado. Configure a integração para começar.
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
