# API Reference

Base URL: `http://localhost:3001/api`

## Health & Status

### GET /health
Health check endpoint.

**Response:**
```json
{ "status": "ok" }
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
      "minGpuMemory": "4GB"
    }
  ]
}
```

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
