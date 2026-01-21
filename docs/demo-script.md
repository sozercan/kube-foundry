# KubeFoundry Demo Script

## Demo Overview

**Duration:** 15-20 minutes  
**Audience:** Microsoft Foundry stakeholders, partner teams, and Kubernetes operators  
**Purpose:** Showcase how KubeFoundry simplifies ML inference on Kubernetes using emerging OSS AI frameworks

---

## Opening (2 minutes)

### Introduction

> "Today I'm going to show you **KubeFoundry**, a proof-of-concept that demonstrates how we can leverage emerging Kubernetes open-source AI frameworks to enable customers to run inference workloads on AKS—without requiring deep expertise in GPUs or LLMs."

### Key Goals to Highlight

1. **Showcase OSS AI Frameworks** – Demonstrate integration with NVIDIA Dynamo, KubeRay, and KAITO
2. **Enable Microsoft Foundry** – Show how Foundry can build on these tools while letting customers bring their own compute
3. **Simplify ML on Kubernetes** – Transform complex GPU/LLM deployments into one-click operations
4. **Gather Feedback** – Collect pain points from users and partner teams
5. **Vendor-Neutral Approach** – Align on OSS technology for consistent experience across Foundry AKS and self-managed AKS

---

## Demo Flow

### Part 1: The Problem (2 minutes)

> "Let me start by showing you what deploying an LLM on Kubernetes typically looks like today..."

**Talk through the pain points:**

- Writing complex YAML manifests for inference runtimes
- Understanding GPU scheduling, resource requests, and node selectors
- Configuring tensor parallelism, KV cache, batch sizes
- Managing HuggingFace authentication and model access
- Debugging pending pods due to GPU constraints
- Each inference runtime (vLLM, Ray, TensorRT) has different APIs

> "This requires operators to be experts in both Kubernetes AND ML infrastructure. **KubeFoundry aims to change that.**"

---

### Part 2: KubeFoundry Introduction (2 minutes)

**Launch KubeFoundry:**
```bash
./kubefoundry
```

**Open browser to http://localhost:3001**

> "KubeFoundry is a single binary that provides a modern web UI for deploying and managing LLMs on any Kubernetes cluster."

**Highlight the dashboard:**
- Clean, dark-themed UI
- Cluster connection status in header
- Navigation: Models, Deployments, Installation, Settings

---

### Part 3: Runtime Installation (3 minutes)

**Navigate to Installation page**

> "The first thing operators need to do is install an inference runtime. KubeFoundry supports three major OSS projects:"

| Runtime | Description | Key Use Case |
|---------|-------------|--------------|
| **NVIDIA Dynamo** | High-performance GPU inference with KV-cache routing | Maximum throughput |
| **KubeRay** | Ray-based distributed serving with autoscaling | Scale-out inference |
| **KAITO** | CPU/GPU flexible inference with vLLM and llama.cpp | Cost optimization, CPU-only clusters |

**Demo: Install KAITO (or show already installed)**

> "Installing a runtime is one-click. KubeFoundry runs Helm under the hood and shows real-time progress."

- Click **Install** next to KAITO
- Show installation progress
- Show status change to "Installed ✓"

> "Notice we can also install the NVIDIA GPU Operator from here—making it easy to set up GPU nodes from scratch."

---

### Part 4: HuggingFace Integration (2 minutes)

**Navigate to Settings → HuggingFace**

> "Many models on HuggingFace are gated—like Llama. KubeFoundry provides OAuth integration for seamless authentication."

**Demo: Sign in with HuggingFace**

- Click "Sign in with Hugging Face"
- Complete OAuth flow
- Show connected status

> "The token is automatically distributed to all relevant namespaces, so deployments can pull gated models without manual secret management."

---

### Part 5: Model Discovery & GPU Capacity (3 minutes)

**Navigate to Models page**

> "Here's where we address a major pain point: **which models can I actually run on my cluster?**"

**Show the Curated tab:**
- Pre-validated models with known configurations
- GPU memory requirements clearly displayed

**Switch to HuggingFace Search tab:**
- Search for "Qwen3" or "Llama"
- Show GPU fit indicators:
  - ✓ (green) = Model fits your cluster
  - ⚠ (yellow) = Tight fit, may work
  - ✗ (red) = Exceeds available GPU memory

> "KubeFoundry queries your cluster's actual GPU capacity and estimates memory requirements based on model parameters. Operators instantly know what's deployable."

**If cluster has autoscaler:**
> "For AKS clusters with cluster autoscaler, we detect that too and show whether scaling could accommodate larger models."

---

### Part 6: One-Click Deployment (3 minutes)

**Select a model (e.g., Qwen3-0.6B or Phi-3-mini)**

> "Let's deploy a model. Watch how simple this is."

**Click Deploy button**

**Show deployment configuration:**
- **Runtime Selection**: Choose between installed runtimes
- **Engine Selection** (for Dynamo/KubeRay): vLLM, SGLang, TensorRT-LLM
- **KAITO Modes**: Pre-made GGUF, HuggingFace GGUF, or vLLM

> "For KAITO, operators can choose CPU inference with quantized GGUF models—no GPU required. This is huge for cost optimization."

**Configure and deploy:**
- Select runtime (e.g., KAITO with vLLM mode)
- Keep defaults for replicas, GPU config
- Click **Create Deployment**

> "That's it. No YAML, no kubectl, no manual secret creation."

---

### Part 7: Deployment Monitoring (2 minutes)

**Navigate to Deployments page**

> "Now let's see what's happening with our deployment."

**Show the deployment list:**
- Status: Pending → Deploying → Running
- Runtime badge showing which framework is in use
- Replica counts and age

**Click into deployment details:**
- Pod-level status and node placement
- Container logs streaming in real-time
- Restart counts and events

> "If a pod can't be scheduled—say, due to GPU constraints—we show the exact reason and provide actionable guidance."

**If metrics available (in-cluster):**
> "We can also show Prometheus metrics directly from the inference runtime—tokens per second, queue depth, latency."

---

### Part 8: Multi-Runtime Flexibility (1 minute)

> "Here's something unique: **each deployment can use a different runtime**. You might run Llama on NVIDIA Dynamo for maximum throughput, while running a smaller model on KAITO CPU for cost savings."

**Show deployments list with mixed runtimes** (if available)

> "This gives operators flexibility to optimize for their specific use cases."

---

### Part 9: Accessing the Model (1 minute)

> "Once the model is running, it exposes an **OpenAI-compatible API**. Teams can integrate immediately."

**Show port-forward command:**
```bash
kubectl port-forward svc/<deployment-name> 8000:8000 -n <namespace>
```

**Quick API test:**
```bash
curl http://localhost:8000/v1/models
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "<model>", "messages": [{"role": "user", "content": "Hello!"}]}'
```

> "Standard OpenAI API means any application that works with OpenAI can work with these models."

---

## Closing & Discussion (2 minutes)

### Summary

> "Let's recap what we've demonstrated:"

1. ✅ **Unified interface** for multiple OSS inference runtimes (Dynamo, KubeRay, KAITO)
2. ✅ **One-click installation** of runtimes via Helm
3. ✅ **Smart model discovery** with GPU capacity awareness
4. ✅ **No-code deployment** – from model selection to running inference
5. ✅ **CPU-capable inference** – run models without GPU nodes using KAITO
6. ✅ **OpenAI-compatible APIs** – immediate application integration
7. ✅ **Vendor-neutral OSS stack** – works on any Kubernetes, including AKS

### Call to Action

> "We're looking to:"

- **Collect feedback** on the UX and missing features
- **Understand pain points** from operators hosting inference on Kubernetes
- **Align on OSS strategy** for consistent experience across Foundry and self-managed AKS
- **Identify requirements** to improve these OSS projects and Kubernetes core

---

## Optional Deep-Dives

Use these if audience wants more detail:

### Deep-Dive A: NVIDIA AI Configurator Integration
> "For supported GPU/model combinations, KubeFoundry integrates with NVIDIA AI Configurator to automatically determine optimal tensor parallelism, batch sizes, and engine settings."

### Deep-Dive B: KAITO Build Infrastructure  
> "For HuggingFace GGUF models, KAITO uses in-cluster BuildKit to create custom container images—no external registry needed."

### Deep-Dive C: Cluster Autoscaler Awareness
> "On AKS with cluster autoscaler, KubeFoundry detects node pool configurations and can advise whether pending deployments might succeed after scale-up."

### Deep-Dive D: Provider Architecture
> "Under the hood, KubeFoundry uses a provider abstraction pattern. Adding support for new inference runtimes (like Ollama, KServe) is straightforward."

---

## Pre-Demo Checklist

- [ ] KubeFoundry binary downloaded and runnable
- [ ] `kubectl` configured with cluster access
- [ ] `helm` CLI installed
- [ ] At least one runtime installed (KAITO recommended for most demos)
- [ ] HuggingFace OAuth configured (optional, for gated models)
- [ ] Small model pre-deployed and running (for quick show of working state)
- [ ] GPU nodes available (optional, but great for full Dynamo demo)

---

## Demo Environment Options

| Environment | Best For | Notes |
|-------------|----------|-------|
| **AKS with GPUs** | Full demo | Shows GPU capacity, autoscaler integration |
| **AKS CPU-only** | Cost-focused demo | Highlights KAITO CPU inference |
| **Local (minikube/kind)** | Quick dev demo | Limited to CPU inference, smaller models |

---

## Troubleshooting Quick Fixes

| Issue | Solution |
|-------|----------|
| App doesn't load | Check `kubectl` connectivity, verify cluster access |
| Runtime install fails | Check Helm version, network connectivity to chart repos |
| Pods stay Pending | Check GPU availability, show as teaching moment |
| HuggingFace OAuth fails | Verify OAuth app configuration, network access |
| Model pull fails | Check HuggingFace token, model access permissions |

---

## Key Talking Points Reference

Keep these handy for Q&A:

1. **"Why multiple runtimes?"** – Different runtimes excel at different use cases. NVIDIA Dynamo for maximum throughput, KubeRay for scale-out, KAITO for flexibility and CPU inference.

2. **"Is this production-ready?"** – This is a POC to validate the approach and gather feedback. The underlying runtimes (vLLM, Ray, KAITO) are production-used.

3. **"How does this relate to Foundry?"** – Foundry can leverage this OSS stack while building differentiated value on top. Customers bring their own AKS compute.

4. **"What about fine-tuning?"** – Currently focused on inference. Fine-tuning support is a future consideration.

5. **"Security?"** – Supports Kubernetes OIDC authentication. Deployments run in customer-managed namespaces with standard RBAC.

6. **"What about model serving autoscaling?"** – KubeRay has built-in Ray autoscaling. KAITO supports HPA. Dynamo is exploring autoscaling options.
