import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Brain,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Target,
  Shield,
  ChevronDown,
  ChevronRight,
  Clock,
  Zap,
  DollarSign,
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ArrowRight,
  Lightbulb,
} from 'lucide-react';
import { useAdsAiConsultant, PriorityAction, Risk, Opportunity } from '@/hooks/useAdsAiConsultant';
import { cn } from '@/lib/utils';

interface AdsAiConsultantProps {
  sellerId: string;
}

export function AdsAiConsultant({ sellerId }: AdsAiConsultantProps) {
  const { loading, error, analysis, generatedAt, runAnalysis, clearAnalysis } = useAdsAiConsultant(sellerId);
  const [activeTab, setActiveTab] = useState('actions');
  const [expandedActions, setExpandedActions] = useState<Set<number>>(new Set([0, 1, 2]));

  const toggleAction = (index: number) => {
    setExpandedActions(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-success bg-success/10 border-success/30';
      case 'healthy': return 'text-blue-500 bg-blue-500/10 border-blue-500/30';
      case 'warning': return 'text-warning bg-warning/10 border-warning/30';
      case 'critical': return 'text-destructive bg-destructive/10 border-destructive/30';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getHealthLabel = (status: string) => {
    switch (status) {
      case 'excellent': return 'Excelente';
      case 'healthy': return 'Saudável';
      case 'warning': return 'Atenção';
      case 'critical': return 'Crítico';
      default: return status;
    }
  };

  const getRiskColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
      case 'medium': return 'bg-warning/10 text-warning border-warning/30';
      case 'low': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted';
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'immediate': return <Zap className="h-3.5 w-3.5 text-destructive" />;
      case 'this_week': return <Clock className="h-3.5 w-3.5 text-warning" />;
      case 'this_month': return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
      default: return null;
    }
  };

  const getUrgencyLabel = (urgency: string) => {
    switch (urgency) {
      case 'immediate': return 'Imediato';
      case 'this_week': return 'Esta semana';
      case 'this_month': return 'Este mês';
      default: return urgency;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'budget': return <DollarSign className="h-4 w-4" />;
      case 'optimization': return <Settings className="h-4 w-4" />;
      case 'expansion': return <TrendingUp className="h-4 w-4" />;
      case 'reduction': return <MinusCircle className="h-4 w-4" />;
      case 'monitoring': return <Target className="h-4 w-4" />;
      default: return <CheckCircle2 className="h-4 w-4" />;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'budget': return 'Orçamento';
      case 'optimization': return 'Otimização';
      case 'expansion': return 'Expansão';
      case 'reduction': return 'Redução';
      case 'monitoring': return 'Monitoramento';
      default: return category;
    }
  };

  const getEffortBadge = (effort: string) => {
    switch (effort) {
      case 'low': return <Badge variant="outline" className="bg-success/10 text-success">Baixo esforço</Badge>;
      case 'medium': return <Badge variant="outline" className="bg-warning/10 text-warning">Médio esforço</Badge>;
      case 'high': return <Badge variant="outline" className="bg-destructive/10 text-destructive">Alto esforço</Badge>;
      default: return null;
    }
  };

  // Empty state - no analysis yet
  if (!analysis && !loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Brain className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Consultor de IA Estratégico</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Analise suas campanhas com inteligência artificial e receba recomendações 
                priorizadas para otimizar seus resultados de publicidade.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <Button onClick={() => runAnalysis('full')} className="gap-2">
                <Sparkles className="h-4 w-4" />
                Gerar Análise Estratégica
              </Button>
              <Button variant="outline" onClick={() => runAnalysis('quick')}>
                Análise Rápida
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Analisando dados...</CardTitle>
              <CardDescription>O consultor de IA está processando suas campanhas</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Health Score */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Consultor de IA Estratégico</CardTitle>
                <CardDescription>
                  Análise gerada em {generatedAt ? new Date(generatedAt).toLocaleString('pt-BR') : ''}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => runAnalysis('full')} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Health Score Card */}
          <div className={cn(
            "p-4 rounded-lg border flex items-center justify-between",
            getHealthColor(analysis?.health_status || '')
          )}>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold">{analysis?.health_score}</div>
                <div className="text-xs opacity-80">de 100</div>
              </div>
              <div>
                <div className="font-semibold flex items-center gap-2">
                  Saúde do ADS: {getHealthLabel(analysis?.health_status || '')}
                  {analysis?.health_status === 'excellent' && <CheckCircle2 className="h-4 w-4" />}
                  {analysis?.health_status === 'critical' && <XCircle className="h-4 w-4" />}
                </div>
              </div>
            </div>
            {analysis?.performance_trends && (
              <div className="hidden md:flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <span className="opacity-70">ACOS:</span>
                  <TrendBadge trend={analysis.performance_trends.acos_trend} inverted />
                </div>
                <div className="flex items-center gap-1">
                  <span className="opacity-70">ROAS:</span>
                  <TrendBadge trend={analysis.performance_trends.roas_trend} />
                </div>
              </div>
            )}
          </div>

          {/* Executive Summary */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm leading-relaxed">{analysis?.executive_summary}</p>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="actions" className="gap-2">
                <Target className="h-4 w-4" />
                <span className="hidden sm:inline">Ações</span>
                {analysis?.priority_actions && (
                  <Badge variant="secondary" className="ml-1">{analysis.priority_actions.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="risks" className="gap-2">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Riscos</span>
                {analysis?.risks && (
                  <Badge variant="secondary" className="ml-1">{analysis.risks.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="opportunities" className="gap-2">
                <Lightbulb className="h-4 w-4" />
                <span className="hidden sm:inline">Oportunidades</span>
                {analysis?.opportunities && (
                  <Badge variant="secondary" className="ml-1">{analysis.opportunities.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="next" className="gap-2">
                <ArrowRight className="h-4 w-4" />
                <span className="hidden sm:inline">Próximos Passos</span>
              </TabsTrigger>
            </TabsList>

            {/* Priority Actions Tab */}
            <TabsContent value="actions" className="mt-6">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-3">
                  {analysis?.priority_actions?.map((action, index) => (
                    <ActionCard
                      key={index}
                      action={action}
                      isExpanded={expandedActions.has(index)}
                      onToggle={() => toggleAction(index)}
                      getUrgencyIcon={getUrgencyIcon}
                      getUrgencyLabel={getUrgencyLabel}
                      getCategoryIcon={getCategoryIcon}
                      getCategoryLabel={getCategoryLabel}
                      getRiskColor={getRiskColor}
                    />
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Risks Tab */}
            <TabsContent value="risks" className="mt-6">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-3">
                  {analysis?.risks?.map((risk, index) => (
                    <RiskCard key={index} risk={risk} getRiskColor={getRiskColor} />
                  ))}
                  {(!analysis?.risks || analysis.risks.length === 0) && (
                    <EmptyState icon={Shield} message="Nenhum risco identificado" />
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Opportunities Tab */}
            <TabsContent value="opportunities" className="mt-6">
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-3">
                  {analysis?.opportunities?.map((opp, index) => (
                    <OpportunityCard key={index} opportunity={opp} getEffortBadge={getEffortBadge} />
                  ))}
                  {(!analysis?.opportunities || analysis.opportunities.length === 0) && (
                    <EmptyState icon={Lightbulb} message="Nenhuma oportunidade identificada" />
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Next Steps Tab */}
            <TabsContent value="next" className="mt-6">
              <div className="space-y-4">
                {/* Rule Analysis Summary */}
                {analysis?.rule_analysis && (
                  <Card className="border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Análise das Regras
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-muted-foreground">Violações:</span>{' '}
                          <span className="font-medium">{analysis.rule_analysis.total_violations}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Oportunidades:</span>{' '}
                          <span className="font-medium">{analysis.rule_analysis.total_opportunities}</span>
                        </div>
                      </div>
                      {analysis.rule_analysis.most_triggered_rule && (
                        <p className="text-muted-foreground">
                          Regra mais acionada: <span className="text-foreground">{analysis.rule_analysis.most_triggered_rule}</span>
                        </p>
                      )}
                      {analysis.rule_analysis.rule_effectiveness_note && (
                        <p className="text-muted-foreground mt-2">{analysis.rule_analysis.rule_effectiveness_note}</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Next Steps List */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    Próximos Passos Recomendados
                  </h4>
                  <ol className="space-y-2">
                    {analysis?.next_steps?.map((step, index) => (
                      <li key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="text-sm">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Performance Trends */}
                {analysis?.performance_trends && (
                  <Card className="border-border/50 mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Tendências de Performance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm">
                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div className="text-center">
                          <div className="text-muted-foreground text-xs mb-1">ACOS</div>
                          <TrendBadge trend={analysis.performance_trends.acos_trend} inverted large />
                        </div>
                        <div className="text-center">
                          <div className="text-muted-foreground text-xs mb-1">ROAS</div>
                          <TrendBadge trend={analysis.performance_trends.roas_trend} large />
                        </div>
                        <div className="text-center">
                          <div className="text-muted-foreground text-xs mb-1">Gasto</div>
                          <TrendBadge trend={analysis.performance_trends.spend_trend} large />
                        </div>
                      </div>
                      {analysis.performance_trends.trend_explanation && (
                        <p className="text-muted-foreground text-xs">{analysis.performance_trends.trend_explanation}</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// Sub-components
function ActionCard({
  action,
  isExpanded,
  onToggle,
  getUrgencyIcon,
  getUrgencyLabel,
  getCategoryIcon,
  getCategoryLabel,
  getRiskColor,
}: {
  action: PriorityAction;
  isExpanded: boolean;
  onToggle: () => void;
  getUrgencyIcon: (urgency: string) => React.ReactNode;
  getUrgencyLabel: (urgency: string) => string;
  getCategoryIcon: (category: string) => React.ReactNode;
  getCategoryLabel: (category: string) => string;
  getRiskColor: (severity: string) => string;
}) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="border rounded-lg overflow-hidden">
        <CollapsibleTrigger className="w-full p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center">
            {action.priority}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">{action.action}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                {getCategoryIcon(action.category)}
                {getCategoryLabel(action.category)}
              </span>
              <span className="inline-flex items-center gap-1 text-xs">
                {getUrgencyIcon(action.urgency)}
                {getUrgencyLabel(action.urgency)}
              </span>
              <Badge variant="outline" className={cn("text-xs", getRiskColor(action.risk_level))}>
                Risco {action.risk_level === 'low' ? 'baixo' : action.risk_level === 'medium' ? 'médio' : 'alto'}
              </Badge>
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 ml-11 space-y-3 text-sm">
            <div>
              <span className="text-muted-foreground">Por quê: </span>
              {action.rationale}
            </div>
            <div>
              <span className="text-muted-foreground">Impacto esperado: </span>
              {action.expected_impact}
            </div>
            {action.affected_items && action.affected_items.length > 0 && (
              <div>
                <span className="text-muted-foreground">Itens afetados: </span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {action.affected_items.slice(0, 5).map((item, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{item}</Badge>
                  ))}
                  {action.affected_items.length > 5 && (
                    <Badge variant="secondary" className="text-xs">+{action.affected_items.length - 5}</Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function RiskCard({ risk, getRiskColor }: { risk: Risk; getRiskColor: (severity: string) => string }) {
  return (
    <div className={cn("p-4 rounded-lg border", getRiskColor(risk.severity))}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div className="space-y-2">
          <div className="font-medium">{risk.risk}</div>
          <div className="text-sm opacity-80">
            <span className="font-medium">Mitigação: </span>
            {risk.mitigation}
          </div>
        </div>
      </div>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  getEffortBadge,
}: {
  opportunity: Opportunity;
  getEffortBadge: (effort: string) => React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-lg border border-success/30 bg-success/5">
      <div className="flex items-start gap-3">
        <Lightbulb className="h-5 w-5 flex-shrink-0 mt-0.5 text-success" />
        <div className="flex-1 space-y-2">
          <div className="font-medium">{opportunity.opportunity}</div>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Valor potencial: </span>
            {opportunity.potential_value}
          </div>
          <div>{getEffortBadge(opportunity.effort_required)}</div>
        </div>
      </div>
    </div>
  );
}

function TrendBadge({ trend, inverted = false, large = false }: { trend: string; inverted?: boolean; large?: boolean }) {
  const isPositive = inverted
    ? (trend === 'declining' || trend === 'decreasing')
    : (trend === 'improving' || trend === 'increasing');
  const isNegative = inverted
    ? (trend === 'improving' || trend === 'increasing')
    : (trend === 'declining' || trend === 'decreasing');

  const label = trend === 'improving' ? '↑ Melhorando'
    : trend === 'declining' ? '↓ Piorando'
    : trend === 'increasing' ? '↑ Aumentando'
    : trend === 'decreasing' ? '↓ Diminuindo'
    : '→ Estável';

  return (
    <span className={cn(
      "inline-flex items-center rounded px-2 py-0.5",
      large ? "text-sm" : "text-xs",
      isPositive && "bg-success/10 text-success",
      isNegative && "bg-destructive/10 text-destructive",
      !isPositive && !isNegative && "bg-muted text-muted-foreground"
    )}>
      {label}
    </span>
  );
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Icon className="h-12 w-12 mx-auto mb-3 opacity-50" />
      <p>{message}</p>
    </div>
  );
}
