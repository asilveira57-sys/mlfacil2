import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  GripVertical,
  Eye,
  EyeOff,
  Link as LinkIcon
} from 'lucide-react';
import { useOnboardingCards } from '@/hooks/useAdmin';
import type { OnboardingCard, OnboardingCardInsert } from '@/types/admin';

export function AdminOnboarding() {
  const { data: cards, isLoading, createCard, updateCard, deleteCard } = useOnboardingCards();

  const [editDialog, setEditDialog] = useState<{ open: boolean; card: OnboardingCard | null }>({
    open: false,
    card: null,
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; cardId: string }>({
    open: false,
    cardId: '',
  });

  // Form state
  const [formData, setFormData] = useState<OnboardingCardInsert>({
    title: '',
    description: '',
    link_url: '',
    icon_name: '',
    display_condition: '',
    sort_order: 0,
    is_active: true,
  });

  const openCreateDialog = () => {
    setFormData({
      title: '',
      description: '',
      link_url: '',
      icon_name: '',
      display_condition: '',
      sort_order: (cards?.length || 0) + 1,
      is_active: true,
    });
    setEditDialog({ open: true, card: null });
  };

  const openEditDialog = (card: OnboardingCard) => {
    setFormData({
      title: card.title,
      description: card.description || '',
      link_url: card.link_url || '',
      icon_name: card.icon_name || '',
      display_condition: card.display_condition || '',
      sort_order: card.sort_order,
      is_active: card.is_active,
    });
    setEditDialog({ open: true, card });
  };

  const handleSave = async () => {
    if (editDialog.card) {
      await updateCard.mutateAsync({ id: editDialog.card.id, ...formData });
    } else {
      await createCard.mutateAsync(formData);
    }
    setEditDialog({ open: false, card: null });
  };

  const handleDelete = async () => {
    await deleteCard.mutateAsync(deleteDialog.cardId);
    setDeleteDialog({ open: false, cardId: '' });
  };

  const handleToggleActive = async (card: OnboardingCard) => {
    await updateCard.mutateAsync({ id: card.id, is_active: !card.is_active });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Primeiros Passos</h1>
          <p className="text-muted-foreground">
            Gerencie os cards exibidos no onboarding
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Card
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cards de Onboarding</CardTitle>
          <CardDescription>
            Estes cards são exibidos na primeira visita do usuário ao dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : cards?.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Nenhum card cadastrado</p>
              <Button variant="outline" className="mt-4" onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Criar primeiro card
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Ordem</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Condição</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards?.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span>{card.sort_order}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{card.title}</p>
                        {card.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {card.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {card.link_url ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <LinkIcon className="h-3 w-3" />
                          <span className="truncate max-w-[150px]">{card.link_url}</span>
                        </div>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {card.display_condition ? (
                        <Badge variant="outline" className="text-xs">
                          {card.display_condition}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Sempre</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(card)}
                      >
                        {card.is_active ? (
                          <Eye className="h-4 w-4 text-green-600" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(card)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteDialog({ open: true, cardId: card.id })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog 
        open={editDialog.open} 
        onOpenChange={(open) => setEditDialog(prev => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editDialog.card ? 'Editar Card' : 'Novo Card'}
            </DialogTitle>
            <DialogDescription>
              Preencha as informações do card de onboarding
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Ex: Conecte sua conta"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição breve do passo"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="link_url">Link Interno</Label>
              <Input
                id="link_url"
                value={formData.link_url}
                onChange={(e) => setFormData(prev => ({ ...prev, link_url: e.target.value }))}
                placeholder="/settings"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="icon_name">Ícone</Label>
                <Input
                  id="icon_name"
                  value={formData.icon_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, icon_name: e.target.value }))}
                  placeholder="Settings"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sort_order">Ordem</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    sort_order: parseInt(e.target.value) || 0 
                  }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_condition">Condição de Exibição</Label>
              <Input
                id="display_condition"
                value={formData.display_condition}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  display_condition: e.target.value 
                }))}
                placeholder="Ex: !ml_connected"
              />
              <p className="text-xs text-muted-foreground">
                Deixe vazio para exibir sempre
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Ativo</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ 
                  ...prev, 
                  is_active: checked 
                }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditDialog({ open: false, card: null })}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!formData.title || createCard.isPending || updateCard.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog 
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Card</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este card? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
