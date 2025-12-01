# Dynamote - NVIDIA Dynamo Model Deployment Frontend

## Project Overview

**Dynamote** is a web-based frontend application that enables users to deploy machine learning models from Hugging Face to NVIDIA Dynamo on Kubernetes. The application provides a streamlined interface for browsing, selecting, and deploying models by creating DynamoGraphDeployment custom resources in a Kubernetes cluster.

### Target Users
- ML Engineers and Data Scientists
- DevOps/MLOps teams managing inference infrastructure
- Developers integrating LLM capabilities into applications

---

## Functional Requirements

### FR-1: Model Catalog & Selection

#### FR-1.1: Model Browsing
- Display a curated catalog of supported Hugging Face models
- Show model cards with:
  - Model name and Hugging Face ID (e.g., `Qwen/Qwen3-0.6B`)
  - Model type/task (Text Generation, Fill Mask, etc.)
  - Model size/parameters (when available)
  - Brief description
- Support search functionality to filter models by name
- Support filtering by model category/task type

#### FR-1.2: Supported Models (Initial Set)
Focus on a small, curated set of LLM models known to work with Dynamo:

| Model ID | Description | Size |
|----------|-------------|------|
| `Qwen/Qwen3-0.6B` | Qwen3 0.6B - Small efficient model | 0.6B |
| `Qwen/Qwen2.5-1.5B-Instruct` | Qwen2.5 Instruct | 1.5B |
| `deepseek-ai/DeepSeek-R1-Distill-Llama-8B` | DeepSeek R1 Distill | 8B |
| `meta-llama/Llama-3.2-1B-Instruct` | Llama 3.2 1B Instruct | 1B |
| `meta-llama/Llama-3.2-3B-Instruct` | Llama 3.2 3B Instruct | 3B |
| `mistralai/Mistral-7B-Instruct-v0.3` | Mistral 7B Instruct | 7B |
| `microsoft/Phi-3-mini-4k-instruct` | Phi-3 Mini 4K | 3.8B |
| `TinyLlama/TinyLlama-1.1B-Chat-v1.0` | TinyLlama Chat | 1.1B |

#### FR-1.3: Model Selection
- Allow users to select a single model for deployment
- Display detailed model information on selection
- Show estimated resource requirements (GPU memory, etc.)

### FR-2: Deployment Configuration

#### FR-2.1: Engine Selection
Allow users to select the inference engine:
- **vLLM** - Default, widely compatible
- **SGLang** - High performance option
- **TensorRT-LLM** - NVIDIA optimized (requires compatible hardware)

#### FR-2.2: Deployment Mode
- **Aggregated** (default) - Single worker handles prefill and decode
- **Disaggregated** - Separate prefill and decode workers (advanced)

#### FR-2.3: Configuration Options
- **Deployment Name**: Auto-generated from model, editable
- **Namespace**: Target Kubernetes namespace
- **Model Name Override**: Custom served model name
- **Router Mode**:
  - `none` (default for aggregated)
  - `kv` (KV-aware routing)
  - `round-robin`
- **Number of Replicas**: 1-4 worker replicas
- **HuggingFace Token Secret**: Name of K8s secret containing HF_TOKEN
- **Context Length**: Optional override for max context

#### FR-2.4: Advanced Options (Collapsible)
- Enforce Eager Mode (for quick deployment)
- Enable Prefix Caching
- Trust Remote Code
- Custom Engine Arguments (YAML/JSON input)

### FR-3: Kubernetes Deployment Management

#### FR-3.1: Deploy Model to Kubernetes
- Generate DynamoGraphDeployment CRD manifest
- Apply manifest to configured Kubernetes namespace via backend API
- Show deployment progress/status from Kubernetes API
- Configure HuggingFace token secret reference

#### FR-3.2: Deployment Status
- Display list of DynamoGraphDeployment resources in namespace
- Show for each deployment:
  - Deployment name
  - Model name
  - Engine type (vLLM, SGLang, TensorRT-LLM)
  - Status (Pending, Deploying, Running, Failed)
  - Replica count (ready/desired)
  - Age/uptime
  - Pod health status
- Auto-refresh status every 10 seconds

#### FR-3.3: Deployment Actions
- View deployment details and pod status
- Delete deployments from UI
- Display port-forward instructions for testing:
  ```
  kubectl port-forward svc/<deployment>-frontend 8000:8000 -n <namespace>
  ```
- User performs port-forwarding externally to test deployed models

### FR-4: Cluster & Settings

#### FR-4.1: Kubernetes Cluster Status
- Verify connection to Kubernetes cluster
- Display cluster connection status (connected/disconnected)
- Show configured namespace

#### FR-4.2: Settings Configuration
- Configure target Kubernetes namespace
- Set HuggingFace token secret name (e.g., `hf-token-secret`)
- Persist settings in browser local storage

---

## Non-Functional Requirements

### NFR-1: Performance
- Page load time < 2 seconds
- UI interactions respond within 100ms
- Model catalog search/filter < 200ms
- API calls timeout after 30 seconds with appropriate error handling

### NFR-2: Usability
- Responsive design supporting desktop and tablet viewports
- Clear visual feedback for all user actions
- Intuitive navigation with minimal learning curve
- Accessible UI following WCAG 2.1 AA guidelines

### NFR-3: Reliability
- Graceful handling of backend unavailability
- Automatic retry for transient failures (max 3 attempts)
- Clear error messages with suggested remediation steps
- State persistence in browser local storage

### NFR-4: Security
- Input validation on all form fields
- Sanitization of user inputs before display
- No sensitive credentials stored in frontend
- Support for environment-based API configuration
- **Note**: MVP assumes deployment in a trusted network environment (e.g., private VPN, internal cluster). For public-facing deployments, implement OIDC/OAuth2 authentication (see Future Improvements).

---

## Technical Architecture

### Technology Stack

#### Frontend
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: React Query (TanStack Query) for server state
- **HTTP Client**: Fetch API with typed wrappers
- **Icons**: Lucide React
- **UI Components**: shadcn/ui (Radix primitives)

#### Backend API (Required)
- **Runtime**: Node.js with Express
- **Kubernetes Client**: @kubernetes/client-node SDK
- **Purpose**: Interface with Kubernetes API, manage DynamoGraphDeployment CRDs
- **Communication**: REST API with JSON payloads

### Component Architecture

```
src/
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── MainLayout.tsx
│   ├── models/
│   │   ├── ModelCard.tsx
│   │   ├── ModelGrid.tsx
│   │   ├── ModelSearch.tsx
│   │   └── ModelDetails.tsx
│   ├── deployment/
│   │   ├── DeploymentConfig.tsx
│   │   ├── EngineSelector.tsx
│   │   ├── DeploymentOptions.tsx
│   │   └── DeploymentCommand.tsx
│   ├── status/
│   │   ├── DeploymentList.tsx
│   │   ├── DeploymentStatus.tsx
│   │   └── SystemHealth.tsx
│   ├── chat/
│   │   ├── ChatInterface.tsx
│   │   ├── ChatMessage.tsx
│   │   └── ChatInput.tsx
│   └── ui/
│       └── (shadcn components)
├── hooks/
│   ├── useModels.ts
│   ├── useDeployments.ts
│   └── useHealth.ts
├── lib/
│   ├── api.ts
│   ├── dynamo.ts
│   └── utils.ts
├── types/
│   ├── model.ts
│   ├── deployment.ts
│   └── api.ts
└── App.tsx
```

### API Integration

#### Backend API Endpoints
The frontend communicates with the backend API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/deployments` | GET | List DynamoGraphDeployment resources |
| `/api/deployments` | POST | Create a new deployment |
| `/api/deployments/:name` | GET | Get deployment details and pod status |
| `/api/deployments/:name` | DELETE | Delete a deployment |
| `/api/models` | GET | Get curated model catalog |
| `/api/health` | GET | Backend health check |
| `/api/cluster/status` | GET | Kubernetes cluster connection status |

### Data Models

#### Model Definition
```typescript
interface Model {
  id: string;              // e.g., "Qwen/Qwen3-0.6B"
  name: string;            // Display name
  description: string;
  task: ModelTask;         // 'text-generation' | 'fill-mask' | etc.
  size: string;            // e.g., "0.6B"
  parameters?: number;     // Actual parameter count
  contextLength?: number;  // Max context length
  license?: string;
  supportedEngines: Engine[];
  minGpuMemory?: string;   // Minimum GPU memory (e.g., "8GB")
}

type Engine = 'vllm' | 'sglang' | 'trtllm';
type ModelTask = 'text-generation' | 'chat' | 'fill-mask';
```

#### Deployment Configuration
```typescript
interface DeploymentConfig {
  name: string;                  // Kubernetes resource name
  namespace: string;             // Target namespace
  modelId: string;
  engine: Engine;
  mode: 'aggregated' | 'disaggregated';
  servedModelName?: string;
  routerMode: 'none' | 'kv' | 'round-robin';
  replicas: number;              // Number of worker replicas
  hfTokenSecret: string;         // K8s secret name for HF_TOKEN
  contextLength?: number;
  enforceEager: boolean;
  enablePrefixCaching: boolean;
  trustRemoteCode: boolean;
  engineArgs?: Record<string, unknown>;
  resources?: {                  // Resource requirements
    gpu: number;                 // Number of GPUs per replica
    memory?: string;             // Memory limit
  };
}
```

#### Deployment Status (from Kubernetes)
```typescript
interface Deployment {
  name: string;
  namespace: string;
  config: DeploymentConfig;
  phase: 'Pending' | 'Deploying' | 'Running' | 'Failed' | 'Terminating';
  replicas: {
    desired: number;
    ready: number;
    available: number;
  };
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

## User Interface Design

### Page Structure

#### 1. Model Catalog Page (Home)
- Search bar at top
- Filter chips for model categories
- Grid of model cards (similar to HuggingFace screenshot)
- Click card to select for deployment

#### 2. Deployment Configuration Page
- Selected model summary at top
- Engine selection (radio buttons)
- Deployment mode toggle
- Configuration form fields
- Generated command preview
- Deploy button

#### 3. Deployments Dashboard
- Table/list of DynamoGraphDeployment resources
- Status indicators (colored badges)
- Columns: Name, Model, Engine, Status, Replicas, Age
- Actions: View details, Delete
- Auto-refresh every 10 seconds

#### 4. Deployment Details Page
- Deployment summary and configuration
- Pod list with status
- Port-forward instructions for testing
- Delete button with confirmation

### Visual Design Guidelines
- Dark theme primary (matching NVIDIA Dynamo aesthetic)
- Accent color: NVIDIA Green (#76B900)
- Clean, minimal interface
- Card-based layouts
- Clear visual hierarchy
- Consistent spacing (8px grid)

---

## Implementation Phases

### Phase 1: Project Setup
- Initialize monorepo with frontend and backend
- Set up Vite + React + TypeScript frontend
- Set up Express + TypeScript backend with @kubernetes/client-node
- Configure Tailwind CSS and shadcn/ui

### Phase 2: Frontend Development
- Implement layout components and navigation
- Create model catalog with static data
- Build deployment configuration form
- Implement deployments dashboard UI

### Phase 3: Backend & Kubernetes Integration
- Implement Kubernetes service with @kubernetes/client-node
- Create DynamoGraphDeployment manifest generator
- Add deployment CRUD operations
- Connect frontend to backend API

### Phase 4: Polish & Testing
- Add form validation and error handling
- Implement loading and error states
- Test end-to-end deployment flow
- Write documentation

---

## Configuration

### Environment Variables

#### Frontend
```env
# Backend API URL
VITE_API_URL=http://localhost:3001

# Default namespace for deployments
VITE_DEFAULT_NAMESPACE=dynamo-system

# Default HF token secret name
VITE_DEFAULT_HF_SECRET=hf-token-secret
```

#### Backend
```env
# Server port
PORT=3001

# Default Kubernetes namespace
DEFAULT_NAMESPACE=dynamo-system

# CORS origin for frontend
CORS_ORIGIN=http://localhost:5173
```

### Supported Model Configuration
Models are configured in a static JSON file that can be easily extended:

```json
{
  "models": [
    {
      "id": "Qwen/Qwen3-0.6B",
      "name": "Qwen3 0.6B",
      "description": "Small, efficient model for general tasks",
      "task": "text-generation",
      "size": "0.6B",
      "supportedEngines": ["vllm", "sglang", "trtllm"]
    }
  ]
}
```

---

## Success Criteria

### MVP Launch Criteria
- [ ] Users can browse and search model catalog
- [ ] Users can configure deployment options
- [ ] Backend creates DynamoGraphDeployment resources in Kubernetes
- [ ] Deployment list shows current status from Kubernetes API
- [ ] Users can delete deployments from UI
- [ ] Clear port-forward instructions for testing deployed models
- [ ] UI is responsive on desktop and tablet

### Post-MVP Success Metrics
- Users can deploy models via UI in < 3 minutes
- Deployment status accurately reflects Kubernetes state
- Error rate < 1% for user-initiated actions

---

## Dependencies & Prerequisites

### Development Dependencies
- Node.js 18+
- npm or pnpm
- Modern browser (Chrome, Firefox, Safari, Edge)
- Access to a Kubernetes cluster (for testing)

### Kubernetes Cluster Prerequisites
- Dynamo operator installed (provides DynamoGraphDeployment CRD)
- GPU nodes available with NVIDIA drivers
- NATS and etcd deployed (typically included with Dynamo operator)
- HuggingFace token stored as Kubernetes secret:
  ```bash
  kubectl create secret generic hf-token-secret \
    --from-literal=HF_TOKEN="your-token" \
    -n dynamo-system
  ```
- Valid kubeconfig for cluster access

---

## Glossary

| Term | Definition |
|------|------------|
| **Dynamo** | NVIDIA's distributed inference serving framework |
| **DynamoGraphDeployment** | Kubernetes Custom Resource for deploying Dynamo workloads |
| **Frontend** | Dynamo's HTTP API server component |
| **Worker** | Inference engine instance (vLLM, SGLang, TRT-LLM) |
| **Aggregated** | Single worker handling both prefill and decode |
| **Disaggregated** | Separate workers for prefill and decode phases |
| **KV Cache** | Key-Value cache for attention mechanism |
| **CRD** | Custom Resource Definition - Kubernetes API extension |
| **Namespace** | Kubernetes namespace for resource isolation |

---

## References

- [NVIDIA Dynamo GitHub](https://github.com/ai-dynamo/dynamo)
- [NVIDIA Dynamo Documentation](https://docs.nvidia.com/dynamo/latest)
- [Hugging Face Models](https://huggingface.co/models)
- [vLLM Documentation](https://docs.vllm.ai)
- [SGLang Documentation](https://docs.sglang.ai)
