import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Users, 
  Plus, 
  Search, 
  MoreHorizontal, 
  Pencil, 
  Shield, 
  Mail, 
  UserX, 
  UserCheck, 
  Trash2,
  Loader2 
} from 'lucide-react';
import { useCollaborators } from '@/hooks/useCollaborators';
import { useWorkspace } from '@/hooks/useWorkspace';
import { CollaboratorFormModal } from './CollaboratorFormModal';
import { CollaboratorConfirmDialog } from './CollaboratorConfirmDialog';
import { 
  COLLABORATOR_STATUS_LABELS, 
  COLLABORATOR_STATUS_COLORS,
  type CollaboratorWithModules,
  type CollaboratorStatus 
} from '@/types/collaborator';

export function CollaboratorsCard() {
  const { currentWorkspace, myRole } = useWorkspace();
  const {
    collaborators,
    loading,
    error,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    createCollaborator,
    updateCollaborator,
    updateModuleAccess,
    sendInvite,
    disableCollaborator,
    enableCollaborator,
    deleteCollaborator,
  } = useCollaborators(currentWorkspace?.id ?? null);

  // Modal states
  const [formOpen, setFormOpen] = useState(false);
  const [editingCollaborator, setEditingCollaborator] = useState<CollaboratorWithModules | null>(null);
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false);
  const [permissionsCollaborator, setPermissionsCollaborator] = useState<CollaboratorWithModules | null>(null);
  
  // Confirm dialog states - store collaborator ID and action type instead of callbacks
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'sendInvite' | 'disable' | 'enable' | 'delete' | null;
    collaboratorId: string | null;
    collaboratorName: string;
    collaboratorEmail: string;
  }>({
    open: false,
    type: null,
    collaboratorId: null,
    collaboratorName: '',
    collaboratorEmail: '',
  });

  // Derive dialog properties from type
  const getDialogProps = () => {
    switch (confirmDialog.type) {
      case 'sendInvite':
        return {
          title: 'Enviar Convite',
          description: `Deseja enviar um convite de acesso para ${confirmDialog.collaboratorEmail}?`,
          confirmLabel: 'Enviar',
          confirmVariant: 'default' as const,
        };
      case 'disable':
        return {
          title: 'Desativar Colaborador',
          description: `Deseja desativar o acesso de ${confirmDialog.collaboratorName}? O colaborador não poderá mais acessar o sistema até ser reativado.`,
          confirmLabel: 'Desativar',
          confirmVariant: 'destructive' as const,
        };
      case 'enable':
        return {
          title: 'Reativar Colaborador',
          description: `Deseja reativar o acesso de ${confirmDialog.collaboratorName}?`,
          confirmLabel: 'Reativar',
          confirmVariant: 'default' as const,
        };
      case 'delete':
        return {
          title: 'Excluir Colaborador',
          description: `Tem certeza que deseja excluir ${confirmDialog.collaboratorName}? Esta ação remove o colaborador desta empresa e impede o acesso permanentemente.`,
          confirmLabel: 'Excluir',
          confirmVariant: 'destructive' as const,
        };
      default:
        return {
          title: '',
          description: '',
          confirmLabel: 'Confirmar',
          confirmVariant: 'default' as const,
        };
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmDialog.collaboratorId || !confirmDialog.type) return;
    
    switch (confirmDialog.type) {
      case 'sendInvite':
        await sendInvite(confirmDialog.collaboratorId);
        break;
      case 'disable':
        await disableCollaborator(confirmDialog.collaboratorId);
        break;
      case 'enable':
        await enableCollaborator(confirmDialog.collaboratorId);
        break;
      case 'delete':
        await deleteCollaborator(confirmDialog.collaboratorId);
        break;
    }
    
    setConfirmDialog(prev => ({ ...prev, open: false }));
  };

  // Only show for workspace admins
  if (myRole !== 'admin') {
    return null;
  }

  const handleCreate = () => {
    setEditingCollaborator(null);
    setFormOpen(true);
  };

  const handleEdit = (collab: CollaboratorWithModules) => {
    setEditingCollaborator(collab);
    setFormOpen(true);
  };

  const handlePermissions = (collab: CollaboratorWithModules) => {
    setPermissionsCollaborator(collab);
    setPermissionsModalOpen(true);
  };

  const handleSendInvite = (collab: CollaboratorWithModules) => {
    setConfirmDialog({
      open: true,
      type: 'sendInvite',
      collaboratorId: collab.id,
      collaboratorName: collab.name,
      collaboratorEmail: collab.email,
    });
  };

  const handleDisable = (collab: CollaboratorWithModules) => {
    setConfirmDialog({
      open: true,
      type: 'disable',
      collaboratorId: collab.id,
      collaboratorName: collab.name,
      collaboratorEmail: collab.email,
    });
  };

  const handleEnable = (collab: CollaboratorWithModules) => {
    setConfirmDialog({
      open: true,
      type: 'enable',
      collaboratorId: collab.id,
      collaboratorName: collab.name,
      collaboratorEmail: collab.email,
    });
  };

  const handleDelete = (collab: CollaboratorWithModules) => {
    setConfirmDialog({
      open: true,
      type: 'delete',
      collaboratorId: collab.id,
      collaboratorName: collab.name,
      collaboratorEmail: collab.email,
    });
  };

  const handleFormSubmit = async (data: { name: string; email: string; profileId: string | null }) => {
    if (editingCollaborator) {
      await updateCollaborator(editingCollaborator.id, { name: data.name, email: data.email });
      // Update profile_id on the collaborator
      if (data.profileId !== undefined) {
        const { error } = await (await import('@/integrations/supabase/client')).supabase
          .from('collaborators')
          .update({ profile_id: data.profileId })
          .eq('id', editingCollaborator.id);
        if (error) console.error('Error updating profile_id:', error);
      }
    } else {
      if (!currentWorkspace) return;
      await createCollaborator({
        workspaceId: currentWorkspace.id,
        name: data.name,
        email: data.email,
        modules: {},
        profileId: data.profileId,
      });
    }
  };

  const handlePermissionsSubmit = async (data: { name: string; email: string; profileId: string | null }) => {
    if (!permissionsCollaborator) return;
    if (data.profileId !== undefined) {
      const { error } = await (await import('@/integrations/supabase/client')).supabase
        .from('collaborators')
        .update({ profile_id: data.profileId })
        .eq('id', permissionsCollaborator.id);
      if (error) console.error('Error updating profile_id:', error);
    }
  };

  const getProfileLabel = (collab: CollaboratorWithModules) => {
    const pid = (collab as any).profile_id;
    return pid ? 'Perfil atribuído' : 'Sem perfil';
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Colaboradores
              </CardTitle>
              <CardDescription>
                Gerencie o acesso de colaboradores ao sistema
              </CardDescription>
            </div>
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo colaborador
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as CollaboratorStatus | 'all')}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="invited">Convidado</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="disabled">Desativado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">{error}</div>
          ) : collaborators.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery || statusFilter !== 'all' 
                ? 'Nenhum colaborador encontrado com os filtros aplicados'
                : 'Nenhum colaborador cadastrado ainda'
              }
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Perfil</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collaborators.map((collab) => (
                    <TableRow key={collab.id}>
                      <TableCell className="font-medium">{collab.name}</TableCell>
                      <TableCell className="text-muted-foreground">{collab.email}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={COLLABORATOR_STATUS_COLORS[collab.status]}
                        >
                          {COLLABORATOR_STATUS_LABELS[collab.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">
                          {getProfileLabel(collab)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(collab)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePermissions(collab)}>
                              <Shield className="mr-2 h-4 w-4" />
                              Permissões
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSendInvite(collab)}>
                              <Mail className="mr-2 h-4 w-4" />
                              {collab.status === 'invited' ? 'Reenviar convite' : 'Enviar convite'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {collab.status === 'disabled' ? (
                              <DropdownMenuItem onClick={() => handleEnable(collab)}>
                                <UserCheck className="mr-2 h-4 w-4" />
                                Ativar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleDisable(collab)}>
                                <UserX className="mr-2 h-4 w-4" />
                                Desativar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={() => handleDelete(collab)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal - only render when formOpen */}
      {formOpen && (
        <CollaboratorFormModal
          open={formOpen}
          onOpenChange={setFormOpen}
          collaborator={editingCollaborator}
          onSubmit={handleFormSubmit}
        />
      )}

      {/* Permissions Modal - only render when permissionsModalOpen */}
      {permissionsModalOpen && (
        <CollaboratorFormModal
          open={permissionsModalOpen}
          onOpenChange={setPermissionsModalOpen}
          collaborator={permissionsCollaborator}
          onSubmit={handlePermissionsSubmit}
        />
      )}

      {/* Confirm Dialog - only render when open */}
      {confirmDialog.open && (
        <CollaboratorConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
          title={getDialogProps().title}
          description={getDialogProps().description}
          confirmLabel={getDialogProps().confirmLabel}
          confirmVariant={getDialogProps().confirmVariant}
          onConfirm={handleConfirmAction}
        />
      )}
    </>
  );
}
