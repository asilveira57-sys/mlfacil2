import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Loader2, 
  Eye, 
  CheckCircle2, 
  RefreshCw, 
  FileText, 
  AlertTriangle,
  Clock,
  XCircle,
  Search
} from 'lucide-react';
import { useServiceInvoiceQueue, useInvoiceQueueMutations, useServiceOrders } from '@/hooks/useErpIntegrations';
import type { ServiceInvoiceQueue, ServiceOrder } from '@/types/erp-integration';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Demo company ID
const DEMO_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

export function AdminInvoiceQueue() {
  const [activeTab, setActiveTab] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Fila de NFS-e</h2>
        <p className="text-muted-foreground">
          Gerencie pedidos prontos para faturamento
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pendentes
            </TabsTrigger>
            <TabsTrigger value="ready" className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Prontos
            </TabsTrigger>
            <TabsTrigger value="issued" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Emitidos
            </TabsTrigger>
            <TabsTrigger value="error" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Erros
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar pedido..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 w-[200px]"
              />
            </div>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="tiny">Tiny</SelectItem>
                <SelectItem value="olist">Olist</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="pending">
          <QueueTable 
            companyId={DEMO_COMPANY_ID} 
            status="pending" 
            searchTerm={searchTerm}
            providerFilter={providerFilter}
          />
        </TabsContent>

        <TabsContent value="ready">
          <QueueTable 
            companyId={DEMO_COMPANY_ID} 
            status="ready" 
            searchTerm={searchTerm}
            providerFilter={providerFilter}
          />
        </TabsContent>

        <TabsContent value="issued">
          <QueueTable 
            companyId={DEMO_COMPANY_ID} 
            status="issued" 
            searchTerm={searchTerm}
            providerFilter={providerFilter}
          />
        </TabsContent>

        <TabsContent value="error">
          <QueueTable 
            companyId={DEMO_COMPANY_ID} 
            status="error" 
            searchTerm={searchTerm}
            providerFilter={providerFilter}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface QueueTableProps {
  companyId: string;
  status: string;
  searchTerm: string;
  providerFilter: string;
}

function QueueTable({ companyId, status, searchTerm, providerFilter }: QueueTableProps) {
  const { data: queue, isLoading } = useServiceInvoiceQueue(companyId, status);
  const { updateStatus, markAsIssued } = useInvoiceQueueMutations();

  const filteredQueue = queue?.filter((item) => {
    if (providerFilter !== 'all' && item.service_order?.provider !== providerFilter) {
      return false;
    }
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        item.service_order?.external_order_number?.toLowerCase().includes(searchLower) ||
        item.customer?.nome?.toLowerCase().includes(searchLower) ||
        item.customer?.documento?.includes(searchTerm)
      );
    }
    return true;
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!filteredQueue || filteredQueue.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mb-4 opacity-50" />
          <p>Nenhum item na fila</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredQueue.map((item) => (
              <QueueRow 
                key={item.id} 
                item={item} 
                onUpdateStatus={updateStatus.mutateAsync}
                onMarkAsIssued={markAsIssued.mutateAsync}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface QueueRowProps {
  item: ServiceInvoiceQueue;
  onUpdateStatus: (data: any) => Promise<any>;
  onMarkAsIssued: (data: any) => Promise<any>;
}

function QueueRow({ item, onUpdateStatus, onMarkAsIssued }: QueueRowProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [nfseNumber, setNfseNumber] = useState('');

  const order = item.service_order;
  const customer = item.customer;

  const handleMarkIssued = async () => {
    await onMarkAsIssued({
      id: item.id,
      nfseNumber,
    });
    setIssueDialogOpen(false);
  };

  const handleRetry = async () => {
    await onUpdateStatus({
      id: item.id,
      status: 'pending',
      errorMessage: null,
    });
  };

  return (
    <TableRow>
      <TableCell className="text-sm">
        {order?.order_date ? format(new Date(order.order_date), "dd/MM/yy", { locale: ptBR }) : '-'}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize">
          {order?.provider || '-'}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-sm">
        {order?.external_order_number || order?.external_order_id || '-'}
      </TableCell>
      <TableCell className="max-w-[200px] truncate">
        {customer?.nome || '-'}
      </TableCell>
      <TableCell className="font-mono text-sm">
        {customer?.documento || '-'}
      </TableCell>
      <TableCell>
        {item.valor_servico ? `R$ ${item.valor_servico.toFixed(2)}` : '-'}
      </TableCell>
      <TableCell>
        <StatusBadge status={item.status} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)}>
            <Eye className="h-4 w-4" />
          </Button>

          {item.status === 'ready' && (
            <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Marcar como Emitido</DialogTitle>
                  <DialogDescription>
                    Registre o número da NFS-e emitida
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Número da NFS-e</Label>
                    <Input
                      value={nfseNumber}
                      onChange={(e) => setNfseNumber(e.target.value)}
                      placeholder="Ex: 12345"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleMarkIssued}>
                    Confirmar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {item.status === 'error' && (
            <Button variant="ghost" size="sm" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes do Pedido</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Pedido</Label>
                  <p className="font-mono">{order?.external_order_number || order?.external_order_id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Origem</Label>
                  <p className="capitalize">{order?.provider}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Dados do Tomador</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nome:</span> {customer?.nome || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Documento:</span> {customer?.documento || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">E-mail:</span> {customer?.email || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Telefone:</span> {customer?.telefone || '-'}
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Endereço:</span>{' '}
                    {customer?.endereco_rua ? 
                      `${customer.endereco_rua}, ${customer.endereco_numero || 'S/N'} - ${customer.endereco_bairro || ''}, ${customer.endereco_cidade || ''}-${customer.endereco_uf || ''} CEP: ${customer.endereco_cep || ''}` 
                      : '-'}
                  </div>
                </div>

                {customer?.missing_fields && customer.missing_fields.length > 0 && (
                  <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm font-medium">Campos faltantes:</span>
                    </div>
                    <p className="text-sm text-yellow-600 dark:text-yellow-500 mt-1">
                      {customer.missing_fields.join(', ')}
                    </p>
                  </div>
                )}
              </div>

              {item.error_message && (
                <div className="border-t pt-4">
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <XCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Erro:</span>
                    </div>
                    <p className="text-sm text-red-600 dark:text-red-500 mt-1">
                      {item.error_message}
                    </p>
                  </div>
                </div>
              )}

              {item.nfse_number && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">NFS-e Emitida</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Número:</span> {item.nfse_number}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Emitida em:</span>{' '}
                      {item.issued_at ? format(new Date(item.issued_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    pending: { variant: 'secondary', label: 'Pendente' },
    ready: { variant: 'default', label: 'Pronto' },
    processing: { variant: 'outline', label: 'Processando' },
    issued: { variant: 'default', label: 'Emitido' },
    error: { variant: 'destructive', label: 'Erro' },
    cancelled: { variant: 'outline', label: 'Cancelado' },
  };

  const config = variants[status] || { variant: 'outline', label: status };

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}
