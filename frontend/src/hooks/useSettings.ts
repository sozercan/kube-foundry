import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, type Settings, type ProviderInfo } from '@/lib/api'

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: { activeProviderId?: string; defaultNamespace?: string }) =>
      settingsApi.update(settings),
    onSuccess: () => {
      // Invalidate settings and cluster status queries
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['cluster-status'] })
    },
  })
}

export function useProviders() {
  return useQuery<{ providers: ProviderInfo[] }>({
    queryKey: ['providers'],
    queryFn: () => settingsApi.listProviders(),
  })
}

export function useProviderDetails(providerId: string) {
  return useQuery({
    queryKey: ['provider', providerId],
    queryFn: () => settingsApi.getProvider(providerId),
    enabled: !!providerId,
  })
}
