import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, AlertTriangle, Pause, Play } from "lucide-react";
import { usePostSaleAutomationRules, usePostSaleTemplates, useToggleAutomationRule, useCreateAutomationRule } from "@/hooks/usePostSaleMessages";
import { triggerEventLabels, messageTypeLabels } from "@/types/post-sale";
import { toast } from "sonner";

export function PostSaleAutomation() {
  const { data: rules, isLoading: rulesLoading } = usePostSaleAutomationRules();
  const { data: templates, isLoading: templatesLoading } = usePostSaleTemplates();
  const toggleMutation = useToggleAutomationRule();
  const createMutation = useCreateAutomationRule();

  const isLoading = rulesLoading || templatesLoading;

  // Get templates without automation rules
  const templatesWithoutRules = templates?.filter(
    (t) => !rules?.some((r) => r.template_id === t.id)
  );

  const handleToggleRule = async (ruleId: string, currentState: boolean) => {
    try {
      await toggleMutation.mutateAsync({ id: ruleId, is_active: !currentState });
      toast.success(!currentState ? "Automação ativada" : "Automação pausada");
    } catch {
      toast.error("Erro ao atualizar automação");
    }
  };

  const handleCreateRule = async (templateId: string) => {
    try {
      await createMutation.mutateAsync({
        template_id: templateId,
        is_active: false,
        require_approval: true,
      });
      toast.success("Regra de automação criada");
    } catch {
      toast.error("Erro ao criar regra");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Automação de Envio</h2>
        <p className="text-sm text-muted-foreground">
          Configure o envio automático de mensagens por evento
        </p>
      </div>

      {/* Warning */}
      <Card className="p-4 border-amber-500/50 bg-amber-500/10">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Princípio de Segurança
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Toda mensagem automática passa por validação antes do envio. 
              Se houver dúvida, o sistema escolhe NÃO ENVIAR.
            </p>
          </div>
        </div>
      </Card>

      {/* Active Rules */}
      {rules && rules.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Regras Configuradas</h3>
          {rules.map((rule) => {
            const template = rule.post_sale_templates;
            if (!template) return null;

            return (
              <Card key={rule.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      rule.is_active ? "bg-primary/10" : "bg-muted"
                    }`}>
                      <Bot className={`h-5 w-5 ${rule.is_active ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-foreground">{template.name}</h4>
                        <Badge variant={rule.is_active ? "default" : "secondary"} className="text-xs">
                          {rule.is_active ? "Ativo" : "Pausado"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {triggerEventLabels[template.trigger_event]}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {messageTypeLabels[template.message_type]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {rule.require_approval && (
                          <span>• Requer aprovação</span>
                        )}
                        {rule.wait_for_buyer_response && (
                          <span>• Aguarda resposta do comprador</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleRule(rule.id, rule.is_active)}
                      disabled={toggleMutation.isPending}
                    >
                      {rule.is_active ? (
                        <>
                          <Pause className="h-4 w-4 mr-1" />
                          Pausar
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Ativar
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Templates without rules */}
      {templatesWithoutRules && templatesWithoutRules.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Templates Disponíveis para Automação</h3>
          {templatesWithoutRules.map((template) => (
            <Card key={template.id} className="p-4 bg-muted/30">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-medium text-foreground">{template.name}</h4>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {triggerEventLabels[template.trigger_event]}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {messageTypeLabels[template.message_type]}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCreateRule(template.id)}
                  disabled={createMutation.isPending}
                >
                  Criar Regra
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!rules?.length && !templatesWithoutRules?.length && (
        <Card className="p-8 text-center">
          <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-medium text-foreground mb-1">
            Nenhuma automação configurada
          </h3>
          <p className="text-sm text-muted-foreground">
            Crie templates primeiro para configurar automações
          </p>
        </Card>
      )}
    </div>
  );
}
