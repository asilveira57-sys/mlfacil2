import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { toast } from "sonner";

export interface CategoryBinding {
  id: string;
  company_id: string;
  profile_id: string;
  category_id: string;
  category_name: string | null;
  category_path: string[] | null;
  priority: number;
  created_at: string;
  updated_at: string;
  profile_name?: string;
  company_name?: string;
}

export function useWholesaleCategoryBindings() {
  const { activeAccount } = useActiveAccount();
  const companyId = activeAccount?.companyId;
  const queryClient = useQueryClient();

  const bindingsQuery = useQuery({
    queryKey: ["wholesale-category-bindings"],
    queryFn: async (): Promise<CategoryBinding[]> => {
      const { data, error } = await (supabase as any)
        .from("wholesale_profile_categories")
        .select("*, wholesale_profiles!inner(name), companies!inner(display_name)")
        .order("priority", { ascending: false });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        company_id: row.company_id,
        profile_id: row.profile_id,
        category_id: row.category_id,
        category_name: row.category_name,
        category_path: row.category_path,
        priority: row.priority,
        created_at: row.created_at,
        updated_at: row.updated_at,
        profile_name: row.wholesale_profiles?.name || "—",
        company_name: row.companies?.display_name || "—",
      }));
    },
    enabled: true,
  });

  const addBinding = useMutation({
    mutationFn: async (input: {
      profile_id: string;
      category_id: string;
      category_name: string;
      category_path?: string[];
      company_id?: string;
    }) => {
      const targetCompanyId = input.company_id || companyId;
      if (!targetCompanyId) throw new Error("Sem empresa selecionada");
      const { data: { session } } = await supabase.auth.getSession();

      const { error } = await (supabase as any)
        .from("wholesale_profile_categories")
        .upsert(
          {
            company_id: targetCompanyId,
            profile_id: input.profile_id,
            category_id: input.category_id,
            category_name: input.category_name,
            category_path: input.category_path || [],
            created_by: session?.user?.id || null,
          },
          { onConflict: "company_id,category_id" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-category-bindings"] });
      toast.success("Categoria vinculada ao perfil");
    },
    onError: (err: any) => {
      toast.error("Erro ao vincular categoria: " + (err.message || "desconhecido"));
    },
  });

  const removeBinding = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("wholesale_profile_categories")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-category-bindings"] });
      toast.success("Vínculo removido");
    },
    onError: (err: any) => {
      toast.error("Erro ao remover: " + (err.message || "desconhecido"));
    },
  });

  const updateBindingProfile = useMutation({
    mutationFn: async ({ id, profile_id }: { id: string; profile_id: string }) => {
      const { error } = await (supabase as any)
        .from("wholesale_profile_categories")
        .update({ profile_id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-category-bindings"] });
      toast.success("Perfil atualizado");
    },
    onError: (err: any) => {
      toast.error("Erro ao atualizar: " + (err.message || "desconhecido"));
    },
  });

  const updateBindingCompany = useMutation({
    mutationFn: async ({ id, company_id, profile_id }: { id: string; company_id: string; profile_id?: string }) => {
      const updates: Record<string, string> = { company_id };
      if (profile_id) updates.profile_id = profile_id;
      const { error } = await (supabase as any)
        .from("wholesale_profile_categories")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-category-bindings"] });
      toast.success("Vínculo atualizado");
    },
    onError: (err: any) => {
      toast.error("Erro ao atualizar: " + (err.message || "desconhecido"));
    },
  });

  return {
    bindings: bindingsQuery.data || [],
    isLoading: bindingsQuery.isLoading,
    addBinding,
    removeBinding,
    updateBindingProfile,
    updateBindingCompany,
  };
}
