import { Router, Request, Response, NextFunction } from 'express';
import { kubernetesService } from '../services/kubernetes';
import { configService } from '../services/config';
import { createError } from '../middleware/errorHandler';

console.log('Loading deployments router');

const router = Router();

// GET /api/deployments - List all deployments
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const namespace = (req.query.namespace as string) || await configService.getDefaultNamespace();
    const deployments = await kubernetesService.listDeployments(namespace);
    res.json({ deployments: deployments || [] });
  } catch (error) {
    // If anything fails, return empty array instead of error
    console.error('Error in GET /deployments:', error);
    res.json({ deployments: [] });
  }
});

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
    await kubernetesService.createDeployment(config);

    res.status(201).json({
      message: 'Deployment created successfully',
      name: config.name,
      namespace: config.namespace,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/deployments/:name - Get deployment details
router.get('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;
    const namespace = (req.query.namespace as string) || await configService.getDefaultNamespace();

    const deployment = await kubernetesService.getDeployment(name, namespace);

    if (!deployment) {
      throw createError('Deployment not found', 404);
    }

    res.json(deployment);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/deployments/:name - Delete a deployment
router.delete('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;
    const namespace = (req.query.namespace as string) || await configService.getDefaultNamespace();

    await kubernetesService.deleteDeployment(name, namespace);

    res.json({ message: 'Deployment deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /api/deployments/:name/pods - Get pods for a deployment
router.get('/:name/pods', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;
    const namespace = (req.query.namespace as string) || await configService.getDefaultNamespace();

    const pods = await kubernetesService.getDeploymentPods(name, namespace);
    res.json({ pods });
  } catch (error) {
    next(error);
  }
});

// Catch all for /api/deployments to debug 404s
router.use((req, res) => {
  console.log(`[Deployments] Unmatched route: ${req.method} ${req.url}`);
  res.status(404).json({ error: { message: 'Deployment route not found', statusCode: 404 } });
});

export default router;
