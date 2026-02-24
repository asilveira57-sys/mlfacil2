import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, subHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ClipboardList, Activity, AlertTriangle, Layers, Clock,
  ChevronDown, ChevronRight, Search, CheckCircle2, XCircle,
} from 'lucide-react';

const PAGE_SIZE = 50;

const PERIOD_OPTIONS = [
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'all', label: 'Todos' },
];

const LEVEL_OPTIONS = [
  { value: 'all', label: 'Todos os níveis' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

const AREA_LABELS: Record<string, string> = {
  global_metrics: 'Métricas Globais',
  mensagem_do_dia: 'Mensagem do Dia',
  onboarding: 'Onboarding',
  operational_quick_sync: 'Sync Operacional',
  retrospectiva: 'Retrospectiva',
  sandbox: 'Sandbox',
  visual_identity: 'Identidade Visual',
};

function getDateFrom(period: string): string | null {
  if (period === 'all') return null;
  const now = new Date();
  if (period === '24h') return subHours(now, 24).toISOString();
  if (period === '7d') return subDays(now, 7).toISOString();
  if (period === '30d') return subDays(now, 30).toISOString();
  return null;
}

function levelBadge(level: string) {
  switch (level) {
    case 'error':
      return <Badge variant="destructive">error</Badge>;
    case 'warn':
      return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">warn</Badge>;
    default:
      return <Badge variant="secondary">info</Badge>;
  }
}

export function AdminAuditLogs() {
  const [page, setPage] = useState(0);
  const [area, setArea] = useState('all');
  const [level, setLevel] = useState('all');
  const [period, setPeriod] = useState('7d');
  const [search, setSearch] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Fetch distinct areas
  const { data: areas } = useQuery({
    queryKey: ['audit-areas'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_logs')
        .select('system_area')
        .order('system_area');
      const unique = [...new Set((data || []).map((r: any) => r.system_area))];
      return unique as string[];
    },
    staleTime: 60_000,
  });

  // Fetch distinct actions for selected area
  const { data: actions } = useQuery({
    queryKey: ['audit-actions', area],
    queryFn: async () => {
      let q = supabase.from('system_logs').select('action');
      if (area !== 'all') q = q.eq('system_area', area);
      const { data } = await q.order('action');
      const unique = [...new Set((data || []).map((r: any) => r.action))];
      return unique as string[];
    },
    staleTime: 60_000,
  });

  const [actionFilter, setActionFilter] = useState('all');

  // KPIs
  const { data: kpis } = useQuery({
    queryKey: ['audit-kpis'],
    queryFn: async () => {
      const now24h = subHours(new Date(), 24).toISOString();

      const [totalRes, last24hRes, areasRes, errorsRes] = await Promise.all([
        supabase.from('system_logs').select('id', { count: 'exact', head: true }),
        supabase.from('system_logs').select('id', { count: 'exact', head: true }).gte('created_at', now24h),
        supabase.from('system_logs').select('system_area'),
        supabase.from('system_logs').select('id', { count: 'exact', head: true }).gte('created_at', now24h).eq('success', false),
      ]);

      const uniqueAreas = new Set((areasRes.data || []).map((r: any) => r.system_area));

      return {
        total: totalRes.count || 0,
        last24h: last24hRes.count || 0,
        activeAreas: uniqueAreas.size,
        recentErrors: errorsRes.count || 0,
      };
    },
    staleTime: 30_000,
  });

  // Main logs query
  const { data: logsResult, isLoading } = useQuery({
    queryKey: ['audit-logs', page, area, level, period, search, actionFilter],
    queryFn: async () => {
      const offset = page * PAGE_SIZE;
      let q = supabase
        .from('system_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (area !== 'all') q = q.eq('system_area', area);
      if (level !== 'all') q = q.eq('level', level);
      if (actionFilter !== 'all') q = q.eq('action', actionFilter);

      const dateFrom = getDateFrom(period);
      if (dateFrom) q = q.gte('created_at', dateFrom);

      if (search.trim()) {
        q = q.or(`message.ilike.%${search.trim()}%,action.ilike.%${search.trim()}%`);
      }

      q = q.range(offset, offset + PAGE_SIZE - 1);

      const { data, count, error } = await q;
      if (error) throw error;
      return { logs: data || [], total: count || 0 };
    },
  });

  const logs = logsResult?.logs || [];
  const totalCount = logsResult?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const resetFilters = () => {
    setArea('all');
    setLevel('all');
    setPeriod('7d');
    setSearch('');
    setActionFilter('all');
    setPage(0);
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ClipboardList className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Logs</p>
              <p className="text-2xl font-bold">{kpis?.total?.toLocaleString('pt-BR') ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Últimas 24h</p>
              <p className="text-2xl font-bold">{kpis?.last24h?.toLocaleString('pt-BR') ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Layers className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Áreas Ativas</p>
              <p className="text-2xl font-bold">{kpis?.activeAreas ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Erros (24h)</p>
              <p className="text-2xl font-bold">{kpis?.recentErrors ?? '—'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-48">
              <label className="text-xs text-muted-foreground mb-1 block">Área</label>
              <Select value={area} onValueChange={(v) => { setArea(v); setActionFilter('all'); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as áreas</SelectItem>
                  {(areas || []).map((a) => (
                    <SelectItem key={a} value={a}>{AREA_LABELS[a] || a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-48">
              <label className="text-xs text-muted-foreground mb-1 block">Ação</label>
              <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  {(actions || []).map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-40">
              <label className="text-xs text-muted-foreground mb-1 block">Nível</label>
              <Select value={level} onValueChange={(v) => { setLevel(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-40">
              <label className="text-xs text-muted-foreground mb-1 block">Período</label>
              <Select value={period} onValueChange={(v) => { setPeriod(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground mb-1 block">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar em mensagem ou ação..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  className="pl-9"
                />
              </div>
            </div>

            <Button variant="ghost" size="sm" onClick={resetFilters}>Limpar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-40">Data/Hora</TableHead>
                  <TableHead className="w-36">Área</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead className="w-20">Nível</TableHead>
                  <TableHead className="w-20 text-center">Status</TableHead>
                  <TableHead>Mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      Carregando logs...
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      Nenhum log encontrado com os filtros atuais.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log: any) => {
                    const isExpanded = expandedRow === log.id;
                    const hasMeta = log.meta_json && Object.keys(log.meta_json).length > 0;
                    const isFail = log.success === false;

                    return (
                      <Collapsible key={log.id} open={isExpanded} onOpenChange={() => setExpandedRow(isExpanded ? null : log.id)} asChild>
                        <>
                          <CollapsibleTrigger asChild>
                            <TableRow
                              className={`cursor-pointer ${isFail ? 'bg-destructive/5 hover:bg-destructive/10' : ''}`}
                            >
                              <TableCell className="px-2">
                                {hasMeta && (
                                  isExpanded
                                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                                {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs font-normal">
                                  {AREA_LABELS[log.system_area] || log.system_area}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm font-mono">{log.action}</TableCell>
                              <TableCell>{levelBadge(log.level)}</TableCell>
                              <TableCell className="text-center">
                                {log.success === true && <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />}
                                {log.success === false && <XCircle className="h-4 w-4 text-destructive mx-auto" />}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                                {log.message || '—'}
                              </TableCell>
                            </TableRow>
                          </CollapsibleTrigger>
                          {hasMeta && (
                            <CollapsibleContent asChild>
                              <tr>
                                <td colSpan={7} className="bg-muted/30 px-6 py-4">
                                  <div className="text-xs text-muted-foreground mb-1 font-medium">meta_json:</div>
                                  <pre className="text-xs font-mono bg-background rounded-md p-3 overflow-x-auto max-h-64 border">
                                    {JSON.stringify(log.meta_json, null, 2)}
                                  </pre>
                                </td>
                              </tr>
                            </CollapsibleContent>
                          )}
                        </>
                      </Collapsible>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                {totalCount.toLocaleString('pt-BR')} registros • Página {page + 1} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  Próximo
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
