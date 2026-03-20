import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ImagePlus, Trash2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useCompanyLogoUpload } from "@/hooks/useCompanyLogoUpload";
import { supabase } from "@/integrations/supabase/client";

interface CompanyLogoSectionProps {
  companyId: string;
  logoUrl: string | null;
  onLogoChange: () => void;
}

export function CompanyLogoSection({ companyId, logoUrl, onLogoChange }: CompanyLogoSectionProps) {
  const { uploadLogo, removeLogo, applyLogoToAll, uploading, error } = useCompanyLogoUpload();
  const [applyAll, setApplyAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await uploadLogo(file, companyId);
    if (result) {
      toast.success("Logomarca enviada com sucesso!");

      if (applyAll) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const ok = await applyLogoToAll(user.id, result.logoUrl);
          if (ok) toast.success("Logo aplicada em todas as empresas!");
        }
      }

      onLogoChange();
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [companyId, applyAll, uploadLogo, applyLogoToAll, onLogoChange]);

  const handleRemove = useCallback(async () => {
    const ok = await removeLogo(companyId);
    if (ok) {
      toast.success("Logomarca removida!");
      onLogoChange();
    }
  }, [companyId, removeLogo, onLogoChange]);

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2 text-sm font-medium">
        <ImagePlus className="h-4 w-4" />
        Logomarca da Empresa
      </Label>

      {logoUrl ? (
        <div className="space-y-3">
          {/* Current logo preview */}
          <div className="flex items-start gap-4">
            <div className="border rounded-lg p-2 bg-muted/30">
              <img
                src={logoUrl}
                alt="Logo da empresa"
                className="max-h-16 max-w-[200px] object-contain"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                Substituir
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleRemove}
                disabled={uploading}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Remover
              </Button>
            </div>
          </div>

          {/* Report preview */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Preview em relatórios</p>
            <div className="flex gap-4">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Cabeçalho (200×60)</p>
                <div className="w-[200px] h-[60px] border border-dashed rounded flex items-center justify-center bg-muted/20 overflow-hidden">
                  <img src={logoUrl} alt="Header preview" className="max-w-full max-h-full object-contain" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground">Rodapé (120×36)</p>
                <div className="w-[120px] h-[36px] border border-dashed rounded flex items-center justify-center bg-muted/20 overflow-hidden">
                  <img src={logoUrl} alt="Footer preview" className="max-w-full max-h-full object-contain" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground mt-2">Clique para enviar logo</p>
          <p className="text-xs text-muted-foreground">PNG ou SVG • Máx 2MB • Mín 400×120px</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/svg+xml"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Apply to all */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`apply-all-${companyId}`}
          checked={applyAll}
          disabled={uploading}
          onCheckedChange={async (v) => {
            const checked = v === true;
            setApplyAll(checked);
            if (checked && logoUrl) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const ok = await applyLogoToAll(user.id, logoUrl);
                if (ok) {
                  toast.success("Logo aplicada em todas as empresas!");
                  onLogoChange();
                }
              }
            }
          }}
        />
        <Label htmlFor={`apply-all-${companyId}`} className="text-xs text-muted-foreground cursor-pointer">
          Usar esta logo em todas as empresas
        </Label>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
