import { useState, useEffect } from "react";
import { Save, Info, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQaSettings, useUpsertQaSettings, QA_DEFAULT_SETTINGS, resolveTemplate } from "@/hooks/useQaSettings";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";

export function QaSettingsPanel() {
  const { activeAccount, sellerId } = useActiveAccount();

  const { data: settings, isLoading } = useQaSettings(sellerId);
  const upsert = useUpsertQaSettings();

  const [greetingTemplate, setGreetingTemplate] = useState(QA_DEFAULT_SETTINGS.greeting_template!);
  const [signatureTemplate, setSignatureTemplate] = useState(QA_DEFAULT_SETTINGS.signature_template!);
  const [greetingEnabled, setGreetingEnabled] = useState(QA_DEFAULT_SETTINGS.greeting_enabled!);
  const [signatureEnabled, setSignatureEnabled] = useState(QA_DEFAULT_SETTINGS.signature_enabled!);

  useEffect(() => {
    if (settings) {
      setGreetingTemplate(settings.greeting_template);
      setSignatureTemplate(settings.signature_template);
      setGreetingEnabled(settings.greeting_enabled);
      setSignatureEnabled(settings.signature_enabled);
    }
  }, [settings]);

  const handleSave = () => {
    if (!sellerId) return;
    upsert.mutate({
      seller_id: sellerId,
      greeting_template: greetingTemplate,
      signature_template: signatureTemplate,
      greeting_enabled: greetingEnabled,
      signature_enabled: signatureEnabled,
    });
  };

  const storeName = activeAccount?.nickname || "Minha Loja";

  const previewGreeting = resolveTemplate(greetingTemplate, { storeName });
  const previewSignature = resolveTemplate(signatureTemplate, { storeName });

  if (!sellerId) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Conecte uma conta para configurar.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Configurações de Perguntas</h2>
        <p className="text-sm text-muted-foreground">
          Configure saudação e assinatura automáticas para suas respostas
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Variáveis disponíveis: <Badge variant="secondary" className="text-[10px] mx-0.5">{"{periodo_dia}"}</Badge>
          <Badge variant="secondary" className="text-[10px] mx-0.5">{"{nome_cliente}"}</Badge>
          <Badge variant="secondary" className="text-[10px] mx-0.5">{"{nome_loja}"}</Badge>
        </AlertDescription>
      </Alert>

      {/* Greeting */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Saudação automática</CardTitle>
              <CardDescription>Inserida no início de cada resposta</CardDescription>
            </div>
            <Switch checked={greetingEnabled} onCheckedChange={setGreetingEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Modelo da saudação</Label>
            <Textarea
              value={greetingTemplate}
              onChange={(e) => setGreetingTemplate(e.target.value)}
              placeholder="{periodo_dia}! Obrigado pelo interesse."
              className="min-h-[60px] resize-none"
              disabled={!greetingEnabled}
            />
          </div>
          {greetingEnabled && (
            <div className="bg-muted/50 rounded-md p-3">
              <p className="text-[10px] text-muted-foreground mb-1">Preview:</p>
              <p className="text-sm">{previewGreeting}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signature */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Assinatura automática</CardTitle>
              <CardDescription>Inserida no final de cada resposta</CardDescription>
            </div>
            <Switch checked={signatureEnabled} onCheckedChange={setSignatureEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Modelo da assinatura</Label>
            <Textarea
              value={signatureTemplate}
              onChange={(e) => setSignatureTemplate(e.target.value)}
              placeholder="Atenciosamente, {nome_loja}."
              className="min-h-[60px] resize-none"
              disabled={!signatureEnabled}
            />
          </div>
          {signatureEnabled && (
            <div className="bg-muted/50 rounded-md p-3">
              <p className="text-[10px] text-muted-foreground mb-1">Preview:</p>
              <p className="text-sm">{previewSignature}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Preview da resposta completa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/30 rounded-md p-4 space-y-2 text-sm">
            {greetingEnabled && (
              <p className="text-primary font-medium">{previewGreeting}</p>
            )}
            <p className="text-muted-foreground italic">[Conteúdo da resposta]</p>
            {signatureEnabled && (
              <p className="text-primary font-medium">{previewSignature}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={upsert.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {upsert.isPending ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </div>
  );
}
