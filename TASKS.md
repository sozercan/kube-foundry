# Dynamote - Implementation Tasks

## Phase 1: Project Setup

### Task 1.1: Initialize Monorepo Structure
**Priority:** Critical | **Estimate:** 1 hour

Create the monorepo structure with npm workspaces:
- [ ] Create root `package.json` with workspaces configuration
- [ ] Create `frontend/`, `backend/`, and `shared/` directories
- [ ] Set up `.gitignore` for Node.js projects
- [ ] Initialize git repository

**Files to create:**
- `package.json` (root)
- `.gitignore`
- `README.md`

---

### Task 1.2: Set Up Frontend Project
**Priority:** Critical | **Estimate:** 2 hours

Initialize Vite + React + TypeScript frontend:
- [ ] Run `npm create vite@latest frontend -- --template react-ts`
- [ ] Install dependencies: `@tanstack/react-query`, `react-router-dom`, `lucide-react`, `clsx`, `tailwind-merge`
- [ ] Configure Tailwind CSS
- [ ] Initialize shadcn/ui with dark theme
- [ ] Add base shadcn components: Button, Card, Input, Badge, Dialog, Table

**Files to create:**
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`
- `frontend/tsconfig.json`
- `frontend/src/index.css` (Tailwind imports)
- `frontend/components.json` (shadcn config)

---

### Task 1.3: Set Up Backend Project
**Priority:** Critical | **Estimate:** 1 hour

Initialize Express + TypeScript backend:
- [ ] Create `backend/package.json`
- [ ] Install dependencies: `express`, `@kubernetes/client-node`, `zod`, `cors`
- [ ] Install dev dependencies: `typescript`, `tsx`, `@types/express`, `@types/cors`
- [ ] Configure TypeScript
- [ ] Create basic Express server with health endpoint

**Files to create:**
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/src/index.ts` (entry point)

---

### Task 1.4: Create Shared Types Package
**Priority:** High | **Estimate:** 30 minutes

Create shared TypeScript types used by both frontend and backend:
- [ ] Define `Model` interface (include: id, name, description, size, task, contextLength, supportedEngines, minGpuMemory, parameters, license)
- [ ] Define `DeploymentConfig` interface (include: name, namespace, modelId, engine, mode, replicas, servedModelName, routerMode, hfTokenSecret, contextLength, enforceEager, enablePrefixCaching, trustRemoteCode, engineArgs, resources)
- [ ] Define `DeploymentStatus` interface
- [ ] Define `Engine`, `ModelTask`, and other enums

**Files to create:**
- `shared/types/model.ts`
- `shared/types/deployment.ts`
- `shared/types/index.ts`
- `shared/package.json`

---

### Task 1.5: Set Up Test Infrastructure
**Priority:** High | **Estimate:** 2 hours

Configure testing frameworks for the project:
- [ ] Install and configure Vitest for frontend unit/integration tests
- [ ] Install and configure Vitest for backend unit/integration tests
- [ ] Install and configure Playwright for E2E tests
- [ ] Add test scripts to root `package.json`
- [ ] Create sample test files to verify setup

**Files to create:**
- `frontend/vitest.config.ts`
- `frontend/src/test/setup.ts`
- `backend/vitest.config.ts`
- `e2e/playwright.config.ts`
- `e2e/tests/example.spec.ts`

**Dependencies to install:**
- Frontend: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- Backend: `vitest`, `supertest`, `@types/supertest`
- E2E: `@playwright/test`

---

## Phase 2: Frontend Development

### Task 2.1: Create Layout Components
**Priority:** Critical | **Estimate:** 2 hours

Build the app shell and navigation:
- [ ] Create `MainLayout` with sidebar and content area
- [ ] Create `Header` with app title and cluster status indicator
- [ ] Create `Sidebar` with navigation links (Models, Deployments)
- [ ] Set up React Router with routes

**Files to create:**
- `frontend/src/components/layout/MainLayout.tsx`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/App.tsx` (router setup)

---

### Task 2.2: Create Model Catalog Data
**Priority:** High | **Estimate:** 30 minutes

Create static model catalog JSON:
- [ ] Add 8 curated models with full metadata
- [ ] Include: id, name, description, size, task, contextLength, supportedEngines, minGpuMemory

**Files to create:**
- `frontend/src/data/models.json`

---

### Task 2.3: Build Model Catalog Page
**Priority:** Critical | **Estimate:** 3 hours

Create the main model browsing experience:
- [ ] Create `ModelCard` component with model info and "Deploy" button
- [ ] Create `ModelGrid` component for responsive grid layout
- [ ] Create `ModelSearch` component with search input
- [ ] Create `ModelsPage` combining all components
- [ ] Add filter chips for engine compatibility
- [ ] Style with dark theme (NVIDIA green accent: #76B900)

**Files to create:**
- `frontend/src/components/models/ModelCard.tsx`
- `frontend/src/components/models/ModelGrid.tsx`
- `frontend/src/components/models/ModelSearch.tsx`
- `frontend/src/pages/ModelsPage.tsx`

---

### Task 2.4: Build Deployment Configuration Form
**Priority:** Critical | **Estimate:** 3 hours

Create the deployment configuration UI:
- [ ] Create `DeploymentForm` with all configuration fields
- [ ] Create `EngineSelector` radio group component
- [ ] Add deployment name input (auto-generated from model)
- [ ] Add namespace input with default value
- [ ] Add replica count selector
- [ ] Add HF token secret name input
- [ ] Add collapsible advanced options section
- [ ] Create `DeployPage` that receives modelId from URL

**Files to create:**
- `frontend/src/components/deployments/DeploymentForm.tsx`
- `frontend/src/components/deployments/EngineSelector.tsx`
- `frontend/src/components/deployments/AdvancedOptions.tsx`
- `frontend/src/pages/DeployPage.tsx`

---

### Task 2.5: Build Deployments Dashboard
**Priority:** Critical | **Estimate:** 2 hours

Create the deployments list view:
- [ ] Create `DeploymentList` table component
- [ ] Create `DeploymentStatusBadge` for status display
- [ ] Add columns: Name, Model, Engine, Status, Replicas, Age, Actions
- [ ] Add delete action with confirmation dialog
- [ ] Create `DeploymentsPage` with empty state
- [ ] Add "Deploy a Model" CTA button

**Files to create:**
- `frontend/src/components/deployments/DeploymentList.tsx`
- `frontend/src/components/deployments/DeploymentStatusBadge.tsx`
- `frontend/src/pages/DeploymentsPage.tsx`

---

### Task 2.6: Build Deployment Details Page
**Priority:** High | **Estimate:** 2 hours

Create deployment detail view:
- [ ] Display deployment configuration summary
- [ ] Show status and conditions
- [ ] Create `PodList` component showing pod status
- [ ] Add port-forward instructions code block
- [ ] Add delete button with confirmation

**Files to create:**
- `frontend/src/components/deployments/DeploymentDetails.tsx`
- `frontend/src/components/deployments/PodList.tsx`
- `frontend/src/pages/DeploymentDetailsPage.tsx`

---

## Phase 3: Backend Development

### Task 3.1: Set Up Express Routes Structure
**Priority:** Critical | **Estimate:** 1 hour

Create Express router structure:
- [ ] Create routes folder with modular routers
- [ ] Set up CORS middleware
- [ ] Set up JSON body parser
- [ ] Add error handling middleware
- [ ] Create health check endpoint

**Files to create:**
- `backend/src/routes/index.ts`
- `backend/src/routes/health.ts`
- `backend/src/routes/deployments.ts`
- `backend/src/routes/models.ts`
- `backend/src/middleware/errorHandler.ts`

---

### Task 3.2: Implement Kubernetes Service
**Priority:** Critical | **Estimate:** 3 hours

Create Kubernetes API integration:
- [ ] Initialize KubeConfig from default location
- [ ] Create CustomObjectsApi client for CRDs
- [ ] Create CoreV1Api client for pods
- [ ] Implement `checkClusterConnection()` method
- [ ] Implement `listDeployments()` method
- [ ] Implement `getDeployment()` method
- [ ] Implement `deleteDeployment()` method
- [ ] Implement `getDeploymentPods()` method
- [ ] Add proper error handling and typing

**Files to create:**
- `backend/src/services/kubernetes.ts`

---

### Task 3.3: Implement Dynamo CRD Generator
**Priority:** Critical | **Estimate:** 3 hours

Create DynamoGraphDeployment manifest generator:
- [ ] Create function to generate CRD manifest from DeploymentConfig
- [ ] Support vLLM worker configuration
- [ ] Support SGLang worker configuration
- [ ] Support TensorRT-LLM worker configuration
- [ ] Handle aggregated vs disaggregated modes
- [ ] Include HF token secret reference
- [ ] Validate generated manifest against DynamoGraphDeployment CRD schema
- [ ] Implement `createDeployment()` that applies manifest
- [ ] Add unit tests for manifest generation

**Files to create:**
- `backend/src/services/dynamo.ts`
- `backend/src/services/__tests__/dynamo.test.ts`

---

### Task 3.4: Implement Deployment Routes
**Priority:** Critical | **Estimate:** 2 hours

Create deployment API endpoints:
- [ ] `GET /api/deployments` - List all deployments
- [ ] `POST /api/deployments` - Create new deployment
- [ ] `GET /api/deployments/:name` - Get deployment details
- [ ] `DELETE /api/deployments/:name` - Delete deployment
- [ ] `GET /api/deployments/:name/pods` - Get pod status
- [ ] Add request validation with Zod
- [ ] Add proper error responses

**Files to modify:**
- `backend/src/routes/deployments.ts`

---

### Task 3.5: Implement Models Route
**Priority:** Medium | **Estimate:** 30 minutes

Create model catalog endpoint:
- [ ] `GET /api/models` - Return static model catalog
- [ ] Load models from JSON file

**Files to modify:**
- `backend/src/routes/models.ts`
- `backend/src/data/models.json` (copy from frontend)

---

### Task 3.6: Implement Cluster Status Route
**Priority:** Medium | **Estimate:** 30 minutes

Create cluster status endpoint:
- [ ] `GET /api/cluster/status` - Return cluster connection status
- [ ] Include namespace info

**Files to modify:**
- `backend/src/routes/health.ts`

---

## Phase 4: Frontend-Backend Integration

### Task 4.1: Create API Client
**Priority:** Critical | **Estimate:** 1 hour

Create typed API client for frontend:
- [ ] Create fetch wrapper with error handling
- [ ] Create `deployments` API functions
- [ ] Create `models` API functions
- [ ] Create `health` API functions
- [ ] Add request/response type definitions

**Files to create:**
- `frontend/src/lib/api.ts`
- `frontend/src/lib/apiClient.ts`

---

### Task 4.2: Create React Query Hooks
**Priority:** Critical | **Estimate:** 2 hours

Create data fetching hooks:
- [ ] Create `useModels()` hook for model catalog
- [ ] Create `useDeployments()` hook with auto-refresh
- [ ] Create `useDeployment(name)` hook for single deployment
- [ ] Create `useCreateDeployment()` mutation hook
- [ ] Create `useDeleteDeployment()` mutation hook
- [ ] Create `useClusterStatus()` hook
- [ ] Set up QueryClient provider in App

**Files to create:**
- `frontend/src/hooks/useModels.ts`
- `frontend/src/hooks/useDeployments.ts`
- `frontend/src/hooks/useClusterStatus.ts`
- `frontend/src/lib/queryClient.ts`

---

### Task 4.3: Connect Model Catalog to API
**Priority:** High | **Estimate:** 1 hour

Wire up model catalog page:
- [ ] Use `useModels()` hook in ModelsPage
- [ ] Add loading state
- [ ] Add error state
- [ ] Keep fallback to static data if API unavailable

**Files to modify:**
- `frontend/src/pages/ModelsPage.tsx`

---

### Task 4.4: Connect Deployment Form to API
**Priority:** Critical | **Estimate:** 2 hours

Wire up deployment creation:
- [ ] Use `useCreateDeployment()` mutation in DeploymentForm
- [ ] Add form validation
- [ ] Show loading state during submission
- [ ] Show success toast and redirect to deployments
- [ ] Show error toast on failure

**Files to modify:**
- `frontend/src/pages/DeployPage.tsx`
- `frontend/src/components/deployments/DeploymentForm.tsx`

---

### Task 4.5: Connect Deployments Dashboard to API
**Priority:** Critical | **Estimate:** 2 hours

Wire up deployments list:
- [ ] Use `useDeployments()` hook with 10s refetch interval
- [ ] Use `useDeleteDeployment()` mutation for delete action
- [ ] Add loading skeleton
- [ ] Add error state
- [ ] Show confirmation dialog before delete

**Files to modify:**
- `frontend/src/pages/DeploymentsPage.tsx`
- `frontend/src/components/deployments/DeploymentList.tsx`

---

### Task 4.6: Connect Deployment Details to API
**Priority:** High | **Estimate:** 1 hour

Wire up deployment details page:
- [ ] Use `useDeployment(name)` hook
- [ ] Display live pod status
- [ ] Add loading and error states

**Files to modify:**
- `frontend/src/pages/DeploymentDetailsPage.tsx`

---

### Task 4.7: Add Cluster Status Indicator
**Priority:** Medium | **Estimate:** 1 hour

Show cluster connection status in header:
- [ ] Use `useClusterStatus()` hook
- [ ] Show green/red indicator in header
- [ ] Show tooltip with details

**Files to modify:**
- `frontend/src/components/layout/Header.tsx`

---

## Phase 5: Polish & Testing

### Task 5.1: Add Toast Notifications
**Priority:** High | **Estimate:** 1 hour

Implement user feedback:
- [ ] Add shadcn/ui Toast component
- [ ] Show success toast on deployment creation
- [ ] Show success toast on deployment deletion
- [ ] Show error toasts for API failures

**Files to create:**
- `frontend/src/components/ui/toaster.tsx`
- `frontend/src/hooks/useToast.ts`

---

### Task 5.2: Add Form Validation
**Priority:** High | **Estimate:** 1 hour

Validate deployment form inputs:
- [ ] Deployment name: required, valid K8s name format
- [ ] Namespace: required
- [ ] HF token secret: required
- [ ] Replicas: 1-10 range
- [ ] Show inline validation errors

**Files to modify:**
- `frontend/src/components/deployments/DeploymentForm.tsx`

---

### Task 5.3: Add Confirmation Dialogs
**Priority:** High | **Estimate:** 30 minutes

Add confirmation for destructive actions:
- [ ] Confirm before deleting deployment
- [ ] Show deployment name in confirmation

**Files to create:**
- `frontend/src/components/ui/confirm-dialog.tsx`

---

### Task 5.4: Add Loading States
**Priority:** Medium | **Estimate:** 1 hour

Polish loading experiences:
- [ ] Add skeleton loaders for model grid
- [ ] Add skeleton loaders for deployment table
- [ ] Add button loading spinners
- [ ] Add page-level loading indicators

**Files to create:**
- `frontend/src/components/ui/skeleton.tsx`

---

### Task 5.5: Write README Documentation
**Priority:** High | **Estimate:** 1 hour

Create setup and usage documentation:
- [ ] Prerequisites section (Node.js, K8s cluster, Dynamo operator)
- [ ] Installation instructions
- [ ] Development setup guide
- [ ] Configuration options
- [ ] Usage guide with screenshots
- [ ] Troubleshooting section

**Files to modify:**
- `README.md`

---

### Task 5.6: End-to-End Testing
**Priority:** Critical | **Estimate:** 3 hours

Write and run E2E tests for complete workflows:
- [ ] Write E2E test: model browsing and search
- [ ] Write E2E test: deployment creation with all engines (happy path)
- [ ] Write E2E test: deployment status display and auto-refresh
- [ ] Write E2E test: deployment deletion with confirmation
- [ ] Write E2E test: error handling (no cluster, API down)
- [ ] Test responsive layout on different screen sizes
- [ ] Ensure all E2E tests pass in CI pipeline

**Files to create:**
- `e2e/tests/models.spec.ts`
- `e2e/tests/deployments.spec.ts`
- `e2e/tests/error-handling.spec.ts`

---

## Future Improvements (Post-MVP)

These items are out of scope for MVP but should be considered for future iterations:

### Real-time Updates
- [ ] Refactor polling to Server-Sent Events (SSE) for deployment status updates
- [ ] Implement WebSocket connection for live pod log streaming

### Authentication & Authorization
- [ ] Add OIDC/OAuth2 integration for user authentication
- [ ] Implement RBAC for deployment permissions
- [ ] Add audit logging for deployment actions

### Enhanced Features
- [ ] Add deployment scaling controls (scale up/down replicas)
- [ ] Implement deployment rollback functionality
- [ ] Add resource usage metrics and monitoring dashboard
- [ ] Support for custom model configurations

---

## Summary

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1: Project Setup | 5 tasks | 6.5 hours |
| Phase 2: Frontend Development | 6 tasks | 12.5 hours |
| Phase 3: Backend Development | 6 tasks | 10 hours |
| Phase 4: Integration | 7 tasks | 10 hours |
| Phase 5: Polish & Testing | 6 tasks | 7.5 hours |
| **Total** | **30 tasks** | **~46.5 hours** |

---

## Task Dependencies

```
Phase 1 ──┬── Task 1.1 (Monorepo)
          ├── Task 1.2 (Frontend) ──┐
          ├── Task 1.3 (Backend) ───┤
          ├── Task 1.4 (Shared) ────┼─── Phase 2 & 3 (parallel)
          └── Task 1.5 (Testing) ───┘

Phase 2 ──┬── Task 2.1 (Layout) ────── Task 2.3, 2.4, 2.5, 2.6
          ├── Task 2.2 (Data) ──────── Task 2.3
          └── Tasks 2.3-2.6 (Pages)

Phase 3 ──┬── Task 3.1 (Routes) ────── Tasks 3.4, 3.5, 3.6
          ├── Task 3.2 (K8s Service) ─ Task 3.3, 3.4
          └── Task 3.3 (Dynamo) ────── Task 3.4

Phase 4 ──── All tasks depend on Phase 2 & 3 completion
          ├── Task 4.1 (API Client) ── Task 4.2
          └── Task 4.2 (Hooks) ─────── Tasks 4.3-4.7

Phase 5 ──── All tasks depend on Phase 4 completion
```
