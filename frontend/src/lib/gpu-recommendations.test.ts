import { describe, expect, it } from 'vitest';
import {
  calculateGpuRecommendation,
  formatGpuCount,
} from './gpu-recommendations';
import type { Model, DetailedClusterCapacity } from './api';

// Helper to create a minimal model for testing
function createModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'test-model',
    name: 'Test Model',
    provider: 'kuberay',
    description: 'A test model',
    ...overrides,
  } as Model;
}

// Helper to create cluster capacity
function createCapacity(overrides: Partial<DetailedClusterCapacity> = {}): DetailedClusterCapacity {
  return {
    totalGpus: 8,
    allocatedGpus: 4,
    availableGpus: 4,
    maxContiguousAvailable: 4,
    maxNodeGpuCapacity: 8,
    gpuNodeCount: 1,
    totalMemoryGb: 80, // A100 80GB
    nodePools: [],
    ...overrides,
  };
}

describe('calculateGpuRecommendation', () => {
  describe('fallback behavior', () => {
    it('returns 1 GPU when model is undefined', () => {
      const result = calculateGpuRecommendation(undefined, createCapacity());
      expect(result.recommendedGpus).toBe(1);
      expect(result.reason).toBe('Starting with 1 GPU per replica');
    });

    it('returns 1 GPU when clusterCapacity is undefined', () => {
      const result = calculateGpuRecommendation(createModel(), undefined);
      expect(result.recommendedGpus).toBe(1);
      expect(result.reason).toBe('Starting with 1 GPU per replica');
    });

    it('returns 1 GPU when both are undefined', () => {
      const result = calculateGpuRecommendation(undefined, undefined);
      expect(result.recommendedGpus).toBe(1);
    });
  });

  describe('parameter count detection', () => {
    it('uses parameterCount field when available', () => {
      const model = createModel({ parameterCount: 8_000_000_000 }); // 8B
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      // 8B params * 2 bytes * 1.2 = 19.2GB, fits in 1 A100 80GB
      expect(result.recommendedGpus).toBe(1);
      expect(result.reason).toContain('8.0B params');
    });

    it('uses parameters field when parameterCount is not available', () => {
      const model = createModel({ parameters: 70_000_000_000 }); // 70B
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      // 70B params * 2 bytes * 1.2 = 168GB, needs 3 A100 80GB
      expect(result.recommendedGpus).toBeGreaterThan(1);
      expect(result.reason).toContain('70.0B params');
    });

    it('parses size field when no parameterCount (e.g., "7B")', () => {
      const model = createModel({ size: '7B' });
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      expect(result.recommendedGpus).toBe(1);
      expect(result.reason).toContain('7.0B params');
    });

    it('parses size field with decimal (e.g., "3.5B")', () => {
      const model = createModel({ size: '3.5B' });
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      expect(result.recommendedGpus).toBe(1);
      expect(result.reason).toContain('3.5B params');
    });

    it('handles lowercase size field (e.g., "13b")', () => {
      const model = createModel({ size: '13b' });
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      expect(result.reason).toContain('13.0B params');
    });
  });

  describe('memory estimation', () => {
    it('prefers estimatedGpuMemoryGb over calculated memory', () => {
      const model = createModel({
        parameterCount: 8_000_000_000, // Would calculate 19.2GB
        estimatedGpuMemoryGb: 16, // But model says 16GB
      });
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      expect(result.reason).toContain('16GB needed');
    });

    it('parses minGpuMemory when estimatedGpuMemoryGb not available', () => {
      const model = createModel({
        parameterCount: 8_000_000_000,
        minGpuMemory: '16GB',
      });
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      expect(result.reason).toContain('16GB needed');
    });

    it('falls back to calculated memory when no estimates provided', () => {
      const model = createModel({ parameterCount: 8_000_000_000 });
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      // 8B * 2 * 1.2 = 19.2GB
      expect(result.reason).toContain('19GB needed');
    });

    it('uses estimatedGpuMemoryGb when no param count available', () => {
      const model = createModel({ estimatedGpuMemoryGb: 40 });
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      expect(result.recommendedGpus).toBe(1);
      expect(result.reason).toContain('40GB');
    });
  });

  describe('GPU count calculation', () => {
    it('calculates 1 GPU for small models on large GPUs', () => {
      const model = createModel({ parameterCount: 3_000_000_000, minGpuMemory: '8GB' });
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      expect(result.recommendedGpus).toBe(1);
    });

    it('calculates multiple GPUs for large models', () => {
      const model = createModel({ parameterCount: 70_000_000_000, estimatedGpuMemoryGb: 140 });
      const capacity = createCapacity({ totalMemoryGb: 80, maxNodeGpuCapacity: 8 });
      const result = calculateGpuRecommendation(model, capacity);
      
      // 140GB / 80GB = 1.75 -> ceil = 2
      expect(result.recommendedGpus).toBe(2);
    });

    it('caps recommendation at maxNodeGpuCapacity', () => {
      const model = createModel({ parameterCount: 400_000_000_000, estimatedGpuMemoryGb: 800 });
      const capacity = createCapacity({ totalMemoryGb: 80, maxNodeGpuCapacity: 4 });
      const result = calculateGpuRecommendation(model, capacity);
      
      // 800GB / 80GB = 10, but capped at 4
      expect(result.recommendedGpus).toBe(4);
      expect(result.reason).toContain('needs 10 GPUs but cluster nodes only have 4');
    });
  });

  describe('alternatives generation', () => {
    it('generates alternatives that divide evenly into maxNodeGpuCapacity', () => {
      const model = createModel({ parameterCount: 13_000_000_000, estimatedGpuMemoryGb: 80 });
      const capacity = createCapacity({ totalMemoryGb: 80, maxNodeGpuCapacity: 8 });
      const result = calculateGpuRecommendation(model, capacity);
      
      // 80GB / 80GB = 1 GPU recommended
      // Alternatives should be divisors of 8: [2, 4, 8]
      expect(result.recommendedGpus).toBe(1);
      expect(result.alternatives).toBeDefined();
      expect(result.alternatives).toContain(2);
    });

    it('excludes the recommended value from alternatives', () => {
      const model = createModel({ parameterCount: 13_000_000_000, estimatedGpuMemoryGb: 160 });
      const capacity = createCapacity({ totalMemoryGb: 80, maxNodeGpuCapacity: 8 });
      const result = calculateGpuRecommendation(model, capacity);
      
      // 160GB / 80GB = 2 GPUs recommended
      expect(result.recommendedGpus).toBe(2);
      expect(result.alternatives).not.toContain(2);
    });

    it('returns at most 2 alternatives', () => {
      const model = createModel({ parameterCount: 1_000_000_000, estimatedGpuMemoryGb: 40 });
      const capacity = createCapacity({ totalMemoryGb: 80, maxNodeGpuCapacity: 8 });
      const result = calculateGpuRecommendation(model, capacity);
      
      if (result.alternatives) {
        expect(result.alternatives.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('unknown model size handling', () => {
    it('returns fallback for model without any size info', () => {
      const model = createModel({}); // No parameterCount, parameters, size, or estimatedGpuMemoryGb
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      expect(result.recommendedGpus).toBe(1);
      expect(result.reason).toBe('Model size unknown - using 1 GPU');
    });
  });

  describe('edge cases', () => {
    it('handles zero GPU memory gracefully', () => {
      const model = createModel({ parameterCount: 8_000_000_000 });
      const capacity = createCapacity({ totalMemoryGb: 0 });
      const result = calculateGpuRecommendation(model, capacity);
      
      // Should fall back to parameter-based heuristic
      expect(result.recommendedGpus).toBeGreaterThanOrEqual(1);
    });

    it('handles very small models', () => {
      const model = createModel({ parameterCount: 100_000_000, estimatedGpuMemoryGb: 1 }); // 100M params
      const capacity = createCapacity({ totalMemoryGb: 80 });
      const result = calculateGpuRecommendation(model, capacity);
      
      expect(result.recommendedGpus).toBe(1);
    });

    it('handles maxNodeGpuCapacity of 1', () => {
      const model = createModel({ parameterCount: 70_000_000_000, estimatedGpuMemoryGb: 160 });
      const capacity = createCapacity({ totalMemoryGb: 80, maxNodeGpuCapacity: 1 });
      const result = calculateGpuRecommendation(model, capacity);
      
      expect(result.recommendedGpus).toBe(1);
      expect(result.reason).toContain('needs 2 GPUs but cluster nodes only have 1');
    });
  });
});

describe('formatGpuCount', () => {
  it('returns singular for 1 GPU', () => {
    expect(formatGpuCount(1)).toBe('1 GPU');
  });

  it('returns plural for multiple GPUs', () => {
    expect(formatGpuCount(2)).toBe('2 GPUs');
    expect(formatGpuCount(8)).toBe('8 GPUs');
  });

  it('returns plural for 0 GPUs', () => {
    expect(formatGpuCount(0)).toBe('0 GPUs');
  });
});
