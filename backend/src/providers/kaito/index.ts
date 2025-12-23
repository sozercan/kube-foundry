import * as k8s from '@kubernetes/client-node';
import type { DeploymentConfig, DeploymentStatus, DeploymentPhase, MetricDefinition, MetricsEndpointConfig } from '@kubefoundry/shared';
import type { Provider, CRDConfig, HelmRepo, HelmChart, InstallationStatus, InstallationStep, UninstallResources } from '../types';
import { kaitoDeploymentConfigSchema, type KaitoDeploymentConfig } from './schema';
import { aikitService, GGUF_RUNNER_IMAGE } from '../../services/aikit';
import logger from '../../lib/logger';

// Default fallback version if GitHub fetch fails
const DEFAULT_KAITO_VERSION = '0.8.0';

// GitHub API URL for KAITO releases
const KAITO_GITHUB_RELEASES_URL = 'https://api.github.com/repos/kaito-project/kaito/releases/latest';

// Cache for the latest version
let cachedKaitoVersion: string | null = null;
let kaitoCacheTimestamp: number = 0;
const CACHE_TTL_MS = 3600000; // 1 hour

/**
 * Fetch the latest KAITO version from GitHub releases
 */
async function fetchLatestKaitoVersion(): Promise<string> {
  // Check cache first
  if (cachedKaitoVersion && (Date.now() - kaitoCacheTimestamp) < CACHE_TTL_MS) {
    return cachedKaitoVersion;
  }

  try {
    const response = await fetch(KAITO_GITHUB_RELEASES_URL, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'KubeFoundry',
      },
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Failed to fetch KAITO version from GitHub');
      return cachedKaitoVersion || process.env.KAITO_VERSION || DEFAULT_KAITO_VERSION;
    }

    const data = await response.json() as { tag_name?: string };
    const tagName = data.tag_name;

    if (tagName) {
      // Remove 'v' prefix if present (e.g., 'v0.6.0' -> '0.6.0')
      cachedKaitoVersion = tagName.startsWith('v') ? tagName.slice(1) : tagName;
      kaitoCacheTimestamp = Date.now();
      logger.info({ version: cachedKaitoVersion }, 'Fetched latest KAITO version from GitHub');
      return cachedKaitoVersion;
    }

    return cachedKaitoVersion || process.env.KAITO_VERSION || DEFAULT_KAITO_VERSION;
  } catch (error) {
    logger.warn({ error }, 'Error fetching KAITO version from GitHub, using fallback');
    return cachedKaitoVersion || process.env.KAITO_VERSION || DEFAULT_KAITO_VERSION;
  }
}

/**
 * Get the current KAITO version (sync - uses cached value or fallback)
 */
function getKaitoVersion(): string {
  return cachedKaitoVersion || process.env.KAITO_VERSION || DEFAULT_KAITO_VERSION;
}

/**
 * KAITO Provider
 * Implements the Provider interface for KAITO (Kubernetes AI Toolchain Operator)
 * 
 * KAITO's key differentiator is CPU-capable inference using GGUF quantized models
 * built with AIKit. This enables running LLMs without GPU nodes.
 */
export class KaitoProvider implements Provider {
  id = 'kaito';
  name = 'KAITO';
  description = 'KAITO (Kubernetes AI Toolchain Operator) enables CPU and GPU inference using GGUF quantized models. Deploy models without GPU nodes using AIKit.';
  defaultNamespace = 'kaito-workspace';

  // CRD Constants
  private static readonly API_GROUP = 'kaito.sh';
  private static readonly API_VERSION = 'v1beta1';
  private static readonly CRD_PLURAL = 'workspaces';
  private static readonly CRD_KIND = 'Workspace';

  /**
   * Refresh the cached KAITO version from GitHub releases
   * Call this before installation to ensure we have the latest version
   */
  async refreshVersion(): Promise<string> {
    return fetchLatestKaitoVersion();
  }

  getCRDConfig(): CRDConfig {
    return {
      apiGroup: KaitoProvider.API_GROUP,
      apiVersion: KaitoProvider.API_VERSION,
      plural: KaitoProvider.CRD_PLURAL,
      kind: KaitoProvider.CRD_KIND,
    };
  }

  generateManifest(config: DeploymentConfig): Record<string, unknown> {
    const kaitoConfig = config as KaitoDeploymentConfig;

    logger.debug(
      { name: config.name, modelSource: kaitoConfig.modelSource, computeType: kaitoConfig.computeType, ggufRunMode: kaitoConfig.ggufRunMode },
      'Generating KAITO Workspace manifest'
    );

    // Determine image and args based on run mode
    let containerImage: string;
    let containerArgs: string[];

    if (kaitoConfig.modelSource === 'huggingface' && kaitoConfig.ggufRunMode === 'direct') {
      // Direct run mode - use runner image with huggingface:// URI
      // Format: huggingface://org/repo/filename.gguf
      containerImage = GGUF_RUNNER_IMAGE;
      const modelUri = `huggingface://${kaitoConfig.modelId}/${kaitoConfig.ggufFile}`;
      containerArgs = [modelUri, '--address=:5000'];
      logger.debug({ image: containerImage, args: containerArgs, modelUri }, 'Using direct run mode with runner image');
    } else {
      // Build mode or premade - use the resolved image reference
      const imageRef = this.getImageRef(kaitoConfig);
      if (!imageRef) {
        throw new Error('Unable to determine image reference for KAITO deployment');
      }
      containerImage = imageRef;
      containerArgs = ['run', '--address=:5000'];
    }

    // Build resource requirements
    const resources: Record<string, Record<string, string | number>> = {};

    if (kaitoConfig.resources?.memory) {
      resources.requests = resources.requests || {};
      resources.requests.memory = kaitoConfig.resources.memory;
    }

    if (kaitoConfig.resources?.cpu) {
      resources.requests = resources.requests || {};
      resources.requests.cpu = kaitoConfig.resources.cpu;
    }

    if (kaitoConfig.computeType === 'gpu' && kaitoConfig.resources?.gpu) {
      resources.limits = resources.limits || {};
      resources.limits['nvidia.com/gpu'] = kaitoConfig.resources.gpu;
    }

    // Build the workspace manifest
    // Note: KAITO Workspace API has resource/inference/tuning at top level, NOT inside a spec field
    const manifest: Record<string, unknown> = {
      apiVersion: `${KaitoProvider.API_GROUP}/${KaitoProvider.API_VERSION}`,
      kind: KaitoProvider.CRD_KIND,
      metadata: {
        name: kaitoConfig.name,
        namespace: kaitoConfig.namespace,
        labels: {
          'app.kubernetes.io/name': 'kubefoundry',
          'app.kubernetes.io/instance': kaitoConfig.name,
          'app.kubernetes.io/managed-by': 'kubefoundry',
          'kubefoundry.io/compute-type': kaitoConfig.computeType,
          'kubefoundry.io/model-source': kaitoConfig.modelSource,
          ...(kaitoConfig.modelSource === 'huggingface' && {
            'kubefoundry.io/run-mode': kaitoConfig.ggufRunMode || 'direct',
          }),
        },
      },
      resource: this.buildResourceSpec(kaitoConfig),
      inference: {
        template: {
          spec: {
            containers: [
              {
                name: 'model',
                image: containerImage,
                args: containerArgs,
                ports: [
                  {
                    containerPort: 5000,
                    protocol: 'TCP',
                  },
                ],
                ...(Object.keys(resources).length > 0 && { resources }),
              },
            ],
          },
        },
      },
    };

    return manifest;
  }

  /**
   * Build the resource spec for node targeting and scaling
   * Uses preferredNodes approach to use existing nodes instead of auto-provisioning
   */
  private buildResourceSpec(config: KaitoDeploymentConfig): Record<string, unknown> {
    const resourceSpec: Record<string, unknown> = {
      count: config.replicas || 1,
    };

    // labelSelector is required by KAITO API
    if (config.labelSelector && Object.keys(config.labelSelector).length > 0) {
      resourceSpec.labelSelector = {
        matchLabels: config.labelSelector,
      };
    } else {
      // Use a common label that exists on all Linux nodes to allow scheduling anywhere
      // This avoids node affinity issues that occur with empty matchLabels
      resourceSpec.labelSelector = {
        matchLabels: {
          'kubernetes.io/os': 'linux',
        },
      };
    }

    // Use preferredNodes to specify existing nodes instead of auto-provisioning
    if (config.preferredNodes && config.preferredNodes.length > 0) {
      resourceSpec.preferredNodes = config.preferredNodes;
    }

    return resourceSpec;
  }

  /**
   * Get the image reference for a KAITO deployment
   */
  private getImageRef(config: KaitoDeploymentConfig): string | null {
    // If imageRef is already set (from build service), use it
    if (config.imageRef) {
      return config.imageRef;
    }

    // For premade models, get from AIKit service
    if (config.modelSource === 'premade' && config.premadeModel) {
      const model = aikitService.getPremadeModel(config.premadeModel);
      return model?.image || null;
    }

    // For HuggingFace models, the imageRef should have been set by the build service
    // This is a fallback that shouldn't normally be reached
    if (config.modelSource === 'huggingface') {
      return aikitService.getImageRef({
        modelSource: 'huggingface',
        modelId: config.modelId,
        ggufFile: config.ggufFile,
      });
    }

    return null;
  }

  parseStatus(raw: unknown): DeploymentStatus {
    // Note: KAITO Workspace API has resource/inference/tuning at top level, NOT inside a spec field
    const obj = raw as {
      metadata?: {
        name?: string;
        namespace?: string;
        creationTimestamp?: string;
        labels?: Record<string, string>;
      };
      resource?: {
        count?: number;
      };
      inference?: {
        template?: {
          spec?: {
            containers?: Array<{
              image?: string;
              args?: string[];
            }>;
          };
        };
      };
      status?: {
        phase?: string;
        workerNodes?: string[];
        conditions?: Array<{
          type?: string;
          status?: string;
          reason?: string;
          message?: string;
          lastTransitionTime?: string;
        }>;
      };
    };

    const metadata = obj.metadata || {};
    const resource = obj.resource || {};
    const inference = obj.inference || {};
    const status = obj.status || {};
    const labels = metadata.labels || {};

    // Determine model info from labels or inference spec
    const modelSource = labels['kubefoundry.io/model-source'] || 'unknown';
    const computeType = labels['kubefoundry.io/compute-type'] || 'cpu';
    const runMode = labels['kubefoundry.io/run-mode'] || '';
    const container = inference.template?.spec?.containers?.[0];
    const imageRef = container?.image || '';
    const containerArgs = container?.args || [];

    // Extract model ID from image reference, args, or labels
    let modelId = imageRef;
    
    if (runMode === 'direct' || imageRef === GGUF_RUNNER_IMAGE) {
      // For direct mode, extract model name from huggingface:// URI in container args
      // Format: huggingface://org/repo/filename.gguf
      const hfArg = containerArgs.find(arg => arg.startsWith('huggingface://'));
      if (hfArg) {
        // Extract the filename from the URI (e.g., "gemma-3-1b-it-Q8_0.gguf")
        const parts = hfArg.replace('huggingface://', '').split('/');
        modelId = parts[parts.length - 1];
      }
    } else if (modelSource === 'premade') {
      // Try to find the premade model name from the image
      const premadeModel = aikitService.getPremadeModels().find(m => m.image === imageRef);
      if (premadeModel) {
        modelId = premadeModel.modelName;
      }
    }

    // Map KAITO phase to our DeploymentPhase
    // KAITO may not set phase directly, so also check conditions
    let phase = this.mapPhase(status.phase);
    
    // If phase is Pending but WorkspaceSucceeded condition is True, it's actually Running
    const workspaceSucceeded = (status.conditions || []).find(c => c.type === 'WorkspaceSucceeded');
    const inferenceReady = (status.conditions || []).find(c => c.type === 'InferenceReady');
    if (phase === 'Pending' && workspaceSucceeded?.status === 'True' && inferenceReady?.status === 'True') {
      phase = 'Running';
    }

    // Calculate replica status
    const desiredReplicas = resource.count || 1;
    const workerNodes = status.workerNodes || [];
    // readyReplicas should be min of workerNodes and desired, or 0 if not running
    const readyReplicas = phase === 'Running' ? Math.min(workerNodes.length || desiredReplicas, desiredReplicas) : 0;

    return {
      name: metadata.name || 'unknown',
      namespace: metadata.namespace || 'default',
      modelId,
      servedModelName: metadata.name || 'unknown',
      engine: 'llamacpp', // KAITO uses llama.cpp via AIKit
      mode: 'aggregated',
      phase,
      provider: this.id,
      replicas: {
        desired: desiredReplicas,
        ready: readyReplicas,
        available: readyReplicas,
      },
      conditions: (status.conditions || []).map((c) => ({
        type: c.type || '',
        status: (c.status as 'True' | 'False' | 'Unknown') || 'Unknown',
        reason: c.reason,
        message: c.message,
        lastTransitionTime: c.lastTransitionTime,
      })),
      pods: [], // Pods are managed by KAITO
      createdAt: metadata.creationTimestamp || new Date().toISOString(),
      frontendService: `${metadata.name}`, // KAITO creates a service with the workspace name
    };
  }

  /**
   * Map KAITO workspace phase to our DeploymentPhase
   */
  private mapPhase(phase?: string): DeploymentPhase {
    if (!phase) return 'Pending';

    switch (phase.toLowerCase()) {
      case 'running':
      case 'ready':
        return 'Running';
      case 'pending':
      case 'waiting':
      case 'creating':
        return 'Pending';
      case 'deploying':
      case 'provisioning':
        return 'Deploying';
      case 'failed':
      case 'error':
        return 'Failed';
      case 'terminating':
      case 'deleting':
        return 'Terminating';
      default:
        return 'Pending';
    }
  }

  validateConfig(config: unknown): { valid: boolean; errors: string[]; data?: DeploymentConfig } {
    const result = kaitoDeploymentConfigSchema.safeParse(config);

    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      logger.warn({ errors }, 'KAITO config validation failed');
      return {
        valid: false,
        errors,
      };
    }

    // Additional validation for premade models
    if (result.data.modelSource === 'premade') {
      const model = aikitService.getPremadeModel(result.data.premadeModel!);
      if (!model) {
        return {
          valid: false,
          errors: [`Unknown premade model: ${result.data.premadeModel}`],
        };
      }
    }

    logger.debug({ name: result.data.name }, 'KAITO config validated successfully');
    return {
      valid: true,
      errors: [],
      data: result.data as unknown as DeploymentConfig,
    };
  }

  getConfigSchema() {
    return kaitoDeploymentConfigSchema;
  }

  getInstallationSteps(): InstallationStep[] {
    const version = getKaitoVersion();
    return [
      {
        title: 'Add KAITO Helm Repository',
        command: 'helm repo add kaito https://kaito-project.github.io/kaito/charts/kaito',
        description: 'Add the KAITO Helm repository.',
      },
      {
        title: 'Update Helm Repositories',
        command: 'helm repo update',
        description: 'Update local Helm repository cache.',
      },
      {
        title: 'Install KAITO Workspace Operator',
        command: `helm upgrade --install kaito-workspace kaito/workspace --version ${version} -n kaito-workspace --create-namespace --wait`,
        description: `Install the KAITO workspace operator v${version} which manages AI workloads.`,
      },
    ];
  }

  getHelmRepos(): HelmRepo[] {
    return [
      {
        name: 'kaito',
        url: 'https://kaito-project.github.io/kaito/charts/kaito',
      },
    ];
  }

  getHelmCharts(): HelmChart[] {
    const version = getKaitoVersion();
    return [
      {
        name: 'kaito-workspace',
        chart: 'kaito/workspace',
        version,
        namespace: 'kaito-workspace',
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

    logger.debug('Checking KAITO installation status');

    try {
      // Check if CRD exists by trying to list resources
      let crdFound = false;
      try {
        await customObjectsApi.listNamespacedCustomObject(
          KaitoProvider.API_GROUP,
          KaitoProvider.API_VERSION,
          this.defaultNamespace,
          KaitoProvider.CRD_PLURAL
        );
        crdFound = true;
        logger.debug('KAITO CRD found');
      } catch (error: unknown) {
        const k8sError = error as { response?: { statusCode?: number } };
        // 404 means CRD doesn't exist, other errors might be permissions
        if (k8sError?.response?.statusCode === 404) {
          crdFound = false;
          logger.debug('KAITO CRD not found');
        }
      }

      // Check if operator is running in kaito-workspace namespace (operator namespace)
      // Note: this.defaultNamespace is for deployments, operator runs in 'kaito-workspace'
      const operatorNamespace = 'kaito-workspace';
      let operatorRunning = false;
      try {
        const pods = await coreV1Api.listNamespacedPod(
          operatorNamespace,
          undefined,
          undefined,
          undefined,
          undefined,
          'app.kubernetes.io/name=kaito-workspace'
        );
        operatorRunning = pods.body.items.some(
          pod => pod.status?.phase === 'Running'
        );

        // Also check alternative label patterns
        if (!operatorRunning) {
          const allPods = await coreV1Api.listNamespacedPod(operatorNamespace);
          operatorRunning = allPods.body.items.some(
            pod => pod.status?.phase === 'Running' &&
            (pod.metadata?.name?.includes('kaito') || pod.metadata?.name?.includes('workspace'))
          );
        }
      } catch {
        // Namespace might not exist
        operatorRunning = false;
      }

      const installed = crdFound && operatorRunning;
      logger.info({ installed, crdFound, operatorRunning }, 'KAITO installation check complete');

      return {
        installed,
        crdFound,
        operatorRunning,
        message: installed
          ? 'KAITO is installed and running'
          : !crdFound
          ? 'KAITO CRD not found. Please install the KAITO operator.'
          : 'KAITO operator is not running',
      };
    } catch (error) {
      logger.error({ error }, 'Error checking KAITO installation');
      return {
        installed: false,
        message: `Error checking installation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  getMetricsConfig(): MetricsEndpointConfig | null {
    // KAITO/AIKit uses llama.cpp which exposes metrics on the same port
    return {
      endpointPath: '/metrics',
      port: 5000,
      serviceNamePattern: '{name}',
    };
  }

  getKeyMetrics(): MetricDefinition[] {
    // llama.cpp/AIKit metrics
    return [
      {
        name: 'llamacpp_requests_processing',
        displayName: 'Processing Requests',
        description: 'Number of requests currently being processed',
        unit: 'requests',
        type: 'gauge',
        category: 'queue',
      },
      {
        name: 'llamacpp_requests_pending',
        displayName: 'Pending Requests',
        description: 'Number of requests waiting in queue',
        unit: 'requests',
        type: 'gauge',
        category: 'queue',
      },
      {
        name: 'llamacpp_kv_cache_usage_ratio',
        displayName: 'KV Cache Usage',
        description: 'KV cache usage ratio',
        unit: '%',
        type: 'gauge',
        category: 'cache',
      },
      {
        name: 'llamacpp_tokens_predicted_total',
        displayName: 'Tokens Generated',
        description: 'Total tokens generated',
        unit: 'tokens/s',
        type: 'counter',
        category: 'throughput',
      },
      {
        name: 'llamacpp_prompt_tokens_processed_total',
        displayName: 'Prompt Tokens',
        description: 'Total prompt tokens processed',
        unit: 'tokens/s',
        type: 'counter',
        category: 'throughput',
      },
    ];
  }

  getUninstallResources(): UninstallResources {
    return {
      // KAITO CRDs: workspaces.kaito.sh, ragengines.kaito.sh
      crds: [
        `${KaitoProvider.CRD_PLURAL}.${KaitoProvider.API_GROUP}`,
        `ragengines.${KaitoProvider.API_GROUP}`,
      ],
      // KAITO operator namespace
      namespaces: ['kaito-workspace'],
    };
  }
}

// Export singleton instance
export const kaitoProvider = new KaitoProvider();
