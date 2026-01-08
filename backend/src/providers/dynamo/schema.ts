import { z } from 'zod';
import { baseDeploymentConfigSchema } from '../types';

/**
 * Dynamo-specific deployment configuration schema
 * Extends the base schema with Dynamo-specific validation
 */
export const dynamoDeploymentConfigSchema = baseDeploymentConfigSchema.extend({
  // Dynamo supports all engines: vllm, sglang, trtllm
  // Each has different disaggregation flags:
  // - vllm: --is-prefill-worker for prefill workers
  // - sglang: --disaggregation-mode prefill|decode
  // - trtllm: --disaggregation-mode prefill|decode
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
);

export type DynamoDeploymentConfig = z.infer<typeof dynamoDeploymentConfigSchema>;

/**
 * Dynamo manifest schema for validation
 * Uses the correct DynamoGraphDeployment spec.services format
 */
export const dynamoManifestSchema = z.object({
  apiVersion: z.literal('nvidia.com/v1alpha1'),
  kind: z.literal('DynamoGraphDeployment'),
  metadata: z.object({
    name: z.string(),
    namespace: z.string(),
    labels: z.record(z.string()).optional(),
  }),
  spec: z.object({
    backendFramework: z.enum(['vllm', 'sglang', 'trtllm']).optional(),
    services: z.object({
      Frontend: z.object({
        componentType: z.literal('frontend').optional(),
        dynamoNamespace: z.string().optional(),
        replicas: z.number().optional(),
        'router-mode': z.enum(['kv', 'round-robin']).optional(),
        envFromSecret: z.string().optional(),
      }),
    }).passthrough(), // Allow VllmWorker, SglangWorker, TrtllmWorker, etc.
  }),
});

export type DynamoManifest = z.infer<typeof dynamoManifestSchema>;
