# KubeFoundry Demo Automation - Implementation Plan

## Overview

This document outlines the implementation plan for an automated demo system that combines CLI-based terminal automation (to show "the problem") with Playwright-based UI automation (to show "the solution"), narrated by Azure OpenAI GPT-4o mini TTS.

---

## Prerequisites & Installation

### System Requirements

| Tool | Required | Status | Installation |
|------|----------|--------|--------------|
| **macOS** | Yes | ✅ Built-in | Used for `afplay` audio playback |
| **Bun** | Yes | ✅ v1.3.6+ | Already installed |
| **kubectl** | Yes | ✅ | Already installed (cluster access) |
| **helm** | Yes | ✅ | Already installed (runtime installation) |
| **ffmpeg** | Optional | ❌ | `brew install ffmpeg` (for video recording) |

### NPM Packages (installed in demo/)

```bash
# Navigate to demo directory and install
cd demo
bun install
```

The `demo/package.json` includes:

| Package | Version | Purpose |
|---------|---------|---------|
| `playwright` | ^1.40.0 | Browser automation for UI phase |
| `openai` | ^4.20.0 | Azure OpenAI TTS API client |
| `chalk` | ^5.3.0 | Terminal colors for CLI phase |

### Playwright Browser Setup

After installing packages, download Chromium:

```bash
cd demo
bun exec playwright install chromium
```

### Azure OpenAI TTS Setup

1. **Create Azure OpenAI resource** in Azure Portal
2. **Deploy a TTS model** (gpt-4o-mini-tts or similar)
3. **Set environment variables**:

```bash
# Add to ~/.zshrc or export before running demo
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
export AZURE_OPENAI_API_KEY="your-api-key"
export AZURE_OPENAI_TTS_DEPLOYMENT="gpt-4o-mini-tts"  # Your deployment name
```

### Quick Start Checklist

```bash
# 1. Install demo dependencies
cd /path/to/kube-foundry/demo
bun install
bun exec playwright install chromium

# 2. Set Azure OpenAI credentials
export AZURE_OPENAI_ENDPOINT="https://..."
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_TTS_DEPLOYMENT="..."

# 3. Start KubeFoundry (in another terminal)
cd /path/to/kube-foundry
bun run dev

# 4. Run the demo
cd demo
bun run start
```

---

## Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Output format | Pre-recorded video | Consistent, reusable, no live demo failures |
| Terminal style | Typewriter effect | Dramatic effect, shows tedious manual process |
| Audio timing | Smart | Short narrations sequential, long ones overlap |
| Browser visibility | Hidden during CLI | Dramatic reveal when KubeFoundry appears |
| Audio caching | Generate fresh each run | Always use latest script text |
| Error handling | Stop immediately | Fail fast, fix and restart |
| Cluster state | Clean slate | Install everything from scratch |
| TTS provider | Azure OpenAI GPT-4o mini | Enterprise, high quality |
| Voice | onyx | Deep, authoritative, professional |
| Demo model | Qwen/Qwen3-0.6B | Tiny, fast to load |
| Complex YAML | Real examples from KubeRay, Dynamo, KAITO | Authentic pain points |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        demo/run-demo.ts                             │
│                      (Main Orchestrator)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │   cli-phase.ts  │    │   ui-phase.ts   │    │  narration.ts   │ │
│  │                 │    │                 │    │                 │ │
│  │ • Typewriter    │    │ • Playwright    │    │ • Azure OpenAI  │ │
│  │ • kubectl cmds  │    │ • Browser auto  │    │ • TTS synthesis │ │
│  │ • Show YAML     │    │ • Click/type    │    │ • Audio playback│ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐                        │
│  │   script.ts     │    │   config.ts     │                        │
│  │                 │    │                 │                        │
│  │ • All narration │    │ • Timing params │                        │
│  │ • Demo text     │    │ • URLs, models  │                        │
│  │ • Phase markers │    │ • Credentials   │                        │
│  └─────────────────┘    └─────────────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     demo/assets/                                    │
├─────────────────────────────────────────────────────────────────────┤
│  • kuberay-rayservice.yaml      (Real KubeRay example)             │
│  • dynamo-deployment.yaml       (Real NVIDIA Dynamo example)       │
│  • kaito-workspace.yaml         (Real KAITO example)               │
│  • pain-points.md               (Annotated complexity notes)       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
demo/
├── run-demo.ts              # Main orchestrator - entry point
├── cli-phase.ts             # Terminal automation with typewriter effect
├── ui-phase.ts              # Playwright browser automation
├── narration.ts             # Azure OpenAI TTS integration
├── script.ts                # All narration text and demo script
├── config.ts                # Configuration (timing, URLs, credentials)
├── utils.ts                 # Shared utilities (pause, logging)
├── package.json             # Demo-specific dependencies
├── tsconfig.json            # TypeScript config for demo
├── README.md                # How to run the demo
└── assets/
    ├── kuberay-rayservice.yaml      # Real KubeRay RayService example
    ├── dynamo-deployment.yaml       # Real DynamoGraphDeployment example  
    ├── kaito-workspace.yaml         # Real KAITO Workspace example
    └── pain-points.md               # Annotated pain points for each YAML
```

---

## Phase 1: CLI Automation (The Problem)

### Purpose
Show the complexity of deploying LLMs on Kubernetes manually using real YAML examples from OSS projects.

### Flow

```
1. Terminal opens (clean state)
2. Narration: "Let me show you what deploying an LLM on Kubernetes looks like today..."
3. Show KubeRay RayService YAML (typewriter: cat kuberay-rayservice.yaml)
4. Narration: "This is a real KubeRay RayService configuration..."
   - Highlight: 150+ lines, nested serveConfigV2, rayClusterConfig
   - Pain point: Must understand Ray Serve + Kubernetes + GPU scheduling
5. Show NVIDIA Dynamo DynamoGraphDeployment YAML
6. Narration: "Or if you prefer NVIDIA Dynamo..."
   - Highlight: Multiple services, extraPodSpec, componentType
   - Pain point: Deep knowledge of Dynamo operator required
7. Show KAITO Workspace YAML
8. Narration: "Even the simpler KAITO Workspace requires..."
   - Highlight: instanceType, labelSelector, inference.preset
   - Pain point: Must know Azure VM SKUs, GPU memory requirements
9. Try to apply one (kubectl apply -f kaito-workspace.yaml)
10. Show pending pods (kubectl get pods -n kaito-workspace)
11. Show describe output revealing GPU scheduling issues
12. Narration: "And now we debug... This requires expertise in BOTH Kubernetes AND ML infrastructure."
13. Pause: "There has to be a better way..."
```

### Real YAML Examples to Include

#### 1. KubeRay RayService (kuberay-rayservice.yaml)

Based on real example from `ray-project/kuberay`:

```yaml
# Pain points annotated:
# - 150+ lines for a simple LLM deployment
# - Nested YAML-in-YAML (serveConfigV2 is a string containing YAML)
# - Must understand Ray Serve deployment graphs
# - rayClusterConfig requires deep Kubernetes knowledge
# - Resource limits need careful GPU planning
# - rayStartParams are Ray-specific, not intuitive

apiVersion: ray.io/v1
kind: RayService
metadata:
  name: llm-service
spec:
  serveConfigV2: |
    applications:
      - name: llm_app
        import_path: serve_llm:deployment
        route_prefix: /
        runtime_env:
          pip:
            - vllm>=0.4.0
            - transformers
            - torch
        deployments:
          - name: VLLMDeployment
            num_replicas: 1
            ray_actor_options:
              num_cpus: 4
              num_gpus: 1
              resources:
                accelerator_type_a100: 1
            user_config:
              model_id: "meta-llama/Llama-2-7b-chat-hf"
              max_model_len: 4096
              tensor_parallel_size: 1
              gpu_memory_utilization: 0.9
  rayClusterConfig:
    rayVersion: '2.52.0'
    headGroupSpec:
      rayStartParams:
        dashboard-host: '0.0.0.0'
        block: 'true'
      template:
        spec:
          containers:
          - name: ray-head
            image: rayproject/ray-ml:2.52.0-gpu
            resources:
              limits:
                cpu: "4"
                memory: "16Gi"
                nvidia.com/gpu: "1"
              requests:
                cpu: "4"
                memory: "16Gi"
                nvidia.com/gpu: "1"
            env:
            - name: HUGGING_FACE_HUB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: hf-token
                  key: token
            volumeMounts:
            - name: model-cache
              mountPath: /root/.cache/huggingface
          volumes:
          - name: model-cache
            persistentVolumeClaim:
              claimName: model-pvc
          nodeSelector:
            cloud.google.com/gke-accelerator: nvidia-tesla-a100
          tolerations:
          - key: nvidia.com/gpu
            operator: Exists
            effect: NoSchedule
    workerGroupSpecs:
    - replicas: 1
      minReplicas: 1
      maxReplicas: 4
      groupName: gpu-workers
      rayStartParams:
        block: 'true'
      template:
        spec:
          containers:
          - name: ray-worker
            image: rayproject/ray-ml:2.52.0-gpu
            resources:
              limits:
                cpu: "8"
                memory: "32Gi"
                nvidia.com/gpu: "1"
              requests:
                cpu: "8"
                memory: "32Gi"
                nvidia.com/gpu: "1"
          nodeSelector:
            cloud.google.com/gke-accelerator: nvidia-tesla-a100
          tolerations:
          - key: nvidia.com/gpu
            operator: Exists
            effect: NoSchedule
```

#### 2. NVIDIA Dynamo DynamoGraphDeployment (dynamo-deployment.yaml)

Based on real example from `ai-dynamo/dynamo`:

```yaml
# Pain points annotated:
# - Must understand Dynamo operator concepts (services, componentType)
# - extraPodSpec requires deep Kubernetes knowledge
# - Backend framework selection (vllm, sglang, trtllm)
# - HuggingFace token management via secrets
# - GPU resource configuration
# - Model-specific arguments vary by backend
# - Multi-service coordination (Frontend, Worker)

apiVersion: nvidia.com/v1alpha1
kind: DynamoGraphDeployment
metadata:
  name: vllm-agg
spec:
  backendFramework: vllm
  envs:
  - name: DYN_LOG
    value: "info"
  - name: DYN_DEPLOYMENT_CONFIG
    value: '{"Common": {"model": "Qwen/Qwen3-0.6B", "block-size": 64, "max-model-len": 16384}}'
  services:
    Frontend:
      dynamoNamespace: vllm-agg
      componentType: frontend
      replicas: 1
      extraPodSpec:
        mainContainer:
          image: nvcr.io/nvidia/ai-dynamo/vllm-runtime:0.7.1
          workingDir: /workspace/examples/backends/vllm
          args:
            - python3 -m dynamo.frontend --router-mode kv --http-port 8000
          resources:
            requests:
              cpu: "4"
              memory: "8Gi"
            limits:
              cpu: "4"
              memory: "8Gi"
    VllmDecodeWorker:
      dynamoNamespace: vllm-agg
      componentType: worker
      replicas: 1
      envFromSecret: hf-token-secret
      resources:
        limits:
          gpu: "1"
        requests:
          gpu: "1"
      extraPodSpec:
        affinity:
          nodeAffinity:
            requiredDuringSchedulingIgnoredDuringExecution:
              nodeSelectorTerms:
                - matchExpressions:
                    - key: node.kubernetes.io/instance-type
                      operator: In
                      values:
                        - Standard_NC24ads_A100_v4
        mainContainer:
          image: nvcr.io/nvidia/ai-dynamo/vllm-runtime:0.7.1
          workingDir: /workspace/examples/backends/vllm
          command:
            - /bin/sh
            - -c
          args:
            - python3 -m dynamo.vllm --model Qwen/Qwen3-0.6B --tensor-parallel-size 1 --max-model-len 16384
          startupProbe:
            httpGet:
              path: /health
              port: 9090
            initialDelaySeconds: 120
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 60
          livenessProbe:
            httpGet:
              path: /health
              port: 9090
            periodSeconds: 30
            timeoutSeconds: 10
            failureThreshold: 3
          resources:
            requests:
              cpu: "10"
              memory: "40Gi"
            limits:
              cpu: "10"
              memory: "40Gi"
```

#### 3. KAITO Workspace (kaito-workspace.yaml)

Based on real example from `kaito-project/kaito`:

```yaml
# Pain points annotated:
# - Must know Azure VM SKU naming (Standard_NC24ads_A100_v4)
# - Must understand GPU memory requirements per model
# - labelSelector requires pre-existing node labels
# - No visibility into whether cluster can handle the model
# - Preset names must be exact (llama-3.1-8b-instruct)
# - Runtime selection via annotation (not obvious)
# - ConfigMap for custom inference params is separate resource

apiVersion: v1
kind: ConfigMap
metadata:
  namespace: kaito-workspace
  name: inference-config
data:
  inference_config.yaml: |
    max_probe_steps: 6
    vllm:
      gpu-memory-utilization: 0.95
      tensor-parallel-size: 1
      max-model-len: 131072
      swap-space: 4
      cpu-offload-gb: 0
---
apiVersion: kaito.sh/v1beta1
kind: Workspace
metadata:
  name: workspace-llama-3-1-8b
  namespace: kaito-workspace
  annotations:
    kaito.sh/runtime: "vllm"  # Not obvious this is needed
resource:
  count: 1
  instanceType: "Standard_NC24ads_A100_v4"  # Must know exact Azure SKU
  labelSelector:
    matchLabels:
      apps: llama-inference  # Must pre-label nodes
inference:
  preset:
    name: "llama-3.1-8b-instruct"  # Exact preset name required
  config: inference-config  # Reference to ConfigMap above
  adapters:
    - source:
        name: "my-lora-adapter"
        image: "myregistry/lora:v1"  # Must build and push adapter image
      strength: "0.2"
---
apiVersion: v1
kind: Secret
metadata:
  name: hf-token-secret
  namespace: kaito-workspace
type: Opaque
stringData:
  HF_TOKEN: "hf_xxxxxxxxxxxxxxxxxxxxx"  # Must create manually
```

---

## Phase 2: UI Automation (The Solution)

### Purpose
Demonstrate how KubeFoundry simplifies the same workflow to clicks and visual feedback.

### Required data-testid Attributes

These need to be added to React components:

```typescript
// Navigation
data-testid="nav-models"
data-testid="nav-deployments"
data-testid="nav-installation"
data-testid="nav-settings"

// Models Page
data-testid="models-curated-tab"
data-testid="models-hf-search-tab"
data-testid="model-card-{modelId}"
data-testid="model-deploy-button-{modelId}"
data-testid="model-search-input"
data-testid="gpu-fit-indicator-{modelId}"

// Deploy Page
data-testid="deploy-runtime-select"
data-testid="deploy-runtime-option-{runtimeId}"
data-testid="deploy-engine-select"
data-testid="deploy-name-input"
data-testid="deploy-replicas-input"
data-testid="deploy-submit-button"

// Deployments Page
data-testid="deployment-card-{name}"
data-testid="deployment-status-{name}"
data-testid="deployment-delete-{name}"
data-testid="deployment-logs-{name}"

// Installation Page
data-testid="runtime-card-{runtimeId}"
data-testid="runtime-install-{runtimeId}"
data-testid="runtime-status-{runtimeId}"

// Settings Page
data-testid="hf-signin-button"
data-testid="hf-status"
```

### Flow

```
1. Narration: "Now let me show you KubeFoundry..."
2. Launch browser (http://localhost:3001)
3. Narration: "A single binary that provides a modern UI for deploying LLMs on Kubernetes."
4. Show dashboard briefly
5. Navigate to Installation page
6. Narration: "First, we install a runtime. One click."
7. Click Install on KAITO (or show already installed)
8. Wait for installation to complete
9. Navigate to Models page
10. Narration: "Now let's find a model. Notice the GPU fit indicators..."
11. Show curated models with GPU capacity warnings
12. Search HuggingFace for "Qwen3"
13. Narration: "KubeFoundry queries your cluster's actual GPU capacity..."
14. Click Deploy on Qwen/Qwen3-0.6B
15. Narration: "Configuring is simple. Select runtime, keep defaults, deploy."
16. Select KAITO runtime
17. Click Create Deployment
18. Navigate to Deployments page
19. Narration: "Watch the status update in real-time..."
20. Show deployment progressing to Running
21. Narration: "That's it. No YAML, no kubectl, no manual secrets."
22. Show final state
23. Narration: "And the model exposes an OpenAI-compatible API."
```

---

## Phase 3: Narration System

### Azure OpenAI TTS Integration

```typescript
// demo/narration.ts
import OpenAI from 'openai';
import { $ } from 'bun';

const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_TTS_DEPLOYMENT}`,
  defaultQuery: { 'api-version': '2024-05-01-preview' },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
});

export async function narrate(text: string): Promise<void> {
  const response = await client.audio.speech.create({
    model: 'gpt-4o-mini-tts',  // or 'tts-1-hd' depending on deployment
    voice: 'onyx',
    input: text,
    speed: 1.0,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const tempFile = `/tmp/narration-${Date.now()}.mp3`;
  await Bun.write(tempFile, buffer);
  
  // Play audio (macOS)
  await $`afplay ${tempFile}`;
  
  // Cleanup
  await $`rm ${tempFile}`;
}
```

### Narration Script (script.ts)

```typescript
export const NARRATION = {
  // Phase 1: The Problem
  intro: "Let me show you what deploying an LLM on Kubernetes typically looks like today.",
  
  kuberay: "This is a real KubeRay RayService configuration. Over 100 lines of YAML. " +
    "Notice the nested YAML-in-YAML for Ray Serve configs. " +
    "You need to understand Ray Serve, Kubernetes, GPU scheduling, and model serving all at once.",
  
  dynamo: "Or if you prefer NVIDIA Dynamo... " +
    "Multiple services to coordinate, extraPodSpec configurations, and backend framework selection. " +
    "Deep knowledge of the Dynamo operator is required.",
  
  kaito: "Even the simpler KAITO Workspace requires knowing Azure VM SKU naming, " +
    "GPU memory requirements per model, and proper node labeling. " +
    "There's no visibility into whether your cluster can actually handle the model.",
  
  apply_fail: "Let's try to apply this. Now we wait...",
  
  pending: "The pod is pending. GPU constraints. Now we need to dig into kubectl describe, " +
    "check events, verify node labels, and understand resource scheduling. " +
    "This requires expertise in both Kubernetes AND ML infrastructure.",
  
  transition: "There has to be a better way...",
  
  // Phase 2: The Solution
  kubefoundry_intro: "This is KubeFoundry. A single binary that provides a modern web UI " +
    "for deploying and managing LLMs on any Kubernetes cluster.",
  
  installation: "First, we install a runtime. One click. " +
    "KubeFoundry runs Helm under the hood and shows real-time progress.",
  
  models: "Now let's find a model. Notice the GPU fit indicators. " +
    "Green means it fits your cluster. Yellow means it's tight. Red means it exceeds capacity. " +
    "KubeFoundry queries your cluster's actual GPU resources.",
  
  deploy: "Configuring is simple. Select your runtime, keep the defaults, and deploy. " +
    "No YAML, no kubectl, no manual secret creation.",
  
  monitoring: "Watch the status update in real-time. " +
    "If something can't be scheduled, we show exactly why and provide actionable guidance.",
  
  conclusion: "That's it. From complex YAML to running inference in a few clicks. " +
    "And every deployment exposes an OpenAI-compatible API, so your applications work immediately.",
  
  // Closing
  summary: "Let's recap. Unified interface for multiple runtimes. One-click installation. " +
    "Smart model discovery with GPU capacity awareness. No-code deployment. " +
    "CPU-capable inference with KAITO. OpenAI-compatible APIs. " +
    "All vendor-neutral, working on any Kubernetes including AKS.",
  
  call_to_action: "We're looking to collect feedback on the UX, " +
    "understand pain points from operators hosting inference, " +
    "and align on open-source strategy for consistent experience across Foundry and self-managed AKS.",
};
```

---

## Implementation Tasks

### Task 1: Create Demo Infrastructure

1. Create `demo/` directory structure
2. Create `demo/package.json` with dependencies:
   - `playwright`
   - `openai` (for Azure OpenAI TTS)
3. Create `demo/tsconfig.json`
4. Create `demo/README.md` with instructions

### Task 2: Create Real YAML Examples

1. Create `demo/assets/kuberay-rayservice.yaml` with annotations
2. Create `demo/assets/dynamo-deployment.yaml` with annotations
3. Create `demo/assets/kaito-workspace.yaml` with annotations
4. Create `demo/assets/pain-points.md` documenting all pain points

### Task 3: Implement CLI Automation

1. Create `demo/cli-phase.ts`:
   - Typewriter effect function (configurable speed)
   - Execute shell commands with output capture
   - Syntax highlighting for YAML (optional)
   - Simulated kubectl output for pending pods
2. Create `demo/utils.ts`:
   - `pause(ms)` function
   - `log(message)` with timestamps
   - Color utilities for terminal output

### Task 4: Implement TTS Narration

1. Create `demo/narration.ts`:
   - Azure OpenAI client initialization
   - `narrate(text)` function with audio playback
   - Error handling for API failures
2. Create `demo/config.ts`:
   - Environment variable loading
   - Timing configurations
   - URLs and model selections
3. Create `demo/script.ts`:
   - All narration text organized by phase
   - Easy to edit and maintain

### Task 5: Add data-testid Attributes

Add to React components:
1. `frontend/src/components/Sidebar.tsx` - Navigation items
2. `frontend/src/pages/ModelsPage.tsx` - Model cards, tabs, search
3. `frontend/src/pages/DeployPage.tsx` - Form fields, submit button
4. `frontend/src/pages/DeploymentsPage.tsx` - Deployment cards, actions
5. `frontend/src/pages/InstallationPage.tsx` - Runtime cards, install buttons
6. `frontend/src/pages/SettingsPage.tsx` - HuggingFace section

### Task 6: Implement UI Automation

1. Create `demo/ui-phase.ts`:
   - Playwright browser launch (headed, slowMo)
   - Page navigation helpers
   - Click/type with appropriate delays
   - Wait for elements/conditions
   - Screenshot capture (optional)
2. Implement each UI step from the flow

### Task 7: Create Main Orchestrator

1. Create `demo/run-demo.ts`:
   - Parse command-line arguments
   - Initialize all systems
   - Execute Phase 1 (CLI)
   - Transition to Phase 2 (UI)
   - Handle errors (stop immediately)
   - Cleanup on exit

### Task 8: Add Makefile Targets

Add to root `Makefile`:
```makefile
# Demo automation
.PHONY: demo demo-setup demo-cli demo-ui

demo: demo-setup  ## Run full automated demo
	cd demo && bun run start

demo-setup:  ## Install demo dependencies
	cd demo && bun install

demo-cli:  ## Run CLI phase only
	cd demo && bun run cli-only

demo-ui:  ## Run UI phase only
	cd demo && bun run ui-only
```

---

## Environment Variables Required

```bash
# Azure OpenAI TTS
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_TTS_DEPLOYMENT=gpt-4o-mini-tts  # or your deployment name

# Optional
DEMO_KUBEFOUNDRY_URL=http://localhost:3001
DEMO_MODEL=Qwen/Qwen3-0.6B
DEMO_RUNTIME=kaito
DEMO_TYPEWRITER_SPEED=50  # ms per character
```

---

## Success Criteria

1. **CLI Phase**: Successfully displays all three YAML examples with typewriter effect
2. **TTS**: Azure OpenAI generates clear, professional narration
3. **Audio Sync**: Narration completes before/during relevant visuals
4. **UI Phase**: Playwright successfully navigates all UI elements
5. **End-to-End**: Full demo runs without errors from start to finish
6. **Video Quality**: Screen recording produces clear 1080p output
7. **Timing**: Total demo runs in 15-20 minutes as planned

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Azure OpenAI rate limits | Add retry logic with exponential backoff |
| Playwright element not found | Use proper wait conditions, add fallback selectors |
| Cluster not ready | Pre-check cluster state before demo |
| Audio playback fails | Fall back to text display if TTS unavailable |
| Demo takes too long | Add timeout checks, optimize wait times |

---

## Timeline Estimate

| Task | Duration |
|------|----------|
| Task 1: Demo infrastructure | 1 hour |
| Task 2: YAML examples | 1 hour |
| Task 3: CLI automation | 2 hours |
| Task 4: TTS narration | 1 hour |
| Task 5: data-testid attributes | 2 hours |
| Task 6: UI automation | 3 hours |
| Task 7: Main orchestrator | 1 hour |
| Task 8: Makefile targets | 0.5 hour |
| Testing & debugging | 2 hours |
| **Total** | **~13.5 hours** |

---

## Next Steps

1. Review and approve this plan
2. Create demo directory structure (Task 1)
3. Create YAML examples with pain point annotations (Task 2)
4. Implement incrementally, testing each phase independently
5. Record sample demo for feedback
6. Iterate based on feedback
