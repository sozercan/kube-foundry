import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { deploymentsApi, type DeploymentConfig, type DeploymentStatus } from '@/lib/api'

export function useDeployments(namespace?: string) {
  return useQuery({
    queryKey: ['deployments', namespace],
    queryFn: () => deploymentsApi.list(namespace),
    select: (data) => data.deployments,
    refetchInterval: 10000, // Refresh every 10 seconds
  })
}

export function useDeployment(name: string | undefined, namespace?: string) {
  return useQuery({
    queryKey: ['deployment', name, namespace],
    queryFn: () => deploymentsApi.get(name!, namespace),
    enabled: !!name,
    refetchInterval: 5000, // Refresh every 5 seconds
  })
}

export function useDeploymentPods(name: string | undefined, namespace?: string) {
  return useQuery({
    queryKey: ['deployment-pods', name, namespace],
    queryFn: () => deploymentsApi.getPods(name!, namespace),
    select: (data) => data.pods,
    enabled: !!name,
    refetchInterval: 5000,
  })
}

export function useCreateDeployment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (config: DeploymentConfig) => deploymentsApi.create(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
    },
  })
}

export function useDeleteDeployment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, namespace }: { name: string; namespace?: string }) =>
      deploymentsApi.delete(name, namespace),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deployments'] })
    },
  })
}

export type { DeploymentConfig, DeploymentStatus }
