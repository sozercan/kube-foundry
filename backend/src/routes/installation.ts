import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { kubernetesService } from '../services/kubernetes';
import { helmService } from '../services/helm';
import { providerRegistry } from '../providers';
import logger from '../lib/logger';

const providerIdParamsSchema = z.object({
  id: z.string().min(1),
});

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
  .get('/gpu-capacity/detailed', async (c) => {
    const capacity = await kubernetesService.getDetailedClusterGpuCapacity();
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

export default installation;
