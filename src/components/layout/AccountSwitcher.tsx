import { useState } from 'react';
import { useActiveAccount, ActiveAccount } from '@/contexts/ActiveAccountContext';
import { useCollaboratorAccess } from '@/hooks/useCollaboratorAccess';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronDown,
  Store,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Settings,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

export function AccountSwitcher() {
  const navigate = useNavigate();
  const { 
    activeAccount, 
    accounts, 
    loading, 
    initialized,
    setActiveAccount,
    refreshAccounts,
  } = useActiveAccount();
  const { isCollaborator } = useCollaboratorAccess();
  
  const [switching, setSwitching] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSelectAccount = async (account: ActiveAccount) => {
    if (account.id === activeAccount?.id) return;
    
    setSwitching(true);
    await setActiveAccount(account.id);
    setSwitching(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    await refreshAccounts();
    setSyncing(false);
  };

  const getStatusIcon = (status: ActiveAccount['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircle2 className="h-3 w-3 text-success" />;
      case 'attention':
        return <AlertTriangle className="h-3 w-3 text-warning" />;
      case 'revoked':
      case 'disconnected':
        return <XCircle className="h-3 w-3 text-destructive" />;
    }
  };

  const getStatusLabel = (status: ActiveAccount['status']) => {
    switch (status) {
      case 'connected': return 'Conectada';
      case 'attention': return 'Atenção';
      case 'revoked': return 'Revogada';
      case 'disconnected': return 'Desconectada';
    }
  };

  if (loading || !initialized) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  if (accounts.length === 0) {
    // Collaborators cannot connect ML accounts — they inherit from the titular.
    if (isCollaborator) return null;
    return (
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => navigate('/settings')}
        className="gap-2"
      >
        <Store className="h-4 w-4" />
        <span className="hidden sm:inline">Conectar Conta</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="gap-2 max-w-[200px]"
          disabled={switching}
        >
          {switching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Store className="h-4 w-4 shrink-0" />
              <span className="truncate hidden sm:inline">
                {activeAccount?.nickname || activeAccount?.email || activeAccount?.sellerId || 'Selecionar'}
              </span>
              {activeAccount && getStatusIcon(activeAccount.status)}
              <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Conta Ativa</span>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
          </Button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {accounts.map(account => (
          <DropdownMenuItem
            key={account.id}
            onClick={() => handleSelectAccount(account)}
            className={cn(
              "flex items-center gap-3 py-3 cursor-pointer",
              account.id === activeAccount?.id && "bg-accent"
            )}
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Store className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {account.nickname || account.email || `Conta ${account.sellerId}`}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                Seller ID: {account.sellerId}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {account.id === activeAccount?.id && (
                <Badge variant="default" className="text-[10px] px-1.5">
                  Ativa
                </Badge>
              )}
              <div className="flex items-center gap-1">
                {getStatusIcon(account.status)}
                <span className="text-[10px] text-muted-foreground">
                  {getStatusLabel(account.status)}
                </span>
              </div>
            </div>
          </DropdownMenuItem>
        ))}
        
        {!isCollaborator && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => navigate('/settings')}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              Gerenciar Contas
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
