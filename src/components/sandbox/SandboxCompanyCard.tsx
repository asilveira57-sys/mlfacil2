import { useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock, Package, FileText, MessageCircle, Truck,
  AlertTriangle, MessageSquare, Scale,
  DollarSign, ShoppingCart, TrendingUp, Star,
  Megaphone, ExternalLink,
} from 'lucide-react';
import { getCompanyColor } from '@/lib/companyColors';
import type { SandboxSnapshot } from '@/hooks/useSandboxSnapshots';
import { useNavigate } from 'react-router-dom';

interface Props {
  snapshot: SandboxSnapshot;
}

function CutoffDisplay({ label, time }: { label: string; time: string | null }) {
  if (!time) return (
    <div className="flex items-center gap-2 text-muted-foreground text-xs">
      <span>{label}:</span>
      <span className="font-mono">--:--</span>
    </div>
  );

  const now = new Date();
  const [h, m] = time.split(':').map(Number);
  const cutoff = new Date();
  cutoff.setHours(h, m, 0, 0);
  const diffMs = cutoff.getTime() - now.getTime();
  const diffMin = diffMs / 60000;

  let colorClass = 'text-green-500';
  if (diffMin <= 0) colorClass = 'text-destructive';
  else if (diffMin <= 60) colorClass = 'text-yellow-500';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className={`font-mono text-lg font-bold tabular-nums ${colorClass}`}>
        {time}
      </span>
    </div>
  );
}

function MetricItem({ icon: Icon, label, value, alert, onClick }: {
  icon: any; label: string; value: number | string; alert?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors text-left w-full"
    >
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${alert ? 'text-destructive' : 'text-muted-foreground'}`} />
      <span className="text-xs text-muted-foreground truncate flex-1">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${alert ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </span>
      {alert && <Badge variant="destructive" className="text-[10px] px-1 py-0">!</Badge>}
    </button>
  );
}

export function SandboxCompanyCard({ snapshot }: Props) {
  const navigate = useNavigate();
  const color = useMemo(() => getCompanyColor(snapshot.color_key || 'blue'), [snapshot.color_key]);
  const hasReclamacao = (snapshot.reclamacoes_abertas || 0) > 0;

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtCurrency = (v: number) => `R$ ${fmt(v)}`;

  return (
    <Card className={`overflow-hidden transition-shadow hover:shadow-lg ${hasReclamacao ? 'ring-1 ring-destructive/30' : ''}`}>
      {/* Color bar */}
      <div className="h-1.5" style={{ backgroundColor: color.hex }} />

      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm truncate" style={{ color: color.hex }}>
            {snapshot.company_name}
          </h3>
          <span className="text-[10px] text-muted-foreground">
            {new Date(snapshot.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* BLOCO 1 — HORA DE CORTE */}
        <div className="p-2 rounded-md bg-muted/30 border border-border/50">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Hora de Corte</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CutoffDisplay label="Flex" time={snapshot.cutoff_flex_time} />
            <CutoffDisplay label="Coleta" time={snapshot.cutoff_coleta_time} />
          </div>
        </div>

        {/* BLOCO 2 — OPERAÇÃO DO DIA */}
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Operação</p>
          <MetricItem icon={Package} label="Etiquetas pend." value={snapshot.etiquetas_pendentes} alert={snapshot.etiquetas_pendentes > 0} onClick={() => navigate('/shipping-labels')} />
          <MetricItem icon={FileText} label="NF pendentes" value={snapshot.nf_pendentes} alert={snapshot.nf_pendentes > 0} />
          <MetricItem icon={Truck} label="Aguard. envio" value={snapshot.pedidos_envio} alert={snapshot.pedidos_envio > 5} onClick={() => navigate('/shipping-labels')} />
          <MetricItem icon={MessageCircle} label="Perguntas" value={snapshot.perguntas_pendentes} alert={snapshot.perguntas_pendentes > 0} onClick={() => navigate('/perguntas')} />
        </div>

        {/* BLOCO 3 — RECLAMAÇÕES E PÓS-VENDA */}
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Pós-Venda</p>
          <MetricItem icon={AlertTriangle} label="Reclamações" value={snapshot.reclamacoes_abertas} alert={snapshot.reclamacoes_abertas > 0} />
          <MetricItem icon={MessageSquare} label="Aguard. resposta" value={snapshot.reclamacoes_aguardando} alert={snapshot.reclamacoes_aguardando > 0} />
          <MetricItem icon={MessageSquare} label="Pós-venda pend." value={snapshot.pos_venda_pendente} alert={snapshot.pos_venda_pendente > 0} onClick={() => navigate('/mensagens')} />
          <MetricItem icon={Scale} label="Mediações" value={snapshot.mediacoes_abertas} alert={snapshot.mediacoes_abertas > 0} />
        </div>

        {/* BLOCO 4 — COMERCIAL DA SEMANA */}
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Comercial</p>
          <MetricItem icon={DollarSign} label="Faturamento" value={fmtCurrency(Number(snapshot.total_vendas_semana))} onClick={() => navigate('/dashboard')} />
          <MetricItem icon={ShoppingCart} label="Pedidos" value={snapshot.pedidos_semana} />
          <MetricItem icon={TrendingUp} label="Ticket médio" value={fmtCurrency(Number(snapshot.ticket_medio))} />
          {snapshot.produto_mais_vendido && (
            <MetricItem icon={Star} label="Top produto" value={snapshot.produto_mais_vendido.substring(0, 25)} />
          )}
        </div>

        {/* BLOCO 5 — ADS ESSENCIAL */}
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">ADS</p>
          <MetricItem icon={Megaphone} label="Gasto" value={fmtCurrency(Number(snapshot.gasto_ads_semana))} onClick={() => navigate('/publicidade')} />
          <MetricItem icon={DollarSign} label="Faturamento ADS" value={fmtCurrency(Number(snapshot.faturamento_ads_semana))} />
          <MetricItem icon={TrendingUp} label="ACOS" value={`${Number(snapshot.acos_medio).toFixed(1)}%`} alert={Number(snapshot.acos_medio) > 30} />
          <MetricItem icon={TrendingUp} label="ROAS" value={`${Number(snapshot.roas_medio).toFixed(2)}x`} />
        </div>

        {/* Link to open full dashboard */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs gap-1"
          onClick={() => navigate('/dashboard')}
        >
          <ExternalLink className="h-3 w-3" />
          Abrir Dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
