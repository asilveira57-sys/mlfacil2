import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ZplPreferencesCardProps {
  onPreferencesSaved?: () => void;
}

const LABEL_TYPES = [
  { value: "_global", label: "Padrão Global" },
  { value: "full_volume_label", label: "Etiqueta de Volume" },
  { value: "full_product_label", label: "Etiqueta de Produto" },
];

export function ZplPreferencesCard({ onPreferencesSaved }: ZplPreferencesCardProps) {
  const [selectedType, setSelectedType] = useState("_global");
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(150);
  const [columns, setColumns] = useState(1);
  const [dpi, setDpi] = useState(203);
  const [printMethod, setPrintMethod] = useState("thermal");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPreference(selectedType);
  }, [selectedType]);

  const loadPreference = async (type: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("user_label_preferences")
        .select("*")
        .eq("user_id", user.id);

      if (type === "_global") {
        query = query.is("label_type", null);
      } else {
        query = query.eq("label_type", type);
      }

      const { data } = await query.maybeSingle();

      if (data) {
        setWidth(data.default_width_mm);
        setHeight(data.default_height_mm);
        setColumns(data.default_columns);
        setDpi(data.dpi);
        setPrintMethod(data.print_method);
      } else {
        // System defaults based on type
        if (type === "full_volume_label") {
          setWidth(100); setHeight(150); setColumns(1);
        } else if (type === "full_product_label") {
          setWidth(40); setHeight(25); setColumns(2);
        } else {
          setWidth(100); setHeight(150); setColumns(1);
        }
        setDpi(203);
        setPrintMethod("thermal");
      }
    } catch (err) {
      console.error("Error loading preferences:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const labelType = selectedType === "_global" ? null : selectedType;

      const { error } = await supabase
        .from("user_label_preferences")
        .upsert(
          {
            user_id: user.id,
            label_type: labelType,
            default_width_mm: width,
            default_height_mm: height,
            default_columns: columns,
            dpi,
            print_method: printMethod,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,label_type" }
        );

      if (error) throw error;

      toast.success("Preferências salvas com sucesso!");
      onPreferencesSaved?.();
    } catch (err: any) {
      console.error("Error saving preferences:", err);
      toast.error("Erro ao salvar preferências");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="w-4 h-4 text-primary" />
          Preferências de Impressão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de Etiqueta</Label>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LABEL_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Largura (mm)</Label>
            <Input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} min={10} max={300} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Altura (mm)</Label>
            <Input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} min={10} max={300} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Colunas</Label>
            <Input type="number" value={columns} onChange={(e) => setColumns(Number(e.target.value))} min={1} max={4} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">DPI</Label>
            <Select value={String(dpi)} onValueChange={(v) => setDpi(Number(v))}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="152">152 dpi</SelectItem>
                <SelectItem value="203">203 dpi</SelectItem>
                <SelectItem value="300">300 dpi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Método de Impressão</Label>
          <Select value={printMethod} onValueChange={setPrintMethod}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="thermal">Térmico Direto</SelectItem>
              <SelectItem value="ribbon">Ribbon (Transferência)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSave} disabled={saving || loading} className="w-full" size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar como Padrão
        </Button>
      </CardContent>
    </Card>
  );
}
