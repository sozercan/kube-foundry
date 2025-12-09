import { Router, Request, Response, NextFunction } from 'express';
import { kubernetesService } from '../services/kubernetes';
import { configService } from '../services/config';
import logger from '../lib/logger';

const router = Router();

// GET /api/health - Backend health check
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/cluster/status - Kubernetes cluster connection status
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clusterStatus = await kubernetesService.checkClusterConnection();
    
    // Also check provider installation status
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
    
    res.json({
      ...clusterStatus,
      provider: activeProvider ? {
        id: activeProvider.id,
        name: activeProvider.name,
      } : null,
      providerInstallation,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
