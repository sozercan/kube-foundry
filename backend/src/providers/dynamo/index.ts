import * as k8s from '@kubernetes/client-node';
import type { DeploymentConfig, DeploymentStatus, DeploymentPhase } from '@kubefoundry/shared';
import type { Provider, CRDConfig, HelmRepo, HelmChart, InstallationStatus, InstallationStep } from '../types';
import { dynamoDeploymentConfigSchema } from './schema';

/**
 * NVIDIA Dynamo Provider
 * Implements the Provider interface for NVIDIA's Dynamo inference platform
 */
export class DynamoProvider implements Provider {
  id = 'dynamo';
  name = 'NVIDIA Dynamo';
  description = 'NVIDIA Dynamo is a high-performance inference serving platform for LLMs with support for KV cache routing and disaggregated serving.';
  defaultNamespace = 'dynamo-system';

  // CRD Constants
  private static readonly API_GROUP = 'dynamo.nvidia.com';
  private static readonly API_VERSION = 'v1alpha1';
  private static readonly CRD_PLURAL = 'dynamographdeployments';
  private static readonly CRD_KIND = 'DynamoGraphDeployment';

  getCRDConfig(): CRDConfig {
    return {
      apiGroup: DynamoProvider.API_GROUP,
      apiVersion: DynamoProvider.API_VERSION,
      plural: DynamoProvider.CRD_PLURAL,
      kind: DynamoProvider.CRD_KIND,
    };
  }

  generateManifest(config: DeploymentConfig): Record<string, unknown> {
    const workerSpec = this.generateWorkerSpec(config);
    const frontendSpec = this.generateFrontendSpec(config);

    return {
      apiVersion: `${DynamoProvider.API_GROUP}/${DynamoProvider.API_VERSION}`,
      kind: DynamoProvider.CRD_KIND,
      metadata: {
        name: config.name,
        namespace: config.namespace,
        labels: {
          'app.kubernetes.io/name': 'kubefoundry',
          'app.kubernetes.io/instance': config.name,
          'app.kubernetes.io/managed-by': 'kubefoundry',
        },
      },
      spec: {
        Frontend: frontendSpec,
        ...workerSpec,
      },
    };
  }

  private generateFrontendSpec(config: DeploymentConfig): Record<string, unknown> {
    const spec: Record<string, unknown> = {
      replicas: 1,
      'http-port': 8000,
    };

    if (config.routerMode !== 'none') {
      spec['router-mode'] = config.routerMode;
    }

    return spec;
  }

  private generateWorkerSpec(config: DeploymentConfig): Record<string, unknown> {
    const baseSpec: Record<string, unknown> = {
      'model-path': config.modelId,
      'served-model-name': config.servedModelName || config.modelId,
      replicas: config.replicas,
      envFrom: [
        {
          secretRef: {
            name: config.hfTokenSecret,
          },
        },
      ],
    };

    // Add common options
    if (config.enforceEager) {
      baseSpec['enforce-eager'] = true;
    }

    if (config.enablePrefixCaching) {
      baseSpec['enable-prefix-caching'] = true;
    }

    if (config.trustRemoteCode) {
      baseSpec['trust-remote-code'] = true;
    }

    if (config.contextLength) {
      baseSpec['max-model-len'] = config.contextLength;
    }

    // Add resource requirements
    if (config.resources) {
      baseSpec.resources = {
        limits: {
          'nvidia.com/gpu': config.resources.gpu,
          ...(config.resources.memory && { memory: config.resources.memory }),
        },
      };
    }

    // Add engine-specific arguments
    if (config.engineArgs) {
      Object.entries(config.engineArgs).forEach(([key, value]) => {
        baseSpec[key] = value;
      });
    }

    // Return with appropriate worker key based on engine
    switch (config.engine) {
      case 'vllm':
        return { VllmWorker: baseSpec };
      case 'sglang':
        return { SglangWorker: baseSpec };
      case 'trtllm':
        return { TrtllmWorker: baseSpec };
      default:
        return { VllmWorker: baseSpec };
    }
  }

  parseStatus(raw: unknown): DeploymentStatus {
    const obj = raw as {
      metadata?: { name?: string; namespace?: string; creationTimestamp?: string };
      spec?: {
        VllmWorker?: { 'model-path'?: string; replicas?: number };
        SglangWorker?: { 'model-path'?: string; replicas?: number };
        TrtllmWorker?: { 'model-path'?: string; replicas?: number };
        Frontend?: { replicas?: number };
      };
      status?: {
        phase?: string;
        replicas?: { ready?: number; available?: number; desired?: number };
        conditions?: Array<{
          type?: string;
          status?: string;
          reason?: string;
          message?: string;
          lastTransitionTime?: string;
        }>;
      };
    };

    const spec = obj.spec || {};
    const status = obj.status || {};

    // Determine engine from spec
    let engine: 'vllm' | 'sglang' | 'trtllm' = 'vllm';
    let modelId = '';
    let desiredReplicas = 1;

    if (spec.VllmWorker) {
      engine = 'vllm';
      modelId = spec.VllmWorker['model-path'] || '';
      desiredReplicas = spec.VllmWorker.replicas || 1;
    } else if (spec.SglangWorker) {
      engine = 'sglang';
      modelId = spec.SglangWorker['model-path'] || '';
      desiredReplicas = spec.SglangWorker.replicas || 1;
    } else if (spec.TrtllmWorker) {
      engine = 'trtllm';
      modelId = spec.TrtllmWorker['model-path'] || '';
      desiredReplicas = spec.TrtllmWorker.replicas || 1;
    }

    return {
      name: obj.metadata?.name || 'unknown',
      namespace: obj.metadata?.namespace || 'default',
      modelId,
      engine,
      mode: 'aggregated',
      phase: (status.phase as DeploymentPhase) || 'Pending',
      replicas: {
        desired: status.replicas?.desired || desiredReplicas,
        ready: status.replicas?.ready || 0,
        available: status.replicas?.available || 0,
      },
      conditions: (status.conditions || []).map((c) => ({
        type: c.type || '',
        status: (c.status as 'True' | 'False' | 'Unknown') || 'Unknown',
        reason: c.reason,
        message: c.message,
        lastTransitionTime: c.lastTransitionTime,
      })),
      pods: [],
      createdAt: obj.metadata?.creationTimestamp || new Date().toISOString(),
      frontendService: `${obj.metadata?.name}-frontend`,
    };
  }

  validateConfig(config: unknown): { valid: boolean; errors: string[]; data?: DeploymentConfig } {
    const result = dynamoDeploymentConfigSchema.safeParse(config);
    
    if (!result.success) {
      return {
        valid: false,
        errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      };
    }

    return {
      valid: true,
      errors: [],
      data: result.data as DeploymentConfig,
    };
  }

  getConfigSchema() {
    return dynamoDeploymentConfigSchema;
  }

  getInstallationSteps(): InstallationStep[] {
    return [
      {
        title: 'Add NVIDIA Helm Repository',
        command: 'helm repo add nvidia https://helm.ngc.nvidia.com/nvidia',
        description: 'Add the NVIDIA NGC Helm repository to access Dynamo charts.',
      },
      {
        title: 'Update Helm Repositories',
        command: 'helm repo update',
        description: 'Update local Helm repository cache.',
      },
      {
        title: 'Create Namespace',
        command: 'kubectl create namespace dynamo-system',
        description: 'Create the namespace for Dynamo components.',
      },
      {
        title: 'Install Dynamo Operator',
        command: 'helm install dynamo-operator nvidia/dynamo-operator -n dynamo-system',
        description: 'Install the Dynamo operator which manages inference deployments.',
      },
    ];
  }

  getHelmRepos(): HelmRepo[] {
    return [
      {
        name: 'nvidia',
        url: 'https://helm.ngc.nvidia.com/nvidia',
      },
    ];
  }

  getHelmCharts(): HelmChart[] {
    return [
      {
        name: 'dynamo-operator',
        chart: 'nvidia/dynamo-operator',
        namespace: 'dynamo-system',
        createNamespace: true,
      },
    ];
  }

  async checkInstallation(k8sApi: {
    customObjectsApi: unknown;
    coreV1Api: unknown;
  }): Promise<InstallationStatus> {
    const customObjectsApi = k8sApi.customObjectsApi as k8s.CustomObjectsApi;
    const coreV1Api = k8sApi.coreV1Api as k8s.CoreV1Api;

    try {
      // Check if CRD exists by trying to list resources
      let crdFound = false;
      try {
        await customObjectsApi.listNamespacedCustomObject(
          DynamoProvider.API_GROUP,
          DynamoProvider.API_VERSION,
          this.defaultNamespace,
          DynamoProvider.CRD_PLURAL
        );
        crdFound = true;
      } catch (error: unknown) {
        const k8sError = error as { response?: { statusCode?: number } };
        // 404 means CRD doesn't exist, other errors might be permissions
        if (k8sError?.response?.statusCode === 404) {
          crdFound = false;
        }
      }

      // Check if operator is running
      let operatorRunning = false;
      try {
        const pods = await coreV1Api.listNamespacedPod(
          this.defaultNamespace,
          undefined,
          undefined,
          undefined,
          undefined,
          'app.kubernetes.io/name=dynamo-operator'
        );
        operatorRunning = pods.body.items.some(
          pod => pod.status?.phase === 'Running'
        );
      } catch {
        // Namespace might not exist
        operatorRunning = false;
      }

      const installed = crdFound && operatorRunning;

      return {
        installed,
        crdFound,
        operatorRunning,
        message: installed
          ? 'Dynamo is installed and running'
          : !crdFound
          ? 'Dynamo CRD not found. Please install the Dynamo operator.'
          : 'Dynamo operator is not running',
      };
    } catch (error) {
      return {
        installed: false,
        message: `Error checking installation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// Export singleton instance
export const dynamoProvider = new DynamoProvider();
