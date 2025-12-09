import { Router, Request, Response, NextFunction } from 'express';
import { helmService } from '../services/helm';
import { kubernetesService } from '../services/kubernetes';
import { providerRegistry } from '../providers';
import { createError } from '../middleware/errorHandler';
import logger from '../lib/logger';

const router = Router();

/**
 * GET /api/installation/helm/status
 * Check if Helm CLI is available
 */
router.get('/helm/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const helmStatus = await helmService.checkHelmAvailable();
    res.json(helmStatus);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/installation/gpu-operator/status
 * Check GPU Operator installation status and GPU availability
 */
router.get('/gpu-operator/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await kubernetesService.checkGPUOperatorStatus();
    const helmCommands = helmService.getGpuOperatorCommands();
    
    res.json({
      ...status,
      helmCommands,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/installation/gpu-capacity
 * Get detailed GPU capacity including per-node availability
 */
router.get('/gpu-capacity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const capacity = await kubernetesService.getClusterGpuCapacity();
    res.json(capacity);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/installation/gpu-operator/install
 * Install the NVIDIA GPU Operator using Helm
 */
router.post('/gpu-operator/install', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if Helm is available
    const helmStatus = await helmService.checkHelmAvailable();
    if (!helmStatus.available) {
      throw createError(
        `Helm CLI not available: ${helmStatus.error}. Please install Helm or use the manual installation commands.`,
        400
      );
    }

    // Check if already installed
    const currentStatus = await kubernetesService.checkGPUOperatorStatus();
    if (currentStatus.installed) {
      res.json({
        success: true,
        message: 'NVIDIA GPU Operator is already installed',
        alreadyInstalled: true,
        status: currentStatus,
      });
      return;
    }

    // Install GPU Operator
    logger.info('Starting installation of NVIDIA GPU Operator');
    const result = await helmService.installGpuOperator((data, stream) => {
      logger.debug({ stream }, data.trim());
    });

    if (result.success) {
      // Verify installation
      const verifyStatus = await kubernetesService.checkGPUOperatorStatus();
      
      res.json({
        success: true,
        message: 'NVIDIA GPU Operator installed successfully',
        status: verifyStatus,
        results: result.results.map(r => ({
          step: r.step,
          success: r.result.success,
          output: r.result.stdout,
          error: r.result.stderr,
        })),
      });
    } else {
      const failedStep = result.results.find(r => !r.result.success);
      throw createError(
        `Installation failed at step "${failedStep?.step}": ${failedStep?.result.stderr}`,
        500
      );
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/installation/providers/:id/status
 * Check installation status for a provider
 */
router.get('/providers/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!providerRegistry.hasProvider(id)) {
      throw createError(`Provider not found: ${id}`, 404);
    }

    const installationStatus = await kubernetesService.checkProviderInstallation(id);
    const provider = providerRegistry.getProvider(id);
    
    res.json({
      providerId: id,
      providerName: provider.name,
      ...installationStatus,
      installationSteps: provider.getInstallationSteps(),
      helmCommands: helmService.getInstallCommands(
        provider.getHelmRepos(),
        provider.getHelmCharts()
      ),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/installation/providers/:id/commands
 * Get the Helm commands that would be run to install a provider
 */
router.get('/providers/:id/commands', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!providerRegistry.hasProvider(id)) {
      throw createError(`Provider not found: ${id}`, 404);
    }

    const provider = providerRegistry.getProvider(id);
    const commands = helmService.getInstallCommands(
      provider.getHelmRepos(),
      provider.getHelmCharts()
    );

    res.json({
      providerId: id,
      providerName: provider.name,
      commands,
      steps: provider.getInstallationSteps(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/installation/providers/:id/install
 * Install a provider using Helm
 */
router.post('/providers/:id/install', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!providerRegistry.hasProvider(id)) {
      throw createError(`Provider not found: ${id}`, 404);
    }

    // Check if Helm is available
    const helmStatus = await helmService.checkHelmAvailable();
    if (!helmStatus.available) {
      throw createError(
        `Helm CLI not available: ${helmStatus.error}. Please install Helm or use the manual installation commands.`,
        400
      );
    }

    const provider = providerRegistry.getProvider(id);
    
    // Check if already installed
    const currentStatus = await kubernetesService.checkProviderInstallation(id);
    if (currentStatus.installed) {
      res.json({
        success: true,
        message: `${provider.name} is already installed`,
        alreadyInstalled: true,
      });
      return;
    }

    // Install provider
    logger.info({ providerId: id, providerName: provider.name }, `Starting installation of ${provider.name}`);
    const result = await helmService.installProvider(
      provider.getHelmRepos(),
      provider.getHelmCharts(),
      (data, stream) => {
        logger.debug({ stream }, data.trim());
      }
    );

    if (result.success) {
      // Verify installation
      const verifyStatus = await kubernetesService.checkProviderInstallation(id);
      
      res.json({
        success: true,
        message: `${provider.name} installed successfully`,
        installationStatus: verifyStatus,
        results: result.results.map(r => ({
          step: r.step,
          success: r.result.success,
          output: r.result.stdout,
          error: r.result.stderr,
        })),
      });
    } else {
      const failedStep = result.results.find(r => !r.result.success);
      throw createError(
        `Installation failed at step "${failedStep?.step}": ${failedStep?.result.stderr}`,
        500
      );
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/installation/providers/:id/upgrade
 * Upgrade a provider using Helm
 */
router.post('/providers/:id/upgrade', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!providerRegistry.hasProvider(id)) {
      throw createError(`Provider not found: ${id}`, 404);
    }

    // Check if Helm is available
    const helmStatus = await helmService.checkHelmAvailable();
    if (!helmStatus.available) {
      throw createError(
        `Helm CLI not available: ${helmStatus.error}. Please install Helm or use the manual upgrade commands.`,
        400
      );
    }

    const provider = providerRegistry.getProvider(id);
    const charts = provider.getHelmCharts();
    const repos = provider.getHelmRepos();

    logger.info({ providerId: id, providerName: provider.name }, `Starting upgrade of ${provider.name}`);

    // Add/update repos first
    for (const repo of repos) {
      await helmService.repoAdd(repo);
    }
    await helmService.repoUpdate();

    // Upgrade each chart
    const results: Array<{ chart: string; success: boolean; output: string; error?: string }> = [];
    
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
        throw createError(
          `Upgrade failed for chart "${chart.name}": ${result.stderr}`,
          500
        );
      }
    }

    // Verify installation
    const verifyStatus = await kubernetesService.checkProviderInstallation(id);

    res.json({
      success: true,
      message: `${provider.name} upgraded successfully`,
      installationStatus: verifyStatus,
      results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/installation/providers/:id/uninstall
 * Uninstall a provider using Helm
 */
router.post('/providers/:id/uninstall', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (!providerRegistry.hasProvider(id)) {
      throw createError(`Provider not found: ${id}`, 404);
    }

    // Check if Helm is available
    const helmStatus = await helmService.checkHelmAvailable();
    if (!helmStatus.available) {
      throw createError(
        `Helm CLI not available: ${helmStatus.error}`,
        400
      );
    }

    const provider = providerRegistry.getProvider(id);
    const charts = provider.getHelmCharts();

    logger.info({ providerId: id, providerName: provider.name }, `Starting uninstall of ${provider.name}`);

    const results: Array<{ chart: string; success: boolean; output: string; error?: string }> = [];

    // Uninstall each chart in reverse order
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

    // Check final status
    const verifyStatus = await kubernetesService.checkProviderInstallation(id);

    res.json({
      success: true,
      message: `${provider.name} uninstalled`,
      installationStatus: verifyStatus,
      results,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
