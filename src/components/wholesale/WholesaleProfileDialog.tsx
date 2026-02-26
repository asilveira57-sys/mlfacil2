import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { WholesaleProfile, WholesaleTier, ProfileFormData } from "@/hooks/useWholesaleProfiles";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: ProfileFormData) => void;
  profile: WholesaleProfile | null;
  isNew: boolean;
  getDefaultTiers: () => WholesaleTier[];
  isSaving: boolean;
}

export function WholesaleProfileDialog({ open, onOpenChange, onSave, profile, isNew, getDefaultTiers, isSaving }: Props) {
  const [name, setName] = useState("");
  const [roundingMode, setRoundingMode] = useState("2_decimals");
  const [marginMinPct, setMarginMinPct] = useState<string>("");
  const [allowWithoutCost, setAllowWithoutCost] = useState(false);
  const [tiers, setTiers] = useState<WholesaleTier[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      if (profile && profile.tiers && profile.tiers.length > 0) {
        setName(isNew && !profile.id ? profile.name : profile.name);
        setRoundingMode(profile.rounding_mode);
        setMarginMinPct(profile.margin_min_pct?.toString() || "");
        setAllowWithoutCost(profile.allow_without_cost);
        // Fill all 5 tiers
        const existingTiers = [...profile.tiers];
        const filled: WholesaleTier[] = [];
        for (let i = 1; i <= 5; i++) {
          const existing = existingTiers.find((t) => t.tier_index === i);
          if (existing) {
            filled.push({ ...existing });
          } else {
            filled.push({
              tier_index: i,
              min_quantity: i * 5,
              value_type: "PERCENT_DISCOUNT",
              value: i * 3,
              is_enabled: false,
            });
          }
        }
        setTiers(filled);
      } else {
        setName("");
        setRoundingMode("2_decimals");
        setMarginMinPct("");
        setAllowWithoutCost(false);
        setTiers(getDefaultTiers());
      }
      setErrors([]);
    }
  }, [open, profile, isNew, getDefaultTiers]);

  const updateTier = (index: number, field: keyof WholesaleTier, value: any) => {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("Nome do perfil é obrigatório.");

    const enabled = tiers.filter((t) => t.is_enabled);
    if (enabled.length === 0) errs.push("Pelo menos uma camada deve estar ativa.");

    for (const t of enabled) {
      if (t.min_quantity <= 0) errs.push(`Camada ${t.tier_index}: quantidade mínima precisa ser maior que zero.`);
    }

    // Check ascending quantities
    for (let i = 1; i < enabled.length; i++) {
      if (enabled[i].min_quantity <= enabled[i - 1].min_quantity) {
        errs.push("As quantidades precisam crescer de uma camada para outra.");
        break;
      }
    }

    // Check duplicate quantities
    const qtys = enabled.map((t) => t.min_quantity);
    if (new Set(qtys).size !== qtys.length) {
      errs.push("Não use a mesma quantidade em duas camadas.");
    }

    // Check for disabled tier in the middle of enabled ones
    let lastEnabled = -1;
    for (let i = 0; i < tiers.length; i++) {
      if (tiers[i].is_enabled) {
        if (lastEnabled >= 0 && i - lastEnabled > 1) {
          // Check if there's a disabled tier between two enabled ones
          for (let j = lastEnabled + 1; j < i; j++) {
            if (!tiers[j].is_enabled) {
              errs.push("Existe camada desativada no meio. Ajuste a sequência para evitar comportamento inesperado.");
              break;
            }
          }
        }
        lastEnabled = i;
      }
    }

    return errs;
  };

  const handleSave = () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    onSave({
      name: name.trim(),
      rounding_mode: roundingMode,
      margin_min_pct: marginMinPct ? parseFloat(marginMinPct) : null,
      allow_without_cost: allowWithoutCost,
      tiers,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Novo perfil" : "Editar perfil"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Nome do perfil</Label>
            <Input
              placeholder="Ex: Papelaria / Autopeças / Padrão"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Rounding */}
          <div className="space-y-1.5">
            <Label>Regra de arredondamento</Label>
            <Select value={roundingMode} onValueChange={setRoundingMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2_decimals">2 casas decimais</SelectItem>
                <SelectItem value="end_90">Final .90</SelectItem>
                <SelectItem value="end_99">Final .99</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Margin */}
          <div className="space-y-1.5">
            <Label>Margem mínima (%)</Label>
            <Input
              type="number"
              placeholder="Ex: 12"
              value={marginMinPct}
              onChange={(e) => setMarginMinPct(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Quando houver custo, bloqueia camadas que ficarem abaixo da margem mínima.
            </p>
          </div>

          {/* Allow without cost */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Permitir aplicar mesmo sem custo</Label>
              <p className="text-xs text-muted-foreground">
                Quando desativado, itens sem custo ficam como "Ignorado" no job.
              </p>
            </div>
            <Switch checked={allowWithoutCost} onCheckedChange={setAllowWithoutCost} />
          </div>

          {/* Tiers */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Camadas (1 a 5)</Label>
            <div className="space-y-3">
              {tiers.map((tier, idx) => (
                <div
                  key={tier.tier_index}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    tier.is_enabled ? "bg-card" : "bg-muted/30 opacity-60"
                  }`}
                >
                  <Badge variant="outline" className="shrink-0 w-20 justify-center">
                    Camada {tier.tier_index}
                  </Badge>

                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs">Qtd mínima</Label>
                      <Input
                        type="number"
                        min={1}
                        placeholder="Ex: 2"
                        value={tier.min_quantity}
                        onChange={(e) => updateTier(idx, "min_quantity", parseInt(e.target.value) || 0)}
                        disabled={!tier.is_enabled}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={tier.value_type}
                        onValueChange={(v) => updateTier(idx, "value_type", v)}
                        disabled={!tier.is_enabled}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERCENT_DISCOUNT">Desconto (%)</SelectItem>
                          <SelectItem value="FIXED_UNIT_PRICE">Preço fixo/un</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Valor</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder={tier.value_type === "PERCENT_DISCOUNT" ? "Ex: 8" : "Ex: 49,90"}
                        value={tier.value}
                        onChange={(e) => updateTier(idx, "value", parseFloat(e.target.value) || 0)}
                        disabled={!tier.is_enabled}
                      />
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Switch
                      checked={tier.is_enabled}
                      onCheckedChange={(v) => updateTier(idx, "is_enabled", v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
              {errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isNew ? "Criar perfil" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
