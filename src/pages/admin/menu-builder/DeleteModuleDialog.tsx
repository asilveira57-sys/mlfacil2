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
import { Button } from '@/components/ui/button';
import type { TreeNode } from './types';

interface DeleteModuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  node: TreeNode | null;
  onConfirm: (promoteChildren: boolean) => void;
}

export function DeleteModuleDialog({ open, onOpenChange, node, onConfirm }: DeleteModuleDialogProps) {
  if (!node) return null;
  const hasChildren = node.children.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir "{node.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasChildren
              ? `Este módulo possui ${node.children.length} submenu(s). O que deseja fazer com eles?`
              : 'Esta ação não pode ser desfeita.'
            }
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className={hasChildren ? 'flex-col sm:flex-row gap-2' : ''}>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {hasChildren ? (
            <>
              <Button variant="outline" onClick={() => { onConfirm(true); onOpenChange(false); }}>
                Mover submenus para cima e excluir
              </Button>
              <Button variant="destructive" onClick={() => { onConfirm(false); onOpenChange(false); }}>
                Excluir tudo
              </Button>
            </>
          ) : (
            <AlertDialogAction onClick={() => { onConfirm(true); onOpenChange(false); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
