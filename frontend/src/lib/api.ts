const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

console.log('[API] API_BASE:', API_BASE)

export interface Model {
  id: string
  name: string
  description: string
  size: string
  task: 'text-generation' | 'chat' | 'fill-mask'
  parameters?: number
  contextLength?: number
  license?: string
  supportedEngines: Array<'vllm' | 'sglang' | 'trtllm'>
  minGpuMemory?: string
  minGpus?: number
}

export interface DeploymentConfig {
  name: string
  namespace: string
  modelId: string
  engine: 'vllm' | 'sglang' | 'trtllm'
  mode: 'aggregated' | 'disaggregated'
  servedModelName?: string
  routerMode: 'none' | 'kv' | 'round-robin'
  replicas: number
  hfTokenSecret: string
  contextLength?: number
  enforceEager: boolean
  enablePrefixCaching: boolean
  trustRemoteCode: boolean
  resources?: {
    gpu: number
    memory?: string
  }
  engineArgs?: Record<string, unknown>

  // Disaggregated mode configuration (P/D separation)
  prefillReplicas?: number
  decodeReplicas?: number
  prefillGpus?: number
  decodeGpus?: number
}

export interface PodStatus {
  name: string
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'
  ready: boolean
  restarts: number
  node?: string
}

export interface DeploymentStatus {
  name: string
  namespace: string
  modelId: string
  engine: 'vllm' | 'sglang' | 'trtllm'
  mode: 'aggregated' | 'disaggregated'
  phase: 'Pending' | 'Deploying' | 'Running' | 'Failed' | 'Terminating'
  replicas: {
    desired: number
    ready: number
    available: number
  }
  pods: PodStatus[]
  createdAt: string
  frontendService?: string

  // Disaggregated mode status (P/D separation)
  prefillReplicas?: {
    desired: number
    ready: number
  }
  decodeReplicas?: {
    desired: number
    ready: number
  }
}

export interface ClusterStatus {
  connected: boolean;
  namespace: string;
  clusterName?: string;
  error?: string;
  provider?: {
    id: string;
    name: string;
  } | null;
  providerInstallation?: {
    installed: boolean;
    version?: string;
    message?: string;
    crdFound?: boolean;
    operatorRunning?: boolean;
  } | null;
}

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  defaultNamespace: string;
}

export interface ProviderDetails extends ProviderInfo {
  crdConfig: {
    apiGroup: string;
    apiVersion: string;
    plural: string;
    kind: string;
  };
  installationSteps: Array<{
    title: string;
    command?: string;
    description: string;
  }>;
  helmRepos: Array<{
    name: string;
    url: string;
  }>;
  helmCharts: Array<{
    name: string;
    chart: string;
    version?: string;
    namespace: string;
    createNamespace?: boolean;
  }>;
}

export interface Settings {
  config: {
    activeProviderId: string;
    defaultNamespace?: string;
  };
  providers: ProviderInfo[];
  activeProvider: ProviderInfo | null;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface DeploymentsListResponse {
  deployments: DeploymentStatus[];
  pagination: Pagination;
}

class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  console.log('[API] Fetching:', url)

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })

  console.log('[API] Response status:', response.status, 'for', url)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    console.error('[API] Error response:', error)
    throw new ApiError(response.status, error.error?.message || error.message || 'Request failed')
  }

  return response.json()
}

// Models API
export const modelsApi = {
  list: () => request<{ models: Model[] }>('/models'),
  get: (id: string) => request<Model>(`/models/${encodeURIComponent(id)}`),
}

// Deployments API
export const deploymentsApi = {
  list: (namespace?: string, options?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (namespace) params.set('namespace', namespace);
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());
    const query = params.toString();
    return request<DeploymentsListResponse>(`/deployments${query ? `?${query}` : ''}`);
  },

  get: (name: string, namespace?: string) =>
    request<DeploymentStatus>(
      `/deployments/${encodeURIComponent(name)}${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`
    ),

  create: (config: DeploymentConfig) =>
    request<{ message: string; name: string; namespace: string }>('/deployments', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  delete: (name: string, namespace?: string) =>
    request<{ message: string }>(
      `/deployments/${encodeURIComponent(name)}${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`,
      { method: 'DELETE' }
    ),

  getPods: (name: string, namespace?: string) =>
    request<{ pods: PodStatus[] }>(
      `/deployments/${encodeURIComponent(name)}/pods${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`
    ),
}

// Health API
export const healthApi = {
  check: () => request<{ status: string; timestamp: string }>('/health'),
  clusterStatus: () => request<ClusterStatus>('/cluster/status'),
}

// Settings API
export const settingsApi = {
  get: () => request<Settings>('/settings'),
  update: (settings: { activeProviderId?: string; defaultNamespace?: string }) =>
    request<{ message: string; config: Settings['config'] }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  listProviders: () => request<{ providers: ProviderInfo[] }>('/settings/providers'),
  getProvider: (id: string) => request<ProviderDetails>(`/settings/providers/${encodeURIComponent(id)}`),
}

// Installation API
export interface HelmStatus {
  available: boolean;
  version?: string;
  error?: string;
}

export interface InstallationStatus {
  providerId: string;
  providerName: string;
  installed: boolean;
  version?: string;
  message?: string;
  crdFound?: boolean;
  operatorRunning?: boolean;
  installationSteps: Array<{
    title: string;
    command?: string;
    description: string;
  }>;
  helmCommands: string[];
}

export interface InstallResult {
  success: boolean;
  message: string;
  alreadyInstalled?: boolean;
  installationStatus?: {
    installed: boolean;
    message?: string;
  };
  results?: Array<{
    step: string;
    success: boolean;
    output: string;
    error?: string;
  }>;
}

export const installationApi = {
  getHelmStatus: () => request<HelmStatus>('/installation/helm/status'),
  
  getProviderStatus: (providerId: string) =>
    request<InstallationStatus>(`/installation/providers/${encodeURIComponent(providerId)}/status`),
  
  getProviderCommands: (providerId: string) =>
    request<{ providerId: string; providerName: string; commands: string[]; steps: Array<{ title: string; command?: string; description: string }> }>(
      `/installation/providers/${encodeURIComponent(providerId)}/commands`
    ),
  
  installProvider: (providerId: string) =>
    request<InstallResult>(`/installation/providers/${encodeURIComponent(providerId)}/install`, {
      method: 'POST',
    }),
  
  upgradeProvider: (providerId: string) =>
    request<InstallResult>(`/installation/providers/${encodeURIComponent(providerId)}/upgrade`, {
      method: 'POST',
    }),
  
  uninstallProvider: (providerId: string) =>
    request<InstallResult>(`/installation/providers/${encodeURIComponent(providerId)}/uninstall`, {
      method: 'POST',
    }),
}

// GPU Operator API
export interface GPUOperatorStatus {
  installed: boolean;
  crdFound: boolean;
  operatorRunning: boolean;
  gpusAvailable: boolean;
  totalGPUs: number;
  gpuNodes: string[];
  message: string;
  helmCommands: string[];
}

export interface GPUOperatorInstallResult {
  success: boolean;
  message: string;
  alreadyInstalled?: boolean;
  status?: GPUOperatorStatus;
  results?: Array<{
    step: string;
    success: boolean;
    output: string;
    error?: string;
  }>;
}

export interface NodeGpuInfo {
  nodeName: string;
  totalGpus: number;
  allocatedGpus: number;
  availableGpus: number;
}

export interface ClusterGpuCapacity {
  totalGpus: number;
  allocatedGpus: number;
  availableGpus: number;
  maxContiguousAvailable: number;
  nodes: NodeGpuInfo[];
}

export const gpuOperatorApi = {
  getStatus: () => request<GPUOperatorStatus>('/installation/gpu-operator/status'),
  
  install: () =>
    request<GPUOperatorInstallResult>('/installation/gpu-operator/install', {
      method: 'POST',
    }),

  getCapacity: () => request<ClusterGpuCapacity>('/installation/gpu-capacity'),
}
