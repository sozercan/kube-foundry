# Dynamote - Implementation Plan

## Technical Architecture

### Technology Stack

#### Frontend
| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | React 18 + TypeScript | Type-safe UI development |
| Build Tool | Vite | Fast development and optimized builds |
| Styling | Tailwind CSS | Utility-first CSS framework |
| UI Components | shadcn/ui (Radix primitives) | Accessible, composable components |
| State Management | React Query (TanStack Query) | Server state caching and synchronization |
| HTTP Client | Fetch API | Native browser HTTP with typed wrappers |
| Icons | Lucide React | Consistent, lightweight icons |

#### Backend
| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js 18+ | JavaScript runtime |
| Framework | Express.js | Lightweight REST API server |
| Kubernetes Client | @kubernetes/client-node | Official K8s API client |
| Validation | Zod | Runtime schema validation |

---

## Project Structure

```
dynamote/
├── frontend/                    # React frontend application
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── MainLayout.tsx
│   │   │   ├── models/
│   │   │   │   ├── ModelCard.tsx
│   │   │   │   ├── ModelGrid.tsx
│   │   │   │   └── ModelSearch.tsx
│   │   │   └── deployments/
│   │   │       ├── DeploymentForm.tsx
│   │   │       ├── DeploymentList.tsx
│   │   │       ├── DeploymentStatus.tsx
│   │   │       └── EngineSelector.tsx
│   │   ├── hooks/
│   │   │   ├── useModels.ts
│   │   │   ├── useDeployments.ts
│   │   │   └── useSettings.ts
│   │   ├── lib/
│   │   │   ├── api.ts           # Backend API client
│   │   │   ├── utils.ts
│   │   │   └── constants.ts
│   │   ├── types/
│   │   │   ├── model.ts
│   │   │   ├── deployment.ts
│   │   │   └── kubernetes.ts
│   │   ├── data/
│   │   │   └── models.json      # Static model catalog
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
├── backend/                     # Express backend API
│   ├── src/
│   │   ├── routes/
│   │   │   ├── deployments.ts
│   │   │   ├── models.ts
│   │   │   └── health.ts
│   │   ├── services/
│   │   │   ├── kubernetes.ts    # K8s API interactions
│   │   │   └── dynamo.ts        # Dynamo CRD generation
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── middleware/
│   │   │   └── errorHandler.ts
│   │   └── index.ts
│   ├── tsconfig.json
│   └── package.json
├── shared/                      # Shared types and utilities
│   └── types/
│       ├── model.ts
│       └── deployment.ts
├── package.json                 # Root package.json (workspaces)
└── README.md
```

---

## API Design

### Backend REST API

#### Deployments

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/deployments` | GET | List all DynamoGraphDeployment resources |
| `/api/deployments` | POST | Create a new deployment |
| `/api/deployments/:name` | GET | Get deployment details and status |
| `/api/deployments/:name` | DELETE | Delete a deployment |
| `/api/deployments/:name/pods` | GET | Get pods for a deployment |

#### Models

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/models` | GET | Get curated model catalog |

#### Settings & Health

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Backend health check |
| `/api/cluster/status` | GET | Kubernetes cluster connection status |

---

## Data Models

### Model Catalog Entry
```typescript
interface Model {
  id: string;                    // HuggingFace model ID (e.g., "Qwen/Qwen3-0.6B")
  name: string;                  // Display name
  description: string;           // Brief description
  size: string;                  // Parameter count (e.g., "0.6B")
  task: 'text-generation' | 'chat';
  parameters?: number;           // Actual parameter count
  contextLength?: number;        // Max context length
  license?: string;              // Model license
  supportedEngines: Engine[];    // Compatible inference engines
  minGpuMemory?: string;         // Minimum GPU memory (e.g., "8GB")
}

type Engine = 'vllm' | 'sglang' | 'trtllm';
```

### Deployment Configuration
```typescript
interface DeploymentConfig {
  name: string;                  // Deployment name (K8s resource name)
  namespace: string;             // Kubernetes namespace
  modelId: string;               // HuggingFace model ID
  engine: Engine;                // Inference engine
  mode: 'aggregated' | 'disaggregated';
  replicas: number;              // Number of worker replicas
  servedModelName?: string;      // Custom model name for API
  routerMode: 'none' | 'kv' | 'round-robin';
  hfTokenSecret: string;         // Name of K8s secret with HF_TOKEN
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
```

### Deployment Status (from Kubernetes)
```typescript
interface DeploymentStatus {
  name: string;
  namespace: string;
  modelId: string;
  engine: Engine;
  phase: 'Pending' | 'Deploying' | 'Running' | 'Failed' | 'Terminating';
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

interface PodStatus {
  name: string;
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';
  ready: boolean;
  restarts: number;
  node?: string;
}
```

---

## Kubernetes Integration

### DynamoGraphDeployment CRD

The backend generates and applies Dynamo CRD manifests. Example structure based on Dynamo's Kubernetes operator:

```yaml
apiVersion: dynamo.nvidia.com/v1alpha1
kind: DynamoGraphDeployment
metadata:
  name: qwen-deployment
  namespace: dynamo-system
spec:
  Frontend:
    replicas: 1
    http-port: 8000
  VllmWorker:
    model-path: Qwen/Qwen3-0.6B
    served-model-name: Qwen/Qwen3-0.6B
    replicas: 1
    enforce-eager: true
    envFrom:
      - secretRef:
          name: hf-token-secret
```

### Kubernetes Service Implementation

```typescript
// backend/src/services/kubernetes.ts

import * as k8s from '@kubernetes/client-node';

class KubernetesService {
  private customObjectsApi: k8s.CustomObjectsApi;
  private coreV1Api: k8s.CoreV1Api;

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();  // Uses KUBECONFIG or in-cluster config

    this.customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);
    this.coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
  }

  async listDeployments(namespace: string): Promise<DeploymentStatus[]> {
    // List DynamoGraphDeployment resources
  }

  async createDeployment(config: DeploymentConfig): Promise<void> {
    // Generate and apply CRD manifest
  }

  async deleteDeployment(name: string, namespace: string): Promise<void> {
    // Delete DynamoGraphDeployment resource
  }

  async getDeploymentPods(name: string, namespace: string): Promise<PodStatus[]> {
    // List pods with label selector for deployment
  }

  async checkClusterConnection(): Promise<boolean> {
    // Verify cluster connectivity
  }
}
```

---

## Frontend Pages

### 1. Model Catalog Page (`/`)
- Grid display of curated models
- Search bar for filtering by name
- Filter chips for engine compatibility
- Click to select model for deployment

### 2. Deploy Model Page (`/deploy/:modelId`)
- Model summary card
- Deployment configuration form:
  - Deployment name (auto-generated, editable)
  - Namespace selector
  - Engine selection (radio buttons)
  - Deployment mode toggle
  - Replica count
  - HuggingFace token secret name
  - Advanced options (collapsible)
- Deploy button
- Shows generated YAML preview (optional)

### 3. Deployments Dashboard (`/deployments`)
- Table of active deployments with columns:
  - Name
  - Model
  - Engine
  - Status (with colored badge)
  - Replicas (ready/desired)
  - Age
  - Actions (View, Delete)
- Auto-refresh every 10 seconds
- Empty state with "Deploy your first model" CTA

### 4. Deployment Details (`/deployments/:name`)
- Deployment summary
- Status and conditions
- Pod list with status
- Port-forward instructions
- Delete deployment button

---

## Implementation Phases

### Phase 1: Project Setup (Day 1)
- [ ] Initialize monorepo with frontend and backend workspaces
- [ ] Set up Vite + React + TypeScript frontend
- [ ] Set up Express + TypeScript backend
- [ ] Configure Tailwind CSS and shadcn/ui
- [ ] Create shared types package

### Phase 2: Static Frontend (Days 2-3)
- [ ] Implement layout components (Header, Sidebar, MainLayout)
- [ ] Create model catalog with static data
- [ ] Build ModelCard and ModelGrid components
- [ ] Implement search and filter functionality
- [ ] Add deployment configuration form
- [ ] Style with dark theme

### Phase 3: Backend API (Days 4-5)
- [ ] Set up Express routes
- [ ] Implement Kubernetes service with @kubernetes/client-node
- [ ] Create DynamoGraphDeployment manifest generator
- [ ] Add deployment CRUD operations
- [ ] Implement pod status fetching
- [ ] Add error handling middleware

### Phase 4: Integration (Days 6-7)
- [ ] Connect frontend to backend API
- [ ] Implement React Query hooks for data fetching
- [ ] Add deployment creation flow
- [ ] Build deployments dashboard with live status
- [ ] Implement deployment deletion
- [ ] Add loading and error states

### Phase 5: Polish (Day 8)
- [ ] Add form validation
- [ ] Implement toast notifications
- [ ] Add confirmation dialogs for destructive actions
- [ ] Test end-to-end deployment flow
- [ ] Write README with setup instructions

---

## Configuration

### Frontend Environment Variables
```env
# Backend API URL
VITE_API_URL=http://localhost:3001

# Default namespace for deployments
VITE_DEFAULT_NAMESPACE=dynamo-system

# Default HF token secret name
VITE_DEFAULT_HF_SECRET=hf-token-secret
```

### Backend Environment Variables
```env
# Server port
PORT=3001

# Kubernetes namespace (can be overridden per request)
DEFAULT_NAMESPACE=dynamo-system

# CORS origin for frontend
CORS_ORIGIN=http://localhost:5173
```

---

## Model Catalog (Static JSON)

```json
{
  "models": [
    {
      "id": "Qwen/Qwen3-0.6B",
      "name": "Qwen3 0.6B",
      "description": "Small, efficient model ideal for development and testing",
      "size": "0.6B",
      "task": "text-generation",
      "contextLength": 32768,
      "supportedEngines": ["vllm", "sglang", "trtllm"],
      "minGpuMemory": "4GB"
    },
    {
      "id": "Qwen/Qwen2.5-1.5B-Instruct",
      "name": "Qwen2.5 1.5B Instruct",
      "description": "Instruction-tuned model with strong performance",
      "size": "1.5B",
      "task": "chat",
      "contextLength": 32768,
      "supportedEngines": ["vllm", "sglang", "trtllm"],
      "minGpuMemory": "6GB"
    },
    {
      "id": "deepseek-ai/DeepSeek-R1-Distill-Llama-8B",
      "name": "DeepSeek R1 Distill 8B",
      "description": "Reasoning-focused model with strong analytical capabilities",
      "size": "8B",
      "task": "chat",
      "contextLength": 16384,
      "supportedEngines": ["vllm", "sglang"],
      "minGpuMemory": "16GB"
    },
    {
      "id": "meta-llama/Llama-3.2-1B-Instruct",
      "name": "Llama 3.2 1B Instruct",
      "description": "Compact Llama model optimized for instruction following",
      "size": "1B",
      "task": "chat",
      "contextLength": 131072,
      "supportedEngines": ["vllm", "sglang", "trtllm"],
      "minGpuMemory": "4GB"
    },
    {
      "id": "meta-llama/Llama-3.2-3B-Instruct",
      "name": "Llama 3.2 3B Instruct",
      "description": "Balanced Llama model for various tasks",
      "size": "3B",
      "task": "chat",
      "contextLength": 131072,
      "supportedEngines": ["vllm", "sglang", "trtllm"],
      "minGpuMemory": "8GB"
    },
    {
      "id": "mistralai/Mistral-7B-Instruct-v0.3",
      "name": "Mistral 7B Instruct v0.3",
      "description": "Powerful instruction-tuned model from Mistral AI",
      "size": "7B",
      "task": "chat",
      "contextLength": 32768,
      "supportedEngines": ["vllm", "sglang", "trtllm"],
      "minGpuMemory": "16GB"
    },
    {
      "id": "microsoft/Phi-3-mini-4k-instruct",
      "name": "Phi-3 Mini 4K Instruct",
      "description": "Microsoft's efficient small language model",
      "size": "3.8B",
      "task": "chat",
      "contextLength": 4096,
      "supportedEngines": ["vllm", "sglang"],
      "minGpuMemory": "8GB"
    },
    {
      "id": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
      "name": "TinyLlama 1.1B Chat",
      "description": "Lightweight chat model for resource-constrained environments",
      "size": "1.1B",
      "task": "chat",
      "contextLength": 2048,
      "supportedEngines": ["vllm", "sglang", "trtllm"],
      "minGpuMemory": "4GB"
    }
  ]
}
```

---

## Prerequisites

### Development
- Node.js 18+
- npm or pnpm
- Access to a Kubernetes cluster with Dynamo operator installed

### Kubernetes Cluster
- Dynamo operator deployed (provides DynamoGraphDeployment CRD)
- GPU nodes available
- NATS and etcd running (typically deployed with Dynamo)
- HuggingFace token stored as Kubernetes secret:
  ```bash
  kubectl create secret generic hf-token-secret \
    --from-literal=HF_TOKEN="your-token" \
    -n dynamo-system
  ```

### User Workflow
1. Browse model catalog and select a model
2. Configure deployment options (engine, replicas, etc.)
3. Click Deploy to create DynamoGraphDeployment
4. Monitor deployment status in dashboard
5. Once running, use `kubectl port-forward` to access:
   ```bash
   kubectl port-forward svc/<deployment>-frontend 8000:8000 -n dynamo-system
   ```
6. Test model via `curl localhost:8000/v1/chat/completions`

---

## Success Criteria

### MVP Completion
- [ ] User can browse curated model catalog
- [ ] User can configure and create deployments via UI
- [ ] Backend successfully creates DynamoGraphDeployment resources
- [ ] Deployment list shows current status from Kubernetes
- [ ] User can delete deployments from UI
- [ ] Clear instructions for port-forwarding to test models

### Quality Gates
- All TypeScript with no `any` types
- Error boundaries for graceful failure handling
- Loading states for all async operations
- Form validation with clear error messages
- Responsive layout (desktop + tablet)
