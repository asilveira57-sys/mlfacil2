import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  CreditCard, 
  Webhook, 
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { useWebhookLogs, type WebhookLogData } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SubscriptionData {
  id: string;
  mp_preapproval_id: string;
  user_id: string;
  plan_id: string | null;
  status: string;
  created_at: string;
}

interface PaymentData {
  id: string;
  mp_payment_id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
}

export function AdminPayments() {
  const { data: webhooks, isLoading: webhooksLoading } = useWebhookLogs();
  
  // Fetch real payments from tenant_payments
  const { data: rawPayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['admin', 'tenant-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch subscriptions from tenant_entitlements
  const { data: rawSubs = [], isLoading: subsLoading } = useQuery({
    queryKey: ['admin', 'tenant-entitlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_entitlements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // Map to display types
  const payments: PaymentData[] = rawPayments.map((p: any) => ({
    id: p.id,
    mp_payment_id: p.payment_id || '—',
    user_id: p.tenant_id || '—',
    amount: p.amount_brl || 0,
    status: p.status || 'unknown',
    created_at: p.created_at,
  }));

  const subscriptions: SubscriptionData[] = rawSubs.map((s: any) => ({
    id: s.id,
    mp_preapproval_id: s.last_payment_id || '—',
    user_id: s.tenant_id || '—',
    plan_id: s.tier_code || s.addon_code || null,
    status: s.status || 'unknown',
    created_at: s.created_at,
  }));

  const [detailDialog, setDetailDialog] = useState<{ open: boolean; data: unknown }>({
    open: false,
    data: null,
  });

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Aprovado</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Pendente</Badge>;
      case 'cancelled':
      case 'rejected':
        return <Badge variant="destructive">Cancelado</Badge>;
      case 'refunded':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Estornado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getWebhookStatusBadge = (webhook: WebhookLogData) => {
    if (webhook.error_message) {
      return <Badge variant="destructive">Erro</Badge>;
    }
    if (webhook.processed_at) {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Processado</Badge>;
    }
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Pendente</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pagamentos</h1>
        <p className="text-muted-foreground">
          Gerencie pagamentos, assinaturas e webhooks
        </p>
      </div>

      <Tabs defaultValue="subscriptions">
        <TabsList>
          <TabsTrigger value="subscriptions" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Assinaturas
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Pagamentos Avulsos
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2">
            <Webhook className="h-4 w-4" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        {/* Subscriptions Tab */}
        <TabsContent value="subscriptions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Assinaturas Recorrentes</CardTitle>
              <CardDescription>
                Histórico de assinaturas via Mercado Pago
              </CardDescription>
            </CardHeader>
            <CardContent>
              {subsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : subscriptions.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Nenhuma assinatura encontrada
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="font-mono text-xs">
                          {sub.mp_preapproval_id?.slice(0, 12)}...
                        </TableCell>
                        <TableCell>{sub.user_id?.slice(0, 8)}...</TableCell>
                        <TableCell>{sub.plan_id || 'N/A'}</TableCell>
                        <TableCell>{getPaymentStatusBadge(sub.status)}</TableCell>
                        <TableCell>
                          {format(new Date(sub.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetailDialog({ open: true, data: sub })}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pagamentos Avulsos</CardTitle>
              <CardDescription>
                Histórico de pagamentos únicos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : payments.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Nenhum pagamento encontrado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID MP</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-mono text-xs">
                          {payment.mp_payment_id}
                        </TableCell>
                        <TableCell>{payment.user_id?.slice(0, 8)}...</TableCell>
                        <TableCell>
                          R$ {payment.amount?.toFixed(2) || '0.00'}
                        </TableCell>
                        <TableCell>{getPaymentStatusBadge(payment.status)}</TableCell>
                        <TableCell>
                          {format(new Date(payment.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetailDialog({ open: true, data: payment })}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Webhooks Recebidos
              </CardTitle>
              <CardDescription>
                Logs técnicos de webhooks do Mercado Pago
              </CardDescription>
            </CardHeader>
            <CardContent>
              {webhooksLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !webhooks || webhooks.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Nenhum webhook recebido
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Recebido em</TableHead>
                      <TableHead>Processado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooks.map((webhook) => (
                      <TableRow key={webhook.id}>
                        <TableCell>
                          <Badge variant="outline">{webhook.event_type}</Badge>
                        </TableCell>
                        <TableCell>{getWebhookStatusBadge(webhook)}</TableCell>
                        <TableCell>
                          {format(new Date(webhook.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          {webhook.processed_at ? (
                            format(new Date(webhook.processed_at), 'dd/MM HH:mm:ss', { locale: ptBR })
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetailDialog({ open: true, data: webhook })}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog 
        open={detailDialog.open} 
        onOpenChange={(open) => setDetailDialog({ open, data: null })}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-auto">
              {JSON.stringify(detailDialog.data, null, 2)}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
