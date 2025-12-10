import { describe, test, expect } from 'bun:test';
import { DynamoProvider } from './index';
import type { DeploymentConfig } from '@kubefoundry/shared';

const provider = new DynamoProvider();

describe('DynamoProvider', () => {
  describe('provider info', () => {
    test('has correct id and name', () => {
      expect(provider.id).toBe('dynamo');
      expect(provider.name).toBe('NVIDIA Dynamo');
    });

    test('has default namespace', () => {
      expect(provider.defaultNamespace).toBe('dynamo-system');
    });
  });

  describe('getCRDConfig', () => {
    test('returns correct CRD configuration', () => {
      const config = provider.getCRDConfig();
      expect(config.apiGroup).toBe('dynamo.nvidia.com');
      expect(config.apiVersion).toBe('v1alpha1');
      expect(config.plural).toBe('dynamographdeployments');
      expect(config.kind).toBe('DynamoGraphDeployment');
    });
  });

  describe('generateManifest', () => {
    const baseConfig: DeploymentConfig = {
      name: 'test-deployment',
      namespace: 'test-ns',
      modelId: 'meta-llama/Llama-3.2-1B',
      engine: 'vllm',
      mode: 'aggregated',
      routerMode: 'none',
      replicas: 1,
      hfTokenSecret: 'hf-token',
      enforceEager: true,
      enablePrefixCaching: false,
      trustRemoteCode: false,
    };

    test('generates valid aggregated manifest', () => {
      const manifest = provider.generateManifest(baseConfig);

      expect(manifest.apiVersion).toBe('dynamo.nvidia.com/v1alpha1');
      expect(manifest.kind).toBe('DynamoGraphDeployment');
      expect((manifest.metadata as any).name).toBe('test-deployment');
      expect((manifest.metadata as any).namespace).toBe('test-ns');
    });

    test('includes VllmWorker for vllm engine', () => {
      const manifest = provider.generateManifest(baseConfig);
      expect((manifest.spec as any).VllmWorker).toBeDefined();
      expect((manifest.spec as any).VllmWorker['model-path']).toBe('meta-llama/Llama-3.2-1B');
    });

    test('includes SglangWorker for sglang engine', () => {
      const manifest = provider.generateManifest({ ...baseConfig, engine: 'sglang' });
      expect((manifest.spec as any).SglangWorker).toBeDefined();
    });

    test('includes TrtllmWorker for trtllm engine', () => {
      const manifest = provider.generateManifest({ ...baseConfig, engine: 'trtllm' });
      expect((manifest.spec as any).TrtllmWorker).toBeDefined();
    });

    test('includes Frontend spec', () => {
      const manifest = provider.generateManifest(baseConfig);
      expect((manifest.spec as any).Frontend).toBeDefined();
      expect((manifest.spec as any).Frontend.replicas).toBe(1);
      expect((manifest.spec as any).Frontend['http-port']).toBe(8000);
    });

    test('includes kubefoundry labels', () => {
      const manifest = provider.generateManifest(baseConfig);
      const labels = (manifest.metadata as any).labels;
      expect(labels['app.kubernetes.io/name']).toBe('kubefoundry');
      expect(labels['app.kubernetes.io/instance']).toBe('test-deployment');
      expect(labels['app.kubernetes.io/managed-by']).toBe('kubefoundry');
    });

    test('includes hfTokenSecret as envFrom', () => {
      const manifest = provider.generateManifest(baseConfig);
      const envFrom = (manifest.spec as any).VllmWorker.envFrom;
      expect(envFrom).toBeDefined();
      expect(envFrom[0].secretRef.name).toBe('hf-token');
    });

    test('generates disaggregated manifest with separate workers', () => {
      const config = {
        ...baseConfig,
        mode: 'disaggregated' as const,
        prefillReplicas: 2,
        decodeReplicas: 3,
        prefillGpus: 2,
        decodeGpus: 1,
      };

      const manifest = provider.generateManifest(config);

      expect((manifest.spec as any).VllmPrefillWorker).toBeDefined();
      expect((manifest.spec as any).VllmDecodeWorker).toBeDefined();
      expect((manifest.spec as any).VllmPrefillWorker.replicas).toBe(2);
      expect((manifest.spec as any).VllmDecodeWorker.replicas).toBe(3);
      expect((manifest.spec as any).VllmPrefillWorker['is-prefill-worker']).toBe(true);
    });

    test('disaggregated mode sets router-mode to round-robin by default', () => {
      const config = {
        ...baseConfig,
        mode: 'disaggregated' as const,
      };

      const manifest = provider.generateManifest(config);
      expect((manifest.spec as any).Frontend['router-mode']).toBe('round-robin');
    });

    test('sets max-model-len from contextLength', () => {
      const manifest = provider.generateManifest({
        ...baseConfig,
        contextLength: 8192,
      });
      expect((manifest.spec as any).VllmWorker['max-model-len']).toBe(8192);
    });

    test('sets GPU resources when specified', () => {
      const manifest = provider.generateManifest({
        ...baseConfig,
        resources: { gpu: 2, memory: '16Gi' },
      });
      const resources = (manifest.spec as any).VllmWorker.resources;
      expect(resources.limits['nvidia.com/gpu']).toBe(2);
      expect(resources.limits.memory).toBe('16Gi');
    });
  });

  describe('parseStatus', () => {
    test('parses basic deployment status', () => {
      const raw = {
        metadata: {
          name: 'test-deployment',
          namespace: 'test-ns',
          creationTimestamp: '2024-01-01T00:00:00Z',
        },
        spec: {
          VllmWorker: {
            'model-path': 'meta-llama/Llama-3.2-1B',
            'served-model-name': 'llama',
            replicas: 2,
          },
          Frontend: { replicas: 1 },
        },
        status: {
          phase: 'Running',
          replicas: { desired: 2, ready: 2, available: 2 },
        },
      };

      const status = provider.parseStatus(raw);

      expect(status.name).toBe('test-deployment');
      expect(status.namespace).toBe('test-ns');
      expect(status.modelId).toBe('meta-llama/Llama-3.2-1B');
      expect(status.engine).toBe('vllm');
      expect(status.mode).toBe('aggregated');
      expect(status.phase).toBe('Running');
      expect(status.replicas.desired).toBe(2);
      expect(status.replicas.ready).toBe(2);
      expect(status.frontendService).toBe('test-deployment-frontend');
    });

    test('parses sglang deployment', () => {
      const raw = {
        metadata: { name: 'sglang-deploy' },
        spec: {
          SglangWorker: { 'model-path': 'test/model', replicas: 1 },
        },
        status: { phase: 'Pending' },
      };

      const status = provider.parseStatus(raw);
      expect(status.engine).toBe('sglang');
      expect(status.phase).toBe('Pending');
    });

    test('parses disaggregated deployment', () => {
      const raw = {
        metadata: { name: 'pd-deploy' },
        spec: {
          VllmPrefillWorker: { 'model-path': 'test/model', replicas: 2 },
          VllmDecodeWorker: { 'model-path': 'test/model', replicas: 3 },
          Frontend: { replicas: 1 },
        },
        status: {
          phase: 'Running',
          prefillReplicas: { desired: 2, ready: 2 },
          decodeReplicas: { desired: 3, ready: 3 },
        },
      };

      const status = provider.parseStatus(raw);
      expect(status.mode).toBe('disaggregated');
      expect(status.prefillReplicas?.desired).toBe(2);
      expect(status.decodeReplicas?.desired).toBe(3);
      expect(status.replicas.desired).toBe(5); // 2 + 3
    });

    test('handles missing status', () => {
      const raw = {
        metadata: { name: 'pending' },
        spec: {
          VllmWorker: { 'model-path': 'test/model' },
        },
      };

      const status = provider.parseStatus(raw);
      expect(status.phase).toBe('Pending');
      expect(status.replicas.ready).toBe(0);
    });
  });

  describe('validateConfig', () => {
    test('validates correct configuration', () => {
      const config = {
        name: 'valid-name',
        namespace: 'test-ns',
        modelId: 'test/model',
        engine: 'vllm',
        mode: 'aggregated',
        routerMode: 'none',
        replicas: 1,
        hfTokenSecret: 'secret',
        enforceEager: true,
        enablePrefixCaching: false,
        trustRemoteCode: false,
      };

      const result = provider.validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects invalid kubernetes name', () => {
      const config = {
        name: 'Invalid_Name',
        namespace: 'test-ns',
        modelId: 'test/model',
        engine: 'vllm',
        mode: 'aggregated',
        routerMode: 'none',
        replicas: 1,
        hfTokenSecret: 'secret',
        enforceEager: true,
        enablePrefixCaching: false,
        trustRemoteCode: false,
      };

      const result = provider.validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('installation', () => {
    test('getInstallationSteps returns steps', () => {
      const steps = provider.getInstallationSteps();
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].title).toBeDefined();
      expect(steps[0].command).toBeDefined();
    });

    test('getHelmRepos returns nvidia repo', () => {
      const repos = provider.getHelmRepos();
      expect(repos.length).toBe(1);
      expect(repos[0].name).toBe('nvidia');
      expect(repos[0].url).toContain('ngc.nvidia.com');
    });

    test('getHelmCharts returns dynamo-operator chart', () => {
      const charts = provider.getHelmCharts();
      expect(charts.length).toBe(1);
      expect(charts[0].name).toBe('dynamo-operator');
      expect(charts[0].namespace).toBe('dynamo-system');
    });
  });

  describe('metrics', () => {
    test('getMetricsConfig returns valid config', () => {
      const config = provider.getMetricsConfig();
      expect(config).not.toBeNull();
      expect(config!.endpointPath).toBe('/metrics');
      expect(config!.port).toBe(8000);
      expect(config!.serviceNamePattern).toContain('{name}');
    });

    test('getKeyMetrics returns metric definitions', () => {
      const metrics = provider.getKeyMetrics();
      expect(metrics.length).toBeGreaterThan(0);

      // Check for expected metrics
      const metricNames = metrics.map(m => m.name);
      expect(metricNames).toContain('vllm:num_requests_running');
      expect(metricNames).toContain('vllm:gpu_cache_usage_perc');
      expect(metricNames).toContain('vllm:e2e_request_latency_seconds');
    });

    test('metrics have required fields', () => {
      const metrics = provider.getKeyMetrics();
      for (const metric of metrics) {
        expect(metric.name).toBeDefined();
        expect(metric.displayName).toBeDefined();
        expect(metric.type).toMatch(/gauge|counter|histogram/);
        expect(metric.category).toBeDefined();
      }
    });
  });
});
