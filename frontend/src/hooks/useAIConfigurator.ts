import { useQuery, useMutation } from '@tanstack/react-query'
import { aiConfiguratorApi, type AIConfiguratorInput, type AIConfiguratorResult, type AIConfiguratorStatus } from '@/lib/api'

/**
 * Hook to check AI Configurator availability status
 */
export function useAIConfiguratorStatus() {
  return useQuery<AIConfiguratorStatus>({
    queryKey: ['aiconfigurator-status'],
    queryFn: async () => {
      return await aiConfiguratorApi.getStatus()
    },
    staleTime: 60 * 1000, // Cache for 1 minute
    retry: 1,
  })
}

/**
 * Hook to analyze a model + GPU combination and get optimal configuration
 */
export function useAIConfiguratorAnalyze() {
  return useMutation<AIConfiguratorResult, Error, AIConfiguratorInput>({
    mutationFn: async (input: AIConfiguratorInput) => {
      return await aiConfiguratorApi.analyze(input)
    },
  })
}

/**
 * Hook to normalize GPU product string to AI Configurator format
 */
export function useNormalizeGpu() {
  return useMutation<{ gpuProduct: string; normalized: string }, Error, string>({
    mutationFn: async (gpuProduct: string) => {
      return await aiConfiguratorApi.normalizeGpu(gpuProduct)
    },
  })
}
