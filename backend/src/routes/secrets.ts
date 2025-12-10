import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { secretsService } from '../services/secrets';
import { huggingFaceService } from '../services/huggingface';
import logger from '../lib/logger';

const hfSaveSecretSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
});

const secrets = new Hono()
  .get('/huggingface/status', async (c) => {
    try {
      const status = await secretsService.getHfSecretStatus();
      return c.json(status);
    } catch (error) {
      logger.error({ error }, 'Failed to get HuggingFace secret status');
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to get secret status',
      });
    }
  })
  .post('/huggingface', zValidator('json', hfSaveSecretSchema), async (c) => {
    const { accessToken } = c.req.valid('json');

    try {
      // Validate token first
      const validation = await huggingFaceService.validateToken(accessToken);
      if (!validation.valid) {
        throw new HTTPException(400, {
          message: `Invalid HuggingFace token: ${validation.error}`,
        });
      }

      // Distribute secret to all namespaces
      const result = await secretsService.distributeHfSecret(accessToken);

      if (!result.success) {
        const failedNamespaces = result.results
          .filter((r) => !r.success)
          .map((r) => `${r.namespace}: ${r.error}`)
          .join(', ');
        throw new HTTPException(500, {
          message: `Failed to create secrets in some namespaces: ${failedNamespaces}`,
        });
      }

      return c.json({
        success: true,
        message: 'HuggingFace token saved successfully',
        user: validation.user,
        results: result.results,
      });
    } catch (error) {
      if (error instanceof HTTPException) throw error;
      logger.error({ error }, 'Failed to save HuggingFace secret');
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to save secret',
      });
    }
  })
  .delete('/huggingface', async (c) => {
    try {
      const result = await secretsService.deleteHfSecrets();

      return c.json({
        success: result.success,
        message: result.success
          ? 'HuggingFace secrets deleted successfully'
          : 'Some secrets could not be deleted',
        results: result.results,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to delete HuggingFace secrets');
      throw new HTTPException(500, {
        message: error instanceof Error ? error.message : 'Failed to delete secrets',
      });
    }
  });

export default secrets;
