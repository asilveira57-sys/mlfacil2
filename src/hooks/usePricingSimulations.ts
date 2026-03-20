import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentUserId } from './useCurrentUserId';
import { useUserPreferences } from './useUserPreferences';
import { toast } from 'sonner';
import type { SimulationInput, SimulationResult } from '@/lib/pricing-engine';
import { calculateSimulation } from '@/lib/pricing-engine';

export interface SavedSimulation {
  id: string;
  title: string;
  notes: string | null;
  sale_price: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  inputs: SimulationInput | null;
  results: SimulationResult | null;
}

const QUERY_KEY = 'pricing-simulations';

export function usePricingSimulations() {
  const userId = useCurrentUserId();
  const { activeWorkspace } = useUserPreferences();
  const queryClient = useQueryClient();
  const workspaceId = activeWorkspace?.id;

  // List simulations
  const { data: simulations = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];
      
      const { data, error } = await supabase
        .from('pricing_simulations')
        .select(`
          id, title, notes, sale_price, status, created_at, updated_at,
          pricing_simulation_inputs (
            cost_product, cost_packaging, cost_extra, weight_kg, height_cm, width_cm, length_cm,
            listing_type, fee_percent, fee_fixed, shipping_cost_estimated, fee_mode,
            channel_params
          ),
          pricing_simulation_results (
            profit_value, margin_percent, total_cost, marketplace_fees_total,
            net_revenue, breakeven_price, gross_revenue
          )
        `)
        .eq('workspace_id', workspaceId)
        .neq('status', 'archived')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(sim => {
        const inp = sim.pricing_simulation_inputs?.[0];
        const res = sim.pricing_simulation_results?.[0];
        const channelParams = inp?.channel_params as Record<string, unknown> | null;
        
        return {
          id: sim.id,
          title: sim.title,
          notes: sim.notes,
          sale_price: sim.sale_price,
          status: sim.status,
          created_at: sim.created_at,
          updated_at: sim.updated_at,
          inputs: inp ? {
            productName: (channelParams?.productName as string) || sim.title || '',
            description: sim.notes || '',
            categoryId: (channelParams?.categoryId as string) || '',
            categoryName: (channelParams?.categoryName as string) || '',
            listingType: (inp.listing_type as 'gold_pro' | 'gold_special') || 'gold_pro',
            salePrice: sim.sale_price || 0,
            productCost: inp.cost_product || 0,
            weightKg: inp.weight_kg || 0,
            heightCm: inp.height_cm || 0,
            widthCm: inp.width_cm || 0,
            lengthCm: inp.length_cm || 0,
            packagingCost: inp.cost_packaging || 0,
            otherCosts: inp.cost_extra || 0,
            reputation: ((channelParams?.reputation as string) || 'green') as 'green' | 'yellow' | 'none',
          } : null,
          results: res ? {
            volumetricWeightKg: 0,
            effectiveWeightKg: inp?.weight_kg || 0,
            weightBand: '',
            priceBand: '',
            commissionPercent: inp?.fee_percent || 0,
            commissionValue: res.marketplace_fees_total || 0,
            fixedCostValue: inp?.fee_fixed || 0,
            freightValue: inp?.shipping_cost_estimated || 0,
            totalCost: res.total_cost || 0,
            netProfit: res.profit_value || 0,
            marginPercent: res.margin_percent || 0,
            netReceived: res.net_revenue || 0,
            breakevenPrice: res.breakeven_price || 0,
          } : null,
        } as SavedSimulation;
      });
    },
    enabled: !!workspaceId,
  });

  // Save simulation
  const saveMutation = useMutation({
    mutationFn: async (input: SimulationInput) => {
      if (!userId || !workspaceId) throw new Error('Autenticação necessária');
      
      const result = calculateSimulation(input);

      // 1. Create simulation
      const { data: sim, error: simError } = await supabase
        .from('pricing_simulations')
        .insert({
          workspace_id: workspaceId,
          created_by_user_id: userId,
          title: input.productName || 'Nova simulação',
          notes: input.description || null,
          sale_price: input.salePrice,
          product_ref_type: 'manual' as const,
          status: 'saved' as const,
          marketplace: 'mercadolivre',
        })
        .select('id')
        .single();

      if (simError) throw simError;

      // 2. Create inputs
      const { data: inp, error: inpError } = await supabase
        .from('pricing_simulation_inputs')
        .insert({
          simulation_id: sim.id,
          listing_type: input.listingType,
          weight_kg: input.weightKg,
          height_cm: input.heightCm,
          width_cm: input.widthCm,
          length_cm: input.lengthCm,
          cost_product: input.productCost,
          cost_packaging: input.packagingCost,
          cost_extra: input.otherCosts,
          fee_percent: result.commissionPercent,
          fee_fixed: result.fixedCostValue,
          shipping_cost_estimated: result.freightValue,
          shipping_mode: 'me2',
          channel_params: {
            categoryId: input.categoryId,
            categoryName: input.categoryName,
            productName: input.productName,
            reputation: input.reputation,
          },
        })
        .select('id')
        .single();

      if (inpError) throw inpError;

      // 3. Create results
      const { error: resError } = await supabase
        .from('pricing_simulation_results')
        .insert({
          simulation_id: sim.id,
          inputs_id: inp.id,
          gross_revenue: input.salePrice,
          net_revenue: result.netReceived,
          profit_value: result.netProfit,
          profit_total: result.netProfit,
          margin_percent: result.marginPercent,
          total_cost: result.totalCost,
          marketplace_fees_total: result.commissionValue + result.fixedCostValue,
          breakeven_price: result.breakevenPrice,
          margin_after_shipping: result.marginPercent,
          markup_percent: input.productCost > 0 ? ((input.salePrice - input.productCost) / input.productCost) * 100 : 0,
        });

      if (resError) throw resError;
      return sim.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Simulação salva com sucesso!');
    },
    onError: (err: Error) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  // Update simulation
  const updateMutation = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SimulationInput }) => {
      if (!userId) throw new Error('Autenticação necessária');
      
      const result = calculateSimulation(input);

      // Update main record
      await supabase
        .from('pricing_simulations')
        .update({
          title: input.productName || 'Nova simulação',
          notes: input.description || null,
          sale_price: input.salePrice,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      // Get existing input ID
      const { data: existingInput } = await supabase
        .from('pricing_simulation_inputs')
        .select('id')
        .eq('simulation_id', id)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (existingInput) {
        await supabase
          .from('pricing_simulation_inputs')
          .update({
            listing_type: input.listingType,
            weight_kg: input.weightKg,
            height_cm: input.heightCm,
            width_cm: input.widthCm,
            length_cm: input.lengthCm,
            cost_product: input.productCost,
            cost_packaging: input.packagingCost,
            cost_extra: input.otherCosts,
            fee_percent: result.commissionPercent,
            fee_fixed: result.fixedCostValue,
            shipping_cost_estimated: result.freightValue,
            channel_params: {
              categoryId: input.categoryId,
              categoryName: input.categoryName,
              productName: input.productName,
              reputation: input.reputation,
            },
          })
          .eq('id', existingInput.id);

        // Update results
        await supabase
          .from('pricing_simulation_results')
          .update({
            gross_revenue: input.salePrice,
            net_revenue: result.netReceived,
            profit_value: result.netProfit,
            profit_total: result.netProfit,
            margin_percent: result.marginPercent,
            total_cost: result.totalCost,
            marketplace_fees_total: result.commissionValue + result.fixedCostValue,
            breakeven_price: result.breakevenPrice,
            margin_after_shipping: result.marginPercent,
          })
          .eq('inputs_id', existingInput.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Simulação atualizada!');
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar: ${err.message}`);
    },
  });

  // Duplicate
  const duplicateMutation = useMutation({
    mutationFn: async (simulation: SavedSimulation) => {
      if (!simulation.inputs) throw new Error('Sem dados para duplicar');
      const newInput = { ...simulation.inputs, productName: `${simulation.inputs.productName} (cópia)` };
      return saveMutation.mutateAsync(newInput);
    },
    onSuccess: () => {
      toast.success('Simulação duplicada!');
    },
  });

  // Delete (archive)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pricing_simulations')
        .update({ status: 'archived' as const })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Simulação excluída!');
    },
    onError: (err: Error) => {
      toast.error(`Erro ao excluir: ${err.message}`);
    },
  });

  return {
    simulations,
    isLoading,
    isAuthenticated: !!userId && !!workspaceId,
    save: saveMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    duplicate: duplicateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
    isSaving: saveMutation.isPending || updateMutation.isPending,
  };
}
