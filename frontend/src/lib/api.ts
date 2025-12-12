// API Base URL - when not specified, use relative URL (same origin)
// This allows the frontend to work both in development (with VITE_API_URL=http://localhost:3001)
// and in production (served from the same container as the backend)
const API_BASE = import.meta.env.VITE_API_URL || '';

console.log('[API] API_BASE:', API_BASE || '(same origin)');

// Auth token storage key
const AUTH_TOKEN_KEY = 'kubefoundry_auth_token';

/**
 * Get the stored auth token
 */
function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Dispatch unauthorized event to trigger logout
 */
function dispatchUnauthorized(): void {
  window.dispatchEvent(new CustomEvent('auth:unauthorized'));
}

// ============================================================================
// Re-export types from @kubefoundry/shared
// ============================================================================

// Core types
export type {
  Engine,
  ModelTask,
  Model,
  DeploymentMode,
  RouterMode,
  DeploymentPhase,
  PodPhase,
  DeploymentConfig,
  PodStatus,
  DeploymentStatus,
  ClusterStatus,
} from '@kubefoundry/shared';

// Settings types
export type {
  ProviderInfo,
  ProviderDetails,
  Settings,
} from '@kubefoundry/shared';

// Installation types
export type {
  HelmStatus,
  InstallationStatus,
  InstallResult,
  GPUOperatorStatus,
  GPUOperatorInstallResult,
  NodeGpuInfo,
  ClusterGpuCapacity,
} from '@kubefoundry/shared';

// HuggingFace types
export type {
  HfUserInfo,
  HfTokenExchangeRequest,
  HfTokenExchangeResponse,
  HfSaveSecretRequest,
  HfSecretStatus,
  HfModelSearchResult,
  HfModelSearchResponse,
  HfSearchParams,
} from '@kubefoundry/shared';

// API response types
export type {
  Pagination,
  DeploymentsListResponse,
  ClusterStatusResponse,
} from '@kubefoundry/shared';

// Metrics types
export type {
  MetricsResponse,
  RawMetricValue,
  ComputedMetric,
  ComputedMetrics,
  MetricDefinition,
} from '@kubefoundry/shared';

// Autoscaler types
export type {
  AutoscalerDetectionResult,
  AutoscalerStatusInfo,
  DetailedClusterCapacity,
  NodePoolInfo,
  PodFailureReason,
} from '@kubefoundry/shared';

// Import types for internal use
import type {
  Model,
  DeploymentConfig,
  DeploymentStatus,
  PodStatus,
  Settings,
  ProviderInfo,
  ProviderDetails,
  HelmStatus,
  InstallationStatus,
  InstallResult,
  GPUOperatorStatus,
  GPUOperatorInstallResult,
  ClusterGpuCapacity,
  DeploymentsListResponse,
  ClusterStatusResponse,
  MetricsResponse,
  HfTokenExchangeRequest,
  HfTokenExchangeResponse,
  HfSaveSecretRequest,
  HfSecretStatus,
  HfUserInfo,
  HfModelSearchResponse,
  AutoscalerDetectionResult,
  AutoscalerStatusInfo,
  DetailedClusterCapacity,
  PodFailureReason,
} from '@kubefoundry/shared';

// ============================================================================
// Error Handling
// ============================================================================

class ApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}/api${endpoint}`;
  console.log('[API] Fetching:', url);

  // Build headers with auth token if available
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };

  const token = getAuthToken();
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  console.log('[API] Response status:', response.status, 'for', url);

  if (!response.ok) {
    // Handle 401 Unauthorized - dispatch event to trigger logout
    if (response.status === 401) {
      console.warn('[API] Unauthorized - dispatching auth:unauthorized event');
      dispatchUnauthorized();
    }

    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    console.error('[API] Error response:', error);
    throw new ApiError(
      response.status,
      error.error?.message || error.message || 'Request failed'
    );
  }

  return response.json();
}

// ============================================================================
// Models API
// ============================================================================

export const modelsApi = {
  list: () => request<{ models: Model[] }>('/models'),
  get: (id: string) => request<Model>(`/models/${encodeURIComponent(id)}`),
};

// ============================================================================
// Deployments API
// ============================================================================

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
    request<{ message: string; name: string; namespace: string; warnings?: string[] }>('/deployments', {
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

  getMetrics: (name: string, namespace?: string) =>
    request<MetricsResponse>(
      `/deployments/${encodeURIComponent(name)}/metrics${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`
    ),
};

// ============================================================================
// Metrics API
// ============================================================================

export const metricsApi = {
  get: (deploymentName: string, namespace?: string) =>
    request<MetricsResponse>(
      `/deployments/${encodeURIComponent(deploymentName)}/metrics${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`
    ),
};

// ============================================================================
// Health API
// ============================================================================

export const healthApi = {
  check: () => request<{ status: string; timestamp: string }>('/health'),
  clusterStatus: () => request<ClusterStatusResponse>('/cluster/status'),
};

// ============================================================================
// Settings API
// ============================================================================

export const settingsApi = {
  get: () => request<Settings>('/settings'),
  update: (settings: { activeProviderId?: string; defaultNamespace?: string }) =>
    request<{ message: string; config: Settings['config'] }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  listProviders: () => request<{ providers: ProviderInfo[] }>('/settings/providers'),
  getProvider: (id: string) => request<ProviderDetails>(`/settings/providers/${encodeURIComponent(id)}`),
};

// ============================================================================
// Installation API
// ============================================================================

export const installationApi = {
  getHelmStatus: () => request<HelmStatus>('/installation/helm/status'),

  getProviderStatus: (providerId: string) =>
    request<InstallationStatus>(`/installation/providers/${encodeURIComponent(providerId)}/status`),

  getProviderCommands: (providerId: string) =>
    request<{
      providerId: string;
      providerName: string;
      commands: string[];
      steps: Array<{ title: string; command?: string; description: string }>;
    }>(`/installation/providers/${encodeURIComponent(providerId)}/commands`),

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
};

// ============================================================================
// GPU Operator API
// ============================================================================

export const gpuOperatorApi = {
  getStatus: () => request<GPUOperatorStatus>('/installation/gpu-operator/status'),

  install: () =>
    request<GPUOperatorInstallResult>('/installation/gpu-operator/install', {
      method: 'POST',
    }),

  getCapacity: () => request<ClusterGpuCapacity>('/installation/gpu-capacity'),

  getDetailedCapacity: () => request<DetailedClusterCapacity>('/installation/gpu-capacity/detailed'),
};

// ============================================================================
// Autoscaler API
// ============================================================================

export const autoscalerApi = {
  /** Detect autoscaler type and health status */
  detect: () => request<AutoscalerDetectionResult>('/autoscaler/detection'),

  /** Get detailed autoscaler status from ConfigMap */
  getStatus: () => request<AutoscalerStatusInfo>('/autoscaler/status'),

  /** Get reasons why a deployment's pods are pending */
  getPendingReasons: (deploymentName: string, namespace?: string) =>
    request<{ reasons: PodFailureReason[] }>(
      `/deployments/${encodeURIComponent(deploymentName)}/pending-reasons${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`
    ),
};

// ============================================================================
// HuggingFace OAuth API
// ============================================================================

export const huggingFaceApi = {
  /** Get OAuth configuration (client ID, scopes) */
  getOAuthConfig: () =>
    request<{
      clientId: string;
      authorizeUrl: string;
      scopes: string[];
    }>('/oauth/huggingface/config'),

  /** Exchange authorization code for access token */
  exchangeToken: (data: HfTokenExchangeRequest) =>
    request<HfTokenExchangeResponse>('/oauth/huggingface/token', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Get status of HuggingFace secret across namespaces */
  getSecretStatus: () => request<HfSecretStatus>('/secrets/huggingface/status'),

  /** Save HuggingFace token as K8s secrets */
  saveSecret: (data: HfSaveSecretRequest) =>
    request<{
      success: boolean;
      message: string;
      user?: HfUserInfo;
      results: { namespace: string; success: boolean; error?: string }[];
    }>('/secrets/huggingface', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Delete HuggingFace secrets from all namespaces */
  deleteSecret: () =>
    request<{
      success: boolean;
      message: string;
      results: { namespace: string; success: boolean; error?: string }[];
    }>('/secrets/huggingface', {
      method: 'DELETE',
    }),

  /** Search HuggingFace models with compatibility filtering */
  searchModels: (query: string, options?: { limit?: number; offset?: number; hfToken?: string }) => {
    const params = new URLSearchParams({
      q: query,
    });
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());

    // Build headers - include HF token if provided for gated model access
    const headers: Record<string, string> = {};
    if (options?.hfToken) {
      headers['Authorization'] = `Bearer ${options.hfToken}`;
    }

    return request<HfModelSearchResponse>(`/models/search?${params.toString()}`, {
      headers,
    });
  },
};
