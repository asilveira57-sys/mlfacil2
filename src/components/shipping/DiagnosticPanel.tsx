import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CheckCircle, Clock, Database, RefreshCw, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DiagnosticInfo } from '@/hooks/useShippingLabels';
import { cn } from '@/lib/utils';

interface DiagnosticPanelProps {
  diagnosticInfo: DiagnosticInfo;
  isSyncing: boolean;
  onRepair: () => void;
}

export function DiagnosticPanel({ diagnosticInfo, isSyncing, onRepair }: DiagnosticPanelProps) {
  const { lastOrderDate, missingShipments30d, lastShipmentSyncAt, totalOrders30d } = diagnosticInfo;
  
  const hasMissingShipments = missingShipments30d > 0;
  const hasData = totalOrders30d > 0 || lastOrderDate;

  if (!hasData) {
    return null;
  }

  return (
    <div className={cn(
      "rounded-lg border p-3 mb-4 text-sm",
      hasMissingShipments 
        ? "bg-warning/10 border-warning/30" 
        : "bg-muted/50 border-border"
    )}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
          {/* Last order date */}
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            <span>Último pedido:</span>
            <span className="font-medium text-foreground">
              {lastOrderDate 
                ? format(new Date(lastOrderDate), 'dd/MM HH:mm', { locale: ptBR })
                : '-'
              }
            </span>
          </div>

          {/* Missing shipments */}
          <div className="flex items-center gap-1.5">
            {hasMissingShipments ? (
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
            )}
            <span>Envios faltantes (30d):</span>
            <span className={cn(
              "font-medium",
              hasMissingShipments ? "text-warning" : "text-primary"
            )}>
              {missingShipments30d}
            </span>
          </div>

          {/* Last shipment sync */}
          {lastShipmentSyncAt && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Sync envios:</span>
              <span className="font-medium text-foreground">
                {formatDistanceToNow(new Date(lastShipmentSyncAt), { 
                  addSuffix: true, 
                  locale: ptBR 
                })}
              </span>
            </div>
          )}
        </div>

        {/* Repair button - only show if there are missing shipments */}
        {hasMissingShipments && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRepair}
            disabled={isSyncing}
            className="gap-1.5 bg-warning/20 hover:bg-warning/30 border-warning/40 text-warning-foreground"
          >
            {isSyncing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wrench className="h-3.5 w-3.5" />
            )}
            Reparar envios
          </Button>
        )}
      </div>
    </div>
  );
}
