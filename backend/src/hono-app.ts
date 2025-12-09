import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { compress } from 'hono/compress';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { kubernetesService } from './services/kubernetes';
import { configService } from './services/config';
import { helmService } from './services/helm';
import { authService } from './services/auth';
import { providerRegistry, listProviderInfo } from './providers';
import { validateGpuFit, formatGpuWarnings } from './services/gpuValidation';
import models from './data/models.json';
import logger from './lib/logger';
import {
  isCompiled,
  loadStaticFiles,
  getStaticFile,
  getIndexHtml,
  hasStaticFiles,
} from './static';
import {
  namespaceSchema,
  resourceNameSchema,
} from './lib/validation';
import type { UserInfo } from '@kubefoundry/shared';

// Load static files at startup
await loadStaticFiles();

const compiled = isCompiled();
logger.info(
  { mode: compiled ? 'compiled' : 'development' },
  `🔧 Running in ${compiled ? 'compiled binary' : 'development'} mode`
);

// ============================================================================
// Zod Schemas
// ============================================================================

const listDeploymentsQuerySchema = z.object({
  namespace: namespaceSchema.optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(1).max(100).optional()),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(0).optional()),
});

const deploymentQuerySchema = z.object({
  namespace: namespaceSchema.optional(),
});

const deploymentParamsSchema = z.object({
  name: resourceNameSchema,
});

const updateSettingsSchema = z.object({
  activeProviderId: z.string().optional(),
  defaultNamespace: z.string().optional(),
});

const providerIdParamsSchema = z.object({
  id: z.string().min(1),
});

// ============================================================================
// Health Routes
// ============================================================================

const health = new Hono()
  .get('/', (c) => {
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  })
  .get('/status', async (c) => {
    const clusterStatus = await kubernetesService.checkClusterConnection();

    let providerInstallation = null;
    let activeProvider = null;

    if (clusterStatus.connected) {
      try {
        providerInstallation = await kubernetesService.checkProviderInstallation();
        activeProvider = await configService.getActiveProvider();
      } catch (error) {
        logger.error({ error }, 'Error checking provider installation');
      }
    }

    return c.json({
      ...clusterStatus,
      provider: activeProvider
        ? {
            id: activeProvider.id,
            name: activeProvider.name,
          }
        : null,
      providerInstallation,
    });
  });

// ============================================================================
// Models Routes
// ============================================================================

const modelsRoute = new Hono()
  .get('/', (c) => {
    return c.json({ models: models.models });
  })
  .get('/:id{.+}', (c) => {
    const modelId = c.req.param('id');
    const model = models.models.find((m) => m.id === modelId);

    if (!model) {
      throw new HTTPException(404, { message: 'Model not found' });
    }

    return c.json(model);
  });

// ============================================================================
// Settings Routes
// ============================================================================

const settings = new Hono()
  .get('/', async (c) => {
    const config = await configService.getConfig();
    const providers = listProviderInfo();
    const activeProvider = providerRegistry.getProviderOrNull(config.activeProviderId);

    return c.json({
      config,
      providers,
      activeProvider: activeProvider
        ? {
            id: activeProvider.id,
            name: activeProvider.name,
            description: activeProvider.description,
            defaultNamespace: activeProvider.defaultNamespace,
          }
        : null,
      auth: {
        enabled: authService.isAuthEnabled(),
      },
    });
  })
  .put('/', zValidator('json', updateSettingsSchema), async (c) => {
    const data = c.req.valid('json');

    // Validate provider exists if being changed
    if (data.activeProviderId && !providerRegistry.hasProvider(data.activeProviderId)) {
      throw new HTTPException(400, { message: `Invalid provider ID: ${data.activeProviderId}` });
    }

    const updatedConfig = await configService.setConfig(data);

    return c.json({
      message: 'Settings updated successfully',
      config: updatedConfig,
    });
  })
  .get('/providers', async (c) => {
    const providers = listProviderInfo();
    return c.json({ providers });
  })
  .get('/providers/:id', zValidator('param', providerIdParamsSchema), async (c) => {
    const { id } = c.req.valid('param');
    const provider = providerRegistry.getProviderOrNull(id);

    if (!provider) {
      throw new HTTPException(404, { message: `Provider not found: ${id}` });
    }

    return c.json({
      id: provider.id,
      name: provider.name,
      description: provider.description,
      defaultNamespace: provider.defaultNamespace,
      crdConfig: provider.getCRDConfig(),
      installationSteps: provider.getInstallationSteps(),
      helmRepos: provider.getHelmRepos(),
      helmCharts: provider.getHelmCharts(),
    });
  });

// ============================================================================
// Deployments Routes
// ============================================================================

const deployments = new Hono()
  .get('/', zValidator('query', listDeploymentsQuerySchema), async (c) => {
    try {
      const { namespace, limit, offset } = c.req.valid('query');
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      let deploymentsList = await kubernetesService.listDeployments(resolvedNamespace);
      const total = deploymentsList.length;

      // Apply pagination
      if (offset !== undefined || limit !== undefined) {
        const start = offset || 0;
        const end = limit ? start + limit : undefined;
        deploymentsList = deploymentsList.slice(start, end);
      }

      return c.json({
        deployments: deploymentsList || [],
        pagination: {
          total,
          limit: limit || total,
          offset: offset || 0,
          hasMore: (offset || 0) + deploymentsList.length < total,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Error in GET /deployments');
      return c.json({
        deployments: [],
        pagination: { total: 0, limit: 0, offset: 0, hasMore: false },
      });
    }
  })
  .post('/', async (c) => {
    const body = await c.req.json();

    // Get the active provider for validation
    const provider = await configService.getActiveProvider();
    const validationResult = provider.validateConfig(body);

    if (!validationResult.valid) {
      throw new HTTPException(400, {
        message: `Validation error: ${validationResult.errors.join(', ')}`,
      });
    }

    const config = validationResult.data!;

    // GPU fit validation
    let gpuWarnings: string[] = [];
    try {
      const capacity = await kubernetesService.getClusterGpuCapacity();

      const model = models.models.find((m) => m.id === config.modelId);
      const modelMinGpus = (model as { minGpus?: number })?.minGpus ?? 1;

      const gpuFitResult = validateGpuFit(config, capacity, modelMinGpus);
      if (!gpuFitResult.fits) {
        gpuWarnings = formatGpuWarnings(gpuFitResult);
        logger.warn(
          {
            modelId: config.modelId,
            warnings: gpuWarnings,
            capacity: {
              available: capacity.availableGpus,
              maxContiguous: capacity.maxContiguousAvailable,
            },
          },
          'GPU fit warnings for deployment'
        );
      }
    } catch (gpuError) {
      logger.warn({ error: gpuError }, 'Could not perform GPU fit validation');
    }

    await kubernetesService.createDeployment(config);

    return c.json(
      {
        message: 'Deployment created successfully',
        name: config.name,
        namespace: config.namespace,
        ...(gpuWarnings.length > 0 && { warnings: gpuWarnings }),
      },
      201
    );
  })
  .get(
    '/:name',
    zValidator('param', deploymentParamsSchema),
    zValidator('query', deploymentQuerySchema),
    async (c) => {
      const { name } = c.req.valid('param');
      const { namespace } = c.req.valid('query');
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      const deployment = await kubernetesService.getDeployment(name, resolvedNamespace);

      if (!deployment) {
        throw new HTTPException(404, { message: 'Deployment not found' });
      }

      return c.json(deployment);
    }
  )
  .delete(
    '/:name',
    zValidator('param', deploymentParamsSchema),
    zValidator('query', deploymentQuerySchema),
    async (c) => {
      const { name } = c.req.valid('param');
      const { namespace } = c.req.valid('query');
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      await kubernetesService.deleteDeployment(name, resolvedNamespace);

      return c.json({ message: 'Deployment deleted successfully' });
    }
  )
  .get(
    '/:name/pods',
    zValidator('param', deploymentParamsSchema),
    zValidator('query', deploymentQuerySchema),
    async (c) => {
      const { name } = c.req.valid('param');
      const { namespace } = c.req.valid('query');
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      const pods = await kubernetesService.getDeploymentPods(name, resolvedNamespace);
      return c.json({ pods });
    }
  );

// ============================================================================
// Installation Routes
// ============================================================================

const installation = new Hono()
  .get('/helm/status', async (c) => {
    const helmStatus = await helmService.checkHelmAvailable();
    return c.json(helmStatus);
  })
  .get('/gpu-operator/status', async (c) => {
    const status = await kubernetesService.checkGPUOperatorStatus();
    const helmCommands = helmService.getGpuOperatorCommands();

    return c.json({
      ...status,
      helmCommands,
    });
  })
  .get('/gpu-capacity', async (c) => {
    const capacity = await kubernetesService.getClusterGpuCapacity();
    return c.json(capacity);
  })
  .post('/gpu-operator/install', async (c) => {
    const helmStatus = await helmService.checkHelmAvailable();
    if (!helmStatus.available) {
      throw new HTTPException(400, {
        message: `Helm CLI not available: ${helmStatus.error}. Please install Helm or use the manual installation commands.`,
      });
    }

    const currentStatus = await kubernetesService.checkGPUOperatorStatus();
    if (currentStatus.installed) {
      return c.json({
        success: true,
        message: 'NVIDIA GPU Operator is already installed',
        alreadyInstalled: true,
        status: currentStatus,
      });
    }

    logger.info('Starting installation of NVIDIA GPU Operator');
    const result = await helmService.installGpuOperator((data, stream) => {
      logger.debug({ stream }, data.trim());
    });

    if (result.success) {
      const verifyStatus = await kubernetesService.checkGPUOperatorStatus();

      return c.json({
        success: true,
        message: 'NVIDIA GPU Operator installed successfully',
        status: verifyStatus,
        results: result.results.map((r) => ({
          step: r.step,
          success: r.result.success,
          output: r.result.stdout,
          error: r.result.stderr,
        })),
      });
    } else {
      const failedStep = result.results.find((r) => !r.result.success);
      throw new HTTPException(500, {
        message: `Installation failed at step "${failedStep?.step}": ${failedStep?.result.stderr}`,
      });
    }
  })
  .get(
    '/providers/:id/status',
    zValidator('param', providerIdParamsSchema),
    async (c) => {
      const { id } = c.req.valid('param');

      if (!providerRegistry.hasProvider(id)) {
        throw new HTTPException(404, { message: `Provider not found: ${id}` });
      }

      const installationStatus = await kubernetesService.checkProviderInstallation(id);
      const provider = providerRegistry.getProvider(id);

      return c.json({
        providerId: id,
        providerName: provider.name,
        ...installationStatus,
        installationSteps: provider.getInstallationSteps(),
        helmCommands: helmService.getInstallCommands(
          provider.getHelmRepos(),
          provider.getHelmCharts()
        ),
      });
    }
  )
  .get(
    '/providers/:id/commands',
    zValidator('param', providerIdParamsSchema),
    async (c) => {
      const { id } = c.req.valid('param');

      if (!providerRegistry.hasProvider(id)) {
        throw new HTTPException(404, { message: `Provider not found: ${id}` });
      }

      const provider = providerRegistry.getProvider(id);
      const commands = helmService.getInstallCommands(
        provider.getHelmRepos(),
        provider.getHelmCharts()
      );

      return c.json({
        providerId: id,
        providerName: provider.name,
        commands,
        steps: provider.getInstallationSteps(),
      });
    }
  )
  .post(
    '/providers/:id/install',
    zValidator('param', providerIdParamsSchema),
    async (c) => {
      const { id } = c.req.valid('param');

      if (!providerRegistry.hasProvider(id)) {
        throw new HTTPException(404, { message: `Provider not found: ${id}` });
      }

      const helmStatus = await helmService.checkHelmAvailable();
      if (!helmStatus.available) {
        throw new HTTPException(400, {
          message: `Helm CLI not available: ${helmStatus.error}. Please install Helm or use the manual installation commands.`,
        });
      }

      const provider = providerRegistry.getProvider(id);

      const currentStatus = await kubernetesService.checkProviderInstallation(id);
      if (currentStatus.installed) {
        return c.json({
          success: true,
          message: `${provider.name} is already installed`,
          alreadyInstalled: true,
        });
      }

      logger.info(
        { providerId: id, providerName: provider.name },
        `Starting installation of ${provider.name}`
      );
      const result = await helmService.installProvider(
        provider.getHelmRepos(),
        provider.getHelmCharts(),
        (data, stream) => {
          logger.debug({ stream }, data.trim());
        }
      );

      if (result.success) {
        const verifyStatus = await kubernetesService.checkProviderInstallation(id);

        return c.json({
          success: true,
          message: `${provider.name} installed successfully`,
          installationStatus: verifyStatus,
          results: result.results.map((r) => ({
            step: r.step,
            success: r.result.success,
            output: r.result.stdout,
            error: r.result.stderr,
          })),
        });
      } else {
        const failedStep = result.results.find((r) => !r.result.success);
        throw new HTTPException(500, {
          message: `Installation failed at step "${failedStep?.step}": ${failedStep?.result.stderr}`,
        });
      }
    }
  )
  .post(
    '/providers/:id/upgrade',
    zValidator('param', providerIdParamsSchema),
    async (c) => {
      const { id } = c.req.valid('param');

      if (!providerRegistry.hasProvider(id)) {
        throw new HTTPException(404, { message: `Provider not found: ${id}` });
      }

      const helmStatus = await helmService.checkHelmAvailable();
      if (!helmStatus.available) {
        throw new HTTPException(400, {
          message: `Helm CLI not available: ${helmStatus.error}. Please install Helm or use the manual upgrade commands.`,
        });
      }

      const provider = providerRegistry.getProvider(id);
      const charts = provider.getHelmCharts();
      const repos = provider.getHelmRepos();

      logger.info(
        { providerId: id, providerName: provider.name },
        `Starting upgrade of ${provider.name}`
      );

      for (const repo of repos) {
        await helmService.repoAdd(repo);
      }
      await helmService.repoUpdate();

      const results: Array<{ chart: string; success: boolean; output: string; error?: string }> =
        [];

      for (const chart of charts) {
        const result = await helmService.upgrade(chart, (data, stream) => {
          logger.debug({ stream }, data.trim());
        });

        results.push({
          chart: chart.name,
          success: result.success,
          output: result.stdout,
          error: result.stderr || undefined,
        });

        if (!result.success) {
          throw new HTTPException(500, {
            message: `Upgrade failed for chart "${chart.name}": ${result.stderr}`,
          });
        }
      }

      const verifyStatus = await kubernetesService.checkProviderInstallation(id);

      return c.json({
        success: true,
        message: `${provider.name} upgraded successfully`,
        installationStatus: verifyStatus,
        results,
      });
    }
  )
  .post(
    '/providers/:id/uninstall',
    zValidator('param', providerIdParamsSchema),
    async (c) => {
      const { id } = c.req.valid('param');

      if (!providerRegistry.hasProvider(id)) {
        throw new HTTPException(404, { message: `Provider not found: ${id}` });
      }

      const helmStatus = await helmService.checkHelmAvailable();
      if (!helmStatus.available) {
        throw new HTTPException(400, { message: `Helm CLI not available: ${helmStatus.error}` });
      }

      const provider = providerRegistry.getProvider(id);
      const charts = provider.getHelmCharts();

      logger.info(
        { providerId: id, providerName: provider.name },
        `Starting uninstall of ${provider.name}`
      );

      const results: Array<{ chart: string; success: boolean; output: string; error?: string }> =
        [];

      for (const chart of [...charts].reverse()) {
        const result = await helmService.uninstall(chart.name, chart.namespace, (data, stream) => {
          logger.debug({ stream }, data.trim());
        });

        results.push({
          chart: chart.name,
          success: result.success,
          output: result.stdout,
          error: result.stderr || undefined,
        });
      }

      const verifyStatus = await kubernetesService.checkProviderInstallation(id);

      return c.json({
        success: true,
        message: `${provider.name} uninstalled`,
        installationStatus: verifyStatus,
        results,
      });
    }
  );

// ============================================================================
// Main App
// ============================================================================

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = new Hono();

// Global middleware
app.use('*', compress());
app.use(
  '*',
  cors({
    origin: CORS_ORIGIN,
  })
);

// Request logging
app.use('*', async (c, next) => {
  logger.info({ method: c.req.method, url: c.req.url }, `${c.req.method} ${c.req.path}`);
  await next();
});

// ============================================================================
// Auth Middleware
// ============================================================================

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  '/api/health',
  '/api/cluster/status',
  '/api/settings',  // Settings is public (read-only auth config needed by frontend)
];

// Auth middleware for protected API routes
app.use('/api/*', async (c, next) => {
  // Skip auth if not enabled
  if (!authService.isAuthEnabled()) {
    return next();
  }

  // Skip auth for public routes
  const path = c.req.path;
  if (PUBLIC_ROUTES.some(route => path === route || path.startsWith(route + '/'))) {
    return next();
  }

  // Extract bearer token
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      { error: { message: 'Authentication required', statusCode: 401 } },
      401
    );
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  // Validate token via Kubernetes TokenReview
  const result = await authService.validateToken(token);
  
  if (!result.valid) {
    logger.warn({ error: result.error }, 'Token validation failed');
    return c.json(
      { error: { message: result.error || 'Invalid token', statusCode: 401 } },
      401
    );
  }

  // Attach user info to context for logging/audit
  c.set('user', result.user as UserInfo);
  logger.debug({ username: result.user?.username }, 'Authenticated request');

  return next();
});

// API Routes
app.route('/api/health', health);
app.route('/api/cluster', health);
app.route('/api/models', modelsRoute);
app.route('/api/settings', settings);
app.route('/api/deployments', deployments);
app.route('/api/installation', installation);

// Static file serving middleware
app.use('*', async (c, next) => {
  if (c.req.path.startsWith('/api/')) {
    return next();
  }

  if (hasStaticFiles()) {
    const file = getStaticFile(c.req.path);
    if (file) {
      return c.body(file.content, 200, { 'Content-Type': file.contentType });
    }
  }

  return next();
});

// SPA fallback
app.notFound((c) => {
  // If it's an API route that wasn't matched, return 404 JSON
  if (c.req.path.startsWith('/api/')) {
    logger.warn(
      { method: c.req.method, url: c.req.url, statusCode: 404 },
      `No route matched: ${c.req.method} ${c.req.url}`
    );
    return c.json(
      { error: { message: `Route not found: ${c.req.method} ${c.req.path}`, statusCode: 404 } },
      404
    );
  }

  // Serve index.html for SPA routing
  if (hasStaticFiles()) {
    const indexHtml = getIndexHtml();
    if (indexHtml) {
      return c.body(indexHtml.content, 200, { 'Content-Type': indexHtml.contentType });
    }
  }

  return c.text('Frontend not available. Run with frontend build or in development mode.', 404);
});

// Global error handler
app.onError((err, c) => {
  logger.error({ error: err, stack: err.stack }, `Error: ${err.message}`);

  if (err instanceof HTTPException) {
    return c.json(
      {
        error: {
          message: err.message,
          statusCode: err.status,
        },
      },
      err.status
    );
  }

  return c.json(
    {
      error: {
        message: err.message || 'Internal Server Error',
        statusCode: 500,
      },
    },
    500
  );
});

// Export for RPC type inference
export type AppType = typeof app;

export default app;
