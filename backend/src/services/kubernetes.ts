import * as k8s from '@kubernetes/client-node';
import { configService } from './config';
import { providerRegistry } from '../providers';
import type { DeploymentStatus, PodStatus, ClusterStatus, PodPhase, DeploymentConfig } from '@kubefoundry/shared';
import type { InstallationStatus } from '../providers/types';

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
      console.warn('No kubeconfig found, using mock mode');
    }

    this.customObjectsApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
    this.coreV1Api = this.kc.makeApiClient(k8s.CoreV1Api);
    this.defaultNamespace = process.env.DEFAULT_NAMESPACE || 'kubefoundry';
  }

  async checkClusterConnection(): Promise<ClusterStatus> {
    try {
      await this.coreV1Api.listNamespace();
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
    console.log(`[KubernetesService] listDeployments called for namespace: ${namespace}`);
    
    // Get the provider (use specified or active provider)
    const activeProviderId = providerId || await configService.getActiveProviderId();
    const provider = providerRegistry.getProvider(activeProviderId);
    const crdConfig = provider.getCRDConfig();
    
    try {
      console.log(`[KubernetesService] Calling listNamespacedCustomObject for ${crdConfig.apiGroup}/${crdConfig.apiVersion}/${crdConfig.plural}`);
      const response = await this.customObjectsApi.listNamespacedCustomObject(
        crdConfig.apiGroup,
        crdConfig.apiVersion,
        namespace,
        crdConfig.plural
      );
      console.log(`[KubernetesService] listNamespacedCustomObject success. Status: ${response.response.statusCode}`);

      const items = (response.body as { items?: unknown[] }).items || [];
      console.log(`[KubernetesService] Found ${items.length} items`);
      return items.map((item) => provider.parseStatus(item));
    } catch (error: any) {
      // Check for CRD not found (404) or permission denied (403)
      const statusCode = error?.statusCode || error?.response?.statusCode;
      if (error?.message === 'HTTP request failed' || statusCode === 404 || statusCode === 403) {
        // This is expected when the provider CRD is not installed - don't log as error
        console.log(`[KubernetesService] CRD not found in namespace ${namespace} (provider may not be installed)`);
        return [];
      }
      
      // Log unexpected errors
      console.error('[KubernetesService] Unexpected error listing deployments:', error?.message || error);
      return [];
    }
  }

  async getDeployment(name: string, namespace: string, providerId?: string): Promise<DeploymentStatus | null> {
    try {
      // Get the provider
      const activeProviderId = providerId || await configService.getActiveProviderId();
      const provider = providerRegistry.getProvider(activeProviderId);
      const crdConfig = provider.getCRDConfig();

      const response = await this.customObjectsApi.getNamespacedCustomObject(
        crdConfig.apiGroup,
        crdConfig.apiVersion,
        namespace,
        crdConfig.plural,
        name
      );

      return provider.parseStatus(response.body);
    } catch (error) {
      console.error('Error getting deployment:', error);
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

    await this.customObjectsApi.createNamespacedCustomObject(
      crdConfig.apiGroup,
      crdConfig.apiVersion,
      config.namespace,
      crdConfig.plural,
      manifest
    );
  }

  async deleteDeployment(name: string, namespace: string, providerId?: string): Promise<void> {
    // Get the provider
    const activeProviderId = providerId || await configService.getActiveProviderId();
    const provider = providerRegistry.getProvider(activeProviderId);
    const crdConfig = provider.getCRDConfig();

    await this.customObjectsApi.deleteNamespacedCustomObject(
      crdConfig.apiGroup,
      crdConfig.apiVersion,
      namespace,
      crdConfig.plural,
      name
    );
  }

  async getDeploymentPods(name: string, namespace: string): Promise<PodStatus[]> {
    try {
      const response = await this.coreV1Api.listNamespacedPod(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app.kubernetes.io/instance=${name}`
      );

      return response.body.items.map((pod): PodStatus => ({
        name: pod.metadata?.name || 'unknown',
        phase: (pod.status?.phase as PodPhase) || 'Unknown',
        ready: pod.status?.containerStatuses?.every((cs) => cs.ready) || false,
        restarts: pod.status?.containerStatuses?.reduce((sum, cs) => sum + cs.restartCount, 0) || 0,
        node: pod.spec?.nodeName,
      }));
    } catch (error) {
      console.error('Error getting pods:', error);
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
      const response = await this.coreV1Api.listNode();
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
      console.error('[KubernetesService] Error checking GPU availability:', error);
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
      await this.customObjectsApi.listClusterCustomObject(
        'nvidia.com',
        'v1',
        'clusterpolicies'
      );
      crdFound = true;
    } catch (error: any) {
      const statusCode = error?.statusCode || error?.response?.statusCode;
      if (statusCode !== 404) {
        console.error('[KubernetesService] Error checking GPU Operator CRD:', error?.message || error);
      }
      crdFound = false;
    }

    // Check for GPU Operator pods in gpu-operator namespace
    let operatorRunning = false;
    try {
      const pods = await this.coreV1Api.listNamespacedPod(
        'gpu-operator',
        undefined,
        undefined,
        undefined,
        undefined,
        'app=gpu-operator'
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
}

export const kubernetesService = new KubernetesService();
