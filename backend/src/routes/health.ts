import { Hono } from 'hono';
import { kubernetesService } from '../services/kubernetes';
import { configService } from '../services/config';
import { BUILD_INFO } from '../build-info';
import logger from '../lib/logger';

const health = new Hono()
  .get('/', (c) => {
    return c.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  })
  .get('/version', (c) => {
    return c.json(BUILD_INFO);
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

export default health;
