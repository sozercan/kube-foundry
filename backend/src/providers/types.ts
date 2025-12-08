import { z } from 'zod';
import type { DeploymentConfig, DeploymentStatus } from '@kubefoundry/shared';

/**
 * CRD configuration for a provider's custom resources
 */
export interface CRDConfig {
  apiGroup: string;
  apiVersion: string;
  plural: string;
  kind: string;
}

/**
 * Helm repository configuration
 */
export interface HelmRepo {
  name: string;
  url: string;
}

/**
 * Helm chart configuration for installation
 */
export interface HelmChart {
  name: string;
  chart: string;
  version?: string;
  namespace: string;
  values?: Record<string, unknown>;
  createNamespace?: boolean;
}

/**
 * Installation status for a provider
 */
export interface InstallationStatus {
  installed: boolean;
  version?: string;
  message?: string;
  crdFound?: boolean;
  operatorRunning?: boolean;
}

/**
 * Installation step for documentation/display
 */
export interface InstallationStep {
  title: string;
  command?: string;
  description: string;
}

/**
 * Provider interface - all inference providers must implement this
 */
export interface Provider {
  /** Unique identifier for the provider (e.g., 'dynamo', 'kuberay') */
  id: string;
  
  /** Display name (e.g., 'NVIDIA Dynamo', 'KubeRay') */
  name: string;
  
  /** Description of the provider */
  description: string;
  
  /** Default Kubernetes namespace for deployments */
  defaultNamespace: string;

  /**
   * Get CRD configuration for this provider
   */
  getCRDConfig(): CRDConfig;

  /**
   * Generate Kubernetes manifest from deployment config
   */
  generateManifest(config: DeploymentConfig): Record<string, unknown>;

  /**
   * Parse raw Kubernetes object into DeploymentStatus
   */
  parseStatus(raw: unknown): DeploymentStatus;

  /**
   * Validate deployment configuration
   * Returns validation result with any errors
   */
  validateConfig(config: unknown): { valid: boolean; errors: string[]; data?: DeploymentConfig };

  /**
   * Get Zod schema for provider-specific configuration validation
   */
  getConfigSchema(): z.ZodSchema;

  /**
   * Get installation steps for documentation
   */
  getInstallationSteps(): InstallationStep[];

  /**
   * Get required Helm repositories
   */
  getHelmRepos(): HelmRepo[];

  /**
   * Get Helm charts needed for installation
   */
  getHelmCharts(): HelmChart[];

  /**
   * Check if provider is installed in the cluster
   */
  checkInstallation(k8sApi: {
    customObjectsApi: unknown;
    coreV1Api: unknown;
  }): Promise<InstallationStatus>;
}

/**
 * Provider metadata for listing without full implementation
 */
export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  defaultNamespace: string;
}

/**
 * Base Zod schema for deployment config (shared across providers)
 */
export const baseDeploymentConfigSchema = z.object({
  name: z.string().min(1).max(63).regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, {
    message: 'Name must be a valid Kubernetes resource name (lowercase alphanumeric and hyphens)',
  }),
  namespace: z.string().min(1),
  modelId: z.string().min(1),
  engine: z.enum(['vllm', 'sglang', 'trtllm']),
  mode: z.enum(['aggregated', 'disaggregated']).default('aggregated'),
  servedModelName: z.string().optional(),
  routerMode: z.enum(['none', 'kv', 'round-robin']).default('none'),
  replicas: z.number().int().min(1).max(10).default(1),
  hfTokenSecret: z.string().min(1),
  contextLength: z.number().int().positive().optional(),
  enforceEager: z.boolean().default(true),
  enablePrefixCaching: z.boolean().default(false),
  trustRemoteCode: z.boolean().default(false),
  resources: z.object({
    gpu: z.number().int().min(1).default(1),
    memory: z.string().optional(),
  }).optional(),
  engineArgs: z.record(z.unknown()).optional(),
});
