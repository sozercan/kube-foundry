import { Engine } from './model';

export type DeploymentMode = 'aggregated' | 'disaggregated';
export type RouterMode = 'none' | 'kv' | 'round-robin';
export type DeploymentPhase = 'Pending' | 'Deploying' | 'Running' | 'Failed' | 'Terminating';
export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';

export interface DeploymentConfig {
  name: string;                  // Kubernetes resource name
  namespace: string;             // Target namespace
  modelId: string;               // HuggingFace model ID
  engine: Engine;                // Inference engine
  mode: DeploymentMode;
  servedModelName?: string;      // Custom model name for API
  routerMode: RouterMode;
  replicas: number;              // Number of worker replicas
  hfTokenSecret: string;         // K8s secret name for HF_TOKEN
  contextLength?: number;        // Optional context length override
  enforceEager: boolean;         // Enforce eager mode for quick deployment
  enablePrefixCaching: boolean;  // Enable prefix caching
  trustRemoteCode: boolean;      // Trust remote code from HuggingFace
  resources?: {
    gpu: number;                 // Number of GPUs per replica
    memory?: string;             // Memory limit
  };
  engineArgs?: Record<string, unknown>;  // Engine-specific arguments
}

export interface PodStatus {
  name: string;
  phase: PodPhase;
  ready: boolean;
  restarts: number;
  node?: string;
}

export interface Condition {
  type: string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

export interface DeploymentStatus {
  name: string;
  namespace: string;
  modelId: string;
  engine: Engine;
  mode: DeploymentMode;
  phase: DeploymentPhase;
  replicas: {
    desired: number;
    ready: number;
    available: number;
  };
  conditions: Condition[];
  pods: PodStatus[];
  createdAt: string;
  frontendService?: string;      // Service name for port-forwarding
}

export interface CreateDeploymentRequest {
  config: DeploymentConfig;
}

export interface DeploymentListResponse {
  deployments: DeploymentStatus[];
}

export interface ClusterStatus {
  connected: boolean;
  namespace: string;
  clusterName?: string;
  error?: string;
}
