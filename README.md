# KubeFoundry

A web-based platform for deploying and managing large language models on Kubernetes with support for multiple inference providers.

## Features

- 📦 **Model Catalog**: Browse curated models or search the entire HuggingFace Hub
- 🔍 **HuggingFace Search**: Find and deploy any compatible model from HuggingFace
- ⚡ **Smart Filtering**: Automatically filters models by architecture compatibility (vLLM, SGLang, TRT-LLM)
- 📊 **GPU Capacity Warnings**: Visual indicators showing if models fit your cluster's GPU memory
- 🚀 **Easy Deployment**: Configure and deploy models with a few clicks
- 📈 **Dashboard**: Monitor deployment status with auto-refresh
- 🔌 **Multi-Provider Support**: Extensible architecture supporting multiple inference runtimes
- 🔧 **Multiple Engines**: Support for vLLM, SGLang, and TensorRT-LLM (via NVIDIA Dynamo)
- 🎨 **Dark Theme**: Modern dark UI with provider-specific accents
- 📥 **Installation Management**: Install providers via Helm with UI or CLI commands

## Supported Providers

| Provider | Status | Description |
|----------|--------|-------------|
| **NVIDIA Dynamo** | ✅ Available | GPU-accelerated inference with disaggregated serving |
| **KubeRay** | ✅ Available | Ray-based distributed inference |

## Prerequisites

- Access to a Kubernetes cluster with kubectl configured
- Helm CLI installed
- GPU nodes with NVIDIA drivers (for GPU-accelerated inference)
- HuggingFace account (for accessing gated models like Llama)

## Quick Start

### 1. Connect HuggingFace Account

KubeFoundry supports automatic HuggingFace token setup via OAuth. Navigate to **Settings** and click **"Sign in with Hugging Face"** to securely connect your account. The token will be automatically distributed to all required namespaces.

> **Note:** Both NVIDIA Dynamo and KubeRay providers require a HuggingFace token to access gated models.

### 2. Install a Provider

Navigate to the **Installation** page in the UI, or install manually via CLI:

```bash
# Add NVIDIA Dynamo Helm repo
helm repo add nvidia-dynamo https://nvidia.github.io/dynamo
helm repo update

# Install Dynamo operator
helm install dynamo-operator nvidia-dynamo/dynamo \
  --namespace dynamo-system --create-namespace
```

### 3. Deploy a Model

1. **Browse Models**: View the curated catalog or search HuggingFace for any compatible model
2. **Check GPU Fit**: Review GPU memory estimates and fit indicators (✓ fits, ⚠ tight, ✗ exceeds)
3. **Select & Configure**: Choose a model and configure deployment options (engine, replicas, etc.)
4. **Deploy**: Click deploy to create the deployment in your Kubernetes cluster
5. **Monitor**: View deployment status in the dashboard

### 4. Access Your Model

Once the deployment is running:

```bash
# Port-forward to the service
kubectl port-forward svc/<deployment-name>-frontend 8000:8000 -n dynamo-system

# Test the model
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen3-0.6B",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Supported Models

KubeFoundry supports **any HuggingFace model** with a compatible architecture. Browse the curated catalog for tested models, or search HuggingFace Hub for thousands more.

### Curated Models

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

### Supported Architectures

When searching HuggingFace, models are filtered by architecture compatibility:

| Engine | Supported Architectures |
|--------|------------------------|
| vLLM | LlamaForCausalLM, MistralForCausalLM, Qwen2ForCausalLM, GPT2LMHeadModel, and 40+ more |
| SGLang | LlamaForCausalLM, MistralForCausalLM, Qwen2ForCausalLM, and 20+ more |
| TensorRT-LLM | LlamaForCausalLM, GPTForCausalLM, MistralForCausalLM, and 15+ more |

## Configuration

Settings are managed through the **Settings** page in the UI:

- **Active Provider**: Select which inference provider to use
- **Default Namespace**: Kubernetes namespace for deployments
- **HuggingFace Token**: Connect via OAuth or manually configure the K8s secret name
- **GPU Operator**: Install NVIDIA GPU Operator for GPU support

## Authentication (Optional)

KubeFoundry supports optional authentication using your existing kubeconfig OIDC credentials.

### Enable Authentication

```bash
AUTH_ENABLED=true ./kubefoundry
```

### Login

```bash
# Login using current kubeconfig context
kubefoundry login

# Login to a specific server
kubefoundry login --server https://kubefoundry.example.com

# Use a specific kubeconfig context
kubefoundry login --context my-aks-cluster
```

The login command extracts your OIDC token from kubeconfig and opens your browser automatically.

## Troubleshooting

### Provider not detected as installed
- Check CRD exists: `kubectl get crd dynamographdeployments.dynamo.nvidia.com`
- Check operator deployment: `kubectl get deployments -n dynamo-system`

### Deployment stuck in pending
- Check pod status: `kubectl get pods -n dynamo-system`
- Check events: `kubectl describe pod <pod-name> -n dynamo-system`
- Verify GPU resources are available

### Can't access the model endpoint
- Ensure the deployment status shows "Running"
- Verify port-forward is active
- Check service exists: `kubectl get svc -n dynamo-system`

## Documentation

- [Architecture Overview](docs/architecture.md)
- [API Reference](docs/api.md)
- [Development Guide](docs/development.md)
- [Contributing](CONTRIBUTING.md)

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
