import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { useWholesaleProfiles } from "@/hooks/useWholesaleProfiles";
import { useWholesaleSettings } from "@/hooks/useWholesaleSettings";

export function WholesaleDefaultProfile() {
  const { profiles, isLoading: profilesLoading } = useWholesaleProfiles();
  const { settings, isLoading: settingsLoading, saveSettings } = useWholesaleSettings();

  const [defaultProfileId, setDefaultProfileId] = useState<string>("");
  const [autoReapply, setAutoReapply] = useState(false);
  const [reapplyMode, setReapplyMode] = useState("IMMEDIATE");
  const [scheduledTime, setScheduledTime] = useState("02:00");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      setDefaultProfileId(settings.default_profile_id || "");
      setAutoReapply(settings.auto_reapply_on_price_change);
      setReapplyMode(settings.auto_reapply_mode);
      setScheduledTime(settings.scheduled_time || "02:00");
      setDirty(false);
    }
  }, [settings]);

  const handleSave = () => {
    saveSettings.mutate({
      default_profile_id: defaultProfileId || null,
      auto_reapply_on_price_change: autoReapply,
      auto_reapply_mode: reapplyMode,
      scheduled_time: scheduledTime,
    });
    setDirty(false);
  };

  const markDirty = () => setDirty(true);

  const isLoading = profilesLoading || settingsLoading;
  const activeProfiles = profiles.filter((p) => p.is_active);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Perfil Padrão do Catálogo</h2>
        <p className="text-sm text-muted-foreground">
          Define o perfil usado em produtos que não tenham exceção avulsa e não estejam cobertos por categoria.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil padrão</CardTitle>
          <CardDescription>Esse perfil vale para todo o catálogo como fallback.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Profile selector */}
          <div className="space-y-1.5">
            <Label>Perfil padrão</Label>
            <Select
              value={defaultProfileId}
              onValueChange={(v) => {
                setDefaultProfileId(v);
                markDirty();
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um perfil" />
              </SelectTrigger>
              <SelectContent>
                {activeProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeProfiles.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum perfil ativo encontrado. Crie um perfil na aba &quot;Perfis de Camadas&quot;.
              </p>
            )}
          </div>

          {/* Auto-reapply */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-base">Reaplicar atacado quando o preço base mudar</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Quando ativado, o sistema cria automaticamente um job de reaplicação.
                </p>
              </div>
              <Switch
                checked={autoReapply}
                onCheckedChange={(v) => {
                  setAutoReapply(v);
                  markDirty();
                }}
              />
            </div>

            {autoReapply && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                <RadioGroup
                  value={reapplyMode}
                  onValueChange={(v) => {
                    setReapplyMode(v);
                    markDirty();
                  }}
                  className="space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="IMMEDIATE" id="immediate" />
                    <Label htmlFor="immediate">Executar na hora</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="SCHEDULED" id="scheduled" />
                    <Label htmlFor="scheduled">Executar por agendamento</Label>
                  </div>
                </RadioGroup>

                {reapplyMode === "SCHEDULED" && (
                  <div className="space-y-1.5">
                    <Label>Horário preferido</Label>
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => {
                        setScheduledTime(e.target.value);
                        markDirty();
                      }}
                      className="w-32"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use um horário de menor movimento para reduzir impacto de rate limit.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Save button */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={!dirty || saveSettings.isPending} className="gap-2">
              {saveSettings.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar configurações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
