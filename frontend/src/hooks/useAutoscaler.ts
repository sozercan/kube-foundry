import { useQuery } from '@tanstack/react-query';
import {
  autoscalerApi,
  gpuOperatorApi,
  type AutoscalerDetectionResult,
  type AutoscalerStatusInfo,
  type DetailedClusterCapacity,
  type PodFailureReason,
} from '@/lib/api';

/**
 * Hook to detect autoscaler type and health status
 */
export function useAutoscalerDetection() {
  return useQuery<AutoscalerDetectionResult>({
    queryKey: ['autoscaler-detection'],
    queryFn: () => autoscalerApi.detect(),
    staleTime: 60000, // Cache for 1 minute
    refetchInterval: 120000, // Refetch every 2 minutes
  });
}

/**
 * Hook to get detailed autoscaler status from ConfigMap
 */
export function useAutoscalerStatus() {
  return useQuery<AutoscalerStatusInfo>({
    queryKey: ['autoscaler-status'],
    queryFn: () => autoscalerApi.getStatus(),
    staleTime: 60000,
    retry: false, // Don't retry if ConfigMap doesn't exist
  });
}

/**
 * Hook to get detailed cluster GPU capacity with node pool breakdown
 */
export function useDetailedCapacity() {
  return useQuery<DetailedClusterCapacity>({
    queryKey: ['gpu-capacity-detailed'],
    queryFn: () => gpuOperatorApi.getDetailedCapacity(),
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
}

/**
 * Hook to get reasons why a deployment's pods are pending
 */
export function usePendingReasons(deploymentName: string, namespace?: string, enabled = true) {
  return useQuery<{ reasons: PodFailureReason[] }>({
    queryKey: ['pending-reasons', deploymentName, namespace],
    queryFn: () => autoscalerApi.getPendingReasons(deploymentName, namespace),
    enabled: enabled && !!deploymentName,
    staleTime: 10000, // Cache for 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
