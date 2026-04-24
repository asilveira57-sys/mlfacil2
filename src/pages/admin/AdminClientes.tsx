import { useState, useMemo, useCallback } from 'react';
import { useAdminClients, useDeleteClient, type AdminClient } from '@/hooks/useAdminClients';
import { supabase } from '@/integrations/supabase/client';
import { useAdminTrialManagement, useUserAuthStatus, useSendAuthEmail, useGenerateAuthLink } from '@/hooks/useAdmin';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search, MoreHorizontal, Eye, CalendarPlus, RotateCcw, Ban, CheckCircle, Trash2, RefreshCw,
  Building2, Store, Mail, Phone, CreditCard, Calendar, Shield, ChevronDown, ChevronRight, Clock, Send, Link2,
  ArrowUpDown, ArrowUp, ArrowDown, Replace, KeyRound, MailCheck, MailWarning, Loader2, AlertCircle,
  Wallet, Repeat,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

function statusBadge(trialStatus: string | null, paymentStatus: string | null): React.ReactNode {
  if (paymentStatus === 'active') return <Badge className="bg-green-600 text-white">Ativo</Badge>;
  if (trialStatus === 'active') return <Badge variant="secondary">Trial</Badge>;
  if (trialStatus === 'expired') return <Badge variant="destructive">Expirado</Badge>;
  if (paymentStatus === 'blocked') return <Badge variant="destructive">Bloqueado</Badge>;
  return <Badge variant="outline">Pendente</Badge>;
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return format(new Date(d), 'dd/MM/yyyy');
}

function formatDateTime(d: string | null) {
  if (!d) return '—';
  return format(new Date(d), 'dd/MM/yyyy HH:mm');
}

function daysRemaining(trialEnd: string | null) {
  if (!trialEnd) return null;
  const diff = Math.ceil((new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function AdminClientes() {
  const { data: clients, isLoading, refetch } = useAdminClients();
  const deleteClient = useDeleteClient();
  const { adjustTrial, resetTrial, setTrialEndDate, setBlocked, resetOnboarding, changeUserPlan, setEntitlementPeriod } = useAdminTrialManagement();

  const PLAN_TIERS = [
    { id: 'a0000000-0000-0000-0000-000000000001', name: 'ZPL Básico' },
    { id: '26cf9f33-4e95-400b-a335-9b4d4b70f58a', name: 'Até 50 pedidos/mês' },
    { id: 'd4fabfc5-99fe-4b5b-8459-0529ef93baf4', name: '51 a 300 pedidos/mês' },
    { id: 'b7ffb1c9-223d-4a30-a7ca-68375982c17e', name: '301 a 700 pedidos/mês' },
    { id: '85944f40-8c37-43c0-9609-df96742537ad', name: '701 a 1.500 pedidos/mês' },
    { id: 'feab130a-f002-43ba-82a1-79c6371bbfea', name: '1.501 a 3.000 pedidos/mês' },
    { id: '8243db6b-7498-4056-a9e4-53dfdeae8d0a', name: 'Acima de 3.000 pedidos/mês' },
    { id: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890', name: '🏅 Veterano (ilimitado)' },
  ];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;
  const [selectedClient, setSelectedClient] = useState<AdminClient | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [clientToDelete, setClientToDelete] = useState<AdminClient | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Sorting
  type SortKey = 'full_name' | 'company_name' | 'status' | 'trial' | 'profile_created_at' | 'last_access' | 'tag';
  type SortDir = 'asc' | 'desc';
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === 'desc') setSortDir('asc');
      else { setSortKey(null); setSortDir('desc'); }
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setCurrentPage(1);
  }, [sortKey, sortDir]);

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === 'desc' ? <ArrowDown className="h-3 w-3 ml-1" /> : <ArrowUp className="h-3 w-3 ml-1" />;
  };

  // Trial adjustment dialog
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialMode, setTrialMode] = useState<'days' | 'date'>('days');
  const [trialDays, setTrialDays] = useState('7');
  const [trialEndDateInput, setTrialEndDateInput] = useState('');
  const [trialClient, setTrialClient] = useState<AdminClient | null>(null);

  // Plan change dialog
  const [planOpen, setPlanOpen] = useState(false);
  const [planClient, setPlanClient] = useState<AdminClient | null>(null);
  const [selectedTierId, setSelectedTierId] = useState('');

  // Entitlement (paid period) edit dialog
  const [entOpen, setEntOpen] = useState(false);
  const [entClient, setEntClient] = useState<AdminClient | null>(null);
  const [entEndDate, setEntEndDate] = useState('');
  const [entAutoRenew, setEntAutoRenew] = useState(true);
  const [entStatus, setEntStatus] = useState<'active' | 'expired' | 'cancelled' | 'paused'>('active');

  const filtered = useMemo(() => {
    if (!clients) return [];
    let result = clients.filter((c) => {
      const matchesSearch =
        !search ||
        c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.company_name?.toLowerCase().includes(search.toLowerCase());

      let matchesStatus = true;
      if (statusFilter === 'trial') matchesStatus = c.trial_status === 'active';
      else if (statusFilter === 'active') matchesStatus = c.payment_status === 'active';
      else if (statusFilter === 'expired') matchesStatus = c.trial_status === 'expired';
      else if (statusFilter === 'blocked') matchesStatus = c.payment_status === 'blocked';

      return matchesSearch && matchesStatus;
    });

    if (sortKey) {
      result = [...result].sort((a, b) => {
        let aVal: string | number | null = null;
        let bVal: string | number | null = null;

        switch (sortKey) {
          case 'full_name':
            aVal = (a.full_name || '').toLowerCase();
            bVal = (b.full_name || '').toLowerCase();
            break;
          case 'company_name':
            aVal = (a.company_name || '').toLowerCase();
            bVal = (b.company_name || '').toLowerCase();
            break;
          case 'status': {
            const statusOrder = (c: AdminClient) => {
              if (c.payment_status === 'active') return 4;
              if (c.trial_status === 'active') return 3;
              if (c.trial_status === 'expired') return 1;
              if (c.payment_status === 'blocked') return 0;
              return 2;
            };
            aVal = statusOrder(a);
            bVal = statusOrder(b);
            break;
          }
          case 'trial':
            aVal = a.trial_end_at ? new Date(a.trial_end_at).getTime() : 0;
            bVal = b.trial_end_at ? new Date(b.trial_end_at).getTime() : 0;
            break;
          case 'profile_created_at':
            aVal = new Date(a.profile_created_at).getTime();
            bVal = new Date(b.profile_created_at).getTime();
            break;
          case 'last_access': {
            const aDate = a.last_activity_at || a.last_sign_in_at;
            const bDate = b.last_activity_at || b.last_sign_in_at;
            aVal = aDate ? new Date(aDate).getTime() : 0;
            bVal = bDate ? new Date(bDate).getTime() : 0;
            break;
          }
          case 'tag':
            aVal = (a.tag || '').toLowerCase();
            bVal = (b.tag || '').toLowerCase();
            break;
        }

        if (aVal === null || bVal === null) return 0;
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [clients, search, statusFilter, sortKey, sortDir]);

  // Reset page when filters change
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedClients = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  // Reset to page 1 when filters change
  const handleSearchChange = (val: string) => { setSearch(val); setCurrentPage(1); };
  const handleStatusChange = (val: string) => { setStatusFilter(val); setCurrentPage(1); };

  const handleDelete = () => {
    if (!clientToDelete) return;
    deleteClient.mutate(clientToDelete.user_id, {
      onSuccess: () => {
        setDeleteOpen(false);
        setClientToDelete(null);
        setDeleteConfirmEmail('');
      },
    });
  };

  const handleAdjustTrial = () => {
    if (!trialClient) return;
    if (trialMode === 'date') {
      if (!trialEndDateInput) {
        toast.error('Selecione uma data');
        return;
      }
      setTrialEndDate.mutate(
        { userId: trialClient.user_id, newEndDate: new Date(trialEndDateInput + 'T23:59:59').toISOString(), reason: 'Data definida via Admin Clientes' },
        {
          onSuccess: () => {
            setTrialOpen(false);
            setTrialClient(null);
            refetch();
          },
        }
      );
    } else {
      const days = parseInt(trialDays);
      if (isNaN(days)) {
        toast.error('Informe um número válido de dias');
        return;
      }
      adjustTrial.mutate(
        { userId: trialClient.user_id, daysAdjustment: days, reason: 'Ajuste manual via Admin Clientes' },
        {
          onSuccess: () => {
            setTrialOpen(false);
            setTrialClient(null);
            refetch();
          },
        }
      );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Clientes</h2>
          <p className="text-sm text-muted-foreground">{clients?.length || 0} clientes cadastrados</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou empresa..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
            <SelectItem value="blocked">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none hover:bg-muted/80" onClick={() => handleSort('full_name')}>
                <div className="flex items-center">Cliente <SortIcon columnKey="full_name" /></div>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/80" onClick={() => handleSort('company_name')}>
                <div className="flex items-center">Empresa <SortIcon columnKey="company_name" /></div>
              </TableHead>
              <TableHead>Contas ML</TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/80" onClick={() => handleSort('status')}>
                <div className="flex items-center">Status <SortIcon columnKey="status" /></div>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/80" onClick={() => handleSort('trial')}>
                <div className="flex items-center">Trial <SortIcon columnKey="trial" /></div>
              </TableHead>
              <TableHead>
                <div className="flex items-center">Plano Pago</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/80" onClick={() => handleSort('profile_created_at')}>
                <div className="flex items-center">Cadastro <SortIcon columnKey="profile_created_at" /></div>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/80" onClick={() => handleSort('last_access')}>
                <div className="flex items-center">Último Acesso <SortIcon columnKey="last_access" /></div>
              </TableHead>
              <TableHead className="cursor-pointer select-none hover:bg-muted/80" onClick={() => handleSort('tag')}>
                <div className="flex items-center">Tag <SortIcon columnKey="tag" /></div>
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              paginatedClients.map((client) => {
                const days = daysRemaining(client.trial_end_at);
                const isExpanded = expandedRows.has(client.user_id);
                const hasMultipleAccounts = client.ml_accounts.length > 1;
                const lastAccess = client.last_activity_at || client.last_sign_in_at;

                const toggleExpand = () => {
                  setExpandedRows(prev => {
                    const next = new Set(prev);
                    if (next.has(client.user_id)) next.delete(client.user_id);
                    else next.add(client.user_id);
                    return next;
                  });
                };

                return (
                  <>
                    <TableRow key={client.user_id} className={hasMultipleAccounts ? 'cursor-pointer' : ''} onClick={hasMultipleAccounts ? toggleExpand : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {hasMultipleAccounts && (
                            isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <div>
                            <p className="font-medium text-foreground">{client.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{client.email || '—'}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{client.company_name || <span className="text-muted-foreground">Sem empresa</span>}</p>
                        {client.company_document && (
                          <p className="text-xs text-muted-foreground">{client.company_document}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        {client.ml_accounts.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Nenhuma</span>
                        ) : (
                          <div className="space-y-0.5">
                            {client.ml_accounts.map((acc) => (
                              <div key={acc.id} className="flex items-center gap-1">
                                <div
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    acc.connection_status === 'connected'
                                      ? 'bg-green-500'
                                      : acc.connection_status === 'attention'
                                      ? 'bg-yellow-500'
                                      : 'bg-red-500'
                                  }`}
                                />
                                <span className="text-xs">{acc.nickname || acc.ml_user_id}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(client.trial_status, client.payment_status)}</TableCell>
                      <TableCell>
                        {client.trial_end_at ? (
                          <div>
                            <p className="text-xs">{formatDate(client.trial_end_at)}</p>
                            {days !== null && (
                              <p className={`text-xs font-medium ${days <= 3 ? 'text-destructive' : days <= 7 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                                {days > 0 ? `${days}d restantes` : 'Expirado'}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {client.entitlement_id ? (
                          <div className="space-y-0.5">
                            <p className="text-xs font-medium">
                              {client.entitlement_period_end ? formatDate(client.entitlement_period_end) : '—'}
                            </p>
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge
                                variant={client.entitlement_status === 'active' ? 'default' : 'secondary'}
                                className="text-[10px] px-1 py-0 h-4"
                              >
                                {client.entitlement_status || '—'}
                              </Badge>
                              {client.entitlement_auto_renew ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                  <Repeat className="h-2.5 w-2.5" /> auto
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">manual</span>
                              )}
                            </div>
                            {client.entitlement_tier_name && (
                              <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                {client.entitlement_tier_name}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{formatDate(client.profile_created_at)}</span>
                      </TableCell>
                      <TableCell>
                        {lastAccess ? (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{formatDateTime(lastAccess)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {client.tag ? (
                          <Badge variant="secondary" className="text-xs">{client.tag}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setSelectedClient(client); setDetailsOpen(true); }}>
                              <Eye className="h-4 w-4 mr-2" /> Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <ClientAuthEmailActions client={client} />
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => {
                              setTrialClient(client);
                              setTrialDays('7');
                              setTrialMode('days');
                              setTrialEndDateInput(client.trial_end_at ? format(new Date(client.trial_end_at), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
                              setTrialOpen(true);
                            }}>
                              <CalendarPlus className="h-4 w-4 mr-2" /> Ajustar trial
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => resetTrial.mutate({ userId: client.user_id, reason: 'Reset via Admin Clientes' }, { onSuccess: () => refetch() })}>
                              <RotateCcw className="h-4 w-4 mr-2" /> Resetar trial
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => resetOnboarding.mutate({ userId: client.user_id }, { onSuccess: () => refetch() })}>
                              <RefreshCw className="h-4 w-4 mr-2" /> Resetar Onboarding
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setPlanClient(client); setSelectedTierId(''); setPlanOpen(true); }}>
                              <Replace className="h-4 w-4 mr-2" /> Alterar Plano
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {client.payment_status === 'blocked' ? (
                              <DropdownMenuItem onClick={() => setBlocked.mutate({ userId: client.user_id, blocked: false, reason: 'Desbloqueio via Admin Clientes' }, { onSuccess: () => refetch() })}>
                                <CheckCircle className="h-4 w-4 mr-2" /> Desbloquear
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setBlocked.mutate({ userId: client.user_id, blocked: true, reason: 'Bloqueio via Admin Clientes' }, { onSuccess: () => refetch() })}>
                                <Ban className="h-4 w-4 mr-2" /> Bloquear
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => { setClientToDelete(client); setDeleteConfirmEmail(''); setDeleteOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Excluir cliente
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    {/* Expanded sub-rows for ML accounts */}
                    {isExpanded && client.ml_accounts.map((acc) => (
                      <TableRow key={`${client.user_id}-${acc.id}`} className="bg-muted/30">
                        <TableCell className="pl-12">
                          <div className="flex items-center gap-2">
                            <Store className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{acc.nickname || acc.ml_user_id}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">ID: {acc.ml_user_id}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <div className={`h-1.5 w-1.5 rounded-full ${
                              acc.connection_status === 'connected' ? 'bg-green-500'
                              : acc.connection_status === 'attention' ? 'bg-yellow-500'
                              : 'bg-red-500'
                            }`} />
                            <span className="text-xs">{acc.connection_status || 'unknown'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={acc.is_active ? 'default' : 'secondary'} className="text-xs">
                            {acc.is_active ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </TableCell>
                        <TableCell />
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {acc.created_at ? formatDate(acc.created_at) : '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {acc.last_activity_at ? (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{formatDateTime(acc.last_activity_at)}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    ))}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Mostrando {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length} clientes
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              Anterior
            </Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let page: number;
              if (totalPages <= 7) {
                page = i + 1;
              } else if (currentPage <= 4) {
                page = i + 1;
              } else if (currentPage >= totalPages - 3) {
                page = totalPages - 6 + i;
              } else {
                page = currentPage - 3 + i;
              }
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  className="min-w-[36px]"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Próximo
            </Button>
          </div>
        </div>
      )}


      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Cliente</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-4">
              {/* Personal */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2"><Mail className="h-4 w-4" /> Dados Pessoais</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Nome:</span> {selectedClient.full_name || '—'}</div>
                  <div><span className="text-muted-foreground">Email:</span> {selectedClient.email || '—'}</div>
                  <div><span className="text-muted-foreground">WhatsApp:</span> {selectedClient.whatsapp || '—'}</div>
                  <div><span className="text-muted-foreground">CPF:</span> {selectedClient.cpf || '—'}</div>
                </div>
              </div>

              {/* Company */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> Empresa</h4>
                {selectedClient.company_name ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Nome:</span> {selectedClient.company_name}</div>
                    <div><span className="text-muted-foreground">CNPJ/CPF:</span> {selectedClient.company_document || '—'}</div>
                    <div><span className="text-muted-foreground">Cidade:</span> {selectedClient.company_city || '—'}</div>
                    <div><span className="text-muted-foreground">UF:</span> {selectedClient.company_state || '—'}</div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada</p>
                )}
              </div>

              {/* ML Accounts */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2"><Store className="h-4 w-4" /> Contas Mercado Livre</h4>
                {selectedClient.ml_accounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma conta vinculada</p>
                ) : (
                  <div className="space-y-1">
                    {selectedClient.ml_accounts.map((acc) => (
                      <div key={acc.id} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50">
                        <span>{acc.nickname || acc.ml_user_id}</span>
                        <Badge variant={acc.connection_status === 'connected' ? 'default' : 'secondary'}>
                          {acc.connection_status || 'unknown'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Access & Trial */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2"><CreditCard className="h-4 w-4" /> Acesso & Plano</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Status Trial:</span> {selectedClient.trial_status || '—'}</div>
                  <div><span className="text-muted-foreground">Pagamento:</span> {selectedClient.payment_status || '—'}</div>
                  <div><span className="text-muted-foreground">Início Trial:</span> {formatDate(selectedClient.trial_start_at)}</div>
                  <div><span className="text-muted-foreground">Fim Trial:</span> {formatDate(selectedClient.trial_end_at)}</div>
                  <div><span className="text-muted-foreground">Onboarding:</span> {selectedClient.onboarding_status || '—'}</div>
                  <div><span className="text-muted-foreground">Plano:</span> {selectedClient.plan_name || (selectedClient.selected_plan_id ? selectedClient.selected_plan_id.slice(0, 8) + '...' : '—')}</div>
                </div>
              </div>

              {/* Roles & Meta */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4" /> Roles & Meta</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Roles:</span>{' '}
                    {selectedClient.roles.length > 0 ? selectedClient.roles.join(', ') : 'Nenhuma'}
                  </div>
                  <div><span className="text-muted-foreground">Cadastro:</span> {formatDate(selectedClient.profile_created_at)}</div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">User ID:</span>{' '}
                    <code className="text-xs bg-muted px-1 rounded">{selectedClient.user_id}</code>
                  </div>
                </div>
              </div>

              {/* Auth & Email Status */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4" /> Acesso & E-mail</h4>
                <ClientAuthStatusPanel client={selectedClient} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Excluir Cliente</DialogTitle>
            <DialogDescription>
              Esta ação é irreversível. Todos os dados do cliente serão excluídos permanentemente,
              incluindo empresa, contas vinculadas e histórico.
            </DialogDescription>
          </DialogHeader>
          {clientToDelete && (
            <div className="space-y-4">
              <div className="p-3 rounded-md bg-destructive/10 text-sm">
                <p><strong>{clientToDelete.full_name || 'Sem nome'}</strong></p>
                <p className="text-muted-foreground">{clientToDelete.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium">
                  Digite o email do cliente para confirmar:
                </label>
                <Input
                  value={deleteConfirmEmail}
                  onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                  placeholder={clientToDelete.email || ''}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={
                deleteConfirmEmail !== clientToDelete?.email ||
                deleteClient.isPending
              }
              onClick={handleDelete}
            >
              {deleteClient.isPending ? 'Excluindo...' : 'Excluir Permanentemente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trial Adjustment Dialog */}
      <Dialog open={trialOpen} onOpenChange={setTrialOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Trial</DialogTitle>
            <DialogDescription>
              Editar o período de teste de{' '}
              <strong>{trialClient?.full_name || trialClient?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {trialClient?.trial_end_at && (
              <p className="text-sm text-muted-foreground">
                Trial atual termina em: <strong>{formatDate(trialClient.trial_end_at)}</strong>
                {(() => { const d = daysRemaining(trialClient.trial_end_at); return d !== null ? ` (${d > 0 ? `${d}d restantes` : 'Expirado'})` : ''; })()}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                variant={trialMode === 'days' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTrialMode('days')}
              >
                Adicionar/Remover dias
              </Button>
              <Button
                variant={trialMode === 'date' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTrialMode('date')}
              >
                Definir data específica
              </Button>
            </div>
            {trialMode === 'days' ? (
              <div>
                <label className="text-sm font-medium">Dias (positivo = adicionar, negativo = remover)</label>
                <Input
                  type="number"
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value)}
                  className="mt-1"
                />
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium">Nova data de expiração do trial</label>
                <Input
                  type="date"
                  value={trialEndDateInput}
                  onChange={(e) => setTrialEndDateInput(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdjustTrial} disabled={adjustTrial.isPending || setTrialEndDate.isPending}>
              {(adjustTrial.isPending || setTrialEndDate.isPending) ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan Change Dialog */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Plano</DialogTitle>
            <DialogDescription>
              Alterar o plano de <strong>{planClient?.full_name || planClient?.email}</strong>.
              {planClient?.plan_name && (
                <> Plano atual: <Badge variant="secondary" className="ml-1">{planClient.plan_name}</Badge></>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Novo plano</label>
              <Select value={selectedTierId} onValueChange={setSelectedTierId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o plano..." />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_TIERS.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>{tier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancelar</Button>
            <Button
              disabled={!selectedTierId || changeUserPlan.isPending}
              onClick={() => {
                if (!planClient || !selectedTierId) return;
                changeUserPlan.mutate(
                  { userId: planClient.user_id, planTierId: selectedTierId },
                  { onSuccess: () => { setPlanOpen(false); setPlanClient(null); refetch(); } }
                );
              }}
            >
              {changeUserPlan.isPending ? 'Alterando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Auth email actions menu — context-aware (resend confirmation OR send recovery)
// ----------------------------------------------------------------------------
function ClientAuthEmailActions({ client }: { client: AdminClient }) {
  const sendEmail = useSendAuthEmail();
  const generateLink = useGenerateAuthLink();
  const { data: status, isLoading } = useUserAuthStatus({
    user_id: client.user_id,
    email: client.email,
  });

  const isConfirmed = !!status?.email_confirmed_at;
  // Default to "recovery" until we know — most support cases are confirmed users
  const recommended: 'confirmation' | 'recovery' =
    !status || isConfirmed ? 'recovery' : 'confirmation';

  const handleSend = (mode: 'confirmation' | 'recovery') => {
    sendEmail.mutate({
      target_user_id: client.user_id,
      email: client.email,
      mode,
    });
  };

  const handleCopyLink = async (mode: 'confirmation' | 'recovery') => {
    const data = await generateLink.mutateAsync({
      target_user_id: client.user_id,
      email: client.email,
      mode,
    });
    if (data?.verification_link) {
      await navigator.clipboard.writeText(data.verification_link);
      toast.success(
        mode === 'recovery'
          ? 'Link de recuperação copiado!'
          : 'Link de confirmação copiado!'
      );
    } else {
      toast.info(data?.message || 'Nenhum link disponível');
    }
  };

  if (isLoading) {
    return (
      <DropdownMenuItem disabled>
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando estado...
      </DropdownMenuItem>
    );
  }

  return (
    <>
      {recommended === 'recovery' ? (
        <>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSend('recovery'); }}>
            <KeyRound className="h-4 w-4 mr-2" /> Enviar e-mail de recuperação
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopyLink('recovery'); }}>
            <Link2 className="h-4 w-4 mr-2" /> Copiar link de recuperação
          </DropdownMenuItem>
        </>
      ) : (
        <>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSend('confirmation'); }}>
            <Send className="h-4 w-4 mr-2" /> Reenviar confirmação
          </DropdownMenuItem>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopyLink('confirmation'); }}>
            <Link2 className="h-4 w-4 mr-2" /> Copiar link de confirmação
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

// ----------------------------------------------------------------------------
// Auth status panel — shown inside the client details dialog
// ----------------------------------------------------------------------------
function ClientAuthStatusPanel({ client }: { client: AdminClient }) {
  const { data: status, isLoading, error } = useUserAuthStatus({
    user_id: client.user_id,
    email: client.email,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando estado de acesso...
      </div>
    );
  }
  if (error || !status) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar o estado de autenticação.
      </p>
    );
  }

  const isConfirmed = !!status.email_confirmed_at;
  const last = status.last_auth_email;

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          {isConfirmed ? (
            <MailCheck className="h-4 w-4 text-green-600" />
          ) : (
            <MailWarning className="h-4 w-4 text-yellow-600" />
          )}
          <span className="text-muted-foreground">E-mail confirmado:</span>
          <strong>{isConfirmed ? 'Sim' : 'Não'}</strong>
        </div>
        <div>
          <span className="text-muted-foreground">Último login:</span>{' '}
          <strong>{status.last_sign_in_at ? formatDateTime(status.last_sign_in_at) : 'Nunca'}</strong>
        </div>
      </div>

      <div className="rounded-md border p-2 bg-muted/30">
        <p className="text-xs font-semibold mb-1 flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" /> Ação recomendada
        </p>
        <p className="text-xs text-muted-foreground">
          {status.recommended_action === 'resend_confirmation' && (
            <>Cliente nunca confirmou o e-mail. Use <strong>Reenviar confirmação</strong>.</>
          )}
          {status.recommended_action === 'send_recovery' && (
            <>Cliente confirmado, mas nunca acessou. Use <strong>Enviar recuperação</strong>{' '}
            para gerar uma senha de primeiro acesso.</>
          )}
          {status.recommended_action === 'user_can_login' && (
            <>Cliente já consegue acessar normalmente. Se houver dificuldade, envie{' '}
            <strong>recuperação de senha</strong>.</>
          )}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold mb-1">Último e-mail auth enviado</p>
        {last ? (
          <div className="text-xs text-muted-foreground">
            <span className="font-mono">{last.template_name || 'auth_emails'}</span>{' '}
            <Badge
              variant={
                last.status === 'sent'
                  ? 'default'
                  : last.status === 'pending'
                  ? 'secondary'
                  : 'destructive'
              }
              className="ml-1 text-[10px]"
            >
              {last.status}
            </Badge>{' '}
            <span>· {formatDateTime(last.created_at)}</span>
            {last.error_message && (
              <p className="text-destructive mt-1">{last.error_message}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nenhum envio recente registrado pelo sistema.
          </p>
        )}
      </div>
    </div>
  );
}
