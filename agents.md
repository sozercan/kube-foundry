# KubeFoundry - Agent Instructions

This document provides context for AI agents working on the KubeFoundry codebase.

## Project Overview

**KubeFoundry** is a web-based platform for deploying and managing machine learning models on Kubernetes. It uses a provider abstraction pattern to support multiple inference runtimes (NVIDIA Dynamo, KubeRay, etc.).

## Quick Reference

| Area | Documentation |
|------|---------------|
| Architecture | [docs/architecture.md](docs/architecture.md) |
| API Reference | [docs/api.md](docs/api.md) |
| Development Guide | [docs/development.md](docs/development.md) |
| Coding Standards | [docs/standards.md](docs/standards.md) |

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend**: Node.js, Express, @kubernetes/client-node, Zod
- **Shared**: TypeScript types in monorepo workspace

## Project Structure

```
kubefoundry/
├── frontend/src/
│   ├── components/     # UI components (layout/, models/, deployments/, ui/)
│   ├── pages/          # Page components
│   ├── hooks/          # React hooks for API calls
│   └── lib/            # API client and utilities
├── backend/src/
│   ├── providers/      # Provider implementations (dynamo/, kuberay/)
│   ├── routes/         # Express API routes
│   └── services/       # Core services (kubernetes, config, helm)
└── shared/types/       # Shared TypeScript types
```

## Key Concepts

### Provider Pattern
All inference runtime logic is encapsulated in provider implementations:
- Each provider implements the `Provider` interface
- Providers handle CRD generation, status parsing, and installation
- Active provider is stored in Kubernetes ConfigMap

### Data Flow
1. Frontend calls backend REST API
2. Backend uses active provider to generate/parse Kubernetes resources
3. Kubernetes resources are applied via @kubernetes/client-node

## Current Status

| Feature | Status |
|---------|--------|
| NVIDIA Dynamo Provider | ✅ Complete |
| Installation System | ✅ Complete |
| Model Catalog | ✅ Complete |
| Deployment Management | ✅ Complete |
| KubeRay Provider | 🔜 Planned |

## Important Files

- `backend/src/providers/types.ts` - Provider interface definition
- `backend/src/providers/index.ts` - Provider registry
- `backend/src/services/kubernetes.ts` - Kubernetes API client
- `frontend/src/lib/api.ts` - Frontend API client
- `shared/types/` - Shared type definitions
