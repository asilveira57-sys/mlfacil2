import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, 
  Play, 
  Settings2, 
  AlertTriangle, 
  TrendingUp, 
  Trash2, 
  Edit,
  Zap,
} from 'lucide-react';
import { useAdsRules, useAdsRuleEvents } from '@/hooks/useAdsRules';
import { AdsRuleEditor } from './AdsRuleEditor';
import { AdsRuleCard } from './AdsRuleCard';
import { AdsRuleEventsPanel } from './AdsRuleEventsPanel';
import type { AdsRule } from '@/types/ads-rules';

interface AdsRulesPanelProps {
  sellerId: string;
}

export function AdsRulesPanel({ sellerId }: AdsRulesPanelProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AdsRule | null>(null);
  const [showEvents, setShowEvents] = useState(false);

  const { 
    rules, 
    loading, 
    createRule, 
    updateRule, 
    deleteRule, 
    toggleRule,
    evaluateRules 
  } = useAdsRules(sellerId);
  
  const { events, loading: eventsLoading } = useAdsRuleEvents(sellerId);

  const handleCreateRule = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  const handleEditRule = (rule: AdsRule) => {
    setEditingRule(rule);
    setEditorOpen(true);
  };

  const handleSaveRule = async (rule: Partial<AdsRule>) => {
    if (editingRule) {
      await updateRule(editingRule.id, rule);
    } else {
      await createRule(rule);
    }
    setEditorOpen(false);
    setEditingRule(null);
  };

  const enabledRules = rules.filter(r => r.is_enabled);
  const violationEvents = events.filter(e => e.event_type === 'violation');
  const opportunityEvents = events.filter(e => e.event_type === 'opportunity');

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats and actions */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold">Motor de Regras</h2>
          <p className="text-sm text-muted-foreground">
            Configure regras para monitorar métricas e receber alertas automáticos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={evaluateRules}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Avaliar agora
          </Button>
          <Button size="sm" onClick={handleCreateRule} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova regra
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Settings2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rules.length}</p>
                <p className="text-sm text-muted-foreground">Regras criadas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{enabledRules.length}</p>
                <p className="text-sm text-muted-foreground">Regras ativas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-destructive/50 transition-colors"
          onClick={() => setShowEvents(true)}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{violationEvents.length}</p>
                <p className="text-sm text-muted-foreground">Violações</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setShowEvents(true)}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{opportunityEvents.length}</p>
                <p className="text-sm text-muted-foreground">Oportunidades</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Settings2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-2">Nenhuma regra configurada</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Crie regras para monitorar métricas como ACOS, ROAS e margem. 
              Receba alertas quando as condições forem atingidas.
            </p>
            <Button onClick={handleCreateRule} className="gap-2">
              <Plus className="h-4 w-4" />
              Criar primeira regra
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rules.map(rule => (
            <AdsRuleCard
              key={rule.id}
              rule={rule}
              onEdit={() => handleEditRule(rule)}
              onDelete={() => deleteRule(rule.id)}
              onToggle={(enabled) => toggleRule(rule.id, enabled)}
            />
          ))}
        </div>
      )}

      {/* Rule Editor Modal */}
      <AdsRuleEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        rule={editingRule}
        onSave={handleSaveRule}
      />

      {/* Events Panel (Drawer) */}
      <AdsRuleEventsPanel
        open={showEvents}
        onOpenChange={setShowEvents}
        events={events}
        loading={eventsLoading}
      />
    </div>
  );
}
