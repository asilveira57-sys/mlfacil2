import { useState, useMemo, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Package, FileText, MessageCircle, Truck,
  AlertTriangle, MessageSquare, Scale,
  DollarSign, ShoppingCart, TrendingUp, Star,
  Megaphone, ExternalLink, ChevronRight, AlertCircle, Zap,
} from 'lucide-react';
import { getCompanyColor } from '@/lib/companyColors';
import type { SandboxSnapshot } from '@/hooks/useSandboxSnapshots';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  snapshot: SandboxSnapshot;
  isQuickSyncing?: boolean;
}

// ── Utilities ──────────────────────────────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}



function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtCurrency(v: number) {
  return `R$ ${fmt(v)}`;
}

async function logEvent(action: string, meta: Record<string, unknown> = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase.from('system_logs').insert({
      level: 'info',
      system_area: 'sandbox',
      action,
      message: `Sandbox: ${action}`,
      meta_json: { user_id: session.user.id, ...meta },
    });
  } catch { /* fire-and-forget */ }
}

// ── Sub-components ──────────────────────────────────────────────────────────

function MetricRow({
  icon: Icon, label, value, alert, onClick,
}: {
  icon: any; label: string; value: number | string; alert?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between w-full py-0.5 px-1 rounded text-left transition-colors ${onClick ? 'hover:bg-muted/60 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={`h-3 w-3 flex-shrink-0 ${alert ? 'text-destructive' : 'text-muted-foreground'}`} />
        <span className={`text-xs truncate ${alert ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
        <span className={`text-sm font-bold tabular-nums ${alert ? 'text-destructive' : 'text-foreground'}`}>
          {value}
        </span>
        {alert && typeof value === 'number' && value > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-destructive flex-shrink-0" />
        )}
      </div>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5 mt-1">
      {children}
    </p>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export function SandboxCompanyCard({ snapshot, isQuickSyncing = false }: Props) {
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const color = useMemo(() => getCompanyColor(snapshot.color_key || 'blue'), [snapshot.color_key]);

  const hasReclamacao = (snapshot.reclamacoes_abertas || 0) > 0;
  const hasUrgente = hasReclamacao || (snapshot.etiquetas_pendentes || 0) > 0 || (snapshot.perguntas_pendentes || 0) > 0;
  const isStale = (Date.now() - new Date(snapshot.updated_at).getTime()) > 30 * 60 * 1000;

  const openSheet = useCallback(() => {
    setSheetOpen(true);
    logEvent('card_expanded', { company_id: snapshot.company_id, seller_id: snapshot.seller_id });
  }, [snapshot.company_id, snapshot.seller_id]);

  const handleNavigate = useCallback((route: string, indicator: string) => {
    logEvent('indicator_click', { company_id: snapshot.company_id, indicator, route });
    navigate(route);
  }, [snapshot.company_id, navigate]);

  return (
    <>
      {/* ── COMPACT CARD ── */}
      <Card
        onClick={openSheet}
        className={`overflow-hidden cursor-pointer transition-all hover:shadow-md select-none
          ${hasReclamacao ? 'ring-1 ring-destructive/40' : ''}
          ${hasUrgente && !hasReclamacao ? 'ring-1 ring-yellow-500/30' : ''}`}
      >
        {/* Color bar */}
        <div className="h-1" style={{ backgroundColor: color.hex }} />

        {/* Header */}
        <div className="px-3 py-2 flex items-center justify-between border-b border-border/40">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-semibold text-xs truncate" style={{ color: color.hex }}>
              {snapshot.company_name}
            </h3>
            {hasReclamacao && (
              <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isQuickSyncing && (
              <span className="flex items-center gap-0.5 text-[9px] text-primary font-medium">
                <Zap className="h-2.5 w-2.5 animate-pulse" />
                sync
              </span>
            )}
            {isStale && !isQuickSyncing && (
              <span className="text-[9px] text-[hsl(var(--warning))] font-medium">⚠ atrasado</span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {formatRelativeTime(snapshot.updated_at)}
            </span>
          </div>
        </div>



        {/* Operation block */}
        <div className="px-3 py-1.5 border-b border-border/40">
          <SectionLabel>Operação</SectionLabel>
          <MetricRow icon={Package} label="Etiquetas" value={snapshot.etiquetas_pendentes} alert={snapshot.etiquetas_pendentes > 0} />
          <MetricRow icon={FileText} label="NF pendentes" value={snapshot.nf_pendentes} alert={snapshot.nf_pendentes > 0} />
          <MetricRow icon={Truck} label="Aguard. envio" value={snapshot.pedidos_envio} alert={snapshot.pedidos_envio > 5} />
          <MetricRow icon={ShoppingCart} label="Despachar amanhã" value={snapshot.vendas_despachar_amanha || 0} alert={(snapshot.vendas_despachar_amanha || 0) > 0} />
        </div>

        {/* Service block */}
        <div className="px-3 py-1.5">
          <SectionLabel>Atendimento</SectionLabel>
          <MetricRow icon={MessageCircle} label="Perguntas" value={snapshot.perguntas_pendentes} alert={snapshot.perguntas_pendentes > 0} />
          <MetricRow icon={AlertTriangle} label="Reclamações" value={snapshot.reclamacoes_abertas} alert={snapshot.reclamacoes_abertas > 0} />
          <MetricRow icon={MessageSquare} label="Pós-venda" value={snapshot.pos_venda_pendente} alert={snapshot.pos_venda_pendente > 0} />
          {snapshot.mediacoes_abertas > 0 && (
            <MetricRow icon={Scale} label="Mediações" value={snapshot.mediacoes_abertas} alert />
          )}
        </div>

        {/* Expand hint */}
        <div className="px-3 py-1.5 border-t border-border/30 bg-muted/10 flex items-center justify-center gap-1">
          <span className="text-[10px] text-muted-foreground/60">ADS e comercial</span>
          <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/50" />
        </div>
      </Card>

      {/* ── SHEET EXPANDED ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex flex-col p-0">
          {/* Sheet header */}
          <div className="px-6 pt-6 pb-4 border-b border-border" style={{ borderTop: `3px solid ${color.hex}` }}>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base pr-6" style={{ color: color.hex }}>
                {snapshot.company_name}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">
                Atualizado {formatRelativeTime(snapshot.updated_at)}
                {isStale && <span className="text-[hsl(var(--warning))] ml-1">· Atualização atrasada</span>}
              </p>
            </SheetHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">


            {/* Operação + Atendimento */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Operação & Atendimento</h4>
              <div className="space-y-0.5">
                <MetricRow icon={Package} label="Etiquetas pendentes" value={snapshot.etiquetas_pendentes} alert={snapshot.etiquetas_pendentes > 0} onClick={() => handleNavigate('/shipping-labels', 'etiquetas')} />
                <MetricRow icon={FileText} label="NF pendentes" value={snapshot.nf_pendentes} alert={snapshot.nf_pendentes > 0} />
                <MetricRow icon={Truck} label="Aguardando envio" value={snapshot.pedidos_envio} alert={snapshot.pedidos_envio > 5} onClick={() => handleNavigate('/shipping-labels', 'envio')} />
                <MetricRow icon={ShoppingCart} label="Despachar amanhã" value={snapshot.vendas_despachar_amanha || 0} alert={(snapshot.vendas_despachar_amanha || 0) > 0} />
                <MetricRow icon={MessageCircle} label="Perguntas" value={snapshot.perguntas_pendentes} alert={snapshot.perguntas_pendentes > 0} onClick={() => handleNavigate('/perguntas', 'perguntas')} />
                <MetricRow icon={AlertTriangle} label="Reclamações abertas" value={snapshot.reclamacoes_abertas} alert={snapshot.reclamacoes_abertas > 0} />
                <MetricRow icon={MessageSquare} label="Reclamações aguardando" value={snapshot.reclamacoes_aguardando} alert={snapshot.reclamacoes_aguardando > 0} />
                <MetricRow icon={MessageSquare} label="Pós-venda pendente" value={snapshot.pos_venda_pendente} alert={snapshot.pos_venda_pendente > 0} onClick={() => handleNavigate('/mensagens', 'pos-venda')} />
                {snapshot.mediacoes_abertas > 0 && (
                  <MetricRow icon={Scale} label="Mediações" value={snapshot.mediacoes_abertas} alert />
                )}
              </div>
            </div>

            <Separator />

            {/* Comercial da semana */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Comercial — Semana</h4>
              <div className="space-y-0.5">
                <MetricRow icon={DollarSign} label="Faturamento" value={fmtCurrency(Number(snapshot.total_vendas_semana))} onClick={() => handleNavigate('/dashboard', 'faturamento')} />
                <MetricRow icon={ShoppingCart} label="Pedidos" value={snapshot.pedidos_semana} />
                <MetricRow icon={TrendingUp} label="Ticket médio" value={fmtCurrency(Number(snapshot.ticket_medio))} />
                {snapshot.produto_mais_vendido && (
                  <MetricRow icon={Star} label="Top produto" value={snapshot.produto_mais_vendido.substring(0, 28)} />
                )}
              </div>
            </div>

            <Separator />

            {/* ADS */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">ADS — Semana</h4>
              <div className="space-y-0.5">
                <MetricRow icon={Megaphone} label="Gasto" value={fmtCurrency(Number(snapshot.gasto_ads_semana))} onClick={() => handleNavigate('/publicidade', 'ads-gasto')} />
                <MetricRow icon={DollarSign} label="Faturamento ADS" value={fmtCurrency(Number(snapshot.faturamento_ads_semana))} />
                <MetricRow
                  icon={TrendingUp}
                  label="ACOS médio"
                  value={`${Number(snapshot.acos_medio).toFixed(1)}%`}
                  alert={Number(snapshot.acos_medio) > 30}
                />
                <MetricRow icon={TrendingUp} label="ROAS médio" value={`${Number(snapshot.roas_medio).toFixed(2)}x`} />
              </div>
            </div>
          </div>

          {/* Shortcuts */}
          <div className="px-6 py-4 border-t border-border bg-muted/20">
            <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Atalhos</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Etiquetas', route: '/shipping-labels', icon: Package },
                { label: 'Perguntas', route: '/perguntas', icon: MessageCircle },
                { label: 'Dashboard', route: '/dashboard', icon: TrendingUp },
                { label: 'Publicidade', route: '/publicidade', icon: Megaphone },
              ].map(({ label, route, icon: Icon }) => (
                <Button
                  key={label}
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 justify-start"
                  onClick={() => { handleNavigate(route, label.toLowerCase()); setSheetOpen(false); }}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                  <ExternalLink className="h-2.5 w-2.5 ml-auto opacity-50" />
                </Button>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
