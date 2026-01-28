import { Button } from "@/components/ui/button";
import { Settings, TrendingUp } from "lucide-react";
import { AbcFilters, AbcConfig } from "@/pages/AbcAnalysis";
import { AbcFilterBar } from "./AbcFilterBar";

interface AbcHeaderProps {
  sellerNickname: string | null;
  config: AbcConfig;
  onOpenConfig: () => void;
  filters: AbcFilters;
  onFiltersChange: (filters: AbcFilters) => void;
}

export function AbcHeader({
  sellerNickname,
  config,
  onOpenConfig,
  filters,
  onFiltersChange,
}: AbcHeaderProps) {
  return (
    <header className="border-b bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              {sellerNickname && (
                <p className="text-sm text-muted-foreground">Conta: {sellerNickname}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="px-2 py-1 rounded bg-success/20 text-success font-medium">
              A: {config.percentA}%
            </span>
            <span className="px-2 py-1 rounded bg-warning/20 text-warning font-medium">
              B: {config.percentB}%
            </span>
            <span className="px-2 py-1 rounded bg-destructive/20 text-destructive font-medium">
              C: {config.percentC}%
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={onOpenConfig}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <AbcFilterBar filters={filters} onFiltersChange={onFiltersChange} />
      </div>
    </header>
  );
}
