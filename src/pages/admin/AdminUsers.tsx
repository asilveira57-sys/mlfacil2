import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  MoreHorizontal, 
  Shield, 
  ShieldOff,
  Clock,
  Plus,
  Minus,
  RotateCcw,
  Ban,
  CheckCircle,
  Filter,
  KeyRound,
  Copy,
  Loader2
} from 'lucide-react';
import { useAdminUsers, useAdminUserRole, useAdminTrialManagement } from '@/hooks/useAdmin';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function AdminUsers() {
  const { data: users, isLoading } = useAdminUsers();
  const { setRole } = useAdminUserRole();
  const { adjustTrial, resetTrial, setBlocked } = useAdminTrialManagement();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Dialog states
  const [adjustDaysDialog, setAdjustDaysDialog] = useState<{ open: boolean; userId: string; email: string }>({
    open: false,
    userId: '',
    email: '',
  });
  const [daysToAdjust, setDaysToAdjust] = useState(7);
  const [resetLinkDialog, setResetLinkDialog] = useState<{ open: boolean; email: string; link: string; loading: boolean }>({
    open: false,
    email: '',
    link: '',
    loading: false,
  });

  const filteredUsers = users?.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || user.subscription_status === statusFilter;
    const matchesRole = roleFilter === 'all' || 
      (roleFilter === 'admin' && user.roles.includes('admin')) ||
      (roleFilter === 'seller' && !user.roles.includes('admin'));
    return matchesSearch && matchesStatus && matchesRole;
  }) || [];

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-700">Ativo</Badge>;
      case 'trial':
        return <Badge className="bg-blue-100 text-blue-700">Teste</Badge>;
      case 'expired':
        return <Badge className="bg-amber-100 text-amber-700">Expirado</Badge>;
      case 'blocked':
        return <Badge variant="destructive">Bloqueado</Badge>;
      default:
        return <Badge variant="outline">{status || 'N/A'}</Badge>;
    }
  };

  const handleAddAdmin = (userId: string) => {
    setRole.mutate({ userId, role: 'admin', action: 'add' });
  };

  const handleRemoveAdmin = (userId: string) => {
    setRole.mutate({ userId, role: 'admin', action: 'remove' });
  };

  const handleAdjustDays = () => {
    adjustTrial.mutate({
      userId: adjustDaysDialog.userId,
      daysAdjustment: daysToAdjust,
    });
    setAdjustDaysDialog({ open: false, userId: '', email: '' });
  };

  const handleResetTrial = (userId: string) => {
    resetTrial.mutate({ userId, trialDays: 7 });
  };

  const handleToggleBlock = (userId: string, currentStatus: string | null) => {
    const isBlocked = currentStatus === 'blocked';
    setBlocked.mutate({ userId, blocked: !isBlocked });
  };

  const handleGenerateResetLink = async (email: string) => {
    setResetLinkDialog({ open: true, email, link: '', loading: true });
    try {
      const { data, error } = await supabase.functions.invoke('admin-generate-reset-link', {
        body: { email, redirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResetLinkDialog({ open: true, email, link: data.recovery_link || '', loading: false });
    } catch (err: any) {
      toast.error(`Erro ao gerar link: ${err.message}`);
      setResetLinkDialog({ open: false, email: '', link: '', loading: false });
    }
  };

  const handleCopyResetLink = () => {
    navigator.clipboard.writeText(resetLinkDialog.link);
    toast.success('Link copiado!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Usuários</h1>
        <p className="text-muted-foreground">
          Gerencie todos os usuários da plataforma
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="trial">Em teste</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="expired">Expirados</SelectItem>
                <SelectItem value="blocked">Bloqueados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[150px]">
                <Shield className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Papel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="seller">Vendedores</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Usuários</CardTitle>
          <CardDescription>
            {filteredUsers.length} usuário(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Fim do Teste</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>{getStatusBadge(user.subscription_status)}</TableCell>
                    <TableCell>
                      {user.roles.includes('admin') ? (
                        <Badge className="bg-purple-100 text-purple-700">
                          <Shield className="h-3 w-3 mr-1" />
                          Admin
                        </Badge>
                      ) : (
                        <Badge variant="outline">Vendedor</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.trial_end_at ? (
                        <span className="text-sm">
                          {format(new Date(user.trial_end_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(user.created_at), { 
                          addSuffix: true, 
                          locale: ptBR 
                        })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* Admin Role */}
                          {user.roles.includes('admin') ? (
                            <DropdownMenuItem onClick={() => handleRemoveAdmin(user.id)}>
                              <ShieldOff className="h-4 w-4 mr-2" />
                              Remover Admin
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleAddAdmin(user.id)}>
                              <Shield className="h-4 w-4 mr-2" />
                              Tornar Admin
                            </DropdownMenuItem>
                          )}
                          
                          <DropdownMenuSeparator />
                          
                          {/* Trial Adjustments */}
                          <DropdownMenuItem onClick={() => setAdjustDaysDialog({ 
                            open: true, 
                            userId: user.id,
                            email: user.email 
                          })}>
                            <Clock className="h-4 w-4 mr-2" />
                            Ajustar Período
                          </DropdownMenuItem>
                          
                          <DropdownMenuItem onClick={() => handleResetTrial(user.id)}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Resetar Teste (7 dias)
                          </DropdownMenuItem>
                          
                          <DropdownMenuItem onClick={() => handleGenerateResetLink(user.email)}>
                            <KeyRound className="h-4 w-4 mr-2" />
                            Gerar Link de Reset
                          </DropdownMenuItem>
                          
                          <DropdownMenuSeparator />
                          
                          {/* Block/Unblock */}
                          <DropdownMenuItem 
                            onClick={() => handleToggleBlock(user.id, user.subscription_status)}
                            className={user.subscription_status === 'blocked' ? 'text-green-600' : 'text-destructive'}
                          >
                            {user.subscription_status === 'blocked' ? (
                              <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Desbloquear
                              </>
                            ) : (
                              <>
                                <Ban className="h-4 w-4 mr-2" />
                                Bloquear
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Adjust Days Dialog */}
      <Dialog 
        open={adjustDaysDialog.open} 
        onOpenChange={(open) => setAdjustDaysDialog(prev => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Período de Teste</DialogTitle>
            <DialogDescription>
              Ajustar o período de teste para {adjustDaysDialog.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Dias para adicionar/remover</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setDaysToAdjust(d => d - 1)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={daysToAdjust}
                  onChange={(e) => setDaysToAdjust(parseInt(e.target.value) || 0)}
                  className="w-20 text-center"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setDaysToAdjust(d => d + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Use valores negativos para remover dias
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setAdjustDaysDialog({ open: false, userId: '', email: '' })}
            >
              Cancelar
            </Button>
            <Button onClick={handleAdjustDays} disabled={adjustTrial.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Link Dialog */}
      <Dialog
        open={resetLinkDialog.open}
        onOpenChange={(open) => {
          if (!open) setResetLinkDialog({ open: false, email: '', link: '', loading: false });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link de Redefinição de Senha</DialogTitle>
            <DialogDescription>
              {resetLinkDialog.email}
            </DialogDescription>
          </DialogHeader>
          {resetLinkDialog.loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : resetLinkDialog.link ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Copie e envie este link para o cliente via WhatsApp. O link expira em poucos minutos.
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={resetLinkDialog.link}
                  className="text-xs font-mono"
                />
                <Button onClick={handleCopyResetLink} size="icon" variant="outline">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-destructive">Não foi possível gerar o link.</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetLinkDialog({ open: false, email: '', link: '', loading: false })}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
