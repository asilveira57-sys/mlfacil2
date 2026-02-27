import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { CheckCheck, Play } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  ok: 'bg-green-100 text-green-700 border-green-200',
  divergent: 'bg-amber-100 text-amber-700 border-amber-200',
  missing_payment: 'bg-red-100 text-red-700 border-red-200',
  missing_order: 'bg-purple-100 text-purple-700 border-purple-200',
  pending: 'bg-muted text-muted-foreground',
};

export default function FinanceiroConciliacao() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conciliação</h1>
          <p className="text-muted-foreground">Pedido ↔ Pagamento ↔ Movimento</p>
        </div>
        <Button disabled>
          <Play className="h-4 w-4 mr-2" />
          Rodar Conciliação
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCheck className="h-4 w-4" />
            Itens de Conciliação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Movimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead>Detalhes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma conciliação executada. Sincronize os dados e rode a conciliação.
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
