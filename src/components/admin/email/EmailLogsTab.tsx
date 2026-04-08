import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEmailLogs } from '@/hooks/useEmailAdmin';
import { useEmailSendLog } from '@/hooks/useEmailSendLog';

const actionColors: Record<string, string> = {
  sent: 'bg-green-100 text-green-800',
  fail: 'bg-red-100 text-red-800',
  failed: 'bg-red-100 text-red-800',
  dlq: 'bg-red-100 text-red-800',
  enqueue: 'bg-blue-100 text-blue-800',
  pending: 'bg-blue-100 text-blue-800',
  send_attempt: 'bg-yellow-100 text-yellow-800',
  skip_opt_out: 'bg-orange-100 text-orange-800',
  suppressed: 'bg-orange-100 text-orange-800',
  cancel: 'bg-gray-100 text-gray-800',
  invalid_email: 'bg-amber-100 text-amber-800',
  dedup_block: 'bg-purple-100 text-purple-800',
  throttle_block: 'bg-pink-100 text-pink-800',
  rate_limited: 'bg-pink-100 text-pink-800',
  bounced: 'bg-red-100 text-red-800',
  complained: 'bg-red-100 text-red-800',
};

const actionLabels: Record<string, string> = {
  sent: 'Enviado',
  fail: 'Falha',
  failed: 'Falha',
  dlq: 'DLQ',
  enqueue: 'Enfileirado',
  pending: 'Pendente',
  send_attempt: 'Tentativa',
  skip_opt_out: 'Opt-out',
  suppressed: 'Suprimido',
  cancel: 'Cancelado',
  invalid_email: 'Sem e-mail',
  dedup_block: 'Duplicado',
  throttle_block: 'Limite/dia',
  rate_limited: 'Rate limit',
  bounced: 'Bounce',
  complained: 'Reclamação',
};

export function EmailLogsTab() {
  const [subTab, setSubTab] = useState<'cloud' | 'legacy'>('cloud');
  const { data: sendLogs, isLoading: loadingSend } = useEmailSendLog();
  const { data: legacyLogs, isLoading: loadingLegacy } = useEmailLogs();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Logs de E-mail</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={subTab} onValueChange={(v) => setSubTab(v as 'cloud' | 'legacy')}>
            <TabsList className="mb-3">
              <TabsTrigger value="cloud" className="text-xs">
                Lovable Cloud ({sendLogs?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="legacy" className="text-xs">
                Sistema legado ({legacyLogs?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cloud">
              {loadingSend ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (!sendLogs || sendLogs.length === 0) ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum log do sistema ativo ainda.</p>
              ) : (
                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {sendLogs.map((log) => (
                    <div key={log.id} className="py-2.5 flex items-start gap-3">
                      <Badge className={`text-[10px] shrink-0 ${actionColors[log.status] || 'bg-muted text-muted-foreground'}`}>
                        {actionLabels[log.status] || log.status}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate">
                          {log.recipient_email || '—'}
                          {log.template_name && <span className="text-muted-foreground ml-2">({log.template_name})</span>}
                        </p>
                        <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                          {log.error_message && (
                            <span className="text-red-600 dark:text-red-400 truncate max-w-[200px]">{log.error_message}</span>
                          )}
                          {log.message_id && <span className="font-mono truncate max-w-[120px]">{log.message_id}</span>}
                          <span>{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="legacy">
              {loadingLegacy ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (!legacyLogs || legacyLogs.length === 0) ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum log do sistema legado.</p>
              ) : (
                <div className="divide-y max-h-[500px] overflow-y-auto">
                  {legacyLogs.map((log) => (
                    <div key={log.id} className="py-2.5 flex items-start gap-3">
                      <Badge className={`text-[10px] shrink-0 ${actionColors[log.action] || 'bg-muted text-muted-foreground'}`}>
                        {actionLabels[log.action] || log.action}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate">{log.message || '—'}</p>
                        <div className="flex gap-2 text-[10px] text-muted-foreground mt-0.5">
                          {log.email && <span>{log.email}</span>}
                          {log.source_type && <span>via {log.source_type}</span>}
                          {log.event_key && <span className="font-mono">{log.event_key}</span>}
                          <span>{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
