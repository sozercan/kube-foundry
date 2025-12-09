import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { gpuOperatorApi, type GPUOperatorStatus, type GPUOperatorInstallResult, type ClusterGpuCapacity } from '@/lib/api'

export function useGpuOperatorStatus() {
  return useQuery<GPUOperatorStatus>({
    queryKey: ['gpu-operator-status'],
    queryFn: () => gpuOperatorApi.getStatus(),
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}

export function useGpuCapacity() {
  return useQuery<ClusterGpuCapacity>({
    queryKey: ['gpu-capacity'],
    queryFn: () => gpuOperatorApi.getCapacity(),
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  })
}

export function useInstallGpuOperator() {
  const queryClient = useQueryClient()

  return useMutation<GPUOperatorInstallResult, Error>({
    mutationFn: () => gpuOperatorApi.install(),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['gpu-operator-status'] })
      queryClient.invalidateQueries({ queryKey: ['gpu-capacity'] })
      queryClient.invalidateQueries({ queryKey: ['cluster-status'] })
    },
  })
}
