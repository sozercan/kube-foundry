import * as k8s from '@kubernetes/client-node';
import { configService } from './config';
import { providerRegistry } from '../providers';
import type { DeploymentStatus, PodStatus, ClusterStatus, PodPhase, DeploymentConfig } from '@kubefoundry/shared';
import type { InstallationStatus } from '../providers/types';
import { withRetry, isK8sRetryableError } from '../lib/retry';
import logger from '../lib/logger';

/**
 * GPU availability information from cluster nodes
 */
export interface GPUAvailability {
  available: boolean;
  totalGPUs: number;
  gpuNodes: string[];
}

/**
 * GPU Operator installation status
 */
export interface GPUOperatorStatus {
  installed: boolean;
  crdFound: boolean;
  operatorRunning: boolean;
  gpusAvailable: boolean;
  totalGPUs: number;
  gpuNodes: string[];
  message: string;
}

/**
 * Per-node GPU information including allocation status
 */
export interface NodeGpuInfo {
  nodeName: string;
  totalGpus: number;      // nvidia.com/gpu allocatable on this node
  allocatedGpus: number;  // Sum of GPU requests from pods on this node
  availableGpus: number;  // totalGpus - allocatedGpus
}

/**
 * Cluster-wide GPU capacity for fit validation
 */
export interface ClusterGpuCapacity {
  totalGpus: number;              // Sum of allocatable GPUs across all nodes
  allocatedGpus: number;          // Sum of GPU requests from all pods
  availableGpus: number;          // totalGpus - allocatedGpus
  maxContiguousAvailable: number; // Highest available GPUs on any single node
  maxNodeGpuCapacity: number;     // Largest GPU count on any single node
  gpuNodeCount: number;           // Total number of nodes with GPUs
  totalMemoryGb?: number;         // Total GPU memory per GPU (e.g., 80 for A100 80GB)
  nodes: NodeGpuInfo[];           // Per-node breakdown
}

class KubernetesService {
  private kc: k8s.KubeConfig;
  private customObjectsApi: k8s.CustomObjectsApi;
  private coreV1Api: k8s.CoreV1Api;
  private defaultNamespace: string;

  constructor() {
    this.kc = new k8s.KubeConfig();

    try {
      this.kc.loadFromDefault();
    } catch {
      logger.warn('No kubeconfig found, using mock mode');
    }

    this.customObjectsApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
    this.defaultNamespace = process.env.DEFAULT_NAMESPACE || 'kubefoundry-system';
  }

  async checkClusterConnection(): Promise<ClusterStatus> {
    try {
      await withRetry(
        () => this.coreV1Api.listNamespace(),
        { operationName: 'checkClusterConnection', maxRetries: 2 }
      );
      const currentContext = this.kc.getCurrentContext();
      return {
        connected: true,
        namespace: this.defaultNamespace,
        clusterName: currentContext,
      };
    } catch (error) {
      return {
        connected: false,
        namespace: this.defaultNamespace,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async listDeployments(namespace: string, providerId?: string): Promise<DeploymentStatus[]> {
    logger.debug({ namespace }, 'listDeployments called');

    // Get the provider (use specified or active provider)
    const activeProviderId = providerId || await configService.getActiveProviderId();
    const provider = providerRegistry.getProvider(activeProviderId);
    const crdConfig = provider.getCRDConfig();

    try {
      logger.debug(
        { apiGroup: crdConfig.apiGroup, apiVersion: crdConfig.apiVersion, plural: crdConfig.plural },
        'Calling listNamespacedCustomObject'
      );

      const response = await withRetry(
        () => this.customObjectsApi.listNamespacedCustomObject(
          crdConfig.apiGroup,
          crdConfig.apiVersion,
          namespace,
          crdConfig.plural
        ),
        { operationName: 'listDeployments' }
      );

      logger.debug({ statusCode: response.response.statusCode }, 'listNamespacedCustomObject success');

      const items = (response.body as { items?: unknown[] }).items || [];
      logger.debug({ count: items.length }, 'Found deployments');
      return items.map((item) => provider.parseStatus(item));
    } catch (error: any) {
      // Check for CRD not found (404) or permission denied (403)
      const statusCode = error?.statusCode || error?.response?.statusCode;
      if (error?.message === 'HTTP request failed' || statusCode === 404 || statusCode === 403) {
        // This is expected when the provider CRD is not installed - don't log as error
        logger.debug({ namespace }, 'CRD not found in namespace (provider may not be installed)');
        return [];
      }

      // Log unexpected errors
      logger.error({ error: error?.message || error }, 'Unexpected error listing deployments');
      return [];
    }
  }

  async getDeployment(name: string, namespace: string, providerId?: string): Promise<DeploymentStatus | null> {
    try {
      // Get the provider
      const activeProviderId = providerId || await configService.getActiveProviderId();
      const provider = providerRegistry.getProvider(activeProviderId);
      const crdConfig = provider.getCRDConfig();

      const response = await withRetry(
        () => this.customObjectsApi.getNamespacedCustomObject(
          crdConfig.apiGroup,
          crdConfig.apiVersion,
          namespace,
          crdConfig.plural,
          name
        ),
        { operationName: 'getDeployment' }
      );

      return provider.parseStatus(response.body);
    } catch (error) {
      logger.error({ error, name, namespace }, 'Error getting deployment');
      return null;
    }
  }

  async createDeployment(config: DeploymentConfig, providerId?: string): Promise<void> {
    // Get the provider
    const activeProviderId = providerId || await configService.getActiveProviderId();
    const provider = providerRegistry.getProvider(activeProviderId);
    const crdConfig = provider.getCRDConfig();

    // Generate manifest using provider
    const manifest = provider.generateManifest(config);

    await withRetry(
      () => this.customObjectsApi.createNamespacedCustomObject(
        crdConfig.apiGroup,
        crdConfig.apiVersion,
        config.namespace,
        crdConfig.plural,
        manifest
      ),
      { operationName: 'createDeployment' }
    );
  }

  async deleteDeployment(name: string, namespace: string, providerId?: string): Promise<void> {
    // Get the provider
    const activeProviderId = providerId || await configService.getActiveProviderId();
    const provider = providerRegistry.getProvider(activeProviderId);
    const crdConfig = provider.getCRDConfig();

    await withRetry(
      () => this.customObjectsApi.deleteNamespacedCustomObject(
        crdConfig.apiGroup,
        crdConfig.apiVersion,
        namespace,
        crdConfig.plural,
        name
      ),
      { operationName: 'deleteDeployment' }
    );
  }

  async getDeploymentPods(name: string, namespace: string): Promise<PodStatus[]> {
    try {
      const response = await withRetry(
        () => this.coreV1Api.listNamespacedPod(
          namespace,
          undefined,
          undefined,
          undefined,
          undefined,
          `app.kubernetes.io/instance=${name}`
        ),
        { operationName: 'getDeploymentPods' }
      );

      return response.body.items.map((pod): PodStatus => ({
        name: pod.metadata?.name || 'unknown',
        phase: (pod.status?.phase as PodPhase) || 'Unknown',
        ready: pod.status?.containerStatuses?.every((cs) => cs.ready) || false,
        restarts: pod.status?.containerStatuses?.reduce((sum, cs) => sum + cs.restartCount, 0) || 0,
        node: pod.spec?.nodeName,
      }));
    } catch (error) {
      logger.error({ error, name, namespace }, 'Error getting pods');
      return [];
    }
  }

  /**
   * Check if a provider is installed in the cluster
   */
  async checkProviderInstallation(providerId?: string): Promise<InstallationStatus> {
    const activeProviderId = providerId || await configService.getActiveProviderId();
    const provider = providerRegistry.getProvider(activeProviderId);

    return provider.checkInstallation({
      customObjectsApi: this.customObjectsApi,
      coreV1Api: this.coreV1Api,
    });
  }

  /**
   * Get the default namespace for the active provider
   */
  async getDefaultNamespace(): Promise<string> {
    return configService.getDefaultNamespace();
  }

  /**
   * Check if NVIDIA GPUs are available on cluster nodes
   */
  async checkGPUAvailability(): Promise<GPUAvailability> {
    try {
      const response = await withRetry(
        () => this.coreV1Api.listNode(),
        { operationName: 'checkGPUAvailability' }
      );
      const nodes = response.body.items;

      let totalGPUs = 0;
      const gpuNodes: string[] = [];

      for (const node of nodes) {
        // Check allocatable resources for nvidia.com/gpu
        const gpuCapacity = node.status?.allocatable?.['nvidia.com/gpu'];
        if (gpuCapacity) {
          const gpuCount = parseInt(gpuCapacity, 10);
          if (gpuCount > 0) {
            totalGPUs += gpuCount;
            gpuNodes.push(node.metadata?.name || 'unknown');
          }
        }
      }

      return {
        available: totalGPUs > 0,
        totalGPUs,
        gpuNodes,
      };
    } catch (error) {
      logger.error({ error }, 'Error checking GPU availability');
      return { available: false, totalGPUs: 0, gpuNodes: [] };
    }
  }

  /**
   * Check if the NVIDIA GPU Operator is installed
   */
  async checkGPUOperatorStatus(): Promise<GPUOperatorStatus> {
    // Check for GPU availability on nodes
    const gpuAvailability = await this.checkGPUAvailability();

    // Check for GPU Operator CRD (ClusterPolicy)
    let crdFound = false;
    try {
      await withRetry(
        () => this.customObjectsApi.listClusterCustomObject(
          'nvidia.com',
          'v1',
          'clusterpolicies'
        ),
        { operationName: 'checkGPUOperatorCRD', maxRetries: 1 }
      );
      crdFound = true;
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.response?.statusCode;
      if (statusCode !== 404) {
        logger.error({ error: error?.message || error }, 'Error checking GPU Operator CRD');
      }
      crdFound = false;
    }

    // Check for GPU Operator pods in gpu-operator namespace
    let operatorRunning = false;
    try {
      const pods = await withRetry(
        () => this.coreV1Api.listNamespacedPod(
          'gpu-operator',
          undefined,
          undefined,
          undefined,
          undefined,
          'app=gpu-operator'
        ),
        { operationName: 'checkGPUOperatorPods', maxRetries: 1 }
      );
      operatorRunning = pods.body.items.some(
        (pod) => pod.status?.phase === 'Running'
      );

      // Alternative: check for any running pods in gpu-operator namespace if label didn't match
      if (!operatorRunning) {
        const allPods = await this.coreV1Api.listNamespacedPod('gpu-operator');
        operatorRunning = allPods.body.items.some(
          (pod) => pod.status?.phase === 'Running'
        );
      }
    } catch {
      // Namespace might not exist
      operatorRunning = false;
    }

    const installed = crdFound && operatorRunning;

    let message: string;
    if (gpuAvailability.available) {
      message = `GPUs enabled: ${gpuAvailability.totalGPUs} GPU(s) on ${gpuAvailability.gpuNodes.length} node(s)`;
    } else if (installed) {
      message = 'GPU Operator installed but no GPUs detected on nodes';
    } else if (crdFound) {
      message = 'GPU Operator CRD found but operator is not running';
    } else {
      message = 'GPU Operator not installed';
    }

    return {
      installed,
      crdFound,
      operatorRunning,
      gpusAvailable: gpuAvailability.available,
      totalGPUs: gpuAvailability.totalGPUs,
      gpuNodes: gpuAvailability.gpuNodes,
      message,
    };
  }

  /**
   * Get detailed GPU capacity including per-node availability.
   * This accounts for GPUs currently allocated to running pods.
   */
  async getClusterGpuCapacity(): Promise<ClusterGpuCapacity> {
    try {
      // Step 1: Get all nodes and their GPU capacity
      const nodesResponse = await withRetry(
        () => this.coreV1Api.listNode(),
        { operationName: 'getClusterGpuCapacity:listNodes' }
      );

      const nodeGpuMap = new Map<string, { total: number; allocated: number }>();
      let detectedGpuMemoryGb: number | undefined;

      for (const node of nodesResponse.body.items) {
        const nodeName = node.metadata?.name || 'unknown';
        const gpuCapacity = node.status?.allocatable?.['nvidia.com/gpu'];
        if (gpuCapacity) {
          const gpuCount = parseInt(gpuCapacity, 10);
          if (gpuCount > 0) {
            nodeGpuMap.set(nodeName, { total: gpuCount, allocated: 0 });

            // Try to detect GPU memory from node labels (prefer nvidia.com/gpu.memory)
            if (!detectedGpuMemoryGb) {
              // Primary: Use nvidia.com/gpu.memory label (value in MiB from GPU Feature Discovery)
              const gpuMemoryMib = node.metadata?.labels?.['nvidia.com/gpu.memory'];
              if (gpuMemoryMib) {
                const memoryMib = parseInt(gpuMemoryMib, 10);
                if (!isNaN(memoryMib) && memoryMib > 0) {
                  detectedGpuMemoryGb = Math.round(memoryMib / 1024); // Convert MiB to GB
                }
              }

              // Fallback: Detect from nvidia.com/gpu.product label
              if (!detectedGpuMemoryGb) {
                const gpuProduct = node.metadata?.labels?.['nvidia.com/gpu.product'];
                if (gpuProduct) {
                  detectedGpuMemoryGb = this.detectGpuMemoryFromProduct(gpuProduct);
                }
              }
            }
          }
        }
      }

      // Step 2: Get all pods across all namespaces and sum their GPU requests per node
      const podsResponse = await withRetry(
        () => this.coreV1Api.listPodForAllNamespaces(),
        { operationName: 'getClusterGpuCapacity:listPods' }
      );

      for (const pod of podsResponse.body.items) {
        // Only count running or pending pods (not completed/failed)
        const phase = pod.status?.phase;
        if (phase !== 'Running' && phase !== 'Pending') {
          continue;
        }

        const nodeName = pod.spec?.nodeName;
        if (!nodeName || !nodeGpuMap.has(nodeName)) {
          continue;
        }

        // Sum GPU requests from all containers in the pod
        let podGpuRequests = 0;
        for (const container of pod.spec?.containers || []) {
          const gpuRequest = container.resources?.requests?.['nvidia.com/gpu'];
          if (gpuRequest) {
            podGpuRequests += parseInt(gpuRequest, 10);
          }
          // Also check limits if requests not specified (limits can imply requests)
          if (!gpuRequest) {
            const gpuLimit = container.resources?.limits?.['nvidia.com/gpu'];
            if (gpuLimit) {
              podGpuRequests += parseInt(gpuLimit, 10);
            }
          }
        }

        if (podGpuRequests > 0) {
          const nodeInfo = nodeGpuMap.get(nodeName)!;
          nodeInfo.allocated += podGpuRequests;
        }
      }

      // Step 3: Build result
      const nodes: NodeGpuInfo[] = [];
      let totalGpus = 0;
      let allocatedGpus = 0;
      let maxContiguousAvailable = 0;
      let maxNodeGpuCapacity = 0;

      for (const [nodeName, info] of nodeGpuMap) {
        const availableOnNode = Math.max(0, info.total - info.allocated);
        nodes.push({
          nodeName,
          totalGpus: info.total,
          allocatedGpus: info.allocated,
          availableGpus: availableOnNode,
        });
        totalGpus += info.total;
        allocatedGpus += info.allocated;
        maxContiguousAvailable = Math.max(maxContiguousAvailable, availableOnNode);
        maxNodeGpuCapacity = Math.max(maxNodeGpuCapacity, info.total);
      }

      return {
        totalGpus,
        allocatedGpus,
        availableGpus: totalGpus - allocatedGpus,
        maxContiguousAvailable,
        maxNodeGpuCapacity,
        gpuNodeCount: nodeGpuMap.size,
        totalMemoryGb: detectedGpuMemoryGb,
        nodes,
      };
    } catch (error) {
      logger.error({ error }, 'Error getting cluster GPU capacity');
      return {
        totalGpus: 0,
        allocatedGpus: 0,
        availableGpus: 0,
        maxContiguousAvailable: 0,
        maxNodeGpuCapacity: 0,
        gpuNodeCount: 0,
        nodes: [],
      };
    }
  }

  /**
   * Get detailed GPU capacity including per-node pool breakdown.
   * This groups nodes by node pool labels and includes GPU model information.
   */
  async getDetailedClusterGpuCapacity(): Promise<import('@kubefoundry/shared').DetailedClusterCapacity> {
    try {
      // Get basic capacity first
      const basicCapacity = await this.getClusterGpuCapacity();

      // Step 1: Get all nodes and group by node pool
      const nodesResponse = await withRetry(
        () => this.coreV1Api.listNode(),
        { operationName: 'getDetailedClusterGpuCapacity:listNodes' }
      );

      const nodePoolMap = new Map<string, {
        gpuCount: number;
        nodeCount: number;
        availableGpus: number;
        gpuModel?: string;
      }>();

      for (const node of nodesResponse.body.items) {
        const nodeName = node.metadata?.name || 'unknown';
        const gpuCapacity = node.status?.allocatable?.['nvidia.com/gpu'];

        if (gpuCapacity) {
          const gpuCount = parseInt(gpuCapacity, 10);
          if (gpuCount > 0) {
            // Determine node pool name from labels
            // AKS uses: agentpool, kubernetes.azure.com/agentpool
            // GKE uses: cloud.google.com/gke-nodepool
            // EKS uses: eks.amazonaws.com/nodegroup
            const nodePoolName =
              node.metadata?.labels?.['agentpool'] ||
              node.metadata?.labels?.['kubernetes.azure.com/agentpool'] ||
              node.metadata?.labels?.['cloud.google.com/gke-nodepool'] ||
              node.metadata?.labels?.['eks.amazonaws.com/nodegroup'] ||
              'default';

            // Get GPU model from labels
            const gpuModel =
              node.metadata?.labels?.['nvidia.com/gpu.product'] ||
              node.metadata?.labels?.['accelerator'];

            // Find available GPUs for this node
            const nodeInfo = basicCapacity.nodes.find(n => n.nodeName === nodeName);
            const nodeAvailableGpus = nodeInfo?.availableGpus || 0;

            if (!nodePoolMap.has(nodePoolName)) {
              nodePoolMap.set(nodePoolName, {
                gpuCount: 0,
                nodeCount: 0,
                availableGpus: 0,
                gpuModel,
              });
            }

            const poolInfo = nodePoolMap.get(nodePoolName)!;
            poolInfo.gpuCount += gpuCount;
            poolInfo.nodeCount += 1;
            poolInfo.availableGpus += nodeAvailableGpus;

            // Update GPU model if not set or if we find a more specific one
            if (!poolInfo.gpuModel && gpuModel) {
              poolInfo.gpuModel = gpuModel;
            }
          }
        }
      }

      // Convert to array
      const nodePools: import('@kubefoundry/shared').NodePoolInfo[] = [];
      for (const [name, info] of nodePoolMap) {
        nodePools.push({
          name,
          gpuCount: info.gpuCount,
          nodeCount: info.nodeCount,
          availableGpus: info.availableGpus,
          gpuModel: info.gpuModel,
        });
      }

      return {
        totalGpus: basicCapacity.totalGpus,
        allocatedGpus: basicCapacity.allocatedGpus,
        availableGpus: basicCapacity.availableGpus,
        maxContiguousAvailable: basicCapacity.maxContiguousAvailable,
        maxNodeGpuCapacity: basicCapacity.maxNodeGpuCapacity,
        gpuNodeCount: basicCapacity.gpuNodeCount,
        totalMemoryGb: basicCapacity.totalMemoryGb,
        nodePools,
      };
    } catch (error) {
      logger.error({ error }, 'Error getting detailed cluster GPU capacity');
      return {
        totalGpus: 0,
        allocatedGpus: 0,
        availableGpus: 0,
        maxContiguousAvailable: 0,
        maxNodeGpuCapacity: 0,
        gpuNodeCount: 0,
        nodePools: [],
      };
    }
  }

  /**
   * Get failure reasons for a pending pod by parsing Kubernetes Events
   */
  async getPodFailureReasons(
    podName: string,
    namespace: string
  ): Promise<import('@kubefoundry/shared').PodFailureReason[]> {
    try {
      // Get events for the pod
      const eventsResponse = await withRetry(
        () => this.coreV1Api.listNamespacedEvent(
          namespace,
          undefined,
          undefined,
          undefined,
          `involvedObject.name=${podName}`
        ),
        { operationName: 'getPodFailureReasons' }
      );

      const reasons: import('@kubefoundry/shared').PodFailureReason[] = [];

      for (const event of eventsResponse.body.items) {
        // Focus on Warning events related to scheduling failures
        if (event.type !== 'Warning') {
          continue;
        }

        const reason = event.reason || 'Unknown';
        const message = event.message || '';

        // Analyze the event to determine if it's a resource constraint
        const isResourceConstraint = reason === 'FailedScheduling' ||
          message.toLowerCase().includes('insufficient');

        let resourceType: 'gpu' | 'cpu' | 'memory' | undefined;
        let canAutoscalerHelp = false;

        if (isResourceConstraint) {
          // Detect resource type from message
          if (message.includes('nvidia.com/gpu')) {
            resourceType = 'gpu';
            canAutoscalerHelp = true; // Autoscaler can add GPU nodes
          } else if (message.toLowerCase().includes('cpu')) {
            resourceType = 'cpu';
            canAutoscalerHelp = true;
          } else if (message.toLowerCase().includes('memory')) {
            resourceType = 'memory';
            canAutoscalerHelp = true;
          }

          // Check for taint-related failures (autoscaler can't help with these)
          if (message.toLowerCase().includes('taint') ||
            message.toLowerCase().includes('toleration')) {
            canAutoscalerHelp = false;
          }

          // Check for node selector failures (autoscaler can't help with these)
          if (message.toLowerCase().includes('node selector') ||
            message.toLowerCase().includes('didn\'t match')) {
            canAutoscalerHelp = false;
          }
        }

        reasons.push({
          reason,
          message,
          isResourceConstraint,
          resourceType,
          canAutoscalerHelp,
        });
      }

      return reasons;
    } catch (error) {
      logger.error({ error, podName, namespace }, 'Error getting pod failure reasons');
      return [];
    }
  }

  /**
   * Detect GPU memory from NVIDIA GPU product name
   * This is a best-effort mapping based on common GPU models
   */
  private detectGpuMemoryFromProduct(gpuProduct: string): number | undefined {
    const product = gpuProduct.toLowerCase();

    // NVIDIA Data Center GPUs
    if (product.includes('a100') && product.includes('80')) return 80;
    if (product.includes('a100') && product.includes('40')) return 40;
    if (product.includes('a100')) return 40; // Default A100 is 40GB
    if (product.includes('h100') && product.includes('80')) return 80;
    if (product.includes('h100')) return 80;
    if (product.includes('h200')) return 141;
    if (product.includes('a10g')) return 24;
    if (product.includes('a10')) return 24;
    if (product.includes('l40s')) return 48;
    if (product.includes('l40')) return 48;
    if (product.includes('l4')) return 24;
    if (product.includes('t4')) return 16;
    if (product.includes('v100') && product.includes('32')) return 32;
    if (product.includes('v100')) return 16;

    // NVIDIA Consumer GPUs
    if (product.includes('4090')) return 24;
    if (product.includes('4080')) return 16;
    if (product.includes('3090')) return 24;
    if (product.includes('3080') && product.includes('12')) return 12;
    if (product.includes('3080')) return 10;

    return undefined;
  }
}

export const kubernetesService = new KubernetesService();
