import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Camera,
  ShieldAlert,
  Clock,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DiagnosticSummary } from "@/hooks/useRadiographyData";

interface Props {
  data: DiagnosticSummary | null;
  loading: boolean;
}

export function RadiographyDiagnosticCards({ data, loading }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {/* Card 1 — Monitored */}
      <VitalCard
        icon={<Activity className="h-5 w-5" />}
        label="Anúncios Monitorados"
        loading={loading}
        colorClass="text-cyan-400"
        bgClass="bg-cyan-500/10"
        borderClass="border-cyan-500/20"
      >
        {data && (
          <>
            <div className="text-2xl font-bold text-cyan-400 font-mono">
              {data.totalActive.toLocaleString("pt-BR")}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-emerald-400" />
                {data.updatedRecently} atualizados
              </span>
              {data.awaitingCollection > 0 && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 text-amber-400" />
                  {data.awaitingCollection} aguardando
                </span>
              )}
            </div>
          </>
        )}
      </VitalCard>

      {/* Card 2 — Exams */}
      <VitalCard
        icon={<Camera className="h-5 w-5" />}
        label="Exames Realizados"
        loading={loading}
        colorClass="text-violet-400"
        bgClass="bg-violet-500/10"
        borderClass="border-violet-500/20"
      >
        {data && (
          <div className="text-2xl font-bold text-violet-400 font-mono">
            {data.totalExams.toLocaleString("pt-BR")}
          </div>
        )}
      </VitalCard>

      {/* Card 3 — Anomalies */}
      <VitalCard
        icon={<ShieldAlert className="h-5 w-5" />}
        label="Anomalias Detectadas"
        loading={loading}
        colorClass="text-amber-400"
        bgClass="bg-amber-500/10"
        borderClass="border-amber-500/20"
      >
        {data && (
          <div className="text-2xl font-bold text-amber-400 font-mono">
            {data.anomalyCount.toLocaleString("pt-BR")}
          </div>
        )}
      </VitalCard>

      {/* Card 4 — System Status */}
      <VitalCard
        icon={<Clock className="h-5 w-5" />}
        label="Status do Sistema"
        loading={loading}
        colorClass="text-emerald-400"
        bgClass="bg-emerald-500/10"
        borderClass="border-emerald-500/20"
      >
        {data && (
          <div className="space-y-1 text-xs">
            <StatusLine
              label="Sync"
              value={data.lastSyncAt}
            />
            <StatusLine
              label="Coleta"
              value={data.lastCollectionAt}
            />
            {data.backfillStatus && data.backfillStatus !== "done" && (
              <div className="flex items-center gap-1 text-amber-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Backfill {data.backfillProgress ? `${data.backfillProgress}%` : "em andamento"}
              </div>
            )}
          </div>
        )}
      </VitalCard>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between text-slate-400">
      <span>{label}:</span>
      <span className="text-slate-300">
        {value
          ? formatDistanceToNow(new Date(value), { addSuffix: true, locale: ptBR })
          : "Aguardando"}
      </span>
    </div>
  );
}

interface VitalCardProps {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  children: React.ReactNode;
}

function VitalCard({ icon, label, loading, colorClass, bgClass, borderClass, children }: VitalCardProps) {
  return (
    <Card className={`relative overflow-hidden bg-slate-900/60 border-slate-700/50 ${borderClass}`}>
      <div className={`absolute inset-0 ${bgClass} opacity-30`} />
      <CardContent className="relative pt-4 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className={`h-8 w-8 rounded-lg ${bgClass} border ${borderClass} flex items-center justify-center ${colorClass}`}>
            {icon}
          </div>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            {label}
          </span>
        </div>
        {loading ? <Skeleton className="h-8 w-20 bg-slate-800/50" /> : children}
      </CardContent>
    </Card>
  );
}
