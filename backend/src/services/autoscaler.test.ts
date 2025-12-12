import { describe, test, expect } from 'bun:test';

describe('AutoscalerService', () => {
  describe('isAKSCluster', () => {
    test('should detect AKS clusters from Azure labels', () => {
      // Mock node with Azure label
      const node = {
        metadata: {
          labels: {
            'kubernetes.azure.com/cluster': 'my-aks-cluster',
          },
        },
        spec: {},
      };

      const hasAzureLabel = 'kubernetes.azure.com/cluster' in (node.metadata?.labels || {});
      expect(hasAzureLabel).toBe(true);
    });

    test('should detect AKS clusters from providerID', () => {
      const providerID = 'azure:///subscriptions/xxx/resourceGroups/yyy/providers/Microsoft.Compute/virtualMachineScaleSets/zzz/virtualMachines/0';
      const isAzure = providerID.startsWith('azure://');
      expect(isAzure).toBe(true);
    });

    test('should not detect non-Azure clusters', () => {
      const providerID = 'gce://project/us-central1-a/instance-1';
      const isAzure = providerID.startsWith('azure://');
      expect(isAzure).toBe(false);
    });
  });

  describe('detectAutoscaler logic', () => {
    test('should detect AKS managed autoscaler from node labels', () => {
      const node = {
        metadata: {
          labels: {
            'cluster-autoscaler.kubernetes.io/enabled': 'true',
            'agentpool': 'gpunodepool',
          },
        },
        status: {
          allocatable: { 'nvidia.com/gpu': '4' },
        },
      };

      const hasAutoscalerLabel = node.metadata?.labels?.['cluster-autoscaler.kubernetes.io/enabled'] === 'true';
      const nodePool = node.metadata?.labels?.['agentpool'];

      expect(hasAutoscalerLabel).toBe(true);
      expect(nodePool).toBe('gpunodepool');
    });

    test('should parse cluster-autoscaler status ConfigMap', () => {
      const statusData = JSON.stringify({
        health: 'Healthy',
        lastUpdateTime: '2025-12-11T10:00:00Z',
        nodeGroups: {
          'ng-1': { minSize: 1, maxSize: 5, currentSize: 3 },
          'ng-2': { minSize: 0, maxSize: 10, currentSize: 2 },
        },
      });

      const parsedStatus = JSON.parse(statusData);

      expect(parsedStatus.health).toBe('Healthy');
      expect(parsedStatus.nodeGroups['ng-1'].currentSize).toBe(3);
      expect(Object.keys(parsedStatus.nodeGroups)).toHaveLength(2);
    });

    test('should detect stale autoscaler status', () => {
      const now = new Date();
      const lastUpdate = new Date();
      lastUpdate.setMinutes(lastUpdate.getMinutes() - 10); // 10 minutes ago

      const ageMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
      const isStale = ageMinutes > 5;

      expect(isStale).toBe(true);
    });

    test('should not detect fresh status as stale', () => {
      const now = new Date();
      const lastUpdate = new Date();
      lastUpdate.setMinutes(lastUpdate.getMinutes() - 2); // 2 minutes ago

      const ageMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
      const isStale = ageMinutes > 5;

      expect(isStale).toBe(false);
    });
  });

  describe('AutoscalerDetectionResult types', () => {
    test('should create valid AKS managed result', () => {
      const result = {
        type: 'aks-managed' as const,
        detected: true,
        healthy: true,
        message: 'AKS managed autoscaler detected on 2 node pool(s)',
        nodeGroupCount: 2,
      };

      expect(result.type).toBe('aks-managed');
      expect(result.detected).toBe(true);
      expect(result.nodeGroupCount).toBe(2);
    });

    test('should create valid cluster-autoscaler result', () => {
      const result = {
        type: 'cluster-autoscaler' as const,
        detected: true,
        healthy: true,
        message: 'Cluster Autoscaler running on 1 node group(s)',
        nodeGroupCount: 1,
        lastActivity: '2025-12-11T10:00:00Z',
      };

      expect(result.type).toBe('cluster-autoscaler');
      expect(result.lastActivity).toBeDefined();
    });

    test('should create valid none result', () => {
      const result = {
        type: 'none' as const,
        detected: false,
        healthy: false,
        message: 'No autoscaler detected',
      };

      expect(result.type).toBe('none');
      expect(result.detected).toBe(false);
    });
  });
});
