import { RefreshCw, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EconomyModeBannerProps {
  moduleName?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}

/**
 * Banner exibido em módulos secundários (Radiografia, ADS, Promoções, Seed,
 * ABC, Custos, Frete, Ajuste de Preço, Atacado, Linha do Tempo) informando
 * que atualizações automáticas estão pausadas — somente atualização manual.
 *
 * Implantado em 2026-05 como parte do programa de redução de consumo do MKTP Fácil.
 */
export function EconomyModeBanner({ moduleName, onRefresh, refreshing }: EconomyModeBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
      <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div className="flex-1">
        <p className="font-medium text-emerald-900 dark:text-emerald-100">
          Modo econômico ativo{moduleName ? ` — ${moduleName}` : ""}
        </p>
        <p className="text-emerald-800/80 dark:text-emerald-200/80">
          Este módulo está em modo econômico. Os dados só serão atualizados quando você clicar em <strong>Atualizar</strong>.
        </p>
      </div>
      {onRefresh && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="ml-1.5">Atualizar</span>
        </Button>
      )}
    </div>
  );
}
