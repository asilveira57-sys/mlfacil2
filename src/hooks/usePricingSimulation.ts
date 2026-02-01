/**
 * usePricingSimulation - React hook for pricing simulations
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCurrentWorkspaceId } from './useCurrentWorkspaceId';
import {
  createSimulation,
  recalculateSimulation,
  saveSimulation,
  approveSimulation,
  duplicateSimulation,
  archiveSimulation,
  listSimulations,
  getSimulationDetails,
  validatePricing,
  CreateSimulationParams,
  RecalculateParams,
  PricingSimulation,
  PricingSimulationInput,
  PricingSimulationResult,
  ListSimulationsParams,
  ValidateParams,
} from '@/lib/pricingEngineClient';

// Query keys
const QUERY_KEYS = {
  simulations: (workspaceId: string, filters?: Partial<ListSimulationsParams>) => 
    ['pricing-simulations', workspaceId, filters],
  simulationDetails: (simulationId: string) => 
    ['pricing-simulation-details', simulationId],
};

/**
 * Hook for listing simulations
 */
export function usePricingSimulations(filters?: Partial<Omit<ListSimulationsParams, 'workspace_id'>>) {
  const { data: workspaceId } = useCurrentWorkspaceId();
  
  return useQuery({
    queryKey: QUERY_KEYS.simulations(workspaceId || '', filters),
    queryFn: async () => {
      if (!workspaceId) throw new Error('Workspace não selecionado');
      
      const result = await listSimulations({
        workspace_id: workspaceId,
        ...filters,
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao carregar simulações');
      }
      
      return result.data;
    },
    enabled: !!workspaceId,
  });
}

/**
 * Hook for simulation details
 */
export function usePricingSimulationDetails(simulationId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.simulationDetails(simulationId || ''),
    queryFn: async () => {
      if (!simulationId) throw new Error('ID da simulação não informado');
      
      const result = await getSimulationDetails(simulationId);
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao carregar detalhes');
      }
      
      return result.data;
    },
    enabled: !!simulationId,
  });
}

/**
 * Hook for pricing simulation operations
 */
export function usePricingOperations() {
  const queryClient = useQueryClient();
  const { data: workspaceId } = useCurrentWorkspaceId();
  const [isLoading, setIsLoading] = useState(false);
  
  const invalidateSimulations = useCallback(() => {
    if (workspaceId) {
      queryClient.invalidateQueries({ 
        queryKey: ['pricing-simulations', workspaceId] 
      });
    }
  }, [queryClient, workspaceId]);
  
  const invalidateDetails = useCallback((simulationId: string) => {
    queryClient.invalidateQueries({ 
      queryKey: QUERY_KEYS.simulationDetails(simulationId) 
    });
  }, [queryClient]);
  
  // Create simulation
  const create = useMutation({
    mutationFn: async (params: Omit<CreateSimulationParams, 'workspace_id'>) => {
      if (!workspaceId) throw new Error('Workspace não selecionado');
      
      const result = await createSimulation({
        workspace_id: workspaceId,
        ...params,
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao criar simulação');
      }
      
      return result.data;
    },
    onSuccess: () => {
      invalidateSimulations();
      toast.success('Simulação criada com sucesso');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  
  // Recalculate
  const recalculate = useMutation({
    mutationFn: async (params: RecalculateParams) => {
      const result = await recalculateSimulation(params);
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao recalcular');
      }
      
      return result.data;
    },
    onSuccess: (data) => {
      if (data?.simulation?.id) {
        invalidateDetails(data.simulation.id);
      }
      invalidateSimulations();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  
  // Save
  const save = useMutation({
    mutationFn: async ({ simulationId, title, notes }: { 
      simulationId: string; 
      title?: string; 
      notes?: string;
    }) => {
      const result = await saveSimulation(simulationId, { title, notes });
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar');
      }
      
      return result.data;
    },
    onSuccess: (data) => {
      if (data?.simulation?.id) {
        invalidateDetails(data.simulation.id);
      }
      invalidateSimulations();
      toast.success('Simulação salva');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  
  // Approve
  const approve = useMutation({
    mutationFn: async ({ simulationId, force }: { simulationId: string; force?: boolean }) => {
      const result = await approveSimulation(simulationId, force);
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao aprovar');
      }
      
      return result.data;
    },
    onSuccess: (data) => {
      if (data?.simulation?.id) {
        invalidateDetails(data.simulation.id);
      }
      invalidateSimulations();
      toast.success('Simulação aprovada');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  
  // Duplicate
  const duplicate = useMutation({
    mutationFn: async ({ simulationId, title }: { simulationId: string; title?: string }) => {
      const result = await duplicateSimulation(simulationId, title);
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao duplicar');
      }
      
      return result.data;
    },
    onSuccess: () => {
      invalidateSimulations();
      toast.success('Simulação duplicada');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  
  // Archive
  const archive = useMutation({
    mutationFn: async (simulationId: string) => {
      const result = await archiveSimulation(simulationId);
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao arquivar');
      }
      
      return result.data;
    },
    onSuccess: (data) => {
      if (data?.simulation?.id) {
        invalidateDetails(data.simulation.id);
      }
      invalidateSimulations();
      toast.success('Simulação arquivada');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
  
  // Validate (without persisting)
  const validate = useCallback(async (params: Omit<ValidateParams, 'workspace_id'>) => {
    if (!workspaceId) {
      toast.error('Workspace não selecionado');
      return null;
    }
    
    setIsLoading(true);
    try {
      const result = await validatePricing({
        workspace_id: workspaceId,
        ...params,
      });
      
      if (!result.success) {
        toast.error(result.error || 'Erro na validação');
        return null;
      }
      
      return result.data;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);
  
  return {
    // Mutations
    create,
    recalculate,
    save,
    approve,
    duplicate,
    archive,
    
    // Validate (standalone)
    validate,
    isValidating: isLoading,
    
    // Status
    isLoading: 
      create.isPending || 
      recalculate.isPending || 
      save.isPending || 
      approve.isPending || 
      duplicate.isPending || 
      archive.isPending ||
      isLoading,
  };
}

/**
 * Hook for quick pricing calculation (local, no persistence)
 */
export function useQuickPricing() {
  const { data: workspaceId } = useCurrentWorkspaceId();
  const [result, setResult] = useState<{
    result: Omit<PricingSimulationResult, 'id' | 'simulation_id' | 'inputs_id' | 'version' | 'calculated_at' | 'created_at'>;
    validation: { valid: boolean; violations: string[] };
    warnings: string[];
  } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  
  const calculate = useCallback(async (params: Omit<ValidateParams, 'workspace_id'>) => {
    if (!workspaceId) return;
    
    setIsCalculating(true);
    try {
      const response = await validatePricing({
        workspace_id: workspaceId,
        ...params,
      });
      
      if (response.success && response.data) {
        setResult(response.data);
        return response.data;
      }
    } catch (err) {
      console.error('Quick pricing error:', err);
    } finally {
      setIsCalculating(false);
    }
    
    return null;
  }, [workspaceId]);
  
  const reset = useCallback(() => {
    setResult(null);
  }, []);
  
  return {
    calculate,
    result,
    isCalculating,
    reset,
  };
}
