import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { toast } from "sonner";

export interface ProductOverride {
  id: string;
  company_id: string;
  profile_id: string | null;
  item_id: string;
  product_key: string | null;
  title: string | null;
  override_mode: "use_profile" | "exclude";
  is_excluded: boolean;
  created_at: string;
  updated_at: string;
  profile_name?: string;
}

export function useWholesaleProductOverrides() {
  const { activeAccount } = useActiveAccount();
  const companyId = activeAccount?.companyId;
  const queryClient = useQueryClient();

  const overridesQuery = useQuery({
    queryKey: ["wholesale-product-overrides", companyId],
    queryFn: async (): Promise<ProductOverride[]> => {
      if (!companyId) return [];

      const { data, error } = await (supabase as any)
        .from("wholesale_product_overrides")
        .select("*, wholesale_profiles(name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        company_id: row.company_id,
        profile_id: row.profile_id,
        item_id: row.item_id,
        product_key: row.product_key,
        title: row.title,
        override_mode: row.is_excluded ? "exclude" : "use_profile",
        is_excluded: row.is_excluded,
        created_at: row.created_at,
        updated_at: row.updated_at,
        profile_name: row.wholesale_profiles?.name || null,
      }));
    },
    enabled: !!companyId,
  });

  const addOverride = useMutation({
    mutationFn: async (input: {
      item_id: string;
      product_key?: string;
      title?: string;
      profile_id?: string | null;
      is_excluded?: boolean;
    }) => {
      if (!companyId) throw new Error("Sem empresa ativa");
      const { data: { session } } = await supabase.auth.getSession();

      const { error } = await (supabase as any)
        .from("wholesale_product_overrides")
        .upsert(
          {
            company_id: companyId,
            item_id: input.item_id,
            product_key: input.product_key || null,
            title: input.title || null,
            profile_id: input.profile_id || null,
            is_excluded: input.is_excluded || false,
            override_mode: input.is_excluded ? "exclude" : "use_profile",
            created_by: session?.user?.id || null,
          },
          { onConflict: "company_id,item_id" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-product-overrides"] });
      toast.success("Override salvo");
    },
    onError: (err: any) => {
      toast.error("Erro ao salvar override: " + (err.message || "desconhecido"));
    },
  });

  const removeOverride = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("wholesale_product_overrides")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-product-overrides"] });
      toast.success("Override removido");
    },
    onError: (err: any) => {
      toast.error("Erro ao remover: " + (err.message || "desconhecido"));
    },
  });

  return {
    overrides: overridesQuery.data || [],
    isLoading: overridesQuery.isLoading,
    addOverride,
    removeOverride,
  };
}
