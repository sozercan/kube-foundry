import { useQuery } from '@tanstack/react-query'
import { healthApi, type ClusterStatus } from '@/lib/api'

export function useClusterStatus() {
  return useQuery<ClusterStatus>({
    queryKey: ['cluster-status'],
    queryFn: async () => {
      try {
        return await healthApi.clusterStatus()
      } catch {
        return {
          connected: false,
          namespace: 'kubefoundry',
          error: 'Failed to connect to backend',
        }
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
    retry: false,
  })
}
