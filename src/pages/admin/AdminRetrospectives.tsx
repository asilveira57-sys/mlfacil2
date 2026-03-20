import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  History, RefreshCw, Trash2, Loader2, Search, FileText,
  Presentation, ExternalLink, Eye, Play, BarChart3, Zap,
  AlertCircle, CheckCircle2, Clock, Filter, Download, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useRetrospectiveRules,
  useTriggerRetrospectiveEngine,
  useDeleteRetrospectiveNew,
  useGenerateRetrospectiveReports,
  type Retrospective,
  type RetrospectiveTarget,
  type RetrospectiveSnapshot,
} from '@/hooks/useRetrospectiveEngine';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { generateRetrospectivePdfFromEngine } from '@/components/retrospective/RetrospectiveEnginePdfExporter';

// ─── Helpers ───

function fmt(val: number | null | undefined, decimals = 2): string {
  return Number(val ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  generated: { label: 'Gerado', variant: 'default' },
  sent: { label: 'Enviado', variant: 'secondary' },
  pending: { label: 'Pendente', variant: 'outline' },
  processing: { label: 'Processando', variant: 'outline' },
  error: { label: 'Erro', variant: 'destructive' },
  skipped: { label: 'Ignorado', variant: 'outline' },
};

const TYPE_LABELS: Record<string, string> = {
  trial_conversion: 'Trial → Conversão',
  trial_summary: 'Trial → Resumo',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  annual: 'Anual',
  semester: 'Semestral',
};

// ─── Extended type with company_name ───

interface RetrospectiveWithCompany extends Retrospective {
  company_name?: string | null;
  company_logo_url?: string | null;
}

// ─── Admin hook: list ALL retrospectives with company name ───

function useAllRetrospectives() {
  return useQuery({
    queryKey: ['admin-retrospectives-with-companies'],
    queryFn: async () => {
      const { data: retros, error } = await supabase
        .from('retrospectives')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      // Get unique company_ids and tenant_ids
      const companyIds = [...new Set(
        (retros ?? []).map(r => r.company_id).filter(Boolean)
      )] as string[];
      const tenantIds = [...new Set(
        (retros ?? []).map(r => r.tenant_id).filter(Boolean)
      )] as string[];

      // Fetch company names + logos
      let companyMap: Record<string, { name: string; logo: string | null }> = {};
      if (companyIds.length > 0) {
        const { data: companies } = await supabase
          .from('companies')
          .select('id, display_name, logo_url')
          .in('id', companyIds);
        for (const c of (companies || []) as any[]) {
          if (c.display_name) companyMap[c.id] = { name: c.display_name, logo: c.logo_url || null };
        }
      }

      // Fallback: fetch tenant owner profiles for companies without names
      let tenantOwnerMap: Record<string, string> = {};
      if (tenantIds.length > 0) {
        const { data: tenants } = await supabase
          .from('tenants')
          .select('id, name, owner_user_id')
          .in('id', tenantIds);
        
        const ownerIds = [...new Set((tenants || []).map((t: any) => t.owner_user_id).filter(Boolean))];
        let profileMap: Record<string, string> = {};
        if (ownerIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', ownerIds);
          for (const p of (profiles || []) as any[]) {
            profileMap[p.id] = p.full_name || p.email || '';
          }
        }

        for (const t of (tenants || []) as any[]) {
          tenantOwnerMap[t.id] = t.name || profileMap[t.owner_user_id] || '';
        }
      }

      return (retros ?? []).map(r => {
        const companyInfo = r.company_id ? companyMap[r.company_id] : null;
        const clientName = companyInfo?.name
          || (r.tenant_id ? tenantOwnerMap[r.tenant_id] : null)
          || null;
        return {
          ...r,
          company_name: clientName,
          company_logo_url: companyInfo?.logo || null,
        };
      }) as RetrospectiveWithCompany[];
    },
  });
}

// ─── Resolve names for targets ───

function useTargetsWithNames() {
  return useQuery({
    queryKey: ['admin-retrospective-targets-named'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retrospective_targets')
        .select('*')
        .order('due_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      const targets = (data ?? []) as RetrospectiveTarget[];

      // Resolve tenant and company names
      const tenantIds = [...new Set(targets.map(t => t.tenant_id).filter(Boolean))] as string[];
      const companyIds = [...new Set(targets.map(t => t.company_id).filter(Boolean))] as string[];

      let tenantMap: Record<string, string> = {};
      if (tenantIds.length > 0) {
        const { data: tenants } = await supabase.from('tenants').select('id, name, owner_user_id').in('id', tenantIds);
        const ownerIds = [...new Set((tenants || []).map((t: any) => t.owner_user_id).filter(Boolean))];
        let profileMap: Record<string, string> = {};
        if (ownerIds.length > 0) {
          const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', ownerIds);
          for (const p of (profiles || []) as any[]) {
            profileMap[p.id] = p.full_name || p.email || '';
          }
        }
        for (const t of (tenants || []) as any[]) {
          tenantMap[t.id] = t.name || profileMap[t.owner_user_id] || t.id.slice(0, 8) + '…';
        }
      }

      let companyMap: Record<string, string> = {};
      if (companyIds.length > 0) {
        const { data: companies } = await supabase.from('companies').select('id, display_name').in('id', companyIds);
        for (const c of (companies || []) as any[]) {
          if (c.display_name) companyMap[c.id] = c.display_name;
        }
      }

      return targets.map(t => ({
        ...t,
        _tenantName: t.tenant_id ? (tenantMap[t.tenant_id] || t.tenant_id.slice(0, 8) + '…') : '—',
        _companyName: t.company_id ? (companyMap[t.company_id] || t.company_id.slice(0, 8) + '…') : '—',
      }));
    },
  });
}

function useAllSnapshots() {
  return useQuery({
    queryKey: ['admin-retrospective-snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retrospective_snapshots')
        .select('*')
        .order('snapshot_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as RetrospectiveSnapshot[];
    },
  });
}

// ─── Main Component ───

export function AdminRetrospectives() {
  const { data: retrospectives = [], isLoading } = useAllRetrospectives();
  const { data: rules = [] } = useRetrospectiveRules();
  const { data: targets = [] } = useTargetsWithNames();
  const { data: snapshots = [] } = useAllSnapshots();
  const triggerEngine = useTriggerRetrospectiveEngine();
  const deleteMut = useDeleteRetrospectiveNew();
  const generateReports = useGenerateRetrospectiveReports();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'retrospectives' | 'rules' | 'targets' | 'snapshots'>('retrospectives');
  const [selectedRetro, setSelectedRetro] = useState<RetrospectiveWithCompany | null>(null);
  const [retroPage, setRetroPage] = useState(0);
  const [targetPage, setTargetPage] = useState(0);
  const PAGE_SIZE = 20;

  // Stats
  const stats = useMemo(() => {
    const total = retrospectives.length;
    const generated = retrospectives.filter(r => r.status === 'generated').length;
    const sent = retrospectives.filter(r => r.status === 'sent').length;
    const errors = retrospectives.filter(r => r.status === 'error').length;
    const pendingTargets = targets.filter(t => t.status === 'pending').length;
    return { total, generated, sent, errors, pendingTargets };
  }, [retrospectives, targets]);

  // Filtered retrospectives — includes company_name in search
  const filtered = useMemo(() => {
    return retrospectives.filter(r => {
      if (filterType !== 'all' && r.retrospective_type !== filterType) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.title?.toLowerCase().includes(q) ||
          r.company_name?.toLowerCase().includes(q) ||
          r.tenant_id?.toLowerCase().includes(q) ||
          r.company_id?.toLowerCase().includes(q) ||
          r.retrospective_type?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [retrospectives, search, filterType, filterStatus]);

  const handleTriggerEngine = async (mode: 'auto' | 'manual' | 'force') => {
    try {
      const result = await triggerEngine.mutateAsync({ mode });
      toast.success(`Motor executado: ${result?.generated ?? 0} geradas, ${result?.skipped ?? 0} ignoradas, ${result?.errors ?? 0} erros`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao executar motor');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta retrospectiva?')) return;
    try {
      await deleteMut.mutateAsync(id);
      toast.success('Retrospectiva excluída');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRegenerateReports = async (id: string) => {
    try {
      await generateReports.mutateAsync(id);
      toast.success('Relatórios regenerados com sucesso');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao regenerar');
    }
  };

  const handleRegenerateComplete = async (r: RetrospectiveWithCompany) => {
    if (!confirm('Criar nova versão com dados atualizados?')) return;
    try {
      await triggerEngine.mutateAsync({
        mode: 'force',
        tenant_id: r.tenant_id,
        company_id: r.company_id || undefined,
      });
      toast.success('Nova versão gerada com dados completos');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao regenerar');
    }
  };

  const handleDownloadPdf = (r: RetrospectiveWithCompany) => {
    try {
      generateRetrospectivePdfFromEngine(r, r.company_name || undefined);
      toast.success('PDF gerado com sucesso');
    } catch (err: any) {
      toast.error('Erro ao gerar PDF');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Motor de Retrospectivas
          </h2>
          <p className="text-sm text-muted-foreground">
            Gestão de retrospectivas automáticas e manuais
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => handleTriggerEngine('auto')}
            disabled={triggerEngine.isPending}
          >
            {triggerEngine.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Executar Auto
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => handleTriggerEngine('force')}
            disabled={triggerEngine.isPending}
          >
            {triggerEngine.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Forçar Geração
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total" value={stats.total} icon={BarChart3} />
        <StatCard label="Geradas" value={stats.generated} icon={CheckCircle2} color="text-primary" />
        <StatCard label="Enviadas" value={stats.sent} icon={FileText} color="text-muted-foreground" />
        <StatCard label="Erros" value={stats.errors} icon={AlertCircle} color="text-destructive" />
        <StatCard label="Fila Pendente" value={stats.pendingTargets} icon={Clock} color="text-muted-foreground" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {([
          { id: 'retrospectives', label: 'Retrospectivas', count: retrospectives.length },
          { id: 'rules', label: 'Regras', count: rules.length },
          { id: 'targets', label: 'Fila', count: targets.length },
          { id: 'snapshots', label: 'Snapshots', count: snapshots.length },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label} <Badge variant="outline" className="ml-1 text-xs">{tab.count}</Badge>
          </button>
        ))}
      </div>

      {/* Retrospectives Tab */}
      {activeTab === 'retrospectives' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, cliente, empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="trial_conversion">Trial Conversão</SelectItem>
                <SelectItem value="trial_summary">Trial Resumo</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
                <SelectItem value="quarterly">Trimestral</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="generated">Gerado</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Nenhuma retrospectiva encontrada</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Relatórios</TableHead>
                      <TableHead>Criado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const st = STATUS_MAP[r.status] || { label: r.status, variant: 'outline' as const };
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium text-sm max-w-[140px] truncate">
                                {r.company_name || '—'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium max-w-[180px] truncate">
                            {r.title}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {TYPE_LABELS[r.retrospective_type] || r.retrospective_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {r.period_start} → {r.period_end}
                          </TableCell>
                          <TableCell>
                            <Badge variant={st.variant} className="text-xs">
                              {st.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {r.html_url && (
                                <a href={r.html_url} target="_blank" rel="noopener noreferrer"
                                  className="text-primary hover:underline text-xs flex items-center gap-0.5">
                                  <FileText className="h-3 w-3" /> HTML
                                </a>
                              )}
                              {r.presentation_url && (
                                <a href={r.presentation_url} target="_blank" rel="noopener noreferrer"
                                  className="text-primary hover:underline text-xs flex items-center gap-0.5 ml-2">
                                  <Presentation className="h-3 w-3" /> Slides
                                </a>
                              )}
                              {!r.html_url && !r.presentation_url && (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(r.created_at), 'dd/MM/yy HH:mm')}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setSelectedRetro(r)} title="Visualizar">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => handleDownloadPdf(r)} title="Download PDF">
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => handleRegenerateReports(r.id)}
                                disabled={generateReports.isPending}
                                title="Regenerar relatórios (HTML/Slides)">
                                <RefreshCw className={`h-3.5 w-3.5 ${generateReports.isPending ? 'animate-spin' : ''}`} />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-primary"
                                onClick={() => handleRegenerateComplete(r)}
                                disabled={triggerEngine.isPending}
                                title="Regenerar Completo (nova versão com dados atualizados)">
                                <Zap className={`h-3.5 w-3.5 ${triggerEngine.isPending ? 'animate-spin' : ''}`} />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                onClick={() => handleDelete(r.id)}
                                disabled={deleteMut.isPending}
                                title="Excluir">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          )}
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Regras de Geração</CardTitle>
            <CardDescription>Configurações que definem quando e como as retrospectivas são criadas</CardDescription>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma regra cadastrada</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Dias</TableHead>
                    <TableHead>Escopo</TableHead>
                    <TableHead>Auto Gerar</TableHead>
                    <TableHead>Auto Enviar</TableHead>
                    <TableHead>Ativa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABELS[rule.retrospective_type] || rule.retrospective_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{rule.period_days}d</TableCell>
                      <TableCell className="text-xs">{rule.applies_to_scope}</TableCell>
                      <TableCell>
                        <Badge variant={rule.auto_generate ? 'default' : 'outline'} className="text-xs">
                          {rule.auto_generate ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={rule.auto_send ? 'default' : 'outline'} className="text-xs">
                          {rule.auto_send ? 'Sim' : 'Não'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={rule.is_active ? 'default' : 'destructive'} className="text-xs">
                          {rule.is_active ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Targets Tab */}
      {activeTab === 'targets' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fila de Processamento</CardTitle>
            <CardDescription>Retrospectivas agendadas aguardando geração</CardDescription>
          </CardHeader>
          <CardContent>
            {targets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum alvo na fila</p>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Escopo</TableHead>
                      <TableHead>Âncora</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Atualizado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {targets.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs font-mono truncate max-w-[120px]">{t.tenant_id.slice(0, 8)}…</TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[120px]">{t.company_id?.slice(0, 8) ?? '—'}…</TableCell>
                        <TableCell className="text-xs">{t.target_scope}</TableCell>
                        <TableCell className="text-xs">{t.anchor_date}</TableCell>
                        <TableCell className="text-xs">{t.due_date}</TableCell>
                        <TableCell>
                          <Badge variant={(STATUS_MAP[t.status]?.variant || 'outline') as any} className="text-xs">
                            {STATUS_MAP[t.status]?.label || t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(t.updated_at), 'dd/MM HH:mm')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* Snapshots Tab */}
      {activeTab === 'snapshots' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Snapshots de Performance</CardTitle>
            <CardDescription>Capturas de métricas utilizadas na geração das retrospectivas</CardDescription>
          </CardHeader>
          <CardContent>
            {snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum snapshot registrado</p>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Pedidos</TableHead>
                      <TableHead>Receita</TableHead>
                      <TableHead>Lucro</TableHead>
                      <TableHead>Margem</TableHead>
                      <TableHead>ADS</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshots.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{s.snapshot_type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {s.period_start} → {s.period_end}
                        </TableCell>
                        <TableCell className="text-xs">{s.orders_count ?? '—'}</TableCell>
                        <TableCell className="text-xs">R$ {fmt(s.revenue_total)}</TableCell>
                        <TableCell className="text-xs">R$ {fmt(s.estimated_profit)}</TableCell>
                        <TableCell className="text-xs">{s.average_margin != null ? `${fmt(s.average_margin, 1)}%` : '—'}</TableCell>
                        <TableCell className="text-xs">R$ {fmt(s.ads_spend)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.snapshot_date}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      {selectedRetro && (
        <RetroDetailDialog
          retro={selectedRetro}
          open={!!selectedRetro}
          onOpenChange={(open) => !open && setSelectedRetro(null)}
          onDownloadPdf={() => handleDownloadPdf(selectedRetro)}
        />
      )}
    </div>
  );
}

// ─── Stat Card ───

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-5 w-5 ${color || 'text-muted-foreground'}`} />
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Detail Dialog ───

function RetroDetailDialog({ retro, open, onOpenChange, onDownloadPdf }: {
  retro: RetrospectiveWithCompany;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownloadPdf: () => void;
}) {
  const summary = retro.summary_json as any;
  const current = summary?.current || {};
  const baseline = summary?.baseline;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-lg">{retro.title}</DialogTitle>
          <DialogDescription>
            {retro.company_name && <span className="font-medium text-foreground">{retro.company_name} • </span>}
            {retro.period_start} — {retro.period_end} • {TYPE_LABELS[retro.retrospective_type] || retro.retrospective_type}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4">
            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Status</p>
                <Badge variant={(STATUS_MAP[retro.status]?.variant || 'outline') as any}>
                  {STATUS_MAP[retro.status]?.label || retro.status}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Gerado em</p>
                <p>{retro.generated_at ? format(new Date(retro.generated_at), 'dd/MM/yyyy HH:mm') : '—'}</p>
              </div>
              {retro.company_name && (
                <div>
                  <p className="text-muted-foreground">Cliente</p>
                  <p className="font-medium flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> {retro.company_name}
                  </p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Data de Entrada</p>
                <p>{format(new Date(retro.created_at), 'dd/MM/yyyy HH:mm')}</p>
              </div>
            </div>

            {/* Baseline */}
            {baseline && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <h4 className="font-medium mb-2 text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                  📌 Cenário de Entrada (30d anteriores)
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Faturamento</p>
                    <p className="font-bold">R$ {fmt(baseline.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pedidos</p>
                    <p className="font-bold">{baseline.orders ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ticket Médio</p>
                    <p className="font-bold">R$ {fmt(baseline.ticket)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* KPIs */}
            {current && Object.keys(current).length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Métricas do Período</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Faturamento</p>
                    <p className="text-lg font-bold text-primary">R$ {fmt(current.revenue)}</p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Pedidos</p>
                    <p className="text-lg font-bold">{current.orders ?? 0}</p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Lucro</p>
                    <p className="text-lg font-bold text-primary">R$ {fmt(current.profit)}</p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Margem</p>
                    <p className="text-lg font-bold">{fmt(current.margin, 1)}%</p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Ticket Médio</p>
                    <p className="text-lg font-bold">R$ {fmt(current.ticket)}</p>
                  </div>
                  <div className="border rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">ADS</p>
                    <p className="text-lg font-bold">R$ {fmt(current.ads_spend)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Report Links */}
            <div>
              <h4 className="font-medium mb-2">Relatórios</h4>
              <div className="flex gap-2 flex-wrap">
                {retro.html_url && (
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <a href={retro.html_url} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-3.5 w-3.5" /> HTML <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
                {retro.presentation_url && (
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <a href={retro.presentation_url} target="_blank" rel="noopener noreferrer">
                      <Presentation className="h-3.5 w-3.5" /> Slides <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5" onClick={onDownloadPdf}>
                  <Download className="h-3.5 w-3.5" /> PDF
                </Button>
              </div>
            </div>

            {/* Raw JSON */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Ver JSON completo
              </summary>
              <pre className="mt-2 p-3 bg-muted/50 rounded-lg overflow-x-auto text-[10px] max-h-[300px]">
                {JSON.stringify(summary, null, 2)}
              </pre>
            </details>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
