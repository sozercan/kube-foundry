import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { kubernetesService } from '../services/kubernetes';
import { configService } from '../services/config';
import { createError } from '../middleware/errorHandler';
import { validateGpuFit, formatGpuWarnings } from '../services/gpuValidation';
import models from '../data/models.json';
import logger from '../lib/logger';
import {
  namespaceSchema,
  resourceNameSchema,
  validateQuery,
  validateParams,
} from '../lib/validation';

logger.debug('Loading deployments router');

const router = Router();

/**
 * Query schema for listing deployments with pagination
 */
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

/**
 * Query schema for single deployment operations
 */
const deploymentQuerySchema = z.object({
  namespace: namespaceSchema.optional(),
});

/**
 * Params schema for deployment name
 */
const deploymentParamsSchema = z.object({
  name: resourceNameSchema,
});

// GET /api/deployments - List all deployments with pagination
router.get(
  '/',
  validateQuery(listDeploymentsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { namespace, limit, offset } = req.query as z.infer<typeof listDeploymentsQuerySchema>;
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      let deployments = await kubernetesService.listDeployments(resolvedNamespace);
      const total = deployments.length;

      // Apply pagination
      if (offset !== undefined || limit !== undefined) {
        const start = offset || 0;
        const end = limit ? start + limit : undefined;
        deployments = deployments.slice(start, end);
      }

      res.json({
        deployments: deployments || [],
        pagination: {
          total,
          limit: limit || total,
          offset: offset || 0,
          hasMore: (offset || 0) + deployments.length < total,
        },
      });
    } catch (error) {
      // If anything fails, return empty array instead of error
      logger.error({ error }, 'Error in GET /deployments');
      res.json({
        deployments: [],
        pagination: { total: 0, limit: 0, offset: 0, hasMore: false },
      });
    }
  }
);

// POST /api/deployments - Create a new deployment
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get the active provider for validation
    const provider = await configService.getActiveProvider();
    const validationResult = provider.validateConfig(req.body);

    if (!validationResult.valid) {
      throw createError(`Validation error: ${validationResult.errors.join(', ')}`, 400);
    }

    const config = validationResult.data!;

    // GPU fit validation - get capacity and model requirements
    let gpuWarnings: string[] = [];
    try {
      const capacity = await kubernetesService.getClusterGpuCapacity();
      
      // Find model to get minGpus requirement
      const model = models.models.find((m) => m.id === config.modelId);
      const modelMinGpus = (model as { minGpus?: number })?.minGpus ?? 1;

      const gpuFitResult = validateGpuFit(config, capacity, modelMinGpus);
      if (!gpuFitResult.fits) {
        gpuWarnings = formatGpuWarnings(gpuFitResult);
        logger.warn({ 
          modelId: config.modelId, 
          warnings: gpuWarnings,
          capacity: {
            available: capacity.availableGpus,
            maxContiguous: capacity.maxContiguousAvailable,
          },
        }, 'GPU fit warnings for deployment');
      }
    } catch (gpuError) {
      // Don't block deployment if GPU check fails, just log
      logger.warn({ error: gpuError }, 'Could not perform GPU fit validation');
    }

    await kubernetesService.createDeployment(config);

    res.status(201).json({
      message: 'Deployment created successfully',
      name: config.name,
      namespace: config.namespace,
      ...(gpuWarnings.length > 0 && { warnings: gpuWarnings }),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/deployments/:name - Get deployment details
router.get(
  '/:name',
  validateParams(deploymentParamsSchema),
  validateQuery(deploymentQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.params as z.infer<typeof deploymentParamsSchema>;
      const { namespace } = req.query as z.infer<typeof deploymentQuerySchema>;
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      const deployment = await kubernetesService.getDeployment(name, resolvedNamespace);

      if (!deployment) {
        throw createError('Deployment not found', 404);
      }

      res.json(deployment);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/deployments/:name - Delete a deployment
router.delete(
  '/:name',
  validateParams(deploymentParamsSchema),
  validateQuery(deploymentQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.params as z.infer<typeof deploymentParamsSchema>;
      const { namespace } = req.query as z.infer<typeof deploymentQuerySchema>;
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      await kubernetesService.deleteDeployment(name, resolvedNamespace);

      res.json({ message: 'Deployment deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/deployments/:name/pods - Get pods for a deployment
router.get(
  '/:name/pods',
  validateParams(deploymentParamsSchema),
  validateQuery(deploymentQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name } = req.params as z.infer<typeof deploymentParamsSchema>;
      const { namespace } = req.query as z.infer<typeof deploymentQuerySchema>;
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      const pods = await kubernetesService.getDeploymentPods(name, resolvedNamespace);
      res.json({ pods });
    } catch (error) {
      next(error);
    }
  }
);

// Catch all for /api/deployments to debug 404s
router.use((req, res) => {
  logger.warn({ method: req.method, url: req.url }, 'Unmatched deployment route');
  res.status(404).json({ error: { message: 'Deployment route not found', statusCode: 404 } });
});

export default router;
