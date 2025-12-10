import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { huggingFaceService } from '../services/huggingface';
import { HTTPException } from 'hono/http-exception';
import logger from '../lib/logger';

const hfTokenExchangeSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  codeVerifier: z.string().min(43, 'Code verifier must be at least 43 characters'),
  redirectUri: z.string().url('Redirect URI must be a valid URL'),
});

const oauth = new Hono()
  .get('/huggingface/config', (c) => {
    // Return OAuth config for frontend to construct auth URL
    return c.json({
      clientId: huggingFaceService.getClientId(),
      authorizeUrl: 'https://huggingface.co/oauth/authorize',
      scopes: ['openid', 'profile', 'read-repos'],
    });
  })
  .post('/huggingface/token', zValidator('json', hfTokenExchangeSchema), async (c) => {
    const { code, codeVerifier, redirectUri } = c.req.valid('json');

    try {
      const result = await huggingFaceService.handleOAuthCallback(code, codeVerifier, redirectUri);
      return c.json(result);
    } catch (error) {
      logger.error({ error }, 'HuggingFace OAuth token exchange failed');
      throw new HTTPException(400, {
        message: error instanceof Error ? error.message : 'OAuth token exchange failed',
      });
    }
  });

export default oauth;
