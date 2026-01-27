import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Wand2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useValidateMessage, useAiSuggest, useCreateTemplate, useUpdateTemplate } from "@/hooks/usePostSaleMessages";
import {
  PostSaleTemplate,
  PostSaleTriggerEvent,
  PostSaleMessageType,
  PostSaleLogisticsProfile,
  triggerEventLabels,
  messageTypeLabels,
  logisticsProfileLabels,
  availableVariables,
  ValidationResult,
} from "@/types/post-sale";
import { toast } from "sonner";

interface Props {
  template?: PostSaleTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PostSaleTemplateEditor({ template, open, onOpenChange }: Props) {
  const [name, setName] = useState("");
  const [triggerEvent, setTriggerEvent] = useState<PostSaleTriggerEvent>("venda_confirmada");
  const [messageType, setMessageType] = useState<PostSaleMessageType>("informativa");
  const [logisticsProfile, setLogisticsProfile] = useState<PostSaleLogisticsProfile>("mercado_envios");
  const [content, setContent] = useState("");
  const [maxChars, setMaxChars] = useState(500);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateMutation = useValidateMessage();
  const aiSuggestMutation = useAiSuggest();
  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();

  const isEditing = !!template;
  const charCount = content.length;
  const isOverLimit = charCount > maxChars;

  // Adjust max chars based on logistics profile
  useEffect(() => {
    if (logisticsProfile === "full") {
      setMaxChars(350);
    } else {
      setMaxChars(500);
    }
  }, [logisticsProfile]);

  // Load template data when editing
  useEffect(() => {
    if (template) {
      setName(template.name);
      setTriggerEvent(template.trigger_event);
      setMessageType(template.message_type);
      setLogisticsProfile(template.logistics_profile);
      setContent(template.content);
      setMaxChars(template.max_characters);
    } else {
      setName("");
      setTriggerEvent("venda_confirmada");
      setMessageType("informativa");
      setLogisticsProfile("mercado_envios");
      setContent("");
      setMaxChars(500);
    }
    setValidation(null);
  }, [template, open]);

  // Validate content on change (debounced)
  useEffect(() => {
    if (!content.trim()) {
      setValidation(null);
      return;
    }

    const timeout = setTimeout(async () => {
      setIsValidating(true);
      try {
        const result = await validateMutation.mutateAsync({ content });
        setValidation(result);
      } catch {
        // Silent fail
      } finally {
        setIsValidating(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [content]);

  const handleAiSuggest = async () => {
    if (!content.trim()) {
      toast.error("Digite um texto para melhorar");
      return;
    }

    try {
      const result = await aiSuggestMutation.mutateAsync({
        content,
        messageType,
      });
      setContent(result.suggestion);
      setValidation(result.validation);
      toast.success("Texto melhorado pela IA");
    } catch {
      toast.error("Erro ao gerar sugestão");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Digite um nome para o template");
      return;
    }
    if (!content.trim()) {
      toast.error("Digite o conteúdo da mensagem");
      return;
    }
    if (validation && !validation.isValid) {
      toast.error("Corrija as violações antes de salvar");
      return;
    }
    if (isOverLimit) {
      toast.error(`O texto excede o limite de ${maxChars} caracteres`);
      return;
    }

    try {
      if (isEditing && template) {
        await updateMutation.mutateAsync({
          id: template.id,
          name,
          trigger_event: triggerEvent,
          message_type: messageType,
          logistics_profile: logisticsProfile,
          content,
          max_characters: maxChars,
        });
        toast.success("Template atualizado");
      } else {
        await createMutation.mutateAsync({
          name,
          trigger_event: triggerEvent,
          message_type: messageType,
          logistics_profile: logisticsProfile,
          content,
          max_characters: maxChars,
        });
        toast.success("Template criado");
      }
      onOpenChange(false);
    } catch {
      toast.error("Erro ao salvar template");
    }
  };

  const insertVariable = (variable: string) => {
    setContent((prev) => prev + `{{${variable}}}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Template" : "Novo Template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Template</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Boas-vindas após venda"
            />
          </div>

          {/* Trigger & Type Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Evento Gatilho</Label>
              <Select value={triggerEvent} onValueChange={(v) => setTriggerEvent(v as PostSaleTriggerEvent)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(triggerEventLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Mensagem</Label>
              <Select value={messageType} onValueChange={(v) => setMessageType(v as PostSaleMessageType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(messageTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Logistics Profile */}
          <div className="space-y-2">
            <Label>Perfil de Logística</Label>
            <Select value={logisticsProfile} onValueChange={(v) => setLogisticsProfile(v as PostSaleLogisticsProfile)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(logisticsProfileLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {logisticsProfile === "full" && (
              <p className="text-xs text-muted-foreground">
                <Info className="inline h-3 w-3 mr-1" />
                Full tem limite reduzido de caracteres
              </p>
            )}
          </div>

          {/* Variables */}
          <div className="space-y-2">
            <Label>Variáveis Disponíveis</Label>
            <div className="flex flex-wrap gap-2">
              {availableVariables.map((v) => (
                <Badge
                  key={v.key}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10"
                  onClick={() => insertVariable(v.key)}
                >
                  {`{{${v.key}}}`}
                </Badge>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">Conteúdo da Mensagem</Label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${isOverLimit ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {charCount}/{maxChars}
                </span>
                {isValidating && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
            </div>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Olá {{nome_comprador}}, seu pedido {{pedido}} foi confirmado..."
              className="min-h-[150px]"
            />

            {/* AI Suggest Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAiSuggest}
              disabled={aiSuggestMutation.isPending || !content.trim()}
            >
              {aiSuggestMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Melhorar com IA
            </Button>
          </div>

          {/* Validation Result */}
          {validation && (
            <Card className={`p-3 ${validation.isValid ? "border-green-500/50 bg-green-500/10" : "border-destructive/50 bg-destructive/10"}`}>
              {validation.isValid ? (
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Mensagem válida</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {validation.violations.length} violação(ões) encontrada(s)
                    </span>
                  </div>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    {validation.violations.map((v, i) => (
                      <li key={i}>
                        • <strong>{v.description}:</strong> "{v.match}"
                      </li>
                    ))}
                  </ul>
                  {validation.suggestedFix && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">Sugestão de correção:</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-auto py-1 px-2"
                        onClick={() => setContent(validation.suggestedFix!)}
                      >
                        Aplicar correção
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              createMutation.isPending ||
              updateMutation.isPending ||
              (validation && !validation.isValid) ||
              isOverLimit
            }
          >
            {(createMutation.isPending || updateMutation.isPending) && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {isEditing ? "Salvar" : "Criar Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
