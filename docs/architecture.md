# Architecture

## System Overview

KubeFoundry is a monorepo with three packages:
- **frontend** - React SPA for user interaction
- **backend** - Hono API for Kubernetes operations (runs on Bun)
- **shared** - Common TypeScript types (imported directly by frontend and backend)

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│   Browser   │────▶│   Backend   │────▶│   Kubernetes     │
│  (React)    │◀────│   (Hono)    │◀────│   Cluster        │
└─────────────┘     └─────────────┘     └──────────────────┘
       │                   │
       │            ┌──────┴──────┐
       │            │  Provider   │
       │            │  Registry   │
       │            └─────────────┘
       │
       │  (when AUTH_ENABLED=true)
       │            ┌─────────────┐
       └───────────▶│ Auth        │───▶ TokenReview API
                    │ Middleware  │
                    └─────────────┘
```

## Authentication Flow

When `AUTH_ENABLED=true`, the system uses Kubernetes OIDC tokens:

```
┌──────────┐    kubefoundry login    ┌─────────────┐
│   CLI    │ ───────────────────────▶│  kubeconfig │
│          │◀───────────────────────│  (OIDC)     │
└────┬─────┘    extract token        └─────────────┘
     │
     │ open browser with #token=...
     ▼
┌──────────┐    save to localStorage  ┌─────────────┐
│ Browser  │ ────────────────────────▶│  Frontend   │
│          │                          │  (React)    │
└──────────┘                          └──────┬──────┘
                                             │
              Authorization: Bearer <token>  │
                                             ▼
                                      ┌─────────────┐
                                      │  Backend    │
                                      │  (Hono)     │
                                      └──────┬──────┘
                                             │
                          TokenReview API    │
                                             ▼
                                      ┌─────────────┐
                                      │  Kubernetes │
                                      │  API Server │
                                      └─────────────┘
```

## Provider Abstraction

The provider pattern enables support for multiple inference runtimes:

```typescript
interface Provider {
  id: string;
  name: string;
  description: string;
  
  // CRD configuration
  getCRDConfig(): CRDConfig;
  
  // Manifest generation and parsing
  generateManifest(config: DeploymentConfig): object;
  parseStatus(resource: object): DeploymentStatus;
  
  // Validation
  validateConfig(config: DeploymentConfig): ValidationResult;
  
  // Installation
  checkInstallation(k8s: KubernetesService): Promise<InstallationStatus>;
  getHelmRepos(): HelmRepo[];
  getHelmCharts(): HelmChart[];
  getInstallationSteps(): InstallationStep[];
}
```

### Supported Providers

| Provider | CRD | Status |
|----------|-----|--------|
| NVIDIA Dynamo | DynamoGraphDeployment | ✅ Available |
| KubeRay | RayService | ✅ Available |

## Data Models

### Model (Catalog Entry)
```typescript
interface Model {
  id: string;                    // HuggingFace model ID
  name: string;                  // Display name
  description: string;
  size: string;                  // Parameter count (e.g., "0.6B")
  task: 'text-generation' | 'chat';
  contextLength?: number;
  supportedEngines: Engine[];
  minGpuMemory?: string;
}
```

### DeploymentConfig
```typescript
interface DeploymentConfig {
  name: string;                  // K8s resource name
  namespace: string;
  modelId: string;
  engine: 'vllm' | 'sglang' | 'trtllm';
  mode: 'aggregated' | 'disaggregated';
  replicas: number;
  hfTokenSecret: string;
  enforceEager: boolean;
  enablePrefixCaching: boolean;
  trustRemoteCode: boolean;
}
```

### DeploymentStatus
```typescript
interface DeploymentStatus {
  name: string;
  namespace: string;
  modelId: string;
  engine: Engine;
  phase: 'Pending' | 'Deploying' | 'Running' | 'Failed' | 'Terminating';
  replicas: { desired: number; ready: number; available: number; };
  pods: PodStatus[];
  createdAt: string;
}
```

## Configuration Storage

Settings are persisted in a Kubernetes ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kubefoundry-config
  namespace: kubefoundry
data:
  config.json: |
    {
      "activeProviderId": "dynamo",
      "providerConfigs": {}
    }
```

## Frontend Architecture

### Component Hierarchy
```
App
├── MainLayout
│   ├── Header (cluster status, warnings)
│   ├── Sidebar (navigation)
│   └── Page Content
│       ├── ModelsPage
│       ├── DeployPage
│       ├── DeploymentsPage
│       ├── DeploymentDetailsPage
│       ├── SettingsPage
│       └── InstallationPage
```

### State Management
- **Server State**: TanStack Query for API data with caching
- **Local State**: React useState for UI state
- **Persistent State**: Browser localStorage for user preferences

## Backend Services

### KubernetesService
Handles all Kubernetes API interactions:
- List/create/delete custom resources
- Get pod status
- Check cluster connectivity
- Namespace management
- Check GPU availability on nodes (`nvidia.com/gpu` resources)
- Check GPU Operator installation status (CRDs, pods)

### ConfigService
Manages application configuration:
- Read/write ConfigMap
- Get active provider
- Persist provider settings

### HelmService
Handles Helm CLI operations:
- Check Helm availability
- Add/update repositories
- Install/upgrade/uninstall charts
- Install NVIDIA GPU Operator (`gpu-operator` namespace)

### AuthService
Handles authentication when `AUTH_ENABLED=true`:
- Validate tokens via Kubernetes TokenReview API
- Extract OIDC tokens from kubeconfig (for CLI login)
- Generate magic link URLs for browser authentication
- Store/load/clear credentials locally (`~/.kubefoundry/credentials.json`)
