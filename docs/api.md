# API Reference

Base URL: `http://localhost:3001/api`

## Health & Status

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### GET /health/version
Get build version information.

**Response:**
```json
{
  "version": "v1.0.0",
  "buildTime": "2025-01-15T10:00:00.000Z",
  "gitCommit": "abc1234"
}
```

### GET /cluster/status
Get Kubernetes cluster connection status.

**Response:**
```json
{
  "connected": true,
  "namespace": "kubefoundry",
  "providerId": "dynamo",
  "providerInstalled": true
}
```

## Settings

### GET /settings
Get current settings and available providers.

**Response:**
```json
{
  "activeProviderId": "dynamo",
  "providers": [
    {
      "id": "dynamo",
      "name": "NVIDIA Dynamo",
      "description": "GPU-accelerated inference with disaggregated serving"
    }
  ]
}
```

### PUT /settings
Update application settings.

**Request Body:**
```json
{
  "activeProviderId": "dynamo"
}
```

## Installation

### GET /installation/helm/status
Check if Helm CLI is available.

**Response:**
```json
{
  "available": true,
  "version": "v3.14.0"
}
```

### GET /installation/providers/:id/status
Get provider installation status.

**Response:**
```json
{
  "installed": true,
  "crdInstalled": true,
  "operatorInstalled": true,
  "version": "0.1.0"
}
```

### GET /installation/providers/:id/commands
Get manual installation commands for a provider.

**Response:**
```json
{
  "commands": [
    "helm repo add nvidia-dynamo https://nvidia.github.io/dynamo",
    "helm repo update",
    "helm install dynamo-operator nvidia-dynamo/dynamo --namespace kubefoundry --create-namespace"
  ]
}
```

### POST /installation/providers/:id/install
Install a provider via Helm.

**Response:**
```json
{
  "success": true,
  "message": "Provider installed successfully"
}
```

### POST /installation/providers/:id/upgrade
Upgrade an installed provider.

### POST /installation/providers/:id/uninstall
Uninstall a provider.

### GET /installation/gpu-operator/status
Check NVIDIA GPU Operator installation status and GPU availability.

**Response:**
```json
{
  "installed": true,
  "crdFound": true,
  "operatorRunning": true,
  "gpusAvailable": true,
  "totalGPUs": 4,
  "gpuNodes": ["node-1", "node-2"],
  "message": "GPUs enabled: 4 GPU(s) on 2 node(s)",
  "helmCommands": [
    "helm repo add nvidia https://helm.ngc.nvidia.com/nvidia",
    "helm repo update",
    "helm install gpu-operator nvidia/gpu-operator --namespace gpu-operator --create-namespace"
  ]
}
```

### GET /installation/gpu-capacity
Get detailed GPU capacity information for the cluster.

**Response:**
```json
{
  "totalGpus": 4,
  "allocatedGpus": 1,
  "availableGpus": 3,
  "maxContiguousAvailable": 2,
  "totalMemoryGb": 80,
  "nodes": [
    {
      "nodeName": "gpu-node-1",
      "totalGpus": 2,
      "allocatedGpus": 1,
      "availableGpus": 1
    },
    {
      "nodeName": "gpu-node-2",
      "totalGpus": 2,
      "allocatedGpus": 0,
      "availableGpus": 2
    }
  ]
}
```

**Notes:**
- `totalMemoryGb` is detected from `nvidia.com/gpu.memory` node label (MiB converted to GB)
- Falls back to detecting memory from `nvidia.com/gpu.product` label if not available
- Used by frontend to show GPU fit indicators for HuggingFace search results
```

### POST /installation/gpu-operator/install
Install the NVIDIA GPU Operator via Helm.

**Response:**
```json
{
  "success": true,
  "message": "NVIDIA GPU Operator installed successfully",
  "status": {
    "installed": true,
    "crdFound": true,
    "operatorRunning": true,
    "gpusAvailable": false,
    "totalGPUs": 0,
    "gpuNodes": [],
    "message": "GPU Operator installed but no GPUs detected on nodes"
  }
}
```

## Models

### GET /models
Get the curated model catalog.

**Query Parameters:**
- `search` (optional) - Filter by name
- `engine` (optional) - Filter by supported engine

**Response:**
```json
{
  "models": [
    {
      "id": "Qwen/Qwen3-0.6B",
      "name": "Qwen3 0.6B",
      "description": "Small, efficient model ideal for development",
      "size": "0.6B",
      "task": "text-generation",
      "contextLength": 32768,
      "supportedEngines": ["vllm", "sglang", "trtllm"],
      "minGpuMemory": "4GB",
      "gated": false
    },
    {
      "id": "meta-llama/Llama-3.2-1B-Instruct",
      "name": "Llama 3.2 1B Instruct",
      "description": "Compact Llama model optimized for instruction following",
      "size": "1B",
      "task": "chat",
      "contextLength": 131072,
      "supportedEngines": ["vllm", "sglang", "trtllm"],
      "minGpuMemory": "4GB",
      "gated": true
    }
  ]
}
```

**Model Fields:**
- `id` - HuggingFace model ID (e.g., "Qwen/Qwen3-0.6B")
- `name` - Display name
- `description` - Brief description
- `size` - Parameter count (e.g., "0.6B")
- `task` - Model task type ("text-generation", "chat", "fill-mask")
- `contextLength` - Maximum context length
- `supportedEngines` - Compatible inference engines
- `minGpuMemory` - Minimum GPU memory required
- `minGpus` - Minimum number of GPUs required (default: 1)
- `gated` - Whether model requires HuggingFace authentication (true for Llama, Mistral, etc.)
- `estimatedGpuMemory` - Estimated GPU memory from HF search (e.g., "16GB")
- `estimatedGpuMemoryGb` - Numeric GPU memory for capacity comparisons
- `parameterCount` - Parameter count from safetensors metadata
- `fromHfSearch` - True if model came from HuggingFace search

### GET /models/search
Search HuggingFace Hub for compatible models.

**Query Parameters:**
- `q` (required) - Search query
- `limit` (optional) - Number of results (default: 20, max: 100)
- `offset` (optional) - Pagination offset

**Headers:**
- `Authorization: Bearer <hf_token>` (optional) - For accessing gated models

**Response:**
```json
{
  "models": [
    {
      "id": "meta-llama/Llama-3.1-8B-Instruct",
      "name": "Llama-3.1-8B-Instruct",
      "author": "meta-llama",
      "downloads": 1500000,
      "likes": 2500,
      "pipelineTag": "text-generation",
      "gated": true,
      "supportedEngines": ["vllm", "sglang", "trtllm"],
      "estimatedGpuMemory": "19.2GB",
      "estimatedGpuMemoryGb": 19.2,
      "parameterCount": 8000000000
    }
  ],
  "total": 150,
  "offset": 0,
  "limit": 20
}
```

**Notes:**
- Only returns models with `text-generation` pipeline tag
- Filters out models with incompatible architectures
- GPU memory estimated as: `(params × 2GB) × 1.2` for FP16 inference
- Results cached client-side for 60 seconds

## Deployments

### GET /deployments
List all deployments for the active provider.

**Query Parameters:**
- `namespace` (optional) - Filter by namespace

**Response:**
```json
{
  "deployments": [
    {
      "name": "qwen-deployment",
      "namespace": "kubefoundry",
      "modelId": "Qwen/Qwen3-0.6B",
      "engine": "vllm",
      "phase": "Running",
      "replicas": { "desired": 1, "ready": 1, "available": 1 },
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### POST /deployments
Create a new deployment.

**Request Body:**
```json
{
  "name": "qwen-deployment",
  "namespace": "kubefoundry",
  "modelId": "Qwen/Qwen3-0.6B",
  "engine": "vllm",
  "mode": "aggregated",
  "replicas": 1,
  "hfTokenSecret": "hf-token-secret",
  "enforceEager": true,
  "enablePrefixCaching": false,
  "trustRemoteCode": false
}
```

**Response:**
```json
{
  "success": true,
  "deployment": { ... }
}
```

### GET /deployments/:name
Get deployment details including pod status.

**Query Parameters:**
- `namespace` (required)

**Response:**
```json
{
  "name": "qwen-deployment",
  "namespace": "kubefoundry",
  "modelId": "Qwen/Qwen3-0.6B",
  "engine": "vllm",
  "phase": "Running",
  "replicas": { "desired": 1, "ready": 1, "available": 1 },
  "pods": [
    {
      "name": "qwen-deployment-worker-0",
      "phase": "Running",
      "ready": true,
      "restarts": 0
    }
  ],
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### DELETE /deployments/:name
Delete a deployment.

**Query Parameters:**
- `namespace` (required)

**Response:**
```json
{
  "success": true,
  "message": "Deployment deleted"
}
```

## HuggingFace OAuth

KubeFoundry supports HuggingFace OAuth with PKCE for secure token acquisition. This enables access to gated models (e.g., Llama, Mistral) without manually managing tokens.

### GET /oauth/huggingface/config
Get OAuth configuration for initiating HuggingFace sign-in.

**Response:**
```json
{
  "clientId": "e05817a1-7053-4b9e-b292-29cd219fccf8",
  "authorizeUrl": "https://huggingface.co/oauth/authorize",
  "scopes": ["openid", "profile", "read-repos"]
}
```

### POST /oauth/huggingface/token
Exchange OAuth authorization code for access token using PKCE.

**Request Body:**
```json
{
  "code": "authorization_code_from_callback",
  "codeVerifier": "pkce_code_verifier_min_43_chars",
  "redirectUri": "http://localhost:3000/oauth/callback/huggingface"
}
```

**Response:**
```json
{
  "accessToken": "hf_xxxxx",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "scope": "openid profile read-repos",
  "user": {
    "id": "user123",
    "name": "username",
    "fullname": "Full Name",
    "email": "user@example.com",
    "avatarUrl": "https://huggingface.co/avatars/xxx.png"
  }
}
```

## HuggingFace Secrets

Manages HuggingFace tokens as Kubernetes secrets across provider namespaces.

### GET /secrets/huggingface/status
Get the status of HuggingFace token secrets across namespaces.

**Response:**
```json
{
  "configured": true,
  "namespaces": [
    { "name": "dynamo-system", "exists": true },
    { "name": "kuberay-system", "exists": true },
    { "name": "default", "exists": true }
  ],
  "user": {
    "id": "user123",
    "name": "username",
    "fullname": "Full Name"
  }
}
```

### POST /secrets/huggingface
Save HuggingFace access token as Kubernetes secrets in all required namespaces.

**Request Body:**
```json
{
  "accessToken": "hf_xxxxx"
}
```

**Response:**
```json
{
  "success": true,
  "message": "HuggingFace token saved successfully",
  "user": {
    "id": "user123",
    "name": "username",
    "fullname": "Full Name"
  },
  "results": [
    { "namespace": "dynamo-system", "success": true },
    { "namespace": "kuberay-system", "success": true },
    { "namespace": "default", "success": true }
  ]
}
```

### DELETE /secrets/huggingface
Delete HuggingFace token secrets from all namespaces.

**Response:**
```json
{
  "success": true,
  "message": "HuggingFace secrets deleted successfully",
  "results": [
    { "namespace": "dynamo-system", "success": true },
    { "namespace": "kuberay-system", "success": true },
    { "namespace": "default", "success": true }
  ]
}
```

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

Common error codes:
- `CLUSTER_UNAVAILABLE` - Cannot connect to Kubernetes
- `PROVIDER_NOT_INSTALLED` - Active provider not installed
- `VALIDATION_ERROR` - Invalid request body
- `NOT_FOUND` - Resource not found
