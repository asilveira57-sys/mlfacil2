import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFreightRulesets } from '@/hooks/useFreightRulesets';
import { Table2, Plus, Check, Calendar, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function FreightRulesetsTab() {
  const { rulesets, activeRuleset, loading, setActiveRulesetId } = useFreightRulesets();
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Tabela
        </Button>
      </div>

      {rulesets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Table2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Nenhuma tabela de frete cadastrada</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
              Cadastre a tabela de frete do Mercado Livre para calcular custos esperados automaticamente.
            </p>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Cadastrar Tabela
            </Button>
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
    </div>
  );
}
