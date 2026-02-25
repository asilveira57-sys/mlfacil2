import { CheckCircle2, AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { OriginStatus } from './types';

interface Props {
  status: OriginStatus;
}

export function OriginStatusBadge({ status }: Props) {
  if (status === 'loading') {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
        Carregando origem...
      </Badge>
    );
  }

  if (status === 'complete') {
    return (
      <Badge variant="default" className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Origem: Completa
      </Badge>
    );
  }

  if (status === 'partial') {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <AlertTriangle className="h-3 w-3 text-amber-500" />
        Origem: Parcial
      </Badge>
    );
  }

  return (
    <div className="space-y-2">
      <Badge variant="outline" className="gap-1 text-xs border-amber-500/50 text-amber-500">
        <XCircle className="h-3 w-3" />
        Origem: Indisponível
      </Badge>
      <Alert className="border-amber-500/30 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <AlertDescription className="text-xs">
          Não foi possível carregar dados automáticos. Você pode preencher manualmente.
        </AlertDescription>
      </Alert>
    </div>
  );
}
