import { DollarSign, Megaphone, AlertTriangle, Package, Clock } from 'lucide-react';
import type { SandboxSnapshot } from '@/hooks/useSandboxSnapshots';

interface Props {
  snapshots: SandboxSnapshot[];
}

export function SandboxGlobalSummary({ snapshots }: Props) {
  const totalVendas = snapshots.reduce((s, c) => s + Number(c.total_vendas_semana || 0), 0);
  const totalAdsSpend = snapshots.reduce((s, c) => s + Number(c.gasto_ads_semana || 0), 0);
  const totalReclamacoes = snapshots.reduce((s, c) => s + (c.reclamacoes_abertas || 0), 0);
  const totalEtiquetas = snapshots.reduce((s, c) => s + (c.etiquetas_pendentes || 0), 0);

  // Find closest cutoff across all companies
  const now = new Date();
  const cutoffs = snapshots
    .map(s => s.cutoff_flex_time || s.cutoff_coleta_time)
    .filter(Boolean)
    .map(t => {
      const [h, m] = (t as string).split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    })
    .filter(d => d > now)
    .sort((a, b) => a.getTime() - b.getTime());

  const closestCutoff = cutoffs[0];

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
    {
      label: 'Corte mais próx.',
      value: closestCutoff
        ? closestCutoff.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '--:--',
      icon: Clock,
      accent: closestCutoff ? (closestCutoff.getTime() - now.getTime()) < 3600000 : false,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4 rounded-lg bg-muted/40 border border-border mb-6">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <div className={`p-2 rounded-md ${item.accent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
            <item.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{item.label}</p>
            <p className={`text-sm font-bold ${item.accent ? 'text-destructive' : 'text-foreground'}`}>
              {item.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
