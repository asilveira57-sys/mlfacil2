import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link2 } from 'lucide-react';

interface SyncedOverlayProps {
  children: React.ReactNode;
  isSynced: boolean;
  areaName: string;
}

export function SyncedOverlay({ children, isSynced, areaName }: SyncedOverlayProps) {
  if (!isSynced) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Synced Alert */}
      <Alert className="mb-4 border-primary/30 bg-primary/5">
        <Link2 className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          <span className="font-medium">Cores sincronizadas com a Cor da Empresa.</span>
          {' '}Para personalizar {areaName} individualmente, desative a sincronização na aba "Sincronização".
        </AlertDescription>
      </Alert>
      
      {/* Content with overlay effect */}
      <div className="relative">
        <div className="pointer-events-none opacity-60">
          {children}
        </div>
        
        {/* Overlay to prevent interaction */}
        <div className="absolute inset-0 cursor-not-allowed" />
      </div>
    </div>
  );
}
