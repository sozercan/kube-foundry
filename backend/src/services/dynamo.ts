interface DeploymentConfig {
  name: string;
  namespace: string;
  modelId: string;
  engine: 'vllm' | 'sglang' | 'trtllm';
  mode: 'aggregated' | 'disaggregated';
  servedModelName?: string;
  routerMode: 'none' | 'kv' | 'round-robin';
  replicas: number;
  hfTokenSecret: string;
  contextLength?: number;
  enforceEager: boolean;
  enablePrefixCaching: boolean;
  trustRemoteCode: boolean;
  resources?: {
    gpu: number;
    memory?: string;
  };
  engineArgs?: Record<string, unknown>;
}

interface DynamoManifest {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
  };
  spec: Record<string, unknown>;
}

export function generateDynamoManifest(config: DeploymentConfig): DynamoManifest {
  const workerSpec = generateWorkerSpec(config);
  const frontendSpec = generateFrontendSpec(config);

  const manifest: DynamoManifest = {
    apiVersion: 'dynamo.nvidia.com/v1alpha1',
    kind: 'DynamoGraphDeployment',
    metadata: {
      name: config.name,
      namespace: config.namespace,
      labels: {
        'app.kubernetes.io/name': 'dynamote',
        'app.kubernetes.io/instance': config.name,
        'app.kubernetes.io/managed-by': 'dynamote',
      },
    },
    spec: {
      Frontend: frontendSpec,
      ...workerSpec,
    },
  };

  return manifest;
}

function generateFrontendSpec(config: DeploymentConfig): Record<string, unknown> {
  const spec: Record<string, unknown> = {
    replicas: 1,
    'http-port': 8000,
  };

  if (config.routerMode !== 'none') {
    spec['router-mode'] = config.routerMode;
  }

  return spec;
}

function generateWorkerSpec(config: DeploymentConfig): Record<string, unknown> {
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

// Validate manifest against expected schema structure
export function validateManifest(manifest: DynamoManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!manifest.apiVersion || manifest.apiVersion !== 'dynamo.nvidia.com/v1alpha1') {
    errors.push('Invalid or missing apiVersion');
  }

  if (!manifest.kind || manifest.kind !== 'DynamoGraphDeployment') {
    errors.push('Invalid or missing kind');
  }

  if (!manifest.metadata?.name) {
    errors.push('Missing metadata.name');
  }

  if (!manifest.metadata?.namespace) {
    errors.push('Missing metadata.namespace');
  }

  if (!manifest.spec) {
    errors.push('Missing spec');
  }

  if (!manifest.spec?.Frontend) {
    errors.push('Missing Frontend spec');
  }

  const hasWorker = manifest.spec?.VllmWorker || manifest.spec?.SglangWorker || manifest.spec?.TrtllmWorker;
  if (!hasWorker) {
    errors.push('Missing worker spec (VllmWorker, SglangWorker, or TrtllmWorker)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
