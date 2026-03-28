import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFreightRulesets } from '@/hooks/useFreightRulesets';
import { Table2, Plus, Check, Calendar, FileText, Search, PenLine, Globe, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { FreightApiQueryDialog } from './FreightApiQueryDialog';
import { FreightCreateDialog } from './FreightCreateDialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function FreightRulesetsTab() {
  const { rulesets, activeRuleset, loading, setActiveRulesetId, createRuleset, refetch } = useFreightRulesets();
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const handleSaveFromApi = async (results: any[], meta: any) => {
    try {
      const validResults = results.filter(r => r.list_cost !== null);
      if (validResults.length === 0) {
        toast({ title: 'Nenhum resultado válido para salvar', variant: 'destructive' });
        return;
      }

      const name = `Tabela ML API - ${meta.listing_type_id} - ${meta.logistic_type} - ${new Date().toLocaleDateString('pt-BR')}`;
      
      await createRuleset(
        {
          name,
          description: `Gerada via API ML. Categoria: ${meta.category_id || 'todas'}. ${meta.successful}/${meta.total_queries} consultas.`,
          marketplace: 'mercadolivre',
          country: 'BR',
          status: 'active',
          valid_from: new Date().toISOString().split('T')[0],
          valid_until: null,
        },
        validResults.map((r, i) => ({
          logistic_mode: r.logistic_type,
          ad_type: r.listing_type,
          weight_min: r.weight,
          weight_max: null,
          price_band_min: r.price,
          price_band_max: null,
          seller_pays_value: r.free_shipping ? 0 : (r.list_cost ?? 0),
          seller_pays_formula: null,
          dimensions_limit_policy: null,
          dimensions_limit_value: null,
          subsidy_type: r.free_shipping ? 'full' as const : 'none' as const,
          subsidy_value: r.free_shipping ? (r.list_cost ?? 0) : 0,
          is_free_shipping: r.free_shipping,
          notes: r.discount_rate ? `Desconto: ${(r.discount_rate * 100).toFixed(0)}%` : null,
          sort_order: i,
        }))
      );

      toast({ title: 'Tabela salva com sucesso!' });
      setApiDialogOpen(false);
    } catch (err) {
      toast({
        title: 'Erro ao salvar tabela',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Tabelas de Frete Mercado Livre</h2>
          <p className="text-sm text-muted-foreground">
            Versões da tabela de frete oficial. Selecione a versão ativa para cálculos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setApiDialogOpen(true)}>
            <Search className="h-4 w-4" />
            Consultar API ML
          </Button>
          <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
            <PenLine className="h-4 w-4" />
            Cadastrar Manual
          </Button>
        </div>
      </div>

      {rulesets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Table2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Nenhuma tabela de frete cadastrada</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
              Consulte a tabela oficial direto da API do Mercado Livre, ou cadastre manualmente.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => setApiDialogOpen(true)}>
                <Search className="h-4 w-4" />
                Consultar API
              </Button>
              <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
                <PenLine className="h-4 w-4" />
                Cadastrar Manual
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rulesets.map((ruleset) => (
            <Card 
              key={ruleset.id}
              className={activeRuleset?.id === ruleset.id ? 'border-primary' : ''}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{ruleset.name}</CardTitle>
                      {activeRuleset?.id === ruleset.id && (
                        <Badge variant="default" className="gap-1">
                          <Check className="h-3 w-3" />
                          Ativa
                        </Badge>
                      )}
                      <Badge variant={ruleset.status === 'active' ? 'secondary' : 'outline'}>
                        {ruleset.status === 'active' ? 'Publicada' : ruleset.status}
                      </Badge>
                    </div>
                    <CardDescription className="mt-1 flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Válida desde {format(new Date(ruleset.valid_from), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                      {ruleset.description && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {ruleset.description}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {activeRuleset?.id !== ruleset.id && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setActiveRulesetId(ruleset.id)}
                      >
                        Usar esta tabela
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setExpandedId(expandedId === ruleset.id ? null : ruleset.id)}
                    >
                      {expandedId === ruleset.id ? 'Ocultar' : 'Ver regras'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {expandedId === ruleset.id && (
                <CardContent className="pt-0">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Detalhes das regras serão exibidos aqui.
                      <br />
                      Configure as faixas de peso, preço e valores de frete.
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <FreightApiQueryDialog
        open={apiDialogOpen}
        onOpenChange={setApiDialogOpen}
        onSaveAsRuleset={handleSaveFromApi}
      />
      <FreightCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={refetch}
      />
    </div>
  );
}
