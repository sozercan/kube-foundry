# KubeFoundry Demo Automation

Automated demo system that combines CLI-based terminal automation (showing "the problem") with Playwright-based UI automation (showing "the solution"), narrated by Azure OpenAI GPT-4o mini TTS.

## Prerequisites

| Tool | Required | Notes |
|------|----------|-------|
| **macOS** | Yes | Uses `afplay` for audio playback |
| **Bun** | Yes | v1.3.6+ |
| **kubectl** | Yes | Cluster access configured |
| **KubeFoundry** | Yes | Running at localhost:3001 |

## Quick Start

```bash
# 1. Install dependencies
cd demo
bun install
bun exec playwright install chromium

# 2. Set Azure OpenAI credentials (for TTS narration)
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"
export AZURE_OPENAI_API_KEY="your-api-key"
export AZURE_OPENAI_TTS_DEPLOYMENT="gpt-4o-mini-tts"

# 3. Start KubeFoundry (in another terminal)
cd /path/to/kube-foundry
bun run dev

# 4. Run the demo
cd demo
bun run start
```

## Usage

```bash
# Full demo (CLI + UI + narration)
bun run start

# CLI phase only (terminal automation)
bun run cli-only

# UI phase only (Playwright automation)
bun run ui-only

# Test narration system
bun run start --narration-only

# Skip narration (silent mode)
DEMO_SKIP_NARRATION=true bun run start

# Show help
bun run start --help
```

## Environment Variables

### Azure OpenAI TTS (required for narration)

```bash
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_TTS_DEPLOYMENT=gpt-4o-mini-tts
```

### Demo Configuration (optional)

```bash
DEMO_KUBEFOUNDRY_URL=http://localhost:3001  # KubeFoundry URL
DEMO_MODEL=Qwen/Qwen3-0.6B                   # Model to deploy
DEMO_RUNTIME=kaito                           # Runtime to use
DEMO_TYPEWRITER_SPEED=50                     # Typewriter effect speed (ms)
```

### Feature Flags (optional)

```bash
DEMO_SKIP_NARRATION=true  # Skip TTS, text-only
DEMO_SKIP_CLI=true        # Skip CLI phase
DEMO_SKIP_UI=true         # Skip UI phase
```

## Demo Flow

### Phase 1: The Problem (CLI)

1. Display complex KubeRay RayService YAML (~150 lines)
2. Display NVIDIA Dynamo DynamoGraphDeployment YAML (~200 lines)
3. Display KAITO Workspace YAML (~100 lines)
4. Attempt kubectl apply, show pending pods
5. Show kubectl describe revealing GPU scheduling issues

**Key message:** Deploying LLMs on Kubernetes requires expertise in ML, GPUs, AND Kubernetes.

### Phase 2: The Solution (UI)

1. Launch KubeFoundry in browser
2. Navigate to Settings, install KAITO runtime (one-click)
3. Navigate to Models, show GPU fit indicators
4. Search HuggingFace for Qwen3
5. Deploy model with simple form (no YAML)
6. Watch deployment status in real-time
7. Show running deployment with OpenAI-compatible API

**Key message:** KubeFoundry abstracts the complexity while leveraging OSS runtimes.

## Files

```
demo/
├── run-demo.ts      # Main orchestrator
├── cli-phase.ts     # Terminal automation
├── ui-phase.ts      # Playwright automation
├── narration.ts     # Azure OpenAI TTS
├── script.ts        # All narration text
├── config.ts        # Configuration
├── utils.ts         # Shared utilities
├── package.json     # Dependencies
├── tsconfig.json    # TypeScript config
├── README.md        # This file
└── assets/
    ├── kuberay-rayservice.yaml  # Real KubeRay example
    ├── dynamo-deployment.yaml   # Real Dynamo example
    ├── kaito-workspace.yaml     # Real KAITO example
    └── pain-points.md           # Annotated complexity notes
```

## Troubleshooting

### TTS not working

1. Verify Azure OpenAI credentials are set correctly
2. Ensure the TTS deployment exists in your Azure OpenAI resource
3. Test with: `bun run start --narration-only`

### Browser automation fails

1. Ensure Playwright browsers are installed: `bun exec playwright install chromium`
2. Verify KubeFoundry is running: `curl http://localhost:3001/api/health`
3. Check that data-testid attributes are present in the UI

### Demo assets not found

1. Ensure the demo/assets/ directory exists with YAML files
2. Re-run from the demo/ directory, not project root

## Customization

### Change the demo model

```bash
DEMO_MODEL=microsoft/phi-3-mini-4k bun run start
```

### Adjust timing

Edit `config.ts` to modify:
- `timing.typewriterSpeed` - Speed of typewriter effect
- `timing.pauseShort/Medium/Long` - Pauses between sections
- `browser.slowMo` - Playwright action delay

### Modify narration

Edit `script.ts` to change any narration text. All narration is organized by demo phase.

## Recording

To record the demo, use macOS screen recording or OBS while running the demo. The demo is designed for 1920x1080 resolution.
