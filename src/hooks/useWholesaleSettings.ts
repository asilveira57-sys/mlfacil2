import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { toast } from "sonner";

export interface WholesaleSettings {
  id: string;
  company_id: string;
  strategy_mode: string;
  default_profile_id: string | null;
  auto_reapply_on_price_change: boolean;
  auto_reapply_mode: string;
  scheduled_time: string;
  timezone: string;
}

export function useWholesaleSettings() {
  const { activeAccount } = useActiveAccount();
  const companyId = activeAccount?.companyId;
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["wholesale-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await (supabase as any)
        .from("wholesale_seller_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as WholesaleSettings | null;
    },
    enabled: !!companyId,
  });

  const saveSettings = useMutation({
    mutationFn: async (updates: Partial<WholesaleSettings>) => {
      if (!companyId) throw new Error("Sem empresa ativa");

      const existing = settingsQuery.data;
      if (existing) {
        const { error } = await (supabase as any)
          .from("wholesale_seller_settings")
          .update(updates)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("wholesale_seller_settings")
          .insert({ company_id: companyId, ...updates });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-settings"] });
      toast.success("Configurações salvas");
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar: " + (err.message || "desconhecido"));
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    saveSettings,
  };
}
