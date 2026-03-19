import { useState, useMemo } from 'react';
import { useAdminClients, useDeleteClient, type AdminClient } from '@/hooks/useAdminClients';
import { useAdminTrialManagement } from '@/hooks/useAdmin';
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
  Building2, Store, Mail, Phone, CreditCard, Calendar, Shield,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

function statusBadge(trialStatus: string | null, paymentStatus: string | null) {
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

function daysRemaining(trialEnd: string | null) {
  if (!trialEnd) return null;
  const diff = Math.ceil((new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function AdminClientes() {
  const { data: clients, isLoading, refetch } = useAdminClients();
  const deleteClient = useDeleteClient();
  const { adjustTrial, resetTrial, setBlocked } = useAdminTrialManagement();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedClient, setSelectedClient] = useState<AdminClient | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [clientToDelete, setClientToDelete] = useState<AdminClient | null>(null);

  // Trial adjustment dialog
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialDays, setTrialDays] = useState('7');
  const [trialClient, setTrialClient] = useState<AdminClient | null>(null);

  const filtered = useMemo(() => {
    if (!clients) return [];
    return clients.filter((c) => {
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
  }, [clients, search, statusFilter]);

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
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
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
              <TableHead>Cliente</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Contas ML</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Trial</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((client) => {
                const days = daysRemaining(client.trial_end_at);
                return (
                  <TableRow key={client.user_id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{client.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{client.email || '—'}</p>
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
                      <span className="text-xs text-muted-foreground">{formatDate(client.profile_created_at)}</span>
                    </TableCell>
                    <TableCell>
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
                          <DropdownMenuItem onClick={() => { setTrialClient(client); setTrialDays('7'); setTrialOpen(true); }}>
                            <CalendarPlus className="h-4 w-4 mr-2" /> Ajustar trial
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => resetTrial.mutate({ userId: client.user_id, reason: 'Reset via Admin Clientes' }, { onSuccess: () => refetch() })}>
                            <RotateCcw className="h-4 w-4 mr-2" /> Resetar trial
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Details Dialog */}
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
                  <div><span className="text-muted-foreground">Plano:</span> {selectedClient.selected_plan_id ? selectedClient.selected_plan_id.slice(0, 8) + '...' : '—'}</div>
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
              Adicione ou remova dias do período de teste de{' '}
              <strong>{trialClient?.full_name || trialClient?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Dias (positivo = adicionar, negativo = remover)</label>
              <Input
                type="number"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                className="mt-1"
              />
            </div>
            {trialClient?.trial_end_at && (
              <p className="text-xs text-muted-foreground">
                Trial atual termina em: {formatDate(trialClient.trial_end_at)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrialOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdjustTrial} disabled={adjustTrial.isPending}>
              {adjustTrial.isPending ? 'Ajustando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
