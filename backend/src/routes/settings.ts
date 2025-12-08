import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { configService } from '../services/config';
import { providerRegistry, listProviderInfo } from '../providers';
import { createError } from '../middleware/errorHandler';

const router = Router();

// Validation schema for settings update
const updateSettingsSchema = z.object({
  activeProviderId: z.string().optional(),
  defaultNamespace: z.string().optional(),
});

/**
 * GET /api/settings
 * Get current application settings
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await configService.getConfig();
    const providers = listProviderInfo();
    const activeProvider = providerRegistry.getProviderOrNull(config.activeProviderId);

    res.json({
      config,
      providers,
      activeProvider: activeProvider ? {
        id: activeProvider.id,
        name: activeProvider.name,
        description: activeProvider.description,
        defaultNamespace: activeProvider.defaultNamespace,
      } : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/settings
 * Update application settings
 */
router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = updateSettingsSchema.safeParse(req.body);

    if (!result.success) {
      throw createError(`Validation error: ${result.error.message}`, 400);
    }

    // Validate provider exists if being changed
    if (result.data.activeProviderId && !providerRegistry.hasProvider(result.data.activeProviderId)) {
      throw createError(`Invalid provider ID: ${result.data.activeProviderId}`, 400);
    }

    const updatedConfig = await configService.setConfig(result.data);

    res.json({
      message: 'Settings updated successfully',
      config: updatedConfig,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/settings/providers
 * List all available providers
 */
router.get('/providers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const providers = listProviderInfo();
    res.json({ providers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/settings/providers/:id
 * Get details for a specific provider
 */
router.get('/providers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const provider = providerRegistry.getProviderOrNull(id);

    if (!provider) {
      throw createError(`Provider not found: ${id}`, 404);
    }

    res.json({
      id: provider.id,
      name: provider.name,
      description: provider.description,
      defaultNamespace: provider.defaultNamespace,
      crdConfig: provider.getCRDConfig(),
      installationSteps: provider.getInstallationSteps(),
      helmRepos: provider.getHelmRepos(),
      helmCharts: provider.getHelmCharts(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
