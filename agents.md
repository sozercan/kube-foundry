# KubeFoundry - Agent Instructions

## WHY: Project Purpose

**KubeFoundry** is a web-based platform for deploying and managing machine learning models on Kubernetes. It simplifies ML operations by providing a unified interface for multiple inference runtimes.

## WHAT: Tech Stack & Structure

**Stack**: React 18 + TypeScript + Vite (frontend) | Node.js + Express + Zod (backend) | Monorepo with shared types

**Key directories**:
- `frontend/src/` - React components, hooks, pages
- `backend/src/` - Express routes, providers, services
- `shared/types/` - Shared TypeScript definitions
- `docs/` - Detailed documentation (read as needed)

**Core pattern**: Provider abstraction - all inference runtime logic lives in `backend/src/providers/`. Each provider implements the `Provider` interface in `backend/src/providers/types.ts`.

## HOW: Development Commands

```bash
bun install              # Install dependencies
bun run dev              # Start dev servers (frontend + backend)
bun run test             # Run all tests (frontend + backend)
make compile             # Build single binary to dist/
```

**Always run `bun run test` after implementing functionality to verify both frontend and backend changes.**

## Documentation (Progressive Disclosure)

Read these files **only when relevant** to your task:

| File | When to read |
|------|--------------|
| [docs/architecture.md](docs/architecture.md) | Understanding system design, provider pattern, data flow |
| [docs/api.md](docs/api.md) | Working on REST endpoints or API client |
| [docs/development.md](docs/development.md) | Setup issues, build process, testing |
| [docs/standards.md](docs/standards.md) | Code style questions (prefer running linters instead) |

## Key Files Reference

- Provider interface: `backend/src/providers/types.ts`
- Provider registry: `backend/src/providers/index.ts`
- Kubernetes client: `backend/src/services/kubernetes.ts`
- Frontend API client: `frontend/src/lib/api.ts`
