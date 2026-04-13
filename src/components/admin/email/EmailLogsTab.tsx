import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { useEmailSendLog } from '@/hooks/useEmailSendLog';

const statusColors: Record<string, string> = {
  sent: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  dlq: 'bg-red-100 text-red-800',
  pending: 'bg-blue-100 text-blue-800',
  suppressed: 'bg-orange-100 text-orange-800',
  rate_limited: 'bg-pink-100 text-pink-800',
  bounced: 'bg-red-100 text-red-800',
  complained: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  sent: 'Enviado',
  failed: 'Falha',
  dlq: 'DLQ',
  pending: 'Pendente',
  suppressed: 'Suprimido',
  rate_limited: 'Rate limit',
  bounced: 'Bounce',
  complained: 'Reclamação',
};

const templateLabels: Record<string, string> = {
  recovery: '🔑 Recuperação',
  signup: '📧 Cadastro',
  auth_emails: '🔐 Auth',
};

const STATUS_FILTERS = ['', 'sent', 'pending', 'failed', 'dlq', 'rate_limited', 'suppressed'] as const;

export function EmailLogsTab() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: logs, isLoading } = useEmailSendLog({
    search: search.length >= 3 ? search : undefined,
    status: statusFilter || undefined,
  });

  // Summary counts
  const counts = logs?.reduce(
    (acc, l) => {
      acc.total++;
      if (l.status === 'sent') acc.sent++;
      else if (['failed', 'dlq', 'rate_limited'].includes(l.status)) acc.failed++;
      else if (l.status === 'pending') acc.pending++;
      return acc;
    },
    { total: 0, sent: 0, failed: 0, pending: 0 }
  ) || { total: 0, sent: 0, failed: 0, pending: 0 };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Logs de E-mail (Pipeline Ativo)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Summary stats */}
          <div className="flex gap-3 text-xs">
            <span className="px-2 py-1 rounded bg-muted">{counts.total} total</span>
            <span className="px-2 py-1 rounded bg-green-100 text-green-800">{counts.sent} enviados</span>
            <span className="px-2 py-1 rounded bg-blue-100 text-blue-800">{counts.pending} pendentes</span>
            <span className="px-2 py-1 rounded bg-red-100 text-red-800">{counts.failed} falhas</span>
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="flex gap-1">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s || 'all'}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                    statusFilter === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {s ? statusLabels[s] || s : 'Todos'}
                </button>
              ))}
            </div>
          </div>

          {/* Log list */}
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (!logs || logs.length === 0) ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {search ? `Nenhum resultado para "${search}"` : 'Nenhum log encontrado.'}
            </p>
          ) : (
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {logs.map((log) => (
                <div key={log.message_id} className="py-2.5 flex items-start gap-3">
                  <Badge className={`text-[10px] shrink-0 ${statusColors[log.status] || 'bg-muted text-muted-foreground'}`}>
                    {statusLabels[log.status] || log.status}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate">
                      {log.recipient_email || '—'}
                      {log.template_name && (
                        <span className="text-muted-foreground ml-2">
                          {templateLabels[log.template_name] || log.template_name}
                        </span>
                      )}
                    </p>
                    <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                      {log.error_message && (
                        <span className="text-red-600 dark:text-red-400 truncate max-w-[250px]">{log.error_message}</span>
                      )}
                      <span>{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
