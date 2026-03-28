import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Receipt, Calendar, CreditCard, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useBillingHistory } from '@/hooks/useBillingHistory';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  approved: { label: 'Aprovado', variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
  pending: { label: 'Pendente', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  rejected: { label: 'Rejeitado', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
  refunded: { label: 'Estornado', variant: 'outline', icon: <XCircle className="h-3 w-3" /> },
};

export function BillingPaymentHistory() {
  const { payments, entitlements, loading, error } = useBillingHistory();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>Erro ao carregar histórico: {error}</p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const formatDate = (d: string | null) =>
    d ? format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—';

  return (
    <div className="space-y-6">
      {/* Active Entitlements */}
      {entitlements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-primary" />
              Planos e Direitos Ativos
            </CardTitle>
            <CardDescription>Períodos de acesso associados à sua conta</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {entitlements.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">
                      {e.tier_name || e.entitlement_type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(e.current_period_start)} → {formatDate(e.current_period_end)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Origem: {e.source === 'admin_manual_grant' ? 'Concessão administrativa' : e.source === 'mercadopago' ? 'Mercado Pago' : e.source}
                    </p>
                  </div>
                  <Badge variant={e.status === 'active' ? 'default' : 'secondary'}>
                    {e.status === 'active' ? 'Ativo' : e.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" />
            Histórico de Pagamentos
          </CardTitle>
          <CardDescription>Todos os pagamentos processados na sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Quando você realizar um pagamento, ele aparecerá aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((p) => {
                const st = statusMap[p.status] || { label: p.status, variant: 'outline' as const, icon: null };
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{formatCurrency(p.amount_brl)}</p>
                        <Badge variant={st.variant} className="gap-1">
                          {st.icon}
                          {st.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {p.provider === 'mercadopago' ? 'Mercado Pago' : p.provider}
                        {p.payment_id ? ` • ID: ${p.payment_id}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.paid_at ? `Pago em ${formatDate(p.paid_at)}` : `Criado em ${formatDate(p.created_at)}`}
                      </p>
                      {p.external_reference && (
                        <p className="text-xs text-muted-foreground">
                          Ref: {p.external_reference}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
