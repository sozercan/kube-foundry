import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { installationApi, type HelmStatus, type InstallationStatus, type InstallResult } from '@/lib/api'

/**
 * Hook to check Helm CLI availability
 */
export function useHelmStatus() {
  return useQuery<HelmStatus>({
    queryKey: ['helm-status'],
    queryFn: async () => {
      try {
        return await installationApi.getHelmStatus()
      } catch {
        return {
          available: false,
          error: 'Failed to check Helm status',
        }
      }
    },
    refetchInterval: 60000, // Check every minute
    retry: false,
  })
}

/**
 * Hook to check provider installation status
 */
export function useProviderInstallationStatus(providerId: string) {
  return useQuery<InstallationStatus>({
    queryKey: ['provider-installation-status', providerId],
    queryFn: async () => {
      try {
        return await installationApi.getProviderStatus(providerId)
      } catch {
        return {
          providerId,
          providerName: providerId,
          installed: false,
          crdFound: false,
          operatorRunning: false,
          message: 'Failed to check installation status',
        }
      }
    },
    refetchInterval: 30000, // Check every 30 seconds
    retry: false,
    enabled: !!providerId,
  })
}

/**
 * Hook to install a provider
 */
export function useInstallProvider() {
  const queryClient = useQueryClient()

  return useMutation<InstallResult, Error, string>({
    mutationFn: async (providerId: string) => {
      return await installationApi.installProvider(providerId)
    },
    onSuccess: (_, providerId) => {
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['provider-installation-status', providerId] })
      queryClient.invalidateQueries({ queryKey: ['runtimes-status'] })
    },
  })
}

/**
 * Hook to uninstall a provider
 */
export function useUninstallProvider() {
  const queryClient = useQueryClient()

  return useMutation<InstallResult, Error, string>({
    mutationFn: async (providerId: string) => {
      return await installationApi.uninstallProvider(providerId)
    },
    onSuccess: (_, providerId) => {
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['provider-installation-status', providerId] })
      queryClient.invalidateQueries({ queryKey: ['runtimes-status'] })
    },
  })
}
