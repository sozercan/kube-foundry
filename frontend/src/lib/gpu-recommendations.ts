import type { Model, DetailedClusterCapacity } from './api';

export interface GpuRecommendation {
  recommendedGpus: number;
  reason: string;
  alternatives?: number[];
}

/**
 * Calculate recommended GPUs per replica based on model characteristics and cluster capacity
 */
export function calculateGpuRecommendation(
  model: Model | undefined,
  clusterCapacity: DetailedClusterCapacity | undefined
): GpuRecommendation {
  // Default fallback
  const fallback: GpuRecommendation = {
    recommendedGpus: 1,
    reason: 'Starting with 1 GPU per replica',
  };

  if (!model || !clusterCapacity) {
    return fallback;
  }

  const maxNodeGpus = clusterCapacity.maxNodeGpuCapacity;
  const gpuMemoryGb = clusterCapacity.totalMemoryGb; // Memory per GPU

  // Get parameter count from various possible fields
  let parameterCount = model.parameterCount || model.parameters;

  // If not found, try parsing from size field (e.g., "3B", "7B", "70B")
  if (!parameterCount && model.size) {
    const sizeMatch = model.size.match(/(\d+\.?\d*)\s*B/i);
    if (sizeMatch) {
      parameterCount = parseFloat(sizeMatch[1]) * 1_000_000_000;
    }
  }

  // If we don't have parameter count, check if model provides estimatedGpuMemoryGb
  if (!parameterCount) {
    if (model.estimatedGpuMemoryGb && gpuMemoryGb) {
      const gpusNeeded = Math.ceil(model.estimatedGpuMemoryGb / gpuMemoryGb);
      const capped = Math.min(gpusNeeded, maxNodeGpus);
      return {
        recommendedGpus: capped,
        reason: `Model needs ~${model.estimatedGpuMemoryGb}GB memory`,
      };
    }
    return {
      recommendedGpus: Math.min(1, maxNodeGpus),
      reason: 'Model size unknown - using 1 GPU',
    };
  }

  // Estimate memory needed (rough heuristic: 2 bytes per parameter for FP16)
  // Add 20% overhead for KV cache and activations
  const paramsInBillions = parameterCount / 1_000_000_000;
  let estimatedMemoryGb = (paramsInBillions * 2 * 1.2);

  // Prefer model's own memory estimate if provided (more accurate)
  if (model.estimatedGpuMemoryGb) {
    estimatedMemoryGb = model.estimatedGpuMemoryGb;
  } else if (model.minGpuMemory) {
    // Parse minGpuMemory (e.g., "16GB" -> 16)
    const memMatch = model.minGpuMemory.match(/(\d+)\s*GB/i);
    if (memMatch) {
      estimatedMemoryGb = parseInt(memMatch[1]);
    }
  }

  // If we know GPU memory, use memory-based calculation
  if (gpuMemoryGb && gpuMemoryGb > 0) {
    const gpusNeeded = Math.ceil(estimatedMemoryGb / gpuMemoryGb);
    const cappedRecommendation = Math.min(gpusNeeded, maxNodeGpus);

    const alternatives = generateAlternatives(cappedRecommendation, maxNodeGpus);

    let reason = `~${estimatedMemoryGb.toFixed(0)}GB needed (${paramsInBillions.toFixed(1)}B params)`;
    if (cappedRecommendation < gpusNeeded) {
      reason += ` - needs ${gpusNeeded} GPUs but cluster nodes only have ${maxNodeGpus}`;
    }

    return {
      recommendedGpus: cappedRecommendation,
      reason,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }

  // Fallback: use parameter-based heuristic if GPU memory is unknown
  let baseRecommendation = 1;
  let sizeCategory = 'small';

  if (paramsInBillions < 3) {
    baseRecommendation = 1;
    sizeCategory = 'small';
  } else if (paramsInBillions < 13) {
    baseRecommendation = 2;
    sizeCategory = 'medium';
  } else if (paramsInBillions < 70) {
    baseRecommendation = 4;
    sizeCategory = 'large';
  } else {
    baseRecommendation = 8;
    sizeCategory = 'very large';
  }

  // Cap at node capacity
  const cappedRecommendation = Math.min(baseRecommendation, maxNodeGpus);

  // Generate alternatives based on node pool optimization
  const alternatives = generateAlternatives(cappedRecommendation, maxNodeGpus);

  // Build reason message
  let reason = `${sizeCategory} model (${paramsInBillions.toFixed(1)}B params)`;

  if (cappedRecommendation < baseRecommendation) {
    reason += ` - needs ${baseRecommendation} GPUs, but cluster nodes only have ${maxNodeGpus}`;
  }

  return {
    recommendedGpus: cappedRecommendation,
    reason,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
  };
}

/**
 * Generate alternative GPU counts that work well with node pool configurations
 */
function generateAlternatives(recommended: number, maxNodeGpus: number): number[] {
  // Common GPU node sizes: 1, 2, 4, 8
  const commonSizes = [1, 2, 4, 8];

  // Find divisors of maxNodeGpus that are <= maxNodeGpus
  const divisors = commonSizes.filter(
    (size) => size <= maxNodeGpus && maxNodeGpus % size === 0 && size !== recommended
  );

  // Return up to 2 alternatives closest to the recommendation
  return divisors
    .sort((a, b) => Math.abs(a - recommended) - Math.abs(b - recommended))
    .slice(0, 2);
}

/**
 * Format GPU count for display
 */
export function formatGpuCount(gpus: number): string {
  return `${gpus} GPU${gpus !== 1 ? 's' : ''}`;
}
