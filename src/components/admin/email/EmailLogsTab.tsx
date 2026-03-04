import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useEmailLogs } from '@/hooks/useEmailAdmin';

const actionColors: Record<string, string> = {
  sent: 'bg-green-100 text-green-800',
  fail: 'bg-red-100 text-red-800',
  enqueue: 'bg-blue-100 text-blue-800',
  send_attempt: 'bg-yellow-100 text-yellow-800',
  skip_opt_out: 'bg-orange-100 text-orange-800',
  cancel: 'bg-gray-100 text-gray-800',
};

export function EmailLogsTab() {
  const { data: logs, isLoading } = useEmailLogs();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logs de E-mail ({logs?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {(!logs || logs.length === 0) ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum log registrado ainda.</p>
          ) : (
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className="py-2.5 flex items-start gap-3">
                  <Badge className={`text-[10px] shrink-0 ${actionColors[log.action] || 'bg-muted text-muted-foreground'}`}>
                    {log.action}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate">{log.message || '—'}</p>
                    <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                      {log.email && <span>{log.email}</span>}
                      {log.source_type && <span>via {log.source_type}</span>}
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
