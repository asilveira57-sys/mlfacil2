import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type LogRow = {
  id: string;
  message_id: string | null;
  recipient_email: string;
  template_name: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

type SuppressedRow = {
  email: string;
  reason: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; variant: 'destructive' | 'secondary' | 'outline' }> = {
  failed: { label: 'Falhou', variant: 'destructive' },
  dlq: { label: 'DLQ', variant: 'destructive' },
  suppressed: { label: 'Bloqueado', variant: 'secondary' },
  pending: { label: 'Pendente', variant: 'outline' },
};

export function EmailDeliveryFailuresTab() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [suppressed, setSuppressed] = useState<SuppressedRow[]>([]);
  const [stats, setStats] = useState<{ sent: number; failed: number; pending: number; dlq: number }>({
    sent: 0, failed: 0, pending: 0, dlq: 0,
  });
  const [resending, setResending] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: logRows }, { data: supRows }, { data: statRows }] = await Promise.all([
        supabase
          .from('email_send_log' as any)
          .select('id, message_id, recipient_email, template_name, status, error_message, created_at')
          .in('status', ['failed', 'dlq', 'suppressed', 'pending'])
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('suppressed_emails' as any)
          .select('email, reason, created_at')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('email_send_log' as any)
          .select('status, message_id')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()),
      ]);

      setLogs((logRows as any) || []);
      setSuppressed((supRows as any) || []);

      const seen = new Map<string, string>();
      (statRows as any[] || []).forEach(r => {
        if (r.message_id) {
          seen.set(r.message_id, r.status);
        }
      });
      const counts = { sent: 0, failed: 0, pending: 0, dlq: 0 };
      seen.forEach(s => {
        if (s === 'sent') counts.sent++;
        else if (s === 'failed') counts.failed++;
        else if (s === 'dlq') counts.dlq++;
        else if (s === 'pending') counts.pending++;
      });
      setStats(counts);
    } catch (err: any) {
      toast.error(`Erro ao carregar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleResend = async (row: LogRow) => {
    setResending(row.id);
    try {
      const isAuth = ['signup', 'recovery', 'magiclink', 'invite', 'email_change', 'reauthentication'].includes(row.template_name || '');
      const mode = row.template_name === 'recovery' ? 'recovery' : 'confirmation';
      const { data, error } = await supabase.functions.invoke('admin-send-auth-email', {
        body: isAuth ? { email: row.recipient_email, mode } : { email: row.recipient_email, mode: 'auto' },
      });
      if (error) throw error;
      toast.success(`Reenviado: ${(data as any)?.message || row.recipient_email}`);
      await load();
    } catch (err: any) {
      toast.error(`Falha ao reenviar: ${err.message}`);
    } finally {
      setResending(null);
    }
  };

  const dlqAlert = stats.dlq + stats.failed >= 5;

  return (
    <div className="space-y-4">
      {dlqAlert && (
        <Card className="border-destructive">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm">
              <strong>{stats.dlq + stats.failed}</strong> e-mails falharam nos últimos 7 dias. Investigue abaixo.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Enviados (7d)" value={stats.sent} tone="ok" />
        <StatCard label="Pendentes" value={stats.pending} tone="warn" />
        <StatCard label="Falhas" value={stats.failed} tone="bad" />
        <StatCard label="DLQ" value={stats.dlq} tone="bad" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Falhas de Entrega Recentes</CardTitle>
            <CardDescription>Últimas 100 mensagens com status failed/dlq/suppressed/pending</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              Nenhuma falha encontrada. Tudo entregando normalmente.
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map(row => {
                const meta = STATUS_LABEL[row.status] || { label: row.status, variant: 'outline' as const };
                return (
                  <div key={row.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                        <span className="font-medium truncate">{row.recipient_email}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.template_name || '—'} · {formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                      {row.error_message && (
                        <p className="text-xs text-destructive mt-1 truncate">{row.error_message}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResend(row)}
                      disabled={resending === row.id}
                    >
                      {resending === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Reenviar'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista de Supressão</CardTitle>
          <CardDescription>E-mails bloqueados por bounce, complaint ou unsubscribe (não recebem mais nada)</CardDescription>
        </CardHeader>
        <CardContent>
          {suppressed.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Lista vazia ✓</p>
          ) : (
            <div className="space-y-1">
              {suppressed.map(s => (
                <div key={s.email} className="flex items-center justify-between text-sm p-2 border-b last:border-0">
                  <span className="truncate">{s.email}</span>
                  <span className="text-xs text-muted-foreground">{s.reason || 'unknown'}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'ok' ? 'text-green-600' : tone === 'warn' ? 'text-amber-600' : 'text-destructive';
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
