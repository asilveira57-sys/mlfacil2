import { useState } from "react";
import { invokeEdgeFunction } from "@/lib/edgeFunctionClient";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { toast } from "sonner";

export interface PreviewTier {
  tier_index: number;
  min_quantity: number;
  unit_price: number;
  discount_pct: number;
}

export interface PreviewRow {
  item_id: string;
  title: string;
  thumbnail: string;
  category_id: string;
  category_name: string;
  current_price: number;
  status: string;
  profile_id: string;
  profile_name: string;
  source: "override" | "category" | "default";
  tiers: PreviewTier[];
  is_excluded: boolean;
}

export interface CategorySummary {
  category_id: string;
  category_name: string;
  items_count: number;
  avg_max_discount: number;
}

export interface PreviewData {
  rows: PreviewRow[];
  summary: CategorySummary[];
  total_items: number;
  items_with_profile: number;
  items_excluded: number;
  items_without_profile: number;
}

export function useWholesalePreview() {
  const { activeAccount } = useActiveAccount();
  const sellerId = activeAccount?.sellerId;
  const companyId = activeAccount?.companyId;

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [applyResults, setApplyResults] = useState<{
    total: number;
    success: number;
    failed: number;
    results: { item_id: string; success: boolean; error?: string }[];
  } | null>(null);

  async function loadPreview() {
    if (!sellerId || !companyId) {
      toast.error("Selecione uma conta antes");
      return;
    }

    setLoading(true);
    setPreviewData(null);
    setApplyResults(null);

    try {
      const result = await invokeEdgeFunction<PreviewData>("wholesale-engine", {
        body: { action: "preview", sellerId, companyId },
      });

      if (!result.success || !result.data) {
        toast.error(result.error || "Erro ao gerar preview");
        return;
      }

      setPreviewData(result.data);

      if (result.data.rows.length === 0) {
        toast.info("Nenhum item encontrado com perfil de atacado aplicável");
      }
    } catch (err: any) {
      toast.error("Erro inesperado: " + (err.message || "desconhecido"));
    } finally {
      setLoading(false);
    }
  }

  async function applyToItems(itemIds: string[]) {
    if (!sellerId || !companyId || itemIds.length === 0) return;

    setApplying(true);
    setApplyResults(null);

    try {
      const result = await invokeEdgeFunction<{
        total: number;
        success: number;
        failed: number;
        results: { item_id: string; success: boolean; error?: string }[];
      }>("wholesale-engine", {
        body: { action: "apply", sellerId, companyId, itemIds },
      });

      if (!result.success || !result.data) {
        toast.error(result.error || "Erro ao aplicar preços");
        return;
      }

      setApplyResults(result.data);

      if (result.data.success > 0) {
        toast.success(`${result.data.success} item(ns) atualizado(s) com sucesso`);
      }
      if (result.data.failed > 0) {
        toast.warning(`${result.data.failed} item(ns) com erro`);
      }
    } catch (err: any) {
      toast.error("Erro inesperado: " + (err.message || "desconhecido"));
    } finally {
      setApplying(false);
    }
  }

  return {
    loading,
    applying,
    previewData,
    applyResults,
    loadPreview,
    applyToItems,
    clearPreview: () => {
      setPreviewData(null);
      setApplyResults(null);
    },
  };
}
