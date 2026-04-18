import { DollarSign, Megaphone, AlertTriangle, Package, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import type { SandboxSnapshot } from '@/hooks/useSandboxSnapshots';

interface Props {
  snapshots: SandboxSnapshot[];
  disconnectedCount?: number;
}

function formatRelativeTime(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin}min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

export function SandboxGlobalSummary({ snapshots, disconnectedCount = 0 }: Props) {
  const totalVendas = snapshots.reduce((s, c) => s + Number(c.total_vendas_semana || 0), 0);
  const totalAdsSpend = snapshots.reduce((s, c) => s + Number(c.gasto_ads_semana || 0), 0);
  const totalReclamacoes = snapshots.reduce((s, c) => s + (c.reclamacoes_abertas || 0), 0);
  const totalEtiquetas = snapshots.reduce((s, c) => s + (c.etiquetas_pendentes || 0), 0);

  const now = new Date();

  // Last update (most recent snapshot)
  const lastUpdate = snapshots.reduce((latest, snap) => {
    const t = new Date(snap.updated_at);
    return t > latest ? t : latest;
  }, new Date(0));

  const isStale = (Date.now() - lastUpdate.getTime()) > 30 * 60 * 1000;

  const items = [
    {
      label: 'Vendido (semana)',
      value: `R$ ${totalVendas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      icon: DollarSign,
      accent: false,
    },
    {
      label: 'Gasto ADS',
      value: `R$ ${totalAdsSpend.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      icon: Megaphone,
      accent: false,
    },
    {
      label: 'Reclamações',
      value: totalReclamacoes.toString(),
      icon: AlertTriangle,
      accent: totalReclamacoes > 0,
    },
    {
      label: 'Etiquetas pend.',
      value: totalEtiquetas.toString(),
      icon: Package,
      accent: totalEtiquetas > 0,
    },
  ];

  return (
    <div className="rounded-lg bg-muted/40 border border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-md flex-shrink-0 ${item.accent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
              <item.icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground truncate leading-tight">{item.label}</p>
              <p className={`text-sm font-bold leading-tight ${item.accent ? 'text-destructive' : 'text-foreground'}`}>
                {item.value}
              </p>
            </div>
          </div>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Disconnected companies note */}
        {disconnectedCount > 0 && (
          <span className="text-[10px] text-muted-foreground bg-muted/60 px-2 py-1 rounded-full flex-shrink-0">
            {disconnectedCount} empresa{disconnectedCount > 1 ? 's' : ''} sem conta ML
          </span>
        )}

        {/* Last update status */}
        <div className={`flex items-center gap-1.5 text-xs flex-shrink-0 ${isStale ? 'text-yellow-500' : 'text-muted-foreground'}`}>
        {isStale
            ? <AlertCircle className="h-3 w-3" />
            : <CheckCircle2 className="h-3 w-3 text-primary" />
          }
          <span>
            {isStale ? 'Atualização atrasada' : `Atualizado ${formatRelativeTime(lastUpdate.toISOString())}`}
          </span>
        </div>
      </div>
    </div>
  );
}
