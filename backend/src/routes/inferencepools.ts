import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { kubernetesService } from '../services/kubernetes';
import logger from '../lib/logger';

const inferencepools = new Hono()
  .get('/', async (c) => {
    try {
      const namespace = c.req.query('namespace');

      // Get InferencePools from Kubernetes API
      const inferencePools = await getInferencePools(namespace);

      logger.info({ count: inferencePools.length, namespace }, 'Listed InferencePools from Kubernetes API');

      return c.json({
        items: inferencePools,
        count: inferencePools.length,
      });

    } catch (error) {
      logger.error({ error }, 'Failed to list InferencePools');
      throw new HTTPException(500, { message: 'Failed to list InferencePools' });
    }
  });

/**
 * Query Kubernetes API for InferencePool resources
 */
async function getInferencePools(namespace?: string): Promise<any[]> {
  const inferencePools: any[] = [];

  try {
    // InferencePools are Custom Resources with group: inference.networking.k8s.io, version: v1alpha1
    const kubernetesClient = (kubernetesService as any);
    const customObjectsApi = kubernetesClient.customObjectsApi;

    if (namespace) {
      // Query specific namespace
      try {
        const response = await customObjectsApi.listNamespacedCustomObject(
          'inference.networking.k8s.io',
          'v1',
          namespace,
          'inferencepools'
        );
        const items = (response.body as { items?: any[] }).items || [];
        inferencePools.push(...items);
      } catch (error: any) {
        if (error.statusCode !== 404) {
          logger.warn({ error: error.message, namespace }, 'Failed to list InferencePools in namespace');
        }
      }
    } else {
      // Query cluster-wide
      try {
        const response = await customObjectsApi.listClusterCustomObject(
          'inference.networking.k8s.io',
          'v1',
          'inferencepools'
        );
        const items = (response.body as { items?: any[] }).items || [];
        inferencePools.push(...items);
      } catch (error: any) {
        if (error.statusCode !== 404) {
          logger.warn({ error: error.message }, 'Failed to list InferencePools cluster-wide');
        }
      }
    }

    // Add kubefoundry metadata for UI
    return inferencePools.map(pool => {
      const labels = pool.metadata?.labels || {};
      return {
        ...pool,
        _kubefoundry: {
          deploymentName: labels['app.kubernetes.io/instance'] || pool.metadata.name,
          deploymentNamespace: pool.metadata.namespace,
          provider: labels['kubefoundry.io/provider'] || 'unknown',
          modelId: pool.spec?.modelName || 'unknown',
          phase: 'Running', // InferencePools don't have phases like deployments
          replicas: { desired: 1, ready: 1, available: 1 },
        },
      };
    });
  } catch (error) {
    logger.warn({ error }, 'InferencePool CRDs may not be installed or accessible');
    return [];
  }
}

export default inferencepools;
