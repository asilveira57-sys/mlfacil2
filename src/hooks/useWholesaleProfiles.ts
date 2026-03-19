import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveAccount } from "@/contexts/ActiveAccountContext";
import { toast } from "sonner";

export interface WholesaleTier {
  id?: string;
  profile_id?: string;
  tier_index: number;
  min_quantity: number;
  value_type: "PERCENT_DISCOUNT" | "FIXED_UNIT_PRICE";
  value: number;
  is_enabled: boolean;
}

export interface WholesaleProfile {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  rounding_mode: string;
  margin_min_pct: number | null;
  allow_without_cost: boolean;
  created_at: string;
  updated_at: string;
  tiers?: WholesaleTier[];
}

export interface ProfileFormData {
  name: string;
  rounding_mode: string;
  margin_min_pct: number | null;
  allow_without_cost: boolean;
  tiers: WholesaleTier[];
}

function getDefaultTiers(): WholesaleTier[] {
  return [
    { tier_index: 1, min_quantity: 2, value_type: "PERCENT_DISCOUNT", value: 5, is_enabled: true },
    { tier_index: 2, min_quantity: 5, value_type: "PERCENT_DISCOUNT", value: 8, is_enabled: true },
    { tier_index: 3, min_quantity: 10, value_type: "PERCENT_DISCOUNT", value: 12, is_enabled: true },
    { tier_index: 4, min_quantity: 20, value_type: "PERCENT_DISCOUNT", value: 15, is_enabled: false },
    { tier_index: 5, min_quantity: 50, value_type: "PERCENT_DISCOUNT", value: 20, is_enabled: false },
  ];
}

export function useWholesaleProfiles() {
  const { activeAccount } = useActiveAccount();
  const companyId = activeAccount?.companyId;
  const queryClient = useQueryClient();

  const getEffectiveTenant = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error("Sessão expirada. Faça login novamente.");
    const tenantId = companyId || userId;
    return { userId, tenantId };
  };

  const effectiveTenantId = companyId || null;

  const profilesQuery = useQuery({
    queryKey: ["wholesale-profiles", companyId],
    queryFn: async () => {
      const { tenantId } = await getEffectiveTenant();
      
      // Fetch profiles
      const { data: profiles, error } = await (supabase as any)
        .from("wholesale_profiles")
        .select("*")
        .eq("company_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      if (!profiles || profiles.length === 0) return [] as WholesaleProfile[];
      
      // Fetch all tiers for these profiles in the same query
      const profileIds = profiles.map((p: any) => p.id);
      const { data: tiers, error: tiersError } = await (supabase as any)
        .from("wholesale_profile_tiers")
        .select("*")
        .in("profile_id", profileIds)
        .order("tier_index");
      if (tiersError) throw tiersError;
      
      // Merge tiers into profiles
      return profiles.map((p: any) => ({
        ...p,
        tiers: (tiers || []).filter((t: any) => t.profile_id === p.id),
      })) as WholesaleProfile[];
    },
    enabled: true,
  });

  const createProfile = useMutation({
    mutationFn: async (formData: ProfileFormData) => {
      if (!companyId) throw new Error("Sem empresa ativa");
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data: profile, error } = await (supabase as any)
        .from("wholesale_profiles")
        .insert({
          company_id: companyId,
          name: formData.name,
          rounding_mode: formData.rounding_mode,
          margin_min_pct: formData.margin_min_pct,
          allow_without_cost: formData.allow_without_cost,
          created_by: session?.user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;

      const allTiers = formData.tiers.map((t) => ({
        profile_id: profile.id,
        tier_index: t.tier_index,
        min_quantity: t.min_quantity,
        value_type: t.value_type,
        value: t.value,
        is_enabled: t.is_enabled,
      }));

      if (allTiers.length > 0) {
        const { error: tiersError } = await (supabase as any)
          .from("wholesale_profile_tiers")
          .insert(allTiers);
        if (tiersError) throw tiersError;
      }

      return profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-profiles"] });
      toast.success("Perfil criado com sucesso");
    },
    onError: (err: any) => {
      toast.error("Erro ao criar perfil: " + (err.message || "desconhecido"));
    },
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: ProfileFormData }) => {
      const { error } = await (supabase as any)
        .from("wholesale_profiles")
        .update({
          name: formData.name,
          rounding_mode: formData.rounding_mode,
          margin_min_pct: formData.margin_min_pct,
          allow_without_cost: formData.allow_without_cost,
        })
        .eq("id", id);
      if (error) throw error;

      await (supabase as any).from("wholesale_profile_tiers").delete().eq("profile_id", id);

      const allTiers = formData.tiers.map((t) => ({
        profile_id: id,
        tier_index: t.tier_index,
        min_quantity: t.min_quantity,
        value_type: t.value_type,
        value: t.value,
        is_enabled: t.is_enabled,
      }));

      if (allTiers.length > 0) {
        const { error: tiersError } = await (supabase as any)
          .from("wholesale_profile_tiers")
          .insert(allTiers);
        if (tiersError) throw tiersError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-profiles"] });
      toast.success("Perfil atualizado");
    },
    onError: (err: any) => {
      toast.error("Erro ao atualizar perfil: " + (err.message || "desconhecido"));
    },
  });

  const deleteProfile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("wholesale_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-profiles"] });
      
      toast.success("Perfil excluído");
    },
    onError: (err: any) => {
      toast.error("Erro ao excluir perfil: " + (err.message || "desconhecido"));
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("wholesale_profiles")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["wholesale-profiles"] });
      toast.success(vars.is_active ? "Perfil ativado" : "Perfil desativado");
    },
  });

  return {
    profiles: profilesQuery.data || [],
    isLoading: profilesQuery.isLoading,
    createProfile,
    updateProfile,
    deleteProfile,
    toggleActive,
    getDefaultTiers,
  };
}
