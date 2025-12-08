# KubeFoundry - Kubernetes ML Model Deployment Platform

A web-based platform for deploying and managing machine learning models on Kubernetes with support for multiple inference providers.

## Features

- 📦 **Model Catalog**: Browse and search curated Hugging Face models
- 🚀 **Easy Deployment**: Configure and deploy models with a few clicks
- 📊 **Dashboard**: Monitor deployment status with auto-refresh
- 🔌 **Multi-Provider Support**: Extensible architecture supporting multiple inference runtimes
- 🔧 **Multiple Engines**: Support for vLLM, SGLang, and TensorRT-LLM (via NVIDIA Dynamo)
- 🎨 **Dark Theme**: Modern dark UI with provider-specific accents
- 📥 **Installation Management**: Install providers via Helm with UI or CLI commands

## Supported Providers

| Provider | Status | Description |
|----------|--------|-------------|
| **NVIDIA Dynamo** | ✅ Available | GPU-accelerated inference with disaggregated serving |
| **KubeRay** | 🔜 Planned | Ray-based distributed inference |

## Prerequisites

- Node.js 18+
- Access to a Kubernetes cluster
- Helm CLI (for provider installation)
- GPU nodes with NVIDIA drivers (for Dynamo provider)
- HuggingFace token stored as Kubernetes secret:
  ```bash
  kubectl create secret generic hf-token-secret \
    --from-literal=HF_TOKEN="your-token" \
    -n kubefoundry
  ```

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development servers:**
   ```bash
   npm run dev
   ```

   This starts both frontend (http://localhost:5173) and backend (http://localhost:3001)

3. **Install a provider (via UI or CLI):**
   
   Navigate to the Installation page in the UI, or run manually:
   ```bash
   # Add NVIDIA Dynamo Helm repo
   helm repo add nvidia-dynamo https://nvidia.github.io/dynamo
   helm repo update
   
   # Install Dynamo operator
   helm install dynamo-operator nvidia-dynamo/dynamo \
     --namespace kubefoundry --create-namespace
   ```

4. **Build for production:**
   ```bash
   npm run build
   ```

## Project Structure

```
kubefoundry/
├── frontend/          # React frontend application
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # React hooks
│   │   └── lib/         # Utilities and API client
│   └── ...
├── backend/           # Express backend API
│   ├── src/
│   │   ├── providers/   # Provider implementations
│   │   │   ├── types.ts      # Provider interface
│   │   │   ├── index.ts      # Provider registry
│   │   │   └── dynamo/       # NVIDIA Dynamo provider
│   │   ├── routes/      # API routes
│   │   ├── services/    # Core services
│   │   │   ├── kubernetes.ts # K8s client
│   │   │   ├── config.ts     # ConfigMap persistence
│   │   │   └── helm.ts       # Helm CLI integration
│   │   └── data/        # Static model catalog
│   └── ...
├── shared/            # Shared TypeScript types
└── ...
```

## Architecture

### Provider Abstraction

KubeFoundry uses a provider pattern to support multiple inference runtimes:

```typescript
interface Provider {
  id: string;
  name: string;
  getCRDConfig(): CRDConfig;
  generateManifest(config: DeploymentConfig): object;
  parseStatus(resource: object): DeploymentStatus;
  validateConfig(config: DeploymentConfig): ValidationResult;
  checkInstallation(k8s: KubernetesService): Promise<InstallationStatus>;
  getHelmRepos(): HelmRepo[];
  getHelmCharts(): HelmChart[];
}
```

### Configuration Storage

Settings are stored in a Kubernetes ConfigMap (`kubefoundry-config`) in the `kubefoundry` namespace:

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

## Configuration

### Frontend Environment Variables

```env
VITE_API_URL=http://localhost:3001
VITE_DEFAULT_NAMESPACE=kubefoundry
VITE_DEFAULT_HF_SECRET=hf-token-secret
```

### Backend Environment Variables

```env
PORT=3001
DEFAULT_NAMESPACE=kubefoundry
CORS_ORIGIN=http://localhost:5173
```

## Usage

1. **Install Provider**: Go to Installation page to install your preferred provider
2. **Browse Models**: View the curated catalog of supported models
3. **Select & Configure**: Choose a model and configure deployment options
4. **Deploy**: Click deploy to create a deployment in Kubernetes
5. **Monitor**: View deployment status in the dashboard
6. **Access**: Use kubectl port-forward to test your deployed model:
   ```bash
   kubectl port-forward svc/<deployment>-frontend 8000:8000 -n kubefoundry
   curl http://localhost:8000/v1/chat/completions
   ```

## Supported Models

| Model | Size | Engines |
|-------|------|---------|
| Qwen/Qwen3-0.6B | 0.6B | vLLM, SGLang, TensorRT-LLM |
| Qwen/Qwen2.5-1.5B-Instruct | 1.5B | vLLM, SGLang, TensorRT-LLM |
| deepseek-ai/DeepSeek-R1-Distill-Llama-8B | 8B | vLLM, SGLang |
| meta-llama/Llama-3.2-1B-Instruct | 1B | vLLM, SGLang, TensorRT-LLM |
| meta-llama/Llama-3.2-3B-Instruct | 3B | vLLM, SGLang, TensorRT-LLM |
| mistralai/Mistral-7B-Instruct-v0.3 | 7B | vLLM, SGLang, TensorRT-LLM |
| microsoft/Phi-3-mini-4k-instruct | 3.8B | vLLM, SGLang |
| TinyLlama/TinyLlama-1.1B-Chat-v1.0 | 1.1B | vLLM, SGLang, TensorRT-LLM |

## Development

### Frontend

```bash
npm run dev:frontend    # Start Vite dev server
npm run build:frontend  # Build for production
```

### Backend

```bash
npm run dev:backend     # Start with tsx watch
npm run build:backend   # Compile TypeScript
```

### Adding a New Provider

1. Create a new provider directory: `backend/src/providers/<name>/`
2. Implement the `Provider` interface
3. Register the provider in the provider registry
4. Add provider-specific configuration schemas

## API Endpoints

### Settings
- `GET /api/settings` - Get current settings and provider list
- `PUT /api/settings` - Update settings

### Installation
- `GET /api/installation/helm/status` - Check Helm CLI availability
- `GET /api/installation/providers/:id/status` - Get provider installation status
- `GET /api/installation/providers/:id/commands` - Get manual installation commands
- `POST /api/installation/providers/:id/install` - Install provider via Helm
- `POST /api/installation/providers/:id/upgrade` - Upgrade provider
- `POST /api/installation/providers/:id/uninstall` - Uninstall provider

### Deployments
- `GET /api/deployments` - List all deployments
- `POST /api/deployments` - Create a new deployment
- `GET /api/deployments/:name` - Get deployment details
- `DELETE /api/deployments/:name` - Delete a deployment

### Models
- `GET /api/models` - Get model catalog

### Health
- `GET /api/health` - Health check
- `GET /api/cluster/status` - Kubernetes cluster status

## License

MIT
