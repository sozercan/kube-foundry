import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { configService } from '../services/config';
import { authService } from '../services/auth';
import { providerRegistry, listProviderInfo } from '../providers';

const updateSettingsSchema = z.object({
  activeProviderId: z.string().optional(),
  defaultNamespace: z.string().optional(),
});

const providerIdParamsSchema = z.object({
  id: z.string().min(1),
});

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

export default settings;
