import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Package, Truck, HelpCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";

interface ZplImportCardProps {
  detectedType: string | null;
  confidence: string | null;
  presetSource: string | null;
  appliedWidth: number | null;
  appliedHeight: number | null;
  source: string | null;
  totalLabels: number | null;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  full_volume_label: {
    label: "Etiqueta de Volume",
    icon: <Truck className="w-4 h-4" />,
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  full_product_label: {
    label: "Etiqueta de Produto",
    icon: <Package className="w-4 h-4" />,
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  unknown_zpl: {
    label: "Tipo Desconhecido",
    icon: <HelpCircle className="w-4 h-4" />,
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Entrada Manual",
  mercado_livre: "Mercado Livre",
  extension: "Extensão Chrome",
};

const PRESET_LABELS: Record<string, string> = {
  user_specific: "Preferência por tipo",
  user_global: "Preferência global",
  system_default: "Padrão do sistema",
};

export function ZplImportCard({
  detectedType,
  confidence,
  presetSource,
  appliedWidth,
  appliedHeight,
  source,
  totalLabels,
}: ZplImportCardProps) {
  if (!detectedType) return null;

  const typeConfig = TYPE_CONFIG[detectedType] || TYPE_CONFIG.unknown_zpl;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="w-4 h-4 text-primary" />
          Informações da Importação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Type + Confidence */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {typeConfig.icon}
            <span className="text-sm font-medium">{typeConfig.label}</span>
          </div>
          <Badge variant="outline" className={typeConfig.color}>
            {confidence === "high" ? (
              <><CheckCircle2 className="w-3 h-3 mr-1" /> Alta confiança</>
            ) : confidence === "medium" ? (
              <><Info className="w-3 h-3 mr-1" /> Média confiança</>
            ) : (
              <><AlertTriangle className="w-3 h-3 mr-1" /> Baixa confiança</>
            )}
          </Badge>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Tamanho aplicado</span>
            <span className="font-medium">{appliedWidth} × {appliedHeight} mm</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Total de etiquetas</span>
            <span className="font-medium">{totalLabels || 1}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Origem</span>
            <span className="font-medium">{SOURCE_LABELS[source || "manual"] || source}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Fonte do preset</span>
            <span className="font-medium">{PRESET_LABELS[presetSource || "system_default"] || presetSource}</span>
          </div>
        </div>

        {/* Warnings */}
        {confidence === "low" && (
          <Alert variant="default" className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-xs text-yellow-700 dark:text-yellow-300">
              Não foi possível identificar o tipo com certeza. Verifique as dimensões antes de imprimir.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
