import { useState } from 'react';
import { Clock, RefreshCw, AlertTriangle, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { CutoffData } from '@/hooks/useShippingCutoff';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ShippingCutoffCardProps {
  data: CutoffData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  canRefresh: boolean;
  zoneDetails?: Array<{ zone: string; cutoff: string }> | null;
}

export function ShippingCutoffCard({
  data,
  isLoading,
  isRefreshing,
  error,
  onRefresh,
  canRefresh,
  zoneDetails,
}: ShippingCutoffCardProps) {
  const [zoneModalOpen, setZoneModalOpen] = useState(false);

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <div className="flex gap-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data && !error) return null;

  const meta = data?.meta;
  const flex = data?.flex;
  const colecta = data?.colecta;
  const agency = data?.agency;
  // Only show error state if there's a client-side error OR status is error AND no data at all
  const hasAnyData = flex?.enabled || colecta?.enabled || agency?.enabled;
  const isError = (!data && !!error) || (meta?.status === 'error' && !hasAnyData && !!error);
  const isPartial = meta?.status === 'partial';

  return (
    <>
      <Card className={cn(
        "transition-colors",
        isError && "border-destructive/50 bg-destructive/5",
        isPartial && "border-accent/50 bg-accent/10",
      )}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Left - Title + Data */}
            <div className="flex items-center gap-3 min-w-0">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  🕒 Hora de Corte Hoje
                </p>
                {isError ? (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="h-3 w-3" />
                    {error || meta?.message || 'Não foi possível buscar a hora de corte agora.'}
                  </p>
                ) : (
                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    {/* Agência */}
                    <AgencyItem
                      enabled={agency?.enabled ?? false}
                      cutoffTime={agency?.cutoff_time}
                    />

                    <span className="text-muted-foreground/30">|</span>

                    {/* Flex */}
                    <CutoffItem
                      label="Flex"
                      enabled={flex?.enabled ?? false}
                      cutoffType={flex?.cutoff_type}
                      cutoffTime={flex?.cutoff_time}
                      zoneFirst={flex?.zone_summary_first}
                      zoneLast={flex?.zone_summary_last}
                      hasZones={flex?.cutoff_type === 'by_zone'}
                      onShowZones={() => setZoneModalOpen(true)}
                    />

                    <span className="text-muted-foreground/30">|</span>

                    {/* Coleta */}
                    <ColectaItem
                      enabled={colecta?.enabled ?? false}
                      cutoffTime={colecta?.cutoff_time}
                      windowFrom={colecta?.window_from}
                      windowTo={colecta?.window_to}
                      calculated={colecta?.cutoff_calculated ?? false}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right - Refresh */}
            <div className="flex items-center gap-2 shrink-0">
              {meta?.fetched_at && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  Atualizado às {format(new Date(meta.fetched_at), 'HH:mm')}
                </span>
              )}
              {canRefresh && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className="h-7 px-2 text-xs"
                >
                  <RefreshCw className={cn("h-3 w-3 mr-1", isRefreshing && "animate-spin")} />
                  Atualizar agora
                </Button>
              )}
            </div>
          </div>

          {isPartial && (
            <p className="text-[10px] text-muted-foreground mt-1">
              ⚠️ {meta?.message || 'Alguns dados não vieram agora.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Zone Details Modal */}
      <Dialog open={zoneModalOpen} onOpenChange={setZoneModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Horários por Zona (Flex)
            </DialogTitle>
            <DialogDescription>
              Horários de corte detalhados por zona de entrega
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {zoneDetails?.map((zone, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50"
              >
                <span className="text-sm text-foreground">{zone.zone}</span>
                <span className="text-sm font-mono font-semibold text-primary">
                  {zone.cutoff}
                </span>
              </div>
            ))}
            {(!zoneDetails || zoneDetails.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma zona encontrada.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CutoffItem({
  label, enabled, cutoffType, cutoffTime, zoneFirst, zoneLast, hasZones, onShowZones,
}: {
  label: string; enabled: boolean; cutoffType: string | null | undefined;
  cutoffTime: string | null | undefined; zoneFirst: string | null | undefined;
  zoneLast: string | null | undefined; hasZones: boolean; onShowZones: () => void;
}) {
  if (!enabled) {
    return (
      <span className="text-xs text-muted-foreground">
        {label}: <span className="italic">não disponível</span>
      </span>
    );
  }

  if (hasZones && zoneFirst && zoneLast) {
    return (
      <span className="text-xs text-foreground">
        {label}:{' '}
        <span className="text-muted-foreground">por zona</span>{' '}
        <span className="font-mono font-semibold">{zoneFirst}</span>
        {' – '}
        <span className="font-mono font-semibold">{zoneLast}</span>
        {' '}
        <button onClick={onShowZones} className="text-primary hover:underline text-[11px] ml-0.5">
          Ver detalhes
        </button>
      </span>
    );
  }

  return (
    <span className="text-xs text-foreground">
      {label}: <span className="font-mono font-semibold text-primary">{cutoffTime || '—'}</span>
    </span>
  );
}

function AgencyItem({
  enabled, cutoffTime, cutoffSource, handlingLimitTime,
}: {
  enabled: boolean; cutoffTime: string | null | undefined;
  cutoffSource: string | null | undefined; handlingLimitTime: string | null | undefined;
}) {
  if (!enabled) {
    return (
      <span className="text-xs text-muted-foreground">
        Agência: <span className="italic">não disponível</span>
      </span>
    );
  }

  const hasDivergence = cutoffTime && handlingLimitTime && cutoffTime !== handlingLimitTime;

  return (
    <span className="text-xs text-foreground">
      Agência: <span className="font-mono font-semibold text-primary">{cutoffTime || '—'}</span>
      {cutoffSource === 'estimated_schedule_limit' || cutoffSource === 'api_schedule_limit' ? (
        <span className="text-muted-foreground ml-0.5 text-[10px]">(ML)</span>
      ) : null}
      {hasDivergence && (
        <span className="text-muted-foreground ml-1 text-[10px]">
          despacho: {handlingLimitTime}
        </span>
      )}
    </span>
  );
}

function ColectaItem({
  enabled, cutoffTime, windowFrom, windowTo, calculated,
}: {
  enabled: boolean; cutoffTime: string | null | undefined;
  windowFrom: string | null | undefined; windowTo: string | null | undefined; calculated: boolean;
}) {
  if (!enabled) {
    return (
      <span className="text-xs text-muted-foreground">
        Coleta: <span className="italic">não disponível hoje</span>
      </span>
    );
  }

  return (
    <span className="text-xs text-foreground">
      Coleta:{' '}
      <span className="font-mono font-semibold text-primary">{cutoffTime || '—'}</span>
      {calculated && <span className="text-muted-foreground ml-1">(calculado)</span>}
      {windowFrom && windowTo && (
        <span className="text-muted-foreground ml-1.5 text-[11px]">
          Janela: {windowFrom}–{windowTo}
        </span>
      )}
    </span>
  );
}
