import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import app from './hono-app';

describe('Hono Routes', () => {
  describe('Health Routes', () => {
    test('GET /api/health returns healthy status', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('healthy');
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Models Routes', () => {
    test('GET /api/models returns model list', async () => {
      const res = await app.request('/api/models');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.models).toBeDefined();
      expect(Array.isArray(data.models)).toBe(true);
    });

    test('GET /api/models/:id with slashes captures full model ID', async () => {
      // Test that the wildcard pattern captures model IDs with slashes
      const res = await app.request('/api/models/Qwen/Qwen3-0.6B');
      // Should return 404 if model doesn't exist, but importantly it should NOT
      // be a route-level 404 (which would indicate the pattern didn't match)
      const data = await res.json();
      
      // If model exists, should return it
      // If model doesn't exist, should return { error: { message: 'Model not found' } }
      // NOT { error: { message: 'Route not found...' } }
      if (res.status === 404) {
        expect(data.error?.message).toBe('Model not found');
      } else {
        expect(res.status).toBe(200);
        expect(data.id).toBe('Qwen/Qwen3-0.6B');
      }
    });

    test('GET /api/models/:id with deeply nested slashes', async () => {
      const res = await app.request('/api/models/org/repo/variant');
      expect(res.status).toBe(404);
      const data = await res.json();
      // Should be model not found, not route not found
      expect(data.error?.message).toBe('Model not found');
    });
  });

  describe('Settings Routes', () => {
    test('GET /api/settings returns settings', async () => {
      const res = await app.request('/api/settings');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.config).toBeDefined();
      expect(data.providers).toBeDefined();
    });

    test('GET /api/settings returns auth config', async () => {
      const res = await app.request('/api/settings');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.auth).toBeDefined();
      expect(typeof data.auth.enabled).toBe('boolean');
    });

    test('GET /api/settings/providers returns providers list', async () => {
      const res = await app.request('/api/settings/providers');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.providers).toBeDefined();
      expect(Array.isArray(data.providers)).toBe(true);
    });
  });

  describe('Deployments Routes', () => {
    test('GET /api/deployments returns deployment list with pagination', async () => {
      const res = await app.request('/api/deployments');
      // May fail if no k8s cluster, but should return valid response structure
      const data = await res.json();
      expect(data.deployments).toBeDefined();
      expect(data.pagination).toBeDefined();
      expect(Array.isArray(data.deployments)).toBe(true);
    });
  });

  describe('Installation Routes', () => {
    test('GET /api/installation/helm/status returns helm status', async () => {
      const res = await app.request('/api/installation/helm/status');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.available).toBeDefined();
    });
  });

  describe('Auth Middleware', () => {
    const originalEnv = process.env.AUTH_ENABLED;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.AUTH_ENABLED = originalEnv;
      } else {
        delete process.env.AUTH_ENABLED;
      }
    });

    test('public routes work without auth when AUTH_ENABLED=true', async () => {
      process.env.AUTH_ENABLED = 'true';
      
      // Health endpoint should be public
      const healthRes = await app.request('/api/health');
      expect(healthRes.status).toBe(200);

      // Cluster status should be public
      const clusterRes = await app.request('/api/cluster/status');
      expect([200, 500]).toContain(clusterRes.status); // May fail without k8s

      // Settings should be public (frontend needs to check auth config)
      const settingsRes = await app.request('/api/settings');
      expect([200, 500]).toContain(settingsRes.status);
    });

    test('protected routes work without auth when AUTH_ENABLED=false', async () => {
      process.env.AUTH_ENABLED = 'false';
      
      // Models endpoint should work without auth
      const res = await app.request('/api/models');
      expect(res.status).toBe(200);
    });

    test('protected routes require auth when AUTH_ENABLED=true', async () => {
      process.env.AUTH_ENABLED = 'true';
      
      // Models endpoint should require auth
      const res = await app.request('/api/models');
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error.message).toBe('Authentication required');
    });

    test('invalid bearer token returns 401', async () => {
      process.env.AUTH_ENABLED = 'true';
      
      const res = await app.request('/api/models', {
        headers: {
          'Authorization': 'Bearer invalid-token',
        },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('404 Handling', () => {
    test('Unknown API route returns JSON 404', async () => {
      const res = await app.request('/api/unknown');
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.message).toContain('Route not found');
    });

    test('Non-API route returns SPA fallback or not found', async () => {
      const res = await app.request('/some-page');
      // Should either serve index.html (200) or return not found (404)
      expect([200, 404]).toContain(res.status);
    });
  });
});
