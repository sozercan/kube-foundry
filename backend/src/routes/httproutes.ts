import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { kubernetesService } from '../services/kubernetes';
import logger from '../lib/logger';

const httproutes = new Hono()
  .get('/', async (c) => {
    try {
      const namespace = c.req.query('namespace');

      // Get HTTPRoutes from Kubernetes API
      const httpRoutes = await getHTTPRoutes(namespace);

      logger.info({ count: httpRoutes.length, namespace }, 'Listed HTTPRoutes from Kubernetes API');

      return c.json({
        items: httpRoutes,
        count: httpRoutes.length,
      });

    } catch (error) {
      logger.error({ error }, 'Failed to list HTTPRoutes');
      throw new HTTPException(500, { message: 'Failed to list HTTPRoutes' });
    }
  });

/**
 * Query Kubernetes API for HTTPRoute resources
 */
async function getHTTPRoutes(namespace?: string): Promise<any[]> {
  const httpRoutes: any[] = [];

  try {
    // HTTPRoutes are Gateway API resources with group: gateway.networking.k8s.io, version: v1
    const kubernetesClient = (kubernetesService as any);
    const customObjectsApi = kubernetesClient.customObjectsApi;

    if (namespace) {
      // Query specific namespace
      try {
        const response = await customObjectsApi.listNamespacedCustomObject(
          'gateway.networking.k8s.io',
          'v1',
          namespace,
          'httproutes'
        );
        const items = (response.body as { items?: any[] }).items || [];
        httpRoutes.push(...items);
      } catch (error: any) {
        if (error.statusCode !== 404) {
          logger.warn({ error: error.message, namespace }, 'Failed to list HTTPRoutes in namespace');
        }
      }
    } else {
      // Query cluster-wide
      try {
        const response = await customObjectsApi.listClusterCustomObject(
          'gateway.networking.k8s.io',
          'v1',
          'httproutes'
        );
        const items = (response.body as { items?: any[] }).items || [];
        httpRoutes.push(...items);
      } catch (error: any) {
        if (error.statusCode !== 404) {
          logger.warn({ error: error.message }, 'Failed to list HTTPRoutes cluster-wide');
        }
      }
    }

    // Filter for KubeFoundry-managed HTTPRoutes and add metadata
    return httpRoutes
      .filter(route => {
        const labels = route.metadata?.labels || {};
        return labels['app.kubernetes.io/managed-by'] === 'kubefoundry';
      })
      .map(route => {
        const labels = route.metadata?.labels || {};
        const spec = route.spec || {};
        const firstRule = spec.rules?.[0] || {};
        const modelHeader = firstRule.matches?.[0]?.headers?.[0];

        return {
          ...route,
          _kubefoundry: {
            deploymentName: labels['app.kubernetes.io/instance'] || route.metadata.name,
            deploymentNamespace: route.metadata.namespace,
            provider: labels['kubefoundry.io/provider'] || 'unknown',
            modelId: modelHeader?.value || 'unknown',
            servedModelName: modelHeader?.value,
            phase: 'Running', // HTTPRoutes don't have phases
            replicas: { desired: 1, ready: 1, available: 1 },
          },
        };
      });
  } catch (error) {
    logger.warn({ error }, 'Gateway API CRDs may not be installed or accessible');
    return [];
  }
}

export default httproutes;
