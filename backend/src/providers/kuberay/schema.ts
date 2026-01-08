import { z } from 'zod';
import { baseDeploymentConfigSchema } from '../types';

/**
 * KubeRay-specific deployment configuration schema
 * Extends the base schema with KubeRay/Ray Serve specific options
 */
export const kuberayDeploymentConfigSchema = baseDeploymentConfigSchema.extend({
  // Override engine to only allow vllm for KubeRay (Ray Serve uses vLLM backend)
  engine: z.enum(['vllm']).default('vllm'),

  // Override enforceEager with same default as base schema
  enforceEager: z.boolean().default(true).describe('Use eager mode for faster startup (disables CUDA graphs)'),

  // KubeRay-specific fields
  acceleratorType: z.string().optional().describe('GPU accelerator type (e.g., A100, H100)'),
  tensorParallelSize: z.number().int().min(1).default(1).describe('Number of GPUs for tensor parallelism'),
  pipelineParallelSize: z.number().int().min(1).default(1).describe('Number of stages for pipeline parallelism'),
  gpuMemoryUtilization: z.number().min(0.1).max(1.0).default(0.9).describe('Fraction of GPU memory to use'),
  maxNumSeqs: z.number().int().min(1).default(40).describe('Maximum number of sequences to process'),
  enableChunkedPrefill: z.boolean().default(true).describe('Enable chunked prefill for better memory efficiency'),

  // Ray-specific settings
  rayImage: z.string().default('rayproject/ray-llm:2.52.0-py311-cu128').describe('Ray LLM Docker image'),
  headCpu: z.string().default('4').describe('CPU cores for Ray head node'),
  headMemory: z.string().default('32Gi').describe('Memory for Ray head node'),
  workerCpu: z.string().default('8').describe('CPU cores for Ray worker nodes'),
  workerMemory: z.string().default('64Gi').describe('Memory for Ray worker nodes'),

  // Autoscaling (used for aggregated mode or as defaults for disaggregated)
  minReplicas: z.number().int().min(1).default(1).describe('Minimum number of worker replicas'),
  maxReplicas: z.number().int().min(1).default(2).describe('Maximum number of worker replicas'),

  // Disaggregated mode settings (P/D disaggregation)
  kvConnector: z.enum(['NixlConnector', 'SimpleConnector']).default('NixlConnector').describe('KV cache connector type'),

  // Per-component autoscaling for disaggregated mode
  prefillMinReplicas: z.number().int().min(1).default(1).describe('Minimum prefill worker replicas'),
  prefillMaxReplicas: z.number().int().min(1).default(2).describe('Maximum prefill worker replicas'),
  decodeMinReplicas: z.number().int().min(1).default(1).describe('Minimum decode worker replicas'),
  decodeMaxReplicas: z.number().int().min(1).default(2).describe('Maximum decode worker replicas'),
}).refine(
  (data) => {
    // If enableGatewayRouting is true, require gateway configuration
    if (data.enableGatewayRouting) {
      return data.gatewayName && data.gatewayNamespace;
    }
    return true;
  },
  {
    message: 'gatewayName and gatewayNamespace are required when enableGatewayRouting is true',
    path: ['enableGatewayRouting'],
  }
);;

export type KubeRayDeploymentConfig = z.infer<typeof kuberayDeploymentConfigSchema>;

/**
 * KubeRay RayService manifest schema for validation
 */
/**
 * envFrom schema for secret references
 */
const envFromSchema = z.array(z.object({
  secretRef: z.object({
    name: z.string(),
  }),
})).optional();

export const kuberayManifestSchema = z.object({
  apiVersion: z.literal('ray.io/v1'),
  kind: z.literal('RayService'),
  metadata: z.object({
    name: z.string(),
    namespace: z.string().optional(),
    labels: z.record(z.string()).optional(),
  }),
  spec: z.object({
    serveConfigV2: z.string(),
    rayClusterConfig: z.object({
      headGroupSpec: z.object({
        rayStartParams: z.record(z.string()),
        template: z.object({
          spec: z.object({
            containers: z.array(z.object({
              name: z.string(),
              image: z.string(),
              resources: z.object({
                limits: z.record(z.string()),
                requests: z.record(z.string()),
              }),
              ports: z.array(z.object({
                containerPort: z.number(),
                name: z.string(),
              })).optional(),
              envFrom: envFromSchema,
            })),
          }),
        }),
      }),
      workerGroupSpecs: z.array(z.object({
        groupName: z.string(),
        replicas: z.number(),
        minReplicas: z.number(),
        maxReplicas: z.number(),
        rayStartParams: z.record(z.string()),
        template: z.object({
          spec: z.object({
            containers: z.array(z.object({
              name: z.string(),
              image: z.string(),
              resources: z.object({
                limits: z.record(z.string()),
                requests: z.record(z.string()),
              }),
              envFrom: envFromSchema,
            })),
            tolerations: z.array(z.object({
              key: z.string(),
              operator: z.string(),
              effect: z.string(),
            })).optional(),
          }),
        }),
      })),
    }),
  }),
});

export type KubeRayManifest = z.infer<typeof kuberayManifestSchema>;
