import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { kubernetesService } from '../services/kubernetes';
import { configService } from '../services/config';
import { providerRegistry } from '../providers';
import { metricsService } from '../services/metrics';
import { validateGpuFit, formatGpuWarnings } from '../services/gpuValidation';
import { handleK8sError } from '../lib/k8s-errors';
import models from '../data/models.json';
import logger from '../lib/logger';
import type { DeploymentStatus } from '@kubefoundry/shared';
import {
  namespaceSchema,
  resourceNameSchema,
} from '../lib/validation';

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

const deployments = new Hono()
  .get('/', zValidator('query', listDeploymentsQuerySchema), async (c) => {
    try {
      const { namespace, limit, offset } = c.req.valid('query');

      let deploymentsList: DeploymentStatus[] = [];

      if (namespace) {
        // If namespace specified, query that namespace only
        deploymentsList = await kubernetesService.listDeployments(namespace);
      } else {
        // Query all provider namespaces and merge results
        const providerNamespaces = providerRegistry.listProviderIds()
          .map(id => providerRegistry.getProvider(id).defaultNamespace);
        
        // Remove duplicates
        const uniqueNamespaces = [...new Set(providerNamespaces)];
        
        // Query all namespaces in parallel
        const results = await Promise.all(
          uniqueNamespaces.map(ns => kubernetesService.listDeployments(ns))
        );
        
        // Merge and flatten
        for (const result of results) {
          deploymentsList.push(...result);
        }
        
        // Sort by creation time (newest first)
        deploymentsList.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA;
        });
      }

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
  .post('/preview', async (c) => {
    // Preview endpoint - generates all resources without creating them
    const body = await c.req.json();

    const providerId = body.provider;
    if (!providerId) {
      throw new HTTPException(400, {
        message: 'The "provider" field is required. Please specify the runtime (dynamo, kuberay, or kaito).',
      });
    }

    const provider = providerRegistry.getProvider(providerId);
    const validationResult = provider.validateConfig(body);

    if (!validationResult.valid) {
      throw new HTTPException(400, {
        message: `Validation error: ${validationResult.errors.join(', ')}`,
      });
    }

    const config = validationResult.data!;
    config.provider = providerId;

    // Generate the main manifest
    const mainManifest = provider.generateManifest(config);

    // Add kubefoundry.io/provider label for consistency
    const metadata = mainManifest.metadata as Record<string, unknown> || {};
    const labels = (metadata.labels as Record<string, string>) || {};
    labels['kubefoundry.io/provider'] = providerId;
    metadata.labels = labels;
    mainManifest.metadata = metadata;

    const crdConfig = provider.getCRDConfig();

    // Build array of all resources that will be created
    const resources: Array<{
      kind: string;
      apiVersion: string;
      name: string;
      manifest: Record<string, unknown>;
    }> = [];

    // Add the main CR
    resources.push({
      kind: crdConfig.kind,
      apiVersion: `${crdConfig.apiGroup}/${crdConfig.apiVersion}`,
      name: config.name,
      manifest: mainManifest,
    });

    // Generate additional resources based on provider and config
    // KAITO vLLM deployments get a separate Service for port 8000
    if (providerId === 'kaito' && (config as { modelSource?: string }).modelSource === 'vllm') {
      const serviceName = `${config.name}-vllm`;
      const serviceManifest = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: serviceName,
          namespace: config.namespace,
          labels: {
            'app.kubernetes.io/name': 'kubefoundry',
            'app.kubernetes.io/instance': config.name,
            'app.kubernetes.io/managed-by': 'kubefoundry',
          },
        },
        spec: {
          type: 'ClusterIP',
          ports: [
            {
              name: 'http',
              port: 8000,
              targetPort: 8000,
              protocol: 'TCP',
            },
          ],
          selector: {
            'kaito.sh/workspace': config.name,
          },
        },
      };
      resources.push({
        kind: 'Service',
        apiVersion: 'v1',
        name: serviceName,
        manifest: serviceManifest,
      });
    }

    return c.json({
      resources,
      primaryResource: {
        kind: crdConfig.kind,
        apiVersion: `${crdConfig.apiGroup}/${crdConfig.apiVersion}`,
      },
    });
  })
  .post('/', async (c) => {
    const body = await c.req.json();

    // Provider is required - no more fallback to active provider
    const providerId = body.provider;
    if (!providerId) {
      throw new HTTPException(400, {
        message: 'The "provider" field is required. Please specify the runtime (dynamo or kuberay).',
      });
    }

    const provider = providerRegistry.getProvider(providerId);
    const validationResult = provider.validateConfig(body);

    if (!validationResult.valid) {
      throw new HTTPException(400, {
        message: `Validation error: ${validationResult.errors.join(', ')}`,
      });
    }

    const config = validationResult.data!;
    // Ensure provider is set on config
    config.provider = providerId;

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

    // Create deployment with detailed error handling
    try {
      await kubernetesService.createDeployment(config, providerId);
    } catch (error) {
      const { message, statusCode } = handleK8sError(error, {
        operation: 'createDeployment',
        deploymentName: config.name,
        namespace: config.namespace,
        providerId,
        modelId: config.modelId,
      });

      throw new HTTPException(statusCode as 400 | 403 | 404 | 409 | 422 | 500, {
        message: `Failed to create deployment: ${message}`,
      });
    }

    return c.json(
      {
        message: 'Deployment created successfully',
        name: config.name,
        namespace: config.namespace,
        provider: providerId,
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
  .get(
    '/:name/manifest',
    zValidator('param', deploymentParamsSchema),
    zValidator('query', deploymentQuerySchema),
    async (c) => {
      const { name } = c.req.valid('param');
      const { namespace } = c.req.valid('query');
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      // Get the main CR manifest
      const manifest = await kubernetesService.getDeploymentManifest(name, resolvedNamespace);

      if (!manifest) {
        throw new HTTPException(404, { message: 'Deployment manifest not found' });
      }

      // Determine provider from the manifest labels
      const metadata = manifest.metadata as Record<string, unknown> | undefined;
      const labels = (metadata?.labels as Record<string, string>) || {};
      const providerId = labels['kubefoundry.io/provider'] || 'unknown';
      const kind = (manifest.kind as string) || 'Unknown';
      const apiVersion = (manifest.apiVersion as string) || 'v1';

      // Build array of resources
      const resources: Array<{
        kind: string;
        apiVersion: string;
        name: string;
        manifest: Record<string, unknown>;
      }> = [];

      // Add main CR
      resources.push({
        kind,
        apiVersion,
        name,
        manifest,
      });

      // Look for related resources (Services, ConfigMaps, etc.)
      try {
        // Check for KAITO vLLM service
        if (providerId === 'kaito') {
          const vllmServiceName = `${name}-vllm`;
          try {
            const k8s = await import('@kubernetes/client-node');
            const kc = new k8s.KubeConfig();
            kc.loadFromDefault();
            const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
            
            const serviceResponse = await coreV1Api.readNamespacedService(vllmServiceName, resolvedNamespace);
            if (serviceResponse.body) {
              resources.push({
                kind: 'Service',
                apiVersion: 'v1',
                name: vllmServiceName,
                manifest: serviceResponse.body as unknown as Record<string, unknown>,
              });
            }
          } catch {
            // Service doesn't exist, that's fine
          }
        }

        // Look for ConfigMaps with kubefoundry labels matching this deployment
        try {
          const k8s = await import('@kubernetes/client-node');
          const kc = new k8s.KubeConfig();
          kc.loadFromDefault();
          const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
          
          const configMapsResponse = await coreV1Api.listNamespacedConfigMap(
            resolvedNamespace,
            undefined,
            undefined,
            undefined,
            undefined,
            `app.kubernetes.io/instance=${name},app.kubernetes.io/managed-by=kubefoundry`
          );
          
          for (const cm of configMapsResponse.body.items) {
            resources.push({
              kind: 'ConfigMap',
              apiVersion: 'v1',
              name: (cm.metadata?.name as string) || 'unknown',
              manifest: cm as unknown as Record<string, unknown>,
            });
          }
        } catch {
          // Failed to list ConfigMaps, that's fine
        }
      } catch (error) {
        logger.debug({ error, name, namespace: resolvedNamespace }, 'Error fetching related resources');
      }

      return c.json({
        resources,
        primaryResource: {
          kind,
          apiVersion,
        },
      });
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

      try {
        await kubernetesService.deleteDeployment(name, resolvedNamespace);
      } catch (error) {
        // Check if it's a "not found" error from our own code
        if (error instanceof Error && error.message.includes('not found')) {
          throw new HTTPException(404, { message: error.message });
        }

        const { message, statusCode } = handleK8sError(error, {
          operation: 'deleteDeployment',
          deploymentName: name,
          namespace: resolvedNamespace,
        });

        throw new HTTPException(statusCode as 400 | 403 | 404 | 500, {
          message: `Failed to delete deployment: ${message}`,
        });
      }

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
  )
  .get(
    '/:name/metrics',
    zValidator('param', deploymentParamsSchema),
    zValidator('query', deploymentQuerySchema),
    async (c) => {
      const { name } = c.req.valid('param');
      const { namespace } = c.req.valid('query');
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      // Get deployment to determine its provider
      const deployment = await kubernetesService.getDeployment(name, resolvedNamespace);
      const providerId = deployment?.provider;

      const metricsResponse = await metricsService.getDeploymentMetrics(name, resolvedNamespace, providerId);
      return c.json(metricsResponse);
    }
)
  .get(
    '/:name/pending-reasons',
    zValidator('param', deploymentParamsSchema),
    zValidator('query', deploymentQuerySchema),
    async (c) => {
      const { name } = c.req.valid('param');
      const { namespace } = c.req.valid('query');
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      try {
        // Get deployment to find pending pods
        const deployment = await kubernetesService.getDeployment(name, resolvedNamespace);

        if (!deployment) {
          throw new HTTPException(404, { message: 'Deployment not found' });
        }

        // Get all pending pods
        const pendingPods = deployment.pods.filter(pod => pod.phase === 'Pending');

        if (pendingPods.length === 0) {
          return c.json({ reasons: [] });
        }

        // Get failure reasons for the first pending pod (they're typically the same)
        const podName = pendingPods[0].name;
        const reasons = await kubernetesService.getPodFailureReasons(podName, resolvedNamespace);

        return c.json({ reasons });
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        logger.error({ error, name, namespace: resolvedNamespace }, 'Error getting pending reasons');
        return c.json(
          {
            error: {
              message: error instanceof Error ? error.message : 'Failed to get pending reasons',
              statusCode: 500,
            },
          },
          500
        );
      }
    }
  )
  .get(
    '/:name/logs',
    zValidator('param', deploymentParamsSchema),
    zValidator('query', z.object({
      namespace: namespaceSchema.optional(),
      podName: z.string().optional(),
      container: z.string().optional(),
      tailLines: z.string().optional()
        .transform((val) => (val ? parseInt(val, 10) : undefined))
        .pipe(z.number().int().min(1).max(10000).optional()),
      timestamps: z.string().optional()
        .transform((val) => val === 'true'),
    })),
    async (c) => {
      const { name } = c.req.valid('param');
      const { namespace, podName, container, tailLines, timestamps } = c.req.valid('query');
      const resolvedNamespace = namespace || (await configService.getDefaultNamespace());

      try {
        // Get pods for this deployment using label selectors (works for all providers)
        const pods = await kubernetesService.getDeploymentPods(name, resolvedNamespace);

        if (pods.length === 0) {
          logger.debug({ name, namespace: resolvedNamespace }, 'No pods found for deployment');
          return c.json({ logs: '', podName: '', message: 'No pods found for this deployment' });
        }

        // Use specified pod or default to first pod
        const targetPodName = podName || pods[0].name;
        
        // Verify the pod belongs to this deployment
        const podExists = pods.some(pod => pod.name === targetPodName);
        if (!podExists) {
          throw new HTTPException(400, { 
            message: `Pod '${targetPodName}' is not part of deployment '${name}'` 
          });
        }

        logger.debug({ name, namespace: resolvedNamespace, targetPodName }, 'Fetching logs for pod');

        const logs = await kubernetesService.getPodLogs(targetPodName, resolvedNamespace, {
          container,
          tailLines: tailLines || 100,
          timestamps: timestamps || false,
        });

        return c.json({ 
          logs, 
          podName: targetPodName,
          container: container || undefined,
        });
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        logger.error({ error, name, namespace: resolvedNamespace }, 'Error getting deployment logs');
        return c.json(
          {
            error: {
              message: error instanceof Error ? error.message : 'Failed to get logs',
              statusCode: 500,
            },
          },
          500
        );
      }
    }
  );

export default deployments;
