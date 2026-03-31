import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Activity, Clock, SkipForward, Play, Pause, Zap } from 'lucide-react';
import { format } from 'date-fns';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-green-500/10 text-green-700 border-green-200',
  medium: 'bg-blue-500/10 text-blue-700 border-blue-200',
  low: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  zero: 'bg-red-500/10 text-red-700 border-red-200',
};

const DECISION_ICONS: Record<string, typeof Play> = {
  run: Play,
  skip: SkipForward,
  defer: Pause,
};

export function AdminExecutionMonitor() {
  const [routineFilter, setRoutineFilter] = useState<string>('all');

  // Fetch execution state
  const { data: states, isLoading: statesLoading, refetch: refetchStates } = useQuery({
    queryKey: ['admin-execution-state', routineFilter],
    queryFn: async () => {
      let query = supabase
        .from('execution_state')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (routineFilter !== 'all') {
        query = query.eq('routine_key', routineFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  // Fetch recent logs
  const { data: recentLogs, isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['admin-execution-logs', routineFilter],
    queryFn: async () => {
      let query = supabase
        .from('execution_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (routineFilter !== 'all') {
        query = query.eq('routine_key', routineFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });

  // Fetch policies
  const { data: policies } = useQuery({
    queryKey: ['admin-execution-policies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('execution_policies')
        .select('*')
        .order('routine_key');
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
  });

  // Summary stats
  const summary = {
    total: states?.length || 0,
    high: states?.filter(s => s.priority_level === 'high').length || 0,
    medium: states?.filter(s => s.priority_level === 'medium').length || 0,
    low: states?.filter(s => s.priority_level === 'low').length || 0,
    zero: states?.filter(s => s.priority_level === 'zero').length || 0,
    eligible: states?.filter(s => s.eligible_to_run).length || 0,
  };

  const runCount = recentLogs?.filter(l => l.decision === 'run').length || 0;
  const skipCount = recentLogs?.filter(l => l.decision === 'skip').length || 0;
  const deferCount = recentLogs?.filter(l => l.decision === 'defer').length || 0;

  const routineKeys = [...new Set([
    ...(states?.map(s => s.routine_key) || []),
    ...(policies?.map(p => p.routine_key) || []),
  ])].sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Monitor de Execução</h2>
          <p className="text-muted-foreground">Controle de prioridade, cooldown e elegibilidade das rotinas</p>
        </div>
        <div className="flex gap-2">
          <Select value={routineFilter} onValueChange={setRoutineFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar rotina" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as rotinas</SelectItem>
              {routineKeys.map(k => (
                <SelectItem key={k} value={k}>{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => { refetchStates(); refetchLogs(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{summary.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-green-600">{summary.high}</div>
            <div className="text-xs text-muted-foreground">High</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{summary.medium}</div>
            <div className="text-xs text-muted-foreground">Medium</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">{summary.low}</div>
            <div className="text-xs text-muted-foreground">Low</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-red-600">{summary.zero}</div>
            <div className="text-xs text-muted-foreground">Zero</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-green-600">{runCount}</div>
            <div className="text-xs text-muted-foreground">Runs (100)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-orange-600">{skipCount + deferCount}</div>
            <div className="text-xs text-muted-foreground">Skip/Defer</div>
          </CardContent>
        </Card>
      </div>

      {/* Policies */}
      {policies && policies.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" /> Políticas de Execução
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rotina</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>High</TableHead>
                    <TableHead>Medium</TableHead>
                    <TableHead>Low</TableHead>
                    <TableHead>Zero</TableHead>
                    <TableHead>Max/dia</TableHead>
                    <TableHead>Req. Anúncios</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.routine_key}</TableCell>
                      <TableCell>
                        <Badge variant={p.enabled ? 'default' : 'secondary'}>
                          {p.enabled ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.cooldown_high}min</TableCell>
                      <TableCell>{p.cooldown_medium}min</TableCell>
                      <TableCell>{p.cooldown_low}min</TableCell>
                      <TableCell>{p.cooldown_zero}min</TableCell>
                      <TableCell>{p.max_runs_per_day}</TableCell>
                      <TableCell>{p.requires_active_listings ? 'Sim' : 'Não'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* State Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Estado por Seller × Rotina
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statesLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !states || states.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum estado registrado ainda. As rotinas populam automaticamente.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seller</TableHead>
                    <TableHead>Rotina</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Elegível</TableHead>
                    <TableHead>Último Run</TableHead>
                    <TableHead>Próximo Run</TableHead>
                    <TableHead>Cooldown</TableHead>
                    <TableHead>Runs/dia</TableHead>
                    <TableHead>Anúncios</TableHead>
                    <TableHead>Vendas 7d</TableHead>
                    <TableHead>No Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {states.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.seller_id}</TableCell>
                      <TableCell className="font-mono text-sm">{s.routine_key}</TableCell>
                      <TableCell>
                        <Badge className={PRIORITY_COLORS[s.priority_level] || ''} variant="outline">
                          {s.priority_level}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.eligible_to_run ? 'default' : 'destructive'}>
                          {s.eligible_to_run ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.last_run_at ? format(new Date(s.last_run_at), 'dd/MM HH:mm') : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.next_eligible_run_at ? format(new Date(s.next_eligible_run_at), 'dd/MM HH:mm') : '—'}
                      </TableCell>
                      <TableCell>{s.cooldown_minutes_applied}min</TableCell>
                      <TableCell>{s.daily_run_count}</TableCell>
                      <TableCell>{s.active_listings_count}</TableCell>
                      <TableCell>{s.recent_sales_7d}</TableCell>
                      <TableCell>
                        {s.consecutive_no_result > 0 && (
                          <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-200">
                            {s.consecutive_no_result}×
                          </Badge>
                        )}
                        {s.consecutive_no_result === 0 && '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Logs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Últimas Decisões (100)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !recentLogs || recentLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum log registrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>Rotina</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead>Decisão</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Cooldown</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Itens</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLogs.map((log: any) => {
                    const Icon = DECISION_ICONS[log.decision] || Activity;
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(log.created_at), 'dd/MM HH:mm:ss')}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.routine_key}</TableCell>
                        <TableCell className="font-mono text-xs">{log.seller_id}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Icon className="h-3 w-3" />
                            <Badge
                              variant="outline"
                              className={
                                log.decision === 'run' ? 'bg-green-500/10 text-green-700' :
                                log.decision === 'skip' ? 'bg-red-500/10 text-red-700' :
                                'bg-yellow-500/10 text-yellow-700'
                              }
                            >
                              {log.decision}
                            </Badge>
                            {log.is_manual_override && <Badge variant="outline" className="text-xs">manual</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{log.reason}</TableCell>
                        <TableCell>
                          <Badge className={PRIORITY_COLORS[log.priority] || ''} variant="outline">
                            {log.priority || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{log.cooldown_applied}min</TableCell>
                        <TableCell className="text-xs">{log.execution_ms ? `${log.execution_ms}ms` : '—'}</TableCell>
                        <TableCell className="text-xs">{log.items_processed || 0}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
