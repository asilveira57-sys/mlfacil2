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
import { AlertTriangle } from 'lucide-react';

interface AccountConnectionWarningProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentAccountsCount: number;
  currentSales: number;
  planMaxSales: number;
}

export function AccountConnectionWarning({
  open,
  onClose,
  onConfirm,
  currentAccountsCount,
  currentSales,
  planMaxSales,
}: AccountConnectionWarningProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Adicionar nova conta
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Você já possui <strong>{currentAccountsCount} conta{currentAccountsCount > 1 ? 's' : ''}</strong> conectada{currentAccountsCount > 1 ? 's' : ''} com
              um total de <strong>{currentSales} vendas</strong> nos últimos 30 dias.
            </p>
            <p>
              As vendas da nova conta serão <strong>somadas às vendas das contas existentes</strong>.
              Se ultrapassar o limite do plano ({planMaxSales} vendas), será necessário fazer upgrade.
            </p>
            <p className="text-xs text-muted-foreground">
              Limite atual: {currentSales}/{planMaxSales} vendas
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Entendi, conectar conta
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
