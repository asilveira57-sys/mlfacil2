import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { 
  Edit, 
  Trash2, 
  AlertTriangle, 
  TrendingUp,
  Clock,
  Zap,
} from 'lucide-react';
import type { AdsRule } from '@/types/ads-rules';
import { 
  METRIC_LABELS, 
  OPERATOR_LABELS, 
  COMPARE_WITH_LABELS,
  PERIOD_LABELS,
  EXTRA_CONDITION_LABELS,
} from '@/types/ads-rules';

interface AdsRuleCardProps {
  rule: AdsRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

export function AdsRuleCard({ rule, onEdit, onDelete, onToggle }: AdsRuleCardProps) {
  const isViolation = rule.event_type === 'violation';

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'high': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case 'medium': return 'bg-warning/10 text-warning border-warning/20';
      case 'low': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatCondition = (condition: AdsRule['conditions'][0]) => {
    const metric = METRIC_LABELS[condition.metric] || condition.metric;
    const operator = OPERATOR_LABELS[condition.operator] || condition.operator;
    const compareWith = condition.compare_with === 'fixed_value' 
      ? condition.fixed_value?.toString() || '0'
      : COMPARE_WITH_LABELS[condition.compare_with];
    
    return `${metric} ${operator} ${compareWith}`;
  };

  return (
    <Card className={`transition-all ${!rule.is_enabled ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
              isViolation ? 'bg-destructive/10' : 'bg-success/10'
            }`}>
              {isViolation ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : (
                <TrendingUp className="h-4 w-4 text-success" />
              )}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base truncate">{rule.name}</CardTitle>
              {rule.description && (
                <p className="text-xs text-muted-foreground truncate">{rule.description}</p>
              )}
            </div>
          </div>
          <Switch
            checked={rule.is_enabled}
            onCheckedChange={onToggle}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={getSeverityColor(rule.severity)}>
            {rule.severity === 'critical' ? 'Crítico' :
             rule.severity === 'high' ? 'Alto' :
             rule.severity === 'medium' ? 'Médio' : 'Baixo'}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            {isViolation ? 'Violação' : 'Oportunidade'}
          </Badge>
          {rule.trigger_count > 0 && (
            <Badge variant="outline" className="gap-1">
              <Zap className="h-3 w-3" />
              {rule.trigger_count}x
            </Badge>
          )}
        </div>

        {/* Conditions */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase">Condições</p>
          <div className="space-y-1">
            {rule.conditions.length === 0 && rule.extra_conditions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhuma condição definida</p>
            ) : (
              <>
                {rule.conditions.map((cond, i) => (
                  <div key={i} className="text-sm flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span>{formatCondition(cond)}</span>
                    <span className="text-muted-foreground text-xs">
                      ({PERIOD_LABELS[cond.period_days]})
                    </span>
                  </div>
                ))}
                {rule.extra_conditions.filter(e => e.enabled).map((extra, i) => (
                  <div key={`extra-${i}`} className="text-sm flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                    <span>{EXTRA_CONDITION_LABELS[extra.type]}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Last triggered */}
        {rule.last_triggered_at && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Último disparo: {new Date(rule.last_triggered_at).toLocaleDateString('pt-BR')}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="h-4 w-4 mr-1" />
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" />
            Excluir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
