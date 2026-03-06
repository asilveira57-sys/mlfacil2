import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import {
  Rocket, TrendingUp, Target, ShoppingCart, DollarSign,
  BarChart3, Lightbulb, ArrowRight, Sparkles, Activity,
  Package, AlertTriangle, Zap, Crown, FileText, Presentation, ExternalLink,
} from 'lucide-react';
import type { Retrospective } from '@/hooks/useRetrospectiveEngine';

function fmt(val: number | null | undefined, decimals = 2): string {
  return Number(val ?? 0).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

interface Props {
  report: Retrospective;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrialRetrospectiveViewer({ report, open, onOpenChange }: Props) {
  const summary = report.summary_json as any;
  if (!summary) return null;

  const narrative = summary.trial_narrative;
  const current = summary.current ?? {};
  const evolution = summary.evolution;
  const isConversion = narrative?.cta?.type === 'trial_conversion';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        {/* Hero Header */}
        <div className={`p-8 text-center ${isConversion ? 'bg-gradient-to-br from-primary/10 via-primary/5 to-background' : 'bg-muted/30'}`}>
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              {isConversion ? <Rocket className="h-8 w-8 text-primary" /> : <Sparkles className="h-8 w-8 text-primary" />}
            </div>
          </div>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {narrative?.opening?.headline || 'Retrospectiva de 14 Dias'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2">
            {report.period_start} — {report.period_end}
          </p>
          {isConversion && (
            <Badge variant="outline" className="mt-3 border-primary/30 text-primary">
              <Crown className="h-3 w-3 mr-1" /> Período de Teste
            </Badge>
          )}
          {(report.html_url || report.presentation_url) && (
            <div className="flex gap-2 justify-center mt-4">
              {report.html_url && (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={report.html_url} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-3.5 w-3.5" /> Relatório HTML
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
              {report.presentation_url && (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={report.presentation_url} target="_blank" rel="noopener noreferrer">
                    <Presentation className="h-3.5 w-3.5" /> Slides
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-6 space-y-8">
            {/* Opening Narrative */}
            {narrative?.opening && (
              <div className="space-y-3 text-sm leading-relaxed">
                <p className="text-muted-foreground">{narrative.opening.initial_state}</p>
                <p className="text-muted-foreground">{narrative.opening.analysis}</p>
              </div>
            )}

            {/* Performance KPIs */}
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
                <Activity className="h-5 w-5 text-primary" />
                Performance no Período
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KpiCard icon={ShoppingCart} label="Pedidos" value={String(current.orders ?? 0)} />
                <KpiCard icon={DollarSign} label="Faturamento" value={`R$ ${fmt(current.revenue)}`} highlight />
                <KpiCard icon={Target} label="Ticket Médio" value={`R$ ${fmt(current.ticket)}`} />
                <KpiCard icon={BarChart3} label="Margem" value={`${fmt(current.margin, 1)}%`} />
                <KpiCard icon={TrendingUp} label="Lucro Est." value={`R$ ${fmt(current.profit)}`} highlight />
                <KpiCard icon={Package} label="Anúncios Ativos" value={String(current.listings ?? 0)} />
              </div>
            </div>

            {/* Evolution */}
            {evolution && (
              <div className="border rounded-lg p-4 bg-muted/20">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Evolução vs. Entrada
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {evolution.orders_growth_pct != null && (
                    <div>
                      <span className="text-muted-foreground">Pedidos</span>
                      <p className={`font-bold text-lg ${evolution.orders_growth_pct > 0 ? 'text-primary' : evolution.orders_growth_pct < 0 ? 'text-destructive' : ''}`}>
                        {evolution.orders_growth_pct > 0 ? '+' : ''}{Number(evolution.orders_growth_pct).toFixed(1)}%
                      </p>
                      <span className="text-xs text-muted-foreground">({evolution.orders_delta > 0 ? '+' : ''}{evolution.orders_delta} pedidos)</span>
                    </div>
                  )}
                  {evolution.revenue_growth_pct != null && (
                    <div>
                      <span className="text-muted-foreground">Faturamento</span>
                      <p className={`font-bold text-lg ${evolution.revenue_growth_pct > 0 ? 'text-primary' : evolution.revenue_growth_pct < 0 ? 'text-destructive' : ''}`}>
                        {evolution.revenue_growth_pct > 0 ? '+' : ''}{Number(evolution.revenue_growth_pct).toFixed(1)}%
                      </p>
                      <span className="text-xs text-muted-foreground">({evolution.revenue_delta > 0 ? '+' : ''}R$ {fmt(evolution.revenue_delta)})</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Module Usage */}
            {narrative?.module_usage && (
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
                  <Zap className="h-5 w-5 text-primary" />
                  Uso da Plataforma
                </h3>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-primary">{narrative.module_usage.total_actions}</p>
                    <p className="text-xs text-muted-foreground">Ações Realizadas</p>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold">{narrative.module_usage.modules_used?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Módulos Utilizados</p>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <Badge variant={
                      narrative.module_usage.engagement_level === 'alto' ? 'default' :
                      narrative.module_usage.engagement_level === 'moderado' ? 'secondary' : 'outline'
                    } className="text-sm">
                      {narrative.module_usage.engagement_level === 'alto' ? '🔥 Alto' :
                       narrative.module_usage.engagement_level === 'moderado' ? '⚡ Moderado' : '🌱 Inicial'}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">Engajamento</p>
                  </div>
                </div>
                {narrative.module_usage.modules_used?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {narrative.module_usage.modules_used.map((mod: string) => (
                      <Badge key={mod} variant="outline" className="text-xs capitalize">
                        {mod} ({narrative.module_usage.breakdown?.[mod] || 0})
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Opportunities */}
            {narrative?.discoveries?.opportunities?.length > 0 && (
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5 text-accent-foreground" />
                  Oportunidades Identificadas
                </h3>
                <div className="space-y-2">
                  {narrative.discoveries.opportunities.map((opp: string, i: number) => (
                    <div key={i} className="flex items-start gap-3 border rounded-lg p-3 bg-accent/30">
                      <AlertTriangle className="h-4 w-4 text-accent-foreground mt-0.5 shrink-0" />
                      <p className="text-sm">{opp}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Projections */}
            {narrative?.projections && (
              <div className="border rounded-lg p-4 bg-primary/5">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Projeções de Crescimento
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Faturamento Mensal Est.</span>
                    <p className="text-xl font-bold text-primary">
                      R$ {fmt(narrative.projections.monthly_revenue_estimate)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Faturamento Anual Est.</span>
                    <p className="text-xl font-bold">
                      R$ {fmt(narrative.projections.annual_revenue_estimate)}
                    </p>
                  </div>
                  {narrative.projections.monthly_profit_estimate != null && (
                    <div>
                      <span className="text-muted-foreground">Lucro Mensal Est.</span>
                      <p className="text-lg font-bold text-primary">
                        R$ {fmt(narrative.projections.monthly_profit_estimate)}
                      </p>
                    </div>
                  )}
                  {narrative.projections.growth_potential && (
                    <div>
                      <span className="text-muted-foreground">Potencial</span>
                      <p className="text-sm font-medium">{narrative.projections.growth_potential}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* CTA */}
            {narrative?.cta && (
              <Card className={`overflow-hidden ${isConversion ? 'border-primary/30 bg-gradient-to-br from-primary/5 to-background' : 'border-muted'}`}>
                <CardContent className="p-6 text-center space-y-4">
                  <h3 className="text-xl font-bold">{narrative.cta.headline}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {narrative.cta.primary_message}
                  </p>

                  {narrative.cta.supporting_points?.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                      {narrative.cta.supporting_points.map((point: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                          <span>{point}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {isConversion && narrative.cta.urgency && (
                    <p className="text-xs text-destructive font-medium mt-2">
                      ⚠️ {narrative.cta.urgency}
                    </p>
                  )}

                  {narrative.cta.show_upgrade_button && (
                    <Button size="lg" className="gap-2 mt-4">
                      <Crown className="h-4 w-4" />
                      Ativar Meu Plano
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Footer */}
            <div className="text-center text-xs text-muted-foreground pt-4 border-t">
              Relatório gerado automaticamente pela plataforma • {new Date().getFullYear()}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({ icon: Icon, label, value, highlight }: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-lg font-bold ${highlight ? 'text-primary' : ''}`}>{value}</p>
    </div>
  );
}
